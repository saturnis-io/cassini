"""Sample REST endpoints for Cassini.

This module provides REST API endpoints for manual sample submission,
retrieval, and management. Samples are processed through the SPC engine
and evaluated against Nelson Rules.
"""

import structlog
from datetime import datetime

logger = structlog.get_logger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_characteristic_repo as get_char_repo,
    get_current_user,
    get_db_session,
    get_sample_repo,
    get_violation_repo,
    resolve_plant_id_for_characteristic,
)
from cassini.db.models.user import User
from cassini.api.schemas.common import PaginatedResponse, PaginationParams
from cassini.api.schemas.sample import (
    SampleCreate,
    SampleExclude,
    SampleResponse,
    SampleUpdate,
    SampleEditHistoryResponse,
)
from cassini.core.engine.nelson_rules import NelsonRuleLibrary
from cassini.core.engine.rolling_window import RollingWindowManager, get_shared_window_manager
from cassini.core.engine.spc_engine import SPCEngine, extract_char_data
from cassini.core.engine.spc_guard import check_no_pending_spc
from cassini.core.providers.manual import ManualProvider
from cassini.core.providers.protocol import SampleContext
from cassini.db.repositories import (
    CharacteristicRepository,
    SampleRepository,
    ViolationRepository,
)
from cassini.utils.statistics import calculate_mean_range, calculate_zones, classify_zone, ZoneBoundaries

router = APIRouter(prefix="/api/v1/samples", tags=["samples"])


# Response Models
class ViolationInfo(BaseModel):
    """Information about a rule violation.

    Attributes:
        violation_id: Database ID of the violation record
        rule_id: Nelson Rule number (1-8)
        rule_name: Human-readable rule name
        severity: Severity level (WARNING or CRITICAL)
    """
    violation_id: int
    rule_id: int
    rule_name: str
    severity: str


class SampleProcessingResult(BaseModel):
    """Response from sample submission.

    Attributes:
        sample_id: Database ID of the created sample
        timestamp: When the sample was taken
        mean: Sample mean (average of measurements)
        range_value: Sample range (max-min) for subgroups, None for n=1
        zone: Zone classification (e.g., "zone_c_upper")
        in_control: True if no violations were triggered
        violations: List of violations that were triggered
        processing_time_ms: Time taken to process in milliseconds
    """
    sample_id: int
    timestamp: datetime
    mean: float
    range_value: float | None
    zone: str
    in_control: bool
    violations: list[ViolationInfo]
    processing_time_ms: float


class BatchImportResult(BaseModel):
    """Result from batch import operation.

    Attributes:
        total: Total number of samples submitted
        imported: Number of samples successfully processed
        successful: Alias for imported (backward compat)
        failed: Number of samples that failed
        errors: List of error messages for failed samples
        status: "complete" for sync imports, "processing" for async SPC
        sample_ids: Inserted sample IDs (populated in async mode)
    """
    total: int
    imported: int
    failed: int
    errors: list[str]
    status: str = "complete"
    sample_ids: list[int] | None = None

    @property
    def successful(self) -> int:
        return self.imported


async def get_spc_engine(
    sample_repo: SampleRepository = Depends(get_sample_repo),
    char_repo: CharacteristicRepository = Depends(get_char_repo),
    violation_repo: ViolationRepository = Depends(get_violation_repo),
) -> SPCEngine:
    """Get SPC engine instance with all dependencies."""
    window_manager = get_shared_window_manager()
    rule_library = NelsonRuleLibrary()

    return SPCEngine(
        sample_repo=sample_repo,
        char_repo=char_repo,
        violation_repo=violation_repo,
        window_manager=window_manager,
        rule_library=rule_library,
    )


async def get_manual_provider(
    char_repo: CharacteristicRepository = Depends(get_char_repo),
) -> ManualProvider:
    """Get manual provider instance."""
    return ManualProvider(char_repo)


async def get_window_manager(
    sample_repo: SampleRepository = Depends(get_sample_repo),
) -> RollingWindowManager:
    """Get rolling window manager instance."""
    return get_shared_window_manager()


