"""Centralized application settings using pydantic-settings.

All environment variable reads are consolidated here. Import `settings`
from this module rather than reading os.environ directly.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    All env vars are prefixed with OPENSPC_ (case-insensitive).
    """

    model_config = SettingsConfigDict(
        env_prefix="OPENSPC_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    app_version: str = "0.3.0"

    # Database
    database_url: str = "sqlite+aiosqlite:///./openspc.db"

    # Auth / JWT
    jwt_secret: str = ""
    cookie_secure: bool = False

    # Admin bootstrap
    admin_username: str = "admin"
    admin_password: str = ""

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:3000"

    # Rate limiting
    rate_limit_login: str = "5/minute"
    rate_limit_default: str = "60/minute"

    # Dev / sandbox
    sandbox: bool = False
    # Dev mode -- disables enterprise enforcement (forced password change, etc.)
    dev_mode: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings singleton."""
    return Settings()
