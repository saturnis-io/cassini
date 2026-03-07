"""Repository for MaterialClass model with hierarchical tree operations."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.material_class import MaterialClass
from cassini.db.repositories.base import BaseRepository


class MaterialClassRepository(BaseRepository[MaterialClass]):
    """Repository for MaterialClass with materialized-path tree operations.

    Provides methods for tree traversal, reparenting with subtree
    path updates, and safe deletion with child/material checks.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize material class repository.

        Args:
            session: SQLAlchemy async session for database operations
        """
        super().__init__(session, MaterialClass)

    async def list_by_plant(self, plant_id: int) -> list[MaterialClass]:
        """List all material classes for a plant, ordered by path (tree order).

        Args:
            plant_id: Plant ID to filter by

        Returns:
            List of material classes in depth-first tree order
        """
        stmt = (
            select(MaterialClass)
            .where(MaterialClass.plant_id == plant_id)
            .order_by(MaterialClass.path)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, id: int) -> MaterialClass | None:
        """Get a material class by ID with children, materials, and parent loaded.

        Args:
            id: MaterialClass primary key

        Returns:
            MaterialClass with relationships loaded, or None
        """
        stmt = (
            select(MaterialClass)
            .where(MaterialClass.id == id)
            .options(
                selectinload(MaterialClass.children),
                selectinload(MaterialClass.materials),
                selectinload(MaterialClass.parent),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_subtree(self, class_id: int) -> list[MaterialClass]:
        """Get all descendants of a class (inclusive), ordered by path.

        Uses materialized path LIKE query for efficient subtree retrieval.

        Args:
            class_id: Root class ID

        Returns:
            List of MaterialClass nodes in the subtree (root first)
        """
        root = await self.get_by_id(class_id)
        if root is None:
            return []

        stmt = (
            select(MaterialClass)
            .where(MaterialClass.path.like(root.path + "%"))
            .order_by(MaterialClass.path)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(
        self,
        plant_id: int,
        name: str,
        code: str,
        parent_id: int | None = None,
        description: str | None = None,
    ) -> MaterialClass:
        """Create a new material class with computed path and depth.

        Code is normalized to uppercase. Path is computed after flush
        (requires the auto-generated ID).

        Args:
            plant_id: Plant this class belongs to
            name: Display name
            code: Unique code within plant (normalized to uppercase)
            parent_id: Optional parent class ID for nesting
            description: Optional description

        Returns:
            The created MaterialClass with path/depth set
        """
        normalized_code = code.strip().upper()

        parent_path = "/"
        parent_depth = -1

        if parent_id is not None:
            parent = await self.get_by_id(parent_id)
            if parent is None:
                raise ValueError(f"Parent class {parent_id} not found")
            parent_path = parent.path
            parent_depth = parent.depth

        instance = MaterialClass(
            plant_id=plant_id,
            name=name,
            code=normalized_code,
            parent_id=parent_id,
            description=description,
            path="/",  # Temporary — updated after flush
            depth=parent_depth + 1,
        )
        self.session.add(instance)
        await self.session.flush()  # Get the auto-generated ID

        # Now compute the real path using the ID
        instance.path = f"{parent_path}{instance.id}/"
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def update(self, class_id: int, **fields: object) -> MaterialClass | None:
        """Update a material class. Handles reparenting with subtree path updates.

        If parent_id changes, recomputes path and depth for this node
        and all descendants. Code is normalized to uppercase if provided.

        Args:
            class_id: ID of the class to update
            **fields: Fields to update

        Returns:
            Updated MaterialClass, or None if not found
        """
        instance = await self.get_by_id(class_id)
        if instance is None:
            return None

        # Normalize code if provided
        if "code" in fields and fields["code"] is not None:
            fields["code"] = str(fields["code"]).strip().upper()

        reparent = "parent_id" in fields and fields["parent_id"] != instance.parent_id
        old_path = instance.path

        # Apply simple field updates
        for key, value in fields.items():
            if hasattr(instance, key):
                setattr(instance, key, value)

        if reparent:
            new_parent_id = fields["parent_id"]
            if new_parent_id is not None:
                parent = await self.get_by_id(new_parent_id)
                if parent is None:
                    raise ValueError(f"Parent class {new_parent_id} not found")
                # Prevent reparenting under own subtree
                if parent.path.startswith(old_path):
                    raise ValueError("Cannot reparent a class under its own subtree")
                new_path = f"{parent.path}{instance.id}/"
                new_depth = parent.depth + 1
            else:
                new_path = f"/{instance.id}/"
                new_depth = 0

            depth_delta = new_depth - instance.depth
            instance.path = new_path
            instance.depth = new_depth

            # Update all descendants
            descendants_stmt = (
                select(MaterialClass)
                .where(
                    MaterialClass.path.like(old_path + "%"),
                    MaterialClass.id != class_id,
                )
                .order_by(MaterialClass.path)
            )
            descendants_result = await self.session.execute(descendants_stmt)
            for desc in descendants_result.scalars().all():
                # Replace old_path prefix with new_path
                desc.path = new_path + desc.path[len(old_path):]
                desc.depth += depth_delta

        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete(self, class_id: int) -> bool:
        """Delete a material class. Raises ValueError if it has children or materials.

        Args:
            class_id: ID of the class to delete

        Returns:
            True if deleted

        Raises:
            ValueError: If the class has children or materials
        """
        if await self.has_children_or_materials(class_id):
            raise ValueError(
                "Cannot delete material class with children or materials. "
                "Remove or reassign them first."
            )

        instance = await self.get_by_id(class_id)
        if instance is None:
            return False

        await self.session.delete(instance)
        await self.session.flush()
        return True

    async def has_children_or_materials(self, class_id: int) -> bool:
        """Check whether a class has child classes or materials.

        Args:
            class_id: ID of the class to check

        Returns:
            True if the class has any children or materials
        """
        from cassini.db.models.material import Material

        children_stmt = (
            select(func.count())
            .select_from(MaterialClass)
            .where(MaterialClass.parent_id == class_id)
        )
        materials_stmt = (
            select(func.count())
            .select_from(Material)
            .where(Material.class_id == class_id)
        )

        children_result = await self.session.execute(children_stmt)
        materials_result = await self.session.execute(materials_stmt)

        return (children_result.scalar_one() + materials_result.scalar_one()) > 0