# Endpoints
@router.get("/", response_model=PaginatedResponse[SampleResponse])
async def list_samples(
    characteristic_id: int | None = Query(None, description="Filter by characteristic ID"),
    start_date: datetime | None = Query(None, description="Filter by start date (inclusive)"),
    end_date: datetime | None = Query(None, description="Filter by end date (inclusive)"),
    include_excluded: bool = Query(False, description="Include excluded samples"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of items to return"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$", description="Sort direction for timestamp (asc or desc)"),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    _user: User = Depends(get_current_user),
) -> PaginatedResponse[SampleResponse]:
    """List samples with filtering and pagination.

    Retrieve samples with optional filtering by characteristic, date range,
    and exclusion status. Results are paginated for efficient data transfer.

    Args:
        characteristic_id: Optional characteristic ID to filter by
        start_date: Optional start date for filtering (inclusive)
        end_date: Optional end date for filtering (inclusive)
        include_excluded: If True, include excluded samples in results
        offset: Number of items to skip for pagination
        limit: Maximum number of items to return
        sample_repo: Sample repository dependency

    Returns:
        Paginated response containing list of samples with metadata

    Raises:
        HTTPException: 404 if characteristic not found (when filtering by characteristic)
    """
    # Build base query with filters pushed to SQL
    from sqlalchemy import func as sa_func, select
    from sqlalchemy.orm import selectinload
    from cassini.db.models.sample import Sample

    base_stmt = select(Sample)

    if characteristic_id is not None:
        base_stmt = base_stmt.where(Sample.char_id == characteristic_id)
    if start_date is not None:
        base_stmt = base_stmt.where(Sample.timestamp >= start_date)
    if end_date is not None:
        base_stmt = base_stmt.where(Sample.timestamp <= end_date)
    if not include_excluded:
        base_stmt = base_stmt.where(Sample.is_excluded.is_(False))

    # Get total count via SQL (no full-table load)
    count_stmt = select(sa_func.count()).select_from(base_stmt.subquery())
    total = (await sample_repo.session.execute(count_stmt)).scalar_one()

    # Paginate at SQL level
    paginated_stmt = (
        base_stmt
        .options(
            selectinload(Sample.measurements),
            selectinload(Sample.edit_history),
        )
        .order_by(Sample.timestamp.desc() if sort_dir == "desc" else Sample.timestamp.asc())
        .offset(offset)
        .limit(limit)
        .execution_options(populate_existing=True)
    )
    result = await sample_repo.session.execute(paginated_stmt)
    paginated_samples = list(result.scalars().all())

    # Compute display keys — handles cross-char samples by grouping per char_id
    from cassini.utils.display_keys import compute_display_keys
    from collections import defaultdict as _defaultdict

    _by_char: dict[int, list] = _defaultdict(list)
    for sample in paginated_samples:
        _by_char[sample.char_id].append(sample)
    _display_keys: dict[int, str] = {}
    for cid, char_samples in _by_char.items():
        _display_keys.update(
            await compute_display_keys(char_samples, cid, sample_repo.session)
        )

    # Batch-load attribute_chart_type for all unique char_ids (avoids N+1)
    from cassini.db.models.characteristic import Characteristic
    _attr_char_ids = {s.char_id for s in paginated_samples if s.defect_count is not None}
    _chart_type_map: dict[int, str] = {}
    if _attr_char_ids:
        _ct_result = await sample_repo.session.execute(
            select(Characteristic.id, Characteristic.attribute_chart_type)
            .where(Characteristic.id.in_(_attr_char_ids))
        )
        _chart_type_map = {row[0]: (row[1] or "c") for row in _ct_result}

    # Convert to response models
    response_items = []
    for sample in paginated_samples:
        measurements = [m.value for m in sample.measurements]
        mean, range_value = calculate_mean_range(measurements)

        # For attribute samples, compute plotted value from defect data
        if sample.defect_count is not None and not measurements:
            dc = sample.defect_count
            ss = sample.sample_size or 1
            ui = sample.units_inspected or 1
            attr_ct = _chart_type_map.get(sample.char_id, "c")
            if attr_ct == "p":
                mean = dc / ss if ss > 0 else 0.0
            elif attr_ct == "u":
                mean = dc / ui if ui > 0 else 0.0
            else:
                mean = float(dc)

        # Get edit count if edit_history is loaded (defensive for pre-migration)
        edit_count = 0
        is_modified = False
        try:
            is_modified = getattr(sample, 'is_modified', False) or False
            if hasattr(sample, 'edit_history') and sample.edit_history:
                edit_count = len(sample.edit_history)
        except Exception:
            # Migration may not have run yet - gracefully handle missing columns
            pass

        response_items.append(
            SampleResponse(
                id=sample.id,
                char_id=sample.char_id,
                timestamp=sample.timestamp,
                batch_number=sample.batch_number,
                operator_id=sample.operator_id,
                is_excluded=sample.is_excluded,
                measurements=measurements,
                mean=mean,
                range_value=range_value,
                actual_n=sample.actual_n or len(measurements),
                is_undersized=sample.is_undersized,
                effective_ucl=sample.effective_ucl,
                effective_lcl=sample.effective_lcl,
                z_score=sample.z_score,
                is_modified=is_modified,
                edit_count=edit_count,
                display_key=_display_keys.get(sample.id, ""),
                defect_count=sample.defect_count,
                sample_size=sample.sample_size,
                units_inspected=sample.units_inspected,
                material_id=sample.material_id,
                source=getattr(sample, 'source', 'MANUAL'),
                metadata=getattr(sample, 'custom_metadata', None),
            )
        )

    return PaginatedResponse(
        items=response_items,
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("/", response_model=SampleProcessingResult, status_code=status.HTTP_201_CREATED)
async def submit_sample(
    data: SampleCreate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    engine: SPCEngine = Depends(get_spc_engine),
    provider: ManualProvider = Depends(get_manual_provider),
    _user: User = Depends(get_current_user),
) -> SampleProcessingResult:
    """Submit a manual sample for SPC processing.

    This is the main endpoint for operator data entry. The sample is validated,
    processed through the SPC engine, evaluated against Nelson Rules, and
    violations are returned in the response.

    Args:
        data: Sample creation data including characteristic_id and measurements
        session: Database session dependency
        engine: SPC engine dependency
        provider: Manual provider dependency

    Returns:
        Processing result including violations and statistics

    Raises:
        HTTPException: 400 if validation fails (characteristic not found, wrong
                      measurement count, etc.)
        HTTPException: 500 if processing fails
    """
    # Plant-scoped authorization: operator+ at the owning plant
    plant_id = await resolve_plant_id_for_characteristic(data.characteristic_id, session)
    check_plant_role(_user, plant_id, "operator")

    # Guard: reject if async batch SPC is still processing for this characteristic
    try:
        await check_no_pending_spc(session, data.characteristic_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This characteristic has pending async SPC processing. Please wait.",
        )

    try:
        # Look up characteristic for supplementary analysis params
        char_repo = CharacteristicRepository(session)
        characteristic = await char_repo.get_by_id(data.characteristic_id)
        if characteristic is None:
            raise ValueError(f"Characteristic {data.characteristic_id} not found")

        # Enforce manual entry policy
        policy = getattr(characteristic, 'manual_entry_policy', 'open')
        if policy == "locked":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Manual entry is disabled for this characteristic.",
            )
        if policy == "restricted":
            # check_plant_role already verified operator+ access above
            # For restricted, we need supervisor+
            check_plant_role(_user, plant_id, "supervisor")

        # Audit: enrich context for manual entries on characteristics with non-open policy
        # Note: avoid accessing characteristic.data_source (relationship) without selectinload.
        # Policy != "open" is a reliable proxy — auto-set ensures supplemental/restricted/locked
        # only exist on characteristics with (or formerly with) a data source.
        if policy in ("supplemental", "restricted"):
            request.state.audit_context = {
                "resource_type": "sample",
                "action": "manual_override",
                "summary": f"Manual entry on automated ({policy}) characteristic '{characteristic.name}'",
                "fields": {
                    "characteristic_id": data.characteristic_id,
                    "policy": policy,
                    "user": _user.username,
                    "measurement_count": len(data.measurements),
                },
            }

        # Validate material belongs to the same plant as the characteristic
        if data.material_id is not None:
            from sqlalchemy import select as sa_select
            from cassini.db.models.material import Material
            mat_stmt = sa_select(Material.plant_id).where(Material.id == data.material_id)
            mat_result = await session.execute(mat_stmt)
            mat_plant_id = mat_result.scalar_one_or_none()
            if mat_plant_id is None:
                raise ValueError(f"Material {data.material_id} not found")
            if mat_plant_id != plant_id:
                raise ValueError("Material does not belong to the same plant as the characteristic")

        # Validate custom metadata against characteristic schema if provided
        validated_metadata = None
        if data.metadata:
            from cassini.core.metadata_validator import validate_metadata
            schema = getattr(characteristic, 'custom_fields_schema', None)
            validated_metadata = validate_metadata(data.metadata, schema, strict=True) or None

        # Always run standard SPC engine first (Nelson Rules, zone classification)
        context = SampleContext(
            batch_number=data.batch_number,
            operator_id=data.operator_id,
            material_id=data.material_id,
            source="MANUAL",
            metadata=validated_metadata,
        )

        result = await engine.process_sample(
            characteristic_id=data.characteristic_id,
            measurements=data.measurements,
            context=context,
        )

        # Additionally run CUSUM/EWMA analysis if params are configured
        # Use subgroup mean for supplementary analysis (matches standard SPC)
        _subgroup_mean = sum(data.measurements) / len(data.measurements)
        if characteristic.cusum_target is not None and characteristic.cusum_k is not None:
            try:
                from cassini.core.engine.cusum_engine import process_cusum_supplementary
                await process_cusum_supplementary(
                    sample_id=result.sample_id,
                    char=characteristic,
                    measurement=_subgroup_mean,
                    sample_repo=SampleRepository(session),
                    violation_repo=ViolationRepository(session),
                )
            except Exception:
                logger.warning("cusum_supplementary_failed", char_id=data.characteristic_id)

        if characteristic.ewma_lambda is not None:
            try:
                from cassini.core.engine.ewma_engine import process_ewma_supplementary
                await process_ewma_supplementary(
                    sample_id=result.sample_id,
                    char=characteristic,
                    measurement=_subgroup_mean,
                    sample_repo=SampleRepository(session),
                    violation_repo=ViolationRepository(session),
                )
            except Exception:
                logger.warning("ewma_supplementary_failed", char_id=data.characteristic_id)

        # Commit the transaction
        await session.commit()

        # Convert violations to API response format
        # The violations were already created in the engine
        violation_repo = ViolationRepository(session)
        violation_records = await violation_repo.get_by_sample(result.sample_id)

        violations = []
        for vr in violation_records:
            violations.append(
                ViolationInfo(
                    violation_id=vr.id,
                    rule_id=vr.rule_id,
                    rule_name=vr.rule_name or "",
                    severity=vr.severity,
                )
            )

        request.state.audit_context = {
            "resource_type": "sample",
            "resource_id": result.sample_id,
            "action": "create",
            "summary": f"Sample submitted for '{characteristic.name}': {data.measurements}",
            "fields": {
                "characteristic_name": characteristic.name,
                "characteristic_id": characteristic.id,
                "measurements": data.measurements,
                "subgroup_size": len(data.measurements),
                "chart_type": characteristic.chart_type,
            },
        }

        return SampleProcessingResult(
            sample_id=result.sample_id,
            timestamp=result.timestamp,
            mean=result.mean,
            range_value=result.range_value,
            zone=result.zone,
            in_control=result.in_control,
            violations=violations,
            processing_time_ms=result.processing_time_ms,
        )

    except ValueError as e:
        # Validation errors (characteristic not found, wrong measurement count, etc.)
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid input")
    except Exception:
        # Unexpected errors
        await session.rollback()
        logger.exception("Failed to process sample")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process sample",
        )


