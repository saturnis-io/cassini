"""Correlation Analysis REST endpoints (Pro tier).

Provides dedicated correlation matrix, PCA, partial correlation,
and variable importance ranking endpoints. Separate from the
multivariate SPC router for clean Pro-tier gating.
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
    resolve_plant_id_for_characteristic,
)
from cassini.api.schemas.correlation import (
    CorrelationMatrixRequest,
    CorrelationMatrixResponse,
    PartialCorrelationRequest,
    PartialCorrelationResponse,
    PCARequest,
    PCAResponse,
    VariableImportanceItem,
    VariableImportanceResponse,
)
from cassini.core.correlation import (
    compute_correlation_matrix,
    compute_partial_correlation,
    compute_pca,
    rank_variable_importance,
)
from cassini.core.multivariate.data_loader import load_aligned_data
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/correlation", tags=["correlation"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


async def _load_and_convert(
    session: AsyncSession,
    char_ids: list[int],
) -> tuple[dict[str, list[float]], list[str], int]:
    """Load aligned data and convert to dict format for the engine.

    Returns:
        (data_dict, char_names, sample_count)
    """
    try:
        X, _timestamps, char_names = await load_aligned_data(session, char_ids)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to load aligned data for the specified characteristics",
        )

    if X.shape[0] < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient aligned data — need at least 3 observations (have {X.shape[0]})",
        )

    data: dict[str, list[float]] = {}
    for i, name in enumerate(char_names):
        data[name] = X[:, i].tolist()

    return data, char_names, X.shape[0]


async def _get_char_name(session: AsyncSession, char_id: int) -> str:
    """Resolve a characteristic name by ID, raising 400 if not found."""
    stmt = select(Characteristic.name).where(Characteristic.id == char_id)
    result = await session.execute(stmt)
    name = result.scalar_one_or_none()
    if name is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Characteristic {char_id} not found",
        )
    return name


async def _get_sibling_char_ids(
    session: AsyncSession, char_id: int, plant_id: int
) -> list[int]:
    """Get all characteristic IDs in the same plant (excluding the target)."""
    stmt = (
        select(Characteristic.id)
        .join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id)
        .where(Hierarchy.plant_id == plant_id, Characteristic.id != char_id)
        .limit(50)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


# ===========================================================================
# ENDPOINTS
# ===========================================================================


@router.post("/matrix", response_model=CorrelationMatrixResponse)
async def correlation_matrix(
    body: CorrelationMatrixRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> CorrelationMatrixResponse:
    """Compute a pairwise correlation matrix for the specified characteristics.

    Requires engineer+ role for the target plant.
    """
    check_plant_role(user, body.plant_id, "engineer")
    await _validate_char_ids_for_plant(session, body.characteristic_ids, body.plant_id)

    data, char_names, _count = await _load_and_convert(session, body.characteristic_ids)

    try:
        result = compute_correlation_matrix(data, method=body.method)
    except Exception:
        logger.exception("correlation_matrix_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Correlation matrix computation failed",
        )

    logger.info(
        "correlation_matrix_computed",
        plant_id=body.plant_id,
        method=body.method,
        n_chars=len(body.characteristic_ids),
        sample_count=result.sample_count,
        user=user.username,
    )

    return CorrelationMatrixResponse(
        characteristic_ids=body.characteristic_ids,
        characteristic_names=char_names,
        method=result.method,
        matrix=result.matrix,
        p_values=result.p_values,
        sample_count=result.sample_count,
    )


@router.post("/pca", response_model=PCAResponse)
async def pca_analysis(
    body: PCARequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> PCAResponse:
    """Compute PCA for the specified characteristics.

    Requires engineer+ role for the target plant.
    """
    check_plant_role(user, body.plant_id, "engineer")
    await _validate_char_ids_for_plant(session, body.characteristic_ids, body.plant_id)

    data, char_names, _count = await _load_and_convert(session, body.characteristic_ids)

    try:
        result = compute_pca(data)
    except Exception:
        logger.exception("pca_computation_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PCA computation failed",
        )

    logger.info(
        "pca_computed",
        plant_id=body.plant_id,
        n_chars=len(body.characteristic_ids),
        n_samples=len(next(iter(data.values()))),
        user=user.username,
    )

    return PCAResponse(
        characteristic_names=char_names,
        eigenvalues=result.eigenvalues,
        explained_variance_ratios=result.explained_variance_ratios,
        cumulative_variance=result.cumulative_variance,
        loadings=result.loadings,
        scores=result.scores,
    )


@router.post("/partial", response_model=PartialCorrelationResponse)
async def partial_correlation(
    body: PartialCorrelationRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> PartialCorrelationResponse:
    """Compute partial correlation between two characteristics controlling for others.

    Requires engineer+ role for the target plant.
    """
    check_plant_role(user, body.plant_id, "engineer")

    if body.primary_id == body.secondary_id:
        raise HTTPException(400, "Primary and secondary must be different characteristics")
    if body.primary_id in body.control_ids or body.secondary_id in body.control_ids:
        raise HTTPException(400, "Control variables must not include primary or secondary")

    all_ids = [body.primary_id, body.secondary_id] + body.control_ids
    await _validate_char_ids_for_plant(session, all_ids, body.plant_id)

    data, char_names, _count = await _load_and_convert(session, all_ids)

    # Map indices back to names
    primary_name = char_names[0]
    secondary_name = char_names[1]
    control_names = char_names[2:]

    try:
        result = compute_partial_correlation(
            data, primary_name, secondary_name, control_names
        )
    except Exception:
        logger.exception("partial_correlation_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Partial correlation computation failed",
        )

    logger.info(
        "partial_correlation_computed",
        plant_id=body.plant_id,
        primary=primary_name,
        secondary=secondary_name,
        n_controls=len(control_names),
        r=result.r,
        user=user.username,
    )

    return PartialCorrelationResponse(
        primary_name=primary_name,
        secondary_name=secondary_name,
        controlling_for=control_names,
        r=result.r,
        p_value=result.p_value,
        df=result.df,
    )


@router.get(
    "/variable-importance/{char_id}",
    response_model=VariableImportanceResponse,
)
async def variable_importance(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> VariableImportanceResponse:
    """Rank sibling characteristics by correlation strength to the target.

    Finds all characteristics in the same plant as the target,
    loads aligned data, and ranks by absolute Pearson correlation.

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    target_name = await _get_char_name(session, char_id)
    sibling_ids = await _get_sibling_char_ids(session, char_id, plant_id)

    if not sibling_ids:
        return VariableImportanceResponse(
            target_characteristic_id=char_id,
            target_characteristic_name=target_name,
            sample_count=0,
            rankings=[],
        )

    # Load aligned data across target + siblings
    all_ids = [char_id] + sibling_ids
    try:
        data, char_names, sample_count = await _load_and_convert(session, all_ids)
    except HTTPException:
        # If alignment yields < 3 samples, return empty rankings
        return VariableImportanceResponse(
            target_characteristic_id=char_id,
            target_characteristic_name=target_name,
            sample_count=0,
            rankings=[],
        )

    try:
        rankings = rank_variable_importance(data, target_name)
    except Exception:
        logger.exception("variable_importance_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Variable importance computation failed",
        )

    # Map names back to characteristic IDs
    name_to_id: dict[str, int] = dict(zip(char_names, all_ids))
    items: list[VariableImportanceItem] = []
    for rank in rankings:
        items.append(
            VariableImportanceItem(
                characteristic_id=name_to_id.get(rank.variable_name, 0),
                characteristic_name=rank.variable_name,
                pearson_r=rank.pearson_r,
                abs_pearson_r=rank.abs_pearson_r,
                p_value=rank.p_value,
            )
        )

    logger.info(
        "variable_importance_computed",
        char_id=char_id,
        plant_id=plant_id,
        n_siblings=len(sibling_ids),
        n_ranked=len(items),
        user=user.username,
    )

    return VariableImportanceResponse(
        target_characteristic_id=char_id,
        target_characteristic_name=target_name,
        sample_count=sample_count,
        rankings=items,
    )
