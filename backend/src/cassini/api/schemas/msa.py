"""Measurement System Analysis (MSA) API schemas — Gage R&R + Attribute MSA."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ── Request Schemas ──────────────────────────────────────────


class MSAStudyCreate(BaseModel):
    name: str = Field(..., max_length=255)
    study_type: str = Field(
        ...,
        pattern=r"^(crossed_anova|nested_anova|range_method|attribute_agreement|linearity|stability|bias)$",
    )
    characteristic_id: int | None = None
    num_operators: int = Field(..., ge=1)
    num_parts: int = Field(..., ge=2)
    num_replicates: int = Field(2, ge=1)
    tolerance: float | None = None
    plant_id: int


class MSAPartInput(BaseModel):
    name: str = Field(..., max_length=100)
    reference_value: float | None = None


class MSAOperatorsSet(BaseModel):
    operators: list[str] = Field(..., min_length=1)


class MSAPartsSet(BaseModel):
    parts: list[MSAPartInput] = Field(..., min_length=1)


class MSAMeasurementInput(BaseModel):
    operator_id: int
    part_id: int
    replicate_num: int = Field(..., ge=1)
    value: float


class MSAMeasurementBatch(BaseModel):
    measurements: list[MSAMeasurementInput] = Field(..., min_length=1)


class MSAAttributeInput(BaseModel):
    operator_id: int
    part_id: int
    replicate_num: int = Field(..., ge=1)
    attribute_value: str = Field(..., max_length=50)


class MSAAttributeBatch(BaseModel):
    measurements: list[MSAAttributeInput] = Field(..., min_length=1)


# ── Response Schemas ─────────────────────────────────────────


class MSAOperatorResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    sequence_order: int


class MSAPartResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    reference_value: float | None
    sequence_order: int


class MSAMeasurementResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    operator_id: int
    part_id: int
    replicate_num: int
    value: float
    attribute_value: str | None
    timestamp: datetime


class MSAStudyResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    plant_id: int
    name: str
    study_type: str
    characteristic_id: int | None
    num_operators: int
    num_parts: int
    num_replicates: int
    tolerance: float | None
    status: str
    created_by: int
    created_at: datetime
    completed_at: datetime | None


class MSAStudyDetailResponse(MSAStudyResponse):
    operators: list[MSAOperatorResponse] = []
    parts: list[MSAPartResponse] = []
    measurement_count: int = 0


class GageRRResultResponse(BaseModel):
    model_config = {"from_attributes": True}

    method: str
    repeatability_ev: float
    reproducibility_av: float
    interaction: float | None
    gage_rr: float
    part_variation: float
    total_variation: float
    pct_contribution_ev: float
    pct_contribution_av: float
    pct_contribution_interaction: float | None
    pct_contribution_grr: float
    pct_contribution_pv: float
    pct_study_ev: float
    pct_study_av: float
    pct_study_grr: float
    pct_study_pv: float
    pct_tolerance_grr: float | None
    ndc: int
    anova_table: dict | None
    verdict: str


class AttributeMSAResultResponse(BaseModel):
    model_config = {"from_attributes": True}

    within_appraiser: dict[str, float]
    between_appraiser: float
    vs_reference: dict[str, float] | None
    cohens_kappa_pairs: dict[str, float]
    fleiss_kappa: float
    verdict: str


class LinearityResultResponse(BaseModel):
    model_config = {"from_attributes": True}

    reference_values: list[float]
    bias_values: list[float]
    bias_percentages: list[float | None]
    slope: float
    intercept: float
    r_squared: float
    linearity: float
    linearity_percent: float | None
    bias_avg: float
    bias_percent: float | None
    is_acceptable: bool
    individual_points: list[dict]
    verdict: str
    p_value: float


class StabilityResultResponse(BaseModel):
    model_config = {"from_attributes": True}

    values: list[float]
    center_line: float
    ucl: float
    lcl: float
    sigma: float
    moving_ranges: list[float]
    mr_center_line: float
    mr_ucl: float
    mr_lcl: float
    violations: list[dict]
    verdict: str
    verdict_reason: str
    warnings: list[str]


class BiasResultResponse(BaseModel):
    model_config = {"from_attributes": True}

    reference_value: float
    n: int
    mean: float
    std_dev: float
    bias: float
    bias_percent: float | None
    t_statistic: float
    p_value: float
    df: int
    is_significant: bool
    verdict: str
    denominator_used: str
    measurements: list[float]
    warnings: list[str]
