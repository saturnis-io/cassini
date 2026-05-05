"""Process capability API endpoints.

Provides calculation, history retrieval, and snapshot persistence
for process capability indices (Cp, Cpk, Pp, Ppk, Cpm).
"""

from datetime import datetime
from typing import NamedTuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    get_current_engineer,
    get_current_user,
    get_db_session,
    resolve_plant_id_for_characteristic,
    check_plant_role,
)
from cassini.api.schemas.capability import (
    CapabilityHistoryItem,
    CapabilityResponse,
    SnapshotResponse,
)
from cassini.core.capability import (
    CapabilityResult,
    calculate_capability,
    calculate_capability_async,
    compute_capability_confidence_intervals,
    compute_capability_confidence_intervals_async,
)
from cassini.core.distributions import calculate_capability_nonnormal
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.user import User
from cassini.db.models.violation import Violation
from cassini.db.repositories.capability import CapabilityHistoryRepository
from cassini.db.repositories.sample import SampleRepository

router = APIRouter(prefix="/api/v1/characteristics", tags=["capability"])


# ---- Helper to load characteristic + extract measurement values ----


class CharCapabilityData(NamedTuple):
    """Result of _get_char_and_values.

    Effective spec limits (``eff_usl``, ``eff_lsl``, ``eff_target``) reflect
    any material-specific overrides resolved at request time.  The returned
    ``characteristic`` ORM object is NEVER mutated — callers MUST use the
    effective fields below for any spec-limit-dependent computation.
    Mutating the ORM would auto-flush to the DB and silently overwrite
    canonical spec limits with material overrides (audit C13).
    """

    characteristic: Characteristic
    values: list[float]
    sigma_within: float | None
    subgroup_count: int
    eff_usl: float | None
    eff_lsl: float | None
    eff_target: float | None


