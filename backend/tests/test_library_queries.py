from datetime import UTC, datetime
from uuid import UUID

from fastapi.testclient import TestClient

import app.main as main
from app.config import Settings
from app.services.auth import get_current_user_id
from app.services.db import ReelRepository


TEST_USER_ID = "c0a63498-a3ff-41dd-a125-e8c3cfbb20cd"
COLLECTION_ID = "00000000-0000-0000-0000-000000000100"


class Rows:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class FakeConnection:
    def __init__(self, responses):
        self.responses = list(responses)
        self.queries = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def execute(self, query, params=()):
        self.queries.append((query, params))
        return Rows(self.responses.pop(0))


def reel_row(index: int):
    return {
        "id": f"00000000-0000-0000-0000-{index:012d}",
        "source_url": f"https://example.com/reel/{index}",
        "canonical_url": f"https://example.com/reel/{index}",
        "title": f"Reel {index}",
        "caption": None,
        "creator": "creator",
        "thumbnail_url": f"https://images.example.com/{index}.jpg",
        "ingest_status": "saved",
        "created_at": datetime(2026, 7, index, tzinfo=UTC),
        "gcs_uri": None,
        "summary": "Summary",
        "actionable_items": None,
        "resources": None,
        "collection_id": COLLECTION_ID,
        "collection_name": "Motion Design",
    }


def test_count_reels_matches_owned_and_shared_library_scope():
    connection = FakeConnection([[{"count": 79}]])
    repo = ReelRepository(Settings(DATABASE_URL="postgresql://example"))
    repo._connect = lambda: connection

    assert repo.count_reels(TEST_USER_ID) == 79
    query, params = connection.queries[0]
    assert "user_id = %s or user_id is null" in " ".join(query.split())
    assert params == (TEST_USER_ID,)


def test_list_collections_returns_domain_and_caps_preview_reels_at_three():
    collection_row = {
        "id": COLLECTION_ID,
        "user_id": TEST_USER_ID,
        "domain": "Arts & Creativity",
        "name": "Motion Design",
        "description": "Animation and visual storytelling workflows.",
        "keywords": ["animation", "typography"],
        "reel_count": 4,
        "updated_at": datetime(2026, 7, 20, tzinfo=UTC),
    }
    connection = FakeConnection([[collection_row], [[reel_row(index) for index in range(1, 5)][index] for index in range(4)]])
    repo = ReelRepository(Settings(DATABASE_URL="postgresql://example"))
    repo._connect = lambda: connection

    collections = repo.list_collections(TEST_USER_ID)

    assert collections[0].domain == "Arts & Creativity"
    assert collections[0].reel_count == 4
    assert len(collections[0].reels) == 3


def test_count_endpoint_returns_repository_total(monkeypatch):
    fake_repo = type("FakeRepo", (), {"count_reels": lambda self, user_id: 79})()
    monkeypatch.setattr(main, "get_repository", lambda: fake_repo)
    main.app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID

    try:
        with TestClient(main.app) as client:
            response = client.get("/api/reels/count")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"count": 79}


def test_collection_reels_query_is_scoped_to_owner():
    connection = FakeConnection([[reel_row(1)]])
    repo = ReelRepository(Settings(DATABASE_URL="postgresql://example"))
    repo._connect = lambda: connection

    reels = repo.list_collection_reels(UUID(COLLECTION_ID), TEST_USER_ID)

    assert len(reels) == 1
    query, params = connection.queries[0]
    normalized = " ".join(query.split())
    assert "c.user_id = %s" in normalized
    assert "limit %s" in normalized
    assert params == (UUID(COLLECTION_ID), TEST_USER_ID, 8)
