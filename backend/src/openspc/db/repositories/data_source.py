"""Repository for polymorphic DataSource operations."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.db.models.data_source import DataSource, MQTTDataSource
from openspc.db.repositories.base import BaseRepository


class DataSourceRepository(BaseRepository[DataSource]):
    """Repository for polymorphic DataSource operations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, DataSource)

    async def get_by_characteristic(self, char_id: int) -> DataSource | None:
        stmt = select(DataSource).where(DataSource.characteristic_id == char_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_mqtt_sources(self, broker_id: int | None = None) -> list[MQTTDataSource]:
        stmt = select(MQTTDataSource)
        if broker_id is not None:
            stmt = stmt.where(MQTTDataSource.broker_id == broker_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_active_mqtt_sources(self) -> list[MQTTDataSource]:
        """Get all active MQTT data sources with characteristic and broker loaded.

        This is the primary query for TagProvider initialization.
        """
        stmt = (
            select(MQTTDataSource)
            .join(DataSource, MQTTDataSource.id == DataSource.id)
            .where(DataSource.is_active == True)  # noqa: E712
            .options(
                selectinload(MQTTDataSource.characteristic),
                selectinload(MQTTDataSource.broker),
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_mqtt_sources_for_plant(self, plant_id: int) -> list[MQTTDataSource]:
        from openspc.db.models.characteristic import Characteristic
        from openspc.db.models.hierarchy import Hierarchy

        stmt = (
            select(MQTTDataSource)
            .join(DataSource, MQTTDataSource.id == DataSource.id)
            .join(Characteristic, DataSource.characteristic_id == Characteristic.id)
            .join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id)
            .where(Hierarchy.plant_id == plant_id)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_mqtt_source(
        self,
        characteristic_id: int,
        topic: str,
        broker_id: int | None = None,
        metric_name: str | None = None,
        trigger_tag: str | None = None,
        trigger_strategy: str = "on_change",
    ) -> MQTTDataSource:
        source = MQTTDataSource(
            type="mqtt",
            characteristic_id=characteristic_id,
            trigger_strategy=trigger_strategy,
            is_active=True,
            broker_id=broker_id,
            topic=topic,
            metric_name=metric_name,
            trigger_tag=trigger_tag,
        )
        self.session.add(source)
        await self.session.flush()
        await self.session.refresh(source)
        return source

    async def delete_for_characteristic(self, char_id: int) -> bool:
        source = await self.get_by_characteristic(char_id)
        if source is None:
            return False
        await self.session.delete(source)
        await self.session.flush()
        return True
