"""Pydantic schemas for Annotation operations."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing_extensions import Self


class AnnotationCreate(BaseModel):
    """Schema for creating a new annotation.

    Point annotations require a sample_id.
    Period annotations require start_time and end_time (time-based range).
    """

    annotation_type: Literal["point", "period"]
    text: str = Field(..., min_length=1, max_length=500)
    color: str | None = None
    # Point annotations
    sample_id: int | None = None
    # Period annotations (time-based)
    start_time: datetime | None = None
    end_time: datetime | None = None

    @model_validator(mode="after")
    def validate_annotation_fields(self) -> Self:
        """Validate that the correct fields are provided based on type."""
        if self.annotation_type == "point":
            if self.sample_id is None:
                raise ValueError("sample_id is required for point annotations")
            if self.start_time is not None or self.end_time is not None:
                raise ValueError(
                    "start_time and end_time must be null for point annotations"
                )
        elif self.annotation_type == "period":
            if self.start_time is None or self.end_time is None:
                raise ValueError(
                    "start_time and end_time are required for period annotations"
                )
            if self.start_time >= self.end_time:
                raise ValueError("start_time must be before end_time")
            if self.sample_id is not None:
                raise ValueError("sample_id must be null for period annotations")
        return self


class AnnotationUpdate(BaseModel):
    """Schema for updating an existing annotation.

    Attributes:
        text: New annotation text
        color: New display color
    """

    text: str | None = Field(None, min_length=1, max_length=500)
    color: str | None = None


class AnnotationHistoryResponse(BaseModel):
    """Schema for an annotation history entry."""

    id: int
    previous_text: str
    changed_by: str | None
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnnotationResponse(BaseModel):
    """Schema for annotation response."""

    id: int
    characteristic_id: int
    annotation_type: str
    text: str
    color: str | None
    sample_id: int | None
    start_sample_id: int | None
    end_sample_id: int | None
    start_time: datetime | None
    end_time: datetime | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    history: list[AnnotationHistoryResponse] = []

    model_config = ConfigDict(from_attributes=True)
