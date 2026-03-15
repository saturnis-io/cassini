"""Plant API schemas."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class PlantCreate(BaseModel):
    """Schema for creating a new plant."""

    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=10, pattern=r"^[A-Z0-9_-]+$")
    is_active: bool = True
    settings: Optional[dict[str, Any]] = None
    capability_green_threshold: Optional[float] = Field(
        None, gt=0, description="Cpk threshold for green (good) status, default 1.33"
    )
    capability_yellow_threshold: Optional[float] = Field(
        None, gt=0, description="Cpk threshold for yellow (marginal) status, default 1.0"
    )


class PlantUpdate(BaseModel):
    """Schema for updating a plant.

    Note: is_active is NOT exposed here -- use the dedicated
    /plants/{id}/deactivate and /plants/{id}/reactivate endpoints
    to enforce compliance checks.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, min_length=1, max_length=10, pattern=r"^[A-Z0-9_-]+$")
    settings: Optional[dict[str, Any]] = None
    capability_green_threshold: Optional[float] = Field(
        None, gt=0, description="Cpk threshold for green (good) status"
    )
    capability_yellow_threshold: Optional[float] = Field(
        None, gt=0, description="Cpk threshold for yellow (marginal) status"
    )
    change_reason: str | None = Field(None, max_length=500, description="Reason for this change (21 CFR Part 11 audit trail)")


class PlantResponse(BaseModel):
    """Schema for plant response."""

    id: int
    name: str
    code: str
    is_active: bool
    settings: Optional[dict[str, Any]] = None
    capability_green_threshold: Optional[float] = None
    capability_yellow_threshold: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
