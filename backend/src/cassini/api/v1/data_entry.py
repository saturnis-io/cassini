"""Data entry REST endpoints for external systems.

This module provides REST API endpoints for programmatic sample submission
with API key authentication. External systems can submit samples via these
endpoints without using the web UI.
"""

import structlog
from datetime import datetime

logger = structlog.get_logger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.rate_limit import limiter

from cassini.api.deps import (
    check_plant_role,
    get_current_user_or_api_key,
    get_db_session,
    resolve_plant_id_for_characteristic,
)
from cassini.db.models.user import User
from cassini.api.schemas.data_entry import (
    AttributeDataEntryRequest,
    AttributeDataEntryResponse,
    BatchEntryRequest,
    BatchEntryResponse,
    CUSUMDataEntryRequest,
    CUSUMDataEntryResponse,
    DataEntryRequest,
    DataEntryResponse,
    EWMADataEntryRequest,
    EWMADataEntryResponse,
    SchemaResponse,
)
from cassini.core.engine.nelson_rules import NelsonRuleLibrary
from cassini.core.engine.rolling_window import get_shared_window_manager
from cassini.core.engine.spc_engine import SPCEngine
from cassini.core.providers.protocol import SampleContext
from cassini.db.models.api_key import APIKey
from cassini.db.repositories import (
    CharacteristicRepository,
    SampleRepository,
    ViolationRepository,
)

router = APIRouter(prefix="/api/v1/data-entry", tags=["data-entry"])


async def get_spc_engine(session: AsyncSession) -> SPCEngine:
    """Create SPC engine instance with all dependencies.

    Reuses the per-worker singleton RollingWindowManager so the LRU
    cache persists across requests. Session-scoped repos are created
    fresh per request and passed to the engine (NOT stored on the
    shared manager, which would cause cross-request session sharing
    under concurrency).

    Args:
        session: Database session for repositories.

    Returns:
        Configured SPCEngine instance.
    """
    sample_repo = SampleRepository(session)
    char_repo = CharacteristicRepository(session)
    violation_repo = ViolationRepository(session)

    rule_library = NelsonRuleLibrary()

    return SPCEngine(
        sample_repo=sample_repo,
        char_repo=char_repo,
        violation_repo=violation_repo,
        window_manager=get_shared_window_manager(),
        rule_library=rule_library,
    )


