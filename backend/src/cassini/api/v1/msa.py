"""Measurement System Analysis (MSA) REST endpoints — Gage R&R + Attribute MSA.

Provides CRUD for MSA studies, operator/part/measurement management,
and calculation endpoints for variable (Gage R&R) and attribute MSA.
"""

import json
import math
from dataclasses import asdict
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
)
from cassini.api.schemas.msa import (
    AttributeMSAResultResponse,
    BiasResultResponse,
    GageRRResultResponse,
    LinearityResultResponse,
    MSAAttributeBatch,
    MSAMeasurementBatch,
    MSAMeasurementResponse,
    MSAOperatorResponse,
    MSAOperatorsSet,
    MSAPartResponse,
    MSAPartsSet,
    MSAStudyCreate,
    MSAStudyDetailResponse,
    MSAStudyResponse,
    StabilityResultResponse,
)
from cassini.core.msa import (
    AttributeMSAEngine,
    GageRREngine,
    compute_bias,
    compute_linearity,
    compute_stability,
)
from cassini.core.signature_engine import SignatureWorkflowEngine
from cassini.db.models.msa import MSAMeasurement, MSAOperator, MSAPart, MSAStudy
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/msa", tags=["msa"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_study_or_404(
    session: AsyncSession,
    study_id: int,
    *,
    load_children: bool = False,
) -> MSAStudy:
    """Fetch an MSA study by ID, optionally eager-loading operators and parts."""
    stmt = select(MSAStudy).where(MSAStudy.id == study_id)
    if load_children:
        stmt = stmt.options(
            selectinload(MSAStudy.operators),
            selectinload(MSAStudy.parts),
        )
    result = await session.execute(stmt)
    study = result.scalar_one_or_none()
    if study is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MSA study {study_id} not found",
        )
    return study


# ===========================================================================
# STUDY ENDPOINTS
# ===========================================================================


@router.post("/studies", response_model=MSAStudyResponse, status_code=status.HTTP_201_CREATED)
async def create_study(
    body: MSAStudyCreate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> MSAStudyResponse:
    """Create a new MSA study.

    Requires engineer+ role for the target plant.
    """
    check_plant_role(user, body.plant_id, "engineer")

    study = MSAStudy(
        plant_id=body.plant_id,
        name=body.name,
        study_type=body.study_type,
        characteristic_id=body.characteristic_id,
        num_operators=body.num_operators,
        num_parts=body.num_parts,
        num_replicates=body.num_replicates,
        tolerance=body.tolerance,
        status="setup",
        created_by=user.id,
    )
    session.add(study)
    await session.commit()
    await session.refresh(study)

    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study.id,
        "action": "create",
        "summary": f"MSA study '{study.name}' created (type: {study.study_type})",
        "fields": {
            "study_name": study.name,
            "study_type": study.study_type,
            "plant_id": study.plant_id,
            "characteristic_id": study.characteristic_id,
            "num_operators": study.num_operators,
            "num_parts": study.num_parts,
            "num_replicates": study.num_replicates,
            "tolerance": study.tolerance,
        },
    }

    logger.info("msa_study_created", study_id=study.id, user=user.username)
    return MSAStudyResponse.model_validate(study)


