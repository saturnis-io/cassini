"""CLI token default-scope and admin-only-write tests (A6-H1).

Verifies that:
  * Default scope is read-only and any authenticated user can self-issue.
  * Operators / supervisors / engineers cannot self-issue read-write tokens.
  * Admins can self-issue read-write tokens.
  * Default expiry is 30 days (down from 90).
  * Read-write issuance emits the dedicated audit/log event.
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.api_key import APIKey
from cassini.db.models.user import User, UserPlantRole, UserRole


def _make_plant_role(user_id: int, plant_id: int, role: UserRole) -> UserPlantRole:
    pr = UserPlantRole()
    pr.user_id = user_id
    pr.plant_id = plant_id
    pr.role = role
    mock_plant = MagicMock()
    mock_plant.name = f"Plant {plant_id}"
    mock_plant.code = f"P{plant_id}"
    mock_plant.id = plant_id
    pr.plant = mock_plant
    return pr


def _make_user(
    user_id: int,
    username: str,
    plant_ids: list[int],
    role: UserRole,
) -> User:
    """Create a User with a uniform role across all plant assignments."""
    u = User()
    u.id = user_id
    u.username = username
    u.email = f"{username}@example.com"
    u.hashed_password = "fake"
    u.is_active = True
    u.must_change_password = False
    u.full_name = username.title()
    u.password_changed_at = None
    u.failed_login_count = 0
    u.locked_until = None
    u.password_history = None
    u.last_signature_auth_at = None
    u.pending_email = None
    u.roles_locked = False
    u.created_at = datetime.now(timezone.utc)
    u.updated_at = datetime.now(timezone.utc)
    u.plant_roles = [_make_plant_role(user_id, pid, role) for pid in plant_ids]
    return u


@pytest.mark.asyncio
async def test_operator_creates_read_only_token_by_default(async_session: AsyncSession):
    """An operator gets a read-only CLI token by default."""
    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(1, "ophelia", plant_ids=[1], role=UserRole.operator)
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    result = await create_cli_token(
        request=mock_request,
        data=CLITokenRequest(),
        session=async_session,
        current_user=user,
    )
    assert result.scope == "read-only"

    stmt = select(APIKey).where(APIKey.id == result.key_id)
    api_key = (await async_session.execute(stmt)).scalar_one()
    assert api_key.scope == "read-only"
    assert api_key.is_read_only is True


@pytest.mark.asyncio
async def test_operator_cannot_create_read_write_token(async_session: AsyncSession):
    """An operator requesting scope='read-write' is rejected with 403."""
    from fastapi import HTTPException

    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(2, "olivia", plant_ids=[1], role=UserRole.operator)
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        await create_cli_token(
            request=mock_request,
            data=CLITokenRequest(scope="read-write"),
            session=async_session,
            current_user=user,
        )
    assert exc_info.value.status_code == 403
    assert "Admin role required" in exc_info.value.detail


@pytest.mark.asyncio
async def test_engineer_cannot_create_read_write_token(async_session: AsyncSession):
    """Engineers (below admin) also cannot self-issue write-scope tokens."""
    from fastapi import HTTPException

    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(3, "edgar", plant_ids=[1, 2], role=UserRole.engineer)
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        await create_cli_token(
            request=mock_request,
            data=CLITokenRequest(scope="read-write"),
            session=async_session,
            current_user=user,
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_supervisor_cannot_create_read_write_token(async_session: AsyncSession):
    """Supervisors cannot self-issue write-scope tokens either."""
    from fastapi import HTTPException

    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(4, "sven", plant_ids=[1], role=UserRole.supervisor)
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        await create_cli_token(
            request=mock_request,
            data=CLITokenRequest(scope="read-write"),
            session=async_session,
            current_user=user,
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_create_read_write_token(async_session: AsyncSession):
    """An admin can self-issue a read-write CLI token."""
    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(5, "ada", plant_ids=[1, 2], role=UserRole.admin)
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    result = await create_cli_token(
        request=mock_request,
        data=CLITokenRequest(scope="read-write"),
        session=async_session,
        current_user=user,
    )
    assert result.scope == "read-write"

    stmt = select(APIKey).where(APIKey.id == result.key_id)
    api_key = (await async_session.execute(stmt)).scalar_one()
    assert api_key.scope == "read-write"
    assert api_key.is_read_only is False


@pytest.mark.asyncio
async def test_admin_can_still_request_read_only(async_session: AsyncSession):
    """Admins are not forced into read-write; they can take read-only too."""
    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(6, "abe", plant_ids=[1], role=UserRole.admin)
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    result = await create_cli_token(
        request=mock_request,
        data=CLITokenRequest(),  # default scope=read-only
        session=async_session,
        current_user=user,
    )
    assert result.scope == "read-only"


@pytest.mark.asyncio
async def test_default_expiry_is_30_days(async_session: AsyncSession):
    """Default expiry was lowered from 90 to 30 days as part of A6-H1."""
    from cassini.api.v1.cli_auth import (
        DEFAULT_EXPIRES_IN_DAYS,
        CLITokenRequest,
        create_cli_token,
    )

    assert DEFAULT_EXPIRES_IN_DAYS == 30

    user = _make_user(7, "demi", plant_ids=[1], role=UserRole.operator)
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    result = await create_cli_token(
        request=mock_request,
        data=CLITokenRequest(),  # default expires_in_days
        session=async_session,
        current_user=user,
    )

    # Roughly 30 days from now (allow 1 day slack for clock drift)
    now = datetime.now(timezone.utc)
    delta = result.expires_at - now
    assert 29 <= delta.days <= 30


@pytest.mark.asyncio
async def test_max_expiry_still_365_days(async_session: AsyncSession):
    """The 365-day cap is unchanged; values above are validation errors."""
    import pydantic

    from cassini.api.v1.cli_auth import CLITokenRequest

    # Within bound is fine
    req = CLITokenRequest(expires_in_days=365)
    assert req.expires_in_days == 365

    # Above cap raises validation error
    with pytest.raises(pydantic.ValidationError):
        CLITokenRequest(expires_in_days=366)


@pytest.mark.asyncio
async def test_read_write_audit_event_distinct(async_session: AsyncSession):
    """Read-write issuance writes a distinct audit action so it's filterable."""
    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(8, "alex", plant_ids=[1], role=UserRole.admin)
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    await create_cli_token(
        request=mock_request,
        data=CLITokenRequest(scope="read-write"),
        session=async_session,
        current_user=user,
    )

    ctx = mock_request.state.audit_context
    assert ctx["resource_type"] == "api_key"
    assert ctx["action"] == "cli_token_write_scope_issued"
    assert ctx["fields"]["scope"] == "read-write"


@pytest.mark.asyncio
async def test_read_only_audit_event_unchanged(async_session: AsyncSession):
    """Read-only issuance keeps the standard 'create' audit action."""
    from cassini.api.v1.cli_auth import CLITokenRequest, create_cli_token

    user = _make_user(9, "rita", plant_ids=[1], role=UserRole.operator)
    mock_request = MagicMock()
    mock_request.state = MagicMock()

    await create_cli_token(
        request=mock_request,
        data=CLITokenRequest(),
        session=async_session,
        current_user=user,
    )

    ctx = mock_request.state.audit_context
    assert ctx["action"] == "create"
    assert ctx["fields"]["scope"] == "read-only"
