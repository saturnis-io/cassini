"""Repository for Sample model with rolling window queries."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.sample import Measurement, Sample
from cassini.db.repositories.base import BaseRepository


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

    async def get_by_id(self, id: int) -> Sample | None:
        """Get sample by ID with measurements eagerly loaded.

        Args:
            id: Sample ID

        Returns:
            Sample with measurements loaded, or None if not found
        """
        stmt = (
            select(Sample)
            .options(selectinload(Sample.measurements))
            .where(Sample.id == id)
            .execution_options(populate_existing=True)  # Force refresh of cached objects
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_rolling_window(
        self, char_id: int, window_size: int = 25, exclude_excluded: bool = True,
        material_id: int | None = None,
    ) -> list[Sample]:
        """Get the most recent N samples for a characteristic.

        This method returns samples in chronological order (oldest first),
        which is useful for SPC chart rendering.

        Args:
            char_id: ID of the characteristic to query
            window_size: Number of most recent samples to retrieve (default: 25)
            exclude_excluded: If True, filter out excluded samples (default: True)
            material_id: If set, only return samples with this material

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
            .options(selectinload(Sample.measurements))
            .where(Sample.char_id == char_id)
            .order_by(Sample.timestamp.desc())
            .limit(window_size)
            .execution_options(populate_existing=True)  # Force refresh of cached objects
        )

        if exclude_excluded:
            stmt = stmt.where(Sample.is_excluded == False)

        if material_id is not None:
            stmt = stmt.where(Sample.material_id == material_id)

        result = await self.session.execute(stmt)
        samples = list(result.scalars().all())

        # Reverse to get chronological order (oldest to newest)
        return list(reversed(samples))

    async def get_rolling_window_data(
        self, char_id: int, window_size: int = 25, exclude_excluded: bool = True,
        material_id: int | None = None,
    ) -> list[dict]:
        """Get rolling window sample data with measurement values pre-extracted.

        This method avoids lazy loading issues by extracting measurement values
        immediately after the query, returning plain dictionaries instead of ORM objects.

        Args:
            char_id: ID of the characteristic to query
            window_size: Number of most recent samples to retrieve (default: 25)
            exclude_excluded: If True, filter out excluded samples (default: True)
            material_id: If set, only return samples with this material

        Returns:
            List of dictionaries with sample_id, timestamp, and values (measurement list)
        """
        stmt = (
            select(Sample)
            .options(selectinload(Sample.measurements))
            .where(Sample.char_id == char_id)
            .order_by(Sample.timestamp.desc())
            .limit(window_size)
            .execution_options(populate_existing=True)
        )

        if exclude_excluded:
            stmt = stmt.where(Sample.is_excluded == False)

        if material_id is not None:
            stmt = stmt.where(Sample.material_id == material_id)

        result = await self.session.execute(stmt)
        samples = list(result.scalars().all())

        # Extract data immediately to avoid lazy loading issues
        data = []
        for sample in reversed(samples):  # Reverse for chronological order
            measurements = sample.measurements
            values = [m.value for m in measurements] if measurements else []
            data.append({
                "sample_id": sample.id,
                "timestamp": sample.timestamp,
                "values": values,
            })

        return data

    async def get_by_characteristic(
        self,
        char_id: int,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        material_id: int | None = None,
    ) -> list[Sample]:
        """Get samples for a characteristic within a date range.

        Args:
            char_id: ID of the characteristic to query
            start_date: Optional start of date range (inclusive)
            end_date: Optional end of date range (inclusive)
            material_id: If set, only return samples with this material

        Returns:
            List of samples ordered by timestamp (oldest to newest)

        Example:
            # Get all samples for a characteristic
            samples = await repo.get_by_characteristic(char_id=1)

            # Get samples from the last month
            from datetime import datetime, timedelta, timezone
            start = datetime.now(timezone.utc) - timedelta(days=30)
            samples = await repo.get_by_characteristic(char_id=1, start_date=start)

            # Get samples for a specific date range
            samples = await repo.get_by_characteristic(
                char_id=1,
                start_date=datetime(2025, 1, 1),
                end_date=datetime(2025, 1, 31)
            )
        """
        stmt = (
            select(Sample)
            .options(
                selectinload(Sample.measurements),
                selectinload(Sample.edit_history),
            )
            .where(Sample.char_id == char_id)
            .execution_options(populate_existing=True)  # Force refresh of cached objects
        )

        if start_date is not None:
            stmt = stmt.where(Sample.timestamp >= start_date)

        if end_date is not None:
            stmt = stmt.where(Sample.timestamp <= end_date)

        if material_id is not None:
            stmt = stmt.where(Sample.material_id == material_id)

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
        measurements = []
        for value in values:
            measurement = Measurement(sample_id=sample.id, value=value)
            self.session.add(measurement)
            measurements.append(measurement)

        await self.session.flush()

        # Use set_committed_value to attach measurements without triggering lazy loading
        # Direct assignment (sample.measurements = measurements) triggers a lazy load
        # to check the old value, which fails in async context
        from sqlalchemy.orm.attributes import set_committed_value
        set_committed_value(sample, "measurements", measurements)

        return sample

    async def create_attribute_sample(
        self,
        char_id: int,
        defect_count: int,
        sample_size: int | None = None,
        units_inspected: int | None = None,
        batch_number: str | None = None,
        operator_id: str | None = None,
        material_id: int | None = None,
    ) -> Sample:
        """Create a sample for attribute charts (no individual measurements).

        Attribute samples store defect/defective counts directly on the sample
        row rather than creating individual Measurement records.

        Args:
            char_id: Characteristic ID
            defect_count: Number of defects or defectives
            sample_size: Items inspected (p/np charts)
            units_inspected: Inspection units (u chart)
            batch_number: Optional batch identifier
            operator_id: Optional operator identifier

        Returns:
            The created Sample with attribute columns populated
        """
        sample = Sample(
            char_id=char_id,
            defect_count=defect_count,
            sample_size=sample_size,
            units_inspected=units_inspected,
            batch_number=batch_number,
            operator_id=operator_id,
            material_id=material_id,
            actual_n=sample_size or units_inspected or 1,
        )
        self.session.add(sample)
        await self.session.flush()

        # Set empty measurements list to avoid lazy load
        from sqlalchemy.orm.attributes import set_committed_value
        set_committed_value(sample, "measurements", [])

        return sample

    async def get_attribute_rolling_window(
        self,
        char_id: int,
        window_size: int = 100,
        exclude_excluded: bool = True,
        material_id: int | None = None,
    ) -> list[dict]:
        """Get recent attribute samples as plain dicts for limit/rule evaluation.

        Returns dicts with defect_count, sample_size, units_inspected to avoid
        lazy loading issues in async context.

        Args:
            char_id: Characteristic ID
            window_size: Number of recent samples
            exclude_excluded: Skip excluded samples
            material_id: If set, only return samples with this material

        Returns:
            List of dicts in chronological order (oldest first)
        """
        stmt = (
            select(Sample)
            .where(Sample.char_id == char_id)
            .order_by(Sample.timestamp.desc())
            .limit(window_size)
        )

        if exclude_excluded:
            stmt = stmt.where(Sample.is_excluded == False)

        if material_id is not None:
            stmt = stmt.where(Sample.material_id == material_id)

        result = await self.session.execute(stmt)
        samples = list(result.scalars().all())

        data = []
        for sample in reversed(samples):  # Chronological order
            data.append({
                "sample_id": sample.id,
                "timestamp": sample.timestamp,
                "defect_count": sample.defect_count or 0,
                "sample_size": sample.sample_size,
                "units_inspected": sample.units_inspected,
            })

        return data
