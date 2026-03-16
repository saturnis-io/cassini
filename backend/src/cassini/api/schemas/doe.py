"""Design of Experiments (DOE) API schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class DOEFactorCreate(BaseModel):
    name: str = Field(..., max_length=255)
    low_level: float
    high_level: float
    unit: str | None = Field(None, max_length=50)

    @model_validator(mode="after")
    def validate_levels(self):
        if self.low_level >= self.high_level:
            raise ValueError("low_level must be less than high_level")
        return self


class DOEStudyCreate(BaseModel):
    name: str = Field(..., max_length=255)
    plant_id: int
    design_type: str = Field(
        ...,
        pattern=r"^(full_factorial|fractional_factorial|plackett_burman|central_composite|box_behnken|d_optimal|taguchi)$",
    )
    resolution: int | None = Field(None, ge=3, le=7)
    n_runs: int | None = Field(None, ge=2, le=10000)
    model_order: str | None = Field(
        None, pattern=r"^(linear|interaction|quadratic)$"
    )
    sn_type: str | None = Field(
        None,
        pattern=r"^(smaller_is_better|larger_is_better|nominal_is_best_1|nominal_is_best_2)$",
    )
    response_name: str = Field("Response", max_length=255)
    response_unit: str | None = Field(None, max_length=50)
    notes: str | None = None
    factors: list[DOEFactorCreate] = Field(..., min_length=2, max_length=23)

    @model_validator(mode="after")
    def validate_factor_count(self):
        if self.design_type == "box_behnken" and len(self.factors) < 3:
            raise ValueError("Box-Behnken design requires at least 3 factors")
        if self.design_type == "fractional_factorial" and self.resolution is None:
            raise ValueError("Fractional factorial design requires resolution")
        if self.design_type == "plackett_burman":
            if len(self.factors) < 2:
                raise ValueError(
                    "Plackett-Burman design requires at least 2 factors"
                )
            if len(self.factors) > 23:
                raise ValueError(
                    "Plackett-Burman design supports up to 23 factors"
                )
        if self.design_type == "taguchi":
            if self.sn_type is None:
                raise ValueError(
                    "Taguchi design requires sn_type to be specified "
                    "(smaller_is_better, larger_is_better, nominal_is_best_1, nominal_is_best_2)"
                )
        if self.design_type == "d_optimal":
            if self.n_runs is None:
                raise ValueError(
                    "D-optimal design requires n_runs to be specified"
                )
            # Validate n_runs >= model parameters
            n_factors = len(self.factors)
            model_order = self.model_order or "linear"
            p = 1 + n_factors  # intercept + main effects
            if model_order in ("interaction", "quadratic"):
                p += n_factors * (n_factors - 1) // 2
            if model_order == "quadratic":
                p += n_factors
            if self.n_runs < p:
                raise ValueError(
                    f"D-optimal design with {n_factors} factors and "
                    f"model_order='{model_order}' requires at least "
                    f"{p} runs, got {self.n_runs}"
                )
        return self


class DOEStudyUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    response_name: str | None = Field(None, max_length=255)
    response_unit: str | None = Field(None, max_length=50)
    notes: str | None = None


class DOEFactorResponse(BaseModel):
    id: int
    name: str
    low_level: float
    high_level: float
    center_point: float | None
    unit: str | None
    display_order: int


class DOERunResponse(BaseModel):
    id: int
    run_order: int
    standard_order: int
    factor_values: dict[str, float]  # coded values
    factor_actuals: dict[str, float]  # actual values
    response_value: float | None
    is_center_point: bool
    replicate: int
    notes: str | None
    completed_at: datetime | None


class DOERunUpdate(BaseModel):
    run_id: int
    response_value: float | None
    notes: str | None = None


class DOERunBatchUpdate(BaseModel):
    runs: list[DOERunUpdate] = Field(..., min_length=1)


class DOEStudyResponse(BaseModel):
    id: int
    plant_id: int
    name: str
    design_type: str
    resolution: int | None
    sn_type: str | None = None
    status: str
    response_name: str
    response_unit: str | None
    notes: str | None
    created_by: int | None
    created_at: datetime
    updated_at: datetime | None
    factors: list[DOEFactorResponse] = []
    run_count: int = 0
    completed_run_count: int = 0


class ANOVARowResponse(BaseModel):
    source: str
    sum_of_squares: float
    df: int
    mean_square: float
    f_value: float | None
    p_value: float | None


class EffectResponse(BaseModel):
    factor_index: int
    factor_name: str
    effect: float
    coefficient: float
    sum_of_squares: float | None = None
    t_statistic: float | None = None
    p_value: float | None = None
    significant: bool | None = None


class InteractionResponse(BaseModel):
    factor_indices: list[int]
    factor_names: list[str]
    effect: float
    coefficient: float | None = None
    sum_of_squares: float | None = None
    t_statistic: float | None = None
    p_value: float | None = None
    significant: bool | None = None


class RegressionResponse(BaseModel):
    coefficients: dict[str, float]
    r_squared: float
    adj_r_squared: float
    optimal_settings: dict[str, float] | None = None


class ResidualStatsResponse(BaseModel):
    mean: float
    std: float
    min: float
    max: float


class NormalityTestResponse(BaseModel):
    statistic: float
    p_value: float
    method: str


class TaguchiANOMFactorResponse(BaseModel):
    factor_name: str
    level_means: dict[str, float]
    best_level: str
    best_level_value: float
    range: float
    rank: int


class TaguchiANOMResponse(BaseModel):
    sn_type: str
    response_table: list[TaguchiANOMFactorResponse]
    optimal_settings: dict[str, str]
    sn_ratios: list[float | None]


class DOEAnalysisResponse(BaseModel):
    id: int
    study_id: int
    grand_mean: float
    anova_table: list[ANOVARowResponse]
    effects: list[EffectResponse]
    interactions: list[InteractionResponse]
    r_squared: float
    adj_r_squared: float
    pred_r_squared: float | None = None
    lack_of_fit_f: float | None = None
    lack_of_fit_p: float | None = None
    regression: RegressionResponse | None = None
    taguchi_anom: TaguchiANOMResponse | None = None
    residuals: list[float] | None = None
    fitted_values: list[float] | None = None
    normality_test: NormalityTestResponse | None = None
    outlier_indices: list[int] | None = None
    residual_stats: ResidualStatsResponse | None = None
    computed_at: datetime
