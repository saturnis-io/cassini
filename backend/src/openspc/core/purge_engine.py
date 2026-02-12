"""Retention purge engine — background service that enforces retention policies.

Periodically evaluates each characteristic's effective retention policy and
deletes expired samples. CASCADE FKs handle measurements, violations, and
edit history automatically.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import delete, func, select

from openspc.db.database import get_database
from openspc.db.models.characteristic import Characteristic
from openspc.db.models.plant import Plant
from openspc.db.models.sample import Sample
from openspc.db.models.violation import Violation
from openspc.db.repositories.purge_history import PurgeHistoryRepository
from openspc.db.repositories.retention import RetentionRepository

logger = structlog.get_logger(__name__)

# Batch size for delete operations to avoid long-running transactions
BATCH_SIZE = 1000

# Multipliers to convert retention_unit to timedelta
_UNIT_MULTIPLIERS = {
    "days": timedelta(days=1),
    "weeks": timedelta(weeks=1),
    "months": timedelta(days=30),
    "years": timedelta(days=365),
}


class PurgeEngine:
    """Background service that periodically purges expired SPC data."""

    def __init__(self, interval_hours: float = 24) -> None:
        self.interval_hours = interval_hours
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the background purge loop."""
        self._running = True
        self._task = asyncio.create_task(self._purge_loop())
        logger.info(
            "purge_engine_started",
            interval_hours=self.interval_hours,
        )

    async def stop(self) -> None:
        """Stop the background purge loop gracefully."""
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("purge_engine_stopped")

    async def _purge_loop(self) -> None:
        """Main loop — run purge then sleep for interval."""
        while self._running:
            try:
                await self._run_all_plants()
            except Exception:
                logger.exception("purge_engine_loop_error")
            # Sleep for the configured interval
            try:
                await asyncio.sleep(self.interval_hours * 3600)
            except asyncio.CancelledError:
                break

    async def _run_all_plants(self) -> None:
        """Run purge for every active plant."""
        db = get_database()
        async with db.session() as session:
            plants = (
                await session.execute(
                    select(Plant).where(Plant.is_active.is_(True))
                )
            ).scalars().all()

        for plant in plants:
            try:
                await self.run_purge(plant.id)
            except Exception:
                logger.exception("purge_plant_failed", plant_id=plant.id)

    async def run_purge(self, plant_id: int) -> dict:
        """Run retention purge for a single plant.

        Acquires a fresh session, resolves effective policies for all
        characteristics in the plant, and deletes expired data in batches.

        Returns a summary dict with counts.
        """
        db = get_database()
        total_samples_deleted = 0
        total_violations_deleted = 0
        chars_processed = 0
        run_id: int | None = None

        async with db.session() as session:
            # Create history record
            history_repo = PurgeHistoryRepository(session)
            run = await history_repo.create_run(plant_id)
            run_id = run.id

        try:
            async with db.session() as session:
                # Get all characteristics for this plant via hierarchy
                from openspc.db.models.hierarchy import Hierarchy

                char_rows = (
                    await session.execute(
                        select(Characteristic.id, Characteristic.hierarchy_id)
                        .join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id)
                        .where(Hierarchy.plant_id == plant_id)
                    )
                ).all()

                if not char_rows:
                    logger.info("purge_no_characteristics", plant_id=plant_id)

            # Process each characteristic
            for char_id, _hierarchy_id in char_rows:
                async with db.session() as session:
                    retention_repo = RetentionRepository(session)
                    effective = await retention_repo.resolve_effective_policy(char_id)

                retention_type = effective["retention_type"]
                if retention_type == "forever":
                    continue

                chars_processed += 1
                samples_del, violations_del = await self._purge_characteristic(
                    char_id, effective
                )
                total_samples_deleted += samples_del
                total_violations_deleted += violations_del

            # Mark run as completed
            async with db.session() as session:
                history_repo = PurgeHistoryRepository(session)
                await history_repo.complete_run(
                    run_id,
                    samples_deleted=total_samples_deleted,
                    violations_deleted=total_violations_deleted,
                    characteristics_processed=chars_processed,
                )

            logger.info(
                "purge_completed",
                plant_id=plant_id,
                samples_deleted=total_samples_deleted,
                violations_deleted=total_violations_deleted,
                characteristics_processed=chars_processed,
            )

        except Exception as e:
            # Mark run as failed
            if run_id is not None:
                try:
                    async with db.session() as session:
                        history_repo = PurgeHistoryRepository(session)
                        await history_repo.fail_run(run_id, str(e))
                except Exception:
                    logger.exception("purge_fail_record_error")
            raise

        return {
            "samples_deleted": total_samples_deleted,
            "violations_deleted": total_violations_deleted,
            "characteristics_processed": chars_processed,
        }

    async def _purge_characteristic(
        self, char_id: int, policy: dict
    ) -> tuple[int, int]:
        """Purge expired data for a single characteristic.

        Returns (samples_deleted, violations_deleted).
        """
        retention_type = policy["retention_type"]
        retention_value = policy["retention_value"]
        retention_unit = policy.get("retention_unit")

        if retention_type == "sample_count":
            return await self._purge_by_sample_count(char_id, retention_value)
        elif retention_type == "time_delta":
            return await self._purge_by_time_delta(
                char_id, retention_value, retention_unit
            )
        return (0, 0)

    async def _purge_by_sample_count(
        self, char_id: int, max_count: int
    ) -> tuple[int, int]:
        """Delete oldest samples beyond the max count for a characteristic."""
        db = get_database()
        total_samples = 0
        total_violations = 0

        async with db.session() as session:
            count_result = await session.execute(
                select(func.count(Sample.id)).where(Sample.char_id == char_id)
            )
            total = count_result.scalar_one()

        excess = total - max_count
        if excess <= 0:
            return (0, 0)

        # Delete in batches
        remaining = excess
        while remaining > 0:
            batch = min(remaining, BATCH_SIZE)
            async with db.session() as session:
                # Find the IDs of the oldest samples to delete
                oldest_ids_result = await session.execute(
                    select(Sample.id)
                    .where(Sample.char_id == char_id)
                    .order_by(Sample.timestamp.asc())
                    .limit(batch)
                )
                sample_ids = [row[0] for row in oldest_ids_result.all()]
                if not sample_ids:
                    break

                # Count violations that will be cascade-deleted
                viol_count_result = await session.execute(
                    select(func.count(Violation.id)).where(
                        Violation.sample_id.in_(sample_ids)
                    )
                )
                violations_in_batch = viol_count_result.scalar_one()

                # Delete samples (CASCADE handles measurements, violations, edit history)
                await session.execute(
                    delete(Sample).where(Sample.id.in_(sample_ids))
                )

                total_samples += len(sample_ids)
                total_violations += violations_in_batch
                remaining -= len(sample_ids)

        return (total_samples, total_violations)

    async def _purge_by_time_delta(
        self, char_id: int, value: int, unit: str
    ) -> tuple[int, int]:
        """Delete samples older than the time delta for a characteristic."""
        multiplier = _UNIT_MULTIPLIERS.get(unit)
        if multiplier is None:
            logger.warning("purge_unknown_unit", unit=unit, char_id=char_id)
            return (0, 0)

        cutoff = datetime.now(timezone.utc) - (multiplier * value)
        db = get_database()
        total_samples = 0
        total_violations = 0

        # Delete in batches
        while True:
            async with db.session() as session:
                # Find batch of sample IDs to delete
                sample_ids_result = await session.execute(
                    select(Sample.id)
                    .where(Sample.char_id == char_id, Sample.timestamp < cutoff)
                    .order_by(Sample.timestamp.asc())
                    .limit(BATCH_SIZE)
                )
                sample_ids = [row[0] for row in sample_ids_result.all()]
                if not sample_ids:
                    break

                # Count violations that will be cascade-deleted
                viol_count_result = await session.execute(
                    select(func.count(Violation.id)).where(
                        Violation.sample_id.in_(sample_ids)
                    )
                )
                violations_in_batch = viol_count_result.scalar_one()

                # Delete samples (CASCADE handles children)
                await session.execute(
                    delete(Sample).where(Sample.id.in_(sample_ids))
                )

                total_samples += len(sample_ids)
                total_violations += violations_in_batch

        return (total_samples, total_violations)
