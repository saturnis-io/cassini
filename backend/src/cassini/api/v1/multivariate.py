"""Multivariate SPC and Correlation REST endpoints.

Provides CRUD for multivariate chart groups, T-squared / MEWMA computation,
phase freeze, correlation matrix analysis, and PCA.
"""

import json
from dataclasses import asdict
from datetime import datetime, timezone

import numpy as np
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
)
from cassini.api.schemas.multivariate import (
    CorrelationComputeRequest,
    CorrelationResultResponse,
    FreezeRequest,
    MultivariateChartResponse,
    MultivariateGroupCreate,
    MultivariateGroupMemberResponse,
    MultivariateGroupResponse,
    MultivariateGroupUpdate,
    PCAResultResponse,
    T2Point,
)
from cassini.core.multivariate import (
    CorrelationEngine,
    HotellingT2Engine,
    MEWMAEngine,
    T2Decomposition,
)
from cassini.core.multivariate.data_loader import load_aligned_data
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.multivariate import (
    CorrelationResult,
    MultivariateGroup,
    MultivariateGroupMember,
    MultivariateSample,
)
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/multivariate", tags=["multivariate"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_group_or_404(
    session: AsyncSession, group_id: int
) -> MultivariateGroup:
    """Fetch a multivariate group by ID with members eager-loaded."""
    stmt = (
        select(MultivariateGroup)
        .options(selectinload(MultivariateGroup.members))
        .where(MultivariateGroup.id == group_id)
    )
    result = await session.execute(stmt)
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Multivariate group not found",
        )
    return group


async def _build_hierarchy_path(session: AsyncSession, hierarchy_id: int) -> str:
    """Build 'Plant > Line > Machine' path by walking the hierarchy tree."""
    parts: list[str] = []
    current_id: int | None = hierarchy_id
    while current_id is not None:
        stmt = select(Hierarchy.name, Hierarchy.parent_id).where(
            Hierarchy.id == current_id
        )
        result = await session.execute(stmt)
        row = result.one_or_none()
        if row is None:
            break
        parts.insert(0, row[0])
        current_id = row[1]
    return " > ".join(parts)


async def _build_group_response(
    session: AsyncSession, group: MultivariateGroup
) -> MultivariateGroupResponse:
    """Build a MultivariateGroupResponse with characteristic names resolved."""
    member_responses: list[MultivariateGroupMemberResponse] = []
    hierarchy_cache: dict[int, str] = {}

    for m in sorted(group.members, key=lambda x: x.display_order):
        # Resolve characteristic name + hierarchy_id
        char_stmt = select(
            Characteristic.name, Characteristic.hierarchy_id
        ).where(Characteristic.id == m.characteristic_id)
        char_result = await session.execute(char_stmt)
        char_row = char_result.one_or_none()
        char_name = char_row[0] if char_row else None
        hierarchy_id = char_row[1] if char_row else None

        # Build hierarchy path (cached to avoid re-walking shared ancestors)
        hierarchy_path = None
        if hierarchy_id is not None:
            if hierarchy_id not in hierarchy_cache:
                hierarchy_cache[hierarchy_id] = await _build_hierarchy_path(
                    session, hierarchy_id
                )
            hierarchy_path = hierarchy_cache[hierarchy_id]

        member_responses.append(
            MultivariateGroupMemberResponse(
                id=m.id,
                characteristic_id=m.characteristic_id,
                characteristic_name=char_name,
                hierarchy_path=hierarchy_path,
                display_order=m.display_order,
            )
        )

    return MultivariateGroupResponse(
        id=group.id,
        plant_id=group.plant_id,
        name=group.name,
        description=group.description,
        chart_type=group.chart_type,
        lambda_param=group.lambda_param,
        alpha=group.alpha,
        phase=group.phase,
        min_samples=group.min_samples,
        is_active=group.is_active,
        created_at=group.created_at,
        updated_at=group.updated_at,
        members=member_responses,
    )


