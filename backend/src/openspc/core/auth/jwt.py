"""JWT token creation and verification.

Provides functions for creating and verifying JWT access and refresh tokens
using PyJWT with HS256 algorithm.
"""

import structlog
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt

from openspc.core.config import get_settings

logger = structlog.get_logger(__name__)

JWT_ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
REFRESH_TOKEN_EXPIRE_DAYS: int = 7

# Load secret from centralized settings
JWT_SECRET_KEY: str = get_settings().jwt_secret

# When no env var is set, persist a random secret to a file so it
# survives uvicorn --reload restarts during development.
if not JWT_SECRET_KEY:
    _secret_file = Path(".jwt_secret")
    if _secret_file.exists():
        JWT_SECRET_KEY = _secret_file.read_text().strip()
        logger.info("Loaded JWT secret from .jwt_secret file")
    else:
        JWT_SECRET_KEY = secrets.token_urlsafe(64)
        _secret_file.write_text(JWT_SECRET_KEY)
        logger.info(
            "Generated new JWT secret and saved to .jwt_secret "
            "(sessions will persist across --reload restarts)"
        )


def create_access_token(user_id: int, username: str) -> str:
    """Create a JWT access token.

    Args:
        user_id: The user's database ID.
        username: The user's username.

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
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    """Create a JWT refresh token.

    Args:
        user_id: The user's database ID.

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
