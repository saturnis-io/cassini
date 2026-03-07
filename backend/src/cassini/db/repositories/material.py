"""Repository for Material model."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.material import Material
from cassini.db.models.sample import Sample
from cassini.db.repositories.base import BaseRepository


class MaterialRepository(BaseRepository[Material]):
    """Repository for Material model with plant-scoped queries.

    Provides methods for listing, searching, and managing materials
    with eager-loaded class relationships.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize material repository.

        Args:
            session: SQLAlchemy async session for database operations
        """
        super().__init__(session, Material)

    async def list_by_plant(
        self,
        plant_id: int,
        class_id: int | None = None,
        search: str | None = None,
    ) -> list[Material]:
        """List materials for a plant with optional filtering.

        Args:
            plant_id: Plant ID to filter by
            class_id: Optional class ID to filter by
            search: Optional search string (matches name or code, case-insensitive)

        Returns:
            List of materials ordered by name, with material_class loaded
        """
        stmt = (
            select(Material)
            .where(Material.plant_id == plant_id)
            .options(selectinload(Material.material_class))
            .order_by(Material.name)
        )

        if class_id is not None:
            stmt = stmt.where(Material.class_id == class_id)

        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(
                Material.name.ilike(pattern) | Material.code.ilike(pattern)
            )

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, id: int) -> Material | None:
        """Get a material by ID with material_class loaded.

        Args:
            id: Material primary key

        Returns:
            Material with material_class loaded, or None
        """
        stmt = (
            select(Material)
            .where(Material.id == id)
            .options(selectinload(Material.material_class))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_code(self, plant_id: int, code: str) -> Material | None:
        """Look up a material by plant and code.

        Code is normalized to uppercase before lookup.

        Args:
            plant_id: Plant ID
            code: Material code (will be normalized)

        Returns:
            Material if found, None otherwise
        """
        normalized_code = code.strip().upper()
        stmt = (
            select(Material)
            .where(Material.plant_id == plant_id, Material.code == normalized_code)
            .options(selectinload(Material.material_class))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(
        self,
        plant_id: int,
        name: str,
        code: str,
        class_id: int | None = None,
        description: str | None = None,
        properties: dict | None = None,
    ) -> Material:
        """Create a new material with normalized code.

        Args:
            plant_id: Plant this material belongs to
            name: Display name
            code: Unique code within plant (normalized to uppercase)
            class_id: Optional material class ID
            description: Optional description
            properties: Optional JSON properties dict

        Returns:
            The created Material
        """
        normalized_code = code.strip().upper()
        instance = Material(
            plant_id=plant_id,
            name=name,
            code=normalized_code,
            class_id=class_id,
            description=description,
            properties=properties,
        )
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def update(self, material_id: int, **fields: object) -> Material | None:
        """Update a material. Normalizes code if provided.

        Args:
            material_id: ID of the material to update
            **fields: Fields to update

        Returns:
            Updated Material, or None if not found
        """
        instance = await self.get_by_id(material_id)
        if instance is None:
            return None

        if "code" in fields and fields["code"] is not None:
            fields["code"] = str(fields["code"]).strip().upper()

        for key, value in fields.items():
            if hasattr(instance, key):
                setattr(instance, key, value)

        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete(self, material_id: int) -> bool:
        """Delete a material. Raises ValueError if it has samples.

        Args:
            material_id: ID of the material to delete

        Returns:
            True if deleted

        Raises:
            ValueError: If the material has associated samples
        """
        if await self.has_samples(material_id):
            raise ValueError(
                "Cannot delete material with associated samples. "
                "Reassign or remove samples first."
            )

        instance = await self.get_by_id(material_id)
        if instance is None:
            return False

        await self.session.delete(instance)
        await self.session.flush()
        return True

    async def has_samples(self, material_id: int) -> bool:
        """Check whether a material has any associated samples.

        Args:
            material_id: ID of the material to check

        Returns:
            True if the material has samples
        """
        stmt = (
            select(func.count())
            .select_from(Sample)
            .where(Sample.material_id == material_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one() > 0