async def _get_char_and_values(
    char_id: int,
    session: AsyncSession,
    window_size: int = 1000,
    material_id: int | None = None,
) -> CharCapabilityData:
    """Load the characteristic and extract individual measurement values.

    Args:
        char_id: Characteristic ID
        session: Database session
        window_size: Number of recent samples
        material_id: Optional material for filtering samples and resolving limits

    Returns:
        ``CharCapabilityData`` with the unchanged ORM characteristic, flat
        measurement values, sigma_within, subgroup_count, and effective
        spec limits (USL/LSL/target with material overrides applied).
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
        material_id=material_id,
    )

    # Flatten all individual measurements, tracking subgroup structure
    all_values: list[float] = []
    subgroup_count = len(sample_data)
    for sd in sample_data:
        all_values.extend(sd["values"])

    if len(all_values) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient measurement data: {len(all_values)} values (minimum 2 required)",
        )

    # Resolve effective spec limits and sigma.  Use locals — never mutate
    # the ORM characteristic object.  SQLAlchemy auto-flush would otherwise
    # write material-specific overrides into the canonical characteristic
    # row, silently corrupting global specs (audit C13).
    sigma_within = characteristic.stored_sigma
    eff_usl = characteristic.usl
    eff_lsl = characteristic.lsl
    eff_target = characteristic.target_value

    if material_id:
        from cassini.core.material_resolver import MaterialResolver
        _resolver = MaterialResolver(session)
        _char_defaults = {
            "ucl": characteristic.ucl, "lcl": characteristic.lcl,
            "stored_sigma": characteristic.stored_sigma,
            "stored_center_line": characteristic.stored_center_line,
            "target_value": characteristic.target_value,
            "usl": characteristic.usl, "lsl": characteristic.lsl,
        }
        _resolved = await _resolver.resolve_flat(char_id, material_id, _char_defaults)
        if _resolved["stored_sigma"] is not None:
            sigma_within = _resolved["stored_sigma"]
        if _resolved["usl"] is not None:
            eff_usl = _resolved["usl"]
        if _resolved["lsl"] is not None:
            eff_lsl = _resolved["lsl"]
        if _resolved["target_value"] is not None:
            eff_target = _resolved["target_value"]

    return CharCapabilityData(
        characteristic=characteristic,
        values=all_values,
        sigma_within=sigma_within,
        subgroup_count=subgroup_count,
        eff_usl=eff_usl,
        eff_lsl=eff_lsl,
        eff_target=eff_target,
    )


def _get_cp_unavailable_reason(usl: float | None, lsl: float | None) -> str | None:
    """Cp is undefined for one-sided specs (no spread reference)."""
    if usl is None or lsl is None:
        return "one_sided_spec"
    return None


async def _count_violations_in_window(
    char_id: int,
    session: AsyncSession,
    window_size: int,
) -> int:
    """Count violations for this characteristic within the data window.

    Uses the same sample window as the capability calculation to ensure
    the stability warning reflects the same data range.

    Args:
        char_id: Characteristic ID
        session: Database session
        window_size: Number of recent samples in the capability window

    Returns:
        Count of violations associated with samples in the data window.
    """
    from sqlalchemy import func, select
    from cassini.db.models.sample import Sample

    # Get the sample IDs in the capability data window
    sample_id_subq = (
        select(Sample.id)
        .where(Sample.char_id == char_id)
        .where(Sample.is_excluded == False)
        .order_by(Sample.timestamp.desc())
        .limit(window_size)
    ).subquery()

    count_stmt = (
        select(func.count())
        .select_from(Violation)
        .where(Violation.char_id == char_id)
        .where(Violation.sample_id.in_(select(sample_id_subq.c.id)))
    )

    result = await session.execute(count_stmt)
    return result.scalar_one()


def _infer_sigma_method(characteristic: Characteristic) -> str | None:
    """Infer the sigma method from the characteristic config or subgroup size."""
    if characteristic.stored_sigma is None:
        return None
    if characteristic.sigma_method:
        return characteristic.sigma_method
    if characteristic.subgroup_size == 1:
        return "moving_range"
    elif characteristic.subgroup_size <= 10:
        return "r_bar_d2"
    else:
        return "s_bar_c4"


# ---- Endpoints ----

@router.get("/{char_id}/capability", response_model=CapabilityResponse)
async def get_capability(
    char_id: int,
    window_size: int = Query(1000, ge=10, le=10000, description="Number of recent samples to use"),
    material_id: int | None = Query(None, description="Filter by material for material-specific capability"),
    include_ci: bool = Query(False, description="Include bootstrap confidence intervals (adds ~100-500ms)"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> CapabilityResponse:
    """Calculate current process capability from stored samples.

    Returns Cp, Cpk, Pp, Ppk, Cpm indices along with normality test results.
    Requires at least one specification limit (USL or LSL) on the characteristic.
    """
    data = await _get_char_and_values(
        char_id, session, window_size, material_id=material_id,
    )
    characteristic = data.characteristic
    values = data.values
    sigma_within = data.sigma_within
    subgroup_count = data.subgroup_count
    eff_usl = data.eff_usl
    eff_lsl = data.eff_lsl
    eff_target = data.eff_target

    if eff_usl is None and eff_lsl is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one specification limit (USL or LSL) must be set on the characteristic",
        )

    cp_unavailable_reason = _get_cp_unavailable_reason(eff_usl, eff_lsl)
    sigma_source_within = "within_subgroup" if sigma_within is not None else None
    sigma_method_str = _infer_sigma_method(characteristic)

    # Compute bootstrap confidence intervals if requested
    ci_fields: dict = {}
    if include_ci:
        bootstrap_cis = await compute_capability_confidence_intervals_async(
            measurements=values,
            usl=eff_usl,
            lsl=eff_lsl,
            target=eff_target,
            sigma_within=sigma_within,
        )
        if "cpk" in bootstrap_cis:
            ci_fields["cpk_ci"] = bootstrap_cis["cpk"]
        if "ppk" in bootstrap_cis:
            ci_fields["ppk_ci"] = bootstrap_cis["ppk"]
        if "pp" in bootstrap_cis:
            ci_fields["pp_ci"] = bootstrap_cis["pp"]
        if bootstrap_cis:
            ci_fields["ci_confidence"] = 0.95
            ci_fields["ci_method"] = "bootstrap"
            ci_fields["n_bootstrap"] = 2000

    dist_method = characteristic.distribution_method
    if dist_method and dist_method != "normal":
        import json

        dist_params = None
        if characteristic.distribution_params:
            try:
                dist_params = json.loads(characteristic.distribution_params)
            except json.JSONDecodeError:
                pass

        nn_result = calculate_capability_nonnormal(
            values=values,
            usl=eff_usl,
            lsl=eff_lsl,
            target=eff_target,
            sigma_within=sigma_within,
            method=dist_method,
            distribution_params=dist_params,
        )

        transform_applied = None
        dist_method_applied = nn_result.method
        if nn_result.method == "box_cox":
            lam = getattr(characteristic, 'box_cox_lambda', None)
            if lam is not None:
                transform_applied = f"box_cox_lambda_{lam}"
            else:
                transform_applied = "box_cox"

        return CapabilityResponse(
            cp=nn_result.cp,
            cpk=nn_result.cpk,
            pp=nn_result.pp,
            ppk=nn_result.ppk,
            cpm=nn_result.cpm,
            sample_count=nn_result.sample_count,
            normality_p_value=nn_result.normality_p_value,
            normality_test=nn_result.normality_test,
            is_normal=nn_result.is_normal,
            calculated_at=nn_result.calculated_at.isoformat(),
            usl=eff_usl,
            lsl=eff_lsl,
            target=eff_target,
            sigma_within=sigma_within,
            short_run_mode=characteristic.short_run_mode,
            sigma_source=sigma_source_within,
            sigma_method=sigma_method_str,
            cp_unavailable_reason=cp_unavailable_reason,
            distribution_method_applied=dist_method_applied,
            transform_applied=transform_applied,
            **ci_fields,
        )

    # Pass subgroup structure for correct Cp CI degrees of freedom.
    # ISO 22514-2:2017 §7.2.3: df = k*(m-1) when sigma is within-subgroup.
    result = await calculate_capability_async(
        values=values,
        usl=eff_usl,
        lsl=eff_lsl,
        target=eff_target,
        sigma_within=sigma_within,
        subgroup_count=subgroup_count,
        subgroup_size=characteristic.subgroup_size,
    )

    # Stability warning: count violations in the same data window
    violation_count = await _count_violations_in_window(char_id, session, window_size)
    stability_warning: str | None = None
    if violation_count > 0:
        stability_warning = (
            f"Process may be unstable: {violation_count} violation(s) detected in the "
            f"analysis window. Capability indices assume a stable process. "
            f"AIAG SPC Manual Ch. 3 \u00a73.1"
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
        usl=eff_usl,
        lsl=eff_lsl,
        target=eff_target,
        sigma_within=sigma_within,
        short_run_mode=characteristic.short_run_mode,
        sigma_source=sigma_source_within,
        sigma_method=sigma_method_str,
        cp_unavailable_reason=cp_unavailable_reason,
        distribution_method_applied="normal",
        transform_applied=None,
        z_bench_within=result.z_bench_within,
        z_bench_overall=result.z_bench_overall,
        ppm_within_expected=result.ppm_within_expected,
        ppm_overall_expected=result.ppm_overall_expected,
        stability_warning=stability_warning,
        recent_violation_count=violation_count,
        **ci_fields,
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
    material_id: int | None = Query(None, description="Filter by material for material-specific capability"),
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

    data = await _get_char_and_values(
        char_id, session, window_size, material_id=material_id,
    )
    characteristic = data.characteristic
    values = data.values
    sigma_within = data.sigma_within
    subgroup_count = data.subgroup_count
    eff_usl = data.eff_usl
    eff_lsl = data.eff_lsl
    eff_target = data.eff_target

    if eff_usl is None and eff_lsl is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one specification limit (USL or LSL) must be set on the characteristic",
        )

    # Dispatch to non-normal calculation when distribution_method is configured
    dist_method = getattr(characteristic, 'distribution_method', None)
    if dist_method and dist_method != "normal":
        import json

        dist_params = None
        if characteristic.distribution_params:
            try:
                dist_params = json.loads(characteristic.distribution_params)
            except json.JSONDecodeError:
                pass

        nn_result = calculate_capability_nonnormal(
            values=values,
            usl=eff_usl,
            lsl=eff_lsl,
            target=eff_target,
            sigma_within=sigma_within,
            method=dist_method,
            distribution_params=dist_params,
        )
        # Build a CapabilityResult for snapshot persistence
        result = CapabilityResult(
            cp=nn_result.cp,
            cpk=nn_result.cpk,
            pp=nn_result.pp,
            ppk=nn_result.ppk,
            cpm=nn_result.cpm,
            sample_count=nn_result.sample_count,
            normality_p_value=nn_result.normality_p_value,
            normality_test=nn_result.normality_test,
            is_normal=nn_result.is_normal,
            calculated_at=nn_result.calculated_at,
        )
    else:
        result = await calculate_capability_async(
            values=values,
            usl=eff_usl,
            lsl=eff_lsl,
            target=eff_target,
            sigma_within=sigma_within,
            subgroup_count=subgroup_count,
            subgroup_size=characteristic.subgroup_size,
        )

    # Persist snapshot
    repo = CapabilityHistoryRepository(session)
    snapshot = await repo.create_from_result(
        characteristic_id=char_id,
        result=result,
        calculated_by=user.username,
    )
    await session.commit()

    cp_unavailable_reason = _get_cp_unavailable_reason(eff_usl, eff_lsl)
    sigma_source_within = "within_subgroup" if sigma_within is not None else None
    sigma_method_str = _infer_sigma_method(characteristic)
    dist_method_applied = dist_method if (dist_method and dist_method != "normal") else "normal"
    transform_applied = None
    if dist_method and dist_method == "box_cox":
        lam = getattr(characteristic, 'box_cox_lambda', None)
        transform_applied = f"box_cox_lambda_{lam}" if lam is not None else "box_cox"

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
            usl=eff_usl,
            lsl=eff_lsl,
            target=eff_target,
            sigma_within=sigma_within,
            sigma_source=sigma_source_within,
            sigma_method=sigma_method_str,
            cp_unavailable_reason=cp_unavailable_reason,
            distribution_method_applied=dist_method_applied,
            transform_applied=transform_applied,
        ),
    )
