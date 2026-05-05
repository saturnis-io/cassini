"""Centralized application settings using pydantic-settings.

All environment variable reads are consolidated here. Import `settings`
from this module rather than reading os.environ directly.

Resolution order (highest priority wins):
  init kwargs > env vars > .env file > cassini.toml > defaults
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict

VALID_ROLES = {"all", "api", "spc", "ingestion", "reports", "erp", "purge", "ai"}
VALID_ENVIRONMENTS = {"development", "production"}

# Loopback addresses where dev_mode / dev_tier may safely remain enabled in
# production builds. Anything else is treated as an externally-reachable bind
# and triggers a startup refusal.
_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "0.0.0.0.localhost"}


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

    # Environment — drives production safety guards. Defaults to "production"
    # so that an unconfigured deployment fails closed: dev-only toggles
    # (dev_mode, dev_tier) are silently disabled unless the bind address is
    # loopback. Set CASSINI_ENVIRONMENT=development for laptops and CI.
    environment: str = "production"

    # Dev / sandbox
    sandbox: bool = False
    # Dev mode -- disables enterprise enforcement (forced password change, etc.)
    # and ALL rate limits (including the login limiter). Production safety
    # guard in apply_production_guards() forces this to False unless the bind
    # is loopback.
    dev_mode: bool = False

    # Emergency backdoor: allow admin local login even when SSO-only is active
    admin_local_auth: bool = False

    # Licensing
    license_file: str = ""
    license_public_key_file: str = ""  # Path to Ed25519 public key PEM
    # Dev license tier: "" (community), "pro", or "enterprise". Production
    # safety guard forces this to "" unless the bind is loopback.
    dev_tier: str = ""

    # Cluster / broker
    broker_url: str = ""  # e.g. "valkey://localhost:6379"
    roles: str = "all"  # Comma-separated node roles: "all", "api", "spc", etc.

    # ERP webhook replay protection (A6-H2). When True, requests missing
    # the X-Webhook-Timestamp header still validate against the body-only
    # HMAC signature (with a structured warning) so existing integrations
    # continue to work during the migration window. Flip to False in the
    # next minor release once partners have adopted timestamped signatures.
    erp_webhook_legacy_grace: bool = True

    @property
    def role_list(self) -> list[str]:
        """Parse comma-separated roles into a list."""
        return [r.strip() for r in self.roles.split(",") if r.strip()]

    def has_role(self, role: str) -> bool:
        """Check if this node should run the given role."""
        roles = self.role_list
        return "all" in roles or role in roles

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        """Whether this process is running in production mode."""
        return self.environment.strip().lower() == "production"

    @property
    def is_loopback_bind(self) -> bool:
        """Whether server_host resolves to a loopback interface.

        Production safety guards permit dev-only toggles only on loopback
        binds, so a developer can still run a local prod-mode build for
        smoke testing without exposing the toggles to the network.
        """
        host = (self.server_host or "").strip().lower()
        return host in _LOOPBACK_HOSTS

    def apply_production_guards(self) -> list[str]:
        """Disable dev-only toggles in production unless safely bound.

        Mutates the settings instance in place. Returns a list of structured
        warning messages so the caller (typically application startup) can
        log them once the logger is initialized.

        Behaviour:
          - In development: no changes; warnings list is empty.
          - In production on loopback: dev_mode/dev_tier may remain set, but
            a warning is recorded so the operator sees the override.
          - In production on a non-loopback bind: dev_mode is forced False
            and dev_tier is cleared, with explicit warnings.
        """
        warnings: list[str] = []
        if not self.is_production:
            return warnings

        loopback = self.is_loopback_bind

        if self.dev_mode:
            if loopback:
                warnings.append(
                    "production_dev_mode_loopback_only"
                )
            else:
                warnings.append("production_dev_mode_disabled_non_loopback")
                self.dev_mode = False

        if self.dev_tier:
            if loopback:
                warnings.append("production_dev_tier_loopback_only")
            else:
                warnings.append("production_dev_tier_cleared_non_loopback")
                self.dev_tier = ""

        return warnings


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings singleton.

    Applies production guards at first access — dev-only toggles
    (dev_mode, dev_tier) are forced off in production unless the bind
    address is loopback. Warnings are logged via structlog.
    """
    s = Settings()
    warnings = s.apply_production_guards()
    if warnings:
        # Lazy-import to avoid circulars during early startup.
        import structlog

        log = structlog.get_logger(__name__)
        for code in warnings:
            log.warning(
                "production_guard_triggered",
                code=code,
                environment=s.environment,
                server_host=s.server_host,
                dev_mode=s.dev_mode,
                dev_tier=s.dev_tier,
            )
    return s
