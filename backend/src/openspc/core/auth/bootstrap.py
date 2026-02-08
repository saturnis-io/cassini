"""Admin user bootstrap for initial system setup.

Creates a default admin user on startup if no users exist in the database.
Configurable via environment variables for production deployments.
"""

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.core.auth.passwords import hash_password
from openspc.core.config import get_settings
from openspc.db.models.plant import Plant
from openspc.db.models.user import User, UserPlantRole, UserRole

logger = logging.getLogger(__name__)


async def bootstrap_admin_user(session: AsyncSession) -> None:
    """Create an admin user if no users exist in the database.

    This function is idempotent - safe to call on every startup.
    It only creates a user when the user table is empty.

    Args:
        session: Active async database session.
    """
    # Check if any users exist
    stmt = select(func.count(User.id))
    result = await session.execute(stmt)
    user_count = result.scalar_one()

    if user_count > 0:
        return

    # Read configuration from centralized settings
    cfg = get_settings()
    username = cfg.admin_username
    password = cfg.admin_password

    if not password:
        logger.critical(
            "OPENSPC_ADMIN_PASSWORD is not set. Skipping admin bootstrap. "
            "Set the environment variable to create an initial admin user."
        )
        return

    # Hash the password
    hashed = hash_password(password)

    # Create the admin user
    admin_user = User(
        username=username,
        hashed_password=hashed,
        is_active=True,
    )
    session.add(admin_user)
    await session.flush()

    # Assign admin role for ALL existing plants (admin has global access)
    stmt = select(Plant).where(Plant.is_active == True)  # noqa: E712
    result = await session.execute(stmt)
    all_plants = result.scalars().all()

    if all_plants:
        for plant in all_plants:
            role_assignment = UserPlantRole(
                user_id=admin_user.id,
                plant_id=plant.id,
                role=UserRole.admin,
            )
            session.add(role_assignment)
        logger.info(f"Admin user assigned to {len(all_plants)} plant(s)")
    else:
        logger.warning("No plants found - admin user created without plant assignment")

    await session.commit()

    logger.info(f"Bootstrap admin user '{username}' created")
