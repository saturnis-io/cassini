"""Tests for the self-service CLI token endpoint (POST /api/v1/auth/cli-token)."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.auth.api_key import APIKeyAuth
from cassini.db.models.api_key import APIKey
from cassini.db.models.user import User, UserPlantRole, UserRole


def _make_plant_role(user_id: int, plant_id: int, role: UserRole = UserRole.operator) -> UserPlantRole:
    """Create a UserPlantRole with a mock plant object."""
    pr = UserPlantRole()
    pr.user_id = user_id
    pr.plant_id = plant_id
    pr.role = role
    # Attach a mock plant so _build_user_response-style code doesn't break
    mock_plant = MagicMock()
    mock_plant.name = f"Plant {plant_id}"
    mock_plant.code = f"P{plant_id}"
    mock_plant.id = plant_id
    pr.plant = mock_plant
    return pr


def _make_user(
    user_id: int = 1,
    username: str = "testuser",
    plant_ids: list[int] | None = None,
    role: UserRole = UserRole.operator,
) -> User:
    """Create a User object for testing (not persisted to DB)."""
    user = User()
    user.id = user_id
    user.username = username
    user.email = f"{username}@example.com"
    user.hashed_password = "fakehash"
    user.is_active = True
    user.must_change_password = False
    user.full_name = username.title()
    user.password_changed_at = None
    user.failed_login_count = 0
    user.locked_until = None
    user.password_history = None
    user.last_signature_auth_at = None
    user.pending_email = None
    user.roles_locked = False
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)

    if plant_ids:
        user.plant_roles = [_make_plant_role(user_id, pid, role) for pid in plant_ids]
    else:
        user.plant_roles = []

    return user


@pytest.mark.asyncio
async def test_create_cli_token_basic(async_session: AsyncSession):
    """Any authenticated user can create a CLI token (defaults to read-only)."""
    from cassini.api.v1.cli_auth import CLI_TOKEN_PREFIX, CLITokenRequest, create_cli_token

    user = _make_user(user_id=1, username="alice", plant_ids=[10, 20])

    # Build a mock request with audit_context support
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    data = CLITokenRequest(label="my-workstation", expires_in_days=30)

    result = await create_cli_token(
        request=mock_request,
        data=data,
        session=async_session,
        current_user=user,
    )

    # Key is returned and starts with the standard prefix
    assert result.key.startswith("cassini_")
    assert result.key_id  # non-empty UUID
    assert result.name == f"{CLI_TOKEN_PREFIX}alice-my-workstation"
    assert result.plant_ids == [10, 20]
    assert result.revoked_previous == 0
    assert result.scope == "read-only"

    # Verify the API key was persisted with read-only scope by default (A6-H1)
    stmt = select(APIKey).where(APIKey.id == result.key_id)
    db_result = await async_session.execute(stmt)
    api_key = db_result.scalar_one()
    assert api_key.is_active is True
    assert api_key.scope == "read-only"
    assert api_key.plant_ids == [10, 20]
    # Verify the plain key matches the stored hash
    assert APIKeyAuth.verify_key(result.key, api_key.key_hash)


@pytest.mark.asyncio
async def test_cli_token_scoped_to_user_plants(async_session: AsyncSession):
    """Token should be scoped to the user's assigned plant IDs."""
    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(user_id=2, username="bob", plant_ids=[5, 15, 25])
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    data = CLITokenRequest()
    result = await create_cli_token(
        request=mock_request,
        data=data,
        session=async_session,
        current_user=user,
    )

    assert result.plant_ids == [5, 15, 25]


@pytest.mark.asyncio
async def test_cli_token_no_plant_roles(async_session: AsyncSession):
    """User with no plant roles gets an empty plant_ids list."""
    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(user_id=3, username="charlie", plant_ids=None)
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    data = CLITokenRequest()
    result = await create_cli_token(
        request=mock_request,
        data=data,
        session=async_session,
        current_user=user,
    )

    assert result.plant_ids == []


