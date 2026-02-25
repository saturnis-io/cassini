"""ARIMA forecasting wrapper with lazy statsmodels import."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import structlog

logger = structlog.get_logger(__name__)


class ForecastingUnavailable(Exception):
    """Raised when statsmodels is not installed."""

    pass


@dataclass
class ForecastResult:
    """Result of a forecast computation.

    Attributes:
        values: Predicted values for each step ahead.
        lower_80: 80 % confidence interval lower bounds.
        upper_80: 80 % confidence interval upper bounds.
        lower_95: 95 % confidence interval lower bounds.
        upper_95: 95 % confidence interval upper bounds.
        model_type: Identifier of the model that produced this forecast.
        model_params: Serializable dict of fitted parameters.
        aic: Akaike Information Criterion of the fitted model.
    """

    values: list[float]
    lower_80: list[float] = field(default_factory=list)
    upper_80: list[float] = field(default_factory=list)
    lower_95: list[float] = field(default_factory=list)
    upper_95: list[float] = field(default_factory=list)
    model_type: str = "arima"
    model_params: dict = field(default_factory=dict)
    aic: float = float("inf")


class ARIMAForecaster:
    """ARIMA model wrapper with lazy statsmodels import.

    statsmodels is imported only when ``fit_and_forecast`` is called
    so the rest of the application can function without it installed.
    """

    def _check_available(self):  # noqa: ANN202
        """Import and return ``statsmodels.tsa.arima.model.ARIMA``.

        Raises:
            ForecastingUnavailable: If statsmodels is not installed.
        """
        try:
            from statsmodels.tsa.arima.model import ARIMA

            return ARIMA
        except ImportError:
            raise ForecastingUnavailable(
                "statsmodels is not installed. "
                "Install with: pip install statsmodels>=0.14.0"
            )

    def fit_and_forecast(
        self,
        values: np.ndarray,
        order: tuple[int, int, int] = (1, 1, 1),
        steps: int = 20,
        confidence: list[float] | None = None,
    ) -> ForecastResult:
        """Fit an ARIMA model and generate a multi-step forecast.

        Args:
            values: Historical time series data (1-D array, minimum 30
                observations).
            order: ARIMA(p, d, q) order tuple.
            steps: Number of steps to forecast ahead.
            confidence: Confidence levels for prediction intervals.
                Defaults to ``[0.80, 0.95]``.

        Returns:
            A :class:`ForecastResult` with predicted values and CIs.

        Raises:
            ForecastingUnavailable: If statsmodels is absent.
            ValueError: If fewer than 30 observations are provided.
        """
        if confidence is None:
            confidence = [0.80, 0.95]

        ARIMA = self._check_available()

        if len(values) < 30:
            raise ValueError(
                f"Need at least 30 observations for ARIMA (have {len(values)})"
            )

        p_order, d_order, q_order = order
        if any(v < 0 for v in order):
            raise ValueError("ARIMA order values must be non-negative")
        if p_order + d_order + q_order > 10:
            raise ValueError(f"ARIMA order ({order}) is too high — maximum total order is 10")

        # Fit model
        model = ARIMA(values, order=order)
        fitted = model.fit()
        aic = float(fitted.aic)

        # Forecast
        forecast_obj = fitted.get_forecast(steps=steps)
        predicted = forecast_obj.predicted_mean.tolist()

        # Build result with confidence intervals
        result = ForecastResult(
            values=predicted,
            model_type="arima",
            model_params={"order": list(order)},
            aic=aic,
        )

        for conf in sorted(confidence):
            ci = forecast_obj.conf_int(alpha=1 - conf)
            lower = ci.iloc[:, 0].tolist()
            upper = ci.iloc[:, 1].tolist()
            if abs(conf - 0.80) < 0.01:
                result.lower_80 = lower
                result.upper_80 = upper
            elif abs(conf - 0.95) < 0.01:
                result.lower_95 = lower
                result.upper_95 = upper

        return result
