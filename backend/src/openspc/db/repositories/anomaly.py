"""Repository for anomaly detection models."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.anomaly import (
    AnomalyDetectorConfig,
    AnomalyEvent,
    AnomalyModelState,
)
from openspc.db.repositories.base import BaseRepository


class AnomalyConfigRepository(BaseRepository[AnomalyDetectorConfig]):
    """Repository for anomaly detector configuration."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, AnomalyDetectorConfig)

    async def get_by_char_id(
        self, char_id: int
    ) -> AnomalyDetectorConfig | None:
        """Get configuration for a characteristic.

        Args:
            char_id: Characteristic ID.

        Returns:
            Configuration if found, None otherwise.
        """
        stmt = select(AnomalyDetectorConfig).where(
            AnomalyDetectorConfig.char_id == char_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert(
        self, char_id: int, **kwargs: Any
    ) -> AnomalyDetectorConfig:
        """Create or update configuration for a characteristic.

        Args:
            char_id: Characteristic ID.
            **kwargs: Configuration fields to set.

        Returns:
            The created or updated configuration.
        """
        existing = await self.get_by_char_id(char_id)
        if existing:
            for key, value in kwargs.items():
                if hasattr(existing, key):
                    setattr(existing, key, value)
            existing.updated_at = datetime.now(timezone.utc)
            await self.session.flush()
            await self.session.refresh(existing)
            return existing
        else:
            config = AnomalyDetectorConfig(char_id=char_id, **kwargs)
            self.session.add(config)
            await self.session.flush()
            await self.session.refresh(config)
            return config

    async def delete_by_char_id(self, char_id: int) -> bool:
        """Delete configuration for a characteristic.

        Args:
            char_id: Characteristic ID.

        Returns:
            True if deleted, False if not found.
        """
        existing = await self.get_by_char_id(char_id)
        if existing is None:
            return False
        await self.session.delete(existing)
        await self.session.flush()
        return True


class AnomalyEventRepository(BaseRepository[AnomalyEvent]):
    """Repository for anomaly events."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, AnomalyEvent)

    async def get_events(
        self,
        char_id: int,
        detector_type: str | None = None,
        severity: str | None = None,
        acknowledged: bool | None = None,
        dismissed: bool | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> list[AnomalyEvent]:
        """Get anomaly events for a characteristic with filters.

        Args:
            char_id: Characteristic ID.
            detector_type: Optional filter by detector type.
            severity: Optional filter by severity.
            acknowledged: Optional filter by acknowledged state.
            dismissed: Optional filter by dismissed state.
            offset: Pagination offset.
            limit: Pagination limit.

        Returns:
            List of anomaly events ordered by detected_at descending.
        """
        stmt = (
            select(AnomalyEvent)
            .where(AnomalyEvent.char_id == char_id)
            .order_by(AnomalyEvent.detected_at.desc())
        )

        if detector_type is not None:
            stmt = stmt.where(AnomalyEvent.detector_type == detector_type)
        if severity is not None:
            stmt = stmt.where(AnomalyEvent.severity == severity)
        if acknowledged is not None:
            stmt = stmt.where(AnomalyEvent.is_acknowledged == acknowledged)
        if dismissed is not None:
            stmt = stmt.where(AnomalyEvent.is_dismissed == dismissed)

        stmt = stmt.offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_events(
        self,
        char_id: int,
        detector_type: str | None = None,
        severity: str | None = None,
        acknowledged: bool | None = None,
        dismissed: bool | None = None,
    ) -> int:
        """Count anomaly events matching filters.

        Args:
            char_id: Characteristic ID.
            detector_type: Optional filter.
            severity: Optional filter.
            acknowledged: Optional filter.
            dismissed: Optional filter.

        Returns:
            Count of matching events.
        """
        stmt = select(func.count()).select_from(AnomalyEvent).where(
            AnomalyEvent.char_id == char_id
        )

        if detector_type is not None:
            stmt = stmt.where(AnomalyEvent.detector_type == detector_type)
        if severity is not None:
            stmt = stmt.where(AnomalyEvent.severity == severity)
        if acknowledged is not None:
            stmt = stmt.where(AnomalyEvent.is_acknowledged == acknowledged)
        if dismissed is not None:
            stmt = stmt.where(AnomalyEvent.is_dismissed == dismissed)

        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def acknowledge(
        self, event_id: int, username: str
    ) -> AnomalyEvent | None:
        """Mark an anomaly event as acknowledged.

        Args:
            event_id: Event ID.
            username: Name of user acknowledging.

        Returns:
            Updated event, or None if not found.
        """
        event = await self.get_by_id(event_id)
        if event is None:
            return None

        event.is_acknowledged = True
        event.acknowledged_by = username
        event.acknowledged_at = datetime.now(timezone.utc)
        await self.session.flush()
        await self.session.refresh(event)
        return event

    async def dismiss(
        self, event_id: int, username: str, reason: str | None = None
    ) -> AnomalyEvent | None:
        """Dismiss an anomaly event as a false positive.

        Args:
            event_id: Event ID.
            username: Name of user dismissing.
            reason: Optional reason for dismissal.

        Returns:
            Updated event, or None if not found.
        """
        event = await self.get_by_id(event_id)
        if event is None:
            return None

        event.is_dismissed = True
        event.dismissed_by = username
        event.dismissed_reason = reason
        await self.session.flush()
        await self.session.refresh(event)
        return event

    async def get_active_events_for_plant(
        self,
        char_ids: list[int],
        offset: int = 0,
        limit: int = 50,
    ) -> list[AnomalyEvent]:
        """Get active (non-dismissed) anomaly events across multiple characteristics.

        Args:
            char_ids: List of characteristic IDs to query.
            offset: Pagination offset.
            limit: Pagination limit.

        Returns:
            List of active events ordered by detected_at descending.
        """
        if not char_ids:
            return []

        stmt = (
            select(AnomalyEvent)
            .where(
                AnomalyEvent.char_id.in_(char_ids),
                AnomalyEvent.is_dismissed == False,
            )
            .order_by(AnomalyEvent.detected_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_stats_for_plant(
        self, char_ids: list[int]
    ) -> dict[str, Any]:
        """Get summary statistics for anomaly events across characteristics.

        Args:
            char_ids: List of characteristic IDs.

        Returns:
            Dictionary with counts by type, severity, and acknowledged state.
        """
        if not char_ids:
            return {
                "total": 0,
                "active": 0,
                "acknowledged": 0,
                "dismissed": 0,
                "by_severity": {},
                "by_detector": {},
            }

        base_filter = AnomalyEvent.char_id.in_(char_ids)

        # Total count
        total = await self.session.execute(
            select(func.count())
            .select_from(AnomalyEvent)
            .where(base_filter)
        )
        total_count = total.scalar_one()

        # Active (not dismissed)
        active = await self.session.execute(
            select(func.count())
            .select_from(AnomalyEvent)
            .where(base_filter, AnomalyEvent.is_dismissed == False)
        )
        active_count = active.scalar_one()

        # Acknowledged
        acked = await self.session.execute(
            select(func.count())
            .select_from(AnomalyEvent)
            .where(base_filter, AnomalyEvent.is_acknowledged == True)
        )
        acked_count = acked.scalar_one()

        # Dismissed
        dismissed = await self.session.execute(
            select(func.count())
            .select_from(AnomalyEvent)
            .where(base_filter, AnomalyEvent.is_dismissed == True)
        )
        dismissed_count = dismissed.scalar_one()

        # By severity
        sev_rows = await self.session.execute(
            select(AnomalyEvent.severity, func.count())
            .where(base_filter, AnomalyEvent.is_dismissed == False)
            .group_by(AnomalyEvent.severity)
        )
        by_severity = {row[0]: row[1] for row in sev_rows.all()}

        # By detector type
        det_rows = await self.session.execute(
            select(AnomalyEvent.detector_type, func.count())
            .where(base_filter, AnomalyEvent.is_dismissed == False)
            .group_by(AnomalyEvent.detector_type)
        )
        by_detector = {row[0]: row[1] for row in det_rows.all()}

        return {
            "total": total_count,
            "active": active_count,
            "acknowledged": acked_count,
            "dismissed": dismissed_count,
            "by_severity": by_severity,
            "by_detector": by_detector,
        }

    async def get_latest_for_char(
        self,
        char_id: int,
        detector_type: str | None = None,
    ) -> AnomalyEvent | None:
        """Get the most recent event for a characteristic.

        Args:
            char_id: Characteristic ID.
            detector_type: Optional filter by detector type.

        Returns:
            Most recent event, or None.
        """
        stmt = (
            select(AnomalyEvent)
            .where(AnomalyEvent.char_id == char_id)
            .order_by(AnomalyEvent.detected_at.desc())
            .limit(1)
        )
        if detector_type is not None:
            stmt = stmt.where(AnomalyEvent.detector_type == detector_type)

        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


class AnomalyModelStateRepository(BaseRepository[AnomalyModelState]):
    """Repository for serialized ML model state."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, AnomalyModelState)

    async def get_by_char_and_type(
        self, char_id: int, detector_type: str
    ) -> AnomalyModelState | None:
        """Get model state for a characteristic and detector type.

        Args:
            char_id: Characteristic ID.
            detector_type: Detector type string.

        Returns:
            Model state if found, None otherwise.
        """
        stmt = select(AnomalyModelState).where(
            AnomalyModelState.char_id == char_id,
            AnomalyModelState.detector_type == detector_type,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
