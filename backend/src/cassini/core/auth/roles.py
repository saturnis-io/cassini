"""Role hierarchy and plant-scoped role checking utilities.

Canonical location for role constants and helpers used by both core
business logic and the API layer. Avoids upward dependency from core -> api.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cassini.db.models.user import User

# Role hierarchy for comparison — higher number = more privileges
ROLE_HIERARCHY: dict[str, int] = {
    "operator": 1,
    "supervisor": 2,
    "engineer": 3,
    "admin": 4,
}


def get_user_role_level_for_plant(user: User, plant_id: int) -> int:
    """Get the user's effective role level for a specific plant.

    Admin users at any plant are treated as admin everywhere.

    Args:
        user: The authenticated user with plant_roles loaded.
        plant_id: The plant to check authorization for.

    Returns:
        Numeric role level (0 if no role for that plant).
    """
    max_level = 0
    for pr in user.plant_roles:
        level = ROLE_HIERARCHY.get(pr.role.value, 0)
        # Admin at any plant implies admin everywhere
        if level >= ROLE_HIERARCHY["admin"]:
            return level
        if pr.plant_id == plant_id and level > max_level:
            max_level = level
    return max_level
