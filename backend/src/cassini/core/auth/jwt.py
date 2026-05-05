"""JWT token creation and verification.

Provides functions for creating and verifying JWT access and refresh tokens
using PyJWT with HS256 algorithm.

TODO(security/jwt-asymmetric): HS256 is symmetric — anyone with read access
to the secret can mint admin tokens. Migrate to RS256 / EdDSA so the signing
key never leaves the issuer (the website portal or a dedicated KMS) and only
the public key ships with Cassini. Tracked separately from the prod-guard
hardening below.
"""

import os
import platform
import structlog
import secrets
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt

from cassini.core.config import get_settings

logger = structlog.get_logger(__name__)

JWT_ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
REFRESH_TOKEN_EXPIRE_DAYS: int = 7

# Minimum acceptable secret length (bytes/characters). 32 chars is the floor
# for HS256 — shorter secrets degrade the brute-force margin.
MIN_SECRET_LENGTH: int = 32

# Loopback addresses where auto-generating a JWT secret is acceptable: a
# misconfigured non-loopback bind in production must fail-fast instead.
_LOOPBACK_HOSTS: frozenset[str] = frozenset({
    "127.0.0.1",
    "localhost",
    "::1",
})


class JWTSecretError(RuntimeError):
    """Raised when the JWT secret is missing, too short, or insecurely stored."""


def _is_loopback(host: str) -> bool:
    """Return True if the configured server bind address is loopback-only."""
    return host.strip().lower() in _LOOPBACK_HOSTS


def _set_windows_file_acl(path: Path) -> bool:
    """Restrict a file's ACL to the current user only via icacls.

    POSIX chmod is a no-op on Windows. Use icacls to grant the current user
    full control and remove inheritance — equivalent in spirit to 0o600.

    Returns True on success, False on failure. Never raises.
    """
    if platform.system() != "Windows":
        return False
    try:
        username = os.environ.get("USERNAME") or os.environ.get("USER")
        if not username:
            logger.warning(
                "jwt_secret_acl_no_username",
                msg="Cannot determine current Windows user — skipping ACL hardening",
                path=str(path),
            )
            return False
        # Reset to user-only: remove inherited ACEs, grant current user F (full).
        # Suppress icacls' chatty stdout/stderr — we only care about the exit code.
        result = subprocess.run(
            [
                "icacls",
                str(path),
                "/inheritance:r",
                "/grant:r",
                f"{username}:F",
            ],
            capture_output=True,
            timeout=10,
            check=False,
        )
        if result.returncode == 0:
            logger.info(
                "jwt_secret_acl_set",
                msg="Restricted .jwt_secret ACL to current user via icacls",
                path=str(path),
                user=username,
            )
            return True
        logger.error(
            "jwt_secret_acl_failed",
            msg="icacls returned non-zero exit code while restricting .jwt_secret",
            path=str(path),
            returncode=result.returncode,
            stderr=result.stderr.decode(errors="replace").strip(),
        )
        return False
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as e:
        logger.error(
            "jwt_secret_acl_exception",
            msg="Failed to invoke icacls — .jwt_secret may be world-readable",
            path=str(path),
            error=type(e).__name__,
        )
        return False


def _harden_secret_file_permissions(path: Path) -> None:
    """Apply OS-appropriate permission hardening to the JWT secret file.

    POSIX: chmod 0o600.
    Windows: icacls — restrict to current user only.

    Raises JWTSecretError if hardening fails — auto-generated secrets must
    never ship world-readable.
    """
    if platform.system() == "Windows":
        if not _set_windows_file_acl(path):
            raise JWTSecretError(
                f"Failed to restrict ACL on {path}. "
                "Refusing to ship a world-readable JWT secret. "
                "Set CASSINI_JWT_SECRET via env var instead."
            )
        return
    try:
        path.chmod(0o600)
    except OSError as e:
        raise JWTSecretError(
            f"Failed to chmod 0o600 on {path}: {e!r}. "
            "Refusing to ship a world-readable JWT secret."
        ) from e


