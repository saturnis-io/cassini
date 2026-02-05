"""Repository for CharacteristicConfig model."""

import json
from typing import Optional, Union

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.schemas.characteristic_config import (
    CharacteristicConfig as ConfigSchema,
    ManualConfig,
    TagConfig,
)
from openspc.db.models.characteristic_config import CharacteristicConfig
from openspc.db.repositories.base import BaseRepository


class CharacteristicConfigRepository(BaseRepository[CharacteristicConfig]):
    """Repository for CharacteristicConfig with JSON serialization.

    Provides methods for querying and managing polymorphic configuration
    (ManualConfig or TagConfig) stored as JSON in the database.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize characteristic config repository.

        Args:
            session: SQLAlchemy async session for database operations
        """
        super().__init__(session, CharacteristicConfig)

    async def get_by_characteristic(self, char_id: int) -> Optional[CharacteristicConfig]:
        """Get config by characteristic ID.

        Args:
            char_id: ID of the characteristic

        Returns:
            CharacteristicConfig if found, None otherwise
        """
        stmt = select(CharacteristicConfig).where(
            CharacteristicConfig.characteristic_id == char_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_config_parsed(self, char_id: int) -> Optional[Union[ManualConfig, TagConfig]]:
        """Get config and parse JSON to Pydantic model.

        Args:
            char_id: ID of the characteristic

        Returns:
            Parsed ManualConfig or TagConfig if found, None otherwise
        """
        db_config = await self.get_by_characteristic(char_id)
        if db_config is None:
            return None

        config_dict = json.loads(db_config.config_json)

        # Use discriminator to determine type
        if config_dict.get("config_type") == "MANUAL":
            return ManualConfig(**config_dict)
        elif config_dict.get("config_type") == "TAG":
            return TagConfig(**config_dict)

        return None

    async def upsert(
        self, char_id: int, config: Union[ManualConfig, TagConfig]
    ) -> CharacteristicConfig:
        """Create or update config for a characteristic.

        Args:
            char_id: ID of the characteristic
            config: ManualConfig or TagConfig to save

        Returns:
            The created or updated CharacteristicConfig
        """
        existing = await self.get_by_characteristic(char_id)
        config_json = config.model_dump_json()

        if existing:
            existing.config_json = config_json
            await self.session.flush()
            return existing
        else:
            db_config = CharacteristicConfig(
                characteristic_id=char_id,
                config_json=config_json,
            )
            self.session.add(db_config)
            await self.session.flush()
            return db_config

    async def get_all_active_manual(self) -> list[tuple[int, ManualConfig]]:
        """Get all active manual configs for scheduling.

        Returns:
            List of tuples containing (characteristic_id, ManualConfig)
        """
        stmt = select(CharacteristicConfig).where(
            CharacteristicConfig.is_active == True  # noqa: E712
        )
        result = await self.session.execute(stmt)
        configs = result.scalars().all()

        manual_configs = []
        for db_config in configs:
            config_dict = json.loads(db_config.config_json)
            if config_dict.get("config_type") == "MANUAL":
                manual_configs.append(
                    (db_config.characteristic_id, ManualConfig(**config_dict))
                )

        return manual_configs
