"""Characteristic REST endpoints for Cassini.

Provides CRUD operations, chart data, limit recalculation, and rule management
for SPC characteristics.
"""

from datetime import datetime, timezone
from typing import Annotated

import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.api.schemas.characteristic import (
    AttributeChartSample,
    CUSUMChartSample,
    ChangeModeRequest,
    ChangeModeResponse,
    CharacteristicCreate,
    CharacteristicResponse,
    CharacteristicUpdate,
    ChartDataResponse,
    ChartSample,
    ControlLimits,
    ControlLimitsResponse,
    EWMAChartSample,
    NelsonRuleConfig,
    SetLimitsRequest,
    SpecLimits,
    ZoneBoundaries,
)
from cassini.api.deps import (
    check_plant_role,
    get_characteristic_repo,
    get_current_user,
    get_current_engineer,
    get_db_session,
    get_sample_repo,
    resolve_plant_id_for_characteristic,
)
from cassini.api.schemas.common import PaginatedResponse, PaginationParams
from cassini.core.engine.control_limits import ControlLimitService
import json as _json

from cassini.core.engine.nelson_rules import NELSON_RULE_IDS
from cassini.db.models.user import User
from cassini.core.engine.rolling_window import RollingWindowManager
from cassini.db.models.characteristic import Characteristic, CharacteristicRule
from cassini.db.repositories import CharacteristicRepository, SampleRepository