async def _validate_char_ids_for_plant(
    session: AsyncSession, char_ids: list[int], plant_id: int
) -> None:
    """Validate that all characteristic IDs belong to the specified plant."""
    for cid in char_ids:
        stmt = (
            select(Hierarchy.plant_id)
            .join(Characteristic, Characteristic.hierarchy_id == Hierarchy.id)
            .where(Characteristic.id == cid)
        )
        result = await session.execute(stmt)
        resolved_plant_id = result.scalar_one_or_none()
        if resolved_plant_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Characteristic {cid} not found",
            )
        if resolved_plant_id != plant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Characteristic {cid} does not belong to plant {plant_id}",
            )


# ===========================================================================
# CORRELATION ENDPOINTS (static paths — MUST come before /{group_id} routes)
# ===========================================================================


@router.post("/correlation/compute", response_model=CorrelationResultResponse)
async def compute_correlation(
    body: CorrelationComputeRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> CorrelationResultResponse:
    """Compute a pairwise correlation matrix for the specified characteristics.

    Loads aligned data across all requested characteristics, computes the
    Pearson or Spearman correlation matrix with p-values, optionally runs
    PCA, and persists the result.

    Requires engineer+ role for the target plant.
    """
    check_plant_role(user, body.plant_id, "engineer")
    await _validate_char_ids_for_plant(session, body.characteristic_ids, body.plant_id)

    try:
        X, timestamps, char_names = await load_aligned_data(
            session, body.characteristic_ids
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to load aligned data for the specified characteristics",
        )

    if X.shape[0] < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient aligned data — need at least 3 aligned observations",
        )

    engine = CorrelationEngine()
    try:
        corr_result = engine.compute_correlation_matrix(
            X, char_names, method=body.method
        )
    except Exception:
        logger.exception("correlation_computation_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Correlation computation failed",
        )

    # Persist the result
    pca_eigenvalues = None
    pca_loadings = None
    if body.include_pca:
        try:
            pca = engine.compute_pca(X, char_names)
            pca_eigenvalues = json.dumps(pca.eigenvalues)
            pca_loadings = json.dumps(pca.loadings)
        except Exception:
            logger.warning("pca_computation_failed_in_correlation")

    db_result = CorrelationResult(
        plant_id=body.plant_id,
        characteristic_ids=json.dumps(body.characteristic_ids),
        method=body.method,
        matrix=json.dumps(corr_result.matrix),
        p_values=json.dumps(corr_result.p_values),
        sample_count=corr_result.sample_count,
        pca_eigenvalues=pca_eigenvalues,
        pca_loadings=pca_loadings,
    )
    session.add(db_result)
    await session.commit()
    await session.refresh(db_result)

    logger.info(
        "correlation_computed",
        result_id=db_result.id,
        plant_id=body.plant_id,
        method=body.method,
        n_chars=len(body.characteristic_ids),
        sample_count=corr_result.sample_count,
        user=user.username,
    )

    return CorrelationResultResponse(
        id=db_result.id,
        plant_id=db_result.plant_id,
        characteristic_ids=body.characteristic_ids,
        characteristic_names=char_names,
        method=db_result.method,
        matrix=corr_result.matrix,
        p_values=corr_result.p_values,
        sample_count=corr_result.sample_count,
        computed_at=db_result.computed_at,
    )


