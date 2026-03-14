"""Predictive Analytics API schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PredictionConfigResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int | None = None
    characteristic_id: int
    is_enabled: bool = False
    model_type: str = "auto"
    forecast_horizon: int = 20
    refit_interval: int = 50
    confidence_levels: list[float] = [0.8, 0.95]
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PredictionConfigUpdate(BaseModel):
    is_enabled: bool | None = None
    model_type: str | None = Field(None, pattern=r"^(auto|arima|exponential_smoothing)$")
    forecast_horizon: int | None = Field(None, ge=5, le=100)
    refit_interval: int | None = Field(None, ge=20, le=200)
    confidence_levels: list[float] | None = None


class PredictionModelResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    characteristic_id: int
    model_type: str
    model_params: dict | None = None
    aic: float | None = None
    training_samples: int | None = None
    fitted_at: datetime
    is_current: bool


class ForecastPointResponse(BaseModel):
    model_config = {"from_attributes": True}

    step: int
    predicted_value: float
    lower_80: float | None = None
    upper_80: float | None = None
    lower_95: float | None = None
    upper_95: float | None = None
    predicted_ooc: bool = False


class ForecastResponse(BaseModel):
    characteristic_id: int
    model_type: str
    generated_at: datetime
    points: list[ForecastPointResponse]
    predicted_ooc_step: int | None = None


class PredictionDashboardItem(BaseModel):
    characteristic_id: int
    characteristic_name: str
    model_type: str | None = None
    is_enabled: bool
    last_trained: datetime | None = None
    training_samples: int | None = None
    aic: float | None = None
    has_forecast: bool = False
    predicted_ooc: bool = False


class IntervalStatsResponse(BaseModel):
    """Statistics about forecast confidence interval widths."""

    median_width_80: float
    median_width_95: float
    width_trend: str = Field(
        ..., pattern=r"^(widening|stable|narrowing)$"
    )
    sigma_ratio: float
    horizon_recommendation: int | None = None
    interpretation: str