@router.get("/studies", response_model=list[MSAStudyResponse])
async def list_studies(
    plant_id: int = Query(..., description="Plant ID (required)"),
    status: str | None = Query(None, description="Filter by status (setup, collecting, complete)"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[MSAStudyResponse]:
    """List MSA studies for a plant.

    Requires engineer+ role for the plant.
    """
    check_plant_role(user, plant_id, "engineer")

    stmt = (
        select(MSAStudy)
        .where(MSAStudy.plant_id == plant_id)
        .order_by(MSAStudy.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if status is not None:
        stmt = stmt.where(MSAStudy.status == status)
    result = await session.execute(stmt)
    studies = list(result.scalars().all())
    return [MSAStudyResponse.model_validate(s) for s in studies]


@router.get("/studies/{study_id}", response_model=MSAStudyDetailResponse)
async def get_study(
    study_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> MSAStudyDetailResponse:
    """Get a single MSA study with operators, parts, and measurement count.

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id, load_children=True)
    check_plant_role(user, study.plant_id, "engineer")

    # Get measurement count
    count_stmt = (
        select(sa_func.count(MSAMeasurement.id))
        .where(MSAMeasurement.study_id == study_id)
    )
    measurement_count = (await session.execute(count_stmt)).scalar_one()

    resp = MSAStudyDetailResponse.model_validate(study)
    resp.measurement_count = measurement_count
    return resp


@router.delete("/studies/{study_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_study(
    study_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Delete an MSA study and all associated data.

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "engineer")

    # Capture details before deletion for audit trail
    study_name = study.name
    study_type = study.study_type
    study_status = study.status
    plant_id = study.plant_id

    await session.delete(study)
    await session.commit()

    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study_id,
        "action": "delete",
        "summary": f"MSA study '{study_name}' deleted (type: {study_type}, status: {study_status})",
        "fields": {
            "study_name": study_name,
            "study_type": study_type,
            "status": study_status,
            "plant_id": plant_id,
        },
    }

    logger.info("msa_study_deleted", study_id=study_id, user=user.username)


# ===========================================================================
# OPERATOR / PART ENDPOINTS
# ===========================================================================


@router.post("/studies/{study_id}/operators", response_model=list[MSAOperatorResponse])
async def set_operators(
    study_id: int,
    body: MSAOperatorsSet,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[MSAOperatorResponse]:
    """Set operators for an MSA study (bulk replace).

    Deletes existing operators and measurements, then creates new operators
    in the order provided. Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id, load_children=True)
    check_plant_role(user, study.plant_id, "engineer")

    # Delete existing operators (CASCADE will remove measurements referencing them)
    for op in list(study.operators):
        await session.delete(op)

    # Create new operators in order
    new_operators = []
    for i, name in enumerate(body.operators):
        op = MSAOperator(study_id=study_id, name=name, sequence_order=i)
        session.add(op)
        new_operators.append(op)

    await session.commit()
    for op in new_operators:
        await session.refresh(op)

    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study_id,
        "action": "update",
        "summary": f"Operators set for MSA study '{study.name}': {body.operators}",
        "fields": {
            "study_name": study.name,
            "operators": body.operators,
            "count": len(new_operators),
            "plant_id": study.plant_id,
        },
    }

    logger.info(
        "msa_operators_set", study_id=study_id,
        count=len(new_operators), user=user.username,
    )
    return [MSAOperatorResponse.model_validate(op) for op in new_operators]


@router.post("/studies/{study_id}/parts", response_model=list[MSAPartResponse])
async def set_parts(
    study_id: int,
    body: MSAPartsSet,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[MSAPartResponse]:
    """Set parts for an MSA study (bulk replace).

    Deletes existing parts and measurements, then creates new parts
    in the order provided. Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id, load_children=True)
    check_plant_role(user, study.plant_id, "engineer")

    # Delete existing parts (CASCADE will remove measurements referencing them)
    for part in list(study.parts):
        await session.delete(part)

    # Create new parts in order
    new_parts = []
    for i, part_input in enumerate(body.parts):
        part = MSAPart(
            study_id=study_id,
            name=part_input.name,
            reference_value=part_input.reference_value,
            sequence_order=i,
        )
        session.add(part)
        new_parts.append(part)

    await session.commit()
    for part in new_parts:
        await session.refresh(part)

    part_names = [p.name for p in body.parts]
    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study_id,
        "action": "update",
        "summary": f"Parts set for MSA study '{study.name}': {part_names}",
        "fields": {
            "study_name": study.name,
            "parts": part_names,
            "count": len(new_parts),
            "plant_id": study.plant_id,
        },
    }

    logger.info(
        "msa_parts_set", study_id=study_id,
        count=len(new_parts), user=user.username,
    )
    return [MSAPartResponse.model_validate(p) for p in new_parts]


# ===========================================================================
# MEASUREMENT ENDPOINTS
# ===========================================================================


@router.post("/studies/{study_id}/measurements", response_model=list[MSAMeasurementResponse])
async def submit_measurements(
    study_id: int,
    body: MSAMeasurementBatch,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[MSAMeasurementResponse]:
    """Submit a batch of variable measurements.

    Updates study status to 'collecting'. Requires engineer+ role.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "engineer")

    new_measurements = []
    for m in body.measurements:
        measurement = MSAMeasurement(
            study_id=study_id,
            operator_id=m.operator_id,
            part_id=m.part_id,
            replicate_num=m.replicate_num,
            value=m.value,
        )
        session.add(measurement)
        new_measurements.append(measurement)

    # Update study status to collecting
    if study.status == "setup":
        study.status = "collecting"

    await session.commit()
    for m in new_measurements:
        await session.refresh(m)

    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study_id,
        "action": "create",
        "summary": f"Submitted {len(new_measurements)} measurements for MSA study '{study.name}'",
        "fields": {
            "study_name": study.name,
            "measurement_count": len(new_measurements),
            "plant_id": study.plant_id,
        },
    }

    logger.info(
        "msa_measurements_submitted", study_id=study_id,
        count=len(new_measurements), user=user.username,
    )
    return [MSAMeasurementResponse.model_validate(m) for m in new_measurements]


@router.get("/studies/{study_id}/measurements", response_model=list[MSAMeasurementResponse])
async def get_measurements(
    study_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[MSAMeasurementResponse]:
    """Get all measurements for an MSA study.

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "engineer")

    stmt = (
        select(MSAMeasurement)
        .where(MSAMeasurement.study_id == study_id)
        .order_by(MSAMeasurement.id)
    )
    result = await session.execute(stmt)
    measurements = list(result.scalars().all())
    return [MSAMeasurementResponse.model_validate(m) for m in measurements]


@router.post(
    "/studies/{study_id}/attribute-measurements",
    response_model=list[MSAMeasurementResponse],
)
async def submit_attribute_measurements(
    study_id: int,
    body: MSAAttributeBatch,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[MSAMeasurementResponse]:
    """Submit a batch of attribute measurements.

    Updates study status to 'collecting'. Requires engineer+ role.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "engineer")

    new_measurements = []
    for m in body.measurements:
        measurement = MSAMeasurement(
            study_id=study_id,
            operator_id=m.operator_id,
            part_id=m.part_id,
            replicate_num=m.replicate_num,
            value=0.0,  # Placeholder for attribute studies
            attribute_value=m.attribute_value,
        )
        session.add(measurement)
        new_measurements.append(measurement)

    # Update study status to collecting
    if study.status == "setup":
        study.status = "collecting"

    await session.commit()
    for m in new_measurements:
        await session.refresh(m)

    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study_id,
        "action": "create",
        "summary": f"Submitted {len(new_measurements)} attribute measurements for MSA study '{study.name}'",
        "fields": {
            "study_name": study.name,
            "measurement_count": len(new_measurements),
            "plant_id": study.plant_id,
        },
    }

    logger.info(
        "msa_attribute_measurements_submitted", study_id=study_id,
        count=len(new_measurements), user=user.username,
    )
    return [MSAMeasurementResponse.model_validate(m) for m in new_measurements]


# ===========================================================================
# CALCULATION ENDPOINTS
# ===========================================================================


@router.post("/studies/{study_id}/calculate", response_model=GageRRResultResponse)
async def calculate_gage_rr(
    study_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> GageRRResultResponse:
    """Run Gage R&R analysis on a study's variable measurements.

    Reshapes measurements into a 3D array [operators][parts][replicates],
    runs the appropriate engine method (crossed_anova / range_method /
    nested_anova), stores the result JSON, and sets status to 'complete'.

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id, load_children=True)
    check_plant_role(user, study.plant_id, "engineer")

    if study.study_type not in ("crossed_anova", "range_method", "nested_anova"):
        if study.study_type == "linearity":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Study type 'linearity' must use the linearity-calculate endpoint",
            )
        if study.study_type == "stability":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Study type 'stability' must use the stability-calculate endpoint",
            )
        if study.study_type == "bias":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Study type 'bias' must use the bias-calculate endpoint",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Study type '{study.study_type}' is not a variable study — use attribute-calculate instead",
        )

    # Load measurements
    meas_result = await session.execute(
        select(MSAMeasurement).where(MSAMeasurement.study_id == study_id)
    )
    measurements = list(meas_result.scalars().all())

    if not measurements:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No measurements found — submit measurements before calculating",
        )

    # Build operator/part index maps by sequence_order
    op_index = {
        op.id: i
        for i, op in enumerate(sorted(study.operators, key=lambda o: o.sequence_order))
    }
    part_index = {
        p.id: i
        for i, p in enumerate(sorted(study.parts, key=lambda p: p.sequence_order))
    }

    # Reshape to 3D: [operators][parts][replicates]
    n_ops = len(study.operators)
    n_parts = len(study.parts)
    n_reps = study.num_replicates
    data_3d: list[list[list[float | None]]] = [
        [[None] * n_reps for _ in range(n_parts)]
        for _ in range(n_ops)
    ]
    for m in measurements:
        oi = op_index.get(m.operator_id)
        pi = part_index.get(m.part_id)
        if oi is None or pi is None:
            continue
        ri = m.replicate_num - 1  # 1-indexed to 0-indexed
        if 0 <= ri < n_reps:
            data_3d[oi][pi][ri] = m.value

    # Validate completeness
    for i in range(n_ops):
        for j in range(n_parts):
            for k in range(n_reps):
                if data_3d[i][j][k] is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Measurement matrix is incomplete — ensure all operator/part/replicate cells are filled",
                    )

    # Run engine
    engine = GageRREngine()
    try:
        if study.study_type == "crossed_anova":
            result = engine.calculate_crossed_anova(data_3d, study.tolerance)  # type: ignore[arg-type]
        elif study.study_type == "range_method":
            result = engine.calculate_range_method(data_3d, study.tolerance)  # type: ignore[arg-type]
        elif study.study_type == "nested_anova":
            result = engine.calculate_nested_anova(data_3d, study.tolerance)  # type: ignore[arg-type]
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown study type: {study.study_type}",
            )
    except ValueError as exc:
        logger.warning("msa_calculation_failed", study_id=study_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gage R&R calculation failed — check measurement data completeness",
        )

    # Store result
    study.results_json = json.dumps(asdict(result))
    study.status = "complete"
    study.completed_at = datetime.now(timezone.utc)

    # Initiate signature workflow if required for MSA study completion
    sig_engine = SignatureWorkflowEngine(session)
    if await sig_engine.check_workflow_required(session, "msa_study", study.plant_id):
        await sig_engine.initiate_workflow("msa_study", study.id, user.id, study.plant_id)

    await session.commit()

    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study.id,
        "action": "calculate",
        "summary": f"Gage R&R calculated for '{study.name}'"
                   + (f": GRR={result.pct_study_grr:.1f}%, ndc={result.ndc}" if result else ""),
        "fields": {
            "study_name": study.name,
            "study_type": study.study_type,
            "method": study.study_type,
            "grr_percent": round(result.pct_study_grr, 2) if result else None,
            "ndc": result.ndc if result else None,
            "plant_id": study.plant_id,
        },
    }

    logger.info(
        "msa_gage_rr_calculated", study_id=study_id,
        method=study.study_type, verdict=result.verdict, user=user.username,
    )
    return GageRRResultResponse.model_validate(asdict(result))


@router.post("/studies/{study_id}/attribute-calculate", response_model=AttributeMSAResultResponse)
async def calculate_attribute_msa(
    study_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AttributeMSAResultResponse:
    """Run Attribute MSA analysis (Kappa) on a study's attribute measurements.

    Reshapes attribute measurements into a 3D array [operators][parts][replicates],
    runs AttributeMSAEngine, stores the result JSON, and sets status to 'complete'.

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id, load_children=True)
    check_plant_role(user, study.plant_id, "engineer")

    if study.study_type != "attribute_agreement":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Study type '{study.study_type}' is not an attribute study — use calculate instead",
        )

    # Load measurements
    meas_result = await session.execute(
        select(MSAMeasurement).where(MSAMeasurement.study_id == study_id)
    )
    measurements = list(meas_result.scalars().all())

    if not measurements:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No measurements found — submit attribute measurements before calculating",
        )

    # Build operator/part index maps by sequence_order
    sorted_operators = sorted(study.operators, key=lambda o: o.sequence_order)
    sorted_parts = sorted(study.parts, key=lambda p: p.sequence_order)
    op_index = {op.id: i for i, op in enumerate(sorted_operators)}
    part_index = {p.id: i for i, p in enumerate(sorted_parts)}

    # Reshape to 3D: [operators][parts][replicates] -> attribute_value
    n_ops = len(study.operators)
    n_parts = len(study.parts)
    n_reps = study.num_replicates
    data_3d: list[list[list[str | None]]] = [
        [[None] * n_reps for _ in range(n_parts)]
        for _ in range(n_ops)
    ]
    for m in measurements:
        oi = op_index.get(m.operator_id)
        pi = part_index.get(m.part_id)
        if oi is None or pi is None:
            continue
        ri = m.replicate_num - 1
        if 0 <= ri < n_reps:
            data_3d[oi][pi][ri] = m.attribute_value

    # Validate completeness
    for i in range(n_ops):
        for j in range(n_parts):
            for k in range(n_reps):
                if data_3d[i][j][k] is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Attribute measurement matrix is incomplete — ensure all operator/part/replicate cells are filled",
                    )

    # Build reference decisions from part reference_values if available
    reference_decisions: list[str] | None = None
    # (Reference decisions for attribute studies would come from part metadata;
    #  not implemented yet — engine handles None gracefully)

    # Operator names for result labeling
    operator_names = [op.name for op in sorted_operators]

    # Run engine
    engine = AttributeMSAEngine()
    result = engine.calculate(
        data_3d,  # type: ignore[arg-type]
        reference_decisions=reference_decisions,
        operator_names=operator_names,
    )

    # Store result
    study.results_json = json.dumps(asdict(result))
    study.status = "complete"
    study.completed_at = datetime.now(timezone.utc)

    # Initiate signature workflow if required for MSA study completion
    sig_engine = SignatureWorkflowEngine(session)
    if await sig_engine.check_workflow_required(session, "msa_study", study.plant_id):
        await sig_engine.initiate_workflow("msa_study", study.id, user.id, study.plant_id)

    await session.commit()

    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study.id,
        "action": "calculate",
        "summary": f"Attribute MSA calculated for '{study.name}'",
        "fields": {
            "study_name": study.name,
            "study_type": "attribute",
            "plant_id": study.plant_id,
        },
    }

    logger.info(
        "msa_attribute_calculated", study_id=study_id,
        verdict=result.verdict, user=user.username,
    )
    return AttributeMSAResultResponse.model_validate(asdict(result))


