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
    instance_id: str | None = None


class ActivationFileResponse(BaseModel):
    """Schema for the signed activation/deactivation envelope.

    21 CFR Part 11 §11.10(e): file is Ed25519-signed by the machine. The
    portal verifies the signature using the embedded public key. ``version``
    is bumped to 2 to signal the signed format — version<2 is rejected.
    """

    type: str  # "cassini-activation" or "cassini-deactivation"
    version: int
    licenseId: str
    instanceId: str
    timestamp: str
    # Signature envelope (added in v2)
    signature: str  # base64-encoded Ed25519 signature
    publicKey: str  # PEM-encoded Ed25519 public key
    signatureAlgorithm: str = "Ed25519"


class LicenseRemoveResponse(BaseModel):
    status: LicenseStatusResponse
    deactivation_file: ActivationFileResponse | None = None
    license_key: str | None = None


class LicenseUploadRequest(BaseModel):
    key: str
