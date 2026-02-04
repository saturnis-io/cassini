"""Characteristic REST endpoints for OpenSPC.

Provides CRUD operations, chart data, limit recalculation, and rule management
for SPC characteristics.
"""

from datetime import datetime
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
    NelsonRuleConfig,
    SpecLimits,
    ZoneBoundaries,
)
from openspc.api.schemas.common import PaginatedResponse, PaginationParams
from openspc.core.engine.control_limits import ControlLimitService
from openspc.core.engine.rolling_window import RollingWindowManager
from openspc.db.database import get_session
from openspc.db.models.characteristic import Characteristic, CharacteristicRule
from openspc.db.repositories import CharacteristicRepository, SampleRepository

router = APIRouter(prefix="/api/v1/characteristics", tags=["characteristics"])


# Dependency for CharacteristicRepository
async def get_characteristic_repository(
    session: AsyncSession = Depends(get_session),
) -> CharacteristicRepository:
    """Dependency to get CharacteristicRepository instance."""
    return CharacteristicRepository(session)


# Dependency for SampleRepository
async def get_sample_repository(
    session: AsyncSession = Depends(get_session),
) -> SampleRepository:
    """Dependency to get SampleRepository instance."""
    return SampleRepository(session)


# Dependency for ControlLimitService
async def get_control_limit_service(
    session: AsyncSession = Depends(get_session),
) -> ControlLimitService:
    """Dependency to get ControlLimitService instance."""
    char_repo = CharacteristicRepository(session)
    sample_repo = SampleRepository(session)
    # Create window manager with default settings
    window_manager = RollingWindowManager(sample_repo)
    return ControlLimitService(sample_repo, char_repo, window_manager)


@router.get("/", response_model=PaginatedResponse[CharacteristicResponse])
async def list_characteristics(
    hierarchy_id: int | None = Query(None, description="Filter by hierarchy node ID"),
    provider_type: str | None = Query(None, description="Filter by provider type (MANUAL, TAG)"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of items to return"),
    session: AsyncSession = Depends(get_session),
) -> PaginatedResponse[CharacteristicResponse]:
    """List characteristics with filtering and pagination.

    Supports filtering by hierarchy node and provider type.
    Returns paginated results with total count.
    """
    repo = CharacteristicRepository(session)

    # Build query with filters
    stmt = select(Characteristic)

    if hierarchy_id is not None:
        stmt = stmt.where(Characteristic.hierarchy_id == hierarchy_id)

    if provider_type is not None:
        stmt = stmt.where(Characteristic.provider_type == provider_type)

    # Get total count for pagination
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    # Apply pagination and execute
    stmt = stmt.offset(offset).limit(limit).order_by(Characteristic.id)
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
    session: AsyncSession = Depends(get_session),
) -> CharacteristicResponse:
    """Create a new characteristic.

    Validates that the hierarchy node exists and that mqtt_topic is provided
    for TAG provider type.
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

    # Create characteristic
    characteristic = await repo.create(**data.model_dump())

    # Initialize Nelson Rules configuration (all enabled by default)
    for rule_id in range(1, 9):
        rule = CharacteristicRule(
            char_id=characteristic.id,
            rule_id=rule_id,
            is_enabled=True,
        )
        session.add(rule)

    await session.commit()
    await session.refresh(characteristic)

    return CharacteristicResponse.model_validate(characteristic)


@router.get("/{char_id}", response_model=CharacteristicResponse)
async def get_characteristic(
    char_id: int,
    repo: CharacteristicRepository = Depends(get_characteristic_repository),
) -> CharacteristicResponse:
    """Get characteristic details by ID."""
    characteristic = await repo.get_by_id(char_id)
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
    repo: CharacteristicRepository = Depends(get_characteristic_repository),
    session: AsyncSession = Depends(get_session),
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

    # Update only provided fields
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(characteristic, key, value)

    await session.commit()
    await session.refresh(characteristic)

    return CharacteristicResponse.model_validate(characteristic)


@router.delete("/{char_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_characteristic(
    char_id: int,
    repo: CharacteristicRepository = Depends(get_characteristic_repository),
    session: AsyncSession = Depends(get_session),
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
    repo: CharacteristicRepository = Depends(get_characteristic_repository),
    sample_repo: SampleRepository = Depends(get_sample_repository),
    session: AsyncSession = Depends(get_session),
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

    # Calculate center line and sigma from control limits
    center_line = (characteristic.ucl + characteristic.lcl) / 2
    sigma = (characteristic.ucl - center_line) / 3

    # Calculate zone boundaries
    zones = ZoneBoundaries(
        plus_1_sigma=center_line + sigma,
        plus_2_sigma=center_line + 2 * sigma,
        plus_3_sigma=characteristic.ucl,
        minus_1_sigma=center_line - sigma,
        minus_2_sigma=center_line - 2 * sigma,
        minus_3_sigma=characteristic.lcl,
    )

    # Load violations for each sample
    from openspc.db.repositories import ViolationRepository
    violation_repo = ViolationRepository(session)

    # Convert samples to chart samples
    chart_samples = []
    for sample in samples:
        # Calculate sample value (mean of measurements)
        values = [m.value for m in sample.measurements]
        value = sum(values) / len(values) if values else 0.0

        # Calculate range for subgroups
        range_value = None
        if len(values) > 1:
            range_value = max(values) - min(values)

        # Classify zone
        if value >= zones.plus_3_sigma:
            zone = "beyond_ucl"
        elif value >= zones.plus_2_sigma:
            zone = "zone_a_upper"
        elif value >= zones.plus_1_sigma:
            zone = "zone_b_upper"
        elif value >= center_line:
            zone = "zone_c_upper"
        elif value >= zones.minus_1_sigma:
            zone = "zone_c_lower"
        elif value >= zones.minus_2_sigma:
            zone = "zone_b_lower"
        elif value >= zones.minus_3_sigma:
            zone = "zone_a_lower"
        else:
            zone = "beyond_lcl"

        # Get violations for this sample
        violations = await violation_repo.get_by_sample(sample.id)
        violation_ids = [v.id for v in violations]

        chart_samples.append(ChartSample(
            sample_id=sample.id,
            timestamp=sample.timestamp.isoformat(),
            mean=value,
            range=range_value,
            excluded=sample.is_excluded,
            violation_ids=violation_ids,
            zone=zone,
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
    )


@router.post("/{char_id}/recalculate-limits")
async def recalculate_limits(
    char_id: int,
    exclude_ooc: bool = Query(False, description="Exclude out-of-control samples from calculation"),
    min_samples: int = Query(25, ge=1, description="Minimum samples required for calculation"),
    service: ControlLimitService = Depends(get_control_limit_service),
    repo: CharacteristicRepository = Depends(get_characteristic_repository),
    session: AsyncSession = Depends(get_session),
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
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
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
        },
    }


@router.get("/{char_id}/rules", response_model=list[NelsonRuleConfig])
async def get_rules(
    char_id: int,
    repo: CharacteristicRepository = Depends(get_characteristic_repository),
) -> list[NelsonRuleConfig]:
    """Get Nelson Rule configuration for characteristic.

    Returns the enabled/disabled state for all 8 Nelson Rules.
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
        NelsonRuleConfig(rule_id=rule.rule_id, is_enabled=rule.is_enabled)
        for rule in characteristic.rules
    ]

    # Ensure all 8 rules are present (fill in defaults if missing)
    existing_rule_ids = {rule.rule_id for rule in rules}
    for rule_id in range(1, 9):
        if rule_id not in existing_rule_ids:
            rules.append(NelsonRuleConfig(rule_id=rule_id, is_enabled=True))

    # Sort by rule_id
    rules.sort(key=lambda r: r.rule_id)

    return rules


