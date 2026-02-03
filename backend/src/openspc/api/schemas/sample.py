"""Pydantic schemas for Sample operations.

Schemas for SPC sample data collection and management.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SampleCreate(BaseModel):
    """Schema for creating a new sample.

    Attributes:
        characteristic_id: ID of the characteristic being measured
        measurements: List of measurement values (length must match subgroup_size)
        batch_number: Optional batch/lot identifier
        operator_id: Optional operator identifier
    """

    characteristic_id: int
    measurements: list[float] = Field(
        ...,
        min_length=1,
        max_length=25,
        description="List of measurement values",
    )
    batch_number: str | None = None
    operator_id: str | None = None


class SampleResponse(BaseModel):
    """Schema for sample response.

    Attributes:
        id: Unique identifier
        char_id: Characteristic ID
        timestamp: When the sample was taken
        batch_number: Batch/lot identifier
        operator_id: Operator identifier
        is_excluded: Whether this sample is excluded from control limit calculations
        measurements: List of measurement values
        mean: Calculated mean of measurements (X-bar)
        range_value: Calculated range (max - min) for R chart
        actual_n: Actual number of measurements in this sample
        is_undersized: Whether sample has fewer measurements than expected
        effective_ucl: Per-point UCL for Mode B (variable limits)
        effective_lcl: Per-point LCL for Mode B (variable limits)
        z_score: Z-score for Mode A (standardized)
    """

    id: int
    char_id: int
    timestamp: datetime
    batch_number: str | None
    operator_id: str | None
    is_excluded: bool
    measurements: list[float]
    mean: float
    range_value: float | None
    actual_n: int = 1
    is_undersized: bool = False
    effective_ucl: float | None = None
    effective_lcl: float | None = None
    z_score: float | None = None

    model_config = ConfigDict(from_attributes=True)


class SampleExclude(BaseModel):
    """Schema for excluding/including a sample.

    Used to mark outlier samples that should not be used in control limit calculations.

    Attributes:
        is_excluded: Whether to exclude the sample
        reason: Optional reason for exclusion
    """

    is_excluded: bool
    reason: str | None = Field(
        None,
        description="Reason for excluding the sample",
    )
