"""Plant repository for database operations."""

from typing import Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.plant import Plant
from cassini.db.models.sample import Sample


class PlantRepository:
    """Repository for Plant CRUD operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self, active_only: bool = False) -> Sequence[Plant]:
        """Get all plants, optionally filtered by active status."""
        stmt = select(Plant)
        if active_only:
            stmt = stmt.where(Plant.is_active == True)  # noqa: E712
        stmt = stmt.order_by(Plant.name)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_by_id(self, plant_id: int) -> Optional[Plant]:
        """Get a plant by ID."""
        stmt = select(Plant).where(Plant.id == plant_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_code(self, code: str) -> Optional[Plant]:
        """Get a plant by code."""
        stmt = select(Plant).where(Plant.code == code)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(
        self,
        name: str,
        code: str,
        is_active: bool = True,
        settings: Optional[dict] = None,
    ) -> Plant:
        """Create a new plant."""
        plant = Plant(
            name=name,
            code=code.upper(),
            is_active=is_active,
            settings=settings,
        )
        self.session.add(plant)
        await self.session.flush()
        await self.session.refresh(plant)
        return plant

    async def update(self, plant_id: int, **kwargs) -> Optional[Plant]:
        """Update a plant."""
        plant = await self.get_by_id(plant_id)
        if plant is None:
            return None

        for key, value in kwargs.items():
            if hasattr(plant, key) and value is not None:
                if key == "code":
                    value = value.upper()
                setattr(plant, key, value)

        await self.session.flush()
        await self.session.refresh(plant)
        return plant

    async def delete(self, plant_id: int) -> bool:
        """Delete a plant. Returns True if deleted, False if not found."""
        plant = await self.get_by_id(plant_id)
        if plant is None:
            return False

        await self.session.delete(plant)
        await self.session.flush()
        return True

    async def get_compliance_stats(self) -> list[dict]:
        """Get per-plant compliance statistics.

        Returns a list of dicts with plant info, characteristic count,
        and sample count for compliance enforcement.

        Uses a single query joining plant -> hierarchy (root only) ->
        characteristic -> sample with COUNT aggregation.
        """
        # Subquery: count characteristics per plant via root hierarchies
        char_count_sub = (
            select(
                Hierarchy.plant_id.label("plant_id"),
                func.count(Characteristic.id).label("char_count"),
            )
            .join(Characteristic, Characteristic.hierarchy_id == Hierarchy.id, isouter=True)
            .where(Hierarchy.plant_id.isnot(None))
            .group_by(Hierarchy.plant_id)
            .subquery()
        )

        # Subquery: count samples per plant via hierarchy -> characteristic -> sample
        sample_count_sub = (
            select(
                Hierarchy.plant_id.label("plant_id"),
                func.count(Sample.id).label("sample_count"),
            )
            .join(Characteristic, Characteristic.hierarchy_id == Hierarchy.id)
            .join(Sample, Sample.char_id == Characteristic.id, isouter=True)
            .where(Hierarchy.plant_id.isnot(None))
            .group_by(Hierarchy.plant_id)
            .subquery()
        )

        stmt = (
            select(
                Plant.id,
                Plant.name,
                Plant.code,
                Plant.is_active,
                func.coalesce(char_count_sub.c.char_count, 0).label("char_count"),
                func.coalesce(sample_count_sub.c.sample_count, 0).label("sample_count"),
            )
            .outerjoin(char_count_sub, char_count_sub.c.plant_id == Plant.id)
            .outerjoin(sample_count_sub, sample_count_sub.c.plant_id == Plant.id)
            .order_by(Plant.name)
        )

        result = await self.session.execute(stmt)
        rows = result.all()

        return [
            {
                "plant_id": row[0],
                "plant_name": row[1],
                "plant_code": row[2],
                "is_active": row[3],
                "characteristic_count": row[4],
                "sample_count": row[5],
            }
            for row in rows
        ]