@router.post("/studies/{study_id}/linearity-calculate", response_model=LinearityResultResponse)
async def calculate_linearity(
    study_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> LinearityResultResponse:
    """Run linearity analysis on a study's measurements.

    Uses parts' ``reference_value`` fields as reference standards and groups
    measurements by part to compute bias at each level.  Regresses bias vs
    reference and produces %Linearity / %Bias metrics.

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id, load_children=True)
    check_plant_role(user, study.plant_id, "engineer")

    if study.study_type != "linearity":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Study type '{study.study_type}' is not a linearity study — use calculate instead",
        )

    # Load measurements
    meas_result = await session.execute(
        select(MSAMeasurement).where(MSAMeasurement.study_id == study_id)
    )
    measurements = list(meas_result.scalars().all())

    if not measurements:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No measurements found — submit measurements before calculating",
        )

    # Build part ordering and validate reference values
    sorted_parts = sorted(study.parts, key=lambda p: p.sequence_order)
    part_index = {p.id: i for i, p in enumerate(sorted_parts)}

    reference_values: list[float] = []
    for part in sorted_parts:
        if part.reference_value is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Part '{part.name}' is missing a reference value — all parts in a linearity study must have reference values",
            )
        reference_values.append(part.reference_value)

    # Group measurements by part, then collect by replicate
    n_parts = len(sorted_parts)
    n_reps = study.num_replicates
    meas_by_part: list[list[float | None]] = [[None] * n_reps for _ in range(n_parts)]

    for m in measurements:
        pi = part_index.get(m.part_id)
        if pi is None:
            continue
        ri = m.replicate_num - 1
        if 0 <= ri < n_reps:
            meas_by_part[pi][ri] = m.value

    # Validate completeness
    for i in range(n_parts):
        for k in range(n_reps):
            if meas_by_part[i][k] is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Measurement matrix is incomplete — ensure all part/replicate cells are filled",
                )

    # Run linearity engine
    try:
        result = compute_linearity(
            reference_values=reference_values,
            measurements=meas_by_part,  # type: ignore[arg-type]
            tolerance=study.tolerance,
        )
    except ValueError as exc:
        logger.warning("msa_linearity_failed", study_id=study_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Linearity calculation failed — check measurement data completeness",
        )

    # Store result — convert NaN to None for JSON compatibility
    def _nan_to_none(v: float) -> float | None:
        return None if (isinstance(v, float) and math.isnan(v)) else v

    result_dict = {
        "reference_values": result.reference_values,
        "bias_values": result.bias_values,
        "bias_percentages": [_nan_to_none(bp) for bp in result.bias_percentages],
        "slope": result.slope,
        "intercept": result.intercept,
        "r_squared": result.r_squared,
        "linearity": result.linearity,
        "linearity_percent": _nan_to_none(result.linearity_percent),
        "bias_avg": result.bias_avg,
        "bias_percent": _nan_to_none(result.bias_percent),
        "is_acceptable": result.is_acceptable,
        "individual_points": result.individual_points,
        "verdict": result.verdict,
        "p_value": result.p_value,
    }
    study.results_json = json.dumps(result_dict)
    study.status = "complete"
    study.completed_at = datetime.now(timezone.utc)

    # Initiate signature workflow if required
    sig_engine = SignatureWorkflowEngine(session)
    if await sig_engine.check_workflow_required(session, "msa_study", study.plant_id):
        await sig_engine.initiate_workflow("msa_study", study.id, user.id, study.plant_id)

    await session.commit()

    lin_pct_str = f"{result.linearity_percent:.1f}%" if not math.isnan(result.linearity_percent) else "N/A"
    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study.id,
        "action": "calculate",
        "summary": f"Linearity calculated for '{study.name}': %Lin={lin_pct_str}, verdict={result.verdict}",
        "fields": {
            "study_name": study.name,
            "study_type": "linearity",
            "linearity_percent": _nan_to_none(result.linearity_percent),
            "verdict": result.verdict,
            "plant_id": study.plant_id,
        },
    }

    logger.info(
        "msa_linearity_calculated", study_id=study_id,
        verdict=result.verdict, user=user.username,
    )
    return LinearityResultResponse.model_validate(result_dict)


@router.post("/studies/{study_id}/stability-calculate", response_model=StabilityResultResponse)
async def calculate_stability(
    study_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> StabilityResultResponse:
    """Run stability analysis on a study's measurements.

    Uses I-MR chart calculations and Nelson Rules to evaluate measurement
    system stability over time (AIAG MSA 4th Ed., Chapter 4).

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id, load_children=True)
    check_plant_role(user, study.plant_id, "engineer")

    if study.study_type != "stability":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Study type '{study.study_type}' is not a stability study — use the appropriate calculate endpoint",
        )

    # Load measurements
    meas_result = await session.execute(
        select(MSAMeasurement).where(MSAMeasurement.study_id == study_id)
    )
    measurements = list(meas_result.scalars().all())

    if not measurements:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No measurements found — submit measurements before calculating",
        )

    # For stability studies, we use part sequence as time ordering
    # and collect all measurements in time order (by part sequence, then replicate)
    sorted_parts = sorted(study.parts, key=lambda p: p.sequence_order)
    part_index = {p.id: i for i, p in enumerate(sorted_parts)}

    # Group by part and replicate to form time-ordered series
    # For stability: each "part" represents a time point, replicates are repeated measurements
    n_parts = len(sorted_parts)
    n_reps = study.num_replicates
    meas_by_time: list[list[float | None]] = [[None] * n_reps for _ in range(n_parts)]

    for m in measurements:
        pi = part_index.get(m.part_id)
        if pi is None:
            continue
        ri = m.replicate_num - 1
        if 0 <= ri < n_reps:
            meas_by_time[pi][ri] = m.value

    # Flatten to time-ordered individual values
    time_ordered_values: list[float] = []
    for time_idx in range(n_parts):
        for rep_idx in range(n_reps):
            val = meas_by_time[time_idx][rep_idx]
            if val is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Measurement matrix is incomplete — ensure all time point/replicate cells are filled",
                )
            time_ordered_values.append(val)

    # Run stability engine
    try:
        result = compute_stability(measurements=time_ordered_values)
    except ValueError as exc:
        logger.warning("msa_stability_failed", study_id=study_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stability calculation failed — check measurement data completeness",
        )

    # Store result
    from dataclasses import asdict as _asdict
    result_dict = _asdict(result)
    study.results_json = json.dumps(result_dict)
    study.status = "complete"
    study.completed_at = datetime.now(timezone.utc)

    # Initiate signature workflow if required
    sig_engine = SignatureWorkflowEngine(session)
    if await sig_engine.check_workflow_required(session, "msa_study", study.plant_id):
        await sig_engine.initiate_workflow("msa_study", study.id, user.id, study.plant_id)

    await session.commit()

    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study.id,
        "action": "calculate",
        "summary": f"Stability study calculated for '{study.name}': verdict={result.verdict}",
        "fields": {
            "study_name": study.name,
            "study_type": "stability",
            "verdict": result.verdict,
            "n_violations": len(result.violations),
            "plant_id": study.plant_id,
        },
    }

    logger.info(
        "msa_stability_calculated", study_id=study_id,
        verdict=result.verdict, user=user.username,
    )
    return StabilityResultResponse.model_validate(result_dict)


