"""Plant REST API endpoints."""

import structlog

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_user, get_current_admin, get_db_session, get_license_service
from cassini.api.schemas.plant import PlantCreate, PlantResponse, PlantUpdate
from cassini.core.licensing import LicenseService
from cassini.db.models.user import User, UserPlantRole, UserRole
from cassini.db.repositories.plant import PlantRepository
from cassini.db.repositories.user import UserRepository

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/plants", tags=["plants"])


async def get_plant_repo(
    session: AsyncSession = Depends(get_db_session),
) -> PlantRepository:
    """Dependency to get PlantRepository instance."""
    return PlantRepository(session)


@router.get("/", response_model=list[PlantResponse])
async def list_plants(
    active_only: bool = Query(False, description="Only return active plants"),
    repo: PlantRepository = Depends(get_plant_repo),
    _user: User = Depends(get_current_user),
) -> list[PlantResponse]:
    """List all plants.

    Returns all plants in the system, optionally filtered to only active ones.
    """
    plants = await repo.get_all(active_only=active_only)
    return [PlantResponse.model_validate(p) for p in plants]


@router.post("/", response_model=PlantResponse, status_code=status.HTTP_201_CREATED)
async def create_plant(
    data: PlantCreate,
    repo: PlantRepository = Depends(get_plant_repo),
    _user: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db_session),
    license_service: LicenseService = Depends(get_license_service),
) -> PlantResponse:
    """Create a new plant.

    Creates a new plant/site for data isolation. The code is automatically
    uppercased and must be unique. All admin users are automatically assigned
    admin role for the new plant.
    """
    # Enforce plant limit from license (only count active plants)
    existing_plants = await repo.get_all(active_only=True)
    if len(existing_plants) >= license_service.max_plants:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Plant limit reached ({license_service.max_plants}). Upgrade your license for more plants.",
        )

    try:
        plant = await repo.create(
            name=data.name,
            code=data.code,
            is_active=data.is_active,
            settings=data.settings,
        )

        # Auto-assign admin role for all admin-level users
        user_repo = UserRepository(session)
        all_users = await user_repo.get_all()
        admin_count = 0
        for user in all_users:
            for pr in user.plant_roles:
                if pr.role == UserRole.admin:
                    # This user is admin somewhere -- give them admin on the new plant
                    await user_repo.assign_plant_role(user.id, plant.id, UserRole.admin)
                    admin_count += 1
                    break
        if admin_count > 0:
            logger.info("auto_assigned_admins", count=admin_count, plant=plant.name)

        return PlantResponse.model_validate(plant)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Plant with this name or code already exists",
        )


# --- Static sub-resource routes BEFORE /{plant_id} parameter routes ---


class LogoPayload(BaseModel):
    """Schema for plant logo upload (base64 data URL)."""
    logo_url: str = Field(..., max_length=2_000_000, description="Base64-encoded data URL of the plant logo image")


class LogoResponse(BaseModel):
    """Schema for plant logo response."""
    logo_url: str | None = None


@router.get("/{plant_id}/logo", response_model=LogoResponse)
async def get_plant_logo(
    plant_id: int,
    repo: PlantRepository = Depends(get_plant_repo),
    _user: User = Depends(get_current_user),
) -> LogoResponse:
    """Get the plant logo.

    Returns the logo as a base64 data URL, separate from the default
    Plant response to avoid bloating list queries.
    """
    plant = await repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found",
        )
    return LogoResponse(logo_url=plant.logo_url)


@router.put("/{plant_id}/logo", response_model=LogoResponse)
async def update_plant_logo(
    plant_id: int,
    data: LogoPayload,
    request: Request,
    repo: PlantRepository = Depends(get_plant_repo),
    _user: User = Depends(get_current_admin),
) -> LogoResponse:
    """Upload/update the plant logo.

    Accepts a base64-encoded data URL. Stored directly in the DB column.
    """
    plant = await repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found",
        )

    plant = await repo.update(plant_id, logo_url=data.logo_url)

    request.state.audit_context = {
        "resource_type": "plant",
        "resource_id": plant_id,
        "action": "update",
        "summary": f"Plant '{plant.name}' logo updated",
    }

    return LogoResponse(logo_url=plant.logo_url)


@router.post(
    "/{plant_id}/deactivate",
    response_model=PlantResponse,
    status_code=status.HTTP_200_OK,
)
async def deactivate_plant(
    plant_id: int,
    request: Request,
    repo: PlantRepository = Depends(get_plant_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_admin),
) -> PlantResponse:
    """Deactivate a plant.

    Marks a plant as inactive. Inactive plants do not count toward the
    license plant limit and their MQTT data ingestion is paused.
    The Default plant cannot be deactivated.
    """
    plant = await repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found",
        )

    if plant.code == "DEFAULT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate the Default plant",
        )

    if not plant.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plant is already inactive",
        )

    plant = await repo.update(plant_id, is_active=False)

    # Refresh compliance cache
    from cassini.core.compliance import refresh_compliance_cache

    await refresh_compliance_cache(request.app, session)

    # Update MQTT tag provider if available
    tag_mgr = getattr(request.app.state, "tag_provider_manager", None)
    if tag_mgr is not None and hasattr(tag_mgr, "reload_plant_status"):
        inactive_ids = await _get_inactive_plant_ids(repo)
        tag_mgr.reload_plant_status(inactive_ids)

    # Audit context
    request.state.audit_context = {
        "resource_type": "plant",
        "resource_id": plant_id,
        "action": "deactivate",
        "summary": f"Plant '{plant.name}' deactivated",
    }

    return PlantResponse.model_validate(plant)