@router.put("/{char_id}/rules", response_model=list[NelsonRuleConfig])
async def update_rules(
    char_id: int,
    rules: list[NelsonRuleConfig],
    repo: CharacteristicRepository = Depends(get_characteristic_repository),
    session: AsyncSession = Depends(get_session),
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
        )
        session.add(rule)

    await session.commit()

    # Return updated rules
    await session.refresh(characteristic)
    return [
        NelsonRuleConfig(rule_id=rule.rule_id, is_enabled=rule.is_enabled)
        for rule in characteristic.rules
    ]


@router.post("/{char_id}/change-mode", response_model=ChangeModeResponse)
async def change_subgroup_mode(
    char_id: int,
    request: ChangeModeRequest,
    repo: CharacteristicRepository = Depends(get_characteristic_repository),
    sample_repo: SampleRepository = Depends(get_sample_repository),
    session: AsyncSession = Depends(get_session),
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

    # Validate prerequisites for Mode A/B
    if new_mode in ("STANDARDIZED", "VARIABLE_LIMITS"):
        if characteristic.stored_sigma is None or characteristic.stored_center_line is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="stored_sigma and stored_center_line must be set. Run recalculate-limits first."
            )

    # Get all samples for this characteristic
    samples = await sample_repo.get_by_characteristic(char_id)
    samples_migrated = 0

    # Recalculate values for each sample based on new mode
    for sample in samples:
        actual_n = sample.actual_n or 1

        if new_mode == "STANDARDIZED":
            # Calculate z_score
            if characteristic.stored_sigma > 0:
                sigma_x_bar = characteristic.stored_sigma / math.sqrt(actual_n)
                sample.z_score = (sample.mean - characteristic.stored_center_line) / sigma_x_bar
            else:
                sample.z_score = 0.0
            # Clear variable limit fields
            sample.effective_ucl = None
            sample.effective_lcl = None

        elif new_mode == "VARIABLE_LIMITS":
            # Calculate effective limits based on actual_n
            sigma_x_bar = characteristic.stored_sigma / math.sqrt(actual_n)
            sample.effective_ucl = characteristic.stored_center_line + 3 * sigma_x_bar
            sample.effective_lcl = characteristic.stored_center_line - 3 * sigma_x_bar
            # Clear z_score
            sample.z_score = None

        else:  # NOMINAL_TOLERANCE
            # Clear mode-specific fields
            sample.z_score = None
            sample.effective_ucl = None
            sample.effective_lcl = None

        samples_migrated += 1

    # Update the characteristic's subgroup_mode
    characteristic.subgroup_mode = new_mode

    # Commit all changes atomically
    await session.commit()
    await session.refresh(characteristic)

    return ChangeModeResponse(
        previous_mode=previous_mode,
        new_mode=new_mode,
        samples_migrated=samples_migrated,
        characteristic=CharacteristicResponse.model_validate(characteristic),
    )
