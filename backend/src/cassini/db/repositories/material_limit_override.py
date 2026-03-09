"""Repository for MaterialLimitOverride model."""

from typing import TypedDict

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.characteristic import Characteristic
from cassini.db.models.material_class import MaterialClass
from cassini.db.models.material_limit_override import MaterialLimitOverride
from cassini.db.repositories.base import BaseRepository


class CharacteristicUsageRow(TypedDict):
    characteristic_id: int
    name: str
    hierarchy_id: int


class MaterialLimitOverrideRepository(BaseRepository[MaterialLimitOverride]):
    """Repository for per-characteristic material/class limit overrides.

    Provides methods for listing overrides, resolving the cascade chain
    for a specific material, and standard CRUD operations.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize material limit override repository.

        Args:
            session: SQLAlchemy async session for database operations
        """
        super().__init__(session, MaterialLimitOverride)

    async def list_by_characteristic(
        self, char_id: int
    ) -> list[MaterialLimitOverride]:
        """List all overrides for a characteristic.

        Results are ordered: class overrides first (by class path for tree
        order), then material overrides.

        Args:
            char_id: Characteristic ID

        Returns:
            List of overrides with material and material_class loaded
        """
        stmt = (
            select(MaterialLimitOverride)
            .where(MaterialLimitOverride.characteristic_id == char_id)
            .options(
                selectinload(MaterialLimitOverride.material),
                selectinload(MaterialLimitOverride.material_class),
            )
            .outerjoin(
                MaterialClass,
                MaterialLimitOverride.class_id == MaterialClass.id,
            )
            .order_by(
                # Class overrides first (class_id IS NOT NULL → 0), then materials (→ 1)
                case(
                    (MaterialLimitOverride.class_id.isnot(None), 0),
                    else_=1,
                ),
                MaterialClass.path,
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_overrides_for_resolution(
        self,
        char_id: int,
        material_id: int,
        ancestor_class_ids: list[int],
    ) -> list[MaterialLimitOverride]:
        """Get all overrides relevant to resolving limits for a material.

        Returns overrides for the exact material AND any of the ancestor
        class IDs, with material_class loaded for provenance display.
        This is the key method for cascade resolution.

        Args:
            char_id: Characteristic ID
            material_id: Material ID (exact match)
            ancestor_class_ids: List of ancestor class IDs (from material's class tree)

        Returns:
            List of matching overrides with material_class loaded
        """
        conditions = [
            MaterialLimitOverride.characteristic_id == char_id,
        ]

        # Build OR condition: material_id match OR class_id in ancestors
        material_or_class = MaterialLimitOverride.material_id == material_id
        if ancestor_class_ids:
            material_or_class = material_or_class | MaterialLimitOverride.class_id.in_(
                ancestor_class_ids
            )
        conditions.append(material_or_class)

        stmt = (
            select(MaterialLimitOverride)
            .where(*conditions)
            .options(selectinload(MaterialLimitOverride.material_class))
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(
        self,
        char_id: int,
        material_id: int | None = None,
        class_id: int | None = None,
        **limit_fields: object,
    ) -> MaterialLimitOverride:
        """Create a new limit override.

        Exactly one of material_id or class_id must be provided.

        Args:
            char_id: Characteristic ID
            material_id: Material ID (for material-level override)
            class_id: MaterialClass ID (for class-level override)
            **limit_fields: Limit values (ucl, lcl, stored_sigma, etc.)

        Returns:
            The created MaterialLimitOverride
        """
        instance = MaterialLimitOverride(
            characteristic_id=char_id,
            material_id=material_id,
            class_id=class_id,
            **limit_fields,
        )
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def update(
        self, override_id: int, **limit_fields: object
    ) -> MaterialLimitOverride | None:
        """Update limit fields on an existing override.

        Args:
            override_id: ID of the override to update
            **limit_fields: Limit values to update

        Returns:
            Updated override, or None if not found
        """
        instance = await self.get_by_id(override_id)
        if instance is None:
            return None

        for key, value in limit_fields.items():
            if hasattr(instance, key):
                setattr(instance, key, value)

        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete(self, override_id: int) -> bool:
        """Delete an override by ID.

        Args:
            override_id: ID of the override to delete

        Returns:
            True if deleted, False if not found
        """
        instance = await self.get_by_id(override_id)
        if instance is None:
            return False

        await self.session.delete(instance)
        await self.session.flush()
        return True

    async def list_characteristics_by_material(
        self, material_id: int
    ) -> list[CharacteristicUsageRow]:
        """Find all characteristics that have an override for a material.

        Args:
            material_id: Material ID to look up

        Returns:
            List of dicts with characteristic_id, name, and hierarchy_id
        """
        stmt = (
            select(
                Characteristic.id,
                Characteristic.name,
                Characteristic.hierarchy_id,
            )
            .join(
                MaterialLimitOverride,
                MaterialLimitOverride.characteristic_id == Characteristic.id,
            )
            .where(MaterialLimitOverride.material_id == material_id)
            .order_by(Characteristic.name)
        )
        result = await self.session.execute(stmt)
        return [
            CharacteristicUsageRow(
                characteristic_id=row.id,
                name=row.name,
                hierarchy_id=row.hierarchy_id,
            )
            for row in result.all()
        ]

    async def list_characteristics_by_class(
        self, class_id: int
    ) -> list[CharacteristicUsageRow]:
        """Find all characteristics that have an override for a material class.

        Args:
            class_id: MaterialClass ID to look up

        Returns:
            List of dicts with characteristic_id, name, and hierarchy_id
        """
        stmt = (
            select(
                Characteristic.id,
                Characteristic.name,
                Characteristic.hierarchy_id,
            )
            .join(
                MaterialLimitOverride,
                MaterialLimitOverride.characteristic_id == Characteristic.id,
            )
            .where(MaterialLimitOverride.class_id == class_id)
            .order_by(Characteristic.name)
        )
        result = await self.session.execute(stmt)
        return [
            CharacteristicUsageRow(
                characteristic_id=row.id,
                name=row.name,
                hierarchy_id=row.hierarchy_id,
            )
            for row in result.all()
        ]
