"""Measurement System Analysis (MSA) REST endpoints — Gage R&R + Attribute MSA.

Provides CRUD for MSA studies, operator/part/measurement management,
and calculation endpoints for variable (Gage R&R) and attribute MSA.
"""

import json
from dataclasses import asdict
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
)
from openspc.api.schemas.msa import (
    AttributeMSAResultResponse,
    GageRRResultResponse,
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
)
from openspc.core.msa import AttributeMSAEngine, GageRREngine
from openspc.db.models.msa import MSAMeasurement, MSAOperator, MSAPart, MSAStudy
from openspc.db.models.user import User

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

    logger.info("msa_study_created", study_id=study.id, user=user.username)
    return MSAStudyResponse.model_validate(study)


@router.get("/studies", response_model=list[MSAStudyResponse])
async def list_studies(
    plant_id: int = Query(..., description="Plant ID (required)"),
    status: str | None = Query(None, description="Filter by status (setup, collecting, complete)"),
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
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Delete an MSA study and all associated data.

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "engineer")

    await session.delete(study)
    await session.commit()

    logger.info("msa_study_deleted", study_id=study_id, user=user.username)


# ===========================================================================
# OPERATOR / PART ENDPOINTS
# ===========================================================================


@router.post("/studies/{study_id}/operators", response_model=list[MSAOperatorResponse])
async def set_operators(
    study_id: int,
    body: MSAOperatorsSet,
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

    logger.info(
        "msa_operators_set", study_id=study_id,
        count=len(new_operators), user=user.username,
    )
    return [MSAOperatorResponse.model_validate(op) for op in new_operators]


@router.post("/studies/{study_id}/parts", response_model=list[MSAPartResponse])
async def set_parts(
    study_id: int,
    body: MSAPartsSet,
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

    # Store result
    study.results_json = json.dumps(asdict(result))
    study.status = "complete"
    study.completed_at = datetime.now(timezone.utc)

    await session.commit()

    logger.info(
        "msa_gage_rr_calculated", study_id=study_id,
        method=study.study_type, verdict=result.verdict, user=user.username,
    )
    return GageRRResultResponse.model_validate(asdict(result))


@router.post("/studies/{study_id}/attribute-calculate", response_model=AttributeMSAResultResponse)
async def calculate_attribute_msa(
    study_id: int,
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

    await session.commit()

    logger.info(
        "msa_attribute_calculated", study_id=study_id,
        verdict=result.verdict, user=user.username,
    )
    return AttributeMSAResultResponse.model_validate(asdict(result))


@router.get("/studies/{study_id}/results")
async def get_results(
    study_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> dict:
    """Get cached calculation results for an MSA study.

    Returns the stored results_json parsed back to a dictionary.
    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "engineer")

    if study.results_json is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No results available — run calculate first",
        )

    return json.loads(study.results_json)
