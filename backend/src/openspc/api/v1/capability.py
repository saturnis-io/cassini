"""Process capability API endpoints.

Provides calculation, history retrieval, and snapshot persistence
for process capability indices (Cp, Cpk, Pp, Ppk, Cpm).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import (
    get_current_engineer,
    get_current_user,
    get_db_session,
    resolve_plant_id_for_characteristic,
    check_plant_role,
)
from openspc.core.capability import CapabilityResult, calculate_capability
from openspc.db.models.characteristic import Characteristic
from openspc.db.models.user import User
from openspc.db.repositories.capability import CapabilityHistoryRepository
from openspc.db.repositories.sample import SampleRepository

router = APIRouter(prefix="/api/v1/characteristics", tags=["capability"])


# ---- Pydantic response schemas ----

class CapabilityResponse(BaseModel):
    """Response schema for a capability calculation."""
    cp: float | None = None
    cpk: float | None = None
    pp: float | None = None
    ppk: float | None = None
    cpm: float | None = None
    sample_count: int
    normality_p_value: float | None = None
    normality_test: str
    is_normal: bool
    calculated_at: str
    usl: float | None = None
    lsl: float | None = None
    target: float | None = None
    sigma_within: float | None = None


class CapabilityHistoryItem(BaseModel):
    """Response schema for a single history snapshot."""
    id: int
    cp: float | None = None
    cpk: float | None = None
    pp: float | None = None
    ppk: float | None = None
    cpm: float | None = None
    sample_count: int
    normality_p_value: float | None = None
    normality_test: str | None = None
    calculated_at: str
    calculated_by: str


class SnapshotResponse(BaseModel):
    """Response after saving a capability snapshot."""
    id: int
    capability: CapabilityResponse


# ---- Helper to load characteristic + extract measurement values ----

async def _get_char_and_values(
    char_id: int,
    session: AsyncSession,
    window_size: int = 1000,
) -> tuple[Characteristic, list[float], float | None]:
    """Load the characteristic and extract individual measurement values.

    Returns:
        Tuple of (characteristic, flat_values, sigma_within).
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    # Load characteristic
    stmt = select(Characteristic).where(Characteristic.id == char_id)
    result = await session.execute(stmt)
    characteristic = result.scalar_one_or_none()
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    # Only variable charts support capability analysis
    if characteristic.data_type == "attribute":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Capability analysis is not supported for attribute charts",
        )

    # Get sample data (pre-extracted to avoid lazy loading)
    sample_repo = SampleRepository(session)
    sample_data = await sample_repo.get_rolling_window_data(
        char_id=char_id,
        window_size=window_size,
        exclude_excluded=True,
    )

    # Flatten all individual measurements
    all_values: list[float] = []
    for sd in sample_data:
        all_values.extend(sd["values"])

    if len(all_values) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient measurement data: {len(all_values)} values (minimum 2 required)",
        )

    # sigma_within from stored control chart parameters
    sigma_within = characteristic.stored_sigma

    return characteristic, all_values, sigma_within


# ---- Endpoints ----

@router.get("/{char_id}/capability", response_model=CapabilityResponse)
async def get_capability(
    char_id: int,
    window_size: int = Query(1000, ge=10, le=10000, description="Number of recent samples to use"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> CapabilityResponse:
    """Calculate current process capability from stored samples.

    Returns Cp, Cpk, Pp, Ppk, Cpm indices along with normality test results.
    Requires at least one specification limit (USL or LSL) on the characteristic.
    """
    characteristic, values, sigma_within = await _get_char_and_values(
        char_id, session, window_size
    )

    if characteristic.usl is None and characteristic.lsl is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one specification limit (USL or LSL) must be set on the characteristic",
        )

    result = calculate_capability(
        values=values,
        usl=characteristic.usl,
        lsl=characteristic.lsl,
        target=characteristic.target_value,
        sigma_within=sigma_within,
    )

    return CapabilityResponse(
        cp=result.cp,
        cpk=result.cpk,
        pp=result.pp,
        ppk=result.ppk,
        cpm=result.cpm,
        sample_count=result.sample_count,
        normality_p_value=result.normality_p_value,
        normality_test=result.normality_test,
        is_normal=result.is_normal,
        calculated_at=result.calculated_at.isoformat(),
        usl=characteristic.usl,
        lsl=characteristic.lsl,
        target=characteristic.target_value,
        sigma_within=sigma_within,
    )


@router.get("/{char_id}/capability/history", response_model=list[CapabilityHistoryItem])
async def get_capability_history(
    char_id: int,
    limit: int = Query(50, ge=1, le=200, description="Number of history snapshots to return"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[CapabilityHistoryItem]:
    """Get saved capability snapshots for trend display.

    Returns snapshots ordered by calculated_at descending (most recent first).
    """
    repo = CapabilityHistoryRepository(session)
    snapshots = await repo.get_history(char_id, limit=limit)

    return [
        CapabilityHistoryItem(
            id=s.id,
            cp=s.cp,
            cpk=s.cpk,
            pp=s.pp,
            ppk=s.ppk,
            cpm=s.cpm,
            sample_count=s.sample_count,
            normality_p_value=s.normality_p_value,
            normality_test=s.normality_test,
            calculated_at=s.calculated_at.isoformat(),
            calculated_by=s.calculated_by,
        )
        for s in snapshots
    ]


@router.post(
    "/{char_id}/capability/snapshot",
    response_model=SnapshotResponse,
    status_code=status.HTTP_201_CREATED,
)
async def save_capability_snapshot(
    char_id: int,
    window_size: int = Query(1000, ge=10, le=10000, description="Number of recent samples to use"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> SnapshotResponse:
    """Calculate capability and save as a history snapshot.

    Requires engineer or higher role. The snapshot is persisted for
    trend tracking over time.
    """
    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    characteristic, values, sigma_within = await _get_char_and_values(
        char_id, session, window_size
    )

    if characteristic.usl is None and characteristic.lsl is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one specification limit (USL or LSL) must be set on the characteristic",
        )

    result = calculate_capability(
        values=values,
        usl=characteristic.usl,
        lsl=characteristic.lsl,
        target=characteristic.target_value,
        sigma_within=sigma_within,
    )

    # Persist snapshot
    repo = CapabilityHistoryRepository(session)
    snapshot = await repo.create_from_result(
        characteristic_id=char_id,
        result=result,
        calculated_by=user.username,
    )
    await session.commit()

    return SnapshotResponse(
        id=snapshot.id,
        capability=CapabilityResponse(
            cp=result.cp,
            cpk=result.cpk,
            pp=result.pp,
            ppk=result.ppk,
            cpm=result.cpm,
            sample_count=result.sample_count,
            normality_p_value=result.normality_p_value,
            normality_test=result.normality_test,
            is_normal=result.is_normal,
            calculated_at=result.calculated_at.isoformat(),
            usl=characteristic.usl,
            lsl=characteristic.lsl,
            target=characteristic.target_value,
            sigma_within=sigma_within,
        ),
    )
