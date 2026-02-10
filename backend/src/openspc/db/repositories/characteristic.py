"""Repository for Characteristic model with hierarchy filtering."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.db.models.characteristic import Characteristic
from openspc.db.repositories.base import BaseRepository


class CharacteristicRepository(BaseRepository[Characteristic]):
    """Repository for Characteristic model with filtering capabilities.

    Provides methods for querying characteristics by hierarchy,
    provider type, and with eager-loaded relationships.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize characteristic repository.

        Args:
            session: SQLAlchemy async session for database operations
        """
        super().__init__(session, Characteristic)

    async def get_by_hierarchy(
        self, hierarchy_id: int, include_descendants: bool = False
    ) -> list[Characteristic]:
        """Get characteristics for a specific hierarchy node.

        Args:
            hierarchy_id: ID of the hierarchy node
            include_descendants: If True, include characteristics from all
                descendant hierarchy nodes (default: False)

        Returns:
            List of characteristics belonging to the hierarchy

        Example:
            # Get only characteristics directly under Line 1
            chars = await repo.get_by_hierarchy(hierarchy_id=2)

            # Get all characteristics under Factory A and its children
            chars = await repo.get_by_hierarchy(hierarchy_id=1, include_descendants=True)
        """
        if not include_descendants:
            # Simple case: only direct children
            stmt = (
                select(Characteristic)
                .where(Characteristic.hierarchy_id == hierarchy_id)
                .options(selectinload(Characteristic.data_source))
            )
            result = await self.session.execute(stmt)
            return list(result.scalars().all())

        # Complex case: need to get all descendant hierarchy IDs
        from openspc.db.repositories.hierarchy import HierarchyRepository

        hierarchy_repo = HierarchyRepository(self.session)
        descendants = await hierarchy_repo.get_descendants(hierarchy_id)
        descendant_ids = [d.id for d in descendants]

        # Include the original hierarchy_id as well
        all_ids = [hierarchy_id] + descendant_ids

        stmt = (
            select(Characteristic)
            .where(Characteristic.hierarchy_id.in_(all_ids))
            .options(selectinload(Characteristic.data_source))
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_provider_type(self, provider_type: str) -> list[Characteristic]:
        """Get characteristics by provider type.

        For 'MANUAL': returns chars with no DataSource.
        For protocol types ('TAG', 'MQTT', 'OPCUA'): returns chars with matching DataSource.
        'TAG' is treated as 'MQTT' for backward compatibility.
        """
        from openspc.db.models.data_source import DataSource

        if provider_type.upper() == "MANUAL":
            subq = select(DataSource.characteristic_id)
            stmt = select(Characteristic).where(
                Characteristic.id.notin_(subq)
            )
        else:
            ds_type = provider_type.lower()
            if ds_type == "tag":
                ds_type = "mqtt"
            stmt = (
                select(Characteristic)
                .join(DataSource, DataSource.characteristic_id == Characteristic.id)
                .where(DataSource.type == ds_type)
            )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_with_data_source(self, char_id: int) -> Characteristic | None:
        """Get a characteristic with its data source eagerly loaded."""
        from openspc.db.models.data_source import DataSource

        stmt = (
            select(Characteristic)
            .where(Characteristic.id == char_id)
            .options(selectinload(Characteristic.data_source))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_with_rules(self, char_id: int) -> Characteristic | None:
        """Get a characteristic with rules eagerly loaded.

        This method fetches a characteristic and its associated Nelson Rules
        configuration in a single query to avoid the N+1 query problem.

        Args:
            char_id: ID of the characteristic to retrieve

        Returns:
            Characteristic with rules loaded, or None if not found

        Example:
            char = await repo.get_with_rules(1)
            if char:
                for rule in char.rules:
                    print(f"Rule {rule.rule_id}: {rule.is_enabled}")
        """
        stmt = (
            select(Characteristic)
            .where(Characteristic.id == char_id)
            .options(selectinload(Characteristic.rules))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
