"""Schemas for system settings API."""

from datetime import datetime

from pydantic import BaseModel, Field


class SystemSettingsResponse(BaseModel):
    """Response schema for system settings."""

    model_config = {"from_attributes": True}

    date_format: str
    datetime_format: str
    updated_at: datetime


class SystemSettingsUpdate(BaseModel):
    """Update schema for system settings."""

    date_format: str | None = Field(None, max_length=50)
    datetime_format: str | None = Field(None, max_length=50)
