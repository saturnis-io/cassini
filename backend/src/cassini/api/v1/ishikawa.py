"""Ishikawa / Fishbone variance decomposition API.

POST /api/v1/characteristics/{id}/diagnose — returns 6M variance breakdown.
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
    resolve_plant_id_for_characteristic,
)
from cassini.api.schemas.ishikawa import (
    IshikawaCategorySchema,
    IshikawaDiagnoseRequest,
    IshikawaFactorSchema,
    IshikawaResultSchema,
    ParetoItemSchema,
)
from cassini.core.ishikawa import analyze_variation_sources
from cassini.db.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/characteristics", tags=["ishikawa"])


@router.post(
    "/{characteristic_id}/diagnose",
    response_model=IshikawaResultSchema,
)
async def diagnose_characteristic(
    characteristic_id: int,
    body: IshikawaDiagnoseRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    """Run variance decomposition (Ishikawa / 6M) for a characteristic.

    Requires engineer or higher role for the plant that owns
    the characteristic.
    """
    # Plant-scoped RBAC check
    plant_id = await resolve_plant_id_for_characteristic(characteristic_id, db)
    check_plant_role(current_user, plant_id, "engineer")

    # Parse optional dates
    start_date: datetime | None = None
    end_date: datetime | None = None
    try:
        if body.start_date:
            start_date = datetime.fromisoformat(body.start_date)
        if body.end_date:
            end_date = datetime.fromisoformat(body.end_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format — use ISO 8601",
        )

    try:
        result = await analyze_variation_sources(
            session=db,
            characteristic_id=characteristic_id,
            start_date=start_date,
            end_date=end_date,
            limit=body.limit,
        )
    except Exception:
        logger.exception("Ishikawa analysis failed for characteristic %s", characteristic_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Variance decomposition analysis failed",
        )

    return IshikawaResultSchema(
        effect=result.effect,
        total_variance=result.total_variance,
        sample_count=result.sample_count,
        categories=[
            IshikawaCategorySchema(
                name=c.category,
                eta_squared=c.eta_squared,
                p_value=c.p_value,
                significant=c.significant,
                sufficient_data=c.sufficient_data,
                factors=[
                    IshikawaFactorSchema(name=f.name, sample_count=f.sample_count)
                    for f in c.factors
                ],
                detail=c.detail,
            )
            for c in result.categories
        ],
        pareto=[
            ParetoItemSchema(
                category=p.category,
                eta_squared=p.eta_squared,
                percentage=p.percentage,
                cumulative=p.cumulative,
            )
            for p in result.pareto
        ],
        analysis_window=result.analysis_window,
        warnings=result.warnings,
    )
