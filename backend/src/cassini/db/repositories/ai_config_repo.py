"""Repositories for AI provider configuration and insights."""
from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.ai_config import AIInsight, AIProviderConfig
from cassini.db.repositories.base import BaseRepository


class AIProviderConfigRepository(BaseRepository[AIProviderConfig]):
    """CRUD operations for per-plant AI provider configuration."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, AIProviderConfig)

    async def get_by_plant(self, plant_id: int) -> AIProviderConfig | None:
        """Get AI provider config for a plant.

        Args:
            plant_id: FK to plant.

        Returns:
            AIProviderConfig or None if not configured.
        """
        stmt = select(AIProviderConfig).where(
            AIProviderConfig.plant_id == plant_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert(self, plant_id: int, **kwargs: Any) -> AIProviderConfig:
        """Create or update AI provider config for a plant.

        Args:
            plant_id: FK to plant.
            **kwargs: Column values to set.

        Returns:
            The created or updated AIProviderConfig.
        """
        existing = await self.get_by_plant(plant_id)
        if existing:
            for key, value in kwargs.items():
                if hasattr(existing, key):
                    setattr(existing, key, value)
            await self.session.flush()
            await self.session.refresh(existing)
            return existing

        config = AIProviderConfig(plant_id=plant_id, **kwargs)
        self.session.add(config)
        await self.session.flush()
        await self.session.refresh(config)
        return config


class AIInsightRepository(BaseRepository[AIInsight]):
    """Repository for cached AI-generated analysis insights."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, AIInsight)

    async def get_latest(
        self, characteristic_id: int
    ) -> AIInsight | None:
        """Get the most recent AI insight for a characteristic.

        Args:
            characteristic_id: FK to characteristic.

        Returns:
            The latest AIInsight or None if no insights exist.
        """
        stmt = (
            select(AIInsight)
            .where(AIInsight.characteristic_id == characteristic_id)
            .order_by(AIInsight.generated_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_hash(
        self,
        characteristic_id: int,
        context_hash: str,
    ) -> AIInsight | None:
        """Get a cached insight by context hash.

        Used for de-duplication: if the data context hasn't changed,
        the existing insight is returned instead of making a new API call.

        Args:
            characteristic_id: FK to characteristic.
            context_hash: SHA-256 hash of the analysis context.

        Returns:
            AIInsight with matching hash, or None if cache miss.
        """
        stmt = (
            select(AIInsight)
            .where(
                AIInsight.characteristic_id == characteristic_id,
                AIInsight.context_hash == context_hash,
            )
            .order_by(AIInsight.generated_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_history(
        self,
        characteristic_id: int,
        limit: int = 20,
    ) -> list[AIInsight]:
        """Get insight history for a characteristic.

        Args:
            characteristic_id: FK to characteristic.
            limit: Maximum number of insights to return.

        Returns:
            List of AIInsight ordered by generated_at descending.
        """
        stmt = (
            select(AIInsight)
            .where(AIInsight.characteristic_id == characteristic_id)
            .order_by(AIInsight.generated_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
