"""Repository for Violation model with acknowledgment tracking."""

from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.db.models.violation import Violation
from openspc.db.repositories.base import BaseRepository


class ViolationRepository(BaseRepository[Violation]):
    """Repository for Violation model with filtering and acknowledgment.

    Provides methods for querying unacknowledged violations and
    managing violation acknowledgment workflow.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize violation repository.

        Args:
            session: SQLAlchemy async session for database operations
        """
        super().__init__(session, Violation)

    async def get_unacknowledged(self, char_id: int | None = None) -> list[Violation]:
        """Get unacknowledged violations with optional characteristic filter.

        Args:
            char_id: Optional characteristic ID to filter by.
                If None, returns all unacknowledged violations.

        Returns:
            List of unacknowledged violations with sample data loaded

        Example:
            # Get all unacknowledged violations
            violations = await repo.get_unacknowledged()

            # Get unacknowledged violations for a specific characteristic
            violations = await repo.get_unacknowledged(char_id=1)
        """
        stmt = (
            select(Violation)
            .where(Violation.acknowledged == False)
            .options(selectinload(Violation.sample))
            .order_by(Violation.id.desc())
        )

        if char_id is not None:
            # Join with Sample to filter by characteristic
            from openspc.db.models.sample import Sample

            stmt = (
                stmt.join(Sample, Violation.sample_id == Sample.id).where(
                    Sample.char_id == char_id
                )
            )

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_sample(self, sample_id: int) -> list[Violation]:
        """Get all violations for a specific sample.

        Args:
            sample_id: ID of the sample to query

        Returns:
            List of violations for the sample

        Example:
            # Get all violations that occurred for a sample
            violations = await repo.get_by_sample(sample_id=42)
        """
        stmt = select(Violation).where(Violation.sample_id == sample_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def acknowledge(
        self, violation_id: int, user: str, reason: str
    ) -> Violation | None:
        """Acknowledge a violation with user and reason.

        This method updates the violation's acknowledgment status and
        records who acknowledged it, when, and why.

        Args:
            violation_id: ID of the violation to acknowledge
            user: Username or ID of the person acknowledging
            reason: Reason for acknowledging the violation

        Returns:
            The updated violation if found, None otherwise

        Example:
            # Acknowledge a violation
            violation = await repo.acknowledge(
                violation_id=42,
                user="john.doe",
                reason="False positive - equipment calibration was in progress"
            )
        """
        violation = await self.get_by_id(violation_id)
        if violation is None:
            return None

        violation.acknowledged = True
        violation.ack_user = user
        violation.ack_reason = reason
        violation.ack_timestamp = datetime.utcnow()

        await self.session.flush()
        await self.session.refresh(violation)

        return violation

    async def list_violations(
        self,
        characteristic_id: int | None = None,
        sample_id: int | None = None,
        acknowledged: bool | None = None,
        severity: str | None = None,
        rule_id: int | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> tuple[list[Violation], int]:
        """List violations with comprehensive filtering.

        Args:
            characteristic_id: Filter by characteristic ID
            sample_id: Filter by sample ID
            acknowledged: Filter by acknowledgment status
            severity: Filter by severity level
            rule_id: Filter by rule ID
            start_date: Filter by timestamp >= start_date
            end_date: Filter by timestamp <= end_date
            offset: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (violations list, total count)

        Example:
            # Get unacknowledged critical violations
            violations, total = await repo.list_violations(
                acknowledged=False,
                severity="CRITICAL",
                limit=20
            )
        """
        from openspc.db.models.sample import Sample

        # Build base query - load sample and its characteristic for context
        stmt = (
            select(Violation)
            .join(Sample, Violation.sample_id == Sample.id)
            .options(
                selectinload(Violation.sample).selectinload(Sample.characteristic)
            )
        )

        # Apply filters
        filters = []
        if characteristic_id is not None:
            filters.append(Sample.char_id == characteristic_id)
        if sample_id is not None:
            filters.append(Violation.sample_id == sample_id)
        if acknowledged is not None:
            filters.append(Violation.acknowledged == acknowledged)
        if severity is not None:
            filters.append(Violation.severity == severity)
        if rule_id is not None:
            filters.append(Violation.rule_id == rule_id)
        if start_date is not None:
            filters.append(Sample.timestamp >= start_date)
        if end_date is not None:
            filters.append(Sample.timestamp <= end_date)

        if filters:
            stmt = stmt.where(and_(*filters))

        # Count total
        count_stmt = select(func.count()).select_from(Violation).join(Sample)
        if filters:
            count_stmt = count_stmt.where(and_(*filters))
        count_result = await self.session.execute(count_stmt)
        total = count_result.scalar_one()

        # Apply ordering and pagination
        stmt = stmt.order_by(Violation.id.desc()).offset(offset).limit(limit)

        # Execute query
        result = await self.session.execute(stmt)
        violations = list(result.scalars().all())

        return violations, total
