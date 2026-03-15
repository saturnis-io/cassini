"""TOML configuration file support for Cassini.

Provides a single-file config alternative to scattered env vars.
Resolution order (highest priority wins): env vars > cassini.toml > defaults.

Config file search order:
  1. ``CASSINI_CONFIG`` env var (explicit path)
  2. ``./cassini.toml`` (current working directory)
  3. System path (``C:\\ProgramData\\Cassini\\cassini.toml`` on Windows)
"""

from __future__ import annotations

import logging
import os
import sys
import tomllib
from pathlib import Path
from typing import Any

from pydantic import fields as pydantic_fields
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource

logger = logging.getLogger(__name__)

# System-wide config paths, checked in order after cwd.
_SYSTEM_CONFIG_PATHS: list[str] = []
if sys.platform == "win32":
    _SYSTEM_CONFIG_PATHS.append(r"C:\ProgramData\Cassini\cassini.toml")
elif sys.platform == "linux":
    _SYSTEM_CONFIG_PATHS.append("/etc/cassini/cassini.toml")

# Maps TOML section.key to Settings field name.
_TOML_FIELD_MAP: dict[str, str] = {
    "server.host": "server_host",
    "server.port": "server_port",
    "database.url": "database_url",
    "database.pool_size": "db_pool_size",
    "database.max_overflow": "db_max_overflow",
    "database.pool_recycle": "db_pool_recycle",
    "auth.jwt_secret": "jwt_secret",
    "auth.cookie_secure": "cookie_secure",
    "auth.admin_username": "admin_username",
    "auth.admin_password": "admin_password",
    "cors.origins": "cors_origins",
    "vapid.private_key": "vapid_private_key",
    "vapid.public_key": "vapid_public_key",
    "vapid.contact_email": "vapid_contact_email",
    "rate_limit.login": "rate_limit_login",
    "rate_limit.default": "rate_limit_default",
    "logging.format": "log_format",
    "dev.sandbox": "sandbox",
    "dev.dev_mode": "dev_mode",
    "dev.dev_tier": "dev_tier",
    "license.file": "license_file",
    "license.public_key_file": "license_public_key_file",
    "app.version": "app_version",
}


def find_config_file() -> str | None:
    """Locate a ``cassini.toml`` config file.

    Search order:
      1. ``CASSINI_CONFIG`` environment variable
      2. ``./cassini.toml`` in the current working directory
      3. System paths (platform-dependent)

    Returns:
        Absolute path to the config file, or ``None`` if not found.
    """
    # 1. Explicit env var
    env_path = os.environ.get("CASSINI_CONFIG")
    if env_path:
        if Path(env_path).is_file():
            return str(Path(env_path).resolve())
        logger.warning("CASSINI_CONFIG points to missing file: %s", env_path)
        return None

    # 2. Current working directory
    cwd_path = Path.cwd() / "cassini.toml"
    if cwd_path.is_file():
        return str(cwd_path.resolve())

    # 3. System paths
    for sys_path in _SYSTEM_CONFIG_PATHS:
        if Path(sys_path).is_file():
            return sys_path

    return None


def load_toml_config(path: str) -> dict[str, Any]:
    """Load and parse a TOML config file.

    Args:
        path: Filesystem path to the TOML file.

    Returns:
        Parsed TOML as a nested dict, or an empty dict if the file is
        missing or contains invalid TOML.
    """
    try:
        with open(path, "rb") as f:
            return tomllib.load(f)
    except FileNotFoundError:
        return {}
    except tomllib.TOMLDecodeError:
        logger.warning("Invalid TOML in config file: %s", path)
        return {}


def _flatten_toml(data: dict[str, Any]) -> dict[str, Any]:
    """Flatten nested TOML sections into Settings field names.

    Uses ``_TOML_FIELD_MAP`` to translate ``section.key`` paths into
    the flat field names that :class:`Settings` expects.
    """
    flat: dict[str, Any] = {}
    for section_name, section in data.items():
        if not isinstance(section, dict):
            continue
        for key, value in section.items():
            toml_key = f"{section_name}.{key}"
            field_name = _TOML_FIELD_MAP.get(toml_key)
            if field_name is not None:
                flat[field_name] = value
            else:
                logger.debug("Ignoring unknown TOML key: %s", toml_key)
    return flat


class TomlConfigSettingsSource(PydanticBaseSettingsSource):
    """Pydantic settings source that reads from a ``cassini.toml`` file.

    Injected at lower priority than env vars so environment always wins.
    """

    def __init__(self, settings_cls: type[BaseSettings]) -> None:
        super().__init__(settings_cls)
        path = find_config_file()
        raw = load_toml_config(path) if path else {}
        self._values = _flatten_toml(raw)
        if path and self._values:
            logger.info("Loaded config from %s (%d values)", path, len(self._values))

    def get_field_value(
        self,
        field: pydantic_fields.FieldInfo,
        field_name: str,
    ) -> tuple[Any, str, bool]:
        """Return the value for a single field.

        Returns:
            Tuple of (value, field_name, value_is_complex).
            ``value_is_complex`` is False because TOML values are already
            the correct Python types.
        """
        value = self._values.get(field_name)
        return value, field_name, False

    def __call__(self) -> dict[str, Any]:
        """Return all TOML-sourced values as a flat dict."""
        return dict(self._values)
