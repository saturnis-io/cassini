"""Pydantic schemas for Annotation operations."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing_extensions import Self


class AnnotationCreate(BaseModel):
    """Schema for creating a new annotation.

    Attributes:
        annotation_type: Either 'point' (single sample) or 'period' (sample range)
        text: Annotation text content
        color: Optional hex color string (e.g., '#ff6b6b')
        sample_id: Sample ID for point annotations
        start_sample_id: Start sample ID for period annotations
        end_sample_id: End sample ID for period annotations
    """

    annotation_type: Literal["point", "period"]
    text: str = Field(..., min_length=1, max_length=500)
    color: str | None = None
    sample_id: int | None = None
    start_sample_id: int | None = None
    end_sample_id: int | None = None

    @model_validator(mode="after")
    def validate_annotation_fields(self) -> Self:
        """Validate that the correct fields are provided based on type."""
        if self.annotation_type == "point":
            if self.sample_id is None:
                raise ValueError("sample_id is required for point annotations")
            if self.start_sample_id is not None or self.end_sample_id is not None:
                raise ValueError(
                    "start_sample_id and end_sample_id must be null for point annotations"
                )
        elif self.annotation_type == "period":
            if self.start_sample_id is None or self.end_sample_id is None:
                raise ValueError(
                    "start_sample_id and end_sample_id are required for period annotations"
                )
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


class AnnotationResponse(BaseModel):
    """Schema for annotation response.

    Attributes:
        id: Unique identifier
        characteristic_id: Parent characteristic ID
        annotation_type: 'point' or 'period'
        text: Annotation text content
        color: Display color (hex)
        sample_id: Sample ID for point annotations
        start_sample_id: Start sample ID for period annotations
        end_sample_id: End sample ID for period annotations
        created_by: Username of creator
        created_at: Creation timestamp
        updated_at: Last update timestamp
    """

    id: int
    characteristic_id: int
    annotation_type: str
    text: str
    color: str | None
    sample_id: int | None
    start_sample_id: int | None
    end_sample_id: int | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
