"""OIDC configuration repository for database operations."""

from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.oidc_config import OIDCConfig


class OIDCConfigRepository:
    """Repository for OIDCConfig CRUD operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, config_id: int) -> Optional[OIDCConfig]:
        """Get a single OIDC config by ID."""
        stmt = select(OIDCConfig).where(OIDCConfig.id == config_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all(self) -> Sequence[OIDCConfig]:
        """Get all OIDC configs ordered by name."""
        stmt = select(OIDCConfig).order_by(OIDCConfig.name)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_active_providers(self) -> Sequence[OIDCConfig]:
        """Get all active OIDC providers (for login page display)."""
        stmt = (
            select(OIDCConfig)
            .where(OIDCConfig.is_active == True)  # noqa: E712
            .order_by(OIDCConfig.name)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create(self, **kwargs) -> OIDCConfig:
        """Create a new OIDC config."""
        config = OIDCConfig(**kwargs)
        self.session.add(config)
        await self.session.flush()
        await self.session.refresh(config)
        return config

    async def update(self, config_id: int, **kwargs) -> Optional[OIDCConfig]:
        """Update an existing OIDC config."""
        config = await self.get_by_id(config_id)
        if config is None:
            return None

        for key, value in kwargs.items():
            if hasattr(config, key) and value is not None:
                setattr(config, key, value)

        await self.session.flush()
        await self.session.refresh(config)
        return config

    async def delete(self, config_id: int) -> bool:
        """Delete an OIDC config by ID."""
        config = await self.get_by_id(config_id)
        if config is None:
            return False

        await self.session.delete(config)
        await self.session.flush()
        return True
