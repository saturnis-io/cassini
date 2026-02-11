"""Repository for MQTT Broker operations."""

from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.broker import MQTTBroker
from openspc.db.repositories.base import BaseRepository


class BrokerRepository(BaseRepository[MQTTBroker]):
    """Repository for MQTT Broker CRUD operations.

    Provides methods for managing MQTT broker configurations
    including finding active brokers.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize the repository.

        Args:
            session: SQLAlchemy async session for database operations
        """
        super().__init__(session, MQTTBroker)

    async def get_by_name(self, name: str) -> MQTTBroker | None:
        """Get broker by unique name.

        Args:
            name: Broker name to search for

        Returns:
            The broker if found, None otherwise
        """
        stmt = select(MQTTBroker).where(MQTTBroker.name == name)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_active(self) -> MQTTBroker | None:
        """Get the currently active broker configuration.

        Returns:
            The active broker if one exists, None otherwise
        """
        stmt = select(MQTTBroker).where(MQTTBroker.is_active == True).limit(1)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_active(self) -> list[MQTTBroker]:
        """Get all active broker configurations.

        Returns:
            List of active brokers
        """
        stmt = select(MQTTBroker).where(MQTTBroker.is_active == True)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def set_active(self, broker_id: int) -> MQTTBroker | None:
        """Set a broker as active (deactivates others).

        Args:
            broker_id: ID of the broker to activate

        Returns:
            The activated broker if found, None otherwise
        """
        # Deactivate all brokers first
        all_brokers = await self.get_all()
        for broker in all_brokers:
            broker.is_active = False

        # Activate the specified broker
        broker = await self.get_by_id(broker_id)
        if broker:
            broker.is_active = True
            await self.session.flush()
            await self.session.refresh(broker)

        return broker

    async def get_all_filtered(
        self,
        active_only: bool = False,
        plant_id: Optional[int] = None,
    ) -> Sequence[MQTTBroker]:
        """Get all brokers, optionally filtered by active status and plant.

        Args:
            active_only: If True, only return active brokers
            plant_id: If provided, filter by plant ID

        Returns:
            List of brokers matching the filters
        """
        stmt = select(MQTTBroker)
        if active_only:
            stmt = stmt.where(MQTTBroker.is_active == True)  # noqa: E712
        if plant_id is not None:
            stmt = stmt.where(MQTTBroker.plant_id == plant_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_outbound_enabled(self) -> list[MQTTBroker]:
        """Get all active brokers with outbound publishing enabled.

        Returns:
            List of active brokers where outbound_enabled is True
        """
        stmt = select(MQTTBroker).where(
            MQTTBroker.is_active == True,  # noqa: E712
            MQTTBroker.outbound_enabled == True,  # noqa: E712
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_plant(
        self,
        plant_id: int,
        active_only: bool = False,
    ) -> Sequence[MQTTBroker]:
        """Get all brokers for a plant.

        Args:
            plant_id: ID of the plant to filter by
            active_only: If True, only return active brokers

        Returns:
            List of brokers belonging to the plant
        """
        return await self.get_all_filtered(active_only=active_only, plant_id=plant_id)
