"""License API endpoints.

GET  /status  — returns current edition and feature entitlements (no auth).
POST /upload  — upload a new license key JWT (admin only).
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from cassini.api.deps import get_current_admin, get_license_service
from cassini.api.schemas.license import LicenseStatusResponse, LicenseUploadRequest
from cassini.core.licensing import LicenseService
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/license", tags=["license"])


@router.get("/status", response_model=LicenseStatusResponse)
async def get_license_status(
    license_service: LicenseService = Depends(get_license_service),
) -> LicenseStatusResponse:
    """Get current license status.

    Returns edition type, tier, plant limits, and expiry info.
    No authentication required.
    """
    return LicenseStatusResponse(**license_service.status())


@router.post("/upload", response_model=LicenseStatusResponse)
async def upload_license(
    request: Request,
    body: LicenseUploadRequest,
    license_service: LicenseService = Depends(get_license_service),
    _user: User = Depends(get_current_admin),
) -> LicenseStatusResponse:
    """Upload a new license key.

    Validates the JWT signature against the bundled public key,
    saves it to disk, and reloads the license service.
    Admin privileges required.
    """
    try:
        license_service.reload(body.key)
    except ValueError as exc:
        logger.warning("license_upload_rejected", reason=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid license key",
        )

    logger.info(
        "license_uploaded",
        edition=license_service.edition,
        tier=license_service.tier,
    )

    request.state.audit_context = {
        "resource_type": "license",
        "resource_id": None,
        "action": "upload",
        "summary": "License key uploaded",
        "fields": {
            "edition": license_service.edition,
            "tier": license_service.tier,
        },
    }

    return LicenseStatusResponse(**license_service.status())
