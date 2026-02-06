"""API Key management endpoints."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import get_current_admin, get_current_engineer
from openspc.db.database import get_session
from openspc.db.models.api_key import APIKey
from openspc.db.models.user import User
from openspc.core.auth.api_key import APIKeyAuth

router = APIRouter(prefix="/api/v1/api-keys", tags=["api-keys"])


# Request/Response schemas
class APIKeyCreate(BaseModel):
    """Request schema for creating an API key."""
    name: str = Field(..., min_length=1, max_length=255, description="Human-readable name")
    expires_at: Optional[datetime] = Field(None, description="Optional expiration date")
    rate_limit_per_minute: int = Field(60, ge=1, le=1000, description="Rate limit")


class APIKeyResponse(BaseModel):
    """Response schema for API key (without sensitive data)."""
    id: str
    name: str
    created_at: datetime
    expires_at: Optional[datetime]
    rate_limit_per_minute: int
    is_active: bool
    last_used_at: Optional[datetime]

    model_config = {"from_attributes": True}


class APIKeyCreateResponse(BaseModel):
    """Response schema for newly created API key (includes the key once)."""
    id: str
    name: str
    key: str  # Only returned on creation!
    created_at: datetime
    expires_at: Optional[datetime]
    rate_limit_per_minute: int
    is_active: bool


class APIKeyUpdate(BaseModel):
    """Request schema for updating an API key."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    is_active: Optional[bool] = None
    rate_limit_per_minute: Optional[int] = Field(None, ge=1, le=1000)


@router.get("/", response_model=list[APIKeyResponse])
async def list_api_keys(
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_engineer),
) -> list[APIKeyResponse]:
    """List all API keys (without exposing the actual keys)."""
    stmt = select(APIKey).order_by(APIKey.created_at.desc())
    result = await session.execute(stmt)
    keys = result.scalars().all()
    return [APIKeyResponse.model_validate(key) for key in keys]


@router.post("/", response_model=APIKeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    data: APIKeyCreate,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_engineer),
) -> APIKeyCreateResponse:
    """Create a new API key.

    IMPORTANT: The key is only returned once during creation.
    Store it securely - it cannot be retrieved again.
    """
    # Generate a new key
    plain_key = APIKeyAuth.generate_key()
    key_hash = APIKeyAuth.hash_key(plain_key)

    # Create the API key record
    api_key = APIKey(
        name=data.name,
        key_hash=key_hash,
        expires_at=data.expires_at,
        rate_limit_per_minute=data.rate_limit_per_minute,
    )

    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)

    # Return with the plain key (only time it's visible)
    return APIKeyCreateResponse(
        id=api_key.id,
        name=api_key.name,
        key=plain_key,
        created_at=api_key.created_at,
        expires_at=api_key.expires_at,
        rate_limit_per_minute=api_key.rate_limit_per_minute,
        is_active=api_key.is_active,
    )


@router.get("/{key_id}", response_model=APIKeyResponse)
async def get_api_key(
    key_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_engineer),
) -> APIKeyResponse:
    """Get API key details by ID."""
    stmt = select(APIKey).where(APIKey.id == key_id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()

    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"API key {key_id} not found",
        )

    return APIKeyResponse.model_validate(api_key)


@router.patch("/{key_id}", response_model=APIKeyResponse)
async def update_api_key(
    key_id: str,
    data: APIKeyUpdate,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_engineer),
) -> APIKeyResponse:
    """Update API key settings."""
    stmt = select(APIKey).where(APIKey.id == key_id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()

    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"API key {key_id} not found",
        )

    # Update provided fields
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(api_key, key, value)

    await session.commit()
    await session.refresh(api_key)

    return APIKeyResponse.model_validate(api_key)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    key_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_admin),
) -> None:
    """Delete (revoke) an API key permanently."""
    stmt = select(APIKey).where(APIKey.id == key_id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()

    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"API key {key_id} not found",
        )

    await session.delete(api_key)
    await session.commit()


@router.post("/{key_id}/revoke", response_model=APIKeyResponse)
async def revoke_api_key(
    key_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_admin),
) -> APIKeyResponse:
    """Revoke an API key (set is_active=False) without deleting it."""
    stmt = select(APIKey).where(APIKey.id == key_id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()

    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"API key {key_id} not found",
        )

    api_key.is_active = False
    await session.commit()
    await session.refresh(api_key)

    return APIKeyResponse.model_validate(api_key)
