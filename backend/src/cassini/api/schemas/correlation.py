"""Correlation Analysis API schemas (Pro tier)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ── Correlation Matrix ──────────────────────────────────────


class CorrelationMatrixRequest(BaseModel):
    plant_id: int
    characteristic_ids: list[int] = Field(..., min_length=2, max_length=20)
    method: str = Field("pearson", pattern=r"^(pearson|spearman)$")


class CorrelationMatrixResponse(BaseModel):
    characteristic_ids: list[int]
    characteristic_names: list[str]
    method: str
    matrix: list[list[float]]
    p_values: list[list[float]]
    sample_count: int


# ── PCA ─────────────────────────────────────────────────────


class PCARequest(BaseModel):
    plant_id: int
    characteristic_ids: list[int] = Field(..., min_length=2, max_length=20)


class PCAResponse(BaseModel):
    characteristic_names: list[str]
    eigenvalues: list[float]
    explained_variance_ratios: list[float]
    cumulative_variance: list[float]
    loadings: list[list[float]]
    scores: list[list[float]]


# ── Partial Correlation ─────────────────────────────────────


class PartialCorrelationRequest(BaseModel):
    plant_id: int
    primary_id: int
    secondary_id: int
    control_ids: list[int] = Field(default_factory=list, max_length=15)


class PartialCorrelationResponse(BaseModel):
    primary_name: str
    secondary_name: str
    controlling_for: list[str]
    r: float
    p_value: float
    df: int


# ── Variable Importance ─────────────────────────────────────


# ── Regression Scatter ─────────────────────────────────────


class RegressionScatterRequest(BaseModel):
    plant_id: int
    x_characteristic_id: int
    y_characteristic_id: int
    start_date: datetime | None = None
    end_date: datetime | None = None


class RegressionScatterPoint(BaseModel):
    x: float
    y: float
    residual: float


class RegressionScatterResponse(BaseModel):
    x_name: str
    y_name: str
    x_hierarchy_path: str | None = None
    y_hierarchy_path: str | None = None
    points: list[RegressionScatterPoint]
    regression_line: list[list[float]]  # [[x_min, y_hat_min], [x_max, y_hat_max]]
    confidence_band_upper: list[list[float]]  # [[x, y_upper], ...]
    confidence_band_lower: list[list[float]]  # [[x, y_lower], ...]
    prediction_band_upper: list[list[float]]
    prediction_band_lower: list[list[float]]
    slope: float
    intercept: float
    r_squared: float
    p_value: float
    std_err: float
    sample_count: int


# ── Variable Importance ─────────────────────────────────────


class VariableImportanceItem(BaseModel):
    characteristic_id: int
    characteristic_name: str
    pearson_r: float
    abs_pearson_r: float
    p_value: float


class VariableImportanceResponse(BaseModel):
    target_characteristic_id: int
    target_characteristic_name: str
    sample_count: int
    rankings: list[VariableImportanceItem]
