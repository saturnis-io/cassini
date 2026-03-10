"""Pydantic schemas for license endpoints."""

from pydantic import BaseModel


class LicenseStatusResponse(BaseModel):
    edition: str
    tier: str
    max_plants: int
    expires_at: str | None = None
    days_until_expiry: int | None = None
    is_expired: bool | None = None
    license_name: str | None = None
    licensed_tier: str | None = None


class ActivationFileResponse(BaseModel):
    type: str  # "cassini-activation" or "cassini-deactivation"
    version: int
    licenseId: str
    instanceId: str
    timestamp: str


class LicenseRemoveResponse(BaseModel):
    status: LicenseStatusResponse
    deactivation_file: ActivationFileResponse | None = None


class LicenseUploadRequest(BaseModel):
    key: str
