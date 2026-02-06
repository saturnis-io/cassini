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


async def get_user_repo(
    session: AsyncSession = Depends(get_session),
) -> UserRepository:
    """Get user repository instance."""
    return UserRepository(session)


async def get_current_user(
    authorization: Optional[str] = Header(None),
    session: AsyncSession = Depends(get_session),
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
    """Require the current user to be an admin at any plant.

    Args:
        user: Current authenticated user.

    Returns:
        The user if they are admin at any plant.

    Raises:
        HTTPException: 403 if user is not admin anywhere.
    """
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
    """Require the current user to be at least engineer at any plant.

    Args:
        user: Current authenticated user.

    Returns:
        The user if they have engineer+ role at any plant.

    Raises:
        HTTPException: 403 if insufficient privileges.
    """
    for pr in user.plant_roles:
        if ROLE_HIERARCHY.get(pr.role.value, 0) >= ROLE_HIERARCHY["engineer"]:
            return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Engineer or higher privileges required",
    )


def require_role(min_role: str):
    """Factory that returns a dependency checking if user has >= min_role at any plant.

    Args:
        min_role: Minimum role required (operator/supervisor/engineer/admin).

    Returns:
        FastAPI dependency function.
    """
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


async def get_current_user_or_api_key(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_session),
):
    """Dual auth: try JWT first, fall back to API key.

    Returns either a User object (JWT) or an APIKey object (API key).

    Args:
        authorization: Optional Authorization header with Bearer token.
        x_api_key: Optional X-API-Key header.
        session: Database session.

    Returns:
        User or APIKey object.

    Raises:
        HTTPException: 401 if neither auth method succeeds.
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


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session.

    Yields:
        AsyncSession instance for database operations

    Example:
        @router.get("/items")
        async def get_items(session: AsyncSession = Depends(get_db_session)):
            result = await session.execute(select(Item))
            return result.scalars().all()
    """
    async for session in get_session():
        yield session


async def get_hierarchy_repo(
    session: AsyncSession = Depends(get_db_session),
) -> HierarchyRepository:
    """Get hierarchy repository instance.

    Args:
        session: Database session from dependency injection

    Returns:
        HierarchyRepository instance

    Example:
        @router.get("/hierarchy")
        async def get_hierarchies(
            repo: HierarchyRepository = Depends(get_hierarchy_repo)
        ):
            return await repo.get_all()
    """
    return HierarchyRepository(session)


async def get_characteristic_repo(
    session: AsyncSession = Depends(get_db_session),
) -> CharacteristicRepository:
    """Get characteristic repository instance.

    Args:
        session: Database session from dependency injection

    Returns:
        CharacteristicRepository instance

    Example:
        @router.get("/characteristics")
        async def get_characteristics(
            repo: CharacteristicRepository = Depends(get_characteristic_repo)
        ):
            return await repo.get_all()
    """
    return CharacteristicRepository(session)


async def get_violation_repo(
    session: AsyncSession = Depends(get_db_session),
) -> ViolationRepository:
    """Get violation repository instance.

    Args:
        session: Database session from dependency injection

    Returns:
        ViolationRepository instance

    Example:
        @router.get("/violations")
        async def get_violations(
            repo: ViolationRepository = Depends(get_violation_repo)
        ):
            return await repo.get_all()
    """
    return ViolationRepository(session)


async def get_sample_repo(
    session: AsyncSession = Depends(get_db_session),
) -> SampleRepository:
    """Get sample repository instance.

    Args:
        session: Database session from dependency injection

    Returns:
        SampleRepository instance

    Example:
        @router.get("/samples")
        async def get_samples(
            repo: SampleRepository = Depends(get_sample_repo)
        ):
            return await repo.get_all()
    """
    return SampleRepository(session)


async def get_alert_manager(
    request: Request,
    violation_repo: ViolationRepository = Depends(get_violation_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
) -> AlertManager:
    """Get alert manager instance with broadcaster wired.

    Args:
        request: FastAPI request object (for accessing app state)
        violation_repo: Violation repository from dependency injection
        sample_repo: Sample repository from dependency injection

    Returns:
        AlertManager instance with broadcaster as notifier

    Example:
        @router.post("/violations/{violation_id}/acknowledge")
        async def acknowledge(
            violation_id: int,
            manager: AlertManager = Depends(get_alert_manager)
        ):
            return await manager.acknowledge(violation_id, "user", "reason")
    """
    # Create AlertManager instance
    manager = AlertManager(violation_repo, sample_repo)

    # Wire broadcaster as notifier if available in app state
    if hasattr(request.app.state, "broadcaster"):
        manager.add_notifier(request.app.state.broadcaster)

    return manager
