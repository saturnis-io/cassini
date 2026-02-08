"""FastAPI dependency injection functions.

Provides database sessions, repository instances, and auth dependencies for API endpoints.
"""

from collections.abc import AsyncGenerator
from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.core.alerts.manager import AlertManager
from openspc.db.database import get_session
from openspc.db.models.user import User, UserPlantRole, UserRole
from openspc.db.repositories.characteristic import CharacteristicRepository
from openspc.db.repositories.hierarchy import HierarchyRepository
from openspc.db.repositories.sample import SampleRepository
from openspc.db.repositories.user import UserRepository
from openspc.db.repositories.violation import ViolationRepository

# Role hierarchy for comparison
ROLE_HIERARCHY = {
    "operator": 1,
    "supervisor": 2,
    "engineer": 3,
    "admin": 4,
}


# ---------------------------------------------------------------------------
# Session dependency — single canonical source for all database sessions
# ---------------------------------------------------------------------------
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session.

    This is the canonical session dependency. All repository factories and
    endpoints should use this instead of importing ``get_session`` directly.

    Yields:
        AsyncSession instance for database operations
    """
    async for session in get_session():
        yield session


# ---------------------------------------------------------------------------
# Repository factories
# ---------------------------------------------------------------------------
async def get_user_repo(
    session: AsyncSession = Depends(get_db_session),
) -> UserRepository:
    """Get user repository instance."""
    return UserRepository(session)


async def get_hierarchy_repo(
    session: AsyncSession = Depends(get_db_session),
) -> HierarchyRepository:
    """Get hierarchy repository instance."""
    return HierarchyRepository(session)


async def get_characteristic_repo(
    session: AsyncSession = Depends(get_db_session),
) -> CharacteristicRepository:
    """Get characteristic repository instance."""
    return CharacteristicRepository(session)


async def get_violation_repo(
    session: AsyncSession = Depends(get_db_session),
) -> ViolationRepository:
    """Get violation repository instance."""
    return ViolationRepository(session)


async def get_sample_repo(
    session: AsyncSession = Depends(get_db_session),
) -> SampleRepository:
    """Get sample repository instance."""
    return SampleRepository(session)


async def get_alert_manager(
    request: Request,
    violation_repo: ViolationRepository = Depends(get_violation_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
) -> AlertManager:
    """Get alert manager instance with broadcaster wired."""
    manager = AlertManager(violation_repo, sample_repo)
    if hasattr(request.app.state, "broadcaster"):
        manager.add_notifier(request.app.state.broadcaster)
    return manager


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------
async def get_current_user(
    authorization: Optional[str] = Header(None),
    session: AsyncSession = Depends(get_db_session),
) -> User:
    """Extract and validate the current user from JWT Bearer token.

    Args:
        authorization: Authorization header value.
        session: Database session.

    Returns:
        Authenticated User object with plant_roles loaded.

    Raises:
        HTTPException: 401 if token is invalid, missing, or user not found.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from openspc.core.auth.jwt import verify_access_token

    token = authorization.split(" ", 1)[1]
    payload = verify_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = int(payload["sub"])
    repo = UserRepository(session)
    user = await repo.get_by_id(user_id)

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Require the current user to be an admin at any plant."""
    for pr in user.plant_roles:
        if pr.role == UserRole.admin:
            return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Admin privileges required",
    )


async def get_current_engineer(
    user: User = Depends(get_current_user),
) -> User:
    """Require the current user to be at least engineer at any plant."""
    for pr in user.plant_roles:
        if ROLE_HIERARCHY.get(pr.role.value, 0) >= ROLE_HIERARCHY["engineer"]:
            return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Engineer or higher privileges required",
    )


def require_role(min_role: str):
    """Factory that returns a dependency checking if user has >= min_role at any plant."""
    min_level = ROLE_HIERARCHY.get(min_role, 0)

    async def check_role(user: User = Depends(get_current_user)) -> User:
        for pr in user.plant_roles:
            if ROLE_HIERARCHY.get(pr.role.value, 0) >= min_level:
                return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{min_role} or higher privileges required",
        )

    return check_role


# ---------------------------------------------------------------------------
# Plant-scoped RBAC helpers
# ---------------------------------------------------------------------------
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


def check_plant_role(user: User, plant_id: int, min_role: str) -> None:
    """Verify user has at least min_role for a specific plant. Raises 403 if not."""
    min_level = ROLE_HIERARCHY.get(min_role, 0)
    if get_user_role_level_for_plant(user, plant_id) < min_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{min_role} or higher privileges required for this plant",
        )


async def get_current_user_or_api_key(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_db_session),
):
    """Dual auth: try JWT first, fall back to API key.

    Returns either a User object (JWT) or an APIKey object (API key).
    """
    # Try JWT first
    if authorization and authorization.startswith("Bearer "):
        from openspc.core.auth.jwt import verify_access_token as _verify_access

        token = authorization.split(" ", 1)[1]
        payload = _verify_access(token)
        if payload is not None:
            user_id = int(payload["sub"])
            repo = UserRepository(session)
            user = await repo.get_by_id(user_id)
            if user and user.is_active:
                return user

    # Fall back to API key (lazy import to avoid circular dependency)
    if x_api_key:
        try:
            from openspc.core.auth.api_key import verify_api_key

            api_key = await verify_api_key(x_api_key=x_api_key, session=session)
            return api_key
        except HTTPException:
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def resolve_plant_id_for_characteristic(
    characteristic_id: int,
    session: AsyncSession,
) -> int:
    """Resolve the plant_id that a characteristic belongs to via hierarchy."""
    from sqlalchemy import select as sa_select

    from openspc.db.models.characteristic import Characteristic
    from openspc.db.models.hierarchy import Hierarchy

    row = (
        await session.execute(
            sa_select(Hierarchy.plant_id)
            .join(Characteristic, Characteristic.hierarchy_id == Hierarchy.id)
            .where(Characteristic.id == characteristic_id)
        )
    ).scalar_one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {characteristic_id} not found",
        )
    return row
