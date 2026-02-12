"""Repository for PurgeHistory model."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.purge_history import PurgeHistory
from openspc.db.repositories.base import BaseRepository


class PurgeHistoryRepository(BaseRepository[PurgeHistory]):
    """Repository for purge history CRUD operations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, PurgeHistory)

    async def create_run(self, plant_id: int) -> PurgeHistory:
        """Create a new purge run record with status='running'."""
        run = PurgeHistory(
            plant_id=plant_id,
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        self.session.add(run)
        await self.session.flush()
        await self.session.refresh(run)
        return run

    async def complete_run(
        self,
        run_id: int,
        samples_deleted: int,
        violations_deleted: int,
        characteristics_processed: int,
    ) -> PurgeHistory:
        """Mark a purge run as completed with statistics."""
        run = await self.session.get(PurgeHistory, run_id)
        if run is None:
            raise ValueError(f"PurgeHistory {run_id} not found")
        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
        run.samples_deleted = samples_deleted
        run.violations_deleted = violations_deleted
        run.characteristics_processed = characteristics_processed
        await self.session.flush()
        await self.session.refresh(run)
        return run

    async def fail_run(self, run_id: int, error_message: str) -> PurgeHistory:
        """Mark a purge run as failed with an error message."""
        run = await self.session.get(PurgeHistory, run_id)
        if run is None:
            raise ValueError(f"PurgeHistory {run_id} not found")
        run.status = "failed"
        run.completed_at = datetime.now(timezone.utc)
        run.error_message = error_message
        await self.session.flush()
        await self.session.refresh(run)
        return run

    async def list_history(
        self, plant_id: int, limit: int = 20
    ) -> list[PurgeHistory]:
        """List purge history for a plant, most recent first."""
        stmt = (
            select(PurgeHistory)
            .where(PurgeHistory.plant_id == plant_id)
            .order_by(PurgeHistory.started_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_latest(self, plant_id: int) -> PurgeHistory | None:
        """Get the most recent purge run for a plant."""
        stmt = (
            select(PurgeHistory)
            .where(PurgeHistory.plant_id == plant_id)
            .order_by(PurgeHistory.started_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
