"""Design of Experiments (DOE) REST endpoints.

Provides CRUD for DOE studies, design matrix generation, run management
with batch response entry, and ANOVA/regression analysis.
"""

import json
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
from cassini.api.schemas.doe import (
    ANOVARowResponse,
    DOEAnalysisResponse,
    DOEFactorResponse,
    DOERunBatchUpdate,
    DOERunResponse,
    DOEStudyCreate,
    DOEStudyResponse,
    DOEStudyUpdate,
    EffectResponse,
    InteractionResponse,
    NormalityTestResponse,
    RegressionResponse,
    ResidualStatsResponse,
)
from cassini.db.models.doe import DOEAnalysis, DOEFactor, DOERun, DOEStudy
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/doe", tags=["doe"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_study_or_404(
    session: AsyncSession,
    study_id: int,
    *,
    load_children: bool = False,
) -> DOEStudy:
    """Fetch a DOE study by ID, optionally eager-loading factors and runs."""
    stmt = select(DOEStudy).where(DOEStudy.id == study_id)
    if load_children:
        stmt = stmt.options(
            selectinload(DOEStudy.factors),
            selectinload(DOEStudy.runs),
        )
    result = await session.execute(stmt)
    study = result.scalar_one_or_none()
    if study is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="DOE study not found",
        )
    return study


def _build_run_response(run: DOERun) -> DOERunResponse:
    """Build DOERunResponse from a model, parsing JSON text fields."""
    return DOERunResponse(
        id=run.id,
        run_order=run.run_order,
        standard_order=run.standard_order,
        factor_values=json.loads(run.factor_values) if run.factor_values else {},
        factor_actuals=json.loads(run.factor_actuals) if run.factor_actuals else {},
        response_value=run.response_value,
        is_center_point=run.is_center_point,
        replicate=run.replicate,
        notes=run.notes,
        completed_at=run.completed_at,
    )


def _build_study_response(
    study: DOEStudy,
    *,
    factors: list[DOEFactor] | None = None,
    run_count: int = 0,
    completed_run_count: int = 0,
) -> DOEStudyResponse:
    """Build DOEStudyResponse from a model."""
    factor_responses: list[DOEFactorResponse] = []
    if factors is not None:
        factor_responses = [
            DOEFactorResponse(
                id=f.id,
                name=f.name,
                low_level=f.low_level,
                high_level=f.high_level,
                center_point=f.center_point,
                unit=f.unit,
                display_order=f.display_order,
            )
            for f in sorted(factors, key=lambda f: f.display_order)
        ]

    return DOEStudyResponse(
        id=study.id,
        plant_id=study.plant_id,
        name=study.name,
        design_type=study.design_type,
        resolution=study.resolution,
        status=study.status,
        response_name=study.response_name,
        response_unit=study.response_unit,
        notes=study.notes,
        created_by=study.created_by,
        created_at=study.created_at,
        updated_at=study.updated_at,
        factors=factor_responses,
        run_count=run_count,
        completed_run_count=completed_run_count,
    )