@router.get("/{sample_id}", response_model=SampleResponse)
async def get_sample(
    sample_id: int,
    sample_repo: SampleRepository = Depends(get_sample_repo),
    _user: User = Depends(get_current_user),
) -> SampleResponse:
    """Get a sample by ID with measurements.

    Retrieve detailed information about a specific sample including all
    measurement values and calculated statistics.

    Args:
        sample_id: ID of the sample to retrieve
        sample_repo: Sample repository dependency

    Returns:
        Sample details with measurements and statistics

    Raises:
        HTTPException: 404 if sample not found
    """
    sample = await sample_repo.get_by_id(sample_id)

    if sample is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample {sample_id} not found",
        )

    # Calculate statistics
    measurements = [m.value for m in sample.measurements]
    mean, range_value = calculate_mean_range(measurements)

    # For attribute samples, use defect_count-based plotted value instead of empty measurements mean
    if sample.defect_count is not None and not measurements:
        # Compute the plotted value the same way the attribute SPC engine does
        dc = sample.defect_count
        ss = sample.sample_size or 1
        ui = sample.units_inspected or 1
        # Lookup characteristic to determine chart type
        from cassini.db.models.characteristic import Characteristic
        char_result = await sample_repo.session.execute(
            select(Characteristic.attribute_chart_type).where(Characteristic.id == sample.char_id)
        )
        attr_chart_type = char_result.scalar_one_or_none() or "c"
        if attr_chart_type == "p":
            mean = dc / ss if ss > 0 else 0.0
        elif attr_chart_type == "np":
            mean = float(dc)
        elif attr_chart_type == "u":
            mean = dc / ui if ui > 0 else 0.0
        else:  # c
            mean = float(dc)

    # Compute display key via shared utility
    from cassini.utils.display_keys import compute_display_keys
    _dk_map = await compute_display_keys([sample], sample.char_id, sample_repo.session)
    display_key = _dk_map.get(sample.id, "")

    return SampleResponse(
        id=sample.id,
        char_id=sample.char_id,
        timestamp=sample.timestamp,
        batch_number=sample.batch_number,
        operator_id=sample.operator_id,
        is_excluded=sample.is_excluded,
        measurements=measurements,
        mean=mean,
        range_value=range_value,
        display_key=display_key,
        defect_count=sample.defect_count,
        sample_size=sample.sample_size,
        units_inspected=sample.units_inspected,
        metadata=getattr(sample, 'custom_metadata', None),
    )


