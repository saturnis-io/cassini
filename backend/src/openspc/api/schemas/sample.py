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

    Includes both backend-canonical field names and frontend-friendly aliases
    so the response works with either naming convention.

    Attributes:
        id: Unique identifier
        char_id: Characteristic ID (also available as characteristic_id)
        timestamp: When the sample was taken
        batch_number: Batch/lot identifier
        operator_id: Operator identifier
        is_excluded: Whether this sample is excluded (also available as excluded)
        measurements: List of measurement values
        mean: Calculated mean of measurements (X-bar)
        range_value: Calculated range (also available as range)
        actual_n: Actual number of measurements in this sample
        is_undersized: Whether sample has fewer measurements than expected
        effective_ucl: Per-point UCL for Mode B (variable limits)
        effective_lcl: Per-point LCL for Mode B (variable limits)
        z_score: Z-score for Mode A (standardized)
        is_modified: Whether this sample has been edited
        edit_count: Number of times this sample has been edited
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
    is_modified: bool = False
    edit_count: int = 0
    display_key: str = ""

    # Frontend-friendly alias fields
    characteristic_id: int | None = None
    excluded: bool | None = None

    model_config = ConfigDict(from_attributes=True)

    def model_post_init(self, __context: object) -> None:
        """Populate alias fields from canonical fields."""
        if self.characteristic_id is None:
            self.characteristic_id = self.char_id
        if self.excluded is None:
            self.excluded = self.is_excluded


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


class SampleUpdate(BaseModel):
    """Schema for updating sample measurements.

    Requires a reason for the change to maintain audit trail.

    Attributes:
        measurements: New list of measurement values
        reason: Required reason/description for the change
        edited_by: Optional identifier of who made the edit
    """

    measurements: list[float] = Field(
        ...,
        min_length=1,
        max_length=25,
        description="New measurement values for the sample",
    )
    reason: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Required reason for the change",
    )
    edited_by: str | None = Field(
        None,
        max_length=255,
        description="Identifier of who made the edit",
    )


class SampleEditHistoryResponse(BaseModel):
    """Schema for sample edit history entry.

    Attributes:
        id: Unique identifier
        sample_id: ID of the sample that was edited
        edited_at: When the edit was made
        edited_by: Who made the edit
        reason: Reason for the change
        previous_values: Previous measurement values
        new_values: New measurement values
        previous_mean: Previous calculated mean
        new_mean: New calculated mean
    """

    id: int
    sample_id: int
    edited_at: datetime
    edited_by: str | None
    reason: str
    previous_values: list[float]
    new_values: list[float]
    previous_mean: float
    new_mean: float

    model_config = ConfigDict(from_attributes=True)
