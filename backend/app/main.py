from pathlib import Path
from tempfile import NamedTemporaryFile, TemporaryDirectory
import json
from time import time
from uuid import UUID

import logging
from fastapi import FastAPI, File, Form, Header, HTTPException, Query, UploadFile, Depends, BackgroundTasks
from fastapi.responses import JSONResponse, RedirectResponse, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.schemas import CollectionOut, HealthResponse, JobOut, LibraryCountOut, SaveResponse, SearchRequest, SearchResult, ReelOut, SyncTokenResponse
from app.services.auth import create_sync_token, get_current_user_id, is_valid_sync_token
from app.services.db import DatabaseError, ReelRepository
from app.services.embedder import EmbeddingError, VertexEmbeddingProvider
from app.services.ingest import run_ingest_job, run_ingest_job_with_retries
from app.services.task_queue import CloudTasksQueue, verify_worker_request
from app.services.storage import GcsStorage, StorageError, guess_mime_type
from app.services.thumbnail import generate_thumbnail
from app.services.url_utils import canonicalize_url, is_instagram_url, is_youtube_url
from app.services.collections import build_collections

settings = get_settings()

app = FastAPI(title="Reel Search API", version="0.1.0")


@app.exception_handler(DatabaseError)
async def database_error_handler(request, exc: DatabaseError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(EmbeddingError)
async def embedding_error_handler(request, exc: EmbeddingError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(StorageError)
async def storage_error_handler(request, exc: StorageError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


allowed_origins = [origin.strip() for origin in settings.frontend_origin.split(",") if origin.strip()]
allowed_origins.extend([
    "capacitor://localhost",
    "http://localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
])
allowed_origins = list(set(allowed_origins))
allow_credentials = "*" not in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
)


repository = ReelRepository(settings)
embedder = VertexEmbeddingProvider(settings)
storage_client = GcsStorage(settings)
task_queue = CloudTasksQueue(settings)


def recluster_user_collections(
    repo: ReelRepository,
    user_id: str,
    classifier: VertexEmbeddingProvider = embedder,
) -> None:
    reels = repo.list_collection_source_reels(user_id)
    semantic_groups = None
    try:
        semantic_groups = classifier.classify_collections(reels)
    except Exception:
        # Collection refresh is best effort and must never make saving fail.
        pass
    repo.replace_collections(user_id, build_collections(reels, semantic_groups=semantic_groups))


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
    return repository.list_reels(user_id=user_id)


@app.get("/api/reels/count", response_model=LibraryCountOut)
def count_reels(user_id: str = Depends(get_current_user_id)) -> LibraryCountOut:
    return LibraryCountOut(count=repository.count_reels(user_id=user_id))


@app.get("/api/collections", response_model=list[CollectionOut])
def list_collections(user_id: str = Depends(get_current_user_id)) -> list[CollectionOut]:
    collections = repository.list_collections(user_id=user_id)
    if not collections or any(collection.domain is None for collection in collections):
        recluster_user_collections(repository, user_id)
        collections = repository.list_collections(user_id=user_id)
    return collections


@app.get("/api/collections/{collection_id}/reels", response_model=list[ReelOut])
def list_collection_reels(
    collection_id: UUID,
    limit: int = Query(default=8, ge=1, le=50),
    user_id: str = Depends(get_current_user_id),
) -> list[ReelOut]:
    return repository.list_collection_reels(collection_id, user_id, limit)


@app.post("/api/collections/recluster", response_model=list[CollectionOut])
async def recluster_collections(user_id: str = Depends(get_current_user_id)) -> list[CollectionOut]:
    await run_in_threadpool(recluster_user_collections, repository, user_id)
    return await run_in_threadpool(repository.list_collections, user_id)


@app.post("/api/sync-token", response_model=SyncTokenResponse)
def issue_sync_token(user_id: str = Depends(get_current_user_id)) -> SyncTokenResponse:
    if not settings.shortcut_token:
        raise HTTPException(status_code=503, detail="SHORTCUT_TOKEN is not configured")
    expires_at = int(time()) + 60 * 60 * 24 * 365
    return SyncTokenResponse(
        user_id=UUID(user_id),
        sync_token=create_sync_token(user_id, expires_at),
        expires_at=expires_at,
    )


def job_out(job: dict, user_id: str) -> JobOut:
    reel = repository.find_by_id(job["reel_id"], user_id) if job.get("reel_id") else None
    return JobOut(
        id=job["id"],
        status=job["status"],
        error=job.get("error"),
        reel=reel,
        created_at=job["created_at"],
    )


def run_ingest_inline(job_id: UUID) -> None:
    run_ingest_job_with_retries(
        job_id,
        repository=repository,
        embedder=embedder,
        storage=storage_client,
        settings=settings,
        after_save=recluster_user_collections,
    )


@app.post("/api/reels", response_model=SaveResponse, status_code=202)
async def save_reel(
    response: Response,
    background_tasks: BackgroundTasks,
    url: str | None = Form(default=None),
    files: list[UploadFile] = File(default=[]),
    user_id: str = Depends(get_current_user_id),
) -> SaveResponse:
    if not url and not files:
        raise HTTPException(status_code=400, detail="Provide an Instagram URL or upload media files")

    canonical_url = canonicalize_url(url)
    if url and not (is_instagram_url(url) or is_youtube_url(url)):
        raise HTTPException(status_code=400, detail="Only Instagram and YouTube URLs are supported")

    if canonical_url:
        existing = await run_in_threadpool(repository.find_by_canonical_url, canonical_url, user_id)
        if existing:
            response.status_code = 200
            return SaveResponse(reel=existing, duplicate=True, ingest_source="url")

    # Stage uploads in GCS now: the request body is gone by the time a worker runs.
    staged: list[str] = []
    if files:
        with TemporaryDirectory() as temp_dir:
            local_paths: list[Path] = []
            for idx, f in enumerate(files):
                suffix = Path(f.filename or "file.mp4").suffix or ".mp4"
                local_path = Path(temp_dir) / f"upload_{idx}{suffix}"
                with open(local_path, "wb") as buffer:
                    buffer.write(await f.read())
                local_paths.append(local_path)
            if len(local_paths) == 1:
                uri, _ = await run_in_threadpool(storage_client.upload_video, local_paths[0])
                staged = [uri]
            else:
                staged = await run_in_threadpool(storage_client.upload_multiple_media, local_paths)

    job = await run_in_threadpool(
        repository.create_job,
        user_id=user_id,
        source_url=url,
        canonical_url=canonical_url,
        staged_gcs_uris=staged,
        upload_title=files[0].filename if files else None,
    )

    if job["status"] == "queued" and job["attempts"] == 0:
        if settings.uses_cloud_tasks:
            try:
                await run_in_threadpool(task_queue.enqueue, str(job["id"]))
            except Exception as exc:
                logging.exception("Failed to enqueue ingest job %s", job["id"])
                await run_in_threadpool(repository.fail_job, job["id"], "Could not queue the job")
                raise HTTPException(status_code=503, detail="Could not queue the reel for processing") from exc
        else:
            background_tasks.add_task(run_in_threadpool, run_ingest_inline, job["id"])

    return SaveResponse(
        job=await run_in_threadpool(job_out, job, user_id),
        duplicate=False,
        ingest_source="url" if url else "upload",
    )


@app.get("/api/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: UUID, user_id: str = Depends(get_current_user_id)) -> JobOut:
    job = await run_in_threadpool(repository.get_job, job_id, user_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return await run_in_threadpool(job_out, job, user_id)


@app.post("/internal/ingest/{job_id}")
async def ingest_worker(job_id: UUID, authorization: str | None = Header(default=None)):
    """Cloud Tasks target. A non-2xx response makes Cloud Tasks retry with backoff."""
    verify_worker_request(authorization, settings)
    outcome = await run_in_threadpool(
        run_ingest_job,
        job_id,
        repository=repository,
        embedder=embedder,
        storage=storage_client,
        settings=settings,
        after_save=recluster_user_collections,
    )
    return {"job_id": str(job_id), "outcome": outcome}


@app.get("/api/thumbnails/{filename}")
async def get_thumbnail(filename: str):
    try:
        blob_bytes = await run_in_threadpool(storage_client.download_blob, f"thumbnails/{filename}")
        return Response(content=blob_bytes, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000"})
    except StorageError as exc:
        raise HTTPException(status_code=404, detail="Thumbnail not found") from exc


@app.get("/api/reels/{reel_id}/thumbnail")
async def get_reel_thumbnail(reel_id: UUID, user_id: str = Depends(get_current_user_id)):
    reel = await run_in_threadpool(repository.find_by_id, reel_id, user_id)
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")

    if reel.thumbnail_url:
        if reel.thumbnail_url.startswith("/api/thumbnails/"):
            filename = reel.thumbnail_url.split("/")[-1]
            return await get_thumbnail(filename)
        elif reel.thumbnail_url.startswith("http"):
            return RedirectResponse(reel.thumbnail_url)

    if reel.gcs_uri:
        try:
            uris = json.loads(reel.gcs_uri) if reel.gcs_uri.startswith("[") else [reel.gcs_uri]
            target_gcs_uri = uris[0]
            with TemporaryDirectory() as temp_dir:
                ext = Path(target_gcs_uri).suffix or ".mp4"
                temp_video = Path(temp_dir) / f"temp_vid{ext}"
                await run_in_threadpool(storage_client.download_gcs_uri_to_file, target_gcs_uri, temp_video)
                thumb_file = await run_in_threadpool(generate_thumbnail, temp_video)
                if thumb_file and thumb_file.exists():
                    thumb_filename = await run_in_threadpool(storage_client.upload_thumbnail, thumb_file)
                    new_thumb_url = f"/api/thumbnails/{thumb_filename}"
                    await run_in_threadpool(
                        repository.update_thumbnail_url, reel.id, new_thumb_url
                    )
                    return await get_thumbnail(thumb_filename)
        except Exception as exc:
            logging.exception("Failed to extract on-demand thumbnail for reel %s: %s", reel_id, exc)

    raise HTTPException(status_code=404, detail="Thumbnail unavailable")


@app.post("/api/reels/shortcut", response_model=SaveResponse, status_code=202)
async def save_reel_shortcut(
    response: Response,
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    token: str = Form(...),
    user_id: str = Form(...),
) -> SaveResponse:
    # Accept either the global shortcut_token OR a valid user-specific sync_token
    is_global_valid = settings.shortcut_token and token == settings.shortcut_token
    is_sync_valid = is_valid_sync_token(user_id, token)
    
    if not (is_global_valid or is_sync_valid):
        raise HTTPException(status_code=401, detail="Invalid shortcut token")
    return await save_reel(response=response, background_tasks=background_tasks, url=url, files=[], user_id=user_id)


@app.post("/api/search", response_model=list[SearchResult])
async def search_reels(
    payload: SearchRequest,
    user_id: str = Depends(get_current_user_id),
) -> list[SearchResult]:
    embedding = await run_in_threadpool(embedder.embed_query, payload.query)
    return await run_in_threadpool(
        repository.search, payload.query, embedding, payload.limit, user_id
    )


@app.delete("/api/reels/{reel_id}")
async def delete_reel(
    reel_id: UUID,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    reel = await run_in_threadpool(repository.find_by_id, reel_id, user_id)
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")

    success = await run_in_threadpool(repository.delete_reel, reel_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Reel not found")

    background_tasks.add_task(
        run_in_threadpool, recluster_user_collections, repository, user_id
    )

    if reel.gcs_uri:
        try:
            await run_in_threadpool(storage_client.delete_video, reel.gcs_uri)
        except Exception:
            pass

    return {"ok": True}
