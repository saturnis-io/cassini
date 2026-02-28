"""License status API endpoint.

Returns the current edition and feature entitlements.
No authentication required — needed for login page badging.
"""

from fastapi import APIRouter, Depends

from cassini.api.deps import get_license_service
from cassini.api.schemas.license import LicenseStatusResponse
from cassini.core.licensing import LicenseService

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
