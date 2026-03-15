"""Multivariate SPC and Correlation API schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ── Multivariate Group ──────────────────────────────────────


class MultivariateGroupCreate(BaseModel):
    name: str = Field(..., max_length=255)
    plant_id: int
    characteristic_ids: list[int] = Field(..., min_length=2)
    chart_type: str = Field("t_squared", pattern=r"^(t_squared|mewma)$")
    lambda_param: float = Field(0.1, ge=0.01, le=1.0)
    alpha: float = Field(0.0027, gt=0.0, lt=1.0)
    covariance_method: str = Field("classical", pattern=r"^(classical|mcd)$")
    description: str | None = None


class MultivariateGroupUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    chart_type: str | None = Field(None, pattern=r"^(t_squared|mewma)$")
    lambda_param: float | None = Field(None, ge=0.01, le=1.0)
    alpha: float | None = Field(None, gt=0.0, lt=1.0)
    covariance_method: str | None = Field(None, pattern=r"^(classical|mcd)$")
    description: str | None = None
    min_samples: int | None = Field(None, ge=10)


class MultivariateGroupMemberResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    characteristic_id: int
    characteristic_name: str | None = None
    hierarchy_path: str | None = None
    display_order: int


class MultivariateGroupResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    plant_id: int
    name: str
    description: str | None
    chart_type: str
    lambda_param: float
    alpha: float
    covariance_method: str
    phase: str
    min_samples: int
    is_active: bool
    created_at: datetime
    updated_at: datetime | None
    members: list[MultivariateGroupMemberResponse] = []


class T2Point(BaseModel):
    timestamp: datetime
    t_squared: float
    ucl: float
    in_control: bool
    decomposition: list[dict] | None = None


class MultivariateChartResponse(BaseModel):
    group_id: int
    group_name: str
    chart_type: str
    covariance_method: str = "classical"
    phase: str
    points: list[T2Point]
    ucl: float
    mean: list[float] | None = None
    characteristic_names: list[str]
    phase_i_outlier_count: int | None = None


class BivariateScatterPoint(BaseModel):
    x: float
    y: float
    t2: float
    ooc: bool


class BivariateResponse(BaseModel):
    group_id: int
    char_names: list[str]
    scatter_points: list[BivariateScatterPoint]
    ellipse_boundary: list[list[float]]
    center: list[float]
    ucl: float
    ooc_count: int
    total_count: int


class FreezeRequest(BaseModel):
    """No body needed — just triggers phase transition."""

    pass


# ── Correlation ─────────────────────────────────────────────


class CorrelationComputeRequest(BaseModel):
    characteristic_ids: list[int] = Field(..., min_length=2, max_length=20)
    method: str = Field("pearson", pattern=r"^(pearson|spearman)$")
    include_pca: bool = False
    plant_id: int


class CorrelationResultResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    plant_id: int
    characteristic_ids: list[int]
    characteristic_names: list[str] = []
    method: str
    matrix: list[list[float]]
    p_values: list[list[float]]
    sample_count: int
    computed_at: datetime


# ── Decomposition ──────────────────────────────────────────


class DecompositionTermResponse(BaseModel):
    variable_index: int
    variable_name: str
    conditional_t2: float
    unconditional_t2: float
    proportion: float


class DecompositionStepResponse(BaseModel):
    label: str
    formula_latex: str
    substitution_latex: str
    result: float
    note: str | None = None


class DecompositionCitationResponse(BaseModel):
    standard: str
    reference: str
    section: str | None = None


class DecompositionResponse(BaseModel):
    group_id: int
    group_name: str
    observation_index: int
    total_t2: float
    ucl: float
    terms: list[DecompositionTermResponse]
    characteristic_names: list[str]
    timestamp: datetime | None = None
    steps: list[DecompositionStepResponse] = []
    inputs: dict[str, float | str] = {}
    citation: DecompositionCitationResponse | None = None
    warnings: list[str] = []


class PCAResultResponse(BaseModel):
    eigenvalues: list[float]
    explained_variance_ratios: list[float]
    cumulative_variance: list[float]
    loadings: list[list[float]]
    scores: list[list[float]] | None = None
    characteristic_names: list[str]