@router.post(
    "/submit",
    response_model=DataEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit single sample",
    description="Submit a single sample from an external system. Requires API key authentication.",
)
@limiter.limit("30/minute")
async def submit_sample(
    request: Request,
    data: DataEntryRequest,
    auth: object = Depends(get_current_user_or_api_key),
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
    # Plant-scoped authorization
    if isinstance(auth, APIKey):
        if not auth.can_access_characteristic(data.characteristic_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key does not have permission for characteristic {data.characteristic_id}",
            )
    elif isinstance(auth, User):
        plant_id = await resolve_plant_id_for_characteristic(data.characteristic_id, session)
        check_plant_role(auth, plant_id, "operator")

    # Look up characteristic for supplementary analysis params
    char_repo = CharacteristicRepository(session)
    characteristic = await char_repo.get_by_id(data.characteristic_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Characteristic not found",
        )

    try:
        # Always run standard SPC engine first (Nelson Rules, zone classification)
        engine = await get_spc_engine(session)

        context = SampleContext(
            batch_number=data.batch_number,
            operator_id=data.operator_id,
            material_id=data.material_id,
            source="API",
            metadata=data.metadata,
        )

        result = await engine.process_sample(
            characteristic_id=data.characteristic_id,
            measurements=data.measurements,
            context=context,
        )

        # Additionally run CUSUM/EWMA analysis if params are configured
        # (supplementary analysis, not a replacement for standard SPC)
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

        # Get violations for the sample (includes both standard and supplementary)
        violation_repo = ViolationRepository(session)
        violations = await violation_repo.get_by_sample(result.sample_id)

        response = DataEntryResponse(
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

        request.state.audit_context = {
            "resource_type": "sample",
            "resource_id": result.sample_id,
            "action": "create",
            "summary": f"Sample submitted for characteristic #{data.characteristic_id}",
            "fields": {
                "characteristic_id": data.characteristic_id,
                "measurement_count": len(data.measurements),
                "in_control": result.in_control,
                "violation_count": len(violations),
            },
        }

        return response

    except ValueError as e:
        logger.warning("validation_error", detail=str(e))
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid input")
    except Exception:
        logger.exception("Failed to process data entry sample")
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process sample",
        )


@router.post(
    "/submit-attribute",
    response_model=AttributeDataEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit attribute sample",
    description="Submit a single attribute sample (p/np/c/u chart). Requires API key or user authentication.",
)
@limiter.limit("30/minute")
async def submit_attribute_sample(
    request: Request,
    data: AttributeDataEntryRequest,
    auth: object = Depends(get_current_user_or_api_key),
    session: AsyncSession = Depends(get_db_session),
) -> AttributeDataEntryResponse:
    """Submit a single attribute sample from external system.

    Processes an attribute sample through the attribute SPC engine,
    evaluates Nelson Rules 1-4, and returns the result.
    """
    # Plant-scoped authorization
    if isinstance(auth, APIKey):
        if not auth.can_access_characteristic(data.characteristic_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key does not have permission for characteristic {data.characteristic_id}",
            )
    elif isinstance(auth, User):
        plant_id = await resolve_plant_id_for_characteristic(data.characteristic_id, session)
        check_plant_role(auth, plant_id, "operator")

    sample_repo = SampleRepository(session)
    char_repo = CharacteristicRepository(session)
    violation_repo = ViolationRepository(session)

    try:
        from cassini.core.engine.attribute_engine import process_attribute_sample

        result = await process_attribute_sample(
            char_id=data.characteristic_id,
            defect_count=data.defect_count,
            sample_size=data.sample_size,
            units_inspected=data.units_inspected,
            batch_number=data.batch_number,
            operator_id=data.operator_id,
            sample_repo=sample_repo,
            char_repo=char_repo,
            violation_repo=violation_repo,
            material_id=data.material_id,
        )

        await session.commit()

        response = AttributeDataEntryResponse(
            sample_id=result.sample_id,
            characteristic_id=result.characteristic_id,
            timestamp=result.timestamp,
            plotted_value=result.plotted_value,
            defect_count=result.defect_count,
            sample_size=result.sample_size,
            in_control=result.in_control,
            center_line=result.center_line,
            ucl=result.ucl,
            lcl=result.lcl,
            violations=[
                {
                    "rule_id": v.rule_id,
                    "rule_name": v.rule_name,
                    "severity": v.severity,
                }
                for v in result.violations
            ],
        )

        request.state.audit_context = {
            "resource_type": "sample",
            "resource_id": result.sample_id,
            "action": "create",
            "summary": f"Attribute sample submitted for characteristic #{data.characteristic_id}",
            "fields": {
                "characteristic_id": data.characteristic_id,
                "defect_count": data.defect_count,
                "sample_size": data.sample_size,
                "in_control": result.in_control,
            },
        }

        return response

    except ValueError as e:
        logger.warning("validation_error", detail=str(e))
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid attribute sample input")
    except Exception:
        logger.exception("Failed to process attribute data entry sample")
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process attribute sample",
        )


