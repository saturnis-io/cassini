"""Pydantic schemas for plant compliance endpoints."""

from pydantic import BaseModel


class PlantComplianceInfoResponse(BaseModel):
    """Per-plant compliance information."""

    plant_id: int
    plant_name: str
    plant_code: str
    is_active: bool
    characteristic_count: int
    sample_count: int


class ComplianceStatusResponse(BaseModel):
    """Overall compliance status response."""

    max_plants: int
    active_plant_count: int
    total_plant_count: int
    excess: int
    plants: list[PlantComplianceInfoResponse]