@router.patch("/{sample_id}/exclude", response_model=SampleResponse)
async def toggle_exclude(
    sample_id: int,
    data: SampleExclude,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    _user: User = Depends(get_current_user),
) -> SampleResponse:
    """Mark sample as excluded from calculations.

    Toggle the exclusion status of a sample. Excluded samples are not used
    in control limit calculations or Nelson Rule evaluation. This triggers
    a rolling window rebuild for the characteristic.

    Args:
        sample_id: ID of the sample to update
        data: Exclusion data including is_excluded flag and optional reason
        session: Database session dependency
        sample_repo: Sample repository dependency

    Returns:
        Updated sample details

    Raises:
        HTTPException: 404 if sample not found
        HTTPException: 500 if update fails
    """
    try:
        sample = await sample_repo.get_by_id(sample_id)

        if sample is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sample {sample_id} not found",
            )

        # Plant-scoped authorization
        plant_id = await resolve_plant_id_for_characteristic(sample.char_id, session)
        check_plant_role(_user, plant_id, "supervisor")

        # Update exclusion status
        sample.is_excluded = data.is_excluded

        # Note: The reason field is not stored in the Sample model currently
        # If needed, it could be added to the model or stored in a separate audit table

        await session.commit()

        # Invalidate the rolling window to trigger rebuild
        # This ensures the excluded sample is not used in rule evaluation
        window_manager = get_shared_window_manager()
        await window_manager.invalidate(sample.char_id)

        # Calculate statistics
        measurements = [m.value for m in sample.measurements]
        mean, range_value = calculate_mean_range(measurements)

        # For attribute samples, compute plotted value from defect data
        if sample.defect_count is not None and not measurements:
            dc = sample.defect_count
            ss = sample.sample_size or 1
            ui = sample.units_inspected or 1
            from cassini.db.models.characteristic import Characteristic
            char_result = await session.execute(
                select(Characteristic.attribute_chart_type).where(Characteristic.id == sample.char_id)
            )
            attr_ct = char_result.scalar_one_or_none() or "c"
            if attr_ct == "p":
                mean = dc / ss if ss > 0 else 0.0
            elif attr_ct == "u":
                mean = dc / ui if ui > 0 else 0.0
            else:
                mean = float(dc)

        action_word = "excluded" if data.is_excluded else "included"
        request.state.audit_context = {
            "resource_type": "sample",
            "resource_id": sample_id,
            "action": "update",
            "summary": f"Sample #{sample_id} {action_word} from control limits",
            "fields": {
                "is_excluded": data.is_excluded,
                "change_reason": data.reason,
            },
        }

        return SampleResponse(
            id=sample.id,
            char_id=sample.char_id,
            timestamp=sample.timestamp,
            batch_number=sample.batch_number,
            operator_id=sample.operator_id,
            is_excluded=sample.is_excluded,
            measurements=measurements,
            mean=mean,
            range_value=range_value,
            defect_count=sample.defect_count,
            sample_size=sample.sample_size,
            units_inspected=sample.units_inspected,
        )

    except HTTPException:
        await session.rollback()
        raise
    except Exception:
        await session.rollback()
        logger.exception("Failed to update sample exclusion status")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update sample",
        )


