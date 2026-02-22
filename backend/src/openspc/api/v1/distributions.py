"""Non-normal distribution analysis and capability API endpoints."""

import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import (
    get_current_user,
    get_db_session,
    resolve_plant_id_for_characteristic,
    check_plant_role,
)
from openspc.api.schemas.distributions import (
    DistributionConfigUpdate,
    DistributionFitResponse,
    DistributionFitResultSchema,
    NonNormalCapabilityRequest,
    NonNormalCapabilityResponse,
)
from openspc.core.distributions import (
    DistributionFitter,
    calculate_capability_nonnormal,
)
from openspc.db.models.characteristic import Characteristic
from openspc.db.models.user import User
from openspc.db.repositories.sample import SampleRepository

router = APIRouter(prefix="/api/v1/characteristics", tags=["distributions"])


async def _get_char_and_values(
    char_id: int,
    session: AsyncSession,
    window_size: int = 1000,
) -> tuple[Characteristic, list[float], float | None]:
    """Load characteristic and extract measurement values."""
    stmt = select(Characteristic).where(Characteristic.id == char_id)
    result = await session.execute(stmt)
    characteristic = result.scalar_one_or_none()
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    if characteristic.data_type == "attribute":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Non-normal analysis is not supported for attribute charts",
        )

    sample_repo = SampleRepository(session)
    sample_data = await sample_repo.get_rolling_window_data(
        char_id=char_id,
        window_size=window_size,
        exclude_excluded=True,
    )

    all_values: list[float] = []
    for sd in sample_data:
        all_values.extend(sd["values"])

    if len(all_values) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient measurement data: {len(all_values)} values (minimum 2 required)",
        )

    return characteristic, all_values, characteristic.stored_sigma


@router.post(
    "/{char_id}/capability/nonnormal",
    response_model=NonNormalCapabilityResponse,
)
async def calculate_nonnormal_capability(
    char_id: int,
    body: NonNormalCapabilityRequest,
    window_size: int = Query(1000, ge=10, le=10000),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> NonNormalCapabilityResponse:
    """Calculate non-normal process capability.

    Supports auto-cascade, Box-Cox, percentile, and distribution fitting methods.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "operator")

    characteristic, values, sigma_within = await _get_char_and_values(
        char_id, session, window_size
    )

    if characteristic.usl is None and characteristic.lsl is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one specification limit (USL or LSL) must be set",
        )

    result = calculate_capability_nonnormal(
        values=values,
        usl=characteristic.usl,
        lsl=characteristic.lsl,
        target=characteristic.target_value,
        sigma_within=sigma_within,
        method=body.method,
    )

    fitted = None
    if result.fitted_distribution is not None:
        fitted = DistributionFitResultSchema(
            family=result.fitted_distribution.family,
            parameters=result.fitted_distribution.parameters,
            ad_statistic=result.fitted_distribution.ad_statistic,
            ad_p_value=result.fitted_distribution.ad_p_value,
            aic=result.fitted_distribution.aic,
            is_adequate_fit=result.fitted_distribution.is_adequate_fit,
        )

    return NonNormalCapabilityResponse(
        cp=result.cp,
        cpk=result.cpk,
        pp=result.pp,
        ppk=result.ppk,
        cpm=result.cpm,
        method=result.method,
        method_detail=result.method_detail,
        normality_p_value=result.normality_p_value,
        normality_test=result.normality_test,
        is_normal=result.is_normal,
        fitted_distribution=fitted,
        percentile_pp=result.percentile_pp,
        percentile_ppk=result.percentile_ppk,
        p0_135=result.p0_135,
        p50=result.p50,
        p99_865=result.p99_865,
        sample_count=result.sample_count,
        calculated_at=result.calculated_at.isoformat(),
    )


@router.post(
    "/{char_id}/capability/fit-distribution",
    response_model=DistributionFitResponse,
)
async def fit_distribution(
    char_id: int,
    window_size: int = Query(1000, ge=10, le=10000),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> DistributionFitResponse:
    """Fit data to multiple distribution families and rank by AIC."""
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "operator")

    _, values, _ = await _get_char_and_values(char_id, session, window_size)

    import numpy as np

    arr = np.asarray(values, dtype=np.float64)
    fits = DistributionFitter.fit_all(arr)

    fit_schemas = [
        DistributionFitResultSchema(
            family=f.family,
            parameters=f.parameters,
            ad_statistic=f.ad_statistic,
            ad_p_value=f.ad_p_value,
            aic=f.aic,
            is_adequate_fit=f.is_adequate_fit,
        )
        for f in fits
    ]

    best = fit_schemas[0] if fit_schemas else None

    if not fit_schemas:
        recommendation = "Insufficient data for distribution fitting (need at least 8 values)."
    elif best and best.is_adequate_fit:
        recommendation = (
            f"Best fit: {best.family} (AIC={best.aic:.1f}). "
            f"This distribution provides an adequate fit to your data."
        )
    else:
        recommendation = (
            "No distribution provides an adequate fit at the 5% significance level. "
            "Consider using the percentile method instead."
        )

    return DistributionFitResponse(
        fits=fit_schemas,
        best_fit=best,
        recommendation=recommendation,
    )


@router.put("/{char_id}/distribution-config")
async def update_distribution_config(
    char_id: int,
    body: DistributionConfigUpdate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> dict:
    """Update distribution configuration on a characteristic."""
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    stmt = select(Characteristic).where(Characteristic.id == char_id)
    result = await session.execute(stmt)
    characteristic = result.scalar_one_or_none()
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    if body.distribution_method is not None:
        valid_methods = {"auto", "normal", "box_cox", "percentile", "distribution_fit"}
        if body.distribution_method not in valid_methods:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid method. Must be one of: {', '.join(sorted(valid_methods))}",
            )
        characteristic.distribution_method = body.distribution_method

    if body.box_cox_lambda is not None:
        characteristic.box_cox_lambda = body.box_cox_lambda

    if body.distribution_params is not None:
        characteristic.distribution_params = json.dumps(body.distribution_params)

    await session.commit()

    return {"status": "ok"}
