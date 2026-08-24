from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from google.cloud import storage

from app.config import Settings


class StorageError(RuntimeError):
    pass


def guess_mime_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in (".jpg", ".jpeg"):
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".mov":
        return "video/quicktime"
    if suffix == ".webm":
        return "video/webm"
    return "video/mp4"


class GcsStorage:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = storage.Client(
                project=self.settings.google_cloud_project or None
            )
        return self._client

    def upload_video(self, path: Path) -> tuple[str, str]:
        if not self.settings.reel_search_gcs_bucket:
            raise StorageError("REEL_SEARCH_GCS_BUCKET is not configured")

        content_type = guess_mime_type(path)
        bucket = self.client.bucket(self.settings.reel_search_gcs_bucket)
        object_name = f"reels/{uuid4()}{path.suffix or '.mp4'}"
        blob = bucket.blob(object_name)
        blob.upload_from_filename(str(path), content_type=content_type)
        return f"gs://{bucket.name}/{object_name}", content_type

    def upload_multiple_media(self, paths: list[Path]) -> list[str]:
        if not self.settings.reel_search_gcs_bucket:
            raise StorageError("REEL_SEARCH_GCS_BUCKET is not configured")

        bucket = self.client.bucket(self.settings.reel_search_gcs_bucket)

        folder_uuid = uuid4()

        def _upload_one(path: Path) -> str:
            content_type = guess_mime_type(path)
            object_name = f"reels/{folder_uuid}/{path.name}"
            blob = bucket.blob(object_name)
            blob.upload_from_filename(str(path), content_type=content_type)
            return f"gs://{bucket.name}/{object_name}"

        with ThreadPoolExecutor(max_workers=min(len(paths), 8) or 1) as pool:
            return list(pool.map(_upload_one, paths))

    def upload_thumbnail(self, path: Path) -> str:
        if not self.settings.reel_search_gcs_bucket:
            raise StorageError("REEL_SEARCH_GCS_BUCKET is not configured")

        content_type = guess_mime_type(path)
        bucket = self.client.bucket(self.settings.reel_search_gcs_bucket)
        filename = f"{uuid4()}.jpg"
        object_name = f"thumbnails/{filename}"
        blob = bucket.blob(object_name)
        blob.upload_from_filename(str(path), content_type=content_type)
        return filename

    def download_blob(self, object_name: str) -> bytes:
        if not self.settings.reel_search_gcs_bucket:
            raise StorageError("REEL_SEARCH_GCS_BUCKET is not configured")
        bucket = self.client.bucket(self.settings.reel_search_gcs_bucket)
        blob = bucket.blob(object_name)
        if not blob.exists():
            raise StorageError(f"Blob {object_name} not found")
        return blob.download_as_bytes()

    def download_gcs_uri_to_file(self, gcs_uri: str, target_path: Path) -> None:
        if not gcs_uri.startswith("gs://"):
            raise StorageError(f"Invalid GCS URI: {gcs_uri}")
        parts = gcs_uri[5:].split("/", 1)
        if len(parts) < 2:
            raise StorageError(f"Invalid GCS URI: {gcs_uri}")
        bucket_name, object_name = parts
        bucket = self.client.bucket(bucket_name)
        blob = bucket.blob(object_name)
        blob.download_to_filename(str(target_path))

    def delete_video(self, gcs_uri: str) -> None:
        import json
        try:
            uris = json.loads(gcs_uri)
            if isinstance(uris, list):
                for uri in uris:
                    self._delete_single_gcs_uri(uri)
                return
        except Exception:
            pass
        self._delete_single_gcs_uri(gcs_uri)

    def _delete_single_gcs_uri(self, gcs_uri: str) -> None:
        if not gcs_uri.startswith("gs://"):
            return
        parts = gcs_uri[5:].split("/", 1)
        if len(parts) < 2:
            return
        bucket_name, object_name = parts
        try:
            bucket = self.client.bucket(bucket_name)
            blob = bucket.blob(object_name)
            blob.delete()
        except Exception:
            pass