@router.delete("/{sample_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_sample(
    sample_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    window_manager: RollingWindowManager = Depends(get_window_manager),
    _user: User = Depends(get_current_user),
) -> None:
    """Delete a sample and its measurements permanently.

    Cascade deletes measurements and violations. Invalidates rolling
    window to trigger recalculation of statistics.

    Args:
        sample_id: ID of the sample to delete
        session: Database session dependency
        sample_repo: Sample repository dependency
        window_manager: Rolling window manager dependency

    Raises:
        HTTPException: 404 if sample not found
        HTTPException: 500 if deletion fails
    """
    try:
        sample = await sample_repo.get_by_id(sample_id)

        if sample is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sample {sample_id} not found",
            )

        # Plant-scoped authorization
        plant_id = await resolve_plant_id_for_characteristic(sample.char_id, session)
        check_plant_role(_user, plant_id, "supervisor")

        char_id = sample.char_id

        # Delete the sample (measurements and violations cascade via FK)
        await session.delete(sample)
        await session.commit()

        # Invalidate the rolling window to trigger rebuild
        await window_manager.invalidate(char_id)

        request.state.audit_context = {
            "resource_type": "sample",
            "resource_id": sample_id,
            "action": "delete",
            "summary": f"Sample #{sample_id} deleted",
            "fields": {},
        }

    except HTTPException:
        await session.rollback()
        raise
    except Exception:
        await session.rollback()
        logger.exception("Failed to delete sample")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete sample",
        )


