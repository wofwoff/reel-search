from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl


class HealthResponse(BaseModel):
    ok: bool
    database_configured: bool
    vertex_configured: bool
    gcs_configured: bool
    missing_env: list[str]


class ReelOut(BaseModel):
    id: UUID
    source_url: str
    canonical_url: str | None = None
    title: str | None = None
    caption: str | None = None
    creator: str | None = None
    thumbnail_url: str | None = None
    ingest_status: str
    created_at: datetime
    gcs_uri: str | None = None
    summary: str | None = None
    actionable_items: str | None = None
    resources: str | None = None
    collection_id: UUID | None = None
    collection_name: str | None = None


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=10, ge=1, le=50)


class SearchResult(ReelOut):
    score: float


class SaveResponse(BaseModel):
    reel: ReelOut
    duplicate: bool = False
    ingest_source: Literal["url", "upload"]


class CollectionOut(BaseModel):
    id: UUID
    domain: str | None = None
    name: str
    description: str | None = None
    keywords: list[str] = Field(default_factory=list)
    reel_count: int
    updated_at: datetime
    reels: list[ReelOut] = Field(default_factory=list)


class LibraryCountOut(BaseModel):
    count: int = Field(ge=0)


class SyncTokenResponse(BaseModel):
    user_id: UUID
    sync_token: str
    expires_at: int