@router.post(
    "/submit-cusum",
    response_model=CUSUMDataEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit CUSUM sample",
    description="Submit a single CUSUM sample. Requires API key or user authentication.",
)
@limiter.limit("30/minute")
async def submit_cusum_sample(
    request: Request,
    data: CUSUMDataEntryRequest,
    auth: object = Depends(get_current_user_or_api_key),
    session: AsyncSession = Depends(get_db_session),
) -> CUSUMDataEntryResponse:
    """Submit a single CUSUM sample."""
    # Plant-scoped authorization
    if isinstance(auth, APIKey):
        if not auth.can_access_characteristic(data.characteristic_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key does not have permission for characteristic {data.characteristic_id}",
            )
    elif isinstance(auth, User):
        plant_id = await resolve_plant_id_for_characteristic(data.characteristic_id, session)
        check_plant_role(auth, plant_id, "operator")

    sample_repo = SampleRepository(session)
    char_repo = CharacteristicRepository(session)
    violation_repo = ViolationRepository(session)

    try:
        from cassini.core.engine.cusum_engine import process_cusum_sample

        result = await process_cusum_sample(
            char_id=data.characteristic_id,
            measurement=data.measurement,
            sample_repo=sample_repo,
            char_repo=char_repo,
            violation_repo=violation_repo,
            batch_number=data.batch_number,
            operator_id=data.operator_id,
            material_id=data.material_id,
        )

        await session.commit()

        response = CUSUMDataEntryResponse(
            sample_id=result.sample_id,
            characteristic_id=result.characteristic_id,
            timestamp=result.timestamp,
            measurement=result.measurement,
            cusum_high=result.cusum_high,
            cusum_low=result.cusum_low,
            target=result.target,
            h=result.h,
            in_control=result.in_control,
            violations=result.violations,
        )

        request.state.audit_context = {
            "resource_type": "sample",
            "resource_id": result.sample_id,
            "action": "create",
            "summary": f"CUSUM sample submitted for characteristic #{data.characteristic_id}",
            "fields": {
                "characteristic_id": data.characteristic_id,
                "measurement": data.measurement,
                "in_control": result.in_control,
            },
        }

        return response

    except ValueError as e:
        logger.warning("validation_error", detail=str(e))
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid CUSUM sample input")
    except Exception:
        logger.exception("Failed to process CUSUM data entry sample")
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process CUSUM sample",
        )


@router.post(
    "/submit-ewma",
    response_model=EWMADataEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit EWMA sample",
    description="Submit a single EWMA sample. Requires API key or user authentication.",
)
@limiter.limit("30/minute")
async def submit_ewma_sample(
    request: Request,
    data: EWMADataEntryRequest,
    auth: object = Depends(get_current_user_or_api_key),
    session: AsyncSession = Depends(get_db_session),
) -> EWMADataEntryResponse:
    """Submit a single EWMA sample."""
    # Plant-scoped authorization
    if isinstance(auth, APIKey):
        if not auth.can_access_characteristic(data.characteristic_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key does not have permission for characteristic {data.characteristic_id}",
            )
    elif isinstance(auth, User):
        plant_id = await resolve_plant_id_for_characteristic(data.characteristic_id, session)
        check_plant_role(auth, plant_id, "operator")

    sample_repo = SampleRepository(session)
    char_repo = CharacteristicRepository(session)
    violation_repo = ViolationRepository(session)

    try:
        from cassini.core.engine.ewma_engine import process_ewma_sample

        result = await process_ewma_sample(
            char_id=data.characteristic_id,
            measurement=data.measurement,
            sample_repo=sample_repo,
            char_repo=char_repo,
            violation_repo=violation_repo,
            batch_number=data.batch_number,
            operator_id=data.operator_id,
            material_id=data.material_id,
        )

        await session.commit()

        response = EWMADataEntryResponse(
            sample_id=result.sample_id,
            characteristic_id=result.characteristic_id,
            timestamp=result.timestamp,
            measurement=result.measurement,
            ewma_value=result.ewma_value,
            target=result.target,
            ucl=result.ucl,
            lcl=result.lcl,
            in_control=result.in_control,
            violations=result.violations,
        )

        request.state.audit_context = {
            "resource_type": "sample",
            "resource_id": result.sample_id,
            "action": "create",
            "summary": f"EWMA sample submitted for characteristic #{data.characteristic_id}",
            "fields": {
                "characteristic_id": data.characteristic_id,
                "measurement": data.measurement,
                "in_control": result.in_control,
            },
        }

        return response

    except ValueError as e:
        logger.warning("validation_error", detail=str(e))
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid EWMA sample input")
    except Exception:
        logger.exception("Failed to process EWMA data entry sample")
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process EWMA sample",
        )


