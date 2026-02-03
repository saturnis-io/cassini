"""Sample REST endpoints for OpenSPC.

This module provides REST API endpoints for manual sample submission,
retrieval, and management. Samples are processed through the SPC engine
and evaluated against Nelson Rules.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import get_db_session
from openspc.api.schemas.common import PaginatedResponse, PaginationParams
from openspc.api.schemas.sample import SampleCreate, SampleExclude, SampleResponse
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
        successful: Number of samples successfully processed
        failed: Number of samples that failed
        errors: List of error messages for failed samples
    """
    total: int
    successful: int
    failed: int
    errors: list[str]


# Dependency injection helpers
async def get_sample_repo(
    session: AsyncSession = Depends(get_db_session),
) -> SampleRepository:
    """Get sample repository instance.

    Args:
        session: Database session from dependency injection

    Returns:
        SampleRepository instance
    """
    return SampleRepository(session)


async def get_char_repo(
    session: AsyncSession = Depends(get_db_session),
) -> CharacteristicRepository:
    """Get characteristic repository instance.

    Args:
        session: Database session from dependency injection

    Returns:
        CharacteristicRepository instance
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
    """
    return ViolationRepository(session)


async def get_spc_engine(
    session: AsyncSession = Depends(get_db_session),
) -> SPCEngine:
    """Get SPC engine instance with all dependencies.

    Args:
        session: Database session from dependency injection

    Returns:
        SPCEngine instance configured with all required dependencies
    """
    sample_repo = SampleRepository(session)
    char_repo = CharacteristicRepository(session)
    violation_repo = ViolationRepository(session)
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
    """Get manual provider instance.

    Args:
        char_repo: Characteristic repository from dependency injection

    Returns:
        ManualProvider instance
    """
    return ManualProvider(char_repo)


# Endpoints
@router.get("/", response_model=PaginatedResponse[SampleResponse])
async def list_samples(
    characteristic_id: int | None = Query(None, description="Filter by characteristic ID"),
    start_date: datetime | None = Query(None, description="Filter by start date (inclusive)"),
    end_date: datetime | None = Query(None, description="Filter by end date (inclusive)"),
    include_excluded: bool = Query(False, description="Include excluded samples"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of items to return"),
    sample_repo: SampleRepository = Depends(get_sample_repo),
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
    # Build query based on filters
    if characteristic_id is not None:
        samples = await sample_repo.get_by_characteristic(
            char_id=characteristic_id,
            start_date=start_date,
            end_date=end_date,
        )
    else:
        # If no characteristic filter, get all samples in date range
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        from openspc.db.models.sample import Sample

        stmt = (
            select(Sample)
            .options(selectinload(Sample.measurements))
            .order_by(Sample.timestamp)
            .execution_options(populate_existing=True)
        )

        if start_date is not None:
            stmt = stmt.where(Sample.timestamp >= start_date)
        if end_date is not None:
            stmt = stmt.where(Sample.timestamp <= end_date)

        result = await sample_repo.session.execute(stmt)
        samples = list(result.scalars().all())

    # Apply exclusion filter
    if not include_excluded:
        samples = [s for s in samples if not s.is_excluded]

    # Get total count before pagination
    total = len(samples)

    # Apply pagination
    paginated_samples = samples[offset : offset + limit]

    # Convert to response models
    response_items = []
    for sample in paginated_samples:
        measurements = [m.value for m in sample.measurements]
        mean = sum(measurements) / len(measurements) if measurements else 0.0
        range_value = None
        if len(measurements) > 1:
            range_value = max(measurements) - min(measurements)

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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        # Unexpected errors
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process sample: {str(e)}",
        )


@router.get("/{sample_id}", response_model=SampleResponse)
async def get_sample(
    sample_id: int,
    sample_repo: SampleRepository = Depends(get_sample_repo),
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
    mean = sum(measurements) / len(measurements) if measurements else 0.0
    range_value = None
    if len(measurements) > 1:
        range_value = max(measurements) - min(measurements)

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

        # Update exclusion status
        sample.is_excluded = data.is_excluded

        # Note: The reason field is not stored in the Sample model currently
        # If needed, it could be added to the model or stored in a separate audit table

        await session.flush()
        await session.commit()

        # Invalidate the rolling window to trigger rebuild
        # This ensures the excluded sample is not used in rule evaluation
        window_manager = RollingWindowManager(sample_repo)
        await window_manager.invalidate(sample.char_id)

        # Calculate statistics
        measurements = [m.value for m in sample.measurements]
        mean = sum(measurements) / len(measurements) if measurements else 0.0
        range_value = None
        if len(measurements) > 1:
            range_value = max(measurements) - min(measurements)

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
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update sample: {str(e)}",
        )


@router.post("/batch", response_model=BatchImportResult)
async def batch_import(
    data: list[SampleCreate],
    skip_rule_evaluation: bool = Query(
        False,
        description="If True, skip Nelson Rule evaluation (for historical data import)",
    ),
    session: AsyncSession = Depends(get_db_session),
    engine: SPCEngine = Depends(get_spc_engine),
) -> BatchImportResult:
    """Batch import samples (for historical data migration).

    Import multiple samples in a single transaction. This is useful for
    migrating historical data or bulk data entry. Optionally skip Nelson
    Rule evaluation for performance during large imports.

    Args:
        data: List of sample creation data
        skip_rule_evaluation: If True, skip Nelson Rule evaluation
        session: Database session dependency
        engine: SPC engine dependency

    Returns:
        Batch import result with success/failure counts and error messages
    """
    total = len(data)
    successful = 0
    failed = 0
    errors: list[str] = []

    for idx, sample_data in enumerate(data):
        try:
            if skip_rule_evaluation:
                # Direct database insertion without rule evaluation
                sample_repo = SampleRepository(session)
                await sample_repo.create_with_measurements(
                    char_id=sample_data.characteristic_id,
                    values=sample_data.measurements,
                    batch_number=sample_data.batch_number,
                    operator_id=sample_data.operator_id,
                )
            else:
                # Full SPC processing with rule evaluation
                context = SampleContext(
                    batch_number=sample_data.batch_number,
                    operator_id=sample_data.operator_id,
                    source="MANUAL",
                )

                await engine.process_sample(
                    characteristic_id=sample_data.characteristic_id,
                    measurements=sample_data.measurements,
                    context=context,
                )

            successful += 1

        except ValueError as e:
            # Validation error
            failed += 1
            errors.append(f"Sample {idx + 1}: {str(e)}")
        except Exception as e:
            # Unexpected error
            failed += 1
            errors.append(f"Sample {idx + 1}: Unexpected error - {str(e)}")

    # Commit all successful samples
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to commit batch import: {str(e)}",
        )

    return BatchImportResult(
        total=total,
        successful=successful,
        failed=failed,
        errors=errors,
    )
