"""Repositories for predictive analytics models."""
from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.prediction import Forecast, PredictionConfig, PredictionModel
from cassini.db.repositories.base import BaseRepository


class PredictionConfigRepository(BaseRepository[PredictionConfig]):
    """CRUD operations for per-characteristic prediction configuration."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, PredictionConfig)

    async def get_by_characteristic(
        self, characteristic_id: int
    ) -> PredictionConfig | None:
        """Get prediction config for a characteristic.

        Args:
            characteristic_id: FK to characteristic.

        Returns:
            PredictionConfig or None if not configured.
        """
        stmt = select(PredictionConfig).where(
            PredictionConfig.characteristic_id == characteristic_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert(
        self, characteristic_id: int, **kwargs: Any
    ) -> PredictionConfig:
        """Create or update prediction config for a characteristic.

        Args:
            characteristic_id: FK to characteristic.
            **kwargs: Column values to set.

        Returns:
            The created or updated PredictionConfig.
        """
        existing = await self.get_by_characteristic(characteristic_id)
        if existing:
            for key, value in kwargs.items():
                if hasattr(existing, key):
                    setattr(existing, key, value)
            await self.session.flush()
            await self.session.refresh(existing)
            return existing

        config = PredictionConfig(characteristic_id=characteristic_id, **kwargs)
        self.session.add(config)
        await self.session.flush()
        await self.session.refresh(config)
        return config

    async def get_enabled_configs(self) -> list[PredictionConfig]:
        """Get all enabled prediction configs.

        Returns:
            List of PredictionConfig where is_enabled is True.
        """
        stmt = (
            select(PredictionConfig)
            .where(PredictionConfig.is_enabled == True)  # noqa: E712
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class PredictionModelRepository(BaseRepository[PredictionModel]):
    """Repository for fitted prediction model snapshots."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, PredictionModel)

    async def get_current_model(
        self, characteristic_id: int
    ) -> PredictionModel | None:
        """Get the current (active) prediction model for a characteristic.

        Args:
            characteristic_id: FK to characteristic.

        Returns:
            The current PredictionModel or None if no model fitted.
        """
        stmt = (
            select(PredictionModel)
            .where(
                PredictionModel.characteristic_id == characteristic_id,
                PredictionModel.is_current == True,  # noqa: E712
            )
            .options(selectinload(PredictionModel.forecasts))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_and_set_current(self, **kwargs: Any) -> PredictionModel:
        """Create a new model and mark it as current.

        Marks any existing current model for the same characteristic as
        not current before creating the new one.

        Args:
            **kwargs: Column values for PredictionModel (must include
                      characteristic_id and model_type).

        Returns:
            The newly created PredictionModel.
        """
        char_id = kwargs.get("characteristic_id")
        if char_id is not None:
            # Mark existing current models as not current
            stmt = (
                update(PredictionModel)
                .where(
                    PredictionModel.characteristic_id == char_id,
                    PredictionModel.is_current == True,  # noqa: E712
                )
                .values(is_current=False)
            )
            await self.session.execute(stmt)

        model = PredictionModel(is_current=True, **kwargs)
        self.session.add(model)
        await self.session.flush()
        await self.session.refresh(model)
        return model

    async def get_model_history(
        self,
        characteristic_id: int,
        limit: int = 20,
    ) -> list[PredictionModel]:
        """Get model fitting history for a characteristic.

        Args:
            characteristic_id: FK to characteristic.
            limit: Maximum number of models to return.

        Returns:
            List of PredictionModel ordered by fitted_at descending.
        """
        stmt = (
            select(PredictionModel)
            .where(PredictionModel.characteristic_id == characteristic_id)
            .order_by(PredictionModel.fitted_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class ForecastRepository(BaseRepository[Forecast]):
    """Repository for individual forecast data points."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Forecast)

    async def get_latest_forecast(
        self, characteristic_id: int
    ) -> list[Forecast]:
        """Get the most recent set of forecasts for a characteristic.

        Returns all forecast steps from the most recent generation batch
        (identified by the latest generated_at timestamp).

        Args:
            characteristic_id: FK to characteristic.

        Returns:
            List of Forecast ordered by step ascending.
        """
        # First find the latest generated_at for this characteristic
        latest_stmt = (
            select(Forecast.generated_at)
            .where(Forecast.characteristic_id == characteristic_id)
            .order_by(Forecast.generated_at.desc())
            .limit(1)
        )
        latest_result = await self.session.execute(latest_stmt)
        latest_at = latest_result.scalar_one_or_none()
        if latest_at is None:
            return []

        stmt = (
            select(Forecast)
            .where(
                Forecast.characteristic_id == characteristic_id,
                Forecast.generated_at == latest_at,
            )
            .order_by(Forecast.step.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_forecast_history(
        self,
        characteristic_id: int,
        limit: int = 100,
    ) -> list[Forecast]:
        """Get forecast history for a characteristic.

        Args:
            characteristic_id: FK to characteristic.
            limit: Maximum number of forecast points to return.

        Returns:
            List of Forecast ordered by generated_at descending, step ascending.
        """
        stmt = (
            select(Forecast)
            .where(Forecast.characteristic_id == characteristic_id)
            .order_by(Forecast.generated_at.desc(), Forecast.step.asc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def bulk_create(self, forecasts: list[Forecast]) -> None:
        """Bulk-insert forecast data points.

        Args:
            forecasts: List of Forecast instances to persist.
        """
        self.session.add_all(forecasts)
        await self.session.flush()
