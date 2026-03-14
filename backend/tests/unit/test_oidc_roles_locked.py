"""Unit tests for the SSO role lock flag.

Verifies that when a user has roles_locked=True, the OIDC service
skips role mapping on SSO login, preserving manually-assigned roles.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from cassini.core.oidc_service import OIDCService
from cassini.db.models.user import User, UserPlantRole, UserRole


def _make_user(
    user_id: int = 1,
    username: str = "testuser",
    roles_locked: bool = False,
    plant_roles: list[tuple[int, str]] | None = None,
) -> MagicMock:
    """Create a mock User with optional plant roles."""
    user = MagicMock(spec=User)
    user.id = user_id
    user.username = username
    user.email = f"{username}@example.com"
    user.is_active = True
    user.roles_locked = roles_locked
    user.hashed_password = "hashed"
    user.password_changed_at = None
    roles = []
    for plant_id, role_name in (plant_roles or []):
        pr = MagicMock(spec=UserPlantRole)
        pr.plant_id = plant_id
        pr.role = UserRole(role_name)
        roles.append(pr)
    user.plant_roles = roles
    return user


def _make_oidc_config(
    role_mapping: dict | None = None,
    default_role: str = "operator",
) -> MagicMock:
    """Create a mock OIDCConfig."""
    config = MagicMock()
    config.id = 1
    config.name = "TestIdP"
    config.role_mapping_dict = role_mapping or {}
    config.default_role = default_role
    config.auto_provision = True
    return config


class TestRolesLocked:
    """Tests for the roles_locked flag behavior in OIDC role mapping."""

    @pytest.mark.asyncio
    async def test_roles_locked_skips_role_mapping(self):
        """When roles_locked=True, _apply_role_mapping should return early
        without modifying any roles."""
        session = AsyncMock()
        service = OIDCService(session)

        user = _make_user(
            roles_locked=True,
            plant_roles=[(1, "engineer")],
        )
        config = _make_oidc_config(
            role_mapping={"admin_group": "admin"},
        )
        user_info = {"sub": "oidc-123", "groups": ["admin_group"]}

        # Patch assign_plant_role to track if it gets called
        service.user_repo = MagicMock()
        service.user_repo.assign_plant_role = AsyncMock()

        await service._apply_role_mapping(user, user_info, config)

        # Role assignment should NOT have been called
        service.user_repo.assign_plant_role.assert_not_called()

    @pytest.mark.asyncio
    async def test_roles_unlocked_applies_role_mapping(self):
        """When roles_locked=False, _apply_role_mapping should apply
        the IdP's role mapping normally."""
        session = AsyncMock()
        service = OIDCService(session)

        user = _make_user(
            roles_locked=False,
            plant_roles=[(1, "operator")],
        )
        config = _make_oidc_config(
            role_mapping={"admin_group": "admin"},
        )
        user_info = {"sub": "oidc-123", "groups": ["admin_group"]}

        # Mock the Plant query to return a single plant
        mock_plant = MagicMock()
        mock_plant.id = 1
        mock_plant.is_active = True

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_plant]
        session.execute = AsyncMock(return_value=mock_result)
        session.flush = AsyncMock()

        service.user_repo = MagicMock()
        service.user_repo.assign_plant_role = AsyncMock()

        await service._apply_role_mapping(user, user_info, config)

        # Role assignment SHOULD have been called
        service.user_repo.assign_plant_role.assert_called_once_with(
            user.id, 1, UserRole.admin
        )

    @pytest.mark.asyncio
    async def test_roles_locked_preserves_existing_roles(self):
        """Verify that a locked user's existing engineer role is not
        downgraded to operator when the IdP maps to operator."""
        session = AsyncMock()
        service = OIDCService(session)

        user = _make_user(
            roles_locked=True,
            plant_roles=[(1, "engineer"), (2, "supervisor")],
        )
        config = _make_oidc_config(
            role_mapping={"operators": "operator"},
        )
        user_info = {"sub": "oidc-456", "groups": ["operators"]}

        service.user_repo = MagicMock()
        service.user_repo.assign_plant_role = AsyncMock()

        await service._apply_role_mapping(user, user_info, config)

        # No role changes should have been made
        service.user_repo.assign_plant_role.assert_not_called()
        # Original roles should still be intact on the user object
        assert len(user.plant_roles) == 2
        assert user.plant_roles[0].role == UserRole.engineer
        assert user.plant_roles[1].role == UserRole.supervisor

    @pytest.mark.asyncio
    async def test_provision_user_respects_roles_locked_on_existing_user(self):
        """When an existing user with roles_locked=True logs in via SSO,
        provision_user should find them but NOT apply role mapping."""
        session = AsyncMock()
        service = OIDCService(session)

        locked_user = _make_user(
            user_id=42,
            username="locked_engineer",
            roles_locked=True,
            plant_roles=[(1, "engineer")],
        )

        config = _make_oidc_config(
            role_mapping={"admin_group": "admin"},
        )
        user_info = {
            "sub": "oidc-locked-user",
            "email": "locked_engineer@example.com",
            "groups": ["admin_group"],
        }

        # Mock account link lookup to find the user
        service.state_repo = MagicMock()
        account_link = MagicMock()
        account_link.user_id = 42
        service.state_repo.get_by_subject = AsyncMock(return_value=account_link)

        service.user_repo = MagicMock()
        service.user_repo.get_by_id = AsyncMock(return_value=locked_user)
        service.user_repo.assign_plant_role = AsyncMock()

        result = await service.provision_user(user_info, config)

        assert result.id == 42
        # Role assignment should NOT have been called
        service.user_repo.assign_plant_role.assert_not_called()