router = APIRouter(prefix="/api/v1/characteristics", tags=["characteristics"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _build_hierarchy_path(hierarchy_repo, hierarchy_id: int) -> str:
    """Build a display path string like 'Plant > Line > Machine' for a hierarchy node."""
    path_parts: list[str] = []
    current_id: int | None = hierarchy_id
    while current_id is not None:
        node = await hierarchy_repo.get_by_id(current_id)
        if node is None:
            break
        path_parts.insert(0, node.name)
        current_id = node.parent_id
    return " > ".join(path_parts) if path_parts else ""


# Dependency for ControlLimitService
async def get_control_limit_service(
    char_repo: CharacteristicRepository = Depends(get_characteristic_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
) -> ControlLimitService:
    """Dependency to get ControlLimitService instance."""
    window_manager = RollingWindowManager(sample_repo)
    return ControlLimitService(sample_repo, char_repo, window_manager)


def _build_list_query(
    *,
    plant_id: int | None = None,
    hierarchy_id: int | None = None,
    provider_type: str | None = None,
    in_control: bool | None = None,
):
    """Build a filtered SELECT for the characteristic list endpoint."""
    stmt = select(Characteristic)

    if plant_id is not None:
        from cassini.db.models.hierarchy import Hierarchy
        stmt = stmt.join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id).where(
            Hierarchy.plant_id == plant_id
        )

    if hierarchy_id is not None:
        stmt = stmt.where(Characteristic.hierarchy_id == hierarchy_id)

    if provider_type is not None:
        from cassini.db.models.data_source import DataSource
        if provider_type.upper() == "MANUAL":
            subq = select(DataSource.characteristic_id)
            stmt = stmt.where(Characteristic.id.notin_(subq))
        else:
            ds_type = provider_type.lower()
            if ds_type == "tag":
                ds_type = "mqtt"
            stmt = stmt.join(
                DataSource, DataSource.characteristic_id == Characteristic.id
            ).where(DataSource.type == ds_type)

    if in_control is not None:
        from cassini.db.models.sample import Sample
        from cassini.db.models.violation import Violation

        # Subquery: latest sample per characteristic
        latest_sample = (
            select(
                Sample.char_id,
                func.max(Sample.id).label("latest_id"),
            )
            .where(Sample.is_excluded.is_(False))
            .group_by(Sample.char_id)
            .subquery()
        )
        # Subquery: characteristics whose latest sample has unacknowledged violations
        has_violations = (
            select(Sample.char_id)
            .join(latest_sample, (Sample.char_id == latest_sample.c.char_id) & (Sample.id == latest_sample.c.latest_id))
            .join(Violation, Violation.sample_id == Sample.id)
            .where(Violation.acknowledged.is_(False))
            .distinct()
            .subquery()
        )

        if in_control:
            stmt = stmt.where(Characteristic.id.notin_(select(has_violations.c.char_id)))
        else:
            stmt = stmt.where(Characteristic.id.in_(select(has_violations.c.char_id)))

    return stmt


@router.get("/", response_model=PaginatedResponse[CharacteristicResponse])
async def list_characteristics(
    hierarchy_id: int | None = Query(None, description="Filter by hierarchy node ID"),
    provider_type: str | None = Query(None, description="Filter by provider type (MANUAL, MQTT, TAG)"),
    plant_id: int | None = Query(None, description="Filter by plant ID"),
    in_control: bool | None = Query(None, description="Filter by in-control status of latest sample"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of items to return"),
    page: int | None = Query(None, ge=1, description="Page number (1-indexed, alternative to offset)"),
    per_page: int | None = Query(None, ge=1, le=1000, description="Items per page (alternative to limit)"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> PaginatedResponse[CharacteristicResponse]:
    """List characteristics with filtering and pagination.

    Supports filtering by hierarchy node, provider type, plant, and in_control status.
    Returns paginated results with total count.

    Accepts both offset/limit and page/per_page pagination styles.
    If page/per_page are provided, they take precedence over offset/limit.
    """
    # Convert page/per_page to offset/limit if provided
    if per_page is not None:
        limit = per_page
    if page is not None:
        offset = (page - 1) * limit

    repo = CharacteristicRepository(session)

    stmt = _build_list_query(
        plant_id=plant_id,
        hierarchy_id=hierarchy_id,
        provider_type=provider_type,
        in_control=in_control,
    )

    # Get total count for pagination
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    # Apply pagination and execute with data_source eager-loaded
    stmt = (
        stmt.offset(offset).limit(limit).order_by(Characteristic.id)
        .options(selectinload(Characteristic.data_source))
    )
    result = await session.execute(stmt)
    characteristics = list(result.scalars().all())

    # Compute sample_count and unacknowledged_violations per characteristic
    if characteristics:
        from cassini.db.models.sample import Sample as SampleModel
        from cassini.db.models.violation import Violation as ViolationModel

        char_ids = [c.id for c in characteristics]

        sample_counts_result = await session.execute(
            select(SampleModel.char_id, func.count(SampleModel.id))
            .where(SampleModel.char_id.in_(char_ids))
            .group_by(SampleModel.char_id)
        )
        sample_count_map = dict(sample_counts_result.all())

        violation_counts_result = await session.execute(
            select(ViolationModel.char_id, func.count(ViolationModel.id))
            .where(ViolationModel.char_id.in_(char_ids), ViolationModel.acknowledged.is_(False))
            .group_by(ViolationModel.char_id)
        )
        violation_count_map = dict(violation_counts_result.all())

        items = []
        for char in characteristics:
            resp = CharacteristicResponse.model_validate(char)
            resp.sample_count = sample_count_map.get(char.id, 0)
            resp.unacknowledged_violations = violation_count_map.get(char.id, 0)
            items.append(resp)
    else:
        items = []

    return PaginatedResponse(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("/", response_model=CharacteristicResponse, status_code=status.HTTP_201_CREATED)
async def create_characteristic(
    data: CharacteristicCreate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> CharacteristicResponse:
    """Create a new characteristic.

    Data source (MQTT, OPC-UA) is configured separately via the tag mapping API.
    """
    repo = CharacteristicRepository(session)

    # Validate hierarchy exists
    from cassini.db.repositories import HierarchyRepository
    hierarchy_repo = HierarchyRepository(session)
    hierarchy = await hierarchy_repo.get_by_id(data.hierarchy_id)
    if hierarchy is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hierarchy node {data.hierarchy_id} not found"
        )

    # Plant-scoped authorization: engineer+ at the owning plant
    check_plant_role(_user, hierarchy.plant_id, "engineer")

    # Create characteristic
    characteristic = await repo.create(**data.model_dump())

    # Initialize Nelson Rules configuration (all enabled by default)
    for rule_id in NELSON_RULE_IDS:
        rule = CharacteristicRule(
            char_id=characteristic.id,
            rule_id=rule_id,
            is_enabled=True,
        )
        session.add(rule)

    await session.commit()

    # Re-load with data_source relationship
    characteristic = await repo.get_with_data_source(characteristic.id)

    return CharacteristicResponse.model_validate(characteristic)


@router.get("/{char_id}", response_model=CharacteristicResponse)
async def get_characteristic(
    char_id: int,
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    _user: User = Depends(get_current_user),
) -> CharacteristicResponse:
    """Get characteristic details by ID."""
    characteristic = await repo.get_with_data_source(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found"
        )

    return CharacteristicResponse.model_validate(characteristic)


@router.patch("/{char_id}", response_model=CharacteristicResponse)
async def update_characteristic(
    char_id: int,
    data: CharacteristicUpdate,
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> CharacteristicResponse:
    """Update characteristic configuration.

    Supports partial updates - only provided fields will be updated.
    Can update control limits (UCL/LCL) after initial calculation.
    """
    # Get existing characteristic
    characteristic = await repo.get_by_id(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found"
        )

    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    # Validate configuration combinations
    update_data = data.model_dump(exclude_unset=True)

    # Resolve effective values (update overrides existing)
    eff_data_type = update_data.get("data_type", characteristic.data_type)
    eff_chart_type = update_data.get("chart_type", characteristic.chart_type)
    eff_attr_chart_type = update_data.get("attribute_chart_type", characteristic.attribute_chart_type)

    if "short_run_mode" in update_data and update_data["short_run_mode"] is not None:
        if eff_data_type == "attribute":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Short-run mode is not supported for attribute characteristics",
            )
        if eff_chart_type in ("cusum", "ewma"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Short-run mode is not supported for CUSUM/EWMA chart types",
            )

    # Reciprocal: changing chart_type to cusum/ewma when short_run_mode is already set
    eff_short_run = update_data.get("short_run_mode", characteristic.short_run_mode)
    if "chart_type" in update_data and update_data["chart_type"] in ("cusum", "ewma"):
        if eff_short_run:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot set CUSUM/EWMA chart type while short-run mode is active. Disable short-run mode first.",
            )

    if "use_laney_correction" in update_data and update_data["use_laney_correction"] is True:
        if eff_attr_chart_type not in ("p", "u"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Laney correction is only supported for p and u charts",
            )

    # Auto-clear Laney correction when attribute_chart_type changes to np or c
    if "attribute_chart_type" in update_data and eff_attr_chart_type in ("np", "c"):
        if characteristic.use_laney_correction:
            update_data["use_laney_correction"] = False

    # Update only provided fields
    for key, value in update_data.items():
        setattr(characteristic, key, value)

    await session.commit()

    # Re-load with data_source relationship
    characteristic = await repo.get_with_data_source(char_id)

    return CharacteristicResponse.model_validate(characteristic)


# TODO: Consider adding soft-delete (deleted_at column) instead of hard delete
# to support audit trails and accidental deletion recovery.
@router.delete("/{char_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_characteristic(
    char_id: int,
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> None:
    """Delete characteristic.

    Returns 404 if characteristic not found.
    Returns 409 if characteristic has samples (cannot delete with data).
    """
    # Get characteristic with samples relationship loaded
    characteristic = await repo.get_by_id(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found"
        )

    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    # Check if characteristic has samples
    sample_repo = SampleRepository(session)
    samples = await sample_repo.get_by_characteristic(char_id)
    if samples:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete characteristic {char_id} with {len(samples)} existing samples"
        )

    # Delete characteristic (will cascade to rules via database)
    await session.delete(characteristic)
    await session.commit()


async def _recalculate_attribute_limits(
    char_id: int,
    characteristic,
    before: dict,
    min_samples: int,
    sample_repo: SampleRepository,
    session: AsyncSession,
) -> dict:
    """Recalculate control limits for an attribute characteristic."""
    from cassini.core.engine.attribute_engine import calculate_attribute_limits

    chart_type = characteristic.attribute_chart_type
    if not chart_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Characteristic has no attribute_chart_type configured",
        )

    # Get attribute samples
    window_data = await sample_repo.get_attribute_rolling_window(
        char_id=char_id,
        window_size=1000,
        exclude_excluded=True,
    )

    if len(window_data) < min_samples:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient samples for calculation: {len(window_data)} < {min_samples}",
        )

    try:
        limits = calculate_attribute_limits(chart_type, window_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Persist to characteristic
    characteristic.ucl = limits.ucl
    characteristic.lcl = limits.lcl
    characteristic.stored_center_line = limits.center_line

    await session.commit()

    return {
        "before": before,
        "after": {
            "ucl": limits.ucl,
            "lcl": limits.lcl,
            "center_line": limits.center_line,
        },
        "calculation": {
            "method": f"attribute_{chart_type}",
            "sigma": None,
            "sample_count": limits.sample_count,
            "excluded_count": 0,
            "calculated_at": limits.calculated_at.isoformat(),
            "start_date": None,
            "end_date": None,
            "last_n": None,
        },
    }


async def _get_attribute_chart_data(
    char_id: int,
    characteristic,
    limit: int,
    sample_repo: SampleRepository,
    session: AsyncSession,
) -> ChartDataResponse:
    """Build chart data response for attribute characteristics."""
    from cassini.core.engine.attribute_engine import (
        calculate_attribute_limits,
        calculate_laney_sigma_z,
        get_per_point_limits,
        get_per_point_limits_laney,
        get_plotted_value,
    )
    from cassini.db.repositories import ViolationRepository
    from cassini.db.models.sample import Sample as SampleModel
    from sqlalchemy import and_

    chart_type = characteristic.attribute_chart_type
    center_line = characteristic.stored_center_line
    char_ucl = characteristic.ucl
    char_lcl = characteristic.lcl
    use_laney = getattr(characteristic, 'use_laney_correction', False) and chart_type in ("p", "u")

    # Get attribute samples as dicts
    window_data = await sample_repo.get_attribute_rolling_window(
        char_id=char_id,
        window_size=limit,
        exclude_excluded=True,
    )

    # Calculate limits from data if not stored
    if center_line is None and len(window_data) >= 2 and chart_type:
        try:
            limits = calculate_attribute_limits(chart_type, window_data)
            center_line = limits.center_line
            char_ucl = limits.ucl
            char_lcl = limits.lcl
        except ValueError:
            pass

    # Batch-load violations
    violation_repo = ViolationRepository(session)
    sample_ids = [wd["sample_id"] for wd in window_data]
    violations_by_sample = await violation_repo.get_by_sample_ids(sample_ids)

    # Compute display keys
    # Fetch raw samples for timestamp-based display keys
    samples_for_keys = await sample_repo.get_rolling_window(
        char_id=char_id, window_size=limit, exclude_excluded=True,
    )
    _display_keys: dict[int, str] = {}
    for sample in samples_for_keys:
        day_str = sample.timestamp.strftime('%y%m%d')
        day_start = sample.timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start.replace(hour=23, minute=59, second=59, microsecond=999999)
        count_stmt = select(func.count()).select_from(
            select(SampleModel.id).where(
                and_(
                    SampleModel.char_id == sample.char_id,
                    SampleModel.timestamp >= day_start,
                    SampleModel.timestamp <= day_end,
                    (SampleModel.timestamp < sample.timestamp)
                    | (
                        (SampleModel.timestamp == sample.timestamp)
                        & (SampleModel.id < sample.id)
                    ),
                )
            ).subquery()
        )
        preceding = (await session.execute(count_stmt)).scalar_one()
        _display_keys[sample.id] = f"{day_str}-{preceding + 1:03d}"

    # Compute Laney sigma_z if enabled
    sigma_z_value = None
    if use_laney and center_line is not None and len(window_data) >= 3:
        sigma_z_value = calculate_laney_sigma_z(chart_type, window_data, center_line)

    # Build attribute chart samples
    attr_samples = []
    for wd in window_data:
        defect_count = wd["defect_count"]
        s_size = wd.get("sample_size")
        u_inspected = wd.get("units_inspected")

        # Compute plotted value
        try:
            pv = get_plotted_value(chart_type, defect_count, s_size, u_inspected)
        except ValueError:
            pv = 0.0

        # Per-point limits (with optional Laney correction)
        pt_ucl = char_ucl
        pt_lcl = char_lcl
        if center_line is not None and chart_type:
            try:
                if use_laney and sigma_z_value is not None:
                    pt_ucl, pt_lcl = get_per_point_limits_laney(
                        chart_type, center_line, sigma_z_value, s_size, u_inspected,
                    )
                else:
                    pt_ucl, pt_lcl = get_per_point_limits(
                        chart_type, center_line, s_size, u_inspected,
                    )
            except ValueError:
                pass

        # Violations
        sv = violations_by_sample.get(wd["sample_id"], [])
        violation_ids = [v.id for v in sv]
        unack_ids = [v.id for v in sv if v.requires_acknowledgement and not v.acknowledged]
        v_rules = list(set(v.rule_id for v in sv))

        attr_samples.append(AttributeChartSample(
            sample_id=wd["sample_id"],
            timestamp=wd["timestamp"].isoformat() if hasattr(wd["timestamp"], "isoformat") else str(wd["timestamp"]),
            plotted_value=pv,
            defect_count=defect_count,
            sample_size=s_size,
            units_inspected=u_inspected,
            effective_ucl=pt_ucl,
            effective_lcl=pt_lcl,
            excluded=False,
            violation_ids=violation_ids,
            unacknowledged_violation_ids=unack_ids,
            violation_rules=v_rules,
            display_key=_display_keys.get(wd["sample_id"], ""),
        ))

    return ChartDataResponse(
        characteristic_id=char_id,
        characteristic_name=characteristic.name,
        data_points=[],
        attribute_data_points=attr_samples,
        control_limits=ControlLimits(
            center_line=center_line,
            ucl=char_ucl,
            lcl=char_lcl,
        ),
        spec_limits=SpecLimits(
            usl=characteristic.usl,
            lsl=characteristic.lsl,
            target=characteristic.target_value,
        ),
        zone_boundaries=ZoneBoundaries(),
        subgroup_mode=characteristic.subgroup_mode,
        nominal_subgroup_size=characteristic.subgroup_size,
        decimal_precision=characteristic.decimal_precision,
        data_type="attribute",
        attribute_chart_type=chart_type,
        sigma_z=sigma_z_value,
        short_run_mode=characteristic.short_run_mode,
        limits_type="laney_corrected" if use_laney and sigma_z_value is not None else "standard",
    )


async def _get_cusum_chart_data(
    char_id: int,
    characteristic,
    limit: int,
    sample_repo: SampleRepository,
    session: AsyncSession,
) -> ChartDataResponse:
    """Build chart data response for CUSUM characteristics."""
    import math
    from cassini.db.repositories import ViolationRepository
    from cassini.db.models.sample import Sample as SampleModel
    from sqlalchemy import and_

    target = characteristic.cusum_target or characteristic.target_value or 0.0
    h_sigma = characteristic.cusum_h or 5.0
    cusum_k_val = characteristic.cusum_k or 0.5
    reset_after_id = getattr(characteristic, 'cusum_reset_after_sample_id', None)

    # Convert h from sigma units to measurement units for chart display
    # The stored cusum_high/cusum_low on samples are in measurement units,
    # so the decision interval threshold must also be in measurement units.
    sigma = characteristic.stored_sigma
    if sigma is None or sigma <= 0:
        # Estimate sigma from sample data (same fallback as engine)
        all_samples = await sample_repo.get_rolling_window(
            char_id=char_id, window_size=100, exclude_excluded=True,
        )
        all_vals: list[float] = []
        for s in all_samples:
            for m in s.measurements:
                all_vals.append(m.value)
        if len(all_vals) >= 2:
            n = len(all_vals)
            mean = sum(all_vals) / n
            variance = sum((x - mean) ** 2 for x in all_vals) / (n - 1)
            sigma = math.sqrt(variance)
        else:
            sigma = 1.0
    h = h_sigma * sigma
    k = cusum_k_val * sigma  # Convert k from sigma units to measurement units

    # Get samples with measurements
    samples = await sample_repo.get_rolling_window(
        char_id=char_id, window_size=limit, exclude_excluded=True,
    )

    # Batch-load violations
    violation_repo = ViolationRepository(session)
    sample_ids = [s.id for s in samples]
    violations_by_sample = await violation_repo.get_by_sample_ids(sample_ids)

    # Compute display keys
    _display_keys: dict[int, str] = {}
    for sample in samples:
        day_str = sample.timestamp.strftime('%y%m%d')
        day_start = sample.timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start.replace(hour=23, minute=59, second=59, microsecond=999999)
        count_stmt = select(func.count()).select_from(
            select(SampleModel.id).where(
                and_(
                    SampleModel.char_id == sample.char_id,
                    SampleModel.timestamp >= day_start,
                    SampleModel.timestamp <= day_end,
                    (SampleModel.timestamp < sample.timestamp)
                    | (
                        (SampleModel.timestamp == sample.timestamp)
                        & (SampleModel.id < sample.id)
                    ),
                )
            ).subquery()
        )
        preceding = (await session.execute(count_stmt)).scalar_one()
        _display_keys[sample.id] = f"{day_str}-{preceding + 1:03d}"

    # Recompute CUSUM S+/S- with reset logic
    cusum_high_running = 0.0
    cusum_low_running = 0.0
    past_reset = reset_after_id is None  # If no reset point, all samples accumulate

    cusum_samples = []
    for sample in samples:
        values = [m.value for m in sample.measurements]
        measurement = values[0] if values else 0.0

        if not past_reset:
            if sample.id <= reset_after_id:
                c_high = 0.0
                c_low = 0.0
                if sample.id == reset_after_id:
                    past_reset = True
                    cusum_high_running = 0.0
                    cusum_low_running = 0.0
            else:
                past_reset = True
                cusum_high_running = max(0.0, cusum_high_running + (measurement - target - k))
                cusum_low_running = max(0.0, cusum_low_running + (target - measurement - k))
                c_high = cusum_high_running
                c_low = cusum_low_running
        else:
            cusum_high_running = max(0.0, cusum_high_running + (measurement - target - k))
            cusum_low_running = max(0.0, cusum_low_running + (target - measurement - k))
            c_high = cusum_high_running
            c_low = cusum_low_running

        sv = violations_by_sample.get(sample.id, [])
        violation_ids = [v.id for v in sv]
        unack_ids = [v.id for v in sv if v.requires_acknowledgement and not v.acknowledged]
        v_rules = list(set(v.rule_id for v in sv))

        cusum_samples.append(CUSUMChartSample(
            sample_id=sample.id,
            timestamp=sample.timestamp.isoformat(),
            measurement=measurement,
            cusum_high=c_high,
            cusum_low=c_low,
            excluded=sample.is_excluded,
            violation_ids=violation_ids,
            unacknowledged_violation_ids=unack_ids,
            violation_rules=v_rules,
            display_key=_display_keys.get(sample.id, ""),
        ))

    return ChartDataResponse(
        characteristic_id=char_id,
        characteristic_name=characteristic.name,
        data_points=[],
        cusum_data_points=cusum_samples,
        control_limits=ControlLimits(
            center_line=0.0,  # CUSUM center line is always 0
            ucl=h,
            lcl=-h,  # Symmetric decision interval
        ),
        spec_limits=SpecLimits(
            usl=characteristic.usl,
            lsl=characteristic.lsl,
            target=characteristic.target_value,
        ),
        zone_boundaries=ZoneBoundaries(),
        subgroup_mode=characteristic.subgroup_mode,
        nominal_subgroup_size=characteristic.subgroup_size,
        decimal_precision=characteristic.decimal_precision,
        data_type="variable",
        chart_type="cusum",
        cusum_h=h_sigma,
        cusum_k=cusum_k_val,
        cusum_target=target,
        short_run_mode=characteristic.short_run_mode,
    )


async def _get_ewma_chart_data(
    char_id: int,
    characteristic,
    limit: int,
    sample_repo: SampleRepository,
    session: AsyncSession,
) -> ChartDataResponse:
    """Build chart data response for EWMA characteristics."""
    from cassini.core.engine.ewma_engine import (
        calculate_ewma_limits,
        estimate_sigma_from_values,
    )
    from cassini.db.repositories import ViolationRepository
    from cassini.db.models.sample import Sample as SampleModel
    from sqlalchemy import and_

    ewma_lambda = characteristic.ewma_lambda or 0.2
    ewma_l = characteristic.ewma_l or 2.7
    target = characteristic.cusum_target or characteristic.target_value or characteristic.stored_center_line or 0.0

    # Get samples with measurements
    samples = await sample_repo.get_rolling_window(
        char_id=char_id, window_size=limit, exclude_excluded=True,
    )

    # Estimate sigma
    sigma = characteristic.stored_sigma
    if sigma is None or sigma <= 0:
        all_values = []
        for s in samples:
            for m in s.measurements:
                all_values.append(m.value)
        sigma = estimate_sigma_from_values(all_values) if len(all_values) >= 2 else 1.0

    if sigma <= 0:
        sigma = 1.0

    # Steady-state limits for backward compatibility
    ucl, lcl = calculate_ewma_limits(target, sigma, ewma_lambda, ewma_l)

    # Count total non-excluded samples to compute absolute 1-based indices
    # for time-varying limits. The displayed window is the last N samples,
    # so their absolute indices are (total - N + 1) through total.
    total_count_stmt = select(func.count()).select_from(SampleModel).where(
        SampleModel.char_id == char_id,
        SampleModel.is_excluded == False,  # noqa: E712
    )
    total_non_excluded = (await session.execute(total_count_stmt)).scalar_one()

    num_displayed = len(samples)
    # Absolute 1-based start index for the first displayed sample
    abs_start_index = max(1, total_non_excluded - num_displayed + 1)

    # Compute per-point time-varying UCL/LCL arrays
    ewma_ucl_values: list[float] = []
    ewma_lcl_values: list[float] = []
    for i in range(num_displayed):
        pt_ucl, pt_lcl = calculate_ewma_limits(
            target, sigma, ewma_lambda, ewma_l,
            sample_index=abs_start_index + i,
        )
        ewma_ucl_values.append(pt_ucl)
        ewma_lcl_values.append(pt_lcl)

    # Batch-load violations
    violation_repo = ViolationRepository(session)
    sample_ids = [s.id for s in samples]
    violations_by_sample = await violation_repo.get_by_sample_ids(sample_ids)

    # Compute display keys
    _display_keys: dict[int, str] = {}
    for sample in samples:
        day_str = sample.timestamp.strftime('%y%m%d')
        day_start = sample.timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start.replace(hour=23, minute=59, second=59, microsecond=999999)
        count_stmt = select(func.count()).select_from(
            select(SampleModel.id).where(
                and_(
                    SampleModel.char_id == sample.char_id,
                    SampleModel.timestamp >= day_start,
                    SampleModel.timestamp <= day_end,
                    (SampleModel.timestamp < sample.timestamp)
                    | (
                        (SampleModel.timestamp == sample.timestamp)
                        & (SampleModel.id < sample.id)
                    ),
                )
            ).subquery()
        )
        preceding = (await session.execute(count_stmt)).scalar_one()
        _display_keys[sample.id] = f"{day_str}-{preceding + 1:03d}"

    ewma_samples = []
    for sample in samples:
        values = [m.value for m in sample.measurements]
        measurement = values[0] if values else 0.0

        sv = violations_by_sample.get(sample.id, [])
        violation_ids = [v.id for v in sv]
        unack_ids = [v.id for v in sv if v.requires_acknowledgement and not v.acknowledged]
        v_rules = list(set(v.rule_id for v in sv))

        ewma_samples.append(EWMAChartSample(
            sample_id=sample.id,
            timestamp=sample.timestamp.isoformat(),
            measurement=measurement,
            ewma_value=sample.ewma_value if sample.ewma_value is not None else target,
            excluded=sample.is_excluded,
            violation_ids=violation_ids,
            unacknowledged_violation_ids=unack_ids,
            violation_rules=v_rules,
            display_key=_display_keys.get(sample.id, ""),
        ))

    return ChartDataResponse(
        characteristic_id=char_id,
        characteristic_name=characteristic.name,
        data_points=[],
        ewma_data_points=ewma_samples,
        control_limits=ControlLimits(
            center_line=target,
            ucl=ucl,
            lcl=lcl,
        ),
        spec_limits=SpecLimits(
            usl=characteristic.usl,
            lsl=characteristic.lsl,
            target=characteristic.target_value,
        ),
        zone_boundaries=ZoneBoundaries(),
        subgroup_mode=characteristic.subgroup_mode,
        nominal_subgroup_size=characteristic.subgroup_size,
        decimal_precision=characteristic.decimal_precision,
        stored_sigma=sigma,
        data_type="variable",
        chart_type="ewma",
        ewma_target=target,
        ewma_ucl_values=ewma_ucl_values,
        ewma_lcl_values=ewma_lcl_values,
        ewma_lambda=ewma_lambda,
        ewma_l=ewma_l,
        short_run_mode=characteristic.short_run_mode,
    )


@router.get("/{char_id}/chart-data", response_model=ChartDataResponse)
async def get_chart_data(
    char_id: int,
    limit: int = Query(100, ge=1, le=1000, description="Number of recent samples to return"),
    start_date: datetime | None = Query(None, description="Start date for filtering samples"),
    end_date: datetime | None = Query(None, description="End date for filtering samples"),
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> ChartDataResponse:
    """Get chart rendering data with samples, limits, and zones.

    Returns recent samples with zone classification, control limits,
    and zone boundaries for chart visualization.
    """
    # Get characteristic
    characteristic = await repo.get_by_id(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found"
        )

    # --- Attribute chart branch ---
    if characteristic.data_type == "attribute":
        return await _get_attribute_chart_data(
            char_id, characteristic, limit, sample_repo, session,
        )

    # --- CUSUM chart branch ---
    if characteristic.chart_type == "cusum":
        return await _get_cusum_chart_data(
            char_id, characteristic, limit, sample_repo, session,
        )

    # --- EWMA chart branch ---
    if characteristic.chart_type == "ewma":
        return await _get_ewma_chart_data(
            char_id, characteristic, limit, sample_repo, session,
        )

    # If control limits are not defined, return empty chart data
    if characteristic.ucl is None or characteristic.lcl is None:
        return ChartDataResponse(
            characteristic_id=char_id,
            characteristic_name=characteristic.name,
            data_points=[],
            control_limits=ControlLimits(center_line=None, ucl=None, lcl=None),
            spec_limits=SpecLimits(
                usl=characteristic.usl,
                lsl=characteristic.lsl,
                target=characteristic.target_value,
            ),
            zone_boundaries=ZoneBoundaries(
                plus_1_sigma=None,
                plus_2_sigma=None,
                plus_3_sigma=None,
                minus_1_sigma=None,
                minus_2_sigma=None,
                minus_3_sigma=None,
            ),
            subgroup_mode=characteristic.subgroup_mode,
            nominal_subgroup_size=characteristic.subgroup_size,
            decimal_precision=characteristic.decimal_precision,
            data_type=characteristic.data_type,
            short_run_mode=characteristic.short_run_mode,
        )

    # Get samples
    if start_date or end_date:
        samples = await sample_repo.get_by_characteristic(
            char_id=char_id,
            start_date=start_date,
            end_date=end_date,
        )
        # Limit to most recent N samples if exceeded
        if len(samples) > limit:
            samples = samples[-limit:]
    else:
        samples = await sample_repo.get_rolling_window(
            char_id=char_id,
            window_size=limit,
            exclude_excluded=True,
        )

    import math as _math

    # Use stored parameters if available (set by recalculate-limits),
    # otherwise derive from control limits for backward compatibility
    center_line = (
        characteristic.stored_center_line
        if characteristic.stored_center_line is not None
        else (characteristic.ucl + characteristic.lcl) / 2
    )

    # stored_sigma is process sigma; zone boundaries need sigma of the mean
    n = characteristic.subgroup_size or 1
    if characteristic.stored_sigma is not None:
        sigma_xbar = characteristic.stored_sigma / _math.sqrt(n) if n > 1 else characteristic.stored_sigma
    else:
        # Fallback: derive from control limits (already sigma_xbar)
        sigma_xbar = (characteristic.ucl - center_line) / 3

    # Calculate zone boundaries using sigma of the mean
    zones = ZoneBoundaries(
        plus_1_sigma=center_line + sigma_xbar,
        plus_2_sigma=center_line + 2 * sigma_xbar,
        plus_3_sigma=center_line + 3 * sigma_xbar,
        minus_1_sigma=center_line - sigma_xbar,
        minus_2_sigma=center_line - 2 * sigma_xbar,
        minus_3_sigma=center_line - 3 * sigma_xbar,
    )

    # Batch-load all violations for all samples in one query (avoids N+1)
    from cassini.db.repositories import ViolationRepository
    violation_repo = ViolationRepository(session)
    sample_ids = [s.id for s in samples]
    violations_by_sample = await violation_repo.get_by_sample_ids(sample_ids)

    # Convert samples to chart samples
    from cassini.utils.statistics import classify_zone, calculate_mean_range
    import numpy as np

    # Compute display keys (YYMMDD-NNN) — count ALL preceding samples per day
    # (including excluded) so keys match the single-sample endpoint exactly.
    from cassini.db.models.sample import Sample as SampleModel
    from sqlalchemy import and_

    _display_keys: dict[int, str] = {}
    for sample in samples:
        day_str = sample.timestamp.strftime('%y%m%d')
        day_start = sample.timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start.replace(hour=23, minute=59, second=59, microsecond=999999)
        count_stmt = select(func.count()).select_from(
            select(SampleModel.id).where(
                and_(
                    SampleModel.char_id == sample.char_id,
                    SampleModel.timestamp >= day_start,
                    SampleModel.timestamp <= day_end,
                    (SampleModel.timestamp < sample.timestamp)
                    | (
                        (SampleModel.timestamp == sample.timestamp)
                        & (SampleModel.id < sample.id)
                    ),
                )
            ).subquery()
        )
        preceding = (await session.execute(count_stmt)).scalar_one()
        _display_keys[sample.id] = f"{day_str}-{preceding + 1:03d}"

    # Pre-compute short-run transformation parameters
    _sr_mode = characteristic.short_run_mode
    _sr_target = characteristic.target_value or 0.0
    _sr_sigma = characteristic.stored_sigma

    chart_samples = []
    for sample in samples:
        values = [m.value for m in sample.measurements]
        value, range_value = calculate_mean_range(values)
        std_dev_value: float | None = None
        if len(values) >= 2:
            std_dev_value = float(np.std(values, ddof=1))

        # Classify zone using shared utility (raw value vs raw limits)
        zone = classify_zone(value, zones, center_line)

        # Get violations for this sample from batch-loaded data
        sample_violations = violations_by_sample.get(sample.id, [])
        violation_ids = [v.id for v in sample_violations]
        unacknowledged_violation_ids = [
            v.id for v in sample_violations
            if v.requires_acknowledgement and not v.acknowledged
        ]
        violation_rules = list(set(v.rule_id for v in sample_violations))

        # Compute display_value: Mode A z-score, short-run transform, or raw
        if characteristic.subgroup_mode == "STANDARDIZED" and sample.z_score is not None:
            display_val = sample.z_score
        elif _sr_mode == "deviation":
            display_val = value - _sr_target
        elif _sr_mode == "standardized" and _sr_sigma and _sr_sigma > 0:
            actual_n = sample.actual_n or len(values)
            sigma_xbar = _sr_sigma / np.sqrt(actual_n) if actual_n > 1 else _sr_sigma
            display_val = (value - _sr_target) / sigma_xbar
        else:
            display_val = value

        chart_samples.append(ChartSample(
            sample_id=sample.id,
            timestamp=sample.timestamp.isoformat(),
            mean=value,
            range=range_value,
            std_dev=std_dev_value,
            excluded=sample.is_excluded,
            violation_ids=violation_ids,
            unacknowledged_violation_ids=unacknowledged_violation_ids,
            violation_rules=violation_rules,
            zone=zone,
            actual_n=sample.actual_n or len(values),
            is_undersized=sample.is_undersized,
            effective_ucl=sample.effective_ucl,
            effective_lcl=sample.effective_lcl,
            z_score=sample.z_score,
            display_value=display_val,
            display_key=_display_keys.get(sample.id, ""),
        ))

    # Build control limits with short-run transformation
    cl_center = center_line
    cl_ucl = characteristic.ucl
    cl_lcl = characteristic.lcl
    if _sr_mode == "deviation":
        if cl_center is not None:
            cl_center = cl_center - _sr_target
        if cl_ucl is not None:
            cl_ucl = cl_ucl - _sr_target
        if cl_lcl is not None:
            cl_lcl = cl_lcl - _sr_target
    elif _sr_mode == "standardized" and _sr_sigma and _sr_sigma > 0:
        cl_center = 0.0
        cl_ucl = 3.0
        cl_lcl = -3.0

    control_limits = ControlLimits(
        center_line=cl_center,
        ucl=cl_ucl,
        lcl=cl_lcl,
    )

    # Transform spec limits for short-run display
    sl_usl = characteristic.usl
    sl_lsl = characteristic.lsl
    sl_target = characteristic.target_value
    if _sr_mode == "deviation":
        if sl_usl is not None:
            sl_usl = sl_usl - _sr_target
        if sl_lsl is not None:
            sl_lsl = sl_lsl - _sr_target
        sl_target = 0.0
    elif _sr_mode == "standardized" and _sr_sigma and _sr_sigma > 0:
        # Use sigma_xbar (sigma / sqrt(n)) to match the display_value Z-transform
        _n = characteristic.subgroup_size or 1
        _sigma_xbar = _sr_sigma / np.sqrt(_n) if _n > 1 else _sr_sigma
        if sl_usl is not None:
            sl_usl = (sl_usl - _sr_target) / _sigma_xbar
        if sl_lsl is not None:
            sl_lsl = (sl_lsl - _sr_target) / _sigma_xbar
        sl_target = 0.0

    spec_limits = SpecLimits(
        usl=sl_usl,
        lsl=sl_lsl,
        target=sl_target,
    )

    # Transform zone boundaries for short-run display
    if _sr_mode == "deviation":
        zones = ZoneBoundaries(
            plus_1_sigma=zones.plus_1_sigma - _sr_target if zones.plus_1_sigma is not None else None,
            plus_2_sigma=zones.plus_2_sigma - _sr_target if zones.plus_2_sigma is not None else None,
            plus_3_sigma=zones.plus_3_sigma - _sr_target if zones.plus_3_sigma is not None else None,
            minus_1_sigma=zones.minus_1_sigma - _sr_target if zones.minus_1_sigma is not None else None,
            minus_2_sigma=zones.minus_2_sigma - _sr_target if zones.minus_2_sigma is not None else None,
            minus_3_sigma=zones.minus_3_sigma - _sr_target if zones.minus_3_sigma is not None else None,
        )
    elif _sr_mode == "standardized" and _sr_sigma and _sr_sigma > 0:
        zones = ZoneBoundaries(
            plus_1_sigma=1.0, plus_2_sigma=2.0, plus_3_sigma=3.0,
            minus_1_sigma=-1.0, minus_2_sigma=-2.0, minus_3_sigma=-3.0,
        )

    return ChartDataResponse(
        characteristic_id=char_id,
        characteristic_name=characteristic.name,
        data_points=chart_samples,
        control_limits=control_limits,
        spec_limits=spec_limits,
        zone_boundaries=zones,
        subgroup_mode=characteristic.subgroup_mode,
        nominal_subgroup_size=characteristic.subgroup_size,
        decimal_precision=characteristic.decimal_precision,
        stored_sigma=characteristic.stored_sigma,
        data_type=characteristic.data_type,
        short_run_mode=characteristic.short_run_mode,
    )


@router.post("/{char_id}/recalculate-limits")
async def recalculate_limits(
    char_id: int,
    request: Request,
    exclude_ooc: bool = Query(False, description="Exclude out-of-control samples from calculation"),
    min_samples: int = Query(25, ge=1, description="Minimum samples required for calculation"),
    start_date: datetime | None = Query(None, description="Start date for baseline period"),
    end_date: datetime | None = Query(None, description="End date for baseline period"),
    last_n: int | None = Query(None, ge=1, description="Use only the most recent N samples"),
    service: ControlLimitService = Depends(get_control_limit_service),
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> dict:
    """Recalculate control limits from historical data.

    Returns before/after values and calculation metadata including:
    - Method used (moving_range, r_bar_d2, s_bar_c4)
    - Sample count used
    - Number of excluded samples
    - Calculation timestamp
    """
    # Get current characteristic state
    characteristic = await repo.get_by_id(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found"
        )

    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    # Store before values
    before = {
        "ucl": characteristic.ucl,
        "lcl": characteristic.lcl,
        "center_line": (characteristic.ucl + characteristic.lcl) / 2 if characteristic.ucl and characteristic.lcl else None,
    }

    # --- Attribute chart branch ---
    if characteristic.data_type == "attribute":
        attr_result = await _recalculate_attribute_limits(
            char_id, characteristic, before, min_samples,
            SampleRepository(session), session,
        )
        request.state.audit_context = {
            "resource_type": "characteristic",
            "resource_id": char_id,
            "action": "recalculate",
            "summary": f"Control limits recalculated for '{characteristic.name}'",
            "fields": {
                "characteristic_name": characteristic.name,
                "chart_type": characteristic.chart_type,
                "data_type": "attribute",
            },
        }
        return attr_result

    # Recalculate limits
    try:
        result = await service.recalculate_and_persist(
            characteristic_id=char_id,
            exclude_ooc=exclude_ooc,
            min_samples=min_samples,
            start_date=start_date,
            end_date=end_date,
            last_n=last_n,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid input for limit calculation"
        )

    # Get updated characteristic
    await session.refresh(characteristic)

    request.state.audit_context = {
        "resource_type": "characteristic",
        "resource_id": char_id,
        "action": "recalculate",
        "summary": f"Control limits recalculated for '{characteristic.name}'",
        "fields": {
            "characteristic_name": characteristic.name,
            "chart_type": characteristic.chart_type,
            "ucl": result.ucl,
            "centerline": result.center_line,
            "lcl": result.lcl,
        },
    }

    # Return before/after values with metadata
    return {
        "before": before,
        "after": {
            "ucl": result.ucl,
            "lcl": result.lcl,
            "center_line": result.center_line,
        },
        "calculation": {
            "method": result.method,
            "sigma": result.sigma,
            "sample_count": result.sample_count,
            "excluded_count": result.excluded_count,
            "calculated_at": result.calculated_at.isoformat(),
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "last_n": last_n,
        },
    }


@router.post("/{char_id}/set-limits", response_model=ControlLimitsResponse)
async def set_limits(
    char_id: int,
    body: SetLimitsRequest,
    request: Request,
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> ControlLimitsResponse:
    """Manually set control limits from an external capability study.

    Sets UCL, LCL, center line, and sigma directly rather than calculating
    from sample data. Useful for regulated industries (pharma IQ/OQ/PQ,
    automotive PPAP) where limits come from validation protocols.
    """
    characteristic = await repo.get_by_id(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    before = {
        "ucl": characteristic.ucl,
        "lcl": characteristic.lcl,
        "center_line": characteristic.stored_center_line,
    }

    # Apply manual limits
    characteristic.ucl = body.ucl
    characteristic.lcl = body.lcl
    characteristic.stored_center_line = body.center_line
    characteristic.stored_sigma = body.sigma
    characteristic.limits_calc_params = _json.dumps({"method": "manual"})

    await session.commit()

    # Invalidate rolling window cache
    window_manager = RollingWindowManager(sample_repo)
    await window_manager.invalidate(char_id)

    # Publish event
    from cassini.core.events import ControlLimitsUpdatedEvent, event_bus

    event = ControlLimitsUpdatedEvent(
        characteristic_id=char_id,
        center_line=body.center_line,
        ucl=body.ucl,
        lcl=body.lcl,
        method="manual",
        sample_count=0,
        timestamp=datetime.now(timezone.utc),
    )
    await event_bus.publish(event)

    request.state.audit_context = {
        "resource_type": "characteristic",
        "resource_id": char_id,
        "action": "update",
        "summary": f"Control limits manually set for '{characteristic.name}'",
        "fields": {
            "characteristic_name": characteristic.name,
            "ucl": body.ucl,
            "centerline": body.center_line,
            "lcl": body.lcl,
        },
    }

    return ControlLimitsResponse(
        before=before,
        after={
            "ucl": body.ucl,
            "lcl": body.lcl,
            "center_line": body.center_line,
        },
        calculation={
            "method": "manual",
            "sigma": body.sigma,
            "sample_count": 0,
            "excluded_count": 0,
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        },
    )


@router.post("/{char_id}/cusum-reset")
async def cusum_reset(
    char_id: int,
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> dict:
    """Reset the CUSUM accumulator at the current latest sample.

    Sets the reset point so that chart-data will show S+=0 and S-=0 for
    all samples up to and including the reset sample, and begin fresh
    accumulation from samples after the reset point.

    Requires engineer or admin role.
    """
    characteristic = await repo.get_by_id(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    if characteristic.chart_type != "cusum":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CUSUM reset is only applicable to characteristics with chart_type='cusum'",
        )

    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    # Find the latest sample for this characteristic
    from cassini.db.models.sample import Sample as SampleModel
    latest_stmt = (
        select(SampleModel)
        .where(SampleModel.char_id == char_id)
        .order_by(SampleModel.id.desc())
        .limit(1)
    )
    result = await session.execute(latest_stmt)
    latest_sample = result.scalar_one_or_none()

    if latest_sample is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No samples exist for this characteristic",
        )

    characteristic.cusum_reset_after_sample_id = latest_sample.id
    await session.commit()

    return {
        "reset_after_sample_id": latest_sample.id,
        "reset_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/{char_id}/rules", response_model=list[NelsonRuleConfig])
async def get_rules(
    char_id: int,
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    _user: User = Depends(get_current_user),
) -> list[NelsonRuleConfig]:
    """Get Nelson Rule configuration for characteristic.

    Returns the enabled/disabled state and require_acknowledgement for all 8 Nelson Rules.
    """
    # Get characteristic with rules
    characteristic = await repo.get_with_rules(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found"
        )

    # Convert to response models
    rules = [
        NelsonRuleConfig(
            rule_id=rule.rule_id,
            is_enabled=rule.is_enabled,
            require_acknowledgement=rule.require_acknowledgement,
            parameters=_json.loads(rule.parameters) if rule.parameters else None,
        )
        for rule in characteristic.rules
    ]

    # Ensure all 8 rules are present (fill in defaults if missing)
    existing_rule_ids = {rule.rule_id for rule in rules}
    for rule_id in NELSON_RULE_IDS:
        if rule_id not in existing_rule_ids:
            rules.append(NelsonRuleConfig(rule_id=rule_id, is_enabled=True, require_acknowledgement=True))

    # Sort by rule_id
    rules.sort(key=lambda r: r.rule_id)

    return rules


@router.put("/{char_id}/rules", response_model=list[NelsonRuleConfig])
async def update_rules(
    char_id: int,
    rules: list[NelsonRuleConfig],
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> list[NelsonRuleConfig]:
    """Update Nelson Rule configuration.

    Replaces the complete rule configuration for the characteristic.
    Validates that rule_ids are between 1-8.
    """
    # Validate characteristic exists
    characteristic = await repo.get_with_rules(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found"
        )

    # Validate rule IDs
    for rule in rules:
        if rule.rule_id < 1 or rule.rule_id > 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid rule_id {rule.rule_id}. Must be between 1-8."
            )

    # Delete existing rules
    for existing_rule in characteristic.rules:
        await session.delete(existing_rule)
    await session.flush()

    # Create new rules
    for rule_config in rules:
        rule = CharacteristicRule(
            char_id=char_id,
            rule_id=rule_config.rule_id,
            is_enabled=rule_config.is_enabled,
            require_acknowledgement=rule_config.require_acknowledgement,
            parameters=_json.dumps(rule_config.parameters) if rule_config.parameters else None,
        )
        session.add(rule)

    await session.commit()

    # Return updated rules
    await session.refresh(characteristic)
    return [
        NelsonRuleConfig(
            rule_id=rule.rule_id,
            is_enabled=rule.is_enabled,
            require_acknowledgement=rule.require_acknowledgement,
            parameters=_json.loads(rule.parameters) if rule.parameters else None,
        )
        for rule in characteristic.rules
    ]


@router.post("/{char_id}/change-mode", response_model=ChangeModeResponse)
async def change_subgroup_mode(
    char_id: int,
    request: ChangeModeRequest,
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> ChangeModeResponse:
    """Change subgroup mode with historical sample migration.

    Recalculates z_score, effective_ucl, and effective_lcl for all
    existing samples based on the new mode. This is an atomic operation
    that rolls back on failure.

    For STANDARDIZED and VARIABLE_LIMITS modes, stored_sigma and
    stored_center_line must be set (run recalculate-limits first).
    """
    import math

    # Get characteristic
    characteristic = await repo.get_by_id(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found"
        )

    previous_mode = characteristic.subgroup_mode
    new_mode = request.new_mode.value

    # Count samples for this characteristic
    from cassini.db.models.sample import Measurement, Sample as SampleModel
    from sqlalchemy import update as sa_update

    sample_count_stmt = select(func.count()).where(SampleModel.char_id == char_id)
    sample_count = (await session.execute(sample_count_stmt)).scalar_one()

    # Validate prerequisites for Mode A/B only when samples exist
    if new_mode in ("STANDARDIZED", "VARIABLE_LIMITS") and sample_count > 0:
        if characteristic.stored_sigma is None or characteristic.stored_center_line is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="stored_sigma and stored_center_line must be set. Run recalculate-limits first."
            )

    samples_migrated = 0

    if new_mode == "NOMINAL_TOLERANCE":
        # Bulk SQL UPDATE -- no per-sample computation needed
        await session.execute(
            sa_update(SampleModel)
            .where(SampleModel.char_id == char_id)
            .values(z_score=None, effective_ucl=None, effective_lcl=None)
        )
        samples_migrated = sample_count

    elif sample_count > 0:
        # For STANDARDIZED / VARIABLE_LIMITS: process in batches to limit memory
        BATCH_SIZE = 500
        batch_offset = 0

        while batch_offset < sample_count:
            batch_stmt = (
                select(SampleModel)
                .options(selectinload(SampleModel.measurements))
                .where(SampleModel.char_id == char_id)
                .order_by(SampleModel.id)
                .offset(batch_offset)
                .limit(BATCH_SIZE)
                .execution_options(populate_existing=True)
            )
            batch_result = await session.execute(batch_stmt)
            batch_samples = list(batch_result.scalars().all())

            if not batch_samples:
                break

            for sample in batch_samples:
                actual_n = sample.actual_n or 1
                measurements = sample.measurements
                if measurements:
                    sample_mean = sum(m.value for m in measurements) / len(measurements)
                else:
                    sample_mean = 0.0

                if new_mode == "STANDARDIZED":
                    if characteristic.stored_sigma > 0:
                        sigma_x_bar = characteristic.stored_sigma / math.sqrt(actual_n)
                        sample.z_score = (sample_mean - characteristic.stored_center_line) / sigma_x_bar
                    else:
                        sample.z_score = 0.0
                    sample.effective_ucl = None
                    sample.effective_lcl = None

                elif new_mode == "VARIABLE_LIMITS":
                    sigma_x_bar = characteristic.stored_sigma / math.sqrt(actual_n)
                    sample.effective_ucl = characteristic.stored_center_line + 3 * sigma_x_bar
                    sample.effective_lcl = characteristic.stored_center_line - 3 * sigma_x_bar
                    sample.z_score = None

                samples_migrated += 1

            await session.flush()
            batch_offset += BATCH_SIZE

    # Update the characteristic's subgroup_mode
    characteristic.subgroup_mode = new_mode

    # Commit all changes atomically
    await session.commit()

    # Re-load with data_source relationship
    characteristic = await repo.get_with_data_source(char_id)

    return ChangeModeResponse(
        previous_mode=previous_mode,
        new_mode=new_mode,
        samples_migrated=samples_migrated,
        characteristic=CharacteristicResponse.model_validate(characteristic),
    )


@router.get("/{char_id}/export/excel")
async def export_characteristic_excel(
    char_id: int,
    request: Request,
    limit: int = Query(500, ge=1, le=10000, description="Number of recent samples to export"),
    start_date: datetime | None = Query(None, description="Start date for filtering samples"),
    end_date: datetime | None = Query(None, description="End date for filtering samples"),
    repo: CharacteristicRepository = Depends(get_characteristic_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Export characteristic data as an Excel workbook.

    Returns a 5-sheet .xlsx file: Measurements, Summary Statistics,
    Control Limits, Violations, and Annotations.

    All authenticated users can export (no engineer/admin requirement).
    GET requests are not captured by audit middleware so this endpoint
    logs explicitly.
    """
    # Load characteristic
    characteristic = await repo.get_by_id(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    # Load samples — include excluded samples so they appear in the export
    if start_date or end_date:
        samples = await sample_repo.get_by_characteristic(
            char_id=char_id,
            start_date=start_date,
            end_date=end_date,
        )
        if len(samples) > limit:
            samples = samples[-limit:]
    else:
        samples = await sample_repo.get_rolling_window(
            char_id=char_id,
            window_size=limit,
            exclude_excluded=False,
        )

    # Batch-load violations for all samples (avoids N+1)
    from cassini.db.repositories import ViolationRepository

    violation_repo = ViolationRepository(session)
    sample_ids = [s.id for s in samples]
    violations_by_sample = await violation_repo.get_by_sample_ids(sample_ids)

    # Load annotations for the characteristic
    from cassini.db.models.annotation import Annotation

    ann_stmt = (
        select(Annotation)
        .where(Annotation.characteristic_id == char_id)
        .order_by(Annotation.created_at)
    )
    ann_result = await session.execute(ann_stmt)
    annotations = list(ann_result.scalars().all())

    # Build hierarchy path (Plant > Line > ... > Machine > Characteristic name)
    from cassini.db.repositories import HierarchyRepository

    hierarchy_repo = HierarchyRepository(session)
    hierarchy_path_prefix = ""
    if characteristic.hierarchy_id is not None:
        hierarchy_path_prefix = await _build_hierarchy_path(hierarchy_repo, characteristic.hierarchy_id)
    hierarchy_path = (
        f"{hierarchy_path_prefix} > {characteristic.name}"
        if hierarchy_path_prefix
        else characteristic.name
    )

    # Build data window description for metadata row
    if start_date or end_date:
        sd = start_date.isoformat() if start_date else "earliest"
        ed = end_date.isoformat() if end_date else "latest"
        data_window_description = f"{sd} to {ed} (up to {limit} samples)"
    else:
        data_window_description = f"Most recent {limit} samples"

    # Build the workbook
    from cassini.core.excel_export import build_export_workbook

    buf = build_export_workbook(
        characteristic=characteristic,
        samples=samples,
        violations_by_sample=violations_by_sample,
        annotations=annotations,
        hierarchy_path=hierarchy_path,
        data_window_description=data_window_description,
    )

    # Safe filename: strip non-alphanumeric characters (keep hyphens/underscores)
    safe_name = re.sub(r"[^\w\-]", "_", characteristic.name)
    filename = f"cassini_char_{char_id}_{safe_name}.xlsx"

    # Explicit audit log — GET requests are not captured by audit middleware
    audit_service = getattr(request.app.state, "audit_service", None)
    if audit_service:
        await audit_service.log(
            action="export",
            resource_type="characteristic",
            resource_id=char_id,
            detail={"format": "excel", "samples": len(samples)},
            user_id=user.id,
            username=user.username,
            ip_address=request.client.host if request.client else None,
        )

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
