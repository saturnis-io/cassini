"""Credential storage for Cassini CLI.

Stores API keys in ~/.cassini/credentials.json with secure file permissions.
Supports multiple server profiles for connecting to different Cassini instances.
Uses atomic writes (write to .tmp, then os.replace) to prevent corruption.
"""
from __future__ import annotations

import json
import logging
import os
import platform
import stat
import tempfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_CONFIG_DIR = Path.home() / ".cassini"
_CREDENTIALS_FILE = _CONFIG_DIR / "credentials.json"


def _ensure_config_dir() -> Path:
    """Create ~/.cassini/ directory if it doesn't exist."""
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    return _CONFIG_DIR


def _secure_write(path: Path, data: str) -> None:
    """Write data to file atomically with secure permissions.

    Writes to a temp file first, then atomically replaces the target.
    On Unix, sets 0600 permissions (owner read/write only).
    """
    _ensure_config_dir()

    # Write to temp file in the same directory (for atomic replace)
    fd, tmp_path = tempfile.mkstemp(
        dir=path.parent, prefix=".credentials_", suffix=".tmp"
    )
    try:
        os.write(fd, data.encode("utf-8"))
        os.close(fd)

        # Set secure permissions on Unix
        if platform.system() != "Windows":
            os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR)  # 0600

        # Atomic replace
        os.replace(tmp_path, path)
    except Exception:
        # Clean up temp file on failure
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _load_credentials() -> dict[str, Any]:
    """Load credentials from file. Returns empty dict if file doesn't exist."""
    if not _CREDENTIALS_FILE.exists():
        return {}
    try:
        return json.loads(_CREDENTIALS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        logger.warning("Failed to read credentials file, starting fresh")
        return {}


def save_credential(server_url: str, api_key: str, profile: str = "default") -> None:
    """Save an API key for a server URL under a profile name.

    Args:
        server_url: The Cassini server URL.
        api_key: The API key to store.
        profile: Profile name (default: "default").
    """
    creds = _load_credentials()
    creds.setdefault("profiles", {})[profile] = {
        "server_url": server_url,
        "api_key": api_key,
    }
    _secure_write(_CREDENTIALS_FILE, json.dumps(creds, indent=2))
    logger.info("Saved credentials for profile '%s'", profile)


def load_credential(profile: str = "default") -> tuple[str, str] | None:
    """Load server URL and API key for a profile.

    Args:
        profile: Profile name (default: "default").

    Returns:
        Tuple of (server_url, api_key) or None if not found.
    """
    creds = _load_credentials()
    entry = creds.get("profiles", {}).get(profile)
    if entry is None:
        return None
    return entry.get("server_url", ""), entry.get("api_key", "")


def delete_credential(profile: str = "default") -> bool:
    """Delete a saved credential profile.

    Returns:
        True if the profile existed and was deleted.
    """
    creds = _load_credentials()
    profiles = creds.get("profiles", {})
    if profile not in profiles:
        return False
    del profiles[profile]
    _secure_write(_CREDENTIALS_FILE, json.dumps(creds, indent=2))
    return True


def list_profiles() -> list[str]:
    """List all saved credential profiles."""
    creds = _load_credentials()
    return list(creds.get("profiles", {}).keys())
