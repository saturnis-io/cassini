"""Repository for Hierarchy model with tree operations."""

from __future__ import annotations

from typing import Any

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

    async def get_tree(self) -> list[HierarchyNode]:
        """Get complete hierarchy as a nested tree structure.

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

        This method returns all children, grandchildren, etc. of the
        specified node in a flat list.

        Args:
            node_id: ID of the parent node

        Returns:
            List of all descendant hierarchy nodes (not including the node itself)
        """
        descendants: list[Hierarchy] = []
        nodes_to_process = [node_id]

        while nodes_to_process:
            current_id = nodes_to_process.pop(0)
            children = await self.get_children(current_id)

            for child in children:
                descendants.append(child)
                nodes_to_process.append(child.id)

        return descendants

    async def get_ancestors(self, node_id: int) -> list[Hierarchy]:
        """Get all ancestors of a node up to the root.

        This method returns the complete path from the specified node
        to the root, ordered from the immediate parent to the root.

        Args:
            node_id: ID of the child node

        Returns:
            List of ancestor hierarchy nodes ordered from parent to root
        """
        ancestors: list[Hierarchy] = []
        current_id = node_id

        while True:
            node = await self.get_by_id(current_id)
            if node is None or node.parent_id is None:
                break

            parent = await self.get_by_id(node.parent_id)
            if parent is None:
                break

            ancestors.append(parent)
            current_id = parent.id

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
