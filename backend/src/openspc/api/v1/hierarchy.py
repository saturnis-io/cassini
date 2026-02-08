"""Hierarchy REST API endpoints.

Implements ISA-95 equipment hierarchy management endpoints.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger(__name__)
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import (
    get_characteristic_repo,
    get_current_user,
    get_current_engineer,
    get_db_session,
    get_hierarchy_repo,
)
from openspc.db.models.user import User
from openspc.db.models.characteristic import Characteristic
from openspc.api.schemas.characteristic import CharacteristicResponse
from openspc.api.schemas.hierarchy import (
    HierarchyCreate,
    HierarchyResponse,
    HierarchyTreeNode,
    HierarchyUpdate,
)
from openspc.db.repositories.characteristic import CharacteristicRepository
from openspc.db.repositories.hierarchy import HierarchyRepository
from openspc.db.repositories.plant import PlantRepository

router = APIRouter(tags=["hierarchy"])

# Plant-scoped hierarchy router
plant_hierarchy_router = APIRouter(tags=["hierarchy"])


async def validate_plant(
    plant_id: int,
    session: AsyncSession = Depends(get_db_session),
) -> int:
    """Validate plant exists and return plant_id."""
    repo = PlantRepository(session)
    plant = await repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )
    return plant_id


@router.get("/", response_model=list[HierarchyTreeNode])
async def get_hierarchy_tree(
    repo: HierarchyRepository = Depends(get_hierarchy_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[HierarchyTreeNode]:
    """Get full hierarchy as nested tree structure.

    Returns the complete equipment hierarchy organized as a tree,
    with each node containing its children recursively. Root nodes
    (those without parents) are returned at the top level.

    Returns:
        List of root hierarchy nodes with nested children

    Example Response:
        ```json
        [
            {
                "id": 1,
                "name": "Factory A",
                "type": "Site",
                "children": [
                    {
                        "id": 2,
                        "name": "Production Area",
                        "type": "Area",
                        "children": [
                            {
                                "id": 3,
                                "name": "Line 1",
                                "type": "Line",
                                "children": [],
                                "characteristic_count": 5
                            }
                        ],
                        "characteristic_count": 0
                    }
                ],
                "characteristic_count": 0
            }
        ]
        ```
    """
    tree = await repo.get_tree()

    # Get characteristic counts per hierarchy node
    count_query = (
        select(Characteristic.hierarchy_id, func.count(Characteristic.id))
        .group_by(Characteristic.hierarchy_id)
    )
    result = await session.execute(count_query)
    char_counts = {row[0]: row[1] for row in result.all()}

    # Convert HierarchyNode to HierarchyTreeNode with characteristic counts
    def convert_to_tree_node(node) -> HierarchyTreeNode:
        return HierarchyTreeNode(
            id=node.id,
            name=node.name,
            type=node.type,
            children=[convert_to_tree_node(child) for child in node.children],
            characteristic_count=char_counts.get(node.id, 0),
        )

    return [convert_to_tree_node(root) for root in tree]


@router.post("/", response_model=HierarchyResponse, status_code=status.HTTP_201_CREATED)
async def create_hierarchy_node(
    data: HierarchyCreate,
    repo: HierarchyRepository = Depends(get_hierarchy_repo),
    _user: User = Depends(get_current_engineer),
) -> HierarchyResponse:
    """Create a new hierarchy node.

    Creates a new node in the equipment hierarchy. If parent_id is provided,
    the parent must exist, otherwise a 404 error is returned.

    Args:
        data: Hierarchy node creation data

    Returns:
        The created hierarchy node

    Raises:
        HTTPException 404: If parent_id is provided but parent doesn't exist
        HTTPException 422: If validation fails

    Example Request:
        ```json
        {
            "parent_id": 1,
            "name": "Line 2",
            "type": "Line"
        }
        ```

    Example Response:
        ```json
        {
            "id": 4,
            "parent_id": 1,
            "name": "Line 2",
            "type": "Line"
        }
        ```
    """
    # Validate parent exists if provided
    if data.parent_id is not None:
        parent = await repo.get_by_id(data.parent_id)
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent hierarchy node {data.parent_id} not found",
            )

    try:
        node = await repo.create(
            parent_id=data.parent_id,
            name=data.name,
            type=data.type,
        )
        return HierarchyResponse.model_validate(node)
    except IntegrityError:
        logger.exception("Database integrity error in hierarchy operation")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Database integrity error: duplicate or invalid reference",
        )


@router.get("/{node_id}", response_model=HierarchyResponse)
async def get_hierarchy_node(
    node_id: int,
    repo: HierarchyRepository = Depends(get_hierarchy_repo),
    _user: User = Depends(get_current_user),
) -> HierarchyResponse:
    """Get a single hierarchy node by ID.

    Retrieves details for a specific hierarchy node.

    Args:
        node_id: ID of the hierarchy node to retrieve

    Returns:
        The hierarchy node

    Raises:
        HTTPException 404: If node doesn't exist

    Example Response:
        ```json
        {
            "id": 3,
            "parent_id": 2,
            "name": "Line 1",
            "type": "Line"
        }
        ```
    """
    node = await repo.get_by_id(node_id)
    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hierarchy node {node_id} not found",
        )
    return HierarchyResponse.model_validate(node)


@router.patch("/{node_id}", response_model=HierarchyResponse)
async def update_hierarchy_node(
    node_id: int,
    data: HierarchyUpdate,
    repo: HierarchyRepository = Depends(get_hierarchy_repo),
    _user: User = Depends(get_current_engineer),
) -> HierarchyResponse:
    """Update a hierarchy node.

    Updates one or more fields of an existing hierarchy node.
    Only provided fields are updated (partial update).

    Args:
        node_id: ID of the hierarchy node to update
        data: Fields to update

    Returns:
        The updated hierarchy node

    Raises:
        HTTPException 404: If node doesn't exist
        HTTPException 422: If update violates constraints

    Example Request:
        ```json
        {
            "name": "Line 1 - Updated"
        }
        ```

    Example Response:
        ```json
        {
            "id": 3,
            "parent_id": 2,
            "name": "Line 1 - Updated",
            "type": "Line"
        }
        ```
    """
    # Prepare update data (only include fields that were set)
    update_data = data.model_dump(exclude_unset=True)

    if not update_data:
        # If no fields to update, just return current node
        node = await repo.get_by_id(node_id)
        if node is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Hierarchy node {node_id} not found",
            )
        return HierarchyResponse.model_validate(node)

    try:
        node = await repo.update(node_id, **update_data)
        if node is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Hierarchy node {node_id} not found",
            )
        return HierarchyResponse.model_validate(node)
    except IntegrityError:
        logger.exception("Database integrity error in hierarchy operation")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Database integrity error: duplicate or invalid reference",
        )


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_hierarchy_node(
    node_id: int,
    repo: HierarchyRepository = Depends(get_hierarchy_repo),
    _user: User = Depends(get_current_engineer),
) -> None:
    """Delete a hierarchy node.

    Deletes a hierarchy node if it has no children. If the node has
    children, a 409 Conflict error is returned.

    Args:
        node_id: ID of the hierarchy node to delete

    Raises:
        HTTPException 404: If node doesn't exist
        HTTPException 409: If node has children

    Example:
        DELETE /api/v1/hierarchy/5
        -> 204 No Content
    """
    # Check if node exists
    node = await repo.get_by_id(node_id)
    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hierarchy node {node_id} not found",
        )

    # Check if node has children
    children = await repo.get_children(node_id)
    if children:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete hierarchy node {node_id}: has {len(children)} child node(s)",
        )

    # Delete the node
    success = await repo.delete(node_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hierarchy node {node_id} not found",
        )


@router.get("/{node_id}/characteristics", response_model=list[CharacteristicResponse])
async def get_node_characteristics(
    node_id: int,
    include_descendants: bool = False,
    hierarchy_repo: HierarchyRepository = Depends(get_hierarchy_repo),
    char_repo: CharacteristicRepository = Depends(get_characteristic_repo),
    _user: User = Depends(get_current_user),
) -> list[CharacteristicResponse]:
    """Get characteristics under a hierarchy node.

    Retrieves all characteristics associated with a hierarchy node.
    Optionally includes characteristics from all descendant nodes.

    Args:
        node_id: ID of the hierarchy node
        include_descendants: If True, include characteristics from child nodes
            (default: False)

    Returns:
        List of characteristics with full configuration details

    Raises:
        HTTPException 404: If node doesn't exist

    Example Response:
        ```json
        [
            {
                "id": 1,
                "hierarchy_id": 3,
                "name": "Temperature",
                "description": null,
                "subgroup_size": 5,
                "target_value": 100.0,
                "usl": 105.0,
                "lsl": 95.0,
                "ucl": 103.0,
                "lcl": 97.0,
                "provider_type": "TAG",
                "mqtt_topic": "sensors/temp",
                "trigger_tag": null,
                "subgroup_mode": "NOMINAL_TOLERANCE",
                "min_measurements": 5,
                "warn_below_count": null,
                "stored_sigma": null,
                "stored_center_line": null,
                "decimal_precision": 3
            }
        ]
        ```
    """
    # Verify node exists
    node = await hierarchy_repo.get_by_id(node_id)
    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hierarchy node {node_id} not found",
        )

    # Get characteristics
    characteristics = await char_repo.get_by_hierarchy(
        hierarchy_id=node_id,
        include_descendants=include_descendants,
    )

    # Return full characteristic data using model_validate for ORM conversion
    return [CharacteristicResponse.model_validate(char) for char in characteristics]


# ============================================================================
# Plant-Scoped Hierarchy Endpoints
# ============================================================================


@plant_hierarchy_router.get("/", response_model=list[HierarchyTreeNode])
async def get_plant_hierarchy_tree(
    plant_id: int,
    repo: HierarchyRepository = Depends(get_hierarchy_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[HierarchyTreeNode]:
    """Get hierarchy tree for a specific plant.

    Returns the complete equipment hierarchy for the specified plant,
    organized as a tree with each node containing its children recursively.

    Args:
        plant_id: ID of the plant to get hierarchy for

    Returns:
        List of root hierarchy nodes with nested children
    """
    # Validate plant exists
    plant_repo = PlantRepository(session)
    plant = await plant_repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )

    tree = await repo.get_tree(plant_id=plant_id)

    # Get characteristic counts per hierarchy node for this plant
    count_query = (
        select(Characteristic.hierarchy_id, func.count(Characteristic.id))
        .group_by(Characteristic.hierarchy_id)
    )
    result = await session.execute(count_query)
    char_counts = {row[0]: row[1] for row in result.all()}

    # Convert HierarchyNode to HierarchyTreeNode with characteristic counts
    def convert_to_tree_node(node) -> HierarchyTreeNode:
        return HierarchyTreeNode(
            id=node.id,
            name=node.name,
            type=node.type,
            children=[convert_to_tree_node(child) for child in node.children],
            characteristic_count=char_counts.get(node.id, 0),
        )

    return [convert_to_tree_node(root) for root in tree]


@plant_hierarchy_router.post("/", response_model=HierarchyResponse, status_code=status.HTTP_201_CREATED)
async def create_plant_hierarchy_node(
    data: HierarchyCreate,
    plant_id: int,
    repo: HierarchyRepository = Depends(get_hierarchy_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> HierarchyResponse:
    """Create a hierarchy node in a specific plant.

    Creates a new node in the equipment hierarchy for the specified plant.
    If parent_id is provided, the parent must exist.

    Args:
        data: Hierarchy node creation data
        plant_id: ID of the plant to create the node in

    Returns:
        The created hierarchy node
    """
    # Validate plant exists
    plant_repo = PlantRepository(session)
    plant = await plant_repo.get_by_id(plant_id)
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plant {plant_id} not found",
        )

    # Validate parent exists if provided
    if data.parent_id is not None:
        parent = await repo.get_by_id(data.parent_id)
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent hierarchy node {data.parent_id} not found",
            )

    try:
        node = await repo.create_in_plant(
            plant_id=plant_id,
            name=data.name,
            type=data.type,
            parent_id=data.parent_id,
        )
        return HierarchyResponse.model_validate(node)
    except IntegrityError:
        logger.exception("Database integrity error in hierarchy operation")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Database integrity error: duplicate or invalid reference",
        )
