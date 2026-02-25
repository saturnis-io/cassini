"""Pydantic schemas for Web Push notification endpoints."""

import urllib.parse
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class VAPIDKeyResponse(BaseModel):
    """VAPID public key for PushManager.subscribe()."""
    public_key: str


# Known push service origins (standard browser push gateways)
_ALLOWED_PUSH_ORIGINS = (
    "fcm.googleapis.com",
    "push.services.mozilla.com",
    "updates.push.services.mozilla.com",
    "notify.windows.com",
    "push.apple.com",
    "web.push.apple.com",
)


class PushSubscriptionCreate(BaseModel):
    """Request to register a push subscription."""
    endpoint: str = Field(..., min_length=1, max_length=500, description="Push service endpoint URL")
    p256dh_key: str = Field(..., min_length=1, max_length=255, description="Client public key (base64url)")
    auth_key: str = Field(..., min_length=1, max_length=255, description="Auth secret (base64url)")

    @field_validator("endpoint")
    @classmethod
    def validate_push_endpoint(cls, v: str) -> str:
        """Validate endpoint is HTTPS and belongs to a known push service (SSRF prevention)."""
        parsed = urllib.parse.urlparse(v)
        if parsed.scheme != "https":
            raise ValueError("Push endpoint must use HTTPS")
        hostname = parsed.hostname or ""
        if not any(hostname == origin or hostname.endswith(f".{origin}") for origin in _ALLOWED_PUSH_ORIGINS):
            raise ValueError("Push endpoint must be a recognized push service")
        return v


class PushSubscriptionResponse(BaseModel):
    """Response for a push subscription."""
    id: int
    user_id: int
    endpoint: str
    created_at: datetime

    model_config = {"from_attributes": True}
