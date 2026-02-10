"""Characteristic REST endpoints for OpenSPC.

Provides CRUD operations, chart data, limit recalculation, and rule management
for SPC characteristics.
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.api.schemas.characteristic import (
    ChangeModeRequest,
    ChangeModeResponse,
    CharacteristicCreate,
    CharacteristicResponse,
    CharacteristicUpdate,
    ChartDataResponse,
    ChartSample,
    ControlLimits,
    ControlLimitsResponse,
    NelsonRuleConfig,
    SetLimitsRequest,
    SpecLimits,
    ZoneBoundaries,
)
from openspc.api.deps import (
    check_plant_role,
    get_characteristic_repo,
    get_current_user,
    get_current_engineer,
    get_db_session,
    get_sample_repo,
    resolve_plant_id_for_characteristic,
)
from openspc.api.schemas.common import PaginatedResponse, PaginationParams
from openspc.core.engine.control_limits import ControlLimitService
from openspc.core.engine.nelson_rules import NELSON_RULE_IDS
from openspc.db.models.user import User
from openspc.core.engine.rolling_window import RollingWindowManager
from openspc.db.models.characteristic import Characteristic, CharacteristicRule
from openspc.db.repositories import CharacteristicRepository, SampleRepository

router = APIRouter(prefix="/api/v1/characteristics", tags=["characteristics"])


# Dependency for ControlLimitService
async def get_control_limit_service(
    char_repo: CharacteristicRepository = Depends(get_characteristic_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
) -> ControlLimitService:
    """Dependency to get ControlLimitService instance."""
    window_manager = RollingWindowManager(sample_repo)
    return ControlLimitService(sample_repo, char_repo, window_manager)


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

    # Build query with filters
    stmt = select(Characteristic)

    if plant_id is not None:
        from openspc.db.models.hierarchy import Hierarchy
        stmt = stmt.join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id).where(
            Hierarchy.plant_id == plant_id
        )

    if hierarchy_id is not None:
        stmt = stmt.where(Characteristic.hierarchy_id == hierarchy_id)

    if provider_type is not None:
        from openspc.db.models.data_source import DataSource
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
        from openspc.db.models.sample import Sample
        from openspc.db.models.violation import Violation

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
            # Want in-control: exclude characteristics with violations on latest sample
            stmt = stmt.where(Characteristic.id.notin_(select(has_violations.c.char_id)))
        else:
            # Want out-of-control: only characteristics with violations on latest sample
            stmt = stmt.where(Characteristic.id.in_(select(has_violations.c.char_id)))

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

    # Convert to response models
    items = [CharacteristicResponse.model_validate(char) for char in characteristics]

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
    from openspc.db.repositories import HierarchyRepository
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

    # Update only provided fields
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(characteristic, key, value)

    await session.commit()

    # Re-load with data_source relationship
    characteristic = await repo.get_with_data_source(char_id)

    return CharacteristicResponse.model_validate(characteristic)


# TODO: Consider adding soft-delete (deleted_at column) instead of hard delete
# to support audit trails and accidental deletion recovery.
@router.delete("/{char_id}", status_code=status.HTTP_204_NO_CONTENT)
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
    from openspc.db.repositories import ViolationRepository
    violation_repo = ViolationRepository(session)
    sample_ids = [s.id for s in samples]
    violations_by_sample = await violation_repo.get_by_sample_ids(sample_ids)

    # Convert samples to chart samples
    from openspc.utils.statistics import classify_zone, calculate_mean_range
    import numpy as np

    chart_samples = []
    for sample in samples:
        values = [m.value for m in sample.measurements]
        value, range_value = calculate_mean_range(values)
        std_dev_value: float | None = None
        if len(values) >= 2:
            std_dev_value = float(np.std(values, ddof=1))

        # Classify zone using shared utility
        zone = classify_zone(value, zones, center_line)

        # Get violations for this sample from batch-loaded data
        sample_violations = violations_by_sample.get(sample.id, [])
        violation_ids = [v.id for v in sample_violations]
        violation_rules = list(set(v.rule_id for v in sample_violations))

        chart_samples.append(ChartSample(
            sample_id=sample.id,
            timestamp=sample.timestamp.isoformat(),
            mean=value,
            range=range_value,
            std_dev=std_dev_value,
            excluded=sample.is_excluded,
            violation_ids=violation_ids,
            violation_rules=violation_rules,
            zone=zone,
            actual_n=sample.actual_n or len(values),
            is_undersized=sample.is_undersized,
            effective_ucl=sample.effective_ucl,
            effective_lcl=sample.effective_lcl,
            z_score=sample.z_score,
            display_value=sample.z_score if characteristic.subgroup_mode == "STANDARDIZED" else value,
        ))

    control_limits = ControlLimits(
        center_line=center_line,
        ucl=characteristic.ucl,
        lcl=characteristic.lcl,
    )

    spec_limits = SpecLimits(
        usl=characteristic.usl,
        lsl=characteristic.lsl,
        target=characteristic.target_value,
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
    )


@router.post("/{char_id}/recalculate-limits")
async def recalculate_limits(
    char_id: int,
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
    request: SetLimitsRequest,
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
    characteristic.ucl = request.ucl
    characteristic.lcl = request.lcl
    characteristic.stored_center_line = request.center_line
    characteristic.stored_sigma = request.sigma

    await session.commit()

    # Invalidate rolling window cache
    window_manager = RollingWindowManager(sample_repo)
    await window_manager.invalidate(char_id)

    # Publish event
    from openspc.core.events import ControlLimitsUpdatedEvent, event_bus

    event = ControlLimitsUpdatedEvent(
        characteristic_id=char_id,
        center_line=request.center_line,
        ucl=request.ucl,
        lcl=request.lcl,
        method="manual",
        sample_count=0,
        timestamp=datetime.now(timezone.utc),
    )
    await event_bus.publish(event)

    return ControlLimitsResponse(
        before=before,
        after={
            "ucl": request.ucl,
            "lcl": request.lcl,
            "center_line": request.center_line,
        },
        calculation={
            "method": "manual",
            "sigma": request.sigma,
            "sample_count": 0,
            "excluded_count": 0,
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        },
    )


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
    from openspc.db.models.sample import Measurement, Sample as SampleModel
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
