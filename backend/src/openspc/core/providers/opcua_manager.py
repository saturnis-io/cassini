"""OPC-UA Provider Manager for FastAPI integration.

This module provides OPCUAProviderManager for managing the OPCUAProvider
lifecycle within the FastAPI application, connecting it to the OPC-UA
manager and SPC engine.

NOTE: This is the PROVIDER-side manager (core/providers/opcua_manager.py),
distinct from the CONNECTION-side manager (opcua/manager.py).
"""

from __future__ import annotations

import structlog
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from openspc.core.providers.opcua_provider import OPCUAProvider
from openspc.core.providers.protocol import SampleEvent

if TYPE_CHECKING:
    from openspc.core.engine.spc_engine import SPCEngine

logger = structlog.get_logger(__name__)


@dataclass
class OPCUAProviderState:
    """State of the OPC-UA provider.

    Attributes:
        is_running: Whether the provider is currently running
        monitored_nodes: List of monitored OPC-UA node IDs
        characteristics_count: Number of OPC-UA characteristics being monitored
        samples_processed: Total samples processed since startup
        last_sample_time: Timestamp of last processed sample
        error_message: Current error message if not running
    """

    is_running: bool = False
    monitored_nodes: list[str] = None
    characteristics_count: int = 0
    samples_processed: int = 0
    last_sample_time: datetime | None = None
    error_message: str | None = None

    def __post_init__(self):
        if self.monitored_nodes is None:
            self.monitored_nodes = []


class OPCUAProviderManager:
    """Manages OPC-UA provider lifecycle for the application.

    Provides a singleton-like manager for the OPCUAProvider that:
    - Initializes the provider with OPC-UA manager and SPC engine
    - Handles sample processing callbacks
    - Tracks provider state
    - Supports restart on configuration changes
    """

    def __init__(self):
        """Initialize the OPC-UA provider manager."""
        self._provider: OPCUAProvider | None = None
        self._spc_engine: SPCEngine | None = None
        self._state = OPCUAProviderState()
        self._session: AsyncSession | None = None

    @property
    def state(self) -> OPCUAProviderState:
        """Get current provider state."""
        if self._provider:
            self._state.monitored_nodes = list(self._provider._node_to_char.keys())
            self._state.characteristics_count = len(self._provider._configs)
        return self._state

    @property
    def is_running(self) -> bool:
        """Check if provider is currently running."""
        return self._provider is not None and self._provider._running

    async def initialize(self, session: AsyncSession) -> bool:
        """Initialize OPC-UA provider with database session.

        Sets up the OPC-UA provider with the OPC-UA manager from opcua_manager
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
        from openspc.db.repositories import DataSourceRepository
        from openspc.opcua.manager import opcua_manager

        logger.info("Initializing OPC-UA provider manager")
        self._session = session

        # Check if OPC-UA manager has any connected servers
        if not opcua_manager.is_connected:
            logger.info("Cannot initialize OPC-UA provider: no OPC-UA servers connected")
            self._state.error_message = "No OPC-UA servers connected"
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

        # Create OPC-UA provider with DataSourceRepository
        ds_repo = DataSourceRepository(session)
        self._provider = OPCUAProvider(opcua_manager, ds_repo)
        self._provider.set_callback(self._on_sample)

        # Start the provider
        try:
            await self._provider.start()
            self._state.is_running = True
            self._state.error_message = None
            logger.info("OPC-UA provider manager initialized successfully")
            return True
        except Exception as e:
            logger.error("opcua_provider_start_failed", error=str(e))
            self._state.error_message = str(e)
            return False

    async def _on_sample(self, event: SampleEvent) -> None:
        """Callback when OPC-UA provider has a sample ready.

        Processes the sample through the SPC engine.

        Args:
            event: Sample event from OPC-UA provider
        """
        if self._spc_engine is None:
            logger.warning("Cannot process sample: SPC engine not initialized")
            return

        logger.info(
            "processing_opcua_sample",
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
                "opcua_sample_processed",
                sample_id=result.sample_id,
                mean=round(result.mean, 3),
                zone=result.zone,
                in_control=result.in_control,
                violation_count=len(result.violations),
            )

        except Exception as e:
            logger.error(
                "opcua_sample_processing_error",
                characteristic_id=event.characteristic_id,
                error=str(e),
                exc_info=True,
            )

    async def restart(self, session: AsyncSession) -> bool:
        """Restart the OPC-UA provider.

        Stops the current provider and reinitializes with fresh configuration.

        Args:
            session: SQLAlchemy async session for database access

        Returns:
            True if restart was successful, False otherwise
        """
        logger.info("Restarting OPC-UA provider manager")

        # Stop current provider
        await self.shutdown()

        # Reinitialize
        return await self.initialize(session)

    async def shutdown(self) -> None:
        """Shutdown OPC-UA provider manager.

        Gracefully stops the provider and cleans up resources.
        """
        logger.info("Shutting down OPC-UA provider manager")

        if self._provider:
            await self._provider.stop()
            self._provider = None

        self._spc_engine = None
        self._state.is_running = False
        self._state.error_message = "Manager shutdown"

        logger.info("OPC-UA provider manager shutdown complete")

    async def refresh_subscriptions(self, session: AsyncSession) -> int:
        """Refresh node subscriptions based on current data sources.

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

        ds_repo = DataSourceRepository(session)
        return await self._provider.refresh_subscriptions(ds_repo)


# Global instance for application use
opcua_provider_manager = OPCUAProviderManager()
