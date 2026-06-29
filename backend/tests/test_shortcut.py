import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import get_settings

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
