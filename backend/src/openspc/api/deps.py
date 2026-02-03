"""FastAPI dependency injection functions.

Provides database sessions and repository instances for API endpoints.
"""

from collections.abc import AsyncGenerator

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.core.alerts.manager import AlertManager
from openspc.db.database import get_session
from openspc.db.repositories.characteristic import CharacteristicRepository
from openspc.db.repositories.hierarchy import HierarchyRepository
from openspc.db.repositories.sample import SampleRepository
from openspc.db.repositories.violation import ViolationRepository


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