def _resolve_jwt_secret() -> str:
    """Resolve the JWT signing secret with production safety guards.

    Order of resolution:
      1. CASSINI_JWT_SECRET env var (preferred, production-safe).
      2. .jwt_secret file (dev-only persistence across uvicorn --reload).
      3. Auto-generated random secret (dev-only) — written to .jwt_secret
         with restricted permissions.

    Production guard: if CASSINI_JWT_SECRET is unset AND CASSINI_DEV_MODE
    is false AND the configured bind address is non-loopback, refuse to
    start. Auto-generating secrets on a public-facing server is a critical
    security bug — every restart would invalidate tokens, and the secret
    file inside the working directory is a persistence/leak risk.

    Validation: the resolved secret must be at least MIN_SECRET_LENGTH
    characters; otherwise startup fails.
    """
    settings = get_settings()
    secret = settings.jwt_secret or ""

    if secret:
        if len(secret) < MIN_SECRET_LENGTH:
            raise JWTSecretError(
                f"CASSINI_JWT_SECRET is too short ({len(secret)} chars). "
                f"Minimum acceptable length is {MIN_SECRET_LENGTH} characters. "
                "Generate a strong secret with: "
                "python -c \"import secrets; print(secrets.token_urlsafe(64))\""
            )
        return secret

    # No env-provided secret — apply production guard.
    bind_host = settings.server_host
    if not settings.dev_mode and not _is_loopback(bind_host):
        raise JWTSecretError(
            "CASSINI_JWT_SECRET is not set and the server is bound to a "
            f"non-loopback address ({bind_host}) with CASSINI_DEV_MODE=false. "
            "Refusing to auto-generate a secret in production. "
            "Set CASSINI_JWT_SECRET to a strong random string "
            f"(>= {MIN_SECRET_LENGTH} chars) — see docs/operations/secrets.md."
        )

    # Dev path: persist a random secret so uvicorn --reload doesn't invalidate
    # tokens between restarts. The file is restricted to the current user.
    secret_file = Path(".jwt_secret")
    if secret_file.exists():
        existing = secret_file.read_text().strip()
        if len(existing) >= MIN_SECRET_LENGTH:
            logger.info(
                "jwt_secret_loaded_from_file",
                msg="Loaded JWT secret from .jwt_secret file",
            )
            return existing
        logger.warning(
            "jwt_secret_file_too_short",
            msg=(
                "Existing .jwt_secret is shorter than minimum length — "
                "regenerating"
            ),
            existing_length=len(existing),
        )

    new_secret = secrets.token_urlsafe(64)
    secret_file.write_text(new_secret)
    _harden_secret_file_permissions(secret_file)
    logger.warning(
        "auto_generated_jwt_secret",
        msg=(
            "Generated new JWT secret — set CASSINI_JWT_SECRET env var "
            "in production"
        ),
    )
    return new_secret


# Resolve the secret at import time. In production this either returns the
# env-provided secret or raises JWTSecretError, ensuring fail-fast startup.
JWT_SECRET_KEY: str = _resolve_jwt_secret()


def create_access_token(
    user_id: int,
    username: str,
    password_changed_at: datetime | None = None,
    session_id: str | None = None,
) -> str:
    """Create a JWT access token.

    Args:
        user_id: The user's database ID.
        username: The user's username.
        password_changed_at: Timestamp of last password change (embedded for revocation).
        session_id: Optional session identifier for concurrent session tracking.

    Returns:
        Encoded JWT string.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "username": username,
        "type": "access",
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": now,
    }
    if password_changed_at is not None:
        payload["pwd_changed"] = int(password_changed_at.timestamp())
    if session_id is not None:
        payload["sid"] = session_id
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(
    user_id: int,
    password_changed_at: datetime | None = None,
    session_id: str | None = None,
) -> str:
    """Create a JWT refresh token.

    Args:
        user_id: The user's database ID.
        password_changed_at: Timestamp of last password change (embedded for revocation).
        session_id: Optional session identifier for concurrent session tracking.

    Returns:
        Encoded JWT string.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "iat": now,
    }
    if password_changed_at is not None:
        payload["pwd_changed"] = int(password_changed_at.timestamp())
    if session_id is not None:
        payload["sid"] = session_id
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def verify_access_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT access token.

    Args:
        token: The JWT token string.

    Returns:
        Decoded payload dict if valid, None if invalid or expired.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def verify_refresh_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT refresh token.

    Args:
        token: The JWT token string.

    Returns:
        Decoded payload dict if valid, None if invalid or expired.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
