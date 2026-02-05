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


class PlantUpdate(BaseModel):
    """Schema for updating a plant."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, min_length=1, max_length=10, pattern=r"^[A-Z0-9_-]+$")
    is_active: Optional[bool] = None
    settings: Optional[dict[str, Any]] = None


class PlantResponse(BaseModel):
    """Schema for plant response."""

    id: int
    name: str
    code: str
    is_active: bool
    settings: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
