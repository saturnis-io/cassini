"""Pydantic schemas for capability API endpoints."""

from pydantic import BaseModel


class CapabilityResponse(BaseModel):
    """Response schema for a capability calculation."""
    cp: float | None = None
    cpk: float | None = None
    pp: float | None = None
    ppk: float | None = None
    cpm: float | None = None
    sample_count: int
    normality_p_value: float | None = None
    normality_test: str
    is_normal: bool
    calculated_at: str
    usl: float | None = None
    lsl: float | None = None
    target: float | None = None
    sigma_within: float | None = None
    short_run_mode: str | None = None
    sigma_source: str | None = None
    sigma_method: str | None = None
    cp_unavailable_reason: str | None = None
    distribution_method_applied: str | None = None
    transform_applied: str | None = None
    # Z-bench and expected PPM (ISO 22514 / Montgomery 8th Ed. Section 8.2)
    z_bench_within: float | None = None
    z_bench_overall: float | None = None
    ppm_within_expected: float | None = None
    ppm_overall_expected: float | None = None
    # Process stability assessment (AIAG SPC Manual Ch. 3 Section 3.1)
    stability_warning: str | None = None
    recent_violation_count: int = 0
    # Bootstrap confidence intervals (optional, requested via include_ci=true)
    cpk_ci: tuple[float, float] | None = None
    ppk_ci: tuple[float, float] | None = None
    pp_ci: tuple[float, float] | None = None
    ci_confidence: float | None = None
    ci_method: str | None = None
    n_bootstrap: int | None = None


class CapabilityHistoryItem(BaseModel):
    """Response schema for a single history snapshot."""
    id: int
    cp: float | None = None
    cpk: float | None = None
    pp: float | None = None
    ppk: float | None = None
    cpm: float | None = None
    sample_count: int
    normality_p_value: float | None = None
    normality_test: str | None = None
    calculated_at: str
    calculated_by: str


class SnapshotResponse(BaseModel):
    """Response after saving a capability snapshot."""
    id: int
    capability: CapabilityResponse