@router.put("/{sample_id}", response_model=SampleProcessingResult)
async def update_sample(
    sample_id: int,
    data: SampleUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    char_repo: CharacteristicRepository = Depends(get_char_repo),
    window_manager: RollingWindowManager = Depends(get_window_manager),
    violation_repo: ViolationRepository = Depends(get_violation_repo),
    _user: User = Depends(get_current_user),
) -> SampleProcessingResult:
    """Update sample measurements and recalculate statistics.

    Replaces all measurements for the sample, recalculates statistics,
    re-evaluates Nelson Rules, and invalidates the rolling window.

    Args:
        sample_id: ID of the sample to update
        data: New measurement values
        session: Database session dependency
        sample_repo: Sample repository dependency
        char_repo: Characteristic repository dependency
        window_manager: Rolling window manager dependency
        violation_repo: Violation repository dependency

    Returns:
        Updated sample processing result with new statistics and violations

    Raises:
        HTTPException: 404 if sample not found
        HTTPException: 400 if validation fails
        HTTPException: 500 if update fails
    """
    import json
    import time

    start_time = time.perf_counter()

    try:
        sample = await sample_repo.get_by_id(sample_id)

        if sample is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Sample {sample_id} not found",
            )

        # Plant-scoped authorization
        plant_id = await resolve_plant_id_for_characteristic(sample.char_id, session)
        check_plant_role(_user, plant_id, "supervisor")

        # Get characteristic with rules eagerly loaded
        characteristic = await char_repo.get_with_rules(sample.char_id)
        if characteristic is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Characteristic {sample.char_id} not found",
            )

        # Store previous values for audit trail
        previous_values = [m.value for m in sample.measurements]
        previous_mean = sum(previous_values) / len(previous_values) if previous_values else 0.0

        # Delete existing measurements
        from cassini.db.models.sample import Measurement, SampleEditHistory

        for measurement in sample.measurements:
            await session.delete(measurement)

        # Delete existing violations for this sample
        existing_violations = await violation_repo.get_by_sample(sample_id)
        for violation in existing_violations:
            await session.delete(violation)

        # Create new measurements
        new_measurements = []
        for value in data.measurements:
            m = Measurement(
                sample_id=sample_id,
                value=value,
            )
            session.add(m)
            new_measurements.append(m)

        # Calculate new mean for edit history
        new_mean = sum(data.measurements) / len(data.measurements)

        # Create edit history record -- always use authenticated user's username
        edit_history = SampleEditHistory(
            sample_id=sample_id,
            edited_by=_user.username,
            reason=data.reason,
            previous_values=json.dumps(previous_values),
            new_values=json.dumps(data.measurements),
            previous_mean=previous_mean,
            new_mean=new_mean,
        )
        session.add(edit_history)

        # Mark sample as modified
        sample.is_modified = True

        await session.flush()

        # Calculate new statistics
        values = data.measurements
        mean, range_value = calculate_mean_range(values)

        # Determine zone based on control limits using shared utility
        zone = "unknown"
        if characteristic.ucl is not None and characteristic.lcl is not None:
            center = (characteristic.ucl + characteristic.lcl) / 2
            sigma = (characteristic.ucl - center) / 3
            if sigma > 0:
                zones = calculate_zones(center, sigma)
                zone = classify_zone(mean, zones, center)
            elif mean > characteristic.ucl or mean < characteristic.lcl:
                zone = "beyond_ucl" if mean > characteristic.ucl else "beyond_lcl"

        # Re-run Nelson Rules evaluation
        # Invalidate rolling window cache BEFORE re-evaluation so get_window()
        # reloads from DB with the updated measurements (flushed above).
        await window_manager.invalidate(sample.char_id)

        rule_library = NelsonRuleLibrary()

        # Apply custom rule parameters from characteristic config (Sprint 5 - A2)
        import json as _json
        rule_configs = []
        for rule in characteristic.rules:
            params = None
            if rule.parameters:
                try:
                    params = _json.loads(rule.parameters)
                except (ValueError, TypeError):
                    params = None
            rule_configs.append({
                "rule_id": rule.rule_id,
                "is_enabled": rule.is_enabled,
                "parameters": params,
            })
        rule_library.create_from_config(rule_configs)

        window = await window_manager.get_window(sample.char_id, repo=sample_repo)

        violations: list[ViolationInfo] = []
        in_control = True

        if window and characteristic.ucl is not None and characteristic.lcl is not None:
            # Get enabled rule IDs from characteristic configuration
            enabled_rule_ids = {rule.rule_id for rule in characteristic.rules if rule.is_enabled}

            # Build require_acknowledgement lookup from characteristic rules
            rule_require_ack = {
                rule.rule_id: rule.require_acknowledgement
                for rule in characteristic.rules
                if rule.is_enabled
            }

            # Check all enabled rules using the library's check_all method
            rule_results = rule_library.check_all(window, enabled_rule_ids)

            for result in rule_results:
                if result.triggered:
                    in_control = False

                    # Create violation record
                    from cassini.db.models.violation import Violation as ViolationModel
                    violation = ViolationModel(
                        sample_id=sample_id,
                        char_id=sample.char_id,
                        rule_id=result.rule_id,
                        rule_name=result.rule_name,
                        severity=result.severity.value,
                        requires_acknowledgement=rule_require_ack.get(result.rule_id, True),
                    )
                    session.add(violation)
                    await session.flush()

                    violations.append(
                        ViolationInfo(
                            violation_id=violation.id,
                            rule_id=result.rule_id,
                            rule_name=result.rule_name,
                            severity=result.severity.value,
                        )
                    )

        await session.commit()

        # Invalidate rolling window
        await window_manager.invalidate(sample.char_id)

        # Publish events to event bus for anomaly detection, notifications, MQTT
        from cassini.core.events import (
            event_bus,
            SampleProcessedEvent,
            ViolationCreatedEvent,
        )

        violation_dicts = [
            {
                "id": v.violation_id,
                "sample_id": sample_id,
                "characteristic_id": sample.char_id,
                "rule_id": v.rule_id,
                "rule_name": v.rule_name,
                "severity": v.severity,
            }
            for v in violations
        ]

        await event_bus.publish(SampleProcessedEvent(
            sample_id=sample_id,
            characteristic_id=sample.char_id,
            mean=mean,
            range_value=range_value,
            zone=zone,
            in_control=in_control,
            violations=violation_dicts,
        ))

        for v in violations:
            await event_bus.publish(ViolationCreatedEvent(
                violation_id=v.violation_id,
                sample_id=sample_id,
                characteristic_id=sample.char_id,
                rule_id=v.rule_id,
                rule_name=v.rule_name,
                severity=v.severity,
            ))

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        request.state.audit_context = {
            "resource_type": "sample",
            "resource_id": sample_id,
            "action": "update",
            "summary": f"Sample #{sample_id} updated for '{characteristic.name}'",
            "fields": {
                "characteristic_name": characteristic.name,
                "new_measurements": data.measurements,
            },
        }

        return SampleProcessingResult(
            sample_id=sample_id,
            timestamp=sample.timestamp,
            mean=mean,
            range_value=range_value,
            zone=zone,
            in_control=in_control,
            violations=violations,
            processing_time_ms=processing_time_ms,
        )

    except HTTPException:
        await session.rollback()
        raise
    except Exception:
        await session.rollback()
        logger.exception("Failed to update sample measurements")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update sample",
        )


