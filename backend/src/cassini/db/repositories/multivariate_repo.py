"""Repositories for multivariate SPC and correlation analysis."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.multivariate import (
    CorrelationResult,
    MultivariateGroup,
    MultivariateGroupMember,
    MultivariateSample,
)
from cassini.db.repositories.base import BaseRepository


class MultivariateGroupRepository(BaseRepository[MultivariateGroup]):
    """CRUD and query operations for multivariate chart groups.

    All listing operations are plant-scoped.  Eagerly loads ``members``
    (and their associated characteristics) to avoid N+1 queries.
    """

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, MultivariateGroup)

    async def get_by_plant(self, plant_id: int) -> list[MultivariateGroup]:
        """List all multivariate groups for a plant with members loaded.

        Args:
            plant_id: Filter to a specific plant.

        Returns:
            List of MultivariateGroup instances with members eager-loaded.
        """
        stmt = (
            select(MultivariateGroup)
            .where(MultivariateGroup.plant_id == plant_id)
            .options(
                selectinload(MultivariateGroup.members).selectinload(
                    MultivariateGroupMember.characteristic
                ),
            )
            .order_by(MultivariateGroup.name)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_with_members(self, group_id: int) -> MultivariateGroup | None:
        """Get a single group with members and characteristics loaded.

        Args:
            group_id: PK of the multivariate group.

        Returns:
            MultivariateGroup with members loaded, or None if not found.
        """
        stmt = (
            select(MultivariateGroup)
            .where(MultivariateGroup.id == group_id)
            .options(
                selectinload(MultivariateGroup.members).selectinload(
                    MultivariateGroupMember.characteristic
                ),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_chart_data(
        self,
        group_id: int,
        limit: int = 200,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> list[MultivariateSample]:
        """Query T-squared chart data for a multivariate group.

        Args:
            group_id: FK to multivariate_group.
            limit: Maximum number of samples to return.
            start_date: Optional lower bound on sample_timestamp.
            end_date: Optional upper bound on sample_timestamp.

        Returns:
            List of MultivariateSample ordered by sample_timestamp ascending.
        """
        stmt = (
            select(MultivariateSample)
            .where(MultivariateSample.group_id == group_id)
        )
        if start_date is not None:
            stmt = stmt.where(MultivariateSample.sample_timestamp >= start_date)
        if end_date is not None:
            stmt = stmt.where(MultivariateSample.sample_timestamp <= end_date)

        stmt = (
            stmt.order_by(MultivariateSample.sample_timestamp.asc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def save_samples(self, samples: list[MultivariateSample]) -> None:
        """Bulk-insert multivariate samples.

        Args:
            samples: List of MultivariateSample instances to persist.
        """
        self.session.add_all(samples)
        await self.session.flush()


class CorrelationResultRepository(BaseRepository[CorrelationResult]):
    """Repository for correlation matrix computation results."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, CorrelationResult)

    async def get_by_plant(
        self,
        plant_id: int,
        limit: int = 20,
    ) -> list[CorrelationResult]:
        """Get recent correlation results for a plant.

        Args:
            plant_id: Filter to a specific plant.
            limit: Maximum number of results to return.

        Returns:
            List of CorrelationResult ordered by computed_at descending.
        """
        stmt = (
            select(CorrelationResult)
            .where(CorrelationResult.plant_id == plant_id)
            .order_by(CorrelationResult.computed_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(
        self,
        result_id: int,
        options: Sequence[Any] | None = None,
    ) -> CorrelationResult | None:
        """Get a single correlation result by ID.

        Args:
            result_id: PK of the correlation result.
            options: Optional loader options.

        Returns:
            CorrelationResult or None if not found.
        """
        stmt = select(CorrelationResult).where(CorrelationResult.id == result_id)
        if options:
            stmt = stmt.options(*options)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
