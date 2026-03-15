"""Centralized application settings using pydantic-settings.

All environment variable reads are consolidated here. Import `settings`
from this module rather than reading os.environ directly.

Resolution order (highest priority wins):
  init kwargs > env vars > .env file > cassini.toml > defaults
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and TOML.

    All env vars are prefixed with CASSINI_ (case-insensitive).
    TOML config file is loaded as a lower-priority source.
    """

    model_config = SettingsConfigDict(
        env_prefix="CASSINI_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        """Inject TOML config as a settings source below env vars.

        Priority (first wins): init > env > .env > toml > secrets.
        """
        from cassini.core.toml_config import TomlConfigSettingsSource

        return (
            init_settings,
            env_settings,
            dotenv_settings,
            TomlConfigSettingsSource(settings_cls),
            file_secret_settings,
        )

    # Application
    app_version: str = "0.0.9"

    # Server
    server_host: str = "127.0.0.1"
    server_port: int = 8000

    # Database
    database_url: str = "sqlite+aiosqlite:///./cassini.db"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_recycle: int = 3600

    # Auth / JWT
    jwt_secret: str = ""
    cookie_secure: bool = True

    # Admin bootstrap
    admin_username: str = "admin"
    admin_password: str = ""

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:3000"

    # Web Push (VAPID)
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_contact_email: str = ""

    # Rate limiting
    rate_limit_login: str = "5/minute"
    rate_limit_default: str = "120/minute"
    rate_limit_data_entry: str = "300/minute"    # Per-key. 5 samples/sec.
    rate_limit_batch: str = "30/minute"          # Batch endpoint (heavier)
    rate_limit_export: str = "10/minute"         # Export endpoints

    # Logging
    log_format: str = "console"  # "console" or "json"

    # Dev / sandbox
    sandbox: bool = False
    # Dev mode -- disables enterprise enforcement (forced password change, etc.)
    dev_mode: bool = False

    # Emergency backdoor: allow admin local login even when SSO-only is active
    admin_local_auth: bool = False

    # Licensing
    license_file: str = ""
    license_public_key_file: str = ""  # Path to Ed25519 public key PEM
    dev_tier: str = ""  # Dev license tier: "" (community), "pro", or "enterprise"

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings singleton."""
    return Settings()
