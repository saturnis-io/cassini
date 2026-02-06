"""Admin user bootstrap for initial system setup.

Creates a default admin user on startup if no users exist in the database.
Configurable via environment variables for production deployments.
"""

import logging
import os

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.core.auth.passwords import hash_password
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

    # Read configuration from environment
    username = os.environ.get("OPENSPC_ADMIN_USERNAME", "admin")
    password = os.environ.get("OPENSPC_ADMIN_PASSWORD", "password")

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

    # Try to assign admin role for the Default plant
    stmt = select(Plant).where(Plant.code == "DEFAULT")
    result = await session.execute(stmt)
    default_plant = result.scalar_one_or_none()

    if default_plant:
        role_assignment = UserPlantRole(
            user_id=admin_user.id,
            plant_id=default_plant.id,
            role=UserRole.admin,
        )
        session.add(role_assignment)
    else:
        logger.warning("Default plant not found - admin user created without plant assignment")

    await session.commit()

    if password == "password":
        logger.warning("Default admin credentials in use - change immediately")

    logger.info(f"Bootstrap admin user '{username}' created")