@router.get("/correlation/results", response_model=list[CorrelationResultResponse])
async def list_correlation_results(
    plant_id: int = Query(..., description="Plant ID (required)"),
    limit: int = Query(10, ge=1, le=100, description="Maximum results to return"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[CorrelationResultResponse]:
    """List recent correlation analysis results for a plant.

    Requires engineer+ role for the plant.
    """
    check_plant_role(user, plant_id, "engineer")

    stmt = (
        select(CorrelationResult)
        .where(CorrelationResult.plant_id == plant_id)
        .order_by(CorrelationResult.computed_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    rows = list(result.scalars().all())

    responses: list[CorrelationResultResponse] = []
    for row in rows:
        char_ids = json.loads(row.characteristic_ids)
        matrix = json.loads(row.matrix)
        p_values = json.loads(row.p_values)

        # Resolve characteristic names
        char_names: list[str] = []
        for cid in char_ids:
            name_stmt = select(Characteristic.name).where(Characteristic.id == cid)
            name_result = await session.execute(name_stmt)
            name = name_result.scalar_one_or_none()
            char_names.append(name or f"Characteristic {cid}")

        responses.append(
            CorrelationResultResponse(
                id=row.id,
                plant_id=row.plant_id,
                characteristic_ids=char_ids,
                characteristic_names=char_names,
                method=row.method,
                matrix=matrix,
                p_values=p_values,
                sample_count=row.sample_count,
                computed_at=row.computed_at,
            )
        )

    return responses


@router.get("/correlation/results/{result_id}", response_model=CorrelationResultResponse)
async def get_correlation_result(
    result_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> CorrelationResultResponse:
    """Get a specific correlation result by ID.

    Requires engineer+ role for the result's plant.
    """
    stmt = select(CorrelationResult).where(CorrelationResult.id == result_id)
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Correlation result not found",
        )

    check_plant_role(user, row.plant_id, "engineer")

    char_ids = json.loads(row.characteristic_ids)
    matrix = json.loads(row.matrix)
    p_values = json.loads(row.p_values)

    # Resolve characteristic names
    char_names: list[str] = []
    for cid in char_ids:
        name_stmt = select(Characteristic.name).where(Characteristic.id == cid)
        name_result = await session.execute(name_stmt)
        name = name_result.scalar_one_or_none()
        char_names.append(name or f"Characteristic {cid}")

    return CorrelationResultResponse(
        id=row.id,
        plant_id=row.plant_id,
        characteristic_ids=char_ids,
        characteristic_names=char_names,
        method=row.method,
        matrix=matrix,
        p_values=p_values,
        sample_count=row.sample_count,
        computed_at=row.computed_at,
    )


@router.post("/correlation/compute-pca", response_model=PCAResultResponse)
async def compute_pca(
    body: CorrelationComputeRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> PCAResultResponse:
    """Compute Principal Component Analysis for the specified characteristics.

    Loads aligned data, standardises, and performs eigendecomposition of
    the correlation matrix. Returns eigenvalues, loadings, scores, and
    variance ratios. Not persisted separately.

    Requires engineer+ role for the target plant.
    """
    check_plant_role(user, body.plant_id, "engineer")
    await _validate_char_ids_for_plant(session, body.characteristic_ids, body.plant_id)

    try:
        X, timestamps, char_names = await load_aligned_data(
            session, body.characteristic_ids
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to load aligned data for the specified characteristics",
        )

    if X.shape[0] < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient aligned data — need at least 3 aligned observations",
        )

    engine = CorrelationEngine()
    try:
        pca = engine.compute_pca(X, char_names)
    except Exception:
        logger.exception("pca_computation_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PCA computation failed",
        )

    # Build cumulative variance
    cumulative: list[float] = []
    running = 0.0
    for ratio in pca.explained_variance_ratio:
        running += ratio
        cumulative.append(running)

    logger.info(
        "pca_computed",
        plant_id=body.plant_id,
        n_chars=len(body.characteristic_ids),
        n_samples=X.shape[0],
        user=user.username,
    )

    return PCAResultResponse(
        eigenvalues=pca.eigenvalues,
        explained_variance_ratios=pca.explained_variance_ratio,
        cumulative_variance=cumulative,
        loadings=pca.loadings,
        scores=pca.scores,
        characteristic_names=pca.char_names,
    )


# ===========================================================================
# GROUP ENDPOINTS (parameterised paths — MUST come after static paths)
# ===========================================================================


@router.get("/groups", response_model=list[MultivariateGroupResponse])
async def list_groups(
    plant_id: int = Query(..., description="Plant ID (required)"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[MultivariateGroupResponse]:
    """List multivariate groups for a plant.

    Returns all active groups with their member characteristics.
    Requires engineer+ role for the plant.
    """
    check_plant_role(user, plant_id, "engineer")

    stmt = (
        select(MultivariateGroup)
        .options(selectinload(MultivariateGroup.members))
        .where(MultivariateGroup.plant_id == plant_id)
        .order_by(MultivariateGroup.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.execute(stmt)
    groups = list(result.scalars().all())

    responses: list[MultivariateGroupResponse] = []
    for group in groups:
        resp = await _build_group_response(session, group)
        responses.append(resp)

    return responses


@router.post(
    "/groups",
    response_model=MultivariateGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_group(
    body: MultivariateGroupCreate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> MultivariateGroupResponse:
    """Create a new multivariate chart group.

    Validates that all characteristic IDs belong to the specified plant,
    creates the group and its member associations.

    Requires engineer+ role for the target plant.
    """
    check_plant_role(user, body.plant_id, "engineer")

    # Validate all characteristic IDs belong to the plant
    await _validate_char_ids_for_plant(session, body.characteristic_ids, body.plant_id)

    group = MultivariateGroup(
        plant_id=body.plant_id,
        name=body.name,
        description=body.description,
        chart_type=body.chart_type,
        lambda_param=body.lambda_param,
        alpha=body.alpha,
    )
    session.add(group)
    await session.flush()

    # Create member associations
    for i, cid in enumerate(body.characteristic_ids):
        member = MultivariateGroupMember(
            group_id=group.id,
            characteristic_id=cid,
            display_order=i,
        )
        session.add(member)

    await session.commit()

    # Reload with members
    group = await _get_group_or_404(session, group.id)

    logger.info(
        "multivariate_group_created",
        group_id=group.id,
        plant_id=body.plant_id,
        chart_type=body.chart_type,
        n_members=len(body.characteristic_ids),
        user=user.username,
    )

    return await _build_group_response(session, group)


@router.get("/groups/{group_id}", response_model=MultivariateGroupResponse)
async def get_group(
    group_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> MultivariateGroupResponse:
    """Get a multivariate group with member details.

    Requires engineer+ role for the group's plant.
    """
    group = await _get_group_or_404(session, group_id)
    check_plant_role(user, group.plant_id, "engineer")
    return await _build_group_response(session, group)


@router.put("/groups/{group_id}", response_model=MultivariateGroupResponse)
async def update_group(
    group_id: int,
    body: MultivariateGroupUpdate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> MultivariateGroupResponse:
    """Update a multivariate group configuration.

    Requires engineer+ role for the group's plant.
    """
    group = await _get_group_or_404(session, group_id)
    check_plant_role(user, group.plant_id, "engineer")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(group, key):
            setattr(group, key, value)

    group.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(group)

    # Reload with members
    group = await _get_group_or_404(session, group_id)

    logger.info(
        "multivariate_group_updated",
        group_id=group_id,
        fields=list(update_data.keys()),
        user=user.username,
    )

    return await _build_group_response(session, group)


@router.delete(
    "/groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_group(
    group_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Delete a multivariate group and all associated data.

    Cascade-deletes members and computed samples.
    Requires admin role for the group's plant.
    """
    group = await _get_group_or_404(session, group_id)
    check_plant_role(user, group.plant_id, "admin")

    await session.delete(group)
    await session.commit()

    logger.info(
        "multivariate_group_deleted",
        group_id=group_id,
        user=user.username,
    )


@router.post(
    "/groups/{group_id}/compute",
    response_model=MultivariateChartResponse,
)
async def compute_chart_data(
    group_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> MultivariateChartResponse:
    """Compute multivariate chart data for a group.

    Loads aligned data across all member characteristics, runs either the
    Hotelling T-squared or MEWMA engine, persists the computed sample
    points, and returns the chart data.

    Requires engineer+ role for the group's plant.
    """
    group = await _get_group_or_404(session, group_id)
    check_plant_role(user, group.plant_id, "engineer")

    if not group.members:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group has no member characteristics",
        )

    # Get member characteristic IDs in display order
    sorted_members = sorted(group.members, key=lambda m: m.display_order)
    char_ids = [m.characteristic_id for m in sorted_members]

    # Load aligned data
    try:
        X, timestamps, char_names = await load_aligned_data(session, char_ids)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to load aligned data for group characteristics",
        )

    if X.shape[0] < group.min_samples:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient aligned data — need at least {group.min_samples} observations (have {X.shape[0]})",
        )

    # Compute based on chart type
    decomposer = T2Decomposition()
    points: list[T2Point] = []
    ucl_value: float = 0.0
    mean_vector: list[float] | None = None

    if group.chart_type == "t_squared":
        engine = HotellingT2Engine()

        if group.phase == "phase_ii" and group.reference_mean and group.reference_covariance:
            # Phase II — use frozen parameters
            ref_mean = np.array(json.loads(group.reference_mean))
            ref_cov = np.array(json.loads(group.reference_covariance))
            ref_cov_inv = np.linalg.pinv(ref_cov) if np.linalg.cond(ref_cov) > 1e10 else np.linalg.inv(ref_cov)
            n_ref = group.min_samples

            t2_points = engine.compute_chart_data(
                X, ref_mean, ref_cov_inv, n_ref,
                alpha=group.alpha, timestamps=timestamps,
            )
            mean_vector = ref_mean.tolist()
            ucl_value = t2_points[0].ucl if t2_points else 0.0

            for pt in t2_points:
                decomp = None
                if not pt.in_control and pt.raw_values:
                    terms = decomposer.decompose(
                        np.array(pt.raw_values), ref_mean, ref_cov, char_names
                    )
                    decomp = [asdict(t) for t in terms]

                points.append(T2Point(
                    timestamp=pt.timestamp or datetime.now(timezone.utc),
                    t_squared=pt.t_squared,
                    ucl=pt.ucl,
                    in_control=pt.in_control,
                    decomposition=decomp,
                ))
        else:
            # Phase I — estimate parameters from data
            phase_i = engine.compute_phase_i(X, alpha=group.alpha)
            mean_vector = phase_i.mean.tolist()
            ucl_value = phase_i.ucl

            for i, t2_val in enumerate(phase_i.t_squared):
                in_control = t2_val <= phase_i.ucl
                ts = timestamps[i] if i < len(timestamps) else datetime.now(timezone.utc)

                decomp = None
                if not in_control:
                    terms = decomposer.decompose(
                        X[i], phase_i.mean, phase_i.covariance, char_names
                    )
                    decomp = [asdict(t) for t in terms]

                points.append(T2Point(
                    timestamp=ts,
                    t_squared=t2_val,
                    ucl=phase_i.ucl,
                    in_control=in_control,
                    decomposition=decomp,
                ))

    elif group.chart_type == "mewma":
        engine_mewma = MEWMAEngine()

        # Use reference covariance if frozen, otherwise estimate
        if group.reference_covariance:
            cov = np.array(json.loads(group.reference_covariance))
        else:
            cov = np.cov(X.T, ddof=1)
            if cov.ndim == 0:
                cov = cov.reshape(1, 1)

        mewma_points = engine_mewma.compute_chart_data(
            X, cov,
            lambda_param=group.lambda_param,
            timestamps=timestamps,
        )

        if group.reference_mean:
            mean_vector = json.loads(group.reference_mean)
        else:
            mean_vector = np.mean(X, axis=0).tolist()

        ucl_value = mewma_points[0].ucl if mewma_points else 0.0

        for pt in mewma_points:
            points.append(T2Point(
                timestamp=pt.timestamp or datetime.now(timezone.utc),
                t_squared=pt.t_squared,
                ucl=pt.ucl,
                in_control=pt.in_control,
                decomposition=None,
            ))

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown chart type: {group.chart_type}",
        )

    # Persist multivariate_sample rows
    now = datetime.now(timezone.utc)
    for i, pt in enumerate(points):
        raw_vals = X[i].tolist() if i < X.shape[0] else None
        sample = MultivariateSample(
            group_id=group.id,
            t_squared=pt.t_squared,
            ucl=pt.ucl,
            in_control=pt.in_control,
            decomposition=json.dumps(pt.decomposition) if pt.decomposition else None,
            raw_values=json.dumps(raw_vals) if raw_vals else None,
            sample_timestamp=pt.timestamp,
            computed_at=now,
        )
        session.add(sample)

    await session.commit()

    logger.info(
        "multivariate_chart_computed",
        group_id=group_id,
        chart_type=group.chart_type,
        n_points=len(points),
        ooc_count=sum(1 for p in points if not p.in_control),
        user=user.username,
    )

    return MultivariateChartResponse(
        group_id=group.id,
        group_name=group.name,
        chart_type=group.chart_type,
        phase=group.phase,
        points=points,
        ucl=ucl_value,
        mean=mean_vector,
        characteristic_names=char_names,
    )


@router.get(
    "/groups/{group_id}/chart-data",
    response_model=list[T2Point],
)
async def get_chart_data(
    group_id: int,
    limit: int = Query(500, ge=1, le=5000, description="Maximum points to return"),
    start_date: datetime | None = Query(None, description="Start date filter"),
    end_date: datetime | None = Query(None, description="End date filter"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[T2Point]:
    """Get persisted T-squared time series for a group.

    Returns computed multivariate sample points from the database.
    Supports time-range filtering and pagination.

    Requires engineer+ role for the group's plant.
    """
    group = await _get_group_or_404(session, group_id)
    check_plant_role(user, group.plant_id, "engineer")

    stmt = (
        select(MultivariateSample)
        .where(MultivariateSample.group_id == group_id)
    )

    if start_date is not None:
        stmt = stmt.where(MultivariateSample.sample_timestamp >= start_date)
    if end_date is not None:
        stmt = stmt.where(MultivariateSample.sample_timestamp <= end_date)

    stmt = stmt.order_by(MultivariateSample.sample_timestamp.desc()).limit(limit)

    result = await session.execute(stmt)
    samples = list(result.scalars().all())

    # Reverse to chronological order
    samples.reverse()

    points: list[T2Point] = []
    for s in samples:
        decomp = None
        if s.decomposition:
            try:
                decomp = json.loads(s.decomposition)
            except (json.JSONDecodeError, TypeError):
                pass

        points.append(T2Point(
            timestamp=s.sample_timestamp,
            t_squared=s.t_squared,
            ucl=s.ucl,
            in_control=s.in_control,
            decomposition=decomp,
        ))

    return points


@router.post(
    "/groups/{group_id}/freeze",
    response_model=MultivariateGroupResponse,
)
async def freeze_phase_i(
    group_id: int,
    body: FreezeRequest = FreezeRequest(),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> MultivariateGroupResponse:
    """Freeze Phase I parameters for a multivariate group.

    Estimates the mean vector and covariance matrix from aligned data
    and stores them as the reference parameters. Transitions the group
    to Phase II monitoring.

    Requires engineer+ role for the group's plant.
    """
    group = await _get_group_or_404(session, group_id)
    check_plant_role(user, group.plant_id, "engineer")

    if group.phase == "phase_ii" and group.reference_mean:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Group is already frozen in Phase II — reset to Phase I first",
        )

    # Get member characteristic IDs in display order
    sorted_members = sorted(group.members, key=lambda m: m.display_order)
    char_ids = [m.characteristic_id for m in sorted_members]

    # Load aligned data
    try:
        X, timestamps, char_names = await load_aligned_data(session, char_ids)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to load aligned data for group characteristics",
        )

    if X.shape[0] < group.min_samples:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient data to freeze — need at least {group.min_samples} observations (have {X.shape[0]})",
        )

    # Compute Phase I parameters
    mean = np.mean(X, axis=0)
    cov = np.cov(X.T, ddof=1)
    if cov.ndim == 0:
        cov = cov.reshape(1, 1)

    # Store frozen parameters
    group.reference_mean = json.dumps(mean.tolist())
    group.reference_covariance = json.dumps(cov.tolist())
    group.phase = "phase_ii"
    group.updated_at = datetime.now(timezone.utc)

    await session.commit()

    # Reload with members
    group = await _get_group_or_404(session, group_id)

    logger.info(
        "multivariate_phase_frozen",
        group_id=group_id,
        n_observations=X.shape[0],
        n_variables=X.shape[1],
        user=user.username,
    )

    return await _build_group_response(session, group)
