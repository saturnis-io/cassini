"""Repository for CapabilityHistory model."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.capability import CapabilityResult
from cassini.db.models.capability import CapabilityHistory
from cassini.db.repositories.base import BaseRepository


class CapabilityHistoryRepository(BaseRepository[CapabilityHistory]):
    """Repository for capability history snapshots."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, CapabilityHistory)

    async def create_from_result(
        self,
        characteristic_id: int,
        result: CapabilityResult,
        calculated_by: str,
    ) -> CapabilityHistory:
        """Save a capability calculation result as a history snapshot.

        Args:
            characteristic_id: The characteristic this snapshot belongs to.
            result: The calculated capability result.
            calculated_by: Username or 'system' that triggered the calculation.

        Returns:
            The created CapabilityHistory record.
        """
        snapshot = CapabilityHistory(
            characteristic_id=characteristic_id,
            cp=result.cp,
            cpk=result.cpk,
            pp=result.pp,
            ppk=result.ppk,
            cpm=result.cpm,
            sample_count=result.sample_count,
            normality_p_value=result.normality_p_value,
            normality_test=result.normality_test,
            calculated_at=result.calculated_at,
            calculated_by=calculated_by,
        )
        self.session.add(snapshot)
        await self.session.flush()
        await self.session.refresh(snapshot)
        return snapshot

    async def get_history(
        self,
        characteristic_id: int,
        limit: int = 50,
    ) -> list[CapabilityHistory]:
        """Get recent capability snapshots for a characteristic.

        Args:
            characteristic_id: The characteristic to query.
            limit: Maximum number of snapshots to return.

        Returns:
            List of snapshots ordered by calculated_at descending (most recent first).
        """
        stmt = (
            select(CapabilityHistory)
            .where(CapabilityHistory.characteristic_id == characteristic_id)
            .order_by(CapabilityHistory.calculated_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