@router.post(
    "/{plant_id}/reactivate",
    response_model=PlantResponse,
    status_code=status.HTTP_200_OK,
)
async def reactivate_plant(
    plant_id: int,
    request: Request,
    repo: PlantRepository = Depends(get_plant_repo),
    session: AsyncSession = Depends(get_db_session),
    license_service: LicenseService = Depends(get_license_service),
    _user: User = Depends(get_current_admin),
) -> PlantResponse:
    """Reactivate a plant.

    Marks a plant as active again. Fails if reactivation would exceed the
    license plant limit.
    """
    plant = await repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found",
        )

    if plant.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plant is already active",
        )

    # Check if reactivation would exceed max_plants
    active_plants = await repo.get_all(active_only=True)
    if len(active_plants) >= license_service.max_plants:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot reactivate: active plant limit ({license_service.max_plants}) would be exceeded. "
            "Deactivate another plant or upgrade your license.",
        )

    plant = await repo.update(plant_id, is_active=True)

    # Refresh compliance cache
    from cassini.core.compliance import refresh_compliance_cache

    await refresh_compliance_cache(request.app, session)

    # Update MQTT tag provider if available
    tag_mgr = getattr(request.app.state, "tag_provider_manager", None)
    if tag_mgr is not None and hasattr(tag_mgr, "reload_plant_status"):
        inactive_ids = await _get_inactive_plant_ids(repo)
        tag_mgr.reload_plant_status(inactive_ids)

    # Audit context
    request.state.audit_context = {
        "resource_type": "plant",
        "resource_id": plant_id,
        "action": "reactivate",
        "summary": f"Plant '{plant.name}' reactivated",
    }

    return PlantResponse.model_validate(plant)


# --- Parameter routes ---


@router.get("/{plant_id}", response_model=PlantResponse)
async def get_plant(
    plant_id: int,
    repo: PlantRepository = Depends(get_plant_repo),
    _user: User = Depends(get_current_user),
) -> PlantResponse:
    """Get a plant by ID.

    Returns details for a specific plant.
    """
    plant = await repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )
    return PlantResponse.model_validate(plant)


@router.put("/{plant_id}", response_model=PlantResponse)
async def update_plant(
    plant_id: int,
    data: PlantUpdate,
    request: Request,
    repo: PlantRepository = Depends(get_plant_repo),
    _user: User = Depends(get_current_admin),
) -> PlantResponse:
    """Update a plant.

    Updates plant details. All fields are optional; only provided fields are updated.
    """
    update_data = data.model_dump(exclude_unset=True)
    change_reason = update_data.pop("change_reason", None)

    if not update_data:
        plant = await repo.get_by_id(plant_id)
        if plant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plant {plant_id} not found",
            )
        return PlantResponse.model_validate(plant)

    # Snapshot old values before mutation
    plant = await repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )
    old_values = {f: getattr(plant, f, None) for f in update_data}

    try:
        plant = await repo.update(plant_id, **update_data)
        if plant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plant {plant_id} not found",
            )

        # Compute diff for audit trail
        new_values = {}
        diff_old = {}
        for f, old_val in old_values.items():
            new_val = getattr(plant, f, None)
            if old_val != new_val:
                diff_old[f] = old_val
                new_values[f] = new_val

        request.state.audit_context = {
            "resource_type": "plant",
            "resource_id": plant_id,
            "action": "update",
            "summary": f"Plant '{plant.name}' updated",
            "fields": {"old_values": diff_old, "new_values": new_values, "change_reason": change_reason},
        }

        return PlantResponse.model_validate(plant)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Plant with this name or code already exists",
        )


@router.delete("/{plant_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_plant(
    plant_id: int,
    request: Request,
    repo: PlantRepository = Depends(get_plant_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_admin),
) -> None:
    """Delete a plant.

    Deletes a plant. The Default plant cannot be deleted.
    """
    # Check if it's the Default plant
    plant = await repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )

    if plant.code == "DEFAULT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the Default plant",
        )

    success = await repo.delete(plant_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )

    # Refresh compliance cache after deletion
    from cassini.core.compliance import refresh_compliance_cache

    await refresh_compliance_cache(request.app, session)


async def _get_inactive_plant_ids(repo: PlantRepository) -> set[int]:
    """Get the set of inactive plant IDs."""
    all_plants = await repo.get_all()
    return {p.id for p in all_plants if not p.is_active}
