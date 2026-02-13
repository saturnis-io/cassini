"""Repository for ReportSchedule and ReportRun models."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.report_schedule import ReportRun, ReportSchedule
from openspc.db.repositories.base import BaseRepository


# Frequency -> minimum interval between runs
_FREQUENCY_INTERVALS = {
    "daily": timedelta(hours=23),
    "weekly": timedelta(days=6, hours=23),
    "monthly": timedelta(days=27),
}


class ReportScheduleRepository(BaseRepository[ReportSchedule]):
    """Repository for report schedule CRUD and run history management."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, ReportSchedule)

    async def get_by_plant(self, plant_id: int) -> list[ReportSchedule]:
        """Get all report schedules for a plant."""
        stmt = (
            select(ReportSchedule)
            .where(ReportSchedule.plant_id == plant_id)
            .order_by(ReportSchedule.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_active_schedules(self) -> list[ReportSchedule]:
        """Get all active report schedules across all plants."""
        stmt = select(ReportSchedule).where(
            ReportSchedule.is_active.is_(True)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_due_schedules(
        self, current_time: datetime | None = None
    ) -> list[ReportSchedule]:
        """Get schedules that are due for execution.

        A schedule is due when:
        - is_active = True
        - last_run_at is None (never run) OR enough time has passed based on frequency

        Args:
            current_time: Override current time for testing. Defaults to now UTC.

        Returns:
            List of schedules that should be run.
        """
        now = current_time or datetime.now(timezone.utc)
        active = await self.get_active_schedules()

        due = []
        for schedule in active:
            if schedule.last_run_at is None:
                due.append(schedule)
                continue

            interval = _FREQUENCY_INTERVALS.get(
                schedule.frequency, timedelta(days=1)
            )
            if now - schedule.last_run_at >= interval:
                due.append(schedule)

        return due

    async def update_last_run(
        self, schedule_id: int, run_time: datetime
    ) -> None:
        """Update the last_run_at timestamp for a schedule."""
        schedule = await self.get_by_id(schedule_id)
        if schedule:
            schedule.last_run_at = run_time
            await self.session.flush()

    async def create_run(
        self, schedule_id: int, started_at: datetime
    ) -> ReportRun:
        """Create a new report run record."""
        run = ReportRun(
            schedule_id=schedule_id,
            started_at=started_at,
            status="running",
        )
        self.session.add(run)
        await self.session.flush()
        await self.session.refresh(run)
        return run

    async def update_run_status(
        self,
        run_id: int,
        status: str,
        completed_at: datetime | None = None,
        error_message: str | None = None,
        recipients_count: int = 0,
        pdf_size_bytes: int | None = None,
    ) -> ReportRun | None:
        """Update a report run's status and metadata."""
        stmt = select(ReportRun).where(ReportRun.id == run_id)
        result = await self.session.execute(stmt)
        run = result.scalar_one_or_none()
        if run is None:
            return None

        run.status = status
        if completed_at:
            run.completed_at = completed_at
        if error_message is not None:
            run.error_message = error_message
        run.recipients_count = recipients_count
        if pdf_size_bytes is not None:
            run.pdf_size_bytes = pdf_size_bytes

        await self.session.flush()
        await self.session.refresh(run)
        return run

    async def get_runs(
        self, schedule_id: int, limit: int = 50
    ) -> list[ReportRun]:
        """Get run history for a schedule, newest first."""
        stmt = (
            select(ReportRun)
            .where(ReportRun.schedule_id == schedule_id)
            .order_by(ReportRun.started_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