def _build_analysis_response(analysis: DOEAnalysis) -> DOEAnalysisResponse:
    """Build DOEAnalysisResponse from a model, parsing JSON text fields."""
    # Parse ANOVA table
    anova_table: list[ANOVARowResponse] = []
    try:
        raw_anova = json.loads(analysis.anova_table) if analysis.anova_table else []
        for row in raw_anova:
            anova_table.append(
                ANOVARowResponse(
                    source=row.get("source", ""),
                    sum_of_squares=row.get("sum_of_squares", 0.0),
                    df=row.get("df", 0),
                    mean_square=row.get("mean_square", 0.0),
                    f_value=row.get("f_value"),
                    p_value=row.get("p_value"),
                )
            )
    except (json.JSONDecodeError, TypeError):
        pass

    # Parse effects
    effects: list[EffectResponse] = []
    try:
        raw_effects = json.loads(analysis.effects) if analysis.effects else []
        for idx, eff in enumerate(raw_effects):
            effects.append(
                EffectResponse(
                    factor_index=idx,
                    factor_name=eff.get("factor_name", f"Factor {idx}"),
                    effect=eff.get("effect", 0.0),
                    coefficient=eff.get("coefficient", 0.0),
                    sum_of_squares=eff.get("sum_of_squares"),
                    t_statistic=eff.get("t_statistic"),
                    p_value=eff.get("p_value"),
                    significant=eff.get("significant"),
                )
            )
    except (json.JSONDecodeError, TypeError):
        pass

    # Build factor name -> index mapping from effects
    factor_name_to_index: dict[str, int] = {
        eff.factor_name: eff.factor_index for eff in effects
    }

    # Parse interactions
    interactions: list[InteractionResponse] = []
    try:
        raw_interactions = (
            json.loads(analysis.interactions) if analysis.interactions else []
        )
        for ix in raw_interactions:
            ix_factor_names = ix.get("factors", [])
            ix_factor_indices = [
                factor_name_to_index.get(name, idx)
                for idx, name in enumerate(ix_factor_names)
            ]
            interactions.append(
                InteractionResponse(
                    factor_indices=ix_factor_indices,
                    factor_names=ix_factor_names,
                    effect=ix.get("effect", 0.0),
                    coefficient=ix.get("coefficient"),
                    sum_of_squares=ix.get("sum_of_squares"),
                    t_statistic=ix.get("t_statistic"),
                    p_value=ix.get("p_value"),
                    significant=ix.get("significant"),
                )
            )
    except (json.JSONDecodeError, TypeError):
        pass

    # Parse regression model (optional)
    regression: RegressionResponse | None = None
    try:
        if analysis.regression_model:
            reg_coeffs = json.loads(analysis.regression_model)
            optimal = None
            if analysis.optimal_settings:
                optimal = json.loads(analysis.optimal_settings)
            regression = RegressionResponse(
                coefficients=reg_coeffs,
                r_squared=analysis.r_squared or 0.0,
                adj_r_squared=analysis.adj_r_squared or 0.0,
                optimal_settings=optimal,
            )
    except (json.JSONDecodeError, TypeError):
        pass

    # Parse residual diagnostics (optional — absent in older analyses)
    residuals: list[float] | None = None
    fitted_values: list[float] | None = None
    normality_test: NormalityTestResponse | None = None
    outlier_indices: list[int] | None = None
    residual_stats: ResidualStatsResponse | None = None

    try:
        if analysis.residuals_json:
            residuals = json.loads(analysis.residuals_json)
    except (json.JSONDecodeError, TypeError):
        pass

    try:
        if analysis.fitted_values_json:
            fitted_values = json.loads(analysis.fitted_values_json)
    except (json.JSONDecodeError, TypeError):
        pass

    try:
        if analysis.normality_test_json:
            nt = json.loads(analysis.normality_test_json)
            if nt:
                normality_test = NormalityTestResponse(**nt)
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

    try:
        if analysis.outlier_indices_json:
            outlier_indices = json.loads(analysis.outlier_indices_json)
    except (json.JSONDecodeError, TypeError):
        pass

    try:
        if analysis.residual_stats_json:
            rs = json.loads(analysis.residual_stats_json)
            if rs:
                residual_stats = ResidualStatsResponse(**rs)
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

    return DOEAnalysisResponse(
        id=analysis.id,
        study_id=analysis.study_id,
        grand_mean=analysis.grand_mean or 0.0,
        anova_table=anova_table,
        effects=effects,
        interactions=interactions,
        r_squared=analysis.r_squared or 0.0,
        adj_r_squared=analysis.adj_r_squared or 0.0,
        regression=regression,
        residuals=residuals,
        fitted_values=fitted_values,
        normality_test=normality_test,
        outlier_indices=outlier_indices,
        residual_stats=residual_stats,
        computed_at=analysis.computed_at,
    )


# ===========================================================================
# STUDY ENDPOINTS
# ===========================================================================


