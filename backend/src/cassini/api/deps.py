"""FastAPI dependency injection functions.

Provides database sessions, repository instances, and auth dependencies for API endpoints.
"""

from collections.abc import AsyncGenerator
from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.alerts.manager import AlertManager
from cassini.core.auth.roles import ROLE_HIERARCHY, get_user_role_level_for_plant
from cassini.core.licensing import LicenseService
from cassini.db.database import get_session
from cassini.db.models.user import User, UserPlantRole, UserRole
from cassini.db.repositories.characteristic import CharacteristicRepository
from cassini.db.repositories.hierarchy import HierarchyRepository
from cassini.db.repositories.sample import SampleRepository
from cassini.db.repositories.user import UserRepository
from cassini.db.repositories.violation import ViolationRepository


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

    from cassini.core.auth.jwt import verify_access_token

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

    # JWT revocation: reject tokens issued before last password change
    pwd_changed_claim = payload.get("pwd_changed")
    if user.password_changed_at and pwd_changed_claim is not None:
        user_pwd_epoch = int(user.password_changed_at.timestamp())
        if pwd_changed_claim < user_pwd_epoch:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalidated by password change",
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
# get_user_role_level_for_plant is imported from core.auth.roles above


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
        from cassini.core.auth.jwt import verify_access_token as _verify_access

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
            from cassini.core.auth.api_key import verify_api_key

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
    """Resolve the plant_id that a characteristic belongs to via hierarchy.

    Child hierarchy nodes (Line, Equipment, Cell) may have plant_id=NULL.
    This function walks up the hierarchy tree via parent_id until it finds
    a node with plant_id set.
    """
    from sqlalchemy import select as sa_select

    from cassini.db.models.characteristic import Characteristic
    from cassini.db.models.hierarchy import Hierarchy

    # First, get the hierarchy_id for the characteristic
    char_row = (
        await session.execute(
            sa_select(Characteristic.hierarchy_id).where(
                Characteristic.id == characteristic_id
            )
        )
    ).scalar_one_or_none()

    if char_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {characteristic_id} not found",
        )

    hierarchy_id = char_row

    # Walk up the hierarchy tree to find the plant_id
    # Max depth of 20 prevents infinite loops from bad data
    for _ in range(20):
        row = (
            await session.execute(
                sa_select(Hierarchy.plant_id, Hierarchy.parent_id).where(
                    Hierarchy.id == hierarchy_id
                )
            )
        ).one_or_none()

        if row is None:
            break

        if row.plant_id is not None:
            return row.plant_id

        # Move to parent node
        if row.parent_id is None:
            break
        hierarchy_id = row.parent_id

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Could not resolve plant for characteristic {characteristic_id}",
    )


def get_license_service(request: Request) -> LicenseService:
    """Get the LicenseService from app state."""
    return request.app.state.license_service
