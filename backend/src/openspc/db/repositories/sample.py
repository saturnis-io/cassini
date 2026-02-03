"""Repository for Sample model with rolling window queries."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.sample import Measurement, Sample
from openspc.db.repositories.base import BaseRepository


class SampleRepository(BaseRepository[Sample]):
    """Repository for Sample model with time-series operations.

    Provides methods for querying samples in rolling windows,
    date ranges, and creating samples with measurements atomically.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize sample repository.

        Args:
            session: SQLAlchemy async session for database operations
        """
        super().__init__(session, Sample)

    async def get_rolling_window(
        self, char_id: int, window_size: int = 25, exclude_excluded: bool = True
    ) -> list[Sample]:
        """Get the most recent N samples for a characteristic.

        This method returns samples in chronological order (oldest first),
        which is useful for SPC chart rendering.

        Args:
            char_id: ID of the characteristic to query
            window_size: Number of most recent samples to retrieve (default: 25)
            exclude_excluded: If True, filter out excluded samples (default: True)

        Returns:
            List of samples ordered by timestamp (oldest to newest)

        Example:
            # Get last 25 non-excluded samples for chart rendering
            samples = await repo.get_rolling_window(char_id=1, window_size=25)

            # Get last 50 samples including excluded ones
            samples = await repo.get_rolling_window(
                char_id=1, window_size=50, exclude_excluded=False
            )
        """
        stmt = (
            select(Sample)
            .where(Sample.char_id == char_id)
            .order_by(Sample.timestamp.desc())
            .limit(window_size)
        )

        if exclude_excluded:
            stmt = stmt.where(Sample.is_excluded == False)

        result = await self.session.execute(stmt)
        samples = list(result.scalars().all())

        # Reverse to get chronological order (oldest to newest)
        return list(reversed(samples))

    async def get_by_characteristic(
        self,
        char_id: int,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> list[Sample]:
        """Get samples for a characteristic within a date range.

        Args:
            char_id: ID of the characteristic to query
            start_date: Optional start of date range (inclusive)
            end_date: Optional end of date range (inclusive)

        Returns:
            List of samples ordered by timestamp (oldest to newest)

        Example:
            # Get all samples for a characteristic
            samples = await repo.get_by_characteristic(char_id=1)

            # Get samples from the last month
            from datetime import datetime, timedelta
            start = datetime.utcnow() - timedelta(days=30)
            samples = await repo.get_by_characteristic(char_id=1, start_date=start)

            # Get samples for a specific date range
            samples = await repo.get_by_characteristic(
                char_id=1,
                start_date=datetime(2025, 1, 1),
                end_date=datetime(2025, 1, 31)
            )
        """
        stmt = select(Sample).where(Sample.char_id == char_id)

        if start_date is not None:
            stmt = stmt.where(Sample.timestamp >= start_date)

        if end_date is not None:
            stmt = stmt.where(Sample.timestamp <= end_date)

        stmt = stmt.order_by(Sample.timestamp)

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create_with_measurements(
        self, char_id: int, values: list[float], **context: str | bool | None
    ) -> Sample:
        """Create a sample with multiple measurements atomically.

        This method creates a sample and all its measurements in a single
        transaction, ensuring data consistency.

        Args:
            char_id: ID of the characteristic this sample belongs to
            values: List of measurement values (length should match subgroup size)
            **context: Additional sample context (batch_number, operator_id, etc.)

        Returns:
            The created sample with measurements loaded

        Example:
            # Create single measurement sample
            sample = await repo.create_with_measurements(
                char_id=1,
                values=[10.5],
                batch_number="BATCH-001",
                operator_id="OPR-123"
            )

            # Create multi-measurement sample (subgroup size = 5)
            sample = await repo.create_with_measurements(
                char_id=2,
                values=[10.1, 10.2, 10.0, 10.3, 10.1],
                batch_number="BATCH-002"
            )
        """
        # Create the sample with context
        sample_data = {"char_id": char_id, **context}
        sample = Sample(**sample_data)
        self.session.add(sample)
        await self.session.flush()  # Get the sample ID

        # Create measurements for each value
        for value in values:
            measurement = Measurement(sample_id=sample.id, value=value)
            self.session.add(measurement)

        await self.session.flush()
        await self.session.refresh(sample)

        return sample
