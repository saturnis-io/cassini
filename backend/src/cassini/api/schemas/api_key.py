"""Pydantic schemas for API key management."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class APIKeyCreate(BaseModel):
    """Request schema for creating an API key."""
    name: str = Field(..., min_length=1, max_length=255, description="Human-readable name")
    expires_at: Optional[datetime] = Field(None, description="Optional expiration date")
    rate_limit_per_minute: int = Field(60, ge=1, le=1000, description="Rate limit")


class APIKeyResponse(BaseModel):
    """Response schema for API key (without sensitive data)."""
    id: str
    name: str
    created_at: datetime
    expires_at: Optional[datetime]
    rate_limit_per_minute: int
    is_active: bool
    last_used_at: Optional[datetime]

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


class APIKeyUpdate(BaseModel):
    """Request schema for updating an API key."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    is_active: Optional[bool] = None
    rate_limit_per_minute: Optional[int] = Field(None, ge=1, le=1000)
