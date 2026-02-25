"""Pydantic schemas for notification API endpoints."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# -- SMTP --

class SmtpConfigResponse(BaseModel):
    """SMTP config response (password masked)."""
    id: int
    server: str
    port: int
    username: Optional[str] = None
    password_set: bool = False
    use_tls: bool = True
    from_address: str
    is_active: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SmtpConfigUpdate(BaseModel):
    """Create or update SMTP config."""
    server: str = Field(..., max_length=255)
    port: int = Field(587, ge=1, le=65535)
    username: Optional[str] = Field(None, max_length=255)
    password: Optional[str] = Field(None, max_length=255)
    use_tls: bool = True
    from_address: str = Field(..., max_length=255)
    is_active: bool = False


# -- Webhooks --

class WebhookConfigResponse(BaseModel):
    """Webhook config response (secret masked)."""
    id: int
    name: str
    url: str
    has_secret: bool = False
    is_active: bool = True
    retry_count: int = 3
    events_filter: Optional[list[str]] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WebhookConfigCreate(BaseModel):
    """Create a webhook config."""
    name: str = Field(..., max_length=100)
    url: str = Field(..., max_length=500)
    secret: Optional[str] = Field(None, max_length=255)
    is_active: bool = True
    retry_count: int = Field(3, ge=0, le=10)
    events_filter: Optional[list[str]] = None


class WebhookConfigUpdate(BaseModel):
    """Update a webhook config."""
    name: Optional[str] = Field(None, max_length=100)
    url: Optional[str] = Field(None, max_length=500)
    secret: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    retry_count: Optional[int] = Field(None, ge=0, le=10)
    events_filter: Optional[list[str]] = None


# -- User preferences --

class NotificationPreferenceItem(BaseModel):
    """Single preference item."""
    event_type: str
    channel: str
    is_enabled: bool = True


class NotificationPreferenceResponse(BaseModel):
    """User preference response."""
    id: int
    event_type: str
    channel: str
    is_enabled: bool

    model_config = {"from_attributes": True}


class NotificationPreferenceUpdate(BaseModel):
    """Bulk update of user preferences."""
    preferences: list[NotificationPreferenceItem]
