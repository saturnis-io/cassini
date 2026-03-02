"""Pydantic schemas for product limit operations."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProductLimitCreate(BaseModel):
    """Schema for creating a product limit override."""

    product_code: str = Field(..., min_length=1, max_length=100)
    ucl: float | None = None
    lcl: float | None = None
    stored_sigma: float | None = None
    stored_center_line: float | None = None
    target_value: float | None = None
    usl: float | None = None
    lsl: float | None = None

    @field_validator("product_code")
    @classmethod
    def normalize_product_code(cls, v: str) -> str:
        return v.strip().upper()


class ProductLimitUpdate(BaseModel):
    """Schema for updating a product limit override. All fields optional."""

    ucl: float | None = None
    lcl: float | None = None
    stored_sigma: float | None = None
    stored_center_line: float | None = None
    target_value: float | None = None
    usl: float | None = None
    lsl: float | None = None


class ProductLimitResponse(BaseModel):
    """Schema for product limit response."""

    id: int
    characteristic_id: int
    product_code: str
    ucl: float | None
    lcl: float | None
    stored_sigma: float | None
    stored_center_line: float | None
    target_value: float | None
    usl: float | None
    lsl: float | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
