import httpx
from fastapi import Header, HTTPException, status
from app.config import get_settings
import base64
import hashlib
import hmac
from secrets import compare_digest
from time import time
from uuid import UUID

settings = get_settings()
SYNC_TOKEN_VERSION = "v1"


def create_sync_token(user_id: str, expires_at: int) -> str:
    message = f"{user_id}.{expires_at}".encode("utf-8")
    signature = hmac.new(settings.shortcut_token.encode("utf-8"), message, hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{SYNC_TOKEN_VERSION}.{expires_at}.{encoded_signature}"


def _is_valid_sync_token(user_id: str, token: str) -> bool:
    if not settings.shortcut_token:
        return False

    parts = token.split(".")
    if len(parts) != 3 or parts[0] != SYNC_TOKEN_VERSION:
        return False

    try:
        expires_at = int(parts[1])
    except ValueError:
        return False

    if expires_at < int(time()):
        return False

    expected_token = create_sync_token(user_id, expires_at)
    return compare_digest(token, expected_token)


def _shortcut_user_id(
    x_reel_user_id: str | None,
    x_reel_sync_token: str | None,
) -> str | None:
    if not settings.shortcut_token or not x_reel_user_id or not x_reel_sync_token:
        return None
    try:
        user_id = str(UUID(x_reel_user_id))
    except ValueError:
        return None
    if not _is_valid_sync_token(user_id, x_reel_sync_token):
        return None
    return user_id


async def get_current_user_id(
    authorization: str | None = Header(default=None),
    x_reel_user_id: str | None = Header(default=None),
    x_reel_sync_token: str | None = Header(default=None),
) -> str:
    """FastAPI dependency to extract and validate the Supabase Auth JWT token.

    Returns the user's UUID.
    """
    shortcut_user_id = _shortcut_user_id(x_reel_user_id, x_reel_sync_token)
    if shortcut_user_id:
        return shortcut_user_id

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    
    token = authorization.split(" ")[1]
    
    if not settings.supabase_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL is not configured on the server",
        )
    
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": settings.supabase_service_role_key or "",
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired session token",
                )
            
            user_data = response.json()
            user_id = user_data.get("id")
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication failed: User ID not found in token",
                )
            return user_id
            
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Auth service unreachable: {exc}",
            )
