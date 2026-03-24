"""Pydantic schemas for custom metadata field definitions (I8)."""

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator


_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
MAX_CUSTOM_FIELDS = 10


class CustomFieldDefinition(BaseModel):
    """Schema for a single custom metadata field definition.

    Stored as JSON array in characteristic.custom_fields_schema.

    Attributes:
        name: Machine-readable key (snake_case, max 50 chars)
        label: Human-readable display label (max 100 chars)
        field_type: Data type for validation and UI rendering
        required: Whether this field must be provided on every sample
        default_value: Default value applied when field is omitted
    """

    name: str = Field(..., min_length=1, max_length=50)
    label: str = Field(..., min_length=1, max_length=100)
    field_type: Literal["string", "number", "boolean"]
    required: bool = False
    default_value: str | float | bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not _NAME_PATTERN.match(v):
            raise ValueError(
                "Field name must be snake_case (lowercase letters, digits, underscores; must start with a letter)"
            )
        return v

    @field_validator("default_value")
    @classmethod
    def validate_default_matches_type(cls, v: str | float | bool | None, info) -> str | float | bool | None:
        if v is None:
            return v
        field_type = info.data.get("field_type")
        if field_type == "string" and not isinstance(v, str):
            raise ValueError("default_value must be a string for field_type 'string'")
        if field_type == "number" and not isinstance(v, (int, float)):
            raise ValueError("default_value must be a number for field_type 'number'")
        if field_type == "boolean" and not isinstance(v, bool):
            raise ValueError("default_value must be a boolean for field_type 'boolean'")
        return v
