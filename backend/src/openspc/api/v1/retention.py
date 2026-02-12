"""Retention policy REST endpoints for OpenSPC.

Provides CRUD operations for data retention policies with inheritance resolution.
Policies determine how long SPC data is retained per plant, hierarchy node, or characteristic.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import (
    check_plant_role,
    get_current_admin,
    get_current_engineer,
    get_current_user,
    get_db_session,
    resolve_plant_id_for_characteristic,
)
from openspc.api.schemas.retention import (
    EffectiveRetentionResponse,
    NextPurgeResponse,
    PurgeHistoryResponse,
    RetentionOverrideResponse,
    RetentionPolicyResponse,
    RetentionPolicySet,
)
from openspc.db.models.characteristic import Characteristic
from openspc.db.models.hierarchy import Hierarchy
from openspc.db.models.user import User
from openspc.db.repositories.purge_history import PurgeHistoryRepository
from openspc.db.repositories.retention import RetentionRepository

router = APIRouter(prefix="/api/v1/retention", tags=["retention"])


async def get_retention_repo(
    session: AsyncSession = Depends(get_db_session),
) -> RetentionRepository:
    """Dependency to get RetentionRepository instance."""
    return RetentionRepository(session)


# ------------------------------------------------------------------
# Plant-scoping helper: get plant_id from auth context
# ------------------------------------------------------------------


async def _resolve_plant_id(
    plant_id: int | None,
    user: User,
) -> int:
    """Resolve plant_id from query parameter or user context.

    Users must provide a plant_id query parameter since retention is plant-scoped.
    """
    if plant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="plant_id query parameter is required",
        )
    return plant_id


# ------------------------------------------------------------------
# Global default
# ------------------------------------------------------------------


@router.get("/default", response_model=RetentionPolicyResponse | None)
async def get_global_default(
    plant_id: int = Query(..., description="Plant ID"),
    repo: RetentionRepository = Depends(get_retention_repo),
    _user: User = Depends(get_current_user),
) -> RetentionPolicyResponse | None:
    """Get the global default retention policy for a plant.

    Returns null if no explicit default is set (implicit 'forever').
    """
    policy = await repo.get_global_default(plant_id)
    if policy is None:
        return None
    return RetentionPolicyResponse.model_validate(policy)


@router.put("/default", response_model=RetentionPolicyResponse)
async def set_global_default(
    data: RetentionPolicySet,
    plant_id: int = Query(..., description="Plant ID"),
    repo: RetentionRepository = Depends(get_retention_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> RetentionPolicyResponse:
    """Set the global default retention policy for a plant.

    Creates or updates the plant-wide default. Requires engineer+ role.
    """
    check_plant_role(user, plant_id, "engineer")

    policy = await repo.set_global_default(
        plant_id=plant_id,
        retention_type=data.retention_type.value,
        retention_value=data.retention_value,
        retention_unit=data.retention_unit.value if data.retention_unit else None,
    )
    await session.commit()
    return RetentionPolicyResponse.model_validate(policy)


# ------------------------------------------------------------------
# Hierarchy overrides
# ------------------------------------------------------------------


@router.get("/hierarchy/{hierarchy_id}", response_model=RetentionPolicyResponse | None)
async def get_hierarchy_policy(
    hierarchy_id: int,
    repo: RetentionRepository = Depends(get_retention_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> RetentionPolicyResponse | None:
    """Get the retention override for a hierarchy node.

    Returns null if no override is set for this node.
    """
    # Validate hierarchy exists
    hierarchy = (
        await session.execute(
            select(Hierarchy).where(Hierarchy.id == hierarchy_id)
        )
    ).scalar_one_or_none()
    if hierarchy is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hierarchy node {hierarchy_id} not found",
        )

    policy = await repo.get_hierarchy_policy(hierarchy_id)
    if policy is None:
        return None
    return RetentionPolicyResponse.model_validate(policy)


@router.put("/hierarchy/{hierarchy_id}", response_model=RetentionPolicyResponse)
async def set_hierarchy_policy(
    hierarchy_id: int,
    data: RetentionPolicySet,
    repo: RetentionRepository = Depends(get_retention_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> RetentionPolicyResponse:
    """Set a retention override for a hierarchy node. Requires engineer+."""
    hierarchy = (
        await session.execute(
            select(Hierarchy).where(Hierarchy.id == hierarchy_id)
        )
    ).scalar_one_or_none()
    if hierarchy is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hierarchy node {hierarchy_id} not found",
        )

    check_plant_role(user, hierarchy.plant_id, "engineer")

    policy = await repo.set_hierarchy_policy(
        hierarchy_id=hierarchy_id,
        plant_id=hierarchy.plant_id,
        retention_type=data.retention_type.value,
        retention_value=data.retention_value,
        retention_unit=data.retention_unit.value if data.retention_unit else None,
    )
    await session.commit()
    return RetentionPolicyResponse.model_validate(policy)


@router.delete("/hierarchy/{hierarchy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_hierarchy_policy(
    hierarchy_id: int,
    repo: RetentionRepository = Depends(get_retention_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> None:
    """Remove a hierarchy-level retention override. Requires engineer+."""
    hierarchy = (
        await session.execute(
            select(Hierarchy).where(Hierarchy.id == hierarchy_id)
        )
    ).scalar_one_or_none()
    if hierarchy is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hierarchy node {hierarchy_id} not found",
        )

    check_plant_role(user, hierarchy.plant_id, "engineer")

    deleted = await repo.delete_hierarchy_policy(hierarchy_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No retention override for hierarchy node {hierarchy_id}",
        )
    await session.commit()


# ------------------------------------------------------------------
# Characteristic overrides
# ------------------------------------------------------------------


@router.get(
    "/characteristic/{characteristic_id}",
    response_model=RetentionPolicyResponse | None,
)
async def get_characteristic_policy(
    characteristic_id: int,
    repo: RetentionRepository = Depends(get_retention_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> RetentionPolicyResponse | None:
    """Get the retention override for a characteristic.

    Returns null if no override is set for this characteristic.
    """
    characteristic = (
        await session.execute(
            select(Characteristic).where(Characteristic.id == characteristic_id)
        )
    ).scalar_one_or_none()
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {characteristic_id} not found",
        )

    policy = await repo.get_characteristic_policy(characteristic_id)
    if policy is None:
        return None
    return RetentionPolicyResponse.model_validate(policy)


@router.put(
    "/characteristic/{characteristic_id}",
    response_model=RetentionPolicyResponse,
)
async def set_characteristic_policy(
    characteristic_id: int,
    data: RetentionPolicySet,
    repo: RetentionRepository = Depends(get_retention_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> RetentionPolicyResponse:
    """Set a retention override for a characteristic. Requires engineer+."""
    plant_id = await resolve_plant_id_for_characteristic(characteristic_id, session)
    check_plant_role(user, plant_id, "engineer")

    policy = await repo.set_characteristic_policy(
        characteristic_id=characteristic_id,
        plant_id=plant_id,
        retention_type=data.retention_type.value,
        retention_value=data.retention_value,
        retention_unit=data.retention_unit.value if data.retention_unit else None,
    )
    await session.commit()
    return RetentionPolicyResponse.model_validate(policy)


@router.delete(
    "/characteristic/{characteristic_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_characteristic_policy(
    characteristic_id: int,
    repo: RetentionRepository = Depends(get_retention_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> None:
    """Remove a characteristic-level retention override. Requires engineer+."""
    plant_id = await resolve_plant_id_for_characteristic(characteristic_id, session)
    check_plant_role(user, plant_id, "engineer")

    deleted = await repo.delete_characteristic_policy(characteristic_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No retention override for characteristic {characteristic_id}",
        )
    await session.commit()


# ------------------------------------------------------------------
# Effective policy resolution
# ------------------------------------------------------------------


@router.get(
    "/characteristic/{characteristic_id}/effective",
    response_model=EffectiveRetentionResponse,
)
async def get_effective_policy(
    characteristic_id: int,
    repo: RetentionRepository = Depends(get_retention_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> EffectiveRetentionResponse:
    """Resolve the effective retention policy for a characteristic.

    Walks the full inheritance chain: characteristic -> hierarchy ancestors -> global -> default.
    """
    # Validate characteristic exists
    characteristic = (
        await session.execute(
            select(Characteristic).where(Characteristic.id == characteristic_id)
        )
    ).scalar_one_or_none()
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {characteristic_id} not found",
        )

    result = await repo.resolve_effective_policy(characteristic_id)
    return EffectiveRetentionResponse(**result)


# ------------------------------------------------------------------
# List overrides
# ------------------------------------------------------------------


@router.get("/overrides", response_model=list[RetentionOverrideResponse])
async def list_overrides(
    plant_id: int = Query(..., description="Plant ID"),
    repo: RetentionRepository = Depends(get_retention_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[RetentionOverrideResponse]:
    """List all non-global retention overrides for a plant."""
    overrides = await repo.list_overrides(plant_id)

    # Enrich with names
    hierarchy_ids = [o.hierarchy_id for o in overrides if o.hierarchy_id]
    char_ids = [o.characteristic_id for o in overrides if o.characteristic_id]

    hierarchy_names: dict[int, str] = {}
    if hierarchy_ids:
        rows = await session.execute(
            select(Hierarchy.id, Hierarchy.name).where(Hierarchy.id.in_(hierarchy_ids))
        )
        hierarchy_names = dict(rows.all())

    char_names: dict[int, str] = {}
    if char_ids:
        rows = await session.execute(
            select(Characteristic.id, Characteristic.name).where(
                Characteristic.id.in_(char_ids)
            )
        )
        char_names = dict(rows.all())

    results = []
    for override in overrides:
        resp = RetentionOverrideResponse.model_validate(override)
        if override.hierarchy_id:
            resp.hierarchy_name = hierarchy_names.get(override.hierarchy_id)
        if override.characteristic_id:
            resp.characteristic_name = char_names.get(override.characteristic_id)
        results.append(resp)

    return results


# ------------------------------------------------------------------
# Purge activity & manual trigger
# ------------------------------------------------------------------


async def get_purge_history_repo(
    session: AsyncSession = Depends(get_db_session),
) -> PurgeHistoryRepository:
    """Dependency to get PurgeHistoryRepository instance."""
    return PurgeHistoryRepository(session)


@router.get("/activity", response_model=list[PurgeHistoryResponse])
async def get_purge_activity(
    plant_id: int = Query(..., description="Plant ID"),
    limit: int = Query(20, ge=1, le=100),
    repo: PurgeHistoryRepository = Depends(get_purge_history_repo),
    _user: User = Depends(get_current_user),
) -> list[PurgeHistoryResponse]:
    """List recent purge runs for a plant."""
    runs = await repo.list_history(plant_id, limit=limit)
    return [PurgeHistoryResponse.model_validate(r) for r in runs]


@router.get("/next-purge", response_model=NextPurgeResponse)
async def get_next_purge(
    plant_id: int = Query(..., description="Plant ID"),
    request: Request = None,
    repo: PurgeHistoryRepository = Depends(get_purge_history_repo),
    _user: User = Depends(get_current_user),
) -> NextPurgeResponse:
    """Get info about the next scheduled purge run."""
    purge_engine = getattr(request.app.state, "purge_engine", None)
    interval_hours = purge_engine.interval_hours if purge_engine else 24

    last_run = await repo.get_latest(plant_id)
    next_run_at = None
    if last_run and last_run.completed_at:
        next_run_at = last_run.completed_at + timedelta(hours=interval_hours)
    elif last_run and last_run.started_at:
        next_run_at = last_run.started_at + timedelta(hours=interval_hours)

    return NextPurgeResponse(
        next_run_at=next_run_at,
        interval_hours=interval_hours,
        last_run=PurgeHistoryResponse.model_validate(last_run) if last_run else None,
    )


@router.post("/purge", response_model=PurgeHistoryResponse)
async def trigger_purge(
    plant_id: int = Query(..., description="Plant ID"),
    request: Request = None,
    repo: PurgeHistoryRepository = Depends(get_purge_history_repo),
    user: User = Depends(get_current_admin),
) -> PurgeHistoryResponse:
    """Manually trigger a purge for a plant. Admin only."""
    check_plant_role(user, plant_id, "admin")

    purge_engine = getattr(request.app.state, "purge_engine", None)
    if purge_engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Purge engine is not running",
        )

    await purge_engine.run_purge(plant_id)

    # Return the latest run record
    latest = await repo.get_latest(plant_id)
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Purge completed but no history record found",
        )
    return PurgeHistoryResponse.model_validate(latest)
