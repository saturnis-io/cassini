"""Pydantic schemas for non-normal distribution analysis."""

from pydantic import BaseModel


class NonNormalCapabilityRequest(BaseModel):
    """Request body for non-normal capability calculation."""

    method: str = "auto"  # "auto", "normal", "box_cox", "percentile", "distribution_fit"


class QQPointsSchema(BaseModel):
    """Q-Q plot points computed using Blom plotting positions."""

    sample_quantiles: list[float]
    theoretical_quantiles: list[float]


class HistogramSchema(BaseModel):
    """Pre-computed histogram from actual measurement data."""

    bin_edges: list[float]  # n+1 edges
    counts: list[int]  # n bin counts
    density: list[float]  # n density values (count / (N * bin_width))


class DistributionFitResultSchema(BaseModel):
    """Schema for a single distribution fit result."""

    family: str
    parameters: dict[str, float]
    ad_statistic: float
    ad_p_value: float | None = None
    aic: float
    is_adequate_fit: bool
    gof_test_type: str = "anderson_darling"  # "anderson_darling" or "kolmogorov_smirnov"
    qq_points: QQPointsSchema | None = None


class NonNormalCapabilityResponse(BaseModel):
    """Response schema for non-normal capability calculation."""

    cp: float | None = None
    cpk: float | None = None
    pp: float | None = None
    ppk: float | None = None
    cpm: float | None = None
    method: str
    method_detail: str
    normality_p_value: float | None = None
    normality_test: str
    is_normal: bool
    fitted_distribution: DistributionFitResultSchema | None = None
    percentile_pp: float | None = None
    percentile_ppk: float | None = None
    p0_135: float | None = None
    p50: float | None = None
    p99_865: float | None = None
    sample_count: int
    calculated_at: str
    histogram: HistogramSchema | None = None
    qq_points: QQPointsSchema | None = None


class DistributionFitResponse(BaseModel):
    """Response schema for distribution fitting endpoint."""

    fits: list[DistributionFitResultSchema]
    best_fit: DistributionFitResultSchema | None = None
    recommendation: str


class DistributionConfigUpdate(BaseModel):
    """Request body for updating distribution config on a characteristic."""

    distribution_method: str | None = None
    box_cox_lambda: float | None = None
    distribution_params: dict | None = None
