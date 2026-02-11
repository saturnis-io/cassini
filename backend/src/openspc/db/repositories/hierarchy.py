"""Repository for Hierarchy model with tree operations."""

from __future__ import annotations

from typing import Any, Optional, Sequence

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.db.models.hierarchy import Hierarchy
from openspc.db.repositories.base import BaseRepository


class HierarchyNode(BaseModel):
    """Nested hierarchy structure with children.

    This model represents a node in the hierarchy tree,
    including all descendant nodes.
    """

    id: int
    parent_id: int | None
    name: str
    type: str
    children: list[HierarchyNode] = []

    class Config:
        from_attributes = True


class HierarchyRepository(BaseRepository[Hierarchy]):
    """Repository for Hierarchy model with tree-specific operations.

    Provides methods for navigating and querying hierarchical
    relationships between nodes.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize hierarchy repository.

        Args:
            session: SQLAlchemy async session for database operations
        """
        super().__init__(session, Hierarchy)

    async def get_tree(self, plant_id: Optional[int] = None) -> list[HierarchyNode]:
        """Get complete hierarchy as a nested tree structure.

        Args:
            plant_id: Optional plant ID to filter hierarchies by

        Returns:
            List of root-level hierarchy nodes with nested children

        Example:
            [
                HierarchyNode(
                    id=1, name="Factory A", type="Site",
                    children=[
                        HierarchyNode(id=2, name="Line 1", type="Line", children=[...]),
                        HierarchyNode(id=3, name="Line 2", type="Line", children=[])
                    ]
                )
            ]
        """
        # Load all hierarchies with their children eagerly loaded
        stmt = select(Hierarchy).options(selectinload(Hierarchy.children))
        if plant_id is not None:
            stmt = stmt.where(Hierarchy.plant_id == plant_id)
        result = await self.session.execute(stmt)
        all_hierarchies = list(result.scalars().all())

        # Build a map of id -> node for quick lookups
        node_map: dict[int, dict[str, Any]] = {}
        for h in all_hierarchies:
            node_map[h.id] = {
                "id": h.id,
                "parent_id": h.parent_id,
                "name": h.name,
                "type": h.type,
                "children": [],
            }

        # Build the tree by connecting parents to children
        roots: list[dict[str, Any]] = []
        for h in all_hierarchies:
            node_data = node_map[h.id]
            if h.parent_id is None:
                roots.append(node_data)
            else:
                if h.parent_id in node_map:
                    node_map[h.parent_id]["children"].append(node_data)

        # Convert dictionaries to HierarchyNode objects recursively
        def dict_to_node(data: dict[str, Any]) -> HierarchyNode:
            children = [dict_to_node(child) for child in data["children"]]
            return HierarchyNode(
                id=data["id"],
                parent_id=data["parent_id"],
                name=data["name"],
                type=data["type"],
                children=children,
            )

        return [dict_to_node(root) for root in roots]

    async def get_descendants(self, node_id: int) -> list[Hierarchy]:
        """Get all descendants of a node recursively.

        Loads all nodes for the target node's plant in one query, then
        builds the subtree in memory using BFS (avoids N+1 queries).

        Args:
            node_id: ID of the parent node

        Returns:
            List of all descendant hierarchy nodes (not including the node itself)
        """
        # Load the target node to get its plant_id
        node = await self.get_by_id(node_id)
        if node is None:
            return []

        # Load all nodes for this plant in one query
        stmt = select(Hierarchy)
        if node.plant_id is not None:
            stmt = stmt.where(Hierarchy.plant_id == node.plant_id)
        result = await self.session.execute(stmt)
        all_nodes = list(result.scalars().all())

        # Build parent→children map
        children_map: dict[int, list[Hierarchy]] = {}
        for n in all_nodes:
            if n.parent_id is not None:
                children_map.setdefault(n.parent_id, []).append(n)

        # BFS from node_id
        descendants: list[Hierarchy] = []
        queue = [node_id]
        while queue:
            current_id = queue.pop(0)
            for child in children_map.get(current_id, []):
                descendants.append(child)
                queue.append(child.id)

        return descendants

    async def get_ancestors(self, node_id: int) -> list[Hierarchy]:
        """Get all ancestors of a node up to the root.

        Loads all nodes for the target node's plant in one query, then
        walks up the parent chain in memory (avoids N+1 queries).

        Args:
            node_id: ID of the child node

        Returns:
            List of ancestor hierarchy nodes ordered from parent to root
        """
        # Load the target node to get its plant_id
        node = await self.get_by_id(node_id)
        if node is None:
            return []

        # Load all nodes for this plant in one query
        stmt = select(Hierarchy)
        if node.plant_id is not None:
            stmt = stmt.where(Hierarchy.plant_id == node.plant_id)
        result = await self.session.execute(stmt)
        all_nodes = list(result.scalars().all())

        # Build id→node map
        node_map: dict[int, Hierarchy] = {n.id: n for n in all_nodes}

        # Walk up parent chain
        ancestors: list[Hierarchy] = []
        current = node_map.get(node_id)
        while current and current.parent_id is not None:
            parent = node_map.get(current.parent_id)
            if parent is None:
                break
            ancestors.append(parent)
            current = parent

        return ancestors

    async def get_children(self, parent_id: int | None) -> list[Hierarchy]:
        """Get direct children of a node.

        Args:
            parent_id: ID of the parent node, or None for root nodes

        Returns:
            List of immediate child hierarchy nodes
        """
        stmt = select(Hierarchy).where(Hierarchy.parent_id == parent_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_plant(self, plant_id: int) -> Sequence[Hierarchy]:
        """Get all hierarchies for a plant.

        Args:
            plant_id: ID of the plant to filter by

        Returns:
            List of all hierarchy nodes belonging to the plant
        """
        stmt = select(Hierarchy).where(Hierarchy.plant_id == plant_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_in_plant(
        self,
        plant_id: int,
        name: str,
        type: str,
        parent_id: Optional[int] = None,
    ) -> Hierarchy:
        """Create a new hierarchy node in a specific plant.

        If parent_id is provided, the plant_id is inherited from the parent
        for consistency.

        Args:
            plant_id: ID of the plant to create the node in
            name: Name of the hierarchy node
            type: Type of the hierarchy node
            parent_id: Optional parent node ID

        Returns:
            The created hierarchy node
        """
        # If parent is provided, inherit plant_id from parent for consistency
        effective_plant_id = plant_id
        if parent_id is not None:
            parent = await self.get_by_id(parent_id)
            if parent and parent.plant_id:
                effective_plant_id = parent.plant_id

        node = Hierarchy(
            parent_id=parent_id,
            plant_id=effective_plant_id,
            name=name,
            type=type,
        )
        self.session.add(node)
        await self.session.flush()
        await self.session.refresh(node)
        return node
