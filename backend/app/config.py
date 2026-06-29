from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[1] / ".env", extra="ignore")

    database_url: str = Field(default="", alias="DATABASE_URL")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    google_cloud_project: str = Field(default="", alias="GOOGLE_CLOUD_PROJECT")
    google_cloud_location: str = Field(default="us", alias="GOOGLE_CLOUD_LOCATION")
    reel_search_gcs_bucket: str = Field(default="", alias="REEL_SEARCH_GCS_BUCKET")
    embedding_dim: int = Field(default=1536, alias="EMBEDDING_DIM")
    frontend_origin: str = Field(default="http://localhost:5173", alias="FRONTEND_ORIGIN")
    embedding_model: str = "gemini-embedding-2"
    yt_dlp_cookies_from_browser: str = Field(default="", alias="YT_DLP_COOKIES_FROM_BROWSER")
    yt_dlp_cookie_file: str = Field(default="", alias="YT_DLP_COOKIE_FILE")
    video_fps: float = 1.0
    video_end_offset_seconds: int = 80

    @property
    def has_database(self) -> bool:
        return bool(self.database_url)

    @property
    def has_vertex(self) -> bool:
        return bool(self.google_cloud_project and self.google_cloud_location)

    @property
    def has_gcs(self) -> bool:
        return bool(self.reel_search_gcs_bucket)


@lru_cache
def get_settings() -> Settings:
    return Settings()