@router.post(
    "/batch",
    response_model=BatchEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit multiple samples",
    description="Submit multiple samples in a single request. Each sample is processed independently.",
)
async def submit_batch(
    request: Request,
    data: BatchEntryRequest,
    auth: object = Depends(get_current_user_or_api_key),
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
    char_repo = CharacteristicRepository(session)
    results: list[DataEntryResponse] = []
    errors: list[str] = []
    _plant_cache: dict[int, int] = {}
    _char_cache: dict[int, object] = {}

    for idx, sample in enumerate(data.samples):
        # Plant-scoped authorization
        if isinstance(auth, APIKey):
            if not auth.can_access_characteristic(sample.characteristic_id):
                errors.append(
                    f"Sample {idx}: No permission for characteristic {sample.characteristic_id}"
                )
                continue
        elif isinstance(auth, User):
            try:
                if sample.characteristic_id not in _plant_cache:
                    _plant_cache[sample.characteristic_id] = (
                        await resolve_plant_id_for_characteristic(
                            sample.characteristic_id, session
                        )
                    )
                check_plant_role(auth, _plant_cache[sample.characteristic_id], "operator")
            except HTTPException:
                errors.append(
                    f"Sample {idx}: No permission for characteristic {sample.characteristic_id}"
                )
                continue

        try:
            context = SampleContext(
                batch_number=sample.batch_number,
                operator_id=sample.operator_id,
                material_id=sample.material_id,
                source="API",
                metadata=sample.metadata,
            )

            result = await engine.process_sample(
                characteristic_id=sample.characteristic_id,
                measurements=sample.measurements,
                context=context,
            )

            # Supplementary CUSUM/EWMA analysis
            if sample.characteristic_id not in _char_cache:
                _char_cache[sample.characteristic_id] = await char_repo.get_by_id(
                    sample.characteristic_id
                )
            _char = _char_cache[sample.characteristic_id]
            if _char is not None:
                _mean = sum(sample.measurements) / len(sample.measurements)
                if _char.cusum_target is not None and _char.cusum_k is not None:
                    try:
                        from cassini.core.engine.cusum_engine import process_cusum_supplementary
                        await process_cusum_supplementary(
                            sample_id=result.sample_id,
                            char=_char,
                            measurement=_mean,
                            sample_repo=SampleRepository(session),
                            violation_repo=violation_repo,
                        )
                    except Exception:
                        logger.warning("cusum_supplementary_failed", char_id=sample.characteristic_id)
                if _char.ewma_lambda is not None:
                    try:
                        from cassini.core.engine.ewma_engine import process_ewma_supplementary
                        await process_ewma_supplementary(
                            sample_id=result.sample_id,
                            char=_char,
                            measurement=_mean,
                            sample_repo=SampleRepository(session),
                            violation_repo=violation_repo,
                        )
                    except Exception:
                        logger.warning("ewma_supplementary_failed", char_id=sample.characteristic_id)

            # Get violations for the sample (includes supplementary)
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

        except Exception:
            logger.exception("Unexpected error processing data entry sample %d", idx)
            errors.append(f"Sample {idx}: Unexpected error")

    # Commit all successful samples
    await session.commit()

    request.state.audit_context = {
        "resource_type": "sample",
        "resource_id": None,
        "action": "create",
        "summary": f"Batch submission: {len(results)} succeeded, {len(errors)} failed out of {len(data.samples)} samples",
        "fields": {
            "total": len(data.samples),
            "successful": len(results),
            "failed": len(errors),
        },
    }

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
            "example": "X-API-Key: cassini_your_api_key_here",
        },
    )
