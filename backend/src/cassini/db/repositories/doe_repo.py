"""Repositories for Design of Experiments (DOE) models."""
from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.doe import DOEAnalysis, DOEFactor, DOERun, DOEStudy
from cassini.db.repositories.base import BaseRepository


class DOEStudyRepository(BaseRepository[DOEStudy]):
    """CRUD and query operations for DOE studies.

    All listing operations are plant-scoped.  Eagerly loads factors,
    runs, and analyses to avoid N+1 queries.
    """

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, DOEStudy)

    async def get_by_plant(
        self,
        plant_id: int,
        status: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> list[DOEStudy]:
        """List DOE studies for a plant with optional status filter.

        Args:
            plant_id: Filter to a specific plant.
            status: Optional status filter (design, running, complete).
            offset: Pagination offset.
            limit: Maximum rows to return.

        Returns:
            List of DOEStudy instances with factors loaded.
        """
        stmt = (
            select(DOEStudy)
            .where(DOEStudy.plant_id == plant_id)
            .options(selectinload(DOEStudy.factors))
        )
        if status is not None:
            stmt = stmt.where(DOEStudy.status == status)
        stmt = (
            stmt.order_by(DOEStudy.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_with_details(self, study_id: int) -> DOEStudy | None:
        """Get a single study with all child entities loaded.

        Args:
            study_id: PK of the DOE study.

        Returns:
            DOEStudy with factors, runs, and analyses loaded,
            or None if not found.
        """
        stmt = (
            select(DOEStudy)
            .where(DOEStudy.id == study_id)
            .options(
                selectinload(DOEStudy.factors),
                selectinload(DOEStudy.runs),
                selectinload(DOEStudy.analyses),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_status(self, study_id: int, status: str) -> DOEStudy | None:
        """Update the status of a DOE study.

        Args:
            study_id: PK of the study.
            status: New status value (design, running, complete).

        Returns:
            Updated DOEStudy or None if not found.
        """
        study = await self.get_by_id(study_id)
        if study is None:
            return None
        study.status = status
        await self.session.flush()
        await self.session.refresh(study)
        return study


class DOERunRepository(BaseRepository[DOERun]):
    """Repository for DOE experimental runs."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, DOERun)

    async def get_by_study(self, study_id: int) -> list[DOERun]:
        """Get all runs for a study ordered by run_order.

        Args:
            study_id: FK to doe_study.

        Returns:
            List of DOERun ordered by run_order ascending.
        """
        stmt = (
            select(DOERun)
            .where(DOERun.study_id == study_id)
            .order_by(DOERun.run_order.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def batch_update_responses(
        self,
        updates: list[dict[str, Any]],
    ) -> int:
        """Batch-update response values for multiple runs.

        Each dict in ``updates`` must have an ``id`` key and a
        ``response_value`` key.  Optionally includes ``factor_actuals``,
        ``notes``, and ``completed_at``.

        Args:
            updates: List of dicts with run_id and values to update.

        Returns:
            Number of runs successfully updated.
        """
        count = 0
        for upd in updates:
            run_id = upd.get("id")
            if run_id is None:
                continue
            run = await self.get_by_id(run_id)
            if run is None:
                continue
            for key, value in upd.items():
                if key == "id":
                    continue  # skip the lookup key
                if hasattr(run, key):
                    setattr(run, key, value)
            count += 1

        if count > 0:
            await self.session.flush()
        return count

    async def bulk_create(self, runs: list[DOERun]) -> None:
        """Bulk-insert DOE runs.

        Args:
            runs: List of DOERun instances to persist.
        """
        self.session.add_all(runs)
        await self.session.flush()


class DOEAnalysisRepository(BaseRepository[DOEAnalysis]):
    """Repository for DOE ANOVA and regression analysis results."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, DOEAnalysis)

    async def get_by_study(self, study_id: int) -> list[DOEAnalysis]:
        """Get all analyses for a study.

        Args:
            study_id: FK to doe_study.

        Returns:
            List of DOEAnalysis ordered by computed_at descending.
        """
        stmt = (
            select(DOEAnalysis)
            .where(DOEAnalysis.study_id == study_id)
            .order_by(DOEAnalysis.computed_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_latest(self, study_id: int) -> DOEAnalysis | None:
        """Get the most recent analysis for a study.

        Args:
            study_id: FK to doe_study.

        Returns:
            The latest DOEAnalysis or None if no analyses exist.
        """
        stmt = (
            select(DOEAnalysis)
            .where(DOEAnalysis.study_id == study_id)
            .order_by(DOEAnalysis.computed_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