@router.get("/{sample_id}/history", response_model=list[SampleEditHistoryResponse])
async def get_sample_edit_history(
    sample_id: int,
    session: AsyncSession = Depends(get_db_session),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    _user: User = Depends(get_current_user),
) -> list[SampleEditHistoryResponse]:
    """Get edit history for a sample.

    Retrieve all edit history records for a sample, showing what changes were
    made, when, by whom, and why.

    Args:
        sample_id: ID of the sample
        session: Database session dependency
        sample_repo: Sample repository dependency

    Returns:
        List of edit history records in reverse chronological order

    Raises:
        HTTPException: 404 if sample not found
    """
    import json

    sample = await sample_repo.get_by_id(sample_id)

    if sample is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample {sample_id} not found",
        )

    # Query edit history
    from sqlalchemy import select
    from cassini.db.models.sample import SampleEditHistory

    stmt = (
        select(SampleEditHistory)
        .where(SampleEditHistory.sample_id == sample_id)
        .order_by(SampleEditHistory.edited_at.desc())
    )
    result = await session.execute(stmt)
    history_records = result.scalars().all()

    # Convert to response models
    def _safe_json_loads(raw: str) -> list[float]:
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []

    return [
        SampleEditHistoryResponse(
            id=record.id,
            sample_id=record.sample_id,
            edited_at=record.edited_at,
            edited_by=record.edited_by,
            reason=record.reason,
            previous_values=_safe_json_loads(record.previous_values),
            new_values=_safe_json_loads(record.new_values),
            previous_mean=record.previous_mean,
            new_mean=record.new_mean,
        )
        for record in history_records
    ]


class BatchImportRequest(BaseModel):
    """Wrapped batch import request matching the frontend's format.

    Attributes:
        characteristic_id: Shared characteristic ID for all samples
        samples: List of sample data (measurements + optional timestamp)
        skip_rule_evaluation: If True, skip Nelson Rule evaluation
        async_spc: If True, bulk insert and enqueue for async SPC processing
    """
    characteristic_id: int
    samples: list[dict] = Field(..., max_length=10_000)
    skip_rule_evaluation: bool = False
    async_spc: bool = False


