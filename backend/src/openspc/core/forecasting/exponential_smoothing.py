"""Exponential Smoothing / Holt-Winters forecasting wrapper."""

from __future__ import annotations

import numpy as np
import structlog

from openspc.core.forecasting.arima import ForecastResult, ForecastingUnavailable

logger = structlog.get_logger(__name__)


class ExponentialSmoothingForecaster:
    """Holt-Winters exponential smoothing wrapper.

    Uses additive trend by default.  If ``seasonal=True`` and enough
    data is available (at least 2 full seasonal periods), an additive
    seasonal component is included.
    """

    def _check_available(self):  # noqa: ANN202
        """Import and return ``statsmodels.tsa.holtwinters.ExponentialSmoothing``.

        Raises:
            ForecastingUnavailable: If statsmodels is not installed.
        """
        try:
            from statsmodels.tsa.holtwinters import ExponentialSmoothing

            return ExponentialSmoothing
        except ImportError:
            raise ForecastingUnavailable(
                "statsmodels is not installed. "
                "Install with: pip install statsmodels>=0.14.0"
            )

    def fit_and_forecast(
        self,
        values: np.ndarray,
        seasonal: bool = False,
        seasonal_periods: int | None = None,
        steps: int = 20,
        confidence: list[float] | None = None,
    ) -> ForecastResult:
        """Fit an Exponential Smoothing model and generate a forecast.

        Tries additive trend.  When ``seasonal=True`` and
        ``seasonal_periods`` is provided with sufficient data (at least
        ``2 * seasonal_periods`` observations), an additive seasonal
        component is also included.

        Args:
            values: Historical time series (1-D array, minimum 20
                observations).
            seasonal: Whether to include a seasonal component.
            seasonal_periods: Number of observations per season.
            steps: Number of steps to forecast ahead.
            confidence: Confidence levels for prediction intervals.
                Defaults to ``[0.80, 0.95]``.

        Returns:
            A :class:`ForecastResult` with predicted values and CIs.

        Raises:
            ForecastingUnavailable: If statsmodels is absent.
            ValueError: If fewer than 20 observations are provided.
        """
        if confidence is None:
            confidence = [0.80, 0.95]

        ES = self._check_available()

        if len(values) < 20:
            raise ValueError(
                f"Need at least 20 observations (have {len(values)})"
            )

        # Build model kwargs
        kwargs: dict = {"trend": "add"}
        if seasonal and seasonal_periods and len(values) >= 2 * seasonal_periods:
            kwargs["seasonal"] = "add"
            kwargs["seasonal_periods"] = seasonal_periods

        model = ES(values, **kwargs)
        fitted = model.fit(optimized=True)
        aic = float(fitted.aic)

        # Forecast with simulation-based prediction intervals.
        # Use additive errors — multiplicative requires strictly positive
        # fitted values, which SPC deviation data may violate.
        sim = fitted.simulate(steps, repetitions=1000, error="add")
        predicted = fitted.forecast(steps).tolist()

        result = ForecastResult(
            values=predicted,
            model_type="exponential_smoothing",
            model_params={
                "seasonal": seasonal,
                "seasonal_periods": seasonal_periods,
                **kwargs,
            },
            aic=aic,
        )

        for conf in sorted(confidence):
            alpha_ci = 1 - conf
            lower = np.percentile(sim, alpha_ci / 2 * 100, axis=1).tolist()
            upper = np.percentile(sim, (1 - alpha_ci / 2) * 100, axis=1).tolist()
            if abs(conf - 0.80) < 0.01:
                result.lower_80 = lower
                result.upper_80 = upper
            elif abs(conf - 0.95) < 0.01:
                result.lower_95 = lower
                result.upper_95 = upper

        return result
