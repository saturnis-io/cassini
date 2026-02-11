"""Plant repository for database operations."""

from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.plant import Plant


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
