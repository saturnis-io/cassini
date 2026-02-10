"""Repository for polymorphic DataSource operations."""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.db.models.data_source import DataSource, MQTTDataSource, OPCUADataSource, TriggerStrategy
from openspc.db.models.opcua_server import OPCUAServer
from openspc.db.repositories.base import BaseRepository

# Valid trigger strategies for OPC-UA (on_trigger is not supported)
OPCUA_VALID_STRATEGIES = {TriggerStrategy.ON_CHANGE.value, TriggerStrategy.ON_TIMER.value}


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
        Note: MQTTDataSource inherits from DataSource via JTI, so SQLAlchemy
        automatically joins the parent table. No explicit join needed.
        """
        stmt = (
            select(MQTTDataSource)
            .where(MQTTDataSource.is_active == True)  # noqa: E712
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
            .join(Characteristic, MQTTDataSource.characteristic_id == Characteristic.id)
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

    async def get_active_opcua_sources(self) -> list[OPCUADataSource]:
        """Get all active OPC-UA data sources with characteristic and server loaded.

        This is the primary query for OPCUAProvider initialization.
        Note: OPCUADataSource inherits from DataSource via JTI, so SQLAlchemy
        automatically joins the parent table. No explicit join needed.
        """
        stmt = (
            select(OPCUADataSource)
            .where(OPCUADataSource.is_active == True)  # noqa: E712
            .options(
                selectinload(OPCUADataSource.characteristic),
                selectinload(OPCUADataSource.server),
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_opcua_sources_for_plant(self, plant_id: int) -> list[OPCUADataSource]:
        """Get all OPC-UA data sources for a specific plant.

        Joins through the server's plant_id to filter by plant.
        """
        stmt = (
            select(OPCUADataSource)
            .join(OPCUAServer, OPCUADataSource.server_id == OPCUAServer.id)
            .where(OPCUAServer.plant_id == plant_id)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_opcua_source(
        self,
        characteristic_id: int,
        server_id: int,
        node_id: str,
        trigger_strategy: str = "on_change",
        sampling_interval: Optional[int] = None,
        publishing_interval: Optional[int] = None,
    ) -> OPCUADataSource:
        """Create a new OPC-UA data source linked to a characteristic and server.

        Raises:
            ValueError: If trigger_strategy is on_trigger (not supported for OPC-UA)
        """
        if trigger_strategy not in OPCUA_VALID_STRATEGIES:
            raise ValueError(
                f"Invalid trigger_strategy '{trigger_strategy}' for OPC-UA data source. "
                f"Only {sorted(OPCUA_VALID_STRATEGIES)} are supported."
            )
        source = OPCUADataSource(
            type="opcua",
            characteristic_id=characteristic_id,
            trigger_strategy=trigger_strategy,
            is_active=True,
            server_id=server_id,
            node_id=node_id,
            sampling_interval=sampling_interval,
            publishing_interval=publishing_interval,
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