@router.post("/studies/{study_id}/bias-calculate", response_model=BiasResultResponse)
async def calculate_bias(
    study_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> BiasResultResponse:
    """Run standalone bias analysis on a study's measurements.

    Uses the Independent Sample Bias Method (AIAG MSA 4th Ed., Chapter 3)
    to assess measurement system bias relative to a known reference value.

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id, load_children=True)
    check_plant_role(user, study.plant_id, "engineer")

    if study.study_type != "bias":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Study type '{study.study_type}' is not a bias study — use the appropriate calculate endpoint",
        )

    # Load measurements
    meas_result = await session.execute(
        select(MSAMeasurement).where(MSAMeasurement.study_id == study_id)
    )
    measurements = list(meas_result.scalars().all())

    if not measurements:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No measurements found — submit measurements before calculating",
        )

    # For bias study, we need exactly one part with a reference_value
    sorted_parts = sorted(study.parts, key=lambda p: p.sequence_order)
    if not sorted_parts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bias study requires at least one part with a reference value",
        )

    reference_part = sorted_parts[0]
    if reference_part.reference_value is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Part '{reference_part.name}' is missing a reference value — bias study requires a known reference",
        )

    reference_value = reference_part.reference_value

    # Collect all measurement values
    values = [m.value for m in measurements]

    # Run bias engine
    try:
        result = compute_bias(
            measurements=values,
            reference_value=reference_value,
            tolerance=study.tolerance,
        )
    except ValueError as exc:
        logger.warning("msa_bias_failed", study_id=study_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bias calculation failed — check measurement data completeness",
        )

    # Store result
    from dataclasses import asdict as _asdict
    result_dict = _asdict(result)
    study.results_json = json.dumps(result_dict)
    study.status = "complete"
    study.completed_at = datetime.now(timezone.utc)

    # Initiate signature workflow if required
    sig_engine = SignatureWorkflowEngine(session)
    if await sig_engine.check_workflow_required(session, "msa_study", study.plant_id):
        await sig_engine.initiate_workflow("msa_study", study.id, user.id, study.plant_id)

    await session.commit()

    bias_pct_str = f"{result.bias_percent:.1f}%" if result.bias_percent is not None else "N/A"
    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study.id,
        "action": "calculate",
        "summary": f"Bias study calculated for '{study.name}': %Bias={bias_pct_str}, verdict={result.verdict}",
        "fields": {
            "study_name": study.name,
            "study_type": "bias",
            "bias_percent": result.bias_percent,
            "verdict": result.verdict,
            "is_significant": result.is_significant,
            "plant_id": study.plant_id,
        },
    }

    logger.info(
        "msa_bias_calculated", study_id=study_id,
        verdict=result.verdict, user=user.username,
    )
    return BiasResultResponse.model_validate(result_dict)


@router.get(
    "/studies/{study_id}/results",
    response_model=GageRRResultResponse | AttributeMSAResultResponse | LinearityResultResponse | StabilityResultResponse | BiasResultResponse,
)
async def get_results(
    study_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> GageRRResultResponse | AttributeMSAResultResponse:
    """Get cached calculation results for an MSA study.

    Returns the stored results_json validated through the appropriate
    response schema based on study type.
    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "engineer")

    if study.results_json is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No results available — run calculate first",
        )

    raw = json.loads(study.results_json)

    if study.study_type == "attribute_agreement":
        return AttributeMSAResultResponse.model_validate(raw)
    elif study.study_type == "linearity":
        return LinearityResultResponse.model_validate(raw)
    elif study.study_type == "stability":
        return StabilityResultResponse.model_validate(raw)
    elif study.study_type == "bias":
        return BiasResultResponse.model_validate(raw)
    else:
        return GageRRResultResponse.model_validate(raw)