@pytest.mark.asyncio
async def test_creating_new_cli_token_revokes_old(async_session: AsyncSession):
    """Creating a new CLI token revokes all previous CLI tokens for the same user."""
    from cassini.api.v1.cli_auth import CLI_TOKEN_PREFIX, CLITokenRequest, create_cli_token

    user = _make_user(user_id=4, username="diana", plant_ids=[1])
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    data = CLITokenRequest(expires_in_days=30)

    # Create first token
    result1 = await create_cli_token(
        request=mock_request,
        data=data,
        session=async_session,
        current_user=user,
    )
    assert result1.revoked_previous == 0

    # Create second token — should revoke the first
    result2 = await create_cli_token(
        request=mock_request,
        data=data,
        session=async_session,
        current_user=user,
    )
    assert result2.revoked_previous == 1

    # Verify first token is now inactive
    stmt = select(APIKey).where(APIKey.id == result1.key_id)
    db_result = await async_session.execute(stmt)
    old_key = db_result.scalar_one()
    assert old_key.is_active is False

    # New token is still active
    stmt2 = select(APIKey).where(APIKey.id == result2.key_id)
    db_result2 = await async_session.execute(stmt2)
    new_key = db_result2.scalar_one()
    assert new_key.is_active is True


@pytest.mark.asyncio
async def test_cli_token_does_not_revoke_other_users(async_session: AsyncSession):
    """Creating a CLI token for user A should not revoke user B's tokens."""
    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user_a = _make_user(user_id=5, username="alice", plant_ids=[1])
    user_b = _make_user(user_id=6, username="bob", plant_ids=[2])
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    data = CLITokenRequest()

    # Create tokens for both users
    result_a = await create_cli_token(
        request=mock_request, data=data, session=async_session, current_user=user_a,
    )
    result_b = await create_cli_token(
        request=mock_request, data=data, session=async_session, current_user=user_b,
    )

    # Now create a new token for user A
    result_a2 = await create_cli_token(
        request=mock_request, data=data, session=async_session, current_user=user_a,
    )
    assert result_a2.revoked_previous == 1  # Only user A's old token

    # User B's token should still be active
    stmt = select(APIKey).where(APIKey.id == result_b.key_id)
    db_result = await async_session.execute(stmt)
    b_key = db_result.scalar_one()
    assert b_key.is_active is True


@pytest.mark.asyncio
async def test_cli_token_response_includes_plain_key(async_session: AsyncSession):
    """Response must include the plain API key (only shown once)."""
    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(user_id=7, username="eve", plant_ids=[1])
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    data = CLITokenRequest()
    result = await create_cli_token(
        request=mock_request, data=data, session=async_session, current_user=user,
    )

    # The key should be a non-empty string that can be verified against the DB hash
    assert isinstance(result.key, str)
    assert len(result.key) > 20  # cassini_ prefix + random bytes

    # Verify it matches the stored hash
    stmt = select(APIKey).where(APIKey.id == result.key_id)
    db_result = await async_session.execute(stmt)
    api_key = db_result.scalar_one()
    assert APIKeyAuth.verify_key(result.key, api_key.key_hash)


@pytest.mark.asyncio
async def test_cli_token_default_expiry(async_session: AsyncSession):
    """Default expiry should be 30 days (A6-H1: lowered from 90)."""
    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(user_id=8, username="frank", plant_ids=[1])
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    data = CLITokenRequest()  # defaults: expires_in_days=30
    result = await create_cli_token(
        request=mock_request, data=data, session=async_session, current_user=user,
    )

    # Expiry should be roughly 30 days from now
    now = datetime.now(timezone.utc)
    delta = result.expires_at - now
    assert 29 <= delta.days <= 30


@pytest.mark.asyncio
async def test_cli_token_audit_context_set(async_session: AsyncSession):
    """Audit context should be set on the request state."""
    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(user_id=9, username="grace", plant_ids=[1])
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    data = CLITokenRequest()
    await create_cli_token(
        request=mock_request, data=data, session=async_session, current_user=user,
    )

    # Verify audit_context was set
    assert hasattr(mock_request.state, 'audit_context')
    ctx = mock_request.state.audit_context
    assert ctx["resource_type"] == "api_key"
    assert ctx["action"] == "create"
    assert "grace" in ctx["summary"]
