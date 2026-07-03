import pytest
import asyncio
from time import time
from fastapi.testclient import TestClient
from app.main import app
from app.config import get_settings
from app.services.auth import create_sync_token, get_current_user_id

# A test user UUID
TEST_USER_ID = "c0a63498-a3ff-41dd-a125-e8c3cfbb20cd"

@pytest.fixture
def client():
    # Temporarily set the shortcut token configuration for testing
    settings = get_settings()
    settings.shortcut_token = "test-shortcut-token"
    with TestClient(app) as c:
        yield c

def test_save_shortcut_invalid_token(client):
    response = client.post(
        "/api/reels/shortcut",
        data={
            "url": "https://www.instagram.com/reel/123/",
            "token": "wrong-token",
            "user_id": TEST_USER_ID
        }
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid shortcut token"

def test_save_shortcut_missing_token_config():
    # If SHORTCUT_TOKEN is empty/not configured, it should reject any attempt
    settings = get_settings()
    original_token = settings.shortcut_token
    settings.shortcut_token = ""
    
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/reels/shortcut",
                data={
                    "url": "https://www.instagram.com/reel/123/",
                    "token": "some-token",
                    "user_id": TEST_USER_ID
                }
            )
            assert response.status_code == 401
    finally:
        # Restore the original token configuration
        settings.shortcut_token = original_token


def test_sync_headers_authenticate_shortcut_user():
    settings = get_settings()
    original_token = settings.shortcut_token
    settings.shortcut_token = "test-shortcut-token"

    try:
        token = create_sync_token(TEST_USER_ID, int(time()) + 3600)
        user_id = asyncio.run(
            get_current_user_id(
                authorization=None,
                x_reel_user_id=TEST_USER_ID,
                x_reel_sync_token=token,
            )
        )
        assert user_id == TEST_USER_ID
    finally:
        settings.shortcut_token = original_token


def test_sync_headers_reject_wrong_token():
    settings = get_settings()
    original_token = settings.shortcut_token
    settings.shortcut_token = "test-shortcut-token"

    try:
        with pytest.raises(Exception):
            asyncio.run(
                get_current_user_id(
                    authorization=None,
                    x_reel_user_id=TEST_USER_ID,
                    x_reel_sync_token="v1.9999999999.wrong-token",
                )
            )
    finally:
        settings.shortcut_token = original_token


def test_save_shortcut_valid_sync_token(client):
    settings = get_settings()
    original_token = settings.shortcut_token
    settings.shortcut_token = "test-shortcut-token"

    try:
        # Generate a valid user-specific sync token
        token = create_sync_token(TEST_USER_ID, int(time()) + 3600)
        
        # Override dependencies/services if necessary, but save_reel will be executed.
        # Since it actually downloads/staged, we might get DatabaseError or similar if DB is not mocked,
        # but let's see how save_reel handles it or if we can just assert that it gets past auth.
        # Wait, the other test test_save_shortcut_invalid_token asserts 401.
        # If we send a valid token, it gets past auth and tries to save_reel, which might fail with 503 (DatabaseError/etc)
        # or return a result if it succeeds. So if it returns 503 instead of 401, we know auth succeeded!
        response = client.post(
            "/api/reels/shortcut",
            data={
                "url": "https://www.instagram.com/reel/123/",
                "token": token,
                "user_id": TEST_USER_ID
            }
        )
        assert response.status_code in (200, 422, 503)
        if response.status_code == 401:
            assert response.json()["detail"] != "Invalid shortcut token"
    finally:
        settings.shortcut_token = original_token

