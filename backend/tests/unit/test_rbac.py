"""Unit tests for plant-scoped RBAC functions.

Tests for check_plant_role() and get_user_role_level_for_plant() from deps.py.
"""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from openspc.api.deps import (
    ROLE_HIERARCHY,
    check_plant_role,
    get_user_role_level_for_plant,
)
from openspc.db.models.user import UserRole


def _make_user(plant_roles: list[tuple[int, str]]) -> MagicMock:
    """Create a mock User with the given plant_roles.

    Args:
        plant_roles: List of (plant_id, role_name) tuples.
    """
    user = MagicMock()
    roles = []
    for plant_id, role_name in plant_roles:
        pr = MagicMock()
        pr.plant_id = plant_id
        pr.role = UserRole(role_name)
        roles.append(pr)
    user.plant_roles = roles
    return user


class TestGetUserRoleLevelForPlant:
    """Tests for get_user_role_level_for_plant()."""

    def test_returns_zero_for_no_roles(self):
        user = _make_user([])
        assert get_user_role_level_for_plant(user, 1) == 0

    def test_returns_role_level_for_matching_plant(self):
        user = _make_user([(1, "operator"), (2, "engineer")])
        assert get_user_role_level_for_plant(user, 1) == ROLE_HIERARCHY["operator"]
        assert get_user_role_level_for_plant(user, 2) == ROLE_HIERARCHY["engineer"]

    def test_returns_zero_for_unassigned_plant(self):
        user = _make_user([(1, "operator")])
        assert get_user_role_level_for_plant(user, 999) == 0

    def test_admin_at_any_plant_implies_admin_everywhere(self):
        user = _make_user([(1, "admin")])
        # Even for plant 999 where user has no explicit assignment
        assert get_user_role_level_for_plant(user, 999) == ROLE_HIERARCHY["admin"]

    def test_highest_role_wins_for_same_plant(self):
        # If user has multiple roles at same plant, highest should win
        user = _make_user([(1, "operator"), (1, "supervisor")])
        assert get_user_role_level_for_plant(user, 1) == ROLE_HIERARCHY["supervisor"]


class TestCheckPlantRole:
    """Tests for check_plant_role()."""

    def test_passes_when_user_has_sufficient_role(self):
        user = _make_user([(1, "engineer")])
        # Should not raise
        check_plant_role(user, 1, "operator")
        check_plant_role(user, 1, "engineer")

    def test_raises_403_when_insufficient_role(self):
        user = _make_user([(1, "operator")])
        with pytest.raises(HTTPException) as exc_info:
            check_plant_role(user, 1, "supervisor")
        assert exc_info.value.status_code == 403

    def test_raises_403_for_wrong_plant(self):
        user = _make_user([(1, "supervisor")])
        with pytest.raises(HTTPException) as exc_info:
            check_plant_role(user, 2, "supervisor")
        assert exc_info.value.status_code == 403

    def test_admin_passes_for_any_plant(self):
        user = _make_user([(1, "admin")])
        # Admin at plant 1 should pass for any plant
        check_plant_role(user, 999, "supervisor")
        check_plant_role(user, 999, "admin")

    def test_raises_403_for_no_roles(self):
        user = _make_user([])
        with pytest.raises(HTTPException) as exc_info:
            check_plant_role(user, 1, "operator")
        assert exc_info.value.status_code == 403
