"""Pydantic schemas for API key management."""

from datetime import datetime
from typing import Optional

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class APIKeyCreate(BaseModel):
    """Request schema for creating an API key."""
    name: str = Field(..., min_length=1, max_length=255, description="Human-readable name")
    expires_at: Optional[datetime] = Field(None, description="Optional expiration date")
    rate_limit_per_minute: int = Field(60, ge=1, le=1000, description="Rate limit")
    scope: Literal["read-only", "read-write"] = Field("read-write", description="API key scope")
    plant_ids: Optional[list[int]] = Field(None, description="Restrict key to specific plant IDs (None = all plants)")

    @field_validator("plant_ids")
    @classmethod
    def validate_plant_ids(cls, v: list[int] | None) -> list[int] | None:
        if v is not None:
            if len(v) == 0:
                raise ValueError("plant_ids must be None (unrestricted) or a non-empty list")
            if any(pid <= 0 for pid in v):
                raise ValueError("plant_ids must contain only positive integers")
            if len(v) != len(set(v)):
                raise ValueError("plant_ids must not contain duplicates")
        return v


class APIKeyResponse(BaseModel):
    """Response schema for API key (without sensitive data)."""
    id: str
    name: str
    created_at: datetime
    expires_at: Optional[datetime]
    rate_limit_per_minute: int
    is_active: bool
    last_used_at: Optional[datetime]
    scope: str
    plant_ids: Optional[list[int]]

    model_config = {"from_attributes": True}


class APIKeyCreateResponse(BaseModel):
    """Response schema for newly created API key (includes the key once)."""
    id: str
    name: str
    key: str  # Only returned on creation!
    created_at: datetime
    expires_at: Optional[datetime]
    rate_limit_per_minute: int
    is_active: bool
    scope: str
    plant_ids: Optional[list[int]]


class APIKeyUpdate(BaseModel):
    """Request schema for updating an API key."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    is_active: Optional[bool] = None
    rate_limit_per_minute: Optional[int] = Field(None, ge=1, le=1000)
