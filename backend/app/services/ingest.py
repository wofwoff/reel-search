import json
import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from uuid import UUID

from app.config import Settings
from app.services.db import ReelRepository
from app.services.downloader import MediaDownloadError, download_media
from app.services.embedder import VertexEmbeddingProvider
from app.services.storage import GcsStorage, guess_mime_type
from app.services.thumbnail import generate_thumbnail

logger = logging.getLogger(__name__)


def _delete_quietly(storage: GcsStorage, gcs_uri: str) -> None:
    try:
        storage.delete_video(gcs_uri)
    except Exception:
        logger.warning("Failed to clean up %s", gcs_uri)


def _ingest(
    job: dict[str, Any],
    *,
    repository: ReelRepository,
    embedder: VertexEmbeddingProvider,
    storage: GcsStorage,
    settings: Settings,
) -> UUID:
    """Run the download -> upload -> embed -> summarize -> thumbnail -> save pipeline for a job."""
    url: str | None = job["source_url"]
    staged: list[str] = list(job.get("staged_gcs_uris") or [])
    metadata: dict[str, str | None] = {
        "title": job.get("upload_title"),
        "caption": None,
        "creator": None,
        "thumbnail_url": None,
        "webpage_url": None,
    }

    with TemporaryDirectory() as work_dir:
        local_paths: list[Path] = []
        uploaded: list[str] = []  # blobs this attempt created; removed again if the attempt fails

        if url:
            try:
                downloaded = download_media(url)
            except MediaDownloadError as exc:
                if not staged:
                    raise MediaDownloadError(
                        f"Media download failed: {exc}. Upload the media file to use the fallback path."
                    ) from exc
            else:
                try:
                    local_paths = list(downloaded.paths)
                    metadata.update(
                        title=downloaded.title,
                        caption=downloaded.caption,
                        creator=downloaded.creator,
                        thumbnail_url=downloaded.thumbnail_url,
                        webpage_url=downloaded.webpage_url,
                    )
                    return _store_and_save(
                        job, local_paths, None, metadata, uploaded,
                        repository=repository, embedder=embedder, storage=storage,
                        settings=settings, drop_staged=staged,
                    )
                finally:
                    downloaded.cleanup()

        # Upload path: the API already staged the files in GCS.
        first = Path(work_dir) / f"staged{Path(staged[0]).suffix or '.mp4'}"
        storage.download_gcs_uri_to_file(staged[0], first)
        return _store_and_save(
            job, [first], staged, metadata, uploaded,
            repository=repository, embedder=embedder, storage=storage,
            settings=settings, drop_staged=[],
        )


def _store_and_save(
    job: dict[str, Any],
    local_paths: list[Path],
    gcs_uris: list[str] | None,
    metadata: dict[str, str | None],
    uploaded: list[str],
    *,
    repository: ReelRepository,
    embedder: VertexEmbeddingProvider,
    storage: GcsStorage,
    settings: Settings,
    drop_staged: list[str],
) -> UUID:
    try:
        if gcs_uris is None:
            if len(local_paths) == 1:
                uri, mime_type = storage.upload_video(local_paths[0])
                gcs_uris = [uri]
            else:
                gcs_uris = storage.upload_multiple_media(local_paths)
                mime_type = guess_mime_type(local_paths[0])
            uploaded.extend(gcs_uris)
        else:
            mime_type = guess_mime_type(Path(gcs_uris[0]))
        gcs_uri = gcs_uris[0] if len(gcs_uris) == 1 else json.dumps(gcs_uris)

        def _summary():
            try:
                return embedder.generate_summary(gcs_uri, mime_type)
            except Exception:
                return None

        with ThreadPoolExecutor(max_workers=2) as pool:
            summary_future = pool.submit(_summary)
            embedding = embedder.embed_video(gcs_uri, mime_type, metadata["title"])
            summary_data = summary_future.result()

        title = metadata["title"]
        summary = actionable_items = resources = None
        if isinstance(summary_data, dict):
            title = summary_data.get("title") or title
            summary = summary_data.get("summary")
            if "actionable_items" in summary_data:
                actionable_items = json.dumps(summary_data["actionable_items"])
            if "resources" in summary_data:
                resources = json.dumps(summary_data["resources"])

        thumbnail_url = metadata.get("thumbnail_url")
        try:
            thumb_file = generate_thumbnail(local_paths[0])
            if thumb_file and thumb_file.exists():
                thumbnail_url = f"/api/thumbnails/{storage.upload_thumbnail(thumb_file)}"
                if thumb_file != local_paths[0]:
                    thumb_file.unlink(missing_ok=True)
        except Exception as exc:
            logger.warning("Failed to generate/upload thumbnail for job %s: %s", job["id"], exc)

        reel = repository.create_reel(
            source_url=metadata["webpage_url"] or job["source_url"] or f"upload:{job.get('upload_title') or local_paths[0].name}",
            canonical_url=job.get("canonical_url"),
            title=title,
            caption=metadata["caption"],
            creator=metadata["creator"],
            thumbnail_url=thumbnail_url,
            embedding=embedding,
            embedding_model=settings.embedding_model,
            user_id=str(job["user_id"]),
            ingest_status="saved",
            gcs_uri=gcs_uri,
            summary=summary,
            actionable_items=actionable_items,
            resources=resources,
        )
    except Exception:
        for uri in uploaded:
            _delete_quietly(storage, uri)
        raise

    for uri in drop_staged:  # URL download won, so the fallback uploads are unused
        _delete_quietly(storage, uri)
    return reel.id


def run_ingest_job(
    job_id: UUID,
    *,
    repository: ReelRepository,
    embedder: VertexEmbeddingProvider,
    storage: GcsStorage,
    settings: Settings,
    after_save: Callable[[str], None] | None = None,
) -> str:
    """Process one job. Returns "skipped", "succeeded" or "failed"; raises to request a retry."""
    job = repository.claim_job(job_id)
    if job is None:
        return "skipped"

    try:
        reel_id = _ingest(job, repository=repository, embedder=embedder, storage=storage, settings=settings)
    except Exception as exc:
        logger.exception("Ingest job %s failed (attempt %s)", job_id, job["attempts"])
        if job["attempts"] >= settings.ingest_max_attempts:
            repository.fail_job(job_id, str(exc) or exc.__class__.__name__)
            return "failed"
        repository.requeue_job(job_id, str(exc) or exc.__class__.__name__)
        raise

    repository.complete_job(job_id, reel_id)
    if after_save:
        try:
            after_save(str(job["user_id"]))
        except Exception:
            logger.warning("Post-save hook failed for job %s", job_id)
    return "succeeded"


def run_ingest_job_with_retries(job_id: UUID, **kwargs: Any) -> str:
    """In-process stand-in for Cloud Tasks' retry behavior (local dev)."""
    settings: Settings = kwargs["settings"]
    for _ in range(max(1, settings.ingest_max_attempts)):
        try:
            return run_ingest_job(job_id, **kwargs)
        except Exception:
            continue
    return "failed"
