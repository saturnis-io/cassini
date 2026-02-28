"""Pydantic schemas for license status endpoint."""

from pydantic import BaseModel


class LicenseStatusResponse(BaseModel):
    edition: str
    tier: str
    max_plants: int
    expires_at: str | None = None
    days_until_expiry: int | None = None
    is_expired: bool | None = None