@router.post("/batch", response_model=BatchImportResult)
async def batch_import(
    request: BatchImportRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_db_session),
    engine: SPCEngine = Depends(get_spc_engine),
    _user: User = Depends(get_current_user),
) -> BatchImportResult:
    """Batch import samples (for historical data migration).

    Import multiple samples in a single transaction. This is useful for
    migrating historical data or bulk data entry. Optionally skip Nelson
    Rule evaluation for performance during large imports.

    Accepts a wrapped format: { characteristic_id, samples: [{measurements, timestamp?}], skip_rule_evaluation? }

    Args:
        request: Batch import request with shared characteristic_id and sample list
        session: Database session dependency
        engine: SPC engine dependency

    Returns:
        Batch import result with success/failure counts and error messages
    """
    char_id = request.characteristic_id

    # Plant-scoped authorization: operator+ for the owning plant
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "operator")

    # --- Async SPC path (commercial only) ---
    if request.async_spc:
        license_svc = http_request.app.state.license_service
        if not license_svc.is_commercial:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Async batch SPC requires a commercial license",
            )

        from cassini.core.engine.spc_queue import get_spc_queue, SPCEvaluationRequest
        import asyncio as _asyncio

        # Validate homogeneous material_id — batch evaluation uses a single material
        material_ids = {s.get("material_id") for s in request.samples}
        if len(material_ids) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Async batch requires all samples to have the same material_id",
            )
        batch_material_id = material_ids.pop() if material_ids else None

        spc_queue = get_spc_queue()
        sample_repo = SampleRepository(session)
        sample_ids: list[int] = []
        failed = 0
        errors: list[str] = []

        for idx, sample_dict in enumerate(request.samples):
            try:
                measurements = sample_dict.get("measurements", [])
                batch_number = sample_dict.get("batch_number")
                operator_id = sample_dict.get("operator_id")
                material_id = sample_dict.get("material_id")
                raw_metadata = sample_dict.get("metadata")

                sample = await sample_repo.create_with_measurements(
                    char_id=char_id,
                    values=measurements,
                    batch_number=batch_number,
                    operator_id=operator_id,
                    material_id=material_id,
                    spc_status="pending_spc",
                    custom_metadata=raw_metadata,
                )
                sample_ids.append(sample.id)
            except Exception:
                logger.exception("Async batch insert error at sample %d", idx + 1)
                failed += 1
                errors.append(f"Sample {idx + 1}: Insert failed")

        if not sample_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No samples could be inserted",
            )

        # Commit first — samples are safely persisted with spc_status='pending_spc'.
        # If enqueue fails (QueueFull), they will be recovered on next startup.
        await session.commit()

        eval_request = SPCEvaluationRequest(
            characteristic_id=char_id,
            sample_ids=sample_ids,
            material_id=batch_material_id,
        )
        try:
            spc_queue.enqueue_nowait(eval_request)
        except _asyncio.QueueFull:
            logger.warning(
                "spc_queue_full_after_commit",
                char_id=char_id,
                sample_count=len(sample_ids),
            )

        http_request.state.audit_context = {
            "resource_type": "sample",
            "resource_id": None,
            "action": "batch_create_async",
            "summary": f"Async batch import: {len(sample_ids)} samples for char {char_id}",
            "fields": {
                "sample_count": len(sample_ids),
                "characteristic_id": char_id,
                "async_spc": True,
            },
        }

        return BatchImportResult(
            total=len(request.samples),
            imported=len(sample_ids),
            failed=failed,
            errors=errors,
            status="processing",
            sample_ids=sample_ids,
        )

    # --- Existing sync paths below (skip_rule_evaluation and full SPC) ---
    skip_rule_evaluation = request.skip_rule_evaluation

    # Guard: if doing full SPC (not skip_rule_evaluation), reject if async batch is pending
    if not skip_rule_evaluation:
        try:
            await check_no_pending_spc(session, char_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This characteristic has pending async SPC processing. Please wait.",
            )

    # Load characteristic once for full SPC dedup (avoids per-sample get_with_rules inside engine)
    if not skip_rule_evaluation and request.samples:
        char_repo = CharacteristicRepository(session)
        characteristic = await char_repo.get_with_rules(char_id)
        if characteristic is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Characteristic {char_id} not found",
            )
        char_data = extract_char_data(characteristic)
    else:
        char_data = None

    total = len(request.samples)
    successful = 0
    failed = 0
    errors: list[str] = []

    for idx, sample_dict in enumerate(request.samples):
        try:
            measurements = sample_dict.get("measurements", [])
            batch_number = sample_dict.get("batch_number")
            operator_id = sample_dict.get("operator_id")
            material_id = sample_dict.get("material_id")
            raw_metadata = sample_dict.get("metadata")

            if skip_rule_evaluation:
                # Direct database insertion without rule evaluation
                sample_repo = SampleRepository(session)
                await sample_repo.create_with_measurements(
                    char_id=char_id,
                    values=measurements,
                    batch_number=batch_number,
                    operator_id=operator_id,
                    material_id=material_id,
                    custom_metadata=raw_metadata,
                )
            else:
                # Full SPC processing with rule evaluation
                context = SampleContext(
                    batch_number=batch_number,
                    operator_id=operator_id,
                    material_id=material_id,
                    source="MANUAL",
                    metadata=raw_metadata,
                )

                await engine.process_sample(
                    characteristic_id=char_id,
                    measurements=measurements,
                    context=context,
                    char_data=char_data,
                )

            successful += 1

        except ValueError:
            # SPC engine validation errors
            failed += 1
            errors.append(f"Sample {idx + 1}: Validation failed")
        except Exception:
            # Unexpected error
            logger.exception("Unexpected error processing sample %d in batch import", idx + 1)
            failed += 1
            errors.append(f"Sample {idx + 1}: Unexpected error")

    # Commit all successful samples
    try:
        await session.commit()
    except Exception:
        logger.exception("Failed to commit batch import")
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to commit batch import",
        )

    # Look up characteristic name for audit context
    char_name = None
    try:
        from cassini.db.models.characteristic import Characteristic
        char_result = await session.execute(
            select(Characteristic.name).where(Characteristic.id == char_id)
        )
        char_name = char_result.scalar_one_or_none()
    except Exception:
        pass

    http_request.state.audit_context = {
        "resource_type": "sample",
        "resource_id": None,
        "action": "batch_create",
        "summary": f"Batch import: {successful} samples for characteristic {char_id}",
        "fields": {
            "sample_count": successful,
            "characteristic_id": char_id,
            "characteristic_name": char_name,
            "total_submitted": total,
            "failed": failed,
        },
    }

    return BatchImportResult(
        total=total,
        imported=successful,
        failed=failed,
        errors=errors,
    )
