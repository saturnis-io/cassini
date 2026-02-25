"""Auto-select best forecasting model by AIC.

Tries a grid of ARIMA orders plus Exponential Smoothing and returns the
:class:`ForecastResult` from the model with the lowest Akaike
Information Criterion.
"""

from __future__ import annotations

import numpy as np
import structlog

from openspc.core.forecasting.arima import (
    ARIMAForecaster,
    ForecastingUnavailable,
    ForecastResult,
)
from openspc.core.forecasting.exponential_smoothing import (
    ExponentialSmoothingForecaster,
)

logger = structlog.get_logger(__name__)

CANDIDATE_MODELS: list[tuple[str, tuple[int, int, int] | None]] = [
    ("arima", (1, 1, 1)),
    ("arima", (2, 1, 0)),
    ("arima", (0, 1, 1)),
    ("arima", (1, 0, 1)),
    ("arima", (0, 1, 2)),
    ("exponential_smoothing", None),
]


def select_best_model(
    values: np.ndarray,
    steps: int = 20,
    confidence: list[float] | None = None,
) -> ForecastResult:
    """Try multiple forecasting models and select the best by AIC.

    Requires at least 50 observations so every candidate has a
    reasonable chance of converging.

    Args:
        values: Historical time series (1-D array, minimum 50
            observations).
        steps: Number of steps to forecast ahead.
        confidence: Confidence levels for prediction intervals.
            Defaults to ``[0.80, 0.95]``.

    Returns:
        :class:`ForecastResult` from the model with the lowest AIC.

    Raises:
        ValueError: If fewer than 50 observations are provided.
        ForecastingUnavailable: If no model converges.
    """
    if confidence is None:
        confidence = [0.80, 0.95]

    if len(values) < 50:
        raise ValueError(
            f"Need at least 50 observations for auto-selection "
            f"(have {len(values)})"
        )

    arima = ARIMAForecaster()
    es = ExponentialSmoothingForecaster()

    best_result: ForecastResult | None = None
    best_aic = float("inf")

    for model_type, params in CANDIDATE_MODELS:
        try:
            if model_type == "arima":
                assert params is not None
                result = arima.fit_and_forecast(
                    values, order=params, steps=steps, confidence=confidence
                )
            else:
                result = es.fit_and_forecast(
                    values, steps=steps, confidence=confidence
                )

            if result.aic < best_aic:
                best_aic = result.aic
                best_result = result
                logger.debug(
                    "forecasting_candidate",
                    model=model_type,
                    params=params,
                    aic=result.aic,
                )

        except Exception as e:
            logger.debug(
                "forecasting_candidate_failed",
                model=model_type,
                params=params,
                error=str(e),
            )
            continue

    if best_result is None:
        raise ForecastingUnavailable(
            "No forecasting model converged on this data"
        )

    logger.info(
        "forecasting_model_selected",
        model=best_result.model_type,
        params=best_result.model_params,
        aic=best_result.aic,
    )
    return best_result