@router.get("/studies", response_model=list[DOEStudyResponse])
async def list_studies(
    plant_id: int = Query(..., description="Plant ID (required)"),
    study_status: str | None = Query(
        None, alias="status", description="Filter by status (design, collecting, analyzed)"
    ),
    limit: int = Query(100, ge=1, le=1000, description="Maximum items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[DOEStudyResponse]:
    """List DOE studies for a plant.

    Requires engineer+ role for the plant.
    """
    check_plant_role(user, plant_id, "engineer")

    stmt = (
        select(DOEStudy)
        .where(DOEStudy.plant_id == plant_id)
        .options(selectinload(DOEStudy.factors))
        .order_by(DOEStudy.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if study_status is not None:
        stmt = stmt.where(DOEStudy.status == study_status)

    result = await session.execute(stmt)
    studies = list(result.scalars().all())

    responses: list[DOEStudyResponse] = []
    for study in studies:
        # Get run counts
        count_stmt = (
            select(
                sa_func.count(DOERun.id),
                sa_func.count(DOERun.id).filter(DOERun.response_value.isnot(None)),
            )
            .where(DOERun.study_id == study.id)
        )
        count_result = await session.execute(count_stmt)
        row = count_result.one()
        run_count = row[0]
        completed_run_count = row[1]

        responses.append(
            _build_study_response(
                study,
                factors=list(study.factors),
                run_count=run_count,
                completed_run_count=completed_run_count,
            )
        )

    return responses


@router.post(
    "/studies",
    response_model=DOEStudyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_study(
    body: DOEStudyCreate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> DOEStudyResponse:
    """Create a new DOE study with factors.

    Creates the study and its factors in a single transaction.
    Requires engineer+ role for the target plant.
    """
    check_plant_role(user, body.plant_id, "engineer")

    study = DOEStudy(
        plant_id=body.plant_id,
        name=body.name,
        design_type=body.design_type,
        resolution=body.resolution,
        response_name=body.response_name,
        response_unit=body.response_unit,
        notes=body.notes,
        status="design",
        created_by=user.id,
    )
    session.add(study)
    await session.flush()  # Get study.id for FK

    factors: list[DOEFactor] = []
    for idx, factor_data in enumerate(body.factors):
        factor = DOEFactor(
            study_id=study.id,
            name=factor_data.name,
            low_level=factor_data.low_level,
            high_level=factor_data.high_level,
            center_point=(factor_data.low_level + factor_data.high_level) / 2.0,
            unit=factor_data.unit,
            display_order=idx,
        )
        session.add(factor)
        factors.append(factor)

    await session.commit()
    await session.refresh(study)
    for f in factors:
        await session.refresh(f)

    logger.info(
        "doe_study_created",
        study_id=study.id,
        design_type=study.design_type,
        factor_count=len(factors),
        user=user.username,
    )

    request.state.audit_context = {
        "resource_type": "doe_study",
        "resource_id": study.id,
        "action": "create",
        "summary": f"DOE study '{body.name}' created ({body.design_type})",
        "fields": {
            "name": body.name,
            "design_type": body.design_type,
            "plant_id": body.plant_id,
            "response_name": body.response_name,
            "factor_count": len(factors),
        },
    }

    return _build_study_response(study, factors=factors)


@router.get("/studies/{study_id}", response_model=DOEStudyResponse)
async def get_study(
    study_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> DOEStudyResponse:
    """Get a single DOE study with factors and run counts.

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id, load_children=True)
    check_plant_role(user, study.plant_id, "engineer")

    # Count runs
    run_count = len(study.runs)
    completed_run_count = sum(1 for r in study.runs if r.response_value is not None)

    return _build_study_response(
        study,
        factors=list(study.factors),
        run_count=run_count,
        completed_run_count=completed_run_count,
    )


@router.put("/studies/{study_id}", response_model=DOEStudyResponse)
async def update_study(
    study_id: int,
    body: DOEStudyUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> DOEStudyResponse:
    """Update DOE study metadata.

    Only allowed when status is 'design' or 'collecting'.
    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id, load_children=True)
    check_plant_role(user, study.plant_id, "engineer")

    if study.status not in ("design", "collecting"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Study is in '{study.status}' status — only 'design' or 'collecting' studies can be modified",
        )

    update_data = body.model_dump(exclude_unset=True)
    old_name = study.name
    old_values = {field: getattr(study, field, None) for field in update_data}
    for field, value in update_data.items():
        setattr(study, field, value)

    study.updated_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(study)

    logger.info(
        "doe_study_updated",
        study_id=study_id,
        user=user.username,
        fields=list(update_data.keys()),
    )

    new_values = {field: getattr(study, field, None) for field in update_data}
    request.state.audit_context = {
        "resource_type": "doe_study",
        "resource_id": study_id,
        "action": "update",
        "summary": f"DOE study '{old_name}' updated",
        "fields": {
            "old_values": old_values,
            "new_values": new_values,
        },
    }

    run_count = len(study.runs)
    completed_run_count = sum(1 for r in study.runs if r.response_value is not None)

    return _build_study_response(
        study,
        factors=list(study.factors),
        run_count=run_count,
        completed_run_count=completed_run_count,
    )


@router.delete(
    "/studies/{study_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_study(
    study_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Delete a DOE study and all associated data (factors, runs, analyses).

    Requires admin role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "admin")

    deleted_name = study.name
    deleted_type = study.design_type
    deleted_status = study.status
    deleted_plant_id = study.plant_id

    await session.delete(study)
    await session.commit()

    logger.info("doe_study_deleted", study_id=study_id, user=user.username)

    request.state.audit_context = {
        "resource_type": "doe_study",
        "resource_id": study_id,
        "action": "delete",
        "summary": f"DOE study '{deleted_name}' deleted",
        "fields": {
            "name": deleted_name,
            "design_type": deleted_type,
            "status": deleted_status,
            "plant_id": deleted_plant_id,
        },
    }


# ===========================================================================
# DESIGN GENERATION
# ===========================================================================


@router.post("/studies/{study_id}/generate", response_model=list[DOERunResponse])
async def generate_design(
    study_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[DOERunResponse]:
    """Generate the experimental design matrix and create runs.

    Validates that the study is in 'design' status, generates the design
    matrix using the appropriate algorithm, creates DOERun rows, and
    transitions the study to 'collecting' status.
    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "engineer")

    if study.status != "design":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Study is in '{study.status}' status — design generation requires 'design' status",
        )

    from cassini.core.doe import DOEEngine

    engine = DOEEngine()
    try:
        run_dicts = await engine.generate_design(session, study_id)
    except ValueError as exc:
        logger.warning("doe_generate_failed", study_id=study_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to generate design. Check study configuration.",
        )

    await session.commit()

    # Reload runs to return full responses with IDs
    stmt = (
        select(DOERun)
        .where(DOERun.study_id == study_id)
        .order_by(DOERun.run_order.asc())
    )
    result = await session.execute(stmt)
    runs = list(result.scalars().all())

    logger.info(
        "doe_design_generated",
        study_id=study_id,
        run_count=len(runs),
        user=user.username,
    )

    request.state.audit_context = {
        "resource_type": "doe_study",
        "resource_id": study_id,
        "action": "generate",
        "summary": f"Design matrix generated for DOE study {study_id} ({len(runs)} runs)",
        "fields": {
            "study_id": study_id,
            "run_count": len(runs),
            "design_type": study.design_type,
        },
    }

    return [_build_run_response(r) for r in runs]


# ===========================================================================
# RUN ENDPOINTS
# ===========================================================================


@router.get("/studies/{study_id}/runs", response_model=list[DOERunResponse])
async def get_runs(
    study_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[DOERunResponse]:
    """Get all experimental runs for a DOE study, sorted by run order.

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "engineer")

    stmt = (
        select(DOERun)
        .where(DOERun.study_id == study_id)
        .order_by(DOERun.run_order.asc())
    )
    result = await session.execute(stmt)
    runs = list(result.scalars().all())

    return [_build_run_response(r) for r in runs]


@router.put("/studies/{study_id}/runs", response_model=list[DOERunResponse])
async def batch_update_runs(
    study_id: int,
    body: DOERunBatchUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[DOERunResponse]:
    """Batch update response values for experimental runs.

    Validates that the study is in 'collecting' status and updates each
    run's response_value, notes, and completed_at timestamp.
    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "engineer")

    if study.status != "collecting":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Study is in '{study.status}' status — run updates require 'collecting' status",
        )

    # Build lookup of run_id -> update data
    update_map = {u.run_id: u for u in body.runs}

    # Load all runs for this study
    stmt = (
        select(DOERun)
        .where(DOERun.study_id == study_id)
        .order_by(DOERun.run_order.asc())
    )
    result = await session.execute(stmt)
    runs = list(result.scalars().all())

    run_id_set = {r.id for r in runs}
    invalid_ids = set(update_map.keys()) - run_id_set
    if invalid_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Run IDs not found in study: {sorted(invalid_ids)}",
        )

    now = datetime.now(timezone.utc)
    updated_count = 0
    for run in runs:
        if run.id in update_map:
            upd = update_map[run.id]
            run.response_value = upd.response_value
            if upd.notes is not None:
                run.notes = upd.notes
            run.completed_at = now
            updated_count += 1

    await session.commit()

    # Refresh runs for response
    for run in runs:
        await session.refresh(run)

    logger.info(
        "doe_runs_updated",
        study_id=study_id,
        updated_count=updated_count,
        user=user.username,
    )

    request.state.audit_context = {
        "resource_type": "doe_study",
        "resource_id": study_id,
        "action": "update",
        "summary": f"Batch updated {updated_count} run(s) for DOE study {study_id}",
        "fields": {
            "study_id": study_id,
            "updated_run_count": updated_count,
            "run_ids": sorted(update_map.keys()),
        },
    }

    return [_build_run_response(r) for r in runs]


# ===========================================================================
# ANALYSIS ENDPOINTS
# ===========================================================================


@router.post("/studies/{study_id}/analyze", response_model=DOEAnalysisResponse)
async def analyze_study(
    study_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> DOEAnalysisResponse:
    """Run ANOVA and regression analysis on a DOE study.

    Validates that the study is in 'collecting' status and all runs have
    response values. Computes effects, interactions, ANOVA table, and
    optionally regression for RSM designs. Transitions study to 'analyzed'.
    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id, load_children=True)
    check_plant_role(user, study.plant_id, "engineer")

    if study.status not in ("collecting", "analyzed"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Study is in '{study.status}' status — analysis requires 'collecting' or 'analyzed' status",
        )

    # Validate all runs have response values
    missing_runs = [r.run_order for r in study.runs if r.response_value is None]
    if missing_runs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Runs missing response values (run_order): {missing_runs}",
        )

    from cassini.core.doe import DOEEngine

    engine = DOEEngine()
    try:
        await engine.analyze(session, study_id)
    except ValueError as exc:
        logger.warning("doe_analysis_failed", study_id=study_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Analysis failed. Check study data.",
        )

    await session.commit()

    # Load the latest analysis
    analysis_stmt = (
        select(DOEAnalysis)
        .where(DOEAnalysis.study_id == study_id)
        .order_by(DOEAnalysis.computed_at.desc())
        .limit(1)
    )
    analysis_result = await session.execute(analysis_stmt)
    analysis = analysis_result.scalar_one_or_none()

    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Analysis completed but results could not be loaded",
        )

    logger.info(
        "doe_analysis_completed",
        study_id=study_id,
        r_squared=analysis.r_squared,
        user=user.username,
    )

    request.state.audit_context = {
        "resource_type": "doe_study",
        "resource_id": study_id,
        "action": "analyze",
        "summary": f"DOE study '{study.name}' analyzed (R²={analysis.r_squared:.4f})" if analysis.r_squared else f"DOE study '{study.name}' analyzed",
        "fields": {
            "study_id": study_id,
            "study_name": study.name,
            "r_squared": analysis.r_squared,
            "adj_r_squared": analysis.adj_r_squared,
        },
    }

    return _build_analysis_response(analysis)


@router.get("/studies/{study_id}/analysis", response_model=DOEAnalysisResponse)
async def get_analysis(
    study_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> DOEAnalysisResponse:
    """Get the latest analysis results for a DOE study.

    Requires engineer+ role for the study's plant.
    """
    study = await _get_study_or_404(session, study_id)
    check_plant_role(user, study.plant_id, "engineer")

    stmt = (
        select(DOEAnalysis)
        .where(DOEAnalysis.study_id == study_id)
        .order_by(DOEAnalysis.computed_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    analysis = result.scalar_one_or_none()

    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis results available — run analyze first",
        )

    return _build_analysis_response(analysis)
