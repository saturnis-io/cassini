"""Repository for RetentionPolicy model with inheritance resolution."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.characteristic import Characteristic
from openspc.db.models.hierarchy import Hierarchy
from openspc.db.models.retention_policy import RetentionPolicy
from openspc.db.repositories.base import BaseRepository


# Default policy returned when no explicit global default exists
_FOREVER_DEFAULT: dict[str, Any] = {
    "retention_type": "forever",
    "retention_value": None,
    "retention_unit": None,
}


class RetentionRepository(BaseRepository[RetentionPolicy]):
    """Repository for retention policy CRUD and inheritance resolution."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, RetentionPolicy)

    # ------------------------------------------------------------------
    # Global default
    # ------------------------------------------------------------------

    async def get_global_default(self, plant_id: int) -> RetentionPolicy | None:
        """Get the global default retention policy for a plant."""
        stmt = select(RetentionPolicy).where(
            RetentionPolicy.plant_id == plant_id,
            RetentionPolicy.scope == "global",
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def set_global_default(
        self,
        plant_id: int,
        retention_type: str,
        retention_value: int | None = None,
        retention_unit: str | None = None,
    ) -> RetentionPolicy:
        """Create or update the global default retention policy for a plant."""
        existing = await self.get_global_default(plant_id)
        if existing:
            existing.retention_type = retention_type
            existing.retention_value = retention_value
            existing.retention_unit = retention_unit
            await self.session.flush()
            await self.session.refresh(existing)
            return existing

        policy = RetentionPolicy(
            plant_id=plant_id,
            scope="global",
            hierarchy_id=None,
            characteristic_id=None,
            retention_type=retention_type,
            retention_value=retention_value,
            retention_unit=retention_unit,
        )
        self.session.add(policy)
        await self.session.flush()
        await self.session.refresh(policy)
        return policy

    # ------------------------------------------------------------------
    # Hierarchy-level overrides
    # ------------------------------------------------------------------

    async def get_hierarchy_policy(self, hierarchy_id: int) -> RetentionPolicy | None:
        """Get the retention override for a specific hierarchy node."""
        stmt = select(RetentionPolicy).where(
            RetentionPolicy.scope == "hierarchy",
            RetentionPolicy.hierarchy_id == hierarchy_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def set_hierarchy_policy(
        self,
        hierarchy_id: int,
        plant_id: int,
        retention_type: str,
        retention_value: int | None = None,
        retention_unit: str | None = None,
    ) -> RetentionPolicy:
        """Create or update a hierarchy-level retention override."""
        existing = await self.get_hierarchy_policy(hierarchy_id)
        if existing:
            existing.retention_type = retention_type
            existing.retention_value = retention_value
            existing.retention_unit = retention_unit
            await self.session.flush()
            await self.session.refresh(existing)
            return existing

        policy = RetentionPolicy(
            plant_id=plant_id,
            scope="hierarchy",
            hierarchy_id=hierarchy_id,
            characteristic_id=None,
            retention_type=retention_type,
            retention_value=retention_value,
            retention_unit=retention_unit,
        )
        self.session.add(policy)
        await self.session.flush()
        await self.session.refresh(policy)
        return policy

    async def delete_hierarchy_policy(self, hierarchy_id: int) -> bool:
        """Remove a hierarchy-level retention override. Returns True if deleted."""
        stmt = delete(RetentionPolicy).where(
            RetentionPolicy.scope == "hierarchy",
            RetentionPolicy.hierarchy_id == hierarchy_id,
        )
        result = await self.session.execute(stmt)
        return result.rowcount > 0

    # ------------------------------------------------------------------
    # Characteristic-level overrides
    # ------------------------------------------------------------------

    async def get_characteristic_policy(
        self, characteristic_id: int
    ) -> RetentionPolicy | None:
        """Get the retention override for a specific characteristic."""
        stmt = select(RetentionPolicy).where(
            RetentionPolicy.scope == "characteristic",
            RetentionPolicy.characteristic_id == characteristic_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def set_characteristic_policy(
        self,
        characteristic_id: int,
        plant_id: int,
        retention_type: str,
        retention_value: int | None = None,
        retention_unit: str | None = None,
    ) -> RetentionPolicy:
        """Create or update a characteristic-level retention override."""
        existing = await self.get_characteristic_policy(characteristic_id)
        if existing:
            existing.retention_type = retention_type
            existing.retention_value = retention_value
            existing.retention_unit = retention_unit
            await self.session.flush()
            await self.session.refresh(existing)
            return existing

        policy = RetentionPolicy(
            plant_id=plant_id,
            scope="characteristic",
            hierarchy_id=None,
            characteristic_id=characteristic_id,
            retention_type=retention_type,
            retention_value=retention_value,
            retention_unit=retention_unit,
        )
        self.session.add(policy)
        await self.session.flush()
        await self.session.refresh(policy)
        return policy

    async def delete_characteristic_policy(self, characteristic_id: int) -> bool:
        """Remove a characteristic-level retention override. Returns True if deleted."""
        stmt = delete(RetentionPolicy).where(
            RetentionPolicy.scope == "characteristic",
            RetentionPolicy.characteristic_id == characteristic_id,
        )
        result = await self.session.execute(stmt)
        return result.rowcount > 0

    # ------------------------------------------------------------------
    # Inheritance resolution
    # ------------------------------------------------------------------

    async def resolve_effective_policy(
        self, characteristic_id: int
    ) -> dict[str, Any]:
        """Resolve the effective retention policy for a characteristic.

        Walks the inheritance chain:
        1. Characteristic-level override
        2. Parent hierarchy overrides (bottom-up)
        3. Global plant default
        4. Implicit "forever" if nothing is configured

        Returns a dict with:
        - retention_type, retention_value, retention_unit
        - source: 'characteristic' | 'hierarchy' | 'global' | 'default'
        - source_id: ID of the source entity (or None for default)
        - source_name: Name of the source entity
        """
        # 1. Check characteristic-level override
        char_policy = await self.get_characteristic_policy(characteristic_id)
        if char_policy:
            return {
                "retention_type": char_policy.retention_type,
                "retention_value": char_policy.retention_value,
                "retention_unit": char_policy.retention_unit,
                "source": "characteristic",
                "source_id": characteristic_id,
                "source_name": None,  # Caller can enrich
            }

        # 2. Get the characteristic's hierarchy_id and plant_id
        char_row = (
            await self.session.execute(
                select(Characteristic.hierarchy_id)
                .where(Characteristic.id == characteristic_id)
            )
        ).scalar_one_or_none()
        if char_row is None:
            return {**_FOREVER_DEFAULT, "source": "default", "source_id": None, "source_name": None}

        hierarchy_id = char_row

        # Load all hierarchy nodes for this plant in one query to walk ancestors
        node = (
            await self.session.execute(
                select(Hierarchy).where(Hierarchy.id == hierarchy_id)
            )
        ).scalar_one_or_none()
        if node is None:
            return {**_FOREVER_DEFAULT, "source": "default", "source_id": None, "source_name": None}

        plant_id = node.plant_id

        # Load all nodes for this plant
        all_nodes_result = await self.session.execute(
            select(Hierarchy).where(Hierarchy.plant_id == plant_id)
        )
        all_nodes = list(all_nodes_result.scalars().all())
        node_map = {n.id: n for n in all_nodes}

        # Load all hierarchy-level policies for this plant in one query
        hierarchy_policies_result = await self.session.execute(
            select(RetentionPolicy).where(
                RetentionPolicy.plant_id == plant_id,
                RetentionPolicy.scope == "hierarchy",
            )
        )
        hierarchy_policies = {
            p.hierarchy_id: p
            for p in hierarchy_policies_result.scalars().all()
        }

        # Walk up the hierarchy chain
        current_id = hierarchy_id
        while current_id is not None:
            if current_id in hierarchy_policies:
                policy = hierarchy_policies[current_id]
                current_node = node_map.get(current_id)
                return {
                    "retention_type": policy.retention_type,
                    "retention_value": policy.retention_value,
                    "retention_unit": policy.retention_unit,
                    "source": "hierarchy",
                    "source_id": current_id,
                    "source_name": current_node.name if current_node else None,
                }
            current_node = node_map.get(current_id)
            current_id = current_node.parent_id if current_node else None

        # 3. Check global default
        global_policy = await self.get_global_default(plant_id)
        if global_policy:
            return {
                "retention_type": global_policy.retention_type,
                "retention_value": global_policy.retention_value,
                "retention_unit": global_policy.retention_unit,
                "source": "global",
                "source_id": plant_id,
                "source_name": None,
            }

        # 4. Implicit forever
        return {
            **_FOREVER_DEFAULT,
            "source": "default",
            "source_id": None,
            "source_name": None,
        }

    # ------------------------------------------------------------------
    # List overrides
    # ------------------------------------------------------------------

    async def list_overrides(self, plant_id: int) -> list[RetentionPolicy]:
        """List all non-global retention overrides for a plant."""
        stmt = (
            select(RetentionPolicy)
            .where(
                RetentionPolicy.plant_id == plant_id,
                RetentionPolicy.scope != "global",
            )
            .order_by(RetentionPolicy.scope, RetentionPolicy.id)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
