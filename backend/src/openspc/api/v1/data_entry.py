"""Data entry REST endpoints for external systems.

This module provides REST API endpoints for programmatic sample submission
with API key authentication. External systems can submit samples via these
endpoints without using the web UI.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import get_db_session
from openspc.api.schemas.data_entry import (
    BatchEntryRequest,
    BatchEntryResponse,
    DataEntryRequest,
    DataEntryResponse,
    SchemaResponse,
)
from openspc.core.auth.api_key import verify_api_key
from openspc.core.engine.nelson_rules import NelsonRuleLibrary
from openspc.core.engine.rolling_window import RollingWindowManager
from openspc.core.engine.spc_engine import SPCEngine
from openspc.core.providers.protocol import SampleContext
from openspc.db.models.api_key import APIKey
from openspc.db.repositories import (
    CharacteristicRepository,
    SampleRepository,
    ViolationRepository,
)

router = APIRouter(prefix="/api/v1/data-entry", tags=["data-entry"])


async def get_spc_engine(session: AsyncSession) -> SPCEngine:
    """Create SPC engine instance with all dependencies.

    Args:
        session: Database session for repositories.

    Returns:
        Configured SPCEngine instance.
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


@router.post(
    "/submit",
    response_model=DataEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit single sample",
    description="Submit a single sample from an external system. Requires API key authentication.",
)
async def submit_sample(
    data: DataEntryRequest,
    api_key: APIKey = Depends(verify_api_key),
    session: AsyncSession = Depends(get_db_session),
) -> DataEntryResponse:
    """Submit a single sample from external system.

    This endpoint processes a single sample through the SPC engine,
    evaluates Nelson Rules, and returns the processing result including
    any violations detected.

    Args:
        data: Sample data including characteristic_id and measurements.
        api_key: Validated API key from X-API-Key header.
        session: Database session for persistence.

    Returns:
        DataEntryResponse with sample ID, statistics, and violations.

    Raises:
        HTTPException: 401 if API key is invalid.
        HTTPException: 403 if API key lacks permission for characteristic.
        HTTPException: 400 if validation fails.
        HTTPException: 500 if processing fails.
    """
    # Check permission for this characteristic
    if not api_key.can_access_characteristic(data.characteristic_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"API key does not have permission for characteristic {data.characteristic_id}",
        )

    engine = await get_spc_engine(session)

    try:
        # Build sample context from request data
        context = SampleContext(
            batch_number=data.batch_number,
            operator_id=data.operator_id,
            source="API",
            metadata=data.metadata,
        )

        # Process sample through SPC engine
        result = await engine.process_sample(
            characteristic_id=data.characteristic_id,
            measurements=data.measurements,
            context=context,
        )

        # Commit the transaction
        await session.commit()

        # Get violations for the sample
        violation_repo = ViolationRepository(session)
        violations = await violation_repo.get_by_sample(result.sample_id)

        return DataEntryResponse(
            sample_id=result.sample_id,
            characteristic_id=data.characteristic_id,
            timestamp=result.timestamp,
            mean=result.mean,
            range_value=result.range_value,
            zone=result.zone,
            in_control=result.in_control,
            violations=[
                {
                    "rule_id": v.rule_id,
                    "rule_name": v.rule_name,
                    "severity": v.severity,
                }
                for v in violations
            ],
        )

    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process sample: {str(e)}",
        )


@router.post(
    "/batch",
    response_model=BatchEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit multiple samples",
    description="Submit multiple samples in a single request. Each sample is processed independently.",
)
async def submit_batch(
    data: BatchEntryRequest,
    api_key: APIKey = Depends(verify_api_key),
    session: AsyncSession = Depends(get_db_session),
) -> BatchEntryResponse:
    """Submit multiple samples in a single request.

    Processes each sample independently - failures in one sample don't
    affect others. Returns results for successful samples and error
    messages for failed ones.

    Args:
        data: Batch request containing list of samples.
        api_key: Validated API key from X-API-Key header.
        session: Database session for persistence.

    Returns:
        BatchEntryResponse with results and errors.

    Raises:
        HTTPException: 401 if API key is invalid.
    """
    engine = await get_spc_engine(session)
    violation_repo = ViolationRepository(session)
    results: list[DataEntryResponse] = []
    errors: list[str] = []

    for idx, sample in enumerate(data.samples):
        # Check permission for each characteristic
        if not api_key.can_access_characteristic(sample.characteristic_id):
            errors.append(
                f"Sample {idx}: No permission for characteristic {sample.characteristic_id}"
            )
            continue

        try:
            context = SampleContext(
                batch_number=sample.batch_number,
                operator_id=sample.operator_id,
                source="API",
                metadata=sample.metadata,
            )

            result = await engine.process_sample(
                characteristic_id=sample.characteristic_id,
                measurements=sample.measurements,
                context=context,
            )

            # Get violations for the sample
            violations = await violation_repo.get_by_sample(result.sample_id)

            results.append(
                DataEntryResponse(
                    sample_id=result.sample_id,
                    characteristic_id=sample.characteristic_id,
                    timestamp=result.timestamp,
                    mean=result.mean,
                    range_value=result.range_value,
                    zone=result.zone,
                    in_control=result.in_control,
                    violations=[
                        {
                            "rule_id": v.rule_id,
                            "rule_name": v.rule_name,
                            "severity": v.severity,
                        }
                        for v in violations
                    ],
                )
            )

        except Exception as e:
            errors.append(f"Sample {idx}: {str(e)}")

    # Commit all successful samples
    await session.commit()

    return BatchEntryResponse(
        total=len(data.samples),
        successful=len(results),
        failed=len(errors),
        results=results,
        errors=errors,
    )


@router.get(
    "/schema",
    response_model=SchemaResponse,
    summary="Get API schema",
    description="Get the expected request/response schema for data entry endpoints. No authentication required.",
)
async def get_schema() -> SchemaResponse:
    """Get the expected request/response schema for data entry.

    This endpoint provides schema documentation for integrators to
    understand the API contract. It does not require authentication.

    Returns:
        SchemaResponse with request/response schemas and auth info.
    """
    return SchemaResponse(
        single_sample={
            "endpoint": "POST /api/v1/data-entry/submit",
            "request": DataEntryRequest.model_json_schema(),
            "response": DataEntryResponse.model_json_schema(),
        },
        batch_sample={
            "endpoint": "POST /api/v1/data-entry/batch",
            "request": BatchEntryRequest.model_json_schema(),
            "response": BatchEntryResponse.model_json_schema(),
        },
        authentication={
            "method": "API Key",
            "header": "X-API-Key",
            "description": "Include your API key in the X-API-Key header",
            "example": "X-API-Key: openspc_your_api_key_here",
        },
    )
