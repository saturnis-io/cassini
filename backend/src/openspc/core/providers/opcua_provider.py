"""OPC-UA data provider for automated data collection from OPC-UA servers.

This module provides the OPCUAProvider class, which subscribes to OPC-UA
node data changes and automatically collects measurements, buffering them
into subgroups and triggering sample processing based on configured strategies.
"""

import asyncio
import structlog
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from asyncua import ua

from openspc.core.providers.buffer import SubgroupBuffer, TagConfig
from openspc.core.providers.protocol import DataProvider, SampleCallback, SampleContext, SampleEvent
from openspc.db.models.data_source import TriggerStrategy

if TYPE_CHECKING:
    from openspc.db.repositories.data_source import DataSourceRepository
    from openspc.opcua.manager import OPCUAManager

logger = structlog.get_logger(__name__)


@dataclass
class OPCUANodeConfig:
    """Configuration for an OPC-UA node subscription.

    Attributes:
        characteristic_id: ID of the characteristic this node measures
        server_id: ID of the OPC-UA server hosting this node
        node_id: OPC-UA NodeId string (e.g. "ns=2;i=1234")
        subgroup_size: Number of readings to accumulate per subgroup
        trigger_strategy: How to trigger sample submission
        sampling_interval: Per-node sampling interval override (ms), or None for server default
        buffer_timeout_seconds: Timeout for flushing partial buffers
    """

    characteristic_id: int
    server_id: int
    node_id: str
    subgroup_size: int
    trigger_strategy: str = "on_change"
    sampling_interval: int | None = None
    buffer_timeout_seconds: float = 60.0


