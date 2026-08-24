import json
from pathlib import Path
from threading import Barrier
from types import SimpleNamespace

import pytest

from app.config import Settings
from app.services.embedder import EmbeddingError, VertexEmbeddingProvider
from app.services.storage import GcsStorage


def test_embed_video_parallelizes_carousel_and_averages_in_uri_order():
    provider = VertexEmbeddingProvider(Settings())
    barrier = Barrier(2, timeout=2)
    calls = []

    def fake_embed(uri, mime_type, title):
        calls.append((uri, mime_type, title))
        barrier.wait()
        return [1.0, 3.0] if uri.endswith("first.jpg") else [3.0, 5.0]

    provider.embed_single_media = fake_embed
    uris = ["gs://bucket/first.jpg", "gs://bucket/second.png"]

    result = provider.embed_video(json.dumps(uris), "application/json", "Carousel")

    assert result == [2.0, 4.0]
    assert set(calls) == {
        (uris[0], "image/jpeg", "Carousel"),
        (uris[1], "image/png", "Carousel"),
    }


def test_embed_video_propagates_carousel_embedding_errors_without_json_fallback():
    provider = VertexEmbeddingProvider(Settings())
    calls = []
    uris = ["gs://bucket/first.jpg"]

    def fail(uri, mime_type, title):
        calls.append(uri)
        raise RuntimeError("Vertex unavailable")

    provider.embed_single_media = fail

    with pytest.raises(RuntimeError, match="Vertex unavailable"):
        provider.embed_video(json.dumps(uris), "application/json")

    assert calls == uris


def test_embed_video_rejects_empty_carousel():
    provider = VertexEmbeddingProvider(Settings())

    with pytest.raises(EmbeddingError, match="No embeddings generated for slides"):
        provider.embed_video("[]", "application/json")


def test_upload_multiple_media_parallelizes_and_preserves_path_order():
    barrier = Barrier(2, timeout=2)
    uploads = []

    class FakeBlob:
        def __init__(self, object_name):
            self.object_name = object_name

        def upload_from_filename(self, filename, content_type):
            uploads.append((self.object_name, filename, content_type))
            barrier.wait()

    class FakeBucket:
        name = "test-bucket"

        def blob(self, object_name):
            return FakeBlob(object_name)

    storage = GcsStorage(Settings(REEL_SEARCH_GCS_BUCKET="test-bucket"))
    storage._client = SimpleNamespace(bucket=lambda _name: FakeBucket())
    paths = [Path("/media/first.jpg"), Path("/media/second.png")]

    uris = storage.upload_multiple_media(paths)

    folder = uris[0].removeprefix("gs://test-bucket/").split("/", 2)[1]
    assert uris == [
        f"gs://test-bucket/reels/{folder}/first.jpg",
        f"gs://test-bucket/reels/{folder}/second.png",
    ]
    assert {upload[1:] for upload in uploads} == {
        (str(paths[0]), "image/jpeg"),
        (str(paths[1]), "image/png"),
    }
