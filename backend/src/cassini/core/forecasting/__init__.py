"""Forecasting / Predictive Analytics for Cassini.

Provides ARIMA and Exponential Smoothing forecasting with automatic
model selection, predicted out-of-control alerts, and Event Bus
integration for real-time SPC monitoring.
"""

from cassini.core.forecasting.arima import ForecastResult, ForecastingUnavailable
from cassini.core.forecasting.engine import ForecastingEngine

__all__ = [
    "ForecastingEngine",
    "ForecastResult",
    "ForecastingUnavailable",
]
