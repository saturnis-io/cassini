"""ForecastingEngine -- event-driven forecasting orchestrator.

Subscribes to ``SampleProcessedEvent``.  For characteristics with
prediction enabled, periodically retrains models and generates
multi-step forecasts with confidence intervals and predicted
out-of-control alerts.

Follows the same lifecycle pattern as :class:`AnomalyDetector`:
created during app startup (lifespan), subscribes to the Event Bus,
and uses a session factory for all database access.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import numpy as np
import structlog
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.core.events.events import SampleProcessedEvent
from openspc.core.forecasting.alerts import check_predicted_ooc
from openspc.core.forecasting.arima import (
    ARIMAForecaster,
    ForecastingUnavailable,
    ForecastResult,
)
from openspc.core.forecasting.exponential_smoothing import (
    ExponentialSmoothingForecaster,
)
from openspc.core.forecasting.model_selector import select_best_model

logger = structlog.get_logger(__name__)


class ForecastingEngine:
    """Orchestrates predictive analytics for SPC characteristics.

    Lifecycle:
    1. Created during app startup (lifespan).
    2. Subscribes to ``SampleProcessedEvent`` on the Event Bus.
    3. For each event, loads the prediction config, checks whether a
       retrain is needed, fits the model, and persists forecasts.
    4. Marks forecast points as ``predicted_ooc`` when they breach
       control limits.
    """

    def __init__(self, event_bus: Any, session_factory: Any) -> None:
        """Initialise the forecasting engine.

        Args:
            event_bus: The application ``EventBus`` instance.
            session_factory: Async session factory for database access.
        """
        self._event_bus = event_bus
        self._session_factory = session_factory
        logger.info("ForecastingEngine initialized")

    # ------------------------------------------------------------------
    # Event Bus integration
    # ------------------------------------------------------------------

    def setup_subscriptions(self) -> None:
        """Subscribe to ``SampleProcessedEvent`` on the Event Bus."""
        self._event_bus.subscribe(
            SampleProcessedEvent, self._on_sample_processed
        )
        logger.info("forecasting_engine_subscriptions_active")

    async def _on_sample_processed(
        self, event: SampleProcessedEvent
    ) -> None:
        """Handle a new sample -- check if prediction is needed."""
        try:
            async with self._session_factory() as session:
                await self._process_sample(session, event)
        except ForecastingUnavailable:
            pass  # statsmodels not installed -- silently skip
        except Exception as e:
            logger.warning(
                "forecasting_error",
                char_id=event.characteristic_id,
                error=str(e),
            )

    # ------------------------------------------------------------------
    # Core processing pipeline
    # ------------------------------------------------------------------

    async def _process_sample(
        self, session: AsyncSession, event: SampleProcessedEvent
    ) -> None:
        """Check config, decide whether to retrain, generate forecast."""
        from openspc.db.models.prediction import PredictionConfig, PredictionModel
        from openspc.db.models.sample import Sample

        char_id = event.characteristic_id

        # Load prediction config
        stmt = select(PredictionConfig).where(
            PredictionConfig.characteristic_id == char_id
        )
        result = await session.execute(stmt)
        config = result.scalar_one_or_none()

        if not config or not config.is_enabled:
            return

        # Pre-extract config values before any awaits
        model_type = config.model_type
        forecast_horizon = config.forecast_horizon
        refit_interval = config.refit_interval
        confidence_str = config.confidence_levels

        try:
            confidence = (
                json.loads(confidence_str) if confidence_str else [0.80, 0.95]
            )
        except (json.JSONDecodeError, TypeError):
            confidence = [0.80, 0.95]

        # Check current model
        model_stmt = select(PredictionModel).where(
            PredictionModel.characteristic_id == char_id,
            PredictionModel.is_current == True,  # noqa: E712
        )
        model_result = await session.execute(model_stmt)
        current_model = model_result.scalar_one_or_none()

        # Count samples since last fit
        if current_model:
            model_fitted_at = current_model.fitted_at
            count_stmt = select(func.count(Sample.id)).where(
                Sample.char_id == char_id,
                Sample.timestamp > model_fitted_at,
            )
        else:
            count_stmt = select(func.count(Sample.id)).where(
                Sample.char_id == char_id,
            )

        count_result = await session.execute(count_stmt)
        new_sample_count = count_result.scalar() or 0

        # Decide whether to retrain
        needs_retrain = (
            current_model is None or new_sample_count >= refit_interval
        )

        if needs_retrain:
            await self._retrain_and_forecast(
                session, char_id, model_type, forecast_horizon, confidence
            )

    # ------------------------------------------------------------------
    # Training & forecasting
    # ------------------------------------------------------------------

    async def _load_historical_means(
        self, session: AsyncSession, char_id: int
    ) -> np.ndarray:
        """Load historical subgroup means for a characteristic.

        The :class:`Sample` model does not store the mean directly;
        it is computed from the associated :class:`Measurement` rows.
        We eager-load measurements via ``selectinload`` to avoid
        async lazy-loading pitfalls (see MEMORY.md pitfalls).
        """
        from openspc.db.models.sample import Sample

        stmt = (
            select(Sample)
            .options(selectinload(Sample.measurements))
            .where(Sample.char_id == char_id, Sample.is_excluded == False)  # noqa: E712
            .order_by(Sample.timestamp.asc())
        )
        result = await session.execute(stmt)
        samples = list(result.scalars().all())

        means: list[float] = []
        for sample in samples:
            measurement_values = [m.value for m in sample.measurements]
            if measurement_values:
                means.append(float(np.mean(measurement_values)))

        return np.array(means, dtype=np.float64)

    async def _retrain_and_forecast(
        self,
        session: AsyncSession,
        char_id: int,
        model_type: str,
        horizon: int,
        confidence: list[float],
    ) -> None:
        """Retrain the model and persist new forecast rows."""
        from openspc.db.models.characteristic import Characteristic
        from openspc.db.models.prediction import Forecast, PredictionModel

        # Load historical data
        values = await self._load_historical_means(session, char_id)

        if len(values) < 50:
            logger.debug(
                "forecasting_insufficient_data",
                char_id=char_id,
                count=len(values),
            )
            return

        # Fit model
        try:
            forecast_result = self._fit_model(
                values, model_type, horizon, confidence
            )
        except Exception as e:
            logger.warning(
                "forecasting_fit_failed", char_id=char_id, error=str(e)
            )
            return

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

        # Load characteristic UCL / LCL for OOC checking
        char_stmt = select(
            Characteristic.ucl, Characteristic.lcl
        ).where(Characteristic.id == char_id)
        char_result = await session.execute(char_stmt)
        char_row = char_result.one_or_none()
        ucl = char_row[0] if char_row else None
        lcl = char_row[1] if char_row else None

        # Determine first predicted OOC step
        predicted_ooc_step = check_predicted_ooc(
            forecast_result.values, ucl, lcl
        )

        # Persist individual forecast rows
        now = datetime.now(timezone.utc)
        for i, val in enumerate(forecast_result.values):
            forecast = Forecast(
                model_id=new_model.id,
                characteristic_id=char_id,
                step=i + 1,
                predicted_value=val,
                lower_80=(
                    forecast_result.lower_80[i]
                    if forecast_result.lower_80
                    else None
                ),
                upper_80=(
                    forecast_result.upper_80[i]
                    if forecast_result.upper_80
                    else None
                ),
                lower_95=(
                    forecast_result.lower_95[i]
                    if forecast_result.lower_95
                    else None
                ),
                upper_95=(
                    forecast_result.upper_95[i]
                    if forecast_result.upper_95
                    else None
                ),
                predicted_ooc=(
                    predicted_ooc_step is not None
                    and i + 1 >= predicted_ooc_step
                ),
                generated_at=now,
            )
            session.add(forecast)

        await session.commit()

        if predicted_ooc_step is not None:
            logger.info(
                "predicted_ooc_alert",
                char_id=char_id,
                step=predicted_ooc_step,
            )

    @staticmethod
    def _fit_model(
        values: np.ndarray,
        model_type: str,
        horizon: int,
        confidence: list[float],
    ) -> ForecastResult:
        """Fit the requested model type (pure computation, no I/O)."""
        if model_type == "auto":
            return select_best_model(
                values, steps=horizon, confidence=confidence
            )
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
            return select_best_model(
                values, steps=horizon, confidence=confidence
            )

    # ------------------------------------------------------------------
    # Public API methods (called from routers)
    # ------------------------------------------------------------------

    async def train_model(self, session: AsyncSession, char_id: int) -> dict:
        """Force-retrain a model for a characteristic.

        Called from the API router.

        Returns:
            Dict with model metadata (type, AIC, sample count, fit time).

        Raises:
            ValueError: If no ``PredictionConfig`` exists for the
                characteristic.
        """
        from openspc.db.models.prediction import PredictionConfig, PredictionModel

        stmt = select(PredictionConfig).where(
            PredictionConfig.characteristic_id == char_id
        )
        result = await session.execute(stmt)
        config = result.scalar_one_or_none()

        if not config:
            raise ValueError("No prediction config for this characteristic")

        model_type = config.model_type
        horizon = config.forecast_horizon
        confidence_str = config.confidence_levels
        try:
            confidence = (
                json.loads(confidence_str) if confidence_str else [0.80, 0.95]
            )
        except (json.JSONDecodeError, TypeError):
            confidence = [0.80, 0.95]

        await self._retrain_and_forecast(
            session, char_id, model_type, horizon, confidence
        )

        # Return the newly fitted model info
        model_stmt = select(PredictionModel).where(
            PredictionModel.characteristic_id == char_id,
            PredictionModel.is_current == True,  # noqa: E712
        )
        model_result = await session.execute(model_stmt)
        new_model = model_result.scalar_one_or_none()

        if new_model:
            return {
                "model_type": new_model.model_type,
                "aic": new_model.aic,
                "training_samples": new_model.training_samples,
                "fitted_at": (
                    new_model.fitted_at.isoformat()
                    if new_model.fitted_at
                    else None
                ),
            }
        return {"status": "no model fitted"}

    async def generate_forecast(
        self, session: AsyncSession, char_id: int
    ) -> list[dict]:
        """Generate a new forecast for a characteristic.

        Called from the API router.  Retrains the model before
        generating the forecast to ensure fresh results.

        Returns:
            List of forecast-point dicts ordered by step.
        """
        from openspc.db.models.prediction import (
            Forecast,
            PredictionConfig,
        )

        # Load config
        stmt = select(PredictionConfig).where(
            PredictionConfig.characteristic_id == char_id
        )
        result = await session.execute(stmt)
        config = result.scalar_one_or_none()
        if not config:
            raise ValueError("No prediction config")

        horizon = config.forecast_horizon
        model_type = config.model_type
        confidence_str = config.confidence_levels
        try:
            confidence = (
                json.loads(confidence_str) if confidence_str else [0.80, 0.95]
            )
        except (json.JSONDecodeError, TypeError):
            confidence = [0.80, 0.95]

        # Retrain and persist
        await self._retrain_and_forecast(
            session, char_id, model_type, horizon, confidence
        )

        # Return latest forecast batch
        forecast_stmt = (
            select(Forecast)
            .where(Forecast.characteristic_id == char_id)
            .order_by(Forecast.generated_at.desc(), Forecast.step.asc())
        )
        forecast_result = await session.execute(forecast_stmt)
        forecasts = list(forecast_result.scalars().all())

        if not forecasts:
            return []

        # Group by generated_at (latest batch only)
        latest_time = forecasts[0].generated_at
        return [
            {
                "step": f.step,
                "predicted_value": f.predicted_value,
                "lower_80": f.lower_80,
                "upper_80": f.upper_80,
                "lower_95": f.lower_95,
                "upper_95": f.upper_95,
                "predicted_ooc": f.predicted_ooc,
            }
            for f in forecasts
            if f.generated_at == latest_time
        ]
