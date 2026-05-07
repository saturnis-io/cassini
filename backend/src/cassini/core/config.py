"""Centralized application settings using pydantic-settings.

All environment variable reads are consolidated here. Import `settings`
from this module rather than reading os.environ directly.

Resolution order (highest priority wins):
  init kwargs > env vars > .env file > cassini.toml > defaults
"""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict

VALID_ROLES = {"all", "api", "spc", "ingestion", "reports", "erp", "purge", "ai"}
VALID_ENVIRONMENTS = {"development", "production"}

# Loopback addresses where dev_mode may safely remain enabled in
# production builds. Anything else is treated as an externally-reachable bind
# and triggers a startup refusal.
_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "0.0.0.0.localhost"}

# Sentinel env var that opts the operator into honoring CASSINI_DEV_TIER. The
# var must be set to a truthy value AND CASSINI_ENVIRONMENT must be
# "development" — both conditions are required so a stray production env var
# cannot pirate commercial features. This is intentionally NOT a Settings
# field so it cannot be hidden in cassini.toml or a stale .env file.
_DEV_TIER_OVERRIDE_ENV_VAR = "CASSINI_ENABLE_DEV_TIER_OVERRIDE"


def _dev_tier_override_enabled() -> bool:
    """Whether the developer has opted into honoring CASSINI_DEV_TIER.

    Read directly from os.environ (not Settings) so a stale .env or TOML
    cannot pre-authorize production. Truthy values: 1, true, yes, on.
    """
    raw = os.environ.get(_DEV_TIER_OVERRIDE_ENV_VAR, "").strip().lower()
    return raw in ("1", "true", "yes", "on")


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

    # Stable data directory — holds files that MUST survive uvicorn restarts
    # regardless of CWD: signature key, license key, instance ID, etc.
    # Empty string means "auto-resolve" (sibling of the cassini package, the
    # `data/` dir already used by LicenseService).
    data_dir: str = ""

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
        """Disable dev-only toggles unless explicitly authorized.

        Mutates the settings instance in place. Returns a list of structured
        warning messages so the caller (typically application startup) can
        log them once the logger is initialized.

        ``dev_mode`` (rate-limit / password bypass) follows the legacy
        loopback rule — production prod-mode laptops can still keep it on
        for smoke testing.

        ``dev_tier`` is treated as a SECURITY-SENSITIVE feature unlock and
        is held to a stricter standard. It is honored only when BOTH
        conditions are true:

          1. ``CASSINI_ENVIRONMENT=development``
          2. ``CASSINI_ENABLE_DEV_TIER_OVERRIDE`` env var is set to a truthy
             value (1/true/yes/on).

        Otherwise dev_tier is cleared with a structured warning. This
        prevents Cassini's open-source mirror from being weaponized to
        unlock paid features on a public server by simply setting one
        environment variable.

        Behaviour matrix:
          - dev environment + override env var: dev_tier honored (warning
            "dev_tier_override_active" emitted).
          - dev environment, no override env var: dev_tier cleared with
            "dev_tier_cleared_no_override".
          - production, override env var, loopback: dev_tier still cleared
            with "dev_tier_cleared_production" — the override only applies
            in development.
          - production, anything else: dev_tier cleared with
            "dev_tier_cleared_production".

        ``dev_mode`` keeps its loopback-friendly behavior in production.
        """
        warnings: list[str] = []
        loopback = self.is_loopback_bind
        override_enabled = _dev_tier_override_enabled()

        # ---------- dev_mode (rate-limit bypass, password bypass) ----------
        # Production-only check. dev_mode in development is freely allowed.
        if self.is_production and self.dev_mode:
            if loopback:
                warnings.append("production_dev_mode_loopback_only")
            else:
                warnings.append("production_dev_mode_disabled_non_loopback")
                self.dev_mode = False

        # ---------- dev_tier (commercial feature unlock — security-sensitive) ----------
        # Stricter rules: dev_tier requires BOTH environment=development AND
        # the explicit override env var. Anything else clears it.
        if self.dev_tier:
            if not self.is_production and override_enabled:
                # Sanctioned dev workflow — honor the tier and emit a clear
                # "OVERRIDE ACTIVE" log line so the operator knows.
                warnings.append("dev_tier_override_active")
            elif self.is_production:
                # In production we never honor dev_tier, regardless of bind
                # address or override env var. The override is a
                # development-only escape hatch.
                warnings.append("dev_tier_cleared_production")
                self.dev_tier = ""
            else:
                # Development environment but the operator did not explicitly
                # opt in — refuse to honor it. This is the case that
                # protects users who pulled an open-source mirror with a
                # leftover CASSINI_DEV_TIER in their environment.
                warnings.append("dev_tier_cleared_no_override")
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
            if code == "dev_tier_override_active":
                # Surface the override prominently so it's visible in CI logs
                # and laptop terminals — operators MUST know dev_tier is on.
                log.warning(
                    "DEV TIER OVERRIDE ACTIVE — non-production only",
                    code=code,
                    environment=s.environment,
                    server_host=s.server_host,
                    dev_tier=s.dev_tier,
                )
            else:
                log.warning(
                    "production_guard_triggered",
                    code=code,
                    environment=s.environment,
                    server_host=s.server_host,
                    dev_mode=s.dev_mode,
                    dev_tier=s.dev_tier,
                )
    return s


def get_data_dir():
    """Resolve the stable data directory for files that must survive restarts.

    Resolution order:
      1. CASSINI_DATA_DIR env var (via Settings)
      2. Default: <cassini package parent>/data — the same `data/` dir
         already used by LicenseService for license.key and instance-id.

    Returns a Path. The caller is responsible for `.mkdir(parents=True,
    exist_ok=True)` if it needs the directory to exist.
    """
    from pathlib import Path

    settings = get_settings()
    if settings.data_dir:
        return Path(settings.data_dir).expanduser().resolve()

    # Default: <repo>/apps/cassini/backend/data, mirroring LicenseService._data_dir
    # which lives at: <package>/cassini/core/licensing.py -> .../data
    # config.py is at: <package>/cassini/core/config.py
    # parent.parent.parent = <package root> (e.g. .../src), so .parent = backend
    return Path(__file__).resolve().parent.parent.parent.parent / "data"
