"""Forecasting / Predictive Analytics for OpenSPC.

Provides ARIMA and Exponential Smoothing forecasting with automatic
model selection, predicted out-of-control alerts, and Event Bus
integration for real-time SPC monitoring.
"""

from openspc.core.forecasting.arima import ForecastResult, ForecastingUnavailable
from openspc.core.forecasting.engine import ForecastingEngine

__all__ = [
    "ForecastingEngine",
    "ForecastResult",
    "ForecastingUnavailable",
]
