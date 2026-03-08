"""Material class REST endpoints for hierarchical material grouping.

Provides CRUD operations and tree traversal for plant-scoped material classes.
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
)
from cassini.api.schemas.material import (
    MaterialClassCreate,
    MaterialClassResponse,
    MaterialClassTreeNode,
    MaterialClassUpdate,
    MaterialUsageItem,
)
from cassini.db.models.material import Material
from cassini.db.models.material_class import MaterialClass
from cassini.db.models.user import User
from cassini.db.repositories.hierarchy import HierarchyRepository
from cassini.db.repositories.material_class import MaterialClassRepository
from cassini.db.repositories.material_limit_override import (
    MaterialLimitOverrideRepository,
)

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/api/v1/plants/{plant_id}/material-classes",
    tags=["material-classes"],
)


def _enrich_response(mc: MaterialClass, children_count: int, material_count: int) -> MaterialClassResponse:
    """Build a MaterialClassResponse with computed counts."""
    return MaterialClassResponse(
        id=mc.id,
        plant_id=mc.plant_id,
        parent_id=mc.parent_id,
        name=mc.name,
        code=mc.code,
        path=mc.path,
        depth=mc.depth,
        description=mc.description,
        material_count=material_count,
        children_count=children_count,
        created_at=mc.created_at,
        updated_at=mc.updated_at,
    )


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------
@router.get("/", response_model=list[MaterialClassResponse])
async def list_material_classes(
    plant_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[MaterialClassResponse]:
    """List all material classes for a plant with counts."""
    check_plant_role(_user, plant_id, "operator")

    repo = MaterialClassRepository(session)
    classes = await repo.list_by_plant(plant_id)

    # Batch-fetch children and material counts to avoid N+1
    class_ids = [mc.id for mc in classes]
    if not class_ids:
        return []

    children_stmt = (
        select(MaterialClass.parent_id, func.count())
        .where(MaterialClass.parent_id.in_(class_ids))
        .group_by(MaterialClass.parent_id)
    )
    children_result = await session.execute(children_stmt)
    children_map: dict[int, int] = dict(children_result.all())

    material_stmt = (
        select(Material.class_id, func.count())
        .where(Material.class_id.in_(class_ids))
        .group_by(Material.class_id)
    )
    material_result = await session.execute(material_stmt)
    material_map: dict[int, int] = dict(material_result.all())

    return [
        _enrich_response(mc, children_map.get(mc.id, 0), material_map.get(mc.id, 0))
        for mc in classes
    ]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
@router.post("/", response_model=MaterialClassResponse, status_code=status.HTTP_201_CREATED)
async def create_material_class(
    plant_id: int,
    body: MaterialClassCreate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> MaterialClassResponse:
    """Create a new material class (Engineer+)."""
    check_plant_role(_user, plant_id, "engineer")

    repo = MaterialClassRepository(session)
    try:
        mc = await repo.create(
            plant_id=plant_id,
            name=body.name,
            code=body.code,
            parent_id=body.parent_id,
            description=body.description,
        )
    except ValueError:
        logger.warning("material_class_create_failed", plant_id=plant_id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid parent class specified",
        )

    await session.commit()
    return _enrich_response(mc, 0, 0)


# ---------------------------------------------------------------------------
# Usage — which characteristics reference this material class?
# ---------------------------------------------------------------------------
@router.get("/usage/{class_id}", response_model=list[MaterialUsageItem])
async def get_material_class_usage(
    plant_id: int,
    class_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[MaterialUsageItem]:
    """List characteristics that have limit overrides for this material class."""
    check_plant_role(_user, plant_id, "operator")

    override_repo = MaterialLimitOverrideRepository(session)
    rows = await override_repo.list_characteristics_by_class(class_id)

    if not rows:
        return []

    # Build hierarchy paths in batch: collect unique hierarchy_ids
    hierarchy_ids = {r["hierarchy_id"] for r in rows}
    hierarchy_repo = HierarchyRepository(session)
    path_cache: dict[int, str] = {}
    for hid in hierarchy_ids:
        parts = await hierarchy_repo.get_ancestor_path(hid)
        path_cache[hid] = " > ".join(parts) if parts else None

    return [
        MaterialUsageItem(
            characteristic_id=r["characteristic_id"],
            name=r["name"],
            hierarchy_path=path_cache.get(r["hierarchy_id"]),
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Get detail
# ---------------------------------------------------------------------------
@router.get("/{class_id}", response_model=MaterialClassResponse)
async def get_material_class(
    plant_id: int,
    class_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> MaterialClassResponse:
    """Get a material class with children and material counts."""
    check_plant_role(_user, plant_id, "operator")

    repo = MaterialClassRepository(session)
    mc = await repo.get_by_id(class_id)
    if mc is None or mc.plant_id != plant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material class not found",
        )

    children_count = len(mc.children) if mc.children else 0
    material_count = len(mc.materials) if mc.materials else 0
    return _enrich_response(mc, children_count, material_count)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------
@router.put("/{class_id}", response_model=MaterialClassResponse)
async def update_material_class(
    plant_id: int,
    class_id: int,
    body: MaterialClassUpdate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> MaterialClassResponse:
    """Update a material class (Engineer+)."""
    check_plant_role(_user, plant_id, "engineer")

    repo = MaterialClassRepository(session)
    existing = await repo.get_by_id(class_id)
    if existing is None or existing.plant_id != plant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material class not found",
        )

    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    try:
        mc = await repo.update(class_id, **fields)
    except ValueError:
        logger.warning("material_class_update_failed", class_id=class_id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reparenting operation",
        )

    await session.commit()

    # Re-fetch with relationships for counts
    mc = await repo.get_by_id(class_id)
    children_count = len(mc.children) if mc.children else 0
    material_count = len(mc.materials) if mc.materials else 0
    return _enrich_response(mc, children_count, material_count)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------
@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material_class(
    plant_id: int,
    class_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> None:
    """Delete a material class (Engineer+). Fails if it has children or materials."""
    check_plant_role(_user, plant_id, "engineer")

    repo = MaterialClassRepository(session)
    existing = await repo.get_by_id(class_id)
    if existing is None or existing.plant_id != plant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material class not found",
        )

    try:
        await repo.delete(class_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete material class with children or materials",
        )

    await session.commit()


# ---------------------------------------------------------------------------
# Tree
# ---------------------------------------------------------------------------
@router.get("/{class_id}/tree", response_model=MaterialClassTreeNode)
async def get_material_class_tree(
    plant_id: int,
    class_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> MaterialClassTreeNode:
    """Get the full subtree rooted at class_id as nested nodes."""
    check_plant_role(_user, plant_id, "operator")

    repo = MaterialClassRepository(session)
    root = await repo.get_by_id(class_id)
    if root is None or root.plant_id != plant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Material class not found",
        )

    subtree = await repo.get_subtree(class_id)

    # Fetch material counts for all nodes in one query
    subtree_ids = [mc.id for mc in subtree]
    material_stmt = (
        select(Material.class_id, func.count())
        .where(Material.class_id.in_(subtree_ids))
        .group_by(Material.class_id)
    )
    material_result = await session.execute(material_stmt)
    material_map: dict[int, int] = dict(material_result.all())

    # Build a lookup for children counts
    children_map: dict[int, int] = {}
    for mc in subtree:
        if mc.parent_id is not None:
            children_map[mc.parent_id] = children_map.get(mc.parent_id, 0) + 1

    # Build nested tree structure
    node_map: dict[int, MaterialClassTreeNode] = {}
    for mc in subtree:
        node = MaterialClassTreeNode(
            id=mc.id,
            plant_id=mc.plant_id,
            parent_id=mc.parent_id,
            name=mc.name,
            code=mc.code,
            path=mc.path,
            depth=mc.depth,
            description=mc.description,
            material_count=material_map.get(mc.id, 0),
            children_count=children_map.get(mc.id, 0),
            created_at=mc.created_at,
            updated_at=mc.updated_at,
            children=[],
            materials=[],
        )
        node_map[mc.id] = node

    # Wire parent-child relationships
    for mc in subtree:
        if mc.parent_id is not None and mc.parent_id in node_map:
            node_map[mc.parent_id].children.append(node_map[mc.id])

    return node_map[class_id]
