"""Material limit override REST endpoints.

Provides CRUD for per-characteristic material/class limit overrides,
plus a resolution endpoint that walks the material class hierarchy.
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
    resolve_plant_id_for_characteristic,
)
from cassini.api.schemas.material import (
    MaterialLimitOverrideCreate,
    MaterialLimitOverrideResponse,
    MaterialLimitOverrideUpdate,
    ResolvedLimitField,
    ResolvedLimitsResponse,
)
from cassini.core.material_resolver import MaterialResolver, OVERRIDE_FIELDS
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.user import User
from cassini.db.repositories.material_limit_override import MaterialLimitOverrideRepository

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/api/v1/characteristics/{char_id}/material-overrides",
    tags=["material-overrides"],
)


def _to_response(o) -> MaterialLimitOverrideResponse:
    """Build response with material_name/class_name from loaded relationships."""
    return MaterialLimitOverrideResponse(
        id=o.id,
        characteristic_id=o.characteristic_id,
        material_id=o.material_id,
        class_id=o.class_id,
        material_name=o.material.name if o.material else None,
        class_name=o.material_class.name if o.material_class else None,
        class_path=o.material_class.path if o.material_class else None,
        ucl=o.ucl,
        lcl=o.lcl,
        stored_sigma=o.stored_sigma,
        stored_center_line=o.stored_center_line,
        target_value=o.target_value,
        usl=o.usl,
        lsl=o.lsl,
        created_at=o.created_at,
        updated_at=o.updated_at,
    )


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------
@router.get("/", response_model=list[MaterialLimitOverrideResponse])
async def list_material_overrides(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[MaterialLimitOverrideResponse]:
    """List all material/class overrides for a characteristic."""
    # Verify characteristic exists and user has plant access
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "operator")

    repo = MaterialLimitOverrideRepository(session)
    overrides = await repo.list_by_characteristic(char_id)
    return [_to_response(o) for o in overrides]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
@router.post("/", response_model=MaterialLimitOverrideResponse, status_code=status.HTTP_201_CREATED)
async def create_material_override(
    char_id: int,
    body: MaterialLimitOverrideCreate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> MaterialLimitOverrideResponse:
    """Create a material/class limit override (Engineer+)."""
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    repo = MaterialLimitOverrideRepository(session)
    limit_fields = body.model_dump(exclude={"material_id", "class_id"})

    try:
        override = await repo.create(
            char_id=char_id,
            material_id=body.material_id,
            class_id=body.class_id,
            **limit_fields,
        )
    except Exception:
        logger.warning("material_override_create_failed", char_id=char_id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create override. A duplicate may already exist.",
        )

    await session.commit()

    # Re-fetch with relationships loaded
    overrides = await repo.list_by_characteristic(char_id)
    for o in overrides:
        if o.id == override.id:
            return _to_response(o)

    # Fallback if somehow not found in list (shouldn't happen)
    return _to_response(override)


# ---------------------------------------------------------------------------
# Resolve effective limits — MUST be before /{override_id} (static before param)
# ---------------------------------------------------------------------------
@router.get("/resolve/{material_id}", response_model=ResolvedLimitsResponse)
async def resolve_material_limits(
    char_id: int,
    material_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> ResolvedLimitsResponse:
    """Resolve effective limits for a material on this characteristic.

    Walks the material class hierarchy, applying per-field cascade:
    material override > deepest class > parent class > characteristic default.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "operator")

    # Load characteristic defaults
    char = await session.get(Characteristic, char_id)
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Characteristic not found",
        )

    char_defaults = {
        "ucl": char.ucl,
        "lcl": char.lcl,
        "stored_sigma": char.stored_sigma,
        "stored_center_line": char.stored_center_line,
        "target_value": char.target_value,
        "usl": char.usl,
        "lsl": char.lsl,
    }

    resolver = MaterialResolver(session)
    try:
        effective = await resolver.resolve(
            char_id=char_id,
            material_id=material_id,
            char_defaults=char_defaults,
            char_name=char.name,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found",
        )

    return ResolvedLimitsResponse(
        **{
            fld: ResolvedLimitField(
                value=getattr(effective, fld).value,
                source_type=getattr(effective, fld).source_type,
                source_name=getattr(effective, fld).source_name,
                source_id=getattr(effective, fld).source_id,
            )
            for fld in OVERRIDE_FIELDS
        }
    )


# ---------------------------------------------------------------------------
# Get detail
# ---------------------------------------------------------------------------
@router.get("/{override_id}", response_model=MaterialLimitOverrideResponse)
async def get_material_override(
    char_id: int,
    override_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> MaterialLimitOverrideResponse:
    """Get a specific material limit override."""
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "operator")

    repo = MaterialLimitOverrideRepository(session)
    # Fetch via list to get relationships loaded
    overrides = await repo.list_by_characteristic(char_id)
    for o in overrides:
        if o.id == override_id:
            return _to_response(o)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Material limit override not found",
    )


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------
@router.put("/{override_id}", response_model=MaterialLimitOverrideResponse)
async def update_material_override(
    char_id: int,
    override_id: int,
    body: MaterialLimitOverrideUpdate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> MaterialLimitOverrideResponse:
    """Update limit fields on an existing override (Engineer+)."""
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    repo = MaterialLimitOverrideRepository(session)
    existing = await repo.get_by_id(override_id)
    if existing is None or existing.characteristic_id != char_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material limit override not found",
        )

    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    await repo.update(override_id, **fields)
    await session.commit()

    # Re-fetch with relationships
    overrides = await repo.list_by_characteristic(char_id)
    for o in overrides:
        if o.id == override_id:
            return _to_response(o)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Material limit override not found after update",
    )


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------
@router.delete("/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material_override(
    char_id: int,
    override_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> None:
    """Delete a material limit override (Engineer+)."""
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    repo = MaterialLimitOverrideRepository(session)
    existing = await repo.get_by_id(override_id)
    if existing is None or existing.characteristic_id != char_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material limit override not found",
        )

    await repo.delete(override_id)
    await session.commit()