class OPCUAProvider(DataProvider):
    """Provider for automated data collection from OPC-UA servers.

    The OPCUAProvider subscribes to OPC-UA node data changes configured for
    OPC-UA-type characteristics and automatically collects measurements. It
    buffers readings into subgroups and triggers sample processing based on
    the configured strategy.

    Key differences from TagProvider:
    - Values are pre-decoded by asyncua (no SparkplugB protobuf)
    - 1 node = 1 characteristic (no topic fan-out)
    - Multi-server routing via OPCUAManager.get_client()
    - Per-node subscription parameter resolution
    - Only on_change and on_timer strategies supported (no on_trigger)

    Args:
        opcua_manager: OPC-UA manager for multi-server client access
        ds_repo: Repository for data source queries
    """

    provider_type = "OPCUA"

    def __init__(
        self,
        opcua_manager: "OPCUAManager",
        ds_repo: "DataSourceRepository",
    ):
        self._opcua_manager = opcua_manager
        self._ds_repo = ds_repo
        self._callback: SampleCallback | None = None
        self._configs: dict[int, OPCUANodeConfig] = {}  # char_id -> config
        self._buffers: dict[int, SubgroupBuffer] = {}  # char_id -> buffer
        self._node_to_char: dict[str, int] = {}  # node_id -> char_id
        self._timeout_task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        """Start the provider: load configs and subscribe to OPC-UA nodes.

        This method:
        1. Loads all active OPC-UA data sources from the database
        2. Creates configurations and buffers for each
        3. Subscribes to their OPC-UA node data changes
        4. Starts the buffer timeout monitoring loop
        """
        logger.info("Starting OPCUAProvider")
        self._running = True
        await self._load_opcua_sources()
        self._timeout_task = asyncio.create_task(self._timeout_loop())
        logger.info(
            "opcua_provider_started",
            characteristics_count=len(self._configs),
        )

    async def stop(self) -> None:
        """Stop the provider and clean up resources.

        This method:
        1. Stops the timeout monitoring loop
        2. Unsubscribes from all OPC-UA nodes
        3. Clears all buffers and configurations
        """
        logger.info("Stopping OPCUAProvider")
        self._running = False

        # Cancel timeout task
        if self._timeout_task and not self._timeout_task.done():
            self._timeout_task.cancel()
            try:
                await self._timeout_task
            except asyncio.CancelledError:
                pass

        # Unsubscribe from all nodes
        for char_id, config in list(self._configs.items()):
            try:
                client = self._opcua_manager.get_client(config.server_id)
                if client:
                    await client.unsubscribe(config.node_id)
                    logger.debug(
                        "unsubscribed_from_node",
                        node_id=config.node_id,
                        server_id=config.server_id,
                    )
            except Exception as e:
                logger.error(
                    "error_unsubscribing_node",
                    node_id=config.node_id,
                    server_id=config.server_id,
                    error=str(e),
                )

        # Clear state
        self._configs.clear()
        self._buffers.clear()
        self._node_to_char.clear()

        logger.info("OPCUAProvider stopped")

    def set_callback(self, callback: SampleCallback) -> None:
        """Set the callback for sample processing.

        The callback will be invoked asynchronously when a buffer is flushed
        and a sample is ready for processing.

        Args:
            callback: Async function to invoke with SampleEvent
        """
        self._callback = callback

    async def _load_opcua_sources(self) -> None:
        """Load all active OPC-UA data sources and subscribe to their nodes."""
        logger.info("Loading OPC-UA data sources")
        opcua_sources = await self._ds_repo.get_active_opcua_sources()

        for src in opcua_sources:
            char = src.characteristic
            if char is None:
                logger.warning("opcua_source_no_characteristic", data_source_id=src.id)
                continue

            # Skip on_trigger sources (not supported for OPC-UA)
            if src.trigger_strategy == TriggerStrategy.ON_TRIGGER.value:
                logger.warning(
                    "opcua_on_trigger_not_supported",
                    data_source_id=src.id,
                    characteristic_id=char.id,
                    node_id=src.node_id,
                    msg="on_trigger strategy is not supported for OPC-UA data sources. Skipping.",
                )
                continue

            # Resolve per-node sampling interval: source override or server default
            server = src.server
            sampling_interval = src.sampling_interval
            if sampling_interval is None and server is not None:
                sampling_interval = server.sampling_interval

            config = OPCUANodeConfig(
                characteristic_id=char.id,
                server_id=src.server_id,
                node_id=src.node_id,
                subgroup_size=char.subgroup_size,
                trigger_strategy=src.trigger_strategy,
                sampling_interval=sampling_interval,
            )

            # Create a TagConfig for SubgroupBuffer compatibility
            buffer_config = TagConfig(
                characteristic_id=char.id,
                mqtt_topic=f"opcua://{src.server_id}/{src.node_id}",  # synthetic identifier
                subgroup_size=char.subgroup_size,
                trigger_strategy=src.trigger_strategy,
            )

            self._configs[char.id] = config
            self._buffers[char.id] = SubgroupBuffer(buffer_config)
            self._node_to_char[src.node_id] = char.id

            # Subscribe to data changes via OPCUAClient
            client = self._opcua_manager.get_client(src.server_id)
            if client is None:
                logger.warning(
                    "opcua_client_not_available",
                    server_id=src.server_id,
                    characteristic_id=char.id,
                    node_id=src.node_id,
                )
                continue

            if not client.is_connected:
                logger.warning(
                    "opcua_client_not_connected",
                    server_id=src.server_id,
                    characteristic_id=char.id,
                    node_id=src.node_id,
                    msg="Client not yet connected; subscription will be restored on reconnect.",
                )

            try:
                await client.subscribe_data_change(
                    node_id=src.node_id,
                    callback=self._on_data_change,
                    sampling_interval=sampling_interval,
                )
                logger.info(
                    "subscribed_to_opcua_node",
                    node_id=src.node_id,
                    server_id=src.server_id,
                    characteristic_id=char.id,
                    name=char.name,
                    sampling_interval=sampling_interval,
                )
            except Exception as e:
                logger.error(
                    "opcua_subscribe_failed",
                    node_id=src.node_id,
                    server_id=src.server_id,
                    characteristic_id=char.id,
                    error=str(e),
                )
                # Clean up on failure
                del self._configs[char.id]
                del self._buffers[char.id]
                self._node_to_char.pop(src.node_id, None)
                continue

        logger.info("loaded_opcua_data_sources", count=len(self._configs))

    async def _on_data_change(self, node_id: str, data_value: ua.DataValue) -> None:
        """Handle data change notification from OPC-UA subscription.

        This callback is invoked by the OPCUAClient's _DataChangeHandler when
        a monitored node's value changes. Extracts the numeric value and routes
        it to the appropriate buffer.

        Args:
            node_id: OPC-UA NodeId string of the changed node
            data_value: The new ua.DataValue from the server
        """
        char_id = self._node_to_char.get(node_id)
        if char_id is None:
            logger.warning("unmapped_opcua_node", node_id=node_id)
            return

        config = self._configs.get(char_id)
        buffer = self._buffers.get(char_id)
        if not config or not buffer:
            return

        # Extract value from DataValue
        raw_value = data_value.Value.Value
        if raw_value is None:
            logger.debug(
                "opcua_null_value",
                node_id=node_id,
                characteristic_id=char_id,
            )
            return

        # Type coercion: int/float types -> float. Skip non-numeric.
        # bool check MUST come before int/float since bool is a subclass of int.
        if isinstance(raw_value, bool):
            logger.debug(
                "opcua_non_numeric_value",
                node_id=node_id,
                characteristic_id=char_id,
                value_type="bool",
            )
            return
        elif isinstance(raw_value, (int, float)):
            value = float(raw_value)
        else:
            logger.debug(
                "opcua_non_numeric_value",
                node_id=node_id,
                characteristic_id=char_id,
                value_type=type(raw_value).__name__,
            )
            return

        # Use source timestamp if available, otherwise current time
        timestamp = None
        if data_value.SourceTimestamp:
            timestamp = data_value.SourceTimestamp
        else:
            timestamp = datetime.now(timezone.utc)

        logger.debug(
            "received_opcua_value",
            value=value,
            node_id=node_id,
            characteristic_id=char_id,
            source_timestamp=str(timestamp),
        )

        await self._dispatch_value(char_id, config, buffer, value)

    async def _dispatch_value(
        self, char_id: int, config: OPCUANodeConfig, buffer: SubgroupBuffer, value: float
    ) -> None:
        """Add a value to a buffer and flush if needed based on trigger strategy.

        Only on_change and on_timer are supported for OPC-UA.
        """
        if config.trigger_strategy == TriggerStrategy.ON_CHANGE.value:
            is_full = buffer.add(value)
            if is_full:
                logger.debug("buffer_full", characteristic_id=char_id)
                await self._flush_buffer(char_id)
        elif config.trigger_strategy == TriggerStrategy.ON_TIMER.value:
            buffer.add(value)
            logger.debug(
                "value_buffered_timer_flush",
                characteristic_id=char_id,
                buffer_count=len(buffer.values),
                subgroup_size=config.subgroup_size,
            )

    async def _flush_buffer(self, char_id: int) -> None:
        """Flush buffer and create sample event.

        This method retrieves all values from the buffer, creates a
        SampleEvent, and invokes the registered callback for processing.

        Args:
            char_id: ID of the characteristic whose buffer to flush
        """
        if char_id not in self._buffers:
            logger.warning("no_buffer_found", characteristic_id=char_id)
            return

        buffer = self._buffers[char_id]
        values = buffer.flush()

        if not values:
            logger.debug("buffer_empty", characteristic_id=char_id)
            return

        logger.info(
            "flushing_opcua_buffer",
            characteristic_id=char_id,
            value_count=len(values),
        )

        # Create sample event
        event = SampleEvent(
            characteristic_id=char_id,
            measurements=values,
            timestamp=datetime.now(timezone.utc),
            context=SampleContext(source="OPCUA"),
        )

        # Invoke callback
        if self._callback is None:
            logger.warning(
                "no_callback_set",
                characteristic_id=char_id,
            )
            return

        try:
            await self._callback(event)
            logger.info("opcua_sample_processed", characteristic_id=char_id)
        except Exception as e:
            logger.error(
                "opcua_callback_error",
                characteristic_id=char_id,
                error=str(e),
                exc_info=True,
            )

    async def _timeout_loop(self) -> None:
        """Monitor buffers for timeouts and flush partial subgroups.

        This background task runs periodically to check if any buffers
        have timed out. If a buffer has pending values and has exceeded
        the timeout threshold, it is flushed even if not full.
        """
        logger.info("Starting OPC-UA buffer timeout monitoring loop")

        while self._running:
            try:
                await asyncio.sleep(5)  # Check every 5 seconds

                for char_id, buffer in self._buffers.items():
                    config = self._configs.get(char_id)
                    if not config:
                        continue

                    if buffer.values and buffer.is_timed_out(config.buffer_timeout_seconds):
                        logger.warning(
                            "opcua_buffer_timeout",
                            characteristic_id=char_id,
                            buffer_count=len(buffer.values),
                            expected=config.subgroup_size,
                        )
                        await self._flush_buffer(char_id)

            except asyncio.CancelledError:
                logger.info("OPC-UA buffer timeout loop cancelled")
                break
            except Exception as e:
                logger.error("opcua_timeout_loop_error", error=str(e), exc_info=True)

        logger.info("OPC-UA buffer timeout monitoring loop stopped")

    async def refresh_subscriptions(self, ds_repo: "DataSourceRepository") -> int:
        """Refresh OPC-UA subscriptions based on current data sources.

        Stops all current subscriptions, reloads data sources from DB,
        and re-subscribes.

        Args:
            ds_repo: Fresh DataSourceRepository with active session

        Returns:
            Number of characteristics now subscribed
        """
        # Stop current subscriptions (but not the timeout loop)
        for char_id, config in list(self._configs.items()):
            try:
                client = self._opcua_manager.get_client(config.server_id)
                if client:
                    await client.unsubscribe(config.node_id)
            except Exception as e:
                logger.error(
                    "refresh_unsubscribe_error",
                    node_id=config.node_id,
                    error=str(e),
                )

        self._configs.clear()
        self._buffers.clear()
        self._node_to_char.clear()

        # Reload with new repo
        self._ds_repo = ds_repo
        await self._load_opcua_sources()

        return len(self._configs)
