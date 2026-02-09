"""Sample REST endpoints for OpenSPC.

This module provides REST API endpoints for manual sample submission,
retrieval, and management. Samples are processed through the SPC engine
and evaluated against Nelson Rules.
"""

import structlog
from datetime import datetime

logger = structlog.get_logger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import (
    check_plant_role,
    get_characteristic_repo as get_char_repo,
    get_current_user,
    get_db_session,
    get_sample_repo,
    get_violation_repo,
    require_role,
    resolve_plant_id_for_characteristic,
)
from openspc.db.models.user import User
from openspc.api.schemas.common import PaginatedResponse, PaginationParams
from openspc.api.schemas.sample import (
    SampleCreate,
    SampleExclude,
    SampleResponse,
    SampleUpdate,
    SampleEditHistoryResponse,
)
from openspc.core.engine.nelson_rules import NelsonRuleLibrary
from openspc.core.engine.rolling_window import RollingWindowManager
from openspc.core.engine.spc_engine import SPCEngine
from openspc.core.providers.manual import ManualProvider
from openspc.core.providers.protocol import SampleContext
from openspc.db.repositories import (
    CharacteristicRepository,
    SampleRepository,
    ViolationRepository,
)
from openspc.utils.statistics import calculate_mean_range, calculate_zones, classify_zone, ZoneBoundaries

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
    """
    total: int
    imported: int
    failed: int
    errors: list[str]

    @property
    def successful(self) -> int:
        return self.imported


async def get_spc_engine(
    sample_repo: SampleRepository = Depends(get_sample_repo),
    char_repo: CharacteristicRepository = Depends(get_char_repo),
    violation_repo: ViolationRepository = Depends(get_violation_repo),
) -> SPCEngine:
    """Get SPC engine instance with all dependencies."""
    window_manager = RollingWindowManager(sample_repo)
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
    """Get rolling window manager instance.

    TODO: Cache as app-state singleton to preserve LRU window cache across
    requests. Currently recreated per request, losing the in-memory cache.
    """
    return RollingWindowManager(sample_repo)


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
    from openspc.db.models.sample import Sample

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

    # Convert to response models
    response_items = []
    for sample in paginated_samples:
        measurements = [m.value for m in sample.measurements]
        mean, range_value = calculate_mean_range(measurements)

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

    try:
        # Process sample through SPC engine
        context = SampleContext(
            batch_number=data.batch_number,
            operator_id=data.operator_id,
            source="MANUAL",
        )

        result = await engine.process_sample(
            characteristic_id=data.characteristic_id,
            measurements=data.measurements,
            context=context,
        )

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
    )


@router.patch("/{sample_id}/exclude", response_model=SampleResponse)
async def toggle_exclude(
    sample_id: int,
    data: SampleExclude,
    session: AsyncSession = Depends(get_db_session),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    _user: User = Depends(require_role("supervisor")),
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
        window_manager = RollingWindowManager(sample_repo)
        await window_manager.invalidate(sample.char_id)

        # Calculate statistics
        measurements = [m.value for m in sample.measurements]
        mean, range_value = calculate_mean_range(measurements)

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


@router.delete("/{sample_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sample(
    sample_id: int,
    session: AsyncSession = Depends(get_db_session),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    window_manager: RollingWindowManager = Depends(get_window_manager),
    _user: User = Depends(require_role("supervisor")),
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
    session: AsyncSession = Depends(get_db_session),
    sample_repo: SampleRepository = Depends(get_sample_repo),
    char_repo: CharacteristicRepository = Depends(get_char_repo),
    window_manager: RollingWindowManager = Depends(get_window_manager),
    violation_repo: ViolationRepository = Depends(get_violation_repo),
    _user: User = Depends(require_role("supervisor")),
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
        from openspc.db.models.sample import Measurement, SampleEditHistory

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
        window = await window_manager.get_window(sample.char_id)

        violations: list[ViolationInfo] = []
        in_control = True

        if window and characteristic.ucl is not None and characteristic.lcl is not None:
            # Get enabled rule IDs from characteristic configuration
            enabled_rule_ids = {rule.rule_id for rule in characteristic.rules if rule.is_enabled}

            # Check all enabled rules using the library's check_all method
            rule_results = rule_library.check_all(window, enabled_rule_ids)

            for result in rule_results:
                if result.triggered:
                    in_control = False

                    # Create violation record
                    from openspc.db.models.violation import Violation as ViolationModel
                    violation = ViolationModel(
                        sample_id=sample_id,
                        rule_id=result.rule_id,
                        rule_name=result.rule_name,
                        severity=result.severity.value,
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

        processing_time_ms = (time.perf_counter() - start_time) * 1000

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
    from openspc.db.models.sample import SampleEditHistory

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
    """
    characteristic_id: int
    samples: list[dict] = Field(..., max_length=1000)
    skip_rule_evaluation: bool = False


@router.post("/batch", response_model=BatchImportResult)
async def batch_import(
    request: BatchImportRequest,
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

    skip_rule_evaluation = request.skip_rule_evaluation
    total = len(request.samples)
    successful = 0
    failed = 0
    errors: list[str] = []

    for idx, sample_dict in enumerate(request.samples):
        try:
            measurements = sample_dict.get("measurements", [])
            batch_number = sample_dict.get("batch_number")
            operator_id = sample_dict.get("operator_id")

            if skip_rule_evaluation:
                # Direct database insertion without rule evaluation
                sample_repo = SampleRepository(session)
                await sample_repo.create_with_measurements(
                    char_id=char_id,
                    values=measurements,
                    batch_number=batch_number,
                    operator_id=operator_id,
                )
            else:
                # Full SPC processing with rule evaluation
                context = SampleContext(
                    batch_number=batch_number,
                    operator_id=operator_id,
                    source="MANUAL",
                )

                await engine.process_sample(
                    characteristic_id=char_id,
                    measurements=measurements,
                    context=context,
                )

            successful += 1

        except ValueError as e:
            # SPC engine validation errors are safe to surface (e.g., measurement count mismatch)
            failed += 1
            errors.append(f"Sample {idx + 1}: {str(e)}")
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

    return BatchImportResult(
        total=total,
        imported=successful,
        failed=failed,
        errors=errors,
    )
