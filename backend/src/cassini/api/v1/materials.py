"""Material REST endpoints for plant-scoped material management.

Provides CRUD operations for individual materials with optional
class assignment and search capabilities.
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
)
from cassini.api.schemas.material import (
    MaterialCreate,
    MaterialResponse,
    MaterialUpdate,
)
from cassini.db.models.user import User
from cassini.db.repositories.material import MaterialRepository

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/api/v1/plants/{plant_id}/materials",
    tags=["materials"],
)


def _to_response(m) -> MaterialResponse:
    """Build MaterialResponse with class_name/class_path from loaded relationship."""
    return MaterialResponse(
        id=m.id,
        plant_id=m.plant_id,
        class_id=m.class_id,
        name=m.name,
        code=m.code,
        description=m.description,
        properties=m.properties,
        class_name=m.material_class.name if m.material_class else None,
        class_path=m.material_class.path if m.material_class else None,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------
@router.get("/", response_model=list[MaterialResponse])
async def list_materials(
    plant_id: int,
    class_id: int | None = Query(None, description="Filter by material class ID"),
    search: str | None = Query(None, description="Search by name or code"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[MaterialResponse]:
    """List materials for a plant with optional filtering."""
    check_plant_role(_user, plant_id, "operator")

    repo = MaterialRepository(session)
    materials = await repo.list_by_plant(plant_id, class_id=class_id, search=search)
    return [_to_response(m) for m in materials]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
@router.post("/", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def create_material(
    plant_id: int,
    body: MaterialCreate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> MaterialResponse:
    """Create a new material (Engineer+)."""
    check_plant_role(_user, plant_id, "engineer")

    repo = MaterialRepository(session)

    # Check for duplicate code within plant
    existing = await repo.get_by_code(plant_id, body.code)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A material with this code already exists in this plant",
        )

    m = await repo.create(
        plant_id=plant_id,
        name=body.name,
        code=body.code,
        class_id=body.class_id,
        description=body.description,
        properties=body.properties,
    )
    await session.commit()

    # Re-fetch to load material_class relationship
    m = await repo.get_by_id(m.id)
    return _to_response(m)


# ---------------------------------------------------------------------------
# Get detail
# ---------------------------------------------------------------------------
@router.get("/{material_id}", response_model=MaterialResponse)
async def get_material(
    plant_id: int,
    material_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> MaterialResponse:
    """Get a material by ID."""
    check_plant_role(_user, plant_id, "operator")

    repo = MaterialRepository(session)
    m = await repo.get_by_id(material_id)
    if m is None or m.plant_id != plant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found",
        )

    return _to_response(m)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------
@router.put("/{material_id}", response_model=MaterialResponse)
async def update_material(
    plant_id: int,
    material_id: int,
    body: MaterialUpdate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> MaterialResponse:
    """Update a material (Engineer+)."""
    check_plant_role(_user, plant_id, "engineer")

    repo = MaterialRepository(session)
    existing = await repo.get_by_id(material_id)
    if existing is None or existing.plant_id != plant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found",
        )

    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # Check code uniqueness if code is changing
    if "code" in fields and fields["code"] is not None:
        normalized = fields["code"].strip().upper()
        if normalized != existing.code:
            dup = await repo.get_by_code(plant_id, normalized)
            if dup is not None and dup.id != material_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A material with this code already exists in this plant",
                )

    m = await repo.update(material_id, **fields)
    await session.commit()

    # Re-fetch to load material_class relationship
    m = await repo.get_by_id(material_id)
    return _to_response(m)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------
@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material(
    plant_id: int,
    material_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> None:
    """Delete a material (Engineer+). Fails if it has samples referencing it."""
    check_plant_role(_user, plant_id, "engineer")

    repo = MaterialRepository(session)
    existing = await repo.get_by_id(material_id)
    if existing is None or existing.plant_id != plant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material not found",
        )

    try:
        await repo.delete(material_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete material with associated samples",
        )

    await session.commit()
