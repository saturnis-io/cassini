"""Predictive Analytics REST endpoints.

Provides configuration, model training, forecasting, and dashboard
endpoints for per-characteristic SPC prediction.
"""

import json
from datetime import datetime, timezone

import numpy as np
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
    resolve_plant_id_for_characteristic,
)
from cassini.api.schemas.prediction import (
    ForecastPointResponse,
    ForecastResponse,
    PredictionConfigResponse,
    PredictionConfigUpdate,
    PredictionDashboardItem,
    PredictionModelResponse,
)
from cassini.core.forecasting import ForecastingUnavailable
from cassini.core.forecasting.alerts import check_predicted_ooc
from cassini.core.forecasting.model_selector import select_best_model
from cassini.core.forecasting.arima import ARIMAForecaster, ForecastResult
from cassini.core.forecasting.exponential_smoothing import ExponentialSmoothingForecaster
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.prediction import Forecast, PredictionConfig, PredictionModel
from cassini.db.models.sample import Measurement, Sample
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/predictions", tags=["predictions"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_config_or_defaults(
    session: AsyncSession, char_id: int
) -> PredictionConfigResponse:
    """Get prediction config for a characteristic, returning defaults if none exists."""
    stmt = select(PredictionConfig).where(
        PredictionConfig.characteristic_id == char_id
    )
    result = await session.execute(stmt)
    config = result.scalar_one_or_none()

    if config is None:
        return PredictionConfigResponse(
            id=None,
            characteristic_id=char_id,
            is_enabled=False,
            model_type="auto",
            forecast_horizon=20,
            refit_interval=50,
            confidence_levels=[0.8, 0.95],
            created_at=None,
            updated_at=None,
        )

    # Parse confidence_levels from JSON string
    try:
        confidence = json.loads(config.confidence_levels) if config.confidence_levels else [0.8, 0.95]
    except (json.JSONDecodeError, TypeError):
        confidence = [0.8, 0.95]

    return PredictionConfigResponse(
        id=config.id,
        characteristic_id=config.characteristic_id,
        is_enabled=config.is_enabled,
        model_type=config.model_type,
        forecast_horizon=config.forecast_horizon,
        refit_interval=config.refit_interval,
        confidence_levels=confidence,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


async def _load_sample_means(
    session: AsyncSession, char_id: int, limit: int = 500
) -> np.ndarray:
    """Load historical subgroup means for a characteristic.

    Loads samples with measurements and computes per-sample means.
    Results are returned in chronological order (oldest first).
    """
    stmt = (
        select(Sample)
        .where(Sample.char_id == char_id, Sample.is_excluded.is_(False))
        .options(selectinload(Sample.measurements))
        .order_by(Sample.timestamp.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    samples = list(result.scalars().all())

    # Compute mean for each sample, reverse to chronological order
    values: list[float] = []
    for s in reversed(samples):
        measurements = [m.value for m in s.measurements]
        if measurements:
            values.append(float(np.mean(measurements)))

    return np.array(values, dtype=np.float64)


def _fit_model(
    values: np.ndarray,
    model_type: str,
    horizon: int,
    confidence: list[float],
) -> ForecastResult:
    """Fit the requested model type (pure computation, no I/O).

    Raises:
        ForecastingUnavailable: If statsmodels is not installed.
        ValueError: If insufficient data.
    """
    if model_type == "auto":
        return select_best_model(values, steps=horizon, confidence=confidence)
    elif model_type == "arima":
        return ARIMAForecaster().fit_and_forecast(
            values, steps=horizon, confidence=confidence
        )
    elif model_type == "exponential_smoothing":
        return ExponentialSmoothingForecaster().fit_and_forecast(
            values, steps=horizon, confidence=confidence
        )
    else:
        # Unknown type -- fall back to auto-selection
        return select_best_model(values, steps=horizon, confidence=confidence)


# ===========================================================================
# DASHBOARD ROUTE (static path — MUST come before /{char_id} routes)
# ===========================================================================


@router.get("/dashboard", response_model=list[PredictionDashboardItem])
async def get_dashboard(
    plant_id: int = Query(..., description="Plant ID (required)"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[PredictionDashboardItem]:
    """Get prediction status for all characteristics in a plant.

    Returns a summary of prediction configs, models, and forecast status
    for every characteristic that has a prediction configuration.

    Requires engineer+ role for the plant.
    """
    check_plant_role(user, plant_id, "engineer")

    # Get all characteristics for this plant
    char_stmt = (
        select(Characteristic.id, Characteristic.name)
        .join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id)
        .where(Hierarchy.plant_id == plant_id)
    )
    char_result = await session.execute(char_stmt)
    char_rows = char_result.all()

    if not char_rows:
        return []

    items: list[PredictionDashboardItem] = []

    for char_id, char_name in char_rows:
        # Get prediction config
        config_stmt = select(PredictionConfig).where(
            PredictionConfig.characteristic_id == char_id
        )
        config_result = await session.execute(config_stmt)
        config = config_result.scalar_one_or_none()

        if config is None:
            # Only include characteristics that have a prediction config
            continue

        # Get current model
        model_stmt = select(PredictionModel).where(
            PredictionModel.characteristic_id == char_id,
            PredictionModel.is_current == True,  # noqa: E712
        )
        model_result = await session.execute(model_stmt)
        current_model = model_result.scalar_one_or_none()

        # Check for forecast
        forecast_stmt = (
            select(Forecast.id, Forecast.predicted_ooc)
            .where(Forecast.characteristic_id == char_id)
            .order_by(Forecast.generated_at.desc())
            .limit(1)
        )
        forecast_result = await session.execute(forecast_stmt)
        forecast_row = forecast_result.first()

        has_forecast = forecast_row is not None
        predicted_ooc = False
        if forecast_row is not None:
            # Check if any forecast point is OOC
            ooc_stmt = (
                select(Forecast.id)
                .where(
                    Forecast.characteristic_id == char_id,
                    Forecast.predicted_ooc == True,  # noqa: E712
                )
                .limit(1)
            )
            ooc_result = await session.execute(ooc_stmt)
            predicted_ooc = ooc_result.scalar_one_or_none() is not None

        items.append(
            PredictionDashboardItem(
                characteristic_id=char_id,
                characteristic_name=char_name or f"Characteristic {char_id}",
                model_type=current_model.model_type if current_model else None,
                is_enabled=config.is_enabled,
                last_trained=current_model.fitted_at if current_model else None,
                training_samples=current_model.training_samples if current_model else None,
                aic=current_model.aic if current_model else None,
                has_forecast=has_forecast,
                predicted_ooc=predicted_ooc,
            )
        )

    return items


# ===========================================================================
# PER-CHARACTERISTIC ENDPOINTS (parameterised — MUST come after static)
# ===========================================================================


@router.get("/{char_id}/config", response_model=PredictionConfigResponse)
async def get_config(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> PredictionConfigResponse:
    """Get prediction configuration for a characteristic.

    Returns default values if no configuration exists yet.
    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    return await _get_config_or_defaults(session, char_id)


@router.put("/{char_id}/config", response_model=PredictionConfigResponse)
async def update_config(
    char_id: int,
    body: PredictionConfigUpdate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> PredictionConfigResponse:
    """Create or update prediction configuration for a characteristic.

    Performs an upsert — creates a new config if none exists, otherwise
    updates the existing one.

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    update_data = body.model_dump(exclude_unset=True)

    # Handle confidence_levels serialization
    if "confidence_levels" in update_data and update_data["confidence_levels"] is not None:
        update_data["confidence_levels"] = json.dumps(update_data["confidence_levels"])

    # Check if config exists
    stmt = select(PredictionConfig).where(
        PredictionConfig.characteristic_id == char_id
    )
    result = await session.execute(stmt)
    config = result.scalar_one_or_none()

    if config is None:
        # Create new config
        config = PredictionConfig(characteristic_id=char_id, **update_data)
        session.add(config)
    else:
        # Update existing config
        for key, value in update_data.items():
            if hasattr(config, key):
                setattr(config, key, value)
        config.updated_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(config)

    logger.info(
        "prediction_config_updated",
        char_id=char_id,
        fields=list(update_data.keys()),
        user=user.username,
    )

    return await _get_config_or_defaults(session, char_id)


@router.post("/{char_id}/train", response_model=PredictionModelResponse)
async def train_model(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> PredictionModelResponse:
    """Force a model retrain for a characteristic.

    Loads historical sample means, fits the configured model type (or
    auto-selects by AIC), persists the model snapshot, and generates
    a forecast batch.

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    # Load config
    config_stmt = select(PredictionConfig).where(
        PredictionConfig.characteristic_id == char_id
    )
    config_result = await session.execute(config_stmt)
    config = config_result.scalar_one_or_none()

    if config is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No prediction configuration — configure predictions before training",
        )

    model_type = config.model_type
    horizon = config.forecast_horizon
    try:
        confidence = json.loads(config.confidence_levels) if config.confidence_levels else [0.80, 0.95]
    except (json.JSONDecodeError, TypeError):
        confidence = [0.80, 0.95]

    # Load historical data — use a generous limit for training (not just refit_interval)
    values = await _load_sample_means(session, char_id, limit=500)

    if len(values) < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient data for model training — need at least 50 samples (have {len(values)})",
        )

    # Fit model
    try:
        forecast_result = _fit_model(values, model_type, horizon, confidence)
    except ForecastingUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Prediction features require statsmodels package",
        )
    except Exception:
        logger.exception("prediction_training_failed", char_id=char_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Model training failed",
        )

    # Mark previous model(s) as not current
    await session.execute(
        update(PredictionModel)
        .where(
            PredictionModel.characteristic_id == char_id,
            PredictionModel.is_current == True,  # noqa: E712
        )
        .values(is_current=False)
    )

    # Save new model
    new_model = PredictionModel(
        characteristic_id=char_id,
        model_type=forecast_result.model_type,
        model_params=json.dumps(forecast_result.model_params),
        aic=forecast_result.aic,
        training_samples=len(values),
        is_current=True,
    )
    session.add(new_model)
    await session.flush()

    # Load characteristic UCL/LCL for OOC checking
    char_stmt = select(
        Characteristic.ucl, Characteristic.lcl
    ).where(Characteristic.id == char_id)
    char_result = await session.execute(char_stmt)
    char_row = char_result.one_or_none()
    ucl = char_row[0] if char_row else None
    lcl = char_row[1] if char_row else None

    predicted_ooc_step = check_predicted_ooc(forecast_result.values, ucl, lcl)

    # Persist forecast rows
    now = datetime.now(timezone.utc)
    for i, val in enumerate(forecast_result.values):
        forecast = Forecast(
            model_id=new_model.id,
            characteristic_id=char_id,
            step=i + 1,
            predicted_value=val,
            lower_80=forecast_result.lower_80[i] if forecast_result.lower_80 else None,
            upper_80=forecast_result.upper_80[i] if forecast_result.upper_80 else None,
            lower_95=forecast_result.lower_95[i] if forecast_result.lower_95 else None,
            upper_95=forecast_result.upper_95[i] if forecast_result.upper_95 else None,
            predicted_ooc=(
                predicted_ooc_step is not None and i + 1 >= predicted_ooc_step
            ),
            generated_at=now,
        )
        session.add(forecast)

    await session.commit()
    await session.refresh(new_model)

    logger.info(
        "prediction_model_trained",
        char_id=char_id,
        model_type=new_model.model_type,
        aic=new_model.aic,
        training_samples=new_model.training_samples,
        user=user.username,
    )

    # Parse model_params for response
    model_params = None
    if new_model.model_params:
        try:
            model_params = json.loads(new_model.model_params)
        except (json.JSONDecodeError, TypeError):
            pass

    return PredictionModelResponse(
        id=new_model.id,
        characteristic_id=new_model.characteristic_id,
        model_type=new_model.model_type,
        model_params=model_params,
        aic=new_model.aic,
        training_samples=new_model.training_samples,
        fitted_at=new_model.fitted_at,
        is_current=new_model.is_current,
    )


@router.get("/{char_id}/model", response_model=PredictionModelResponse)
async def get_current_model(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> PredictionModelResponse:
    """Get the current fitted prediction model for a characteristic.

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    stmt = select(PredictionModel).where(
        PredictionModel.characteristic_id == char_id,
        PredictionModel.is_current == True,  # noqa: E712
    )
    result = await session.execute(stmt)
    model = result.scalar_one_or_none()

    if model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No current prediction model — train a model first",
        )

    # Parse model_params for response
    model_params = None
    if model.model_params:
        try:
            model_params = json.loads(model.model_params)
        except (json.JSONDecodeError, TypeError):
            pass

    return PredictionModelResponse(
        id=model.id,
        characteristic_id=model.characteristic_id,
        model_type=model.model_type,
        model_params=model_params,
        aic=model.aic,
        training_samples=model.training_samples,
        fitted_at=model.fitted_at,
        is_current=model.is_current,
    )


@router.get("/{char_id}/forecast", response_model=ForecastResponse)
async def get_latest_forecast(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> ForecastResponse:
    """Get the most recent forecast for a characteristic.

    Returns the latest batch of forecast points (identified by the
    most recent generated_at timestamp).

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    # Use the row with highest ID (autoincrement = newest) to find the
    # latest batch's generated_at, then load all batch members.  Avoids
    # MAX(generated_at) which fails on SQLite text comparison when datetime
    # formats are mixed (T-separator vs space-separator).
    latest_gen_subq = (
        select(Forecast.generated_at)
        .where(Forecast.characteristic_id == char_id)
        .order_by(Forecast.id.desc())
        .limit(1)
        .correlate(None)
        .scalar_subquery()
    )

    stmt = (
        select(Forecast)
        .where(
            Forecast.characteristic_id == char_id,
            Forecast.generated_at == latest_gen_subq,
        )
        .order_by(Forecast.step.asc())
    )
    result = await session.execute(stmt)
    forecasts = list(result.scalars().all())

    if not forecasts:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No forecast available — train a model and generate a forecast first",
        )

    latest_at = forecasts[0].generated_at

    # Get model type from the associated model
    model_type = "unknown"
    model_stmt = select(PredictionModel.model_type).where(
        PredictionModel.id == forecasts[0].model_id
    )
    model_result = await session.execute(model_stmt)
    mt = model_result.scalar_one_or_none()
    if mt:
        model_type = mt

    # Find first predicted OOC step
    predicted_ooc_step = None
    for f in forecasts:
        if f.predicted_ooc:
            predicted_ooc_step = f.step
            break

    points = [
        ForecastPointResponse(
            step=f.step,
            predicted_value=f.predicted_value,
            lower_80=f.lower_80,
            upper_80=f.upper_80,
            lower_95=f.lower_95,
            upper_95=f.upper_95,
            predicted_ooc=f.predicted_ooc,
        )
        for f in forecasts
    ]

    return ForecastResponse(
        characteristic_id=char_id,
        model_type=model_type,
        generated_at=latest_at,
        points=points,
        predicted_ooc_step=predicted_ooc_step,
    )


@router.post("/{char_id}/forecast", response_model=ForecastResponse)
async def generate_forecast(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> ForecastResponse:
    """Generate a new forecast for a characteristic.

    Requires a current fitted model. Loads recent data, runs the
    forecaster, persists forecast rows, and returns the result.

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    # Load config
    config_stmt = select(PredictionConfig).where(
        PredictionConfig.characteristic_id == char_id
    )
    config_result = await session.execute(config_stmt)
    config = config_result.scalar_one_or_none()

    if config is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No prediction configuration — configure predictions first",
        )

    # Check for current model
    model_stmt = select(PredictionModel).where(
        PredictionModel.characteristic_id == char_id,
        PredictionModel.is_current == True,  # noqa: E712
    )
    model_result = await session.execute(model_stmt)
    current_model = model_result.scalar_one_or_none()

    if current_model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No current model — train a model before generating forecasts",
        )

    horizon = config.forecast_horizon
    model_type = current_model.model_type
    try:
        confidence = json.loads(config.confidence_levels) if config.confidence_levels else [0.80, 0.95]
    except (json.JSONDecodeError, TypeError):
        confidence = [0.80, 0.95]

    # Load recent values — use sufficient data for good forecasting
    values = await _load_sample_means(session, char_id, limit=500)

    if len(values) < 30:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient data for forecasting — need at least 30 samples (have {len(values)})",
        )

    # Run forecast
    try:
        forecast_result = _fit_model(values, model_type, horizon, confidence)
    except ForecastingUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Prediction features require statsmodels package",
        )
    except Exception:
        logger.exception("prediction_forecast_failed", char_id=char_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Forecast generation failed",
        )

    # Load characteristic UCL/LCL for OOC checking
    char_stmt = select(
        Characteristic.ucl, Characteristic.lcl
    ).where(Characteristic.id == char_id)
    char_result = await session.execute(char_stmt)
    char_row = char_result.one_or_none()
    ucl = char_row[0] if char_row else None
    lcl = char_row[1] if char_row else None

    predicted_ooc_step = check_predicted_ooc(forecast_result.values, ucl, lcl)

    # Persist forecast rows
    now = datetime.now(timezone.utc)
    for i, val in enumerate(forecast_result.values):
        forecast = Forecast(
            model_id=current_model.id,
            characteristic_id=char_id,
            step=i + 1,
            predicted_value=val,
            lower_80=forecast_result.lower_80[i] if forecast_result.lower_80 else None,
            upper_80=forecast_result.upper_80[i] if forecast_result.upper_80 else None,
            lower_95=forecast_result.lower_95[i] if forecast_result.lower_95 else None,
            upper_95=forecast_result.upper_95[i] if forecast_result.upper_95 else None,
            predicted_ooc=(
                predicted_ooc_step is not None and i + 1 >= predicted_ooc_step
            ),
            generated_at=now,
        )
        session.add(forecast)

    await session.commit()

    logger.info(
        "prediction_forecast_generated",
        char_id=char_id,
        model_type=model_type,
        n_steps=horizon,
        predicted_ooc_step=predicted_ooc_step,
        user=user.username,
    )

    # Build response
    # Re-query to get persisted data
    stmt = (
        select(Forecast)
        .where(
            Forecast.characteristic_id == char_id,
            Forecast.generated_at == now,
        )
        .order_by(Forecast.step.asc())
    )
    result = await session.execute(stmt)
    persisted = list(result.scalars().all())

    points = [
        ForecastPointResponse(
            step=f.step,
            predicted_value=f.predicted_value,
            lower_80=f.lower_80,
            upper_80=f.upper_80,
            lower_95=f.lower_95,
            upper_95=f.upper_95,
            predicted_ooc=f.predicted_ooc,
        )
        for f in persisted
    ]

    return ForecastResponse(
        characteristic_id=char_id,
        model_type=model_type,
        generated_at=now,
        points=points,
        predicted_ooc_step=predicted_ooc_step,
    )


@router.get("/{char_id}/history", response_model=list[ForecastResponse])
async def get_forecast_history(
    char_id: int,
    limit: int = Query(5, ge=1, le=50, description="Maximum forecast batches to return"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[ForecastResponse]:
    """Get past forecast batches for a characteristic.

    Returns the most recent forecast batches, each containing all
    forecast steps. Ordered by generated_at descending.

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    # Load all recent forecasts in one query and group in Python to avoid
    # SQLite datetime round-trip mismatch on == comparison.
    from itertools import groupby as itertools_groupby

    all_stmt = (
        select(Forecast)
        .where(Forecast.characteristic_id == char_id)
        .order_by(Forecast.id.desc())
    )
    all_result = await session.execute(all_stmt)
    all_forecasts = list(all_result.scalars().all())

    if not all_forecasts:
        return []

    # Group by generated_at; sort each batch by step ascending
    batches: list[list[Forecast]] = []
    for _, group in itertools_groupby(all_forecasts, key=lambda f: f.generated_at):
        batch = sorted(group, key=lambda f: f.step)
        batches.append(batch)

    # Build model type cache to avoid N+1 queries
    model_ids = {f.model_id for f in all_forecasts}
    model_types: dict[int, str] = {}
    if model_ids:
        mt_stmt = select(PredictionModel.id, PredictionModel.model_type).where(
            PredictionModel.id.in_(model_ids)
        )
        mt_result = await session.execute(mt_stmt)
        model_types = {row[0]: row[1] for row in mt_result.all()}

    responses: list[ForecastResponse] = []
    for batch in batches[:limit]:
        model_type = model_types.get(batch[0].model_id, "unknown")

        predicted_ooc_step = None
        for f in batch:
            if f.predicted_ooc:
                predicted_ooc_step = f.step
                break

        points = [
            ForecastPointResponse(
                step=f.step,
                predicted_value=f.predicted_value,
                lower_80=f.lower_80,
                upper_80=f.upper_80,
                lower_95=f.lower_95,
                upper_95=f.upper_95,
                predicted_ooc=f.predicted_ooc,
            )
            for f in batch
        ]

        responses.append(
            ForecastResponse(
                characteristic_id=char_id,
                model_type=model_type,
                generated_at=batch[0].generated_at,
                points=points,
                predicted_ooc_step=predicted_ooc_step,
            )
        )

    return responses
