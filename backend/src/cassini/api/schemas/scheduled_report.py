"""Pydantic schemas for scheduled report operations."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class FrequencyEnum(str, Enum):
    """Supported report frequencies."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class ScopeTypeEnum(str, Enum):
    """Supported report scope types."""

    PLANT = "plant"
    HIERARCHY = "hierarchy"
    CHARACTERISTIC = "characteristic"


class ReportScheduleCreate(BaseModel):
    """Schema for creating a new report schedule."""

    name: str = Field(..., min_length=1, max_length=100)
    template_id: str = Field(..., min_length=1, max_length=50)
    scope_type: ScopeTypeEnum
    scope_id: int | None = Field(None, description="ID of hierarchy or characteristic (null for plant-wide)")
    frequency: FrequencyEnum
    hour: int = Field(6, ge=0, le=23, description="Hour of day UTC (0-23)")
    day_of_week: int | None = Field(None, ge=0, le=6, description="0=Monday..6=Sunday (for weekly)")
    day_of_month: int | None = Field(None, ge=1, le=31, description="Day of month (for monthly)")
    recipients: list[str] = Field(..., min_length=1, description="Email addresses")
    window_days: int = Field(7, ge=1, le=365, description="Days of data to include")
    is_active: bool = True
    plant_id: int = Field(..., description="Plant ID")

    @field_validator("recipients")
    @classmethod
    def validate_recipients(cls, v: list[str]) -> list[str]:
        """Validate that recipients contains valid email-like strings."""
        for email in v:
            if "@" not in email or "." not in email:
                raise ValueError(f"Invalid email address: {email}")
        return v


class ReportScheduleUpdate(BaseModel):
    """Schema for updating an existing report schedule."""

    name: str | None = Field(None, min_length=1, max_length=100)
    template_id: str | None = Field(None, min_length=1, max_length=50)
    scope_type: ScopeTypeEnum | None = None
    scope_id: int | None = None
    frequency: FrequencyEnum | None = None
    hour: int | None = Field(None, ge=0, le=23)
    day_of_week: int | None = Field(None, ge=0, le=6)
    day_of_month: int | None = Field(None, ge=1, le=31)
    recipients: list[str] | None = Field(None, min_length=1)
    window_days: int | None = Field(None, ge=1, le=365)
    is_active: bool | None = None

    @field_validator("recipients")
    @classmethod
    def validate_recipients(cls, v: list[str] | None) -> list[str] | None:
        """Validate that recipients contains valid email-like strings."""
        if v is not None:
            for email in v:
                if "@" not in email or "." not in email:
                    raise ValueError(f"Invalid email address: {email}")
        return v


class ReportScheduleResponse(BaseModel):
    """Schema for a report schedule response."""

    id: int
    plant_id: int
    name: str
    template_id: str
    scope_type: str
    scope_id: int | None
    frequency: str
    hour: int
    day_of_week: int | None
    day_of_month: int | None
    recipients: list[str]
    window_days: int
    is_active: bool
    last_run_at: datetime | None
    created_by: int | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("recipients", mode="before")
    @classmethod
    def parse_recipients(cls, v):
        """Parse recipients from JSON string if stored as text."""
        if isinstance(v, str):
            import json

            return json.loads(v)
        return v


class ReportRunResponse(BaseModel):
    """Schema for a report run response."""

    id: int
    schedule_id: int
    started_at: datetime
    completed_at: datetime | None
    status: str
    error_message: str | None
    recipients_count: int
    pdf_size_bytes: int | None

    model_config = ConfigDict(from_attributes=True)
