"""API Key management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_admin, get_current_engineer, get_db_session
from cassini.api.schemas.api_key import (
    APIKeyCreate,
    APIKeyCreateResponse,
    APIKeyResponse,
    APIKeyUpdate,
)
from cassini.db.models.api_key import APIKey
from cassini.db.models.user import User
from cassini.core.auth.api_key import APIKeyAuth

router = APIRouter(prefix="/api/v1/api-keys", tags=["api-keys"])


@router.get("/", response_model=list[APIKeyResponse])
async def list_api_keys(
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> list[APIKeyResponse]:
    """List all API keys (without exposing the actual keys)."""
    stmt = select(APIKey).order_by(APIKey.created_at.desc())
    result = await session.execute(stmt)
    keys = result.scalars().all()
    return [APIKeyResponse.model_validate(key) for key in keys]


@router.post("/", response_model=APIKeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    request: Request,
    data: APIKeyCreate,
    session: AsyncSession = Depends(get_db_session),
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
        key_prefix=APIKeyAuth.extract_prefix(plain_key),
        expires_at=data.expires_at,
        rate_limit_per_minute=data.rate_limit_per_minute,
    )

    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)

    request.state.audit_context = {
        "resource_type": "api_key",
        "resource_id": api_key.id,
        "action": "create",
        "summary": f"API key '{data.name}' created",
        "fields": {
            "name": data.name,
            "key_prefix": api_key.key_prefix,
            "expires_at": str(api_key.expires_at) if api_key.expires_at else None,
            "rate_limit_per_minute": api_key.rate_limit_per_minute,
        },
    }

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
    session: AsyncSession = Depends(get_db_session),
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
    request: Request,
    key_id: str,
    data: APIKeyUpdate,
    session: AsyncSession = Depends(get_db_session),
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

    request.state.audit_context = {
        "resource_type": "api_key",
        "resource_id": key_id,
        "action": "update",
        "summary": f"API key '{api_key.name}' updated",
        "fields": {
            "updated_fields": list(update_data.keys()),
            "name": api_key.name,
        },
    }

    return APIKeyResponse.model_validate(api_key)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_api_key(
    request: Request,
    key_id: str,
    session: AsyncSession = Depends(get_db_session),
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

    key_name = api_key.name
    await session.delete(api_key)
    await session.commit()

    request.state.audit_context = {
        "resource_type": "api_key",
        "resource_id": key_id,
        "action": "delete",
        "summary": f"API key '{key_name}' deleted",
        "fields": {"name": key_name},
    }


@router.post("/{key_id}/revoke", response_model=APIKeyResponse)
async def revoke_api_key(
    request: Request,
    key_id: str,
    session: AsyncSession = Depends(get_db_session),
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

    request.state.audit_context = {
        "resource_type": "api_key",
        "resource_id": key_id,
        "action": "update",
        "summary": f"API key '{api_key.name}' revoked",
        "fields": {"name": api_key.name, "is_active": False},
    }

    return APIKeyResponse.model_validate(api_key)
