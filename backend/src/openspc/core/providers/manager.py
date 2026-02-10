"""TAG Provider Manager for FastAPI integration.

This module provides TagProviderManager for managing the TagProvider lifecycle
within the FastAPI application, connecting it to the MQTT manager and SPC engine.
"""

from __future__ import annotations

import structlog
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from openspc.core.providers.protocol import SampleEvent
from openspc.core.providers.tag import TagProvider

if TYPE_CHECKING:
    from openspc.core.engine.spc_engine import SPCEngine

logger = structlog.get_logger(__name__)


@dataclass
class TagProviderState:
    """State of the TAG provider.

    Attributes:
        is_running: Whether the provider is currently running
        subscribed_topics: List of subscribed MQTT topics
        characteristics_count: Number of TAG characteristics being monitored
        samples_processed: Total samples processed since startup
        last_sample_time: Timestamp of last processed sample
        error_message: Current error message if not running
    """

    is_running: bool = False
    subscribed_topics: list[str] = None
    characteristics_count: int = 0
    samples_processed: int = 0
    last_sample_time: datetime | None = None
    error_message: str | None = None

    def __post_init__(self):
        if self.subscribed_topics is None:
            self.subscribed_topics = []


class TagProviderManager:
    """Manages TAG provider lifecycle for the application.

    Provides a singleton-like manager for the TagProvider that:
    - Initializes the provider with MQTT client and SPC engine
    - Handles sample processing callbacks
    - Tracks provider state
    - Supports restart on configuration changes

    Example:
        >>> manager = TagProviderManager()
        >>> async with get_session() as session:
        ...     await manager.initialize(session)
        >>> # Later, on shutdown:
        >>> await manager.shutdown()
    """

    def __init__(self):
        """Initialize the TAG provider manager."""
        self._provider: TagProvider | None = None
        self._spc_engine: SPCEngine | None = None
        self._state = TagProviderState()
        self._session: AsyncSession | None = None

    @property
    def state(self) -> TagProviderState:
        """Get current provider state.

        Returns:
            Current TagProviderState
        """
        if self._provider:
            self._state.subscribed_topics = list(self._provider._topic_to_chars.keys())
            self._state.characteristics_count = len(self._provider._configs)
        return self._state

    @property
    def is_running(self) -> bool:
        """Check if provider is currently running.

        Returns:
            True if running, False otherwise
        """
        return self._provider is not None and self._provider._running

    async def initialize(self, session: AsyncSession) -> bool:
        """Initialize TAG provider with database session.

        Sets up the TAG provider with the MQTT client from mqtt_manager
        and creates an SPC engine for processing samples.

        Args:
            session: SQLAlchemy async session for database access

        Returns:
            True if initialization was successful, False otherwise
        """
        # Lazy imports to avoid circular dependencies
        from openspc.core.engine.nelson_rules import NelsonRuleLibrary
        from openspc.core.engine.rolling_window import RollingWindowManager
        from openspc.core.engine.spc_engine import SPCEngine
        from openspc.core.events import event_bus
        from openspc.db.repositories import (
            CharacteristicRepository,
            SampleRepository,
            ViolationRepository,
        )
        from openspc.mqtt import mqtt_manager

        logger.info("Initializing TAG provider manager")
        self._session = session

        # Check if MQTT manager is connected
        if not mqtt_manager.is_connected:
            logger.warning("Cannot initialize TAG provider: MQTT manager not connected")
            self._state.error_message = "MQTT manager not connected"
            return False

        mqtt_client = mqtt_manager.client
        if mqtt_client is None:
            logger.warning("Cannot initialize TAG provider: No MQTT client available")
            self._state.error_message = "No MQTT client available"
            return False

        # Create repositories
        char_repo = CharacteristicRepository(session)
        sample_repo = SampleRepository(session)
        violation_repo = ViolationRepository(session)

        # Create rolling window manager
        window_manager = RollingWindowManager(sample_repo)

        # Create Nelson rule library
        rule_library = NelsonRuleLibrary()

        # Create SPC engine
        self._spc_engine = SPCEngine(
            char_repo=char_repo,
            sample_repo=sample_repo,
            violation_repo=violation_repo,
            window_manager=window_manager,
            rule_library=rule_library,
            event_bus=event_bus,
        )

        # Create TAG provider with DataSourceRepository
        from openspc.db.repositories import DataSourceRepository
        ds_repo = DataSourceRepository(session)
        self._provider = TagProvider(mqtt_client, ds_repo)
        self._provider.set_callback(self._on_sample)

        # Start the provider
        try:
            await self._provider.start()
            self._state.is_running = True
            self._state.error_message = None
            logger.info("TAG provider manager initialized successfully")
            return True
        except Exception as e:
            logger.error("tag_provider_start_failed", error=str(e))
            self._state.error_message = str(e)
            return False

    async def _on_sample(self, event: SampleEvent) -> None:
        """Callback when TAG provider has a sample ready.

        Processes the sample through the SPC engine.

        Args:
            event: Sample event from TAG provider
        """
        if self._spc_engine is None:
            logger.warning("Cannot process sample: SPC engine not initialized")
            return

        logger.info(
            "processing_tag_sample",
            characteristic_id=event.characteristic_id,
            measurement_count=len(event.measurements),
        )

        try:
            result = await self._spc_engine.process_sample(
                characteristic_id=event.characteristic_id,
                measurements=event.measurements,
                context=event.context,
            )

            self._state.samples_processed += 1
            self._state.last_sample_time = datetime.now()

            logger.info(
                "tag_sample_processed",
                sample_id=result.sample_id,
                mean=round(result.mean, 3),
                zone=result.zone,
                in_control=result.in_control,
                violation_count=len(result.violations),
            )

        except Exception as e:
            logger.error(
                "tag_sample_processing_error",
                characteristic_id=event.characteristic_id,
                error=str(e),
                exc_info=True,
            )

    async def restart(self, session: AsyncSession) -> bool:
        """Restart the TAG provider.

        Stops the current provider and reinitializes with fresh configuration.

        Args:
            session: SQLAlchemy async session for database access

        Returns:
            True if restart was successful, False otherwise
        """
        logger.info("Restarting TAG provider manager")

        # Stop current provider
        await self.shutdown()

        # Reinitialize
        return await self.initialize(session)

    async def shutdown(self) -> None:
        """Shutdown TAG provider manager.

        Gracefully stops the provider and cleans up resources.
        """
        logger.info("Shutting down TAG provider manager")

        if self._provider:
            await self._provider.stop()
            self._provider = None

        self._spc_engine = None
        self._state.is_running = False
        self._state.error_message = "Manager shutdown"

        logger.info("TAG provider manager shutdown complete")

    async def refresh_subscriptions(self, session: AsyncSession) -> int:
        """Refresh topic subscriptions based on current data sources.

        Useful when data source mappings are added or removed.

        Args:
            session: SQLAlchemy async session for database access

        Returns:
            Number of characteristics now subscribed
        """
        from openspc.db.repositories import DataSourceRepository

        if not self._provider:
            logger.warning("Cannot refresh subscriptions: Provider not initialized")
            return 0

        # Stop current subscriptions
        await self._provider.stop()

        # Update ds_repo with new session
        self._provider._ds_repo = DataSourceRepository(session)

        # Restart to reload subscriptions
        await self._provider.start()

        return len(self._provider._configs)


# Global instance for application use
tag_provider_manager = TagProviderManager()
