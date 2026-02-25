"""Repository for ERP/LIMS connector CRUD and related entities."""
from __future__ import annotations

from typing import Any, Optional, Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.db.models.erp_connector import (
    ERPConnector,
    ERPFieldMapping,
    ERPSyncLog,
    ERPSyncSchedule,
)
from openspc.db.repositories.base import BaseRepository


class ERPConnectorRepository(BaseRepository[ERPConnector]):
    """CRUD operations for ERP connectors and their child entities.

    Follows the plant-scoped pattern: all listing operations require a
    ``plant_id`` filter.  Child entities (field mappings, schedules,
    sync logs) are accessed through connector-scoped methods.
    """

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, ERPConnector)

    # ------------------------------------------------------------------
    # Connector CRUD
    # ------------------------------------------------------------------

    async def get_by_id(
        self,
        connector_id: int,
        options: Sequence[Any] | None = None,
    ) -> ERPConnector | None:
        """Get a connector by ID, eager-loading children."""
        stmt = (
            select(ERPConnector)
            .where(ERPConnector.id == connector_id)
            .options(
                selectinload(ERPConnector.field_mappings),
                selectinload(ERPConnector.schedules),
            )
        )
        if options:
            stmt = stmt.options(*options)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all(
        self,
        plant_id: int | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[ERPConnector]:
        """List connectors for a plant (or all if plant_id is None).

        Args:
            plant_id: Filter to a specific plant.
            offset: Pagination offset.
            limit: Maximum rows to return.

        Returns:
            List of ERPConnector instances.
        """
        stmt = select(ERPConnector)
        if plant_id is not None:
            stmt = stmt.where(ERPConnector.plant_id == plant_id)
        stmt = (
            stmt.options(
                selectinload(ERPConnector.field_mappings),
                selectinload(ERPConnector.schedules),
            )
            .order_by(ERPConnector.name)
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, **kwargs: Any) -> ERPConnector:
        """Create a new ERP connector.

        Args:
            **kwargs: Column values for ERPConnector.

        Returns:
            The newly created ERPConnector row.
        """
        connector = ERPConnector(**kwargs)
        self.session.add(connector)
        await self.session.flush()
        await self.session.refresh(connector)
        return connector

    async def update(self, connector_id: int, **kwargs: Any) -> ERPConnector | None:
        """Update an existing connector's scalar fields.

        Args:
            connector_id: PK of the connector.
            **kwargs: Column values to update.

        Returns:
            Updated ERPConnector or None if not found.
        """
        connector = await self.get_by_id(connector_id)
        if connector is None:
            return None

        for key, value in kwargs.items():
            if hasattr(connector, key):
                setattr(connector, key, value)

        await self.session.flush()
        await self.session.refresh(connector)
        return connector

    async def delete(self, connector_id: int) -> bool:
        """Delete a connector and all children (CASCADE).

        Args:
            connector_id: PK of the connector to remove.

        Returns:
            True if deleted, False if not found.
        """
        connector = await self.get_by_id(connector_id)
        if connector is None:
            return False

        await self.session.delete(connector)
        await self.session.flush()
        return True

    async def get_active_connectors(self, plant_id: int) -> list[ERPConnector]:
        """Get all active connectors for a plant with outbound field mappings.

        Useful for the sync scheduler to determine which connectors need
        outbound processing.

        Args:
            plant_id: The plant to query.

        Returns:
            Active ERPConnector rows with field_mappings and schedules loaded.
        """
        stmt = (
            select(ERPConnector)
            .where(
                ERPConnector.plant_id == plant_id,
                ERPConnector.is_active == True,  # noqa: E712
            )
            .options(
                selectinload(ERPConnector.field_mappings),
                selectinload(ERPConnector.schedules),
            )
            .order_by(ERPConnector.name)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Field Mapping CRUD
    # ------------------------------------------------------------------

    async def get_mappings(self, connector_id: int) -> list[ERPFieldMapping]:
        """Get all field mappings for a connector.

        Args:
            connector_id: FK to erp_connector.

        Returns:
            List of ERPFieldMapping rows.
        """
        stmt = (
            select(ERPFieldMapping)
            .where(ERPFieldMapping.connector_id == connector_id)
            .order_by(ERPFieldMapping.name)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_mapping(self, **kwargs: Any) -> ERPFieldMapping:
        """Create a new field mapping.

        Args:
            **kwargs: Column values for ERPFieldMapping (must include connector_id).

        Returns:
            The newly created ERPFieldMapping row.
        """
        mapping = ERPFieldMapping(**kwargs)
        self.session.add(mapping)
        await self.session.flush()
        await self.session.refresh(mapping)
        return mapping

    async def update_mapping(
        self, mapping_id: int, **kwargs: Any
    ) -> ERPFieldMapping | None:
        """Update an existing field mapping.

        Args:
            mapping_id: PK of the mapping.
            **kwargs: Column values to update.

        Returns:
            Updated ERPFieldMapping or None if not found.
        """
        stmt = select(ERPFieldMapping).where(ERPFieldMapping.id == mapping_id)
        result = await self.session.execute(stmt)
        mapping = result.scalar_one_or_none()
        if mapping is None:
            return None

        for key, value in kwargs.items():
            if hasattr(mapping, key):
                setattr(mapping, key, value)

        await self.session.flush()
        await self.session.refresh(mapping)
        return mapping

    async def delete_mapping(self, mapping_id: int) -> bool:
        """Delete a field mapping by PK.

        Args:
            mapping_id: PK of the mapping to remove.

        Returns:
            True if deleted, False if not found.
        """
        stmt = select(ERPFieldMapping).where(ERPFieldMapping.id == mapping_id)
        result = await self.session.execute(stmt)
        mapping = result.scalar_one_or_none()
        if mapping is None:
            return False

        await self.session.delete(mapping)
        await self.session.flush()
        return True

    # ------------------------------------------------------------------
    # Schedule CRUD
    # ------------------------------------------------------------------

    async def get_schedule(self, connector_id: int) -> list[ERPSyncSchedule]:
        """Get all sync schedules for a connector.

        Args:
            connector_id: FK to erp_connector.

        Returns:
            List of ERPSyncSchedule rows (at most 2: inbound + outbound).
        """
        stmt = (
            select(ERPSyncSchedule)
            .where(ERPSyncSchedule.connector_id == connector_id)
            .order_by(ERPSyncSchedule.direction)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_schedule(
        self,
        connector_id: int,
        direction: str,
        cron_expression: str,
        is_active: bool = True,
    ) -> ERPSyncSchedule:
        """Create or update a sync schedule for a connector/direction pair.

        The (connector_id, direction) pair is unique, so this performs an
        upsert: create if absent, update if present.

        Args:
            connector_id: FK to erp_connector.
            direction: ``'inbound'`` or ``'outbound'``.
            cron_expression: Cron string (e.g. ``'0 */6 * * *'``).
            is_active: Whether the schedule is enabled.

        Returns:
            The created or updated ERPSyncSchedule row.
        """
        stmt = select(ERPSyncSchedule).where(
            ERPSyncSchedule.connector_id == connector_id,
            ERPSyncSchedule.direction == direction,
        )
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.cron_expression = cron_expression
            existing.is_active = is_active
            await self.session.flush()
            await self.session.refresh(existing)
            return existing

        schedule = ERPSyncSchedule(
            connector_id=connector_id,
            direction=direction,
            cron_expression=cron_expression,
            is_active=is_active,
        )
        self.session.add(schedule)
        await self.session.flush()
        await self.session.refresh(schedule)
        return schedule

    # ------------------------------------------------------------------
    # Sync Log
    # ------------------------------------------------------------------

    async def create_log(self, **kwargs: Any) -> ERPSyncLog:
        """Create a new sync log entry.

        Args:
            **kwargs: Column values for ERPSyncLog (must include connector_id,
                      direction, status, started_at).

        Returns:
            The newly created ERPSyncLog row.
        """
        log = ERPSyncLog(**kwargs)
        self.session.add(log)
        await self.session.flush()
        await self.session.refresh(log)
        return log

    async def get_logs(
        self,
        connector_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ERPSyncLog], int]:
        """Get sync logs for a connector with pagination.

        Args:
            connector_id: FK to erp_connector.
            limit: Maximum rows to return.
            offset: Pagination offset.

        Returns:
            Tuple of (logs, total_count).
        """
        count_stmt = (
            select(func.count())
            .select_from(ERPSyncLog)
            .where(ERPSyncLog.connector_id == connector_id)
        )
        total = (await self.session.execute(count_stmt)).scalar_one()

        stmt = (
            select(ERPSyncLog)
            .where(ERPSyncLog.connector_id == connector_id)
            .order_by(ERPSyncLog.started_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all()), total

    async def get_latest_log(self, connector_id: int) -> ERPSyncLog | None:
        """Get the most recent sync log entry for a connector.

        Args:
            connector_id: FK to erp_connector.

        Returns:
            The latest ERPSyncLog or None if no logs exist.
        """
        stmt = (
            select(ERPSyncLog)
            .where(ERPSyncLog.connector_id == connector_id)
            .order_by(ERPSyncLog.started_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
