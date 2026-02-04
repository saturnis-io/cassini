"""API key authentication for data entry endpoints."""

from datetime import datetime
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
    # Query all active keys (we need to check hash against each)
    stmt = select(APIKey).where(APIKey.is_active == True)  # noqa: E712
    result = await session.execute(stmt)
    api_keys = result.scalars().all()

    # Find matching key by verifying against each hash
    matched_key: Optional[APIKey] = None
    for api_key in api_keys:
        if APIKeyAuth.verify_key(x_api_key, api_key.key_hash):
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
    matched_key.last_used_at = datetime.utcnow()
    await session.flush()

    return matched_key


def require_characteristic_permission(char_id: int):
    """Factory for dependency that checks characteristic permission.

    Creates a FastAPI dependency that verifies the API key has permission
    to access a specific characteristic.

    Args:
        char_id: The characteristic ID to check permission for.

    Returns:
        A FastAPI dependency function.

    Usage:
        @router.post("/")
        async def endpoint(
            api_key: APIKey = Depends(verify_api_key),
            _: None = Depends(require_characteristic_permission(char_id)),
        ):
            ...
    """

    async def check_permission(api_key: APIKey = Depends(verify_api_key)):
        if not api_key.can_access_characteristic(char_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key does not have permission for characteristic {char_id}",
            )

    return check_permission
