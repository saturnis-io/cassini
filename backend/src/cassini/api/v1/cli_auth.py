"""Self-service CLI token endpoint.

Allows any authenticated user to generate a scoped API key for CLI usage.
Unlike the admin/engineer API key endpoints, this is available to all roles
including operators. The key is automatically scoped to the user's assigned
plants and previous CLI tokens for the same user are revoked on creation.
"""

import structlog
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_user, get_db_session
from cassini.core.auth.api_key import APIKeyAuth
from cassini.db.models.api_key import APIKey
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

# CLI token name prefix — used to identify and revoke previous CLI tokens
CLI_TOKEN_PREFIX = "cli-"

router = APIRouter(prefix="/api/v1/auth", tags=["cli-auth"])


class CLITokenRequest(BaseModel):
    """Request schema for creating a CLI token."""

    label: str = Field(
        default="",
        max_length=100,
        description="Optional label to distinguish this CLI token",
    )
    expires_in_days: int = Field(
        default=90,
        ge=1,
        le=365,
        description="Token expiry in days (1-365, default 90)",
    )


class CLITokenResponse(BaseModel):
    """Response schema for a newly created CLI token."""

    key: str = Field(description="The API key (only shown once)")
    key_id: str = Field(description="API key ID for reference")
    name: str = Field(description="Token name")
    expires_at: datetime = Field(description="Expiration timestamp")
    plant_ids: list[int] | None = Field(
        description="Plant IDs this token is scoped to (None = all plants)"
    )
    revoked_previous: int = Field(
        description="Number of previous CLI tokens that were revoked"
    )


@router.post("/cli-token", response_model=CLITokenResponse, status_code=status.HTTP_201_CREATED)
async def create_cli_token(
    request: Request,
    data: CLITokenRequest,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> CLITokenResponse:
    """Create a self-service CLI API key for the current user.

    Any authenticated user can call this endpoint. The token is automatically
    scoped to the user's assigned plant IDs. Creating a new CLI token revokes
    all previous CLI tokens for the same user.

    The plain API key is returned only once — store it securely.
    """
    now = datetime.now(timezone.utc)

    # Build the token name from user identity + optional label
    label_suffix = f"-{data.label}" if data.label else ""
    token_name = f"{CLI_TOKEN_PREFIX}{current_user.username}{label_suffix}"

    # Determine plant scoping from user's plant roles
    # Admin users with roles on all plants get None (unrestricted)
    # Non-admin users get scoped to their specific plant IDs
    user_plant_ids: list[int] | None = None
    if current_user.plant_roles:
        plant_ids = [pr.plant_id for pr in current_user.plant_roles]
        # Only scope if the user has plant assignments
        if plant_ids:
            user_plant_ids = sorted(plant_ids)
    else:
        # No plant roles at all — token would be useless, but we still
        # create it (scoped to empty list means no access)
        user_plant_ids = []

    # Revoke all previous CLI tokens for this user
    # CLI tokens are identified by name matching "cli-{username}" or "cli-{username}-{label}"
    # The delimiter "/" after username prevents prefix collision (e.g., "bob" vs "bobby")
    user_cli_exact = f"{CLI_TOKEN_PREFIX}{current_user.username}"
    user_cli_labeled = f"{CLI_TOKEN_PREFIX}{current_user.username}-"
    previous_tokens_stmt = select(APIKey).where(
        (APIKey.name == user_cli_exact) | APIKey.name.startswith(user_cli_labeled),
        APIKey.is_active == True,  # noqa: E712
    )
    result = await session.execute(previous_tokens_stmt)
    previous_tokens = list(result.scalars().all())
    revoked_count = len(previous_tokens)

    if previous_tokens:
        # Deactivate all previous CLI tokens in bulk
        previous_ids = [t.id for t in previous_tokens]
        await session.execute(
            update(APIKey)
            .where(APIKey.id.in_(previous_ids))
            .values(is_active=False)
        )
        logger.info(
            "cli_tokens_revoked",
            user_id=current_user.id,
            username=current_user.username,
            revoked_count=revoked_count,
        )

    # Generate the new CLI API key
    plain_key = APIKeyAuth.generate_key()
    key_hash = APIKeyAuth.hash_key(plain_key)
    expires_at = now + timedelta(days=data.expires_in_days)

    api_key = APIKey(
        name=token_name,
        key_hash=key_hash,
        key_prefix=APIKeyAuth.extract_prefix(plain_key),
        expires_at=expires_at,
        rate_limit_per_minute=60,
        scope="read-write",
        plant_ids=user_plant_ids,
    )

    session.add(api_key)
    await session.flush()
    await session.refresh(api_key)

    # Audit context for the audit middleware
    request.state.audit_context = {
        "resource_type": "api_key",
        "resource_id": api_key.id,
        "action": "create",
        "summary": f"CLI token '{token_name}' created by {current_user.username}",
        "fields": {
            "name": token_name,
            "key_prefix": api_key.key_prefix,
            "expires_at": str(expires_at),
            "plant_ids": user_plant_ids,
            "revoked_previous": revoked_count,
        },
    }

    await session.commit()

    logger.info(
        "cli_token_created",
        user_id=current_user.id,
        username=current_user.username,
        key_id=api_key.id,
        expires_at=str(expires_at),
        plant_ids=user_plant_ids,
    )

    return CLITokenResponse(
        key=plain_key,
        key_id=api_key.id,
        name=token_name,
        expires_at=expires_at,
        plant_ids=user_plant_ids,
        revoked_previous=revoked_count,
    )
