"""API key authentication for data entry endpoints."""

from datetime import datetime, timezone
from typing import Optional
import secrets

import bcrypt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import get_db_session
from openspc.db.models.api_key import APIKey


class APIKeyAuth:
    """API key authentication handler.

    Provides static methods for generating, hashing, and verifying API keys.
    Keys are stored as bcrypt hashes for security.
    """

    @staticmethod
    def hash_key(plain_key: str) -> str:
        """Hash an API key using bcrypt.

        Args:
            plain_key: The plain text API key to hash.

        Returns:
            The bcrypt hash of the key.
        """
        return bcrypt.hashpw(
            plain_key.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")

    @staticmethod
    def verify_key(plain_key: str, hashed_key: str) -> bool:
        """Verify a plain key against its hash.

        Args:
            plain_key: The plain text API key to verify.
            hashed_key: The stored bcrypt hash.

        Returns:
            True if the key matches the hash.
        """
        try:
            return bcrypt.checkpw(
                plain_key.encode("utf-8"),
                hashed_key.encode("utf-8"),
            )
        except Exception:
            return False

    @staticmethod
    def generate_key() -> str:
        """Generate a new random API key.

        Returns:
            A new API key with 'openspc_' prefix and 32 bytes of random data.
        """
        return f"openspc_{secrets.token_urlsafe(32)}"

    @staticmethod
    def extract_prefix(plain_key: str) -> str:
        """Extract the lookup prefix from a plain API key.

        The prefix is the first 8 characters of the key, stored unhashed
        to allow O(1) candidate narrowing before bcrypt verification.

        Args:
            plain_key: The full plain text API key.

        Returns:
            First 8 characters of the key.
        """
        return plain_key[:8]


async def verify_api_key(
    x_api_key: str = Header(..., alias="X-API-Key"),
    session: AsyncSession = Depends(get_db_session),
) -> APIKey:
    """FastAPI dependency to verify API key from header.

    Validates the API key from the X-API-Key header against stored keys.
    Updates last_used_at on successful authentication.

    Args:
        x_api_key: API key from X-API-Key header.
        session: Database session from dependency injection.

    Returns:
        APIKey object if valid.

    Raises:
        HTTPException: 401 if key is invalid, expired, or inactive.
    """
    # Use key prefix for O(1) candidate narrowing when available
    prefix = APIKeyAuth.extract_prefix(x_api_key)
    stmt = select(APIKey).where(APIKey.is_active == True)  # noqa: E712

    # First try prefix-based lookup (fast path)
    prefix_stmt = stmt.where(APIKey.key_prefix == prefix)
    result = await session.execute(prefix_stmt)
    api_keys = list(result.scalars().all())

    # Fallback: keys without prefix set (created before migration)
    if not api_keys:
        fallback_stmt = stmt.where(APIKey.key_prefix.is_(None))
        fallback_result = await session.execute(fallback_stmt)
        api_keys = list(fallback_result.scalars().all())

    # Verify against candidate(s) using bcrypt
    matched_key: Optional[APIKey] = None
    for api_key in api_keys:
        if APIKeyAuth.verify_key(x_api_key, api_key.key_hash):
            # Backfill prefix if missing (one-time migration)
            if api_key.key_prefix is None:
                api_key.key_prefix = prefix
            matched_key = api_key
            break

    if matched_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Check expiration
    if matched_key.is_expired():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key has expired",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Update last_used_at timestamp
    matched_key.last_used_at = datetime.now(timezone.utc)
    await session.flush()

    return matched_key
