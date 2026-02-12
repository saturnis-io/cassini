"""Pydantic schemas for retention policy operations."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing_extensions import Self


class RetentionTypeEnum(str, Enum):
    """Supported retention types."""

    FOREVER = "forever"
    SAMPLE_COUNT = "sample_count"
    TIME_DELTA = "time_delta"


class RetentionUnitEnum(str, Enum):
    """Supported time units for time_delta retention."""

    DAYS = "days"
    WEEKS = "weeks"
    MONTHS = "months"
    YEARS = "years"


class RetentionPolicySet(BaseModel):
    """Schema for setting a retention policy (create or update)."""

    retention_type: RetentionTypeEnum
    retention_value: int | None = Field(
        None, ge=1, description="Count or delta amount (required for sample_count and time_delta)"
    )
    retention_unit: RetentionUnitEnum | None = Field(
        None, description="Time unit (required for time_delta, must be null otherwise)"
    )

    @model_validator(mode="after")
    def validate_type_value_unit(self) -> Self:
        """Validate that value and unit match the retention type."""
        if self.retention_type == RetentionTypeEnum.FOREVER:
            if self.retention_value is not None:
                raise ValueError("retention_value must be null for 'forever' type")
            if self.retention_unit is not None:
                raise ValueError("retention_unit must be null for 'forever' type")
        elif self.retention_type == RetentionTypeEnum.SAMPLE_COUNT:
            if self.retention_value is None:
                raise ValueError("retention_value is required for 'sample_count' type")
            if self.retention_unit is not None:
                raise ValueError("retention_unit must be null for 'sample_count' type")
        elif self.retention_type == RetentionTypeEnum.TIME_DELTA:
            if self.retention_value is None:
                raise ValueError("retention_value is required for 'time_delta' type")
            if self.retention_unit is None:
                raise ValueError("retention_unit is required for 'time_delta' type")
        return self


class RetentionPolicyResponse(BaseModel):
    """Schema for a retention policy response."""

    id: int
    plant_id: int
    scope: str
    hierarchy_id: int | None
    characteristic_id: int | None
    retention_type: str
    retention_value: int | None
    retention_unit: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EffectiveRetentionResponse(BaseModel):
    """Schema for the resolved effective retention policy.

    Shows which policy is in effect and where it was inherited from.
    """

    retention_type: str
    retention_value: int | None
    retention_unit: str | None
    source: str = Field(
        description="Where the policy comes from: 'characteristic', 'hierarchy', 'global', or 'default'"
    )
    source_id: int | None = Field(
        description="ID of the source entity (characteristic_id, hierarchy_id, or plant_id)"
    )
    source_name: str | None = Field(
        description="Name of the source hierarchy node (if applicable)"
    )


class RetentionOverrideResponse(BaseModel):
    """Schema for a retention override in list views."""

    id: int
    scope: str
    hierarchy_id: int | None
    characteristic_id: int | None
    hierarchy_name: str | None = None
    characteristic_name: str | None = None
    retention_type: str
    retention_value: int | None
    retention_unit: str | None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PurgeHistoryResponse(BaseModel):
    """Schema for a purge history record."""

    id: int
    plant_id: int
    started_at: datetime
    completed_at: datetime | None
    status: str
    samples_deleted: int
    violations_deleted: int
    characteristics_processed: int
    error_message: str | None

    model_config = ConfigDict(from_attributes=True)


class NextPurgeResponse(BaseModel):
    """Schema for next scheduled purge information."""

    next_run_at: datetime | None
    interval_hours: float
    last_run: PurgeHistoryResponse | None
