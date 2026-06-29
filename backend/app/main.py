from pathlib import Path
from tempfile import NamedTemporaryFile, TemporaryDirectory
import json
from uuid import UUID

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.schemas import HealthResponse, SaveResponse, SearchRequest, SearchResult, ReelOut
from app.services.auth import get_current_user_id
from app.services.db import DatabaseError, ReelRepository
from app.services.embedder import EmbeddingError, VertexEmbeddingProvider
from app.services.downloader import MediaDownloadError, download_media
from app.services.storage import GcsStorage, StorageError, guess_mime_type
from app.services.url_utils import canonicalize_url, is_instagram_url, is_youtube_url

settings = get_settings()

app = FastAPI(title="Reel Search API", version="0.1.0")
allowed_origins = [origin.strip() for origin in settings.frontend_origin.split(",") if origin.strip()]
allow_credentials = "*" not in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_repository() -> ReelRepository:
    return ReelRepository(settings)


def get_embedder() -> VertexEmbeddingProvider:
    return VertexEmbeddingProvider(settings)


def get_storage() -> GcsStorage:
    return GcsStorage(settings)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    missing = []
    if not settings.database_url:
        missing.append("DATABASE_URL")
    if not settings.google_cloud_project:
        missing.append("GOOGLE_CLOUD_PROJECT")
    if not settings.google_cloud_location:
        missing.append("GOOGLE_CLOUD_LOCATION")
    if not settings.reel_search_gcs_bucket:
        missing.append("REEL_SEARCH_GCS_BUCKET")
    return HealthResponse(
        ok=not missing,
        database_configured=settings.has_database,
        vertex_configured=settings.has_vertex,
        gcs_configured=settings.has_gcs,
        missing_env=missing,
    )


@app.get("/api/reels", response_model=list[ReelOut])
def list_reels(user_id: str = Depends(get_current_user_id)) -> list[ReelOut]:
    try:
        return get_repository().list_reels(user_id=user_id)
    except DatabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/reels", response_model=SaveResponse)
async def save_reel(
    url: str | None = Form(default=None),
    files: list[UploadFile] = File(default=[]),
    user_id: str = Depends(get_current_user_id),
) -> SaveResponse:
    if not url and not files:
        raise HTTPException(status_code=400, detail="Provide an Instagram URL or upload media files")

    canonical_url = canonicalize_url(url)
    if url and not (is_instagram_url(url) or is_youtube_url(url)):
        raise HTTPException(status_code=400, detail="Only Instagram and YouTube URLs are supported")

    repo = get_repository()
    if canonical_url:
        try:
            existing = await run_in_threadpool(repo.find_by_canonical_url, canonical_url, user_id)
        except DatabaseError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        if existing:
            return SaveResponse(reel=existing, duplicate=True, ingest_source="url")

    local_paths: list[Path] = []
    cleanup = None
    metadata = {
        "title": None,
        "caption": None,
        "creator": None,
        "thumbnail_url": None,
        "webpage_url": None,
    }
    ingest_source = "url"

    if url:
          try:
              downloaded = await run_in_threadpool(download_media, url)
              local_paths = downloaded.paths
              cleanup = downloaded.cleanup
              metadata.update(
                  {
                      "title": downloaded.title,
                      "caption": downloaded.caption,
                      "creator": downloaded.creator,
                      "thumbnail_url": downloaded.thumbnail_url,
                      "webpage_url": downloaded.webpage_url,
                  }
              )
          except MediaDownloadError as exc:
              if not files:
                  raise HTTPException(
                      status_code=422,
                      detail=f"Media download failed: {exc}. Upload the media file to use the fallback path.",
                  )

    if not local_paths and files:
        ingest_source = "upload"
        temp_dir = TemporaryDirectory()
        for idx, f in enumerate(files):
            suffix = Path(f.filename or "file.mp4").suffix or ".mp4"
            local_path = Path(temp_dir.name) / f"upload_{idx}{suffix}"
            with open(local_path, "wb") as buffer:
                buffer.write(await f.read())
            local_paths.append(local_path)
        metadata["title"] = files[0].filename
        cleanup = temp_dir.cleanup

    if not local_paths:
        raise HTTPException(status_code=400, detail="No media files were available to embed")

    try:
        # Upload all media files to GCS
        if len(local_paths) == 1:
            gcs_uri, mime_type = await run_in_threadpool(get_storage().upload_video, local_paths[0])
        else:
            gcs_uris = await run_in_threadpool(get_storage().upload_multiple_media, local_paths)
            gcs_uri = json.dumps(gcs_uris)
            mime_type = guess_mime_type(local_paths[0])

        embedding = await run_in_threadpool(
            get_embedder().embed_video,
            gcs_uri,
            mime_type,
            metadata["title"],
        )

        title_val = metadata["title"]
        summary_val = None
        actionable_items_val = None
        resources_val = None
        tags_val = []
        try:
            summary_data = await run_in_threadpool(
                get_embedder().generate_summary,
                gcs_uri,
                mime_type,
            )
            title_val = summary_data.get("title") or metadata["title"]
            summary_val = summary_data.get("summary")
            actionable_items_val = json.dumps(summary_data.get("actionable_items", [])) if "actionable_items" in summary_data else None
            resources_val = json.dumps(summary_data.get("resources", [])) if "resources" in summary_data else None
            tags_val = summary_data.get("tags") or []
        except Exception:
            pass

        source_url = metadata["webpage_url"] or url or f"upload:{files[0].filename if files else local_paths[0].name}"
        reel = await run_in_threadpool(
            repo.create_reel,
            source_url=source_url,
            canonical_url=canonical_url,
            title=title_val,
            caption=metadata["caption"],
            creator=metadata["creator"],
            thumbnail_url=metadata["thumbnail_url"],
            embedding=embedding,
            embedding_model=settings.embedding_model,
            user_id=user_id,
            tags=tags_val,
            ingest_status="saved",
            gcs_uri=gcs_uri,
            summary=summary_val,
            actionable_items=actionable_items_val,
            resources=resources_val,
        )
        return SaveResponse(reel=reel, duplicate=False, ingest_source=ingest_source)
    except (DatabaseError, EmbeddingError, StorageError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        if cleanup:
            cleanup()
        elif ingest_source == "upload" and local_path and local_path.exists():
            local_path.unlink(missing_ok=True)


@app.post("/api/search", response_model=list[SearchResult])
async def search_reels(
    payload: SearchRequest,
    user_id: str = Depends(get_current_user_id),
) -> list[SearchResult]:
    try:
        embedding = await run_in_threadpool(get_embedder().embed_query, payload.query)
        return await run_in_threadpool(get_repository().search, payload.query, embedding, payload.limit, user_id)
    except (DatabaseError, EmbeddingError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.delete("/api/reels/{reel_id}")
async def delete_reel(
    reel_id: UUID,
    user_id: str = Depends(get_current_user_id),
):
    repo = get_repository()
    try:
        reel = await run_in_threadpool(repo.find_by_id, reel_id, user_id)
        if not reel:
            raise HTTPException(status_code=404, detail="Reel not found")

        success = await run_in_threadpool(repo.delete_reel, reel_id, user_id)
        if not success:
            raise HTTPException(status_code=404, detail="Reel not found")

        if reel.gcs_uri:
            try:
                await run_in_threadpool(get_storage().delete_video, reel.gcs_uri)
            except Exception:
                pass

        return {"ok": True}
    except DatabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
