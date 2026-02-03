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
            stmt = select(Characteristic).where(Characteristic.hierarchy_id == hierarchy_id)
            result = await self.session.execute(stmt)
            return list(result.scalars().all())

        # Complex case: need to get all descendant hierarchy IDs
        from openspc.db.repositories.hierarchy import HierarchyRepository

        hierarchy_repo = HierarchyRepository(self.session)
        descendants = await hierarchy_repo.get_descendants(hierarchy_id)
        descendant_ids = [d.id for d in descendants]

        # Include the original hierarchy_id as well
        all_ids = [hierarchy_id] + descendant_ids

        stmt = select(Characteristic).where(Characteristic.hierarchy_id.in_(all_ids))
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_provider_type(self, provider_type: str) -> list[Characteristic]:
        """Get characteristics by provider type.

        Args:
            provider_type: Provider type to filter by (MANUAL, TAG, etc.)

        Returns:
            List of characteristics with the specified provider type

        Example:
            # Get all manually-entered characteristics
            manual_chars = await repo.get_by_provider_type("MANUAL")

            # Get all tag-based characteristics
            tag_chars = await repo.get_by_provider_type("TAG")
        """
        stmt = select(Characteristic).where(Characteristic.provider_type == provider_type)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

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
