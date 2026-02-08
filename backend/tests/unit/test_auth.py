"""Unit tests for authentication edge cases.

Tests for JWT token validation, expired tokens, missing tokens, and
role-checking dependencies.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from openspc.api.deps import ROLE_HIERARCHY
from openspc.db.models.user import UserRole


def _make_user(
    user_id: int = 1,
    is_active: bool = True,
    plant_roles: list[tuple[int, str]] | None = None,
) -> MagicMock:
    """Create a mock User."""
    user = MagicMock()
    user.id = user_id
    user.is_active = is_active
    roles = []
    for plant_id, role_name in (plant_roles or []):
        pr = MagicMock()
        pr.plant_id = plant_id
        pr.role = UserRole(role_name)
        roles.append(pr)
    user.plant_roles = roles
    return user


class TestGetCurrentUser:
    """Tests for get_current_user dependency."""

    @pytest.mark.asyncio
    async def test_missing_auth_header_raises_401(self):
        from openspc.api.deps import get_current_user

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(authorization=None, session=AsyncMock())
        assert exc_info.value.status_code == 401
        assert "Not authenticated" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_malformed_auth_header_raises_401(self):
        from openspc.api.deps import get_current_user

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(authorization="Token abc123", session=AsyncMock())
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_token_raises_401(self):
        from openspc.api.deps import get_current_user

        with patch("openspc.core.auth.jwt.verify_access_token", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(
                    authorization="Bearer invalid_token", session=AsyncMock()
                )
            assert exc_info.value.status_code == 401
            assert "Invalid or expired" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_inactive_user_raises_401(self):
        from openspc.api.deps import get_current_user

        inactive_user = _make_user(is_active=False)
        mock_repo = MagicMock()
        mock_repo.get_by_id = AsyncMock(return_value=inactive_user)

        with (
            patch(
                "openspc.core.auth.jwt.verify_access_token",
                return_value={"sub": "1"},
            ),
            patch("openspc.api.deps.UserRepository", return_value=mock_repo),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(
                    authorization="Bearer valid_token", session=AsyncMock()
                )
            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_nonexistent_user_raises_401(self):
        from openspc.api.deps import get_current_user

        mock_repo = MagicMock()
        mock_repo.get_by_id = AsyncMock(return_value=None)

        with (
            patch(
                "openspc.core.auth.jwt.verify_access_token",
                return_value={"sub": "1"},
            ),
            patch("openspc.api.deps.UserRepository", return_value=mock_repo),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(
                    authorization="Bearer valid_token", session=AsyncMock()
                )
            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_valid_token_returns_user(self):
        from openspc.api.deps import get_current_user

        active_user = _make_user(user_id=42, is_active=True, plant_roles=[(1, "operator")])
        mock_repo = MagicMock()
        mock_repo.get_by_id = AsyncMock(return_value=active_user)

        with (
            patch(
                "openspc.core.auth.jwt.verify_access_token",
                return_value={"sub": "42"},
            ),
            patch("openspc.api.deps.UserRepository", return_value=mock_repo),
        ):
            user = await get_current_user(
                authorization="Bearer valid_token", session=AsyncMock()
            )
            assert user.id == 42


class TestRequireRole:
    """Tests for require_role() dependency factory."""

    @pytest.mark.asyncio
    async def test_sufficient_role_passes(self):
        from openspc.api.deps import require_role

        user = _make_user(plant_roles=[(1, "admin")])
        check_fn = require_role("supervisor")
        result = await check_fn(user=user)
        assert result is user

    @pytest.mark.asyncio
    async def test_insufficient_role_raises_403(self):
        from openspc.api.deps import require_role

        user = _make_user(plant_roles=[(1, "operator")])
        check_fn = require_role("engineer")
        with pytest.raises(HTTPException) as exc_info:
            await check_fn(user=user)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_no_roles_raises_403(self):
        from openspc.api.deps import require_role

        user = _make_user(plant_roles=[])
        check_fn = require_role("operator")
        with pytest.raises(HTTPException) as exc_info:
            await check_fn(user=user)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_exact_role_passes(self):
        from openspc.api.deps import require_role

        user = _make_user(plant_roles=[(1, "supervisor")])
        check_fn = require_role("supervisor")
        result = await check_fn(user=user)
        assert result is user


class TestGetCurrentAdmin:
    """Tests for get_current_admin dependency."""

    @pytest.mark.asyncio
    async def test_admin_passes(self):
        from openspc.api.deps import get_current_admin

        user = _make_user(plant_roles=[(1, "admin")])
        result = await get_current_admin(user=user)
        assert result is user

    @pytest.mark.asyncio
    async def test_non_admin_raises_403(self):
        from openspc.api.deps import get_current_admin

        user = _make_user(plant_roles=[(1, "engineer")])
        with pytest.raises(HTTPException) as exc_info:
            await get_current_admin(user=user)
        assert exc_info.value.status_code == 403


class TestGetCurrentEngineer:
    """Tests for get_current_engineer dependency."""

    @pytest.mark.asyncio
    async def test_engineer_passes(self):
        from openspc.api.deps import get_current_engineer

        user = _make_user(plant_roles=[(1, "engineer")])
        result = await get_current_engineer(user=user)
        assert result is user

    @pytest.mark.asyncio
    async def test_operator_raises_403(self):
        from openspc.api.deps import get_current_engineer

        user = _make_user(plant_roles=[(1, "operator")])
        with pytest.raises(HTTPException) as exc_info:
            await get_current_engineer(user=user)
        assert exc_info.value.status_code == 403
