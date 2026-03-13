"""Pydantic schemas for report analytics endpoints."""

from pydantic import BaseModel


class CharacteristicHealthItem(BaseModel):
    """Health metrics for a single characteristic."""
    characteristic_id: int
    name: str
    hierarchy_path: str
    data_type: str
    cpk: float | None = None
    ppk: float | None = None
    in_control_pct: float
    sample_count: int
    violation_count: int
    unacknowledged_count: int
    risk_score: float
    health_status: str  # 'good' | 'warning' | 'critical'
    last_sample_at: str | None = None


class HealthSummaryResponse(BaseModel):
    """Aggregate health summary across all characteristics."""
    good_count: int
    warning_count: int
    critical_count: int
    avg_cpk: float | None = None
    worst_characteristic: str | None = None
    worst_cpk: float | None = None


class PlantHealthResponse(BaseModel):
    """Full plant health analytics response."""
    plant_id: int
    plant_name: str
    generated_at: str
    window_days: int
    total_characteristics: int
    summary: HealthSummaryResponse
    characteristics: list[CharacteristicHealthItem]
