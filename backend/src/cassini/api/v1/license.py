"""License management API endpoints.

Provides license status, compliance, upload, and removal endpoints.
"""

import structlog

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_admin, get_current_user, get_db_session, get_license_service
from cassini.api.schemas.compliance import ComplianceStatusResponse, PlantComplianceInfoResponse
from cassini.api.schemas.license import (
    ActivationFileResponse,
    LicenseRemoveResponse,
    LicenseStatusResponse,
    LicenseUploadRequest,
)
from cassini.core.licensing import LicenseService
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/license", tags=["license"])


@router.get("/status", response_model=LicenseStatusResponse)
async def get_license_status(
    request: Request,
    license_service: LicenseService = Depends(get_license_service),
) -> LicenseStatusResponse:
    """Get current license status.

    Anonymous callers receive tier and max_plants only.
    Authenticated admins receive full details including instance_id
    and expires_at.
    """
    full_status = license_service.status()

    # Check if caller is an authenticated admin
    is_admin = False
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            from cassini.core.auth.jwt import decode_access_token
            from cassini.db.database import get_database
            from cassini.db.models.user import User as UserModel, UserRole
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload

            token = auth_header.split(" ", 1)[1]
            payload = decode_access_token(token)
            user_id = int(payload.get("sub", 0))
            if user_id:
                db = get_database()
                async with db.session() as session:
                    stmt = (
                        select(UserModel)
                        .options(selectinload(UserModel.plant_roles))
                        .where(UserModel.id == user_id, UserModel.is_active == True)  # noqa: E712
                    )
                    result = await session.execute(stmt)
                    user = result.scalar_one_or_none()
                    if user:
                        is_admin = any(pr.role == UserRole.admin for pr in user.plant_roles)
        except Exception:
            pass

    if not is_admin:
        # Strip sensitive fields for anonymous callers
        full_status.pop("instance_id", None)
        full_status.pop("expires_at", None)

    return LicenseStatusResponse(**full_status)


@router.post("/activate", response_model=LicenseStatusResponse)
async def activate_license(
    body: LicenseUploadRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    license_service: LicenseService = Depends(get_license_service),
    _user: User = Depends(get_current_admin),
) -> LicenseStatusResponse:
    """Upload and activate a license key.

    Admin-only. Validates the JWT against the bundled public key,
    persists it to data/license.key, and activates commercial features
    if not already active.
    """
    try:
        license_service.activate_from_token(body.key)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Activate commercial features if this is the first valid license
    if license_service.is_commercial:
        from cassini.core.commercial import activate_commercial_features

        tier = license_service.tier
        routers = (
            request.app.state.pro_routers + request.app.state.enterprise_routers
            if license_service.is_enterprise
            else request.app.state.pro_routers
        )
        await activate_commercial_features(
            request.app,
            routers,
            request.app.state.db,
            request.app.state.event_bus,
            tier=tier,
        )

    # Refresh compliance cache
    from cassini.core.compliance import refresh_compliance_cache

    await refresh_compliance_cache(request.app, session)

    # Set audit context
    request.state.audit_context = {
        "resource_type": "license",
        "action": "activate",
        "summary": f"License activated: {license_service.tier} edition",
    }

    logger.info("license_activated", tier=license_service.tier)
    return LicenseStatusResponse(**license_service.status())


@router.get("/compliance", response_model=ComplianceStatusResponse)
async def get_compliance(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    license_service: LicenseService = Depends(get_license_service),
    _user: User = Depends(get_current_user),
) -> ComplianceStatusResponse:
    """Get current plant compliance status.

    Returns how many active plants exist vs. the license limit,
    along with per-plant statistics.
    """
    from cassini.core.compliance import get_compliance_status

    cs = await get_compliance_status(session, license_service)
    return ComplianceStatusResponse(
        max_plants=cs.max_plants,
        active_plant_count=cs.active_plant_count,
        total_plant_count=cs.total_plant_count,
        excess=cs.excess,
        plants=[
            PlantComplianceInfoResponse(
                plant_id=p.plant_id,
                plant_name=p.plant_name,
                plant_code=p.plant_code,
                is_active=p.is_active,
                characteristic_count=p.characteristic_count,
                sample_count=p.sample_count,
            )
            for p in cs.plants
        ],
    )


@router.get("/activation-file", response_model=ActivationFileResponse)
async def get_activation_file(
    license_service: LicenseService = Depends(get_license_service),
    _user: User = Depends(get_current_admin),
) -> ActivationFileResponse:
    """Generate an activation file for offline portal registration.

    Admin-only. Returns JSON the operator saves and uploads to saturnis.io portal.
    """
    try:
        data = license_service.generate_activation_file()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    return ActivationFileResponse(**data)


@router.delete(
    "",
    response_model=LicenseRemoveResponse,
    status_code=status.HTTP_200_OK,
)
async def remove_license(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    license_service: LicenseService = Depends(get_license_service),
    _user: User = Depends(get_current_admin),
) -> LicenseRemoveResponse:
    """Remove the active license and revert to Community Edition.

    Admin-only. Cannot be used when running in dev-commercial mode.
    Returns deactivation file data for offline portal notification.
    """
    # Capture the raw key and deactivation file BEFORE clearing
    raw_key = license_service.raw_key
    deactivation_file_data = license_service.generate_deactivation_file()

    try:
        license_service.clear()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove license in dev-commercial mode",
        )

    # Refresh compliance cache
    from cassini.core.compliance import refresh_compliance_cache

    await refresh_compliance_cache(request.app, session)

    # Set audit context
    request.state.audit_context = {
        "resource_type": "license",
        "action": "remove",
        "summary": "License removed, reverted to Community Edition",
    }

    logger.info("license_removed")
    status_response = LicenseStatusResponse(**license_service.status())
    deactivation_file = (
        ActivationFileResponse(**deactivation_file_data)
        if deactivation_file_data
        else None
    )
    return LicenseRemoveResponse(
        status=status_response,
        deactivation_file=deactivation_file,
        license_key=raw_key,
    )
