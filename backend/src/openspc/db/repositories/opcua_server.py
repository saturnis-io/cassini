"""Repository for OPC-UA Server operations."""

from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.opcua_server import OPCUAServer
from openspc.db.repositories.base import BaseRepository


class OPCUAServerRepository(BaseRepository[OPCUAServer]):
    """Repository for OPC-UA Server CRUD operations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, OPCUAServer)

    async def get_by_name(self, name: str) -> OPCUAServer | None:
        stmt = select(OPCUAServer).where(OPCUAServer.name == name)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_active(self) -> list[OPCUAServer]:
        stmt = select(OPCUAServer).where(OPCUAServer.is_active == True)  # noqa: E712
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_all_filtered(
        self,
        active_only: bool = False,
        plant_id: Optional[int] = None,
    ) -> Sequence[OPCUAServer]:
        stmt = select(OPCUAServer)
        if active_only:
            stmt = stmt.where(OPCUAServer.is_active == True)  # noqa: E712
        if plant_id is not None:
            stmt = stmt.where(OPCUAServer.plant_id == plant_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_by_plant(
        self,
        plant_id: int,
        active_only: bool = False,
    ) -> Sequence[OPCUAServer]:
        return await self.get_all_filtered(
            active_only=active_only, plant_id=plant_id
        )
