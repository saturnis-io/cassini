"""Tag-based data provider for automated MQTT data collection.

This module provides the TagProvider class, which subscribes to MQTT topics
and automatically collects measurements from machine tags, buffering them
into subgroups and triggering sample processing based on configured strategies.
"""

import asyncio
import structlog
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from openspc.core.providers.buffer import SubgroupBuffer, TagConfig
from openspc.core.providers.protocol import DataProvider, SampleCallback, SampleContext, SampleEvent
from openspc.db.models.data_source import TriggerStrategy
from openspc.mqtt.client import MQTTClient

if TYPE_CHECKING:
    from openspc.db.repositories.data_source import DataSourceRepository

logger = structlog.get_logger(__name__)


class TagProvider(DataProvider):
    """Provider for automated tag data from MQTT.

    The TagProvider subscribes to MQTT topics configured for TAG-type
    characteristics and automatically collects measurements. It buffers
    readings into subgroups and triggers sample processing based on the
    configured strategy.

    Features:
    - Automatic subscription to configured MQTT topics
    - Buffering of readings until subgroup_size is reached
    - Buffer timeout to flush partial subgroups
    - Multiple trigger strategies (ON_CHANGE, ON_TRIGGER, ON_TIMER)
    - Topic-to-characteristic mapping

    Args:
        mqtt_client: MQTT client for topic subscriptions
        char_repo: Repository for characteristic queries

    Example:
        >>> config = MQTTConfig(host="mqtt.example.com", port=1883)
        >>> mqtt_client = MQTTClient(config)
        >>> await mqtt_client.connect()
        >>>
        >>> async def process_sample(event: SampleEvent) -> None:
        ...     print(f"Processing sample for char {event.characteristic_id}")
        ...
        >>> provider = TagProvider(mqtt_client, char_repo)
        >>> provider.set_callback(process_sample)
        >>> await provider.start()
    """

    provider_type = "TAG"

    def __init__(
        self,
        mqtt_client: MQTTClient,
        ds_repo: "DataSourceRepository",
    ):
        self._mqtt = mqtt_client
        self._ds_repo = ds_repo
        self._callback: SampleCallback | None = None
        self._configs: dict[int, TagConfig] = {}  # char_id -> config
        self._buffers: dict[int, SubgroupBuffer] = {}  # char_id -> buffer
        self._topic_to_chars: dict[str, list[int]] = {}  # topic -> [char_id, ...]
        self._timeout_task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        """Start the provider: load configs and subscribe to topics.

        This method:
        1. Loads all TAG-type characteristics from the database
        2. Creates configurations and buffers for each
        3. Subscribes to their MQTT topics
        4. Starts the buffer timeout monitoring loop

        Raises:
            RuntimeError: If provider fails to start
        """
        logger.info("Starting TagProvider")
        self._running = True
        await self._load_tag_characteristics()
        self._timeout_task = asyncio.create_task(self._timeout_loop())
        logger.info(
            "tag_provider_started",
            characteristics_count=len(self._configs),
        )

    async def stop(self) -> None:
        """Stop the provider and clean up resources.

        This method:
        1. Stops the timeout monitoring loop
        2. Unsubscribes from all MQTT topics
        3. Clears all buffers and configurations
        """
        logger.info("Stopping TagProvider")
        self._running = False

        # Cancel timeout task
        if self._timeout_task and not self._timeout_task.done():
            self._timeout_task.cancel()
            try:
                await self._timeout_task
            except asyncio.CancelledError:
                pass

        # Unsubscribe from all topics
        for topic in list(self._topic_to_chars.keys()):
            try:
                await self._mqtt.unsubscribe(topic)
                logger.debug("unsubscribed_from_topic", topic=topic)
            except Exception as e:
                logger.error("error_unsubscribing", topic=topic, error=str(e))

        # Clear state
        self._configs.clear()
        self._buffers.clear()
        self._topic_to_chars.clear()

        logger.info("TagProvider stopped")

    def set_callback(self, callback: SampleCallback) -> None:
        """Set the callback for sample processing.

        The callback will be invoked asynchronously when a buffer is flushed
        and a sample is ready for processing.

        Args:
            callback: Async function to invoke with SampleEvent
        """
        self._callback = callback

    async def _load_tag_characteristics(self) -> None:
        """Load all active MQTT data sources and subscribe to their topics."""
        logger.info("Loading MQTT data sources")
        mqtt_sources = await self._ds_repo.get_active_mqtt_sources()

        subscribed_topics: set[str] = set()
        subscribed_triggers: set[str] = set()

        for src in mqtt_sources:
            char = src.characteristic
            if char is None:
                logger.warning("mqtt_source_no_characteristic", data_source_id=src.id)
                continue

            config = TagConfig(
                characteristic_id=char.id,
                mqtt_topic=src.topic,
                subgroup_size=char.subgroup_size,
                trigger_strategy=src.trigger_strategy,
                trigger_tag=src.trigger_tag,
                metric_name=src.metric_name,
            )

            self._configs[char.id] = config
            self._buffers[char.id] = SubgroupBuffer(config)

            if src.topic not in self._topic_to_chars:
                self._topic_to_chars[src.topic] = []
            self._topic_to_chars[src.topic].append(char.id)

            if src.topic not in subscribed_topics:
                try:
                    await self._mqtt.subscribe(src.topic, self._on_message)
                    subscribed_topics.add(src.topic)
                    logger.info(
                        "subscribed_to_topic",
                        topic=src.topic,
                        characteristic_id=char.id,
                        name=char.name,
                    )
                except Exception as e:
                    logger.error(
                        "subscribe_failed",
                        topic=src.topic,
                        characteristic_id=char.id,
                        error=str(e),
                    )
                    del self._configs[char.id]
                    del self._buffers[char.id]
                    self._topic_to_chars[src.topic].remove(char.id)
                    if not self._topic_to_chars[src.topic]:
                        del self._topic_to_chars[src.topic]
                    continue

            if src.trigger_tag and src.trigger_tag not in subscribed_triggers:
                try:
                    await self._mqtt.subscribe(src.trigger_tag, self._on_trigger_message)
                    subscribed_triggers.add(src.trigger_tag)
                    logger.info("subscribed_to_trigger_tag", trigger_tag=src.trigger_tag)
                except Exception as e:
                    logger.error("trigger_tag_subscribe_failed", trigger_tag=src.trigger_tag, error=str(e))

        logger.info("loaded_mqtt_data_sources", count=len(self._configs))

    async def _on_message(self, topic: str, payload: bytes) -> None:
        """Handle incoming MQTT message for a data tag.

        This callback is invoked when a message arrives on a subscribed
        data topic. For SparkplugB topics (spBv1.0/ prefix), decodes the
        protobuf payload and dispatches individual metrics to characteristics
        by metric_name. For plain topics, parses as float and dispatches
        to all characteristics on that topic.

        Args:
            topic: MQTT topic the message was received on
            payload: Message payload as bytes
        """
        if topic not in self._topic_to_chars:
            logger.warning("unmapped_topic", topic=topic)
            return

        char_ids = self._topic_to_chars[topic]

        if topic.startswith("spBv1.0/"):
            await self._handle_sparkplug_message(topic, payload, char_ids)
        else:
            await self._handle_plain_message(topic, payload, char_ids)

    async def _handle_sparkplug_message(
        self, topic: str, payload: bytes, char_ids: list[int]
    ) -> None:
        """Handle a SparkplugB message by decoding metrics and dispatching by name."""
        from openspc.mqtt.sparkplug import SparkplugDecoder

        try:
            _ts, metrics, _seq = SparkplugDecoder.decode_payload(payload)
        except Exception as e:
            logger.error("sparkplug_decode_failed", topic=topic, error=str(e))
            return

        # Build name -> value map from decoded metrics
        metric_values: dict[str, float] = {}
        for metric in metrics:
            try:
                metric_values[metric.name] = float(metric.value)
            except (TypeError, ValueError):
                logger.debug(
                    "skipping_non_numeric_metric",
                    metric_name=metric.name,
                    metric_value=repr(metric.value),
                )

        # Dispatch to each characteristic by its configured metric_name
        for char_id in char_ids:
            config = self._configs.get(char_id)
            buffer = self._buffers.get(char_id)
            if not config or not buffer:
                continue

            if not config.metric_name:
                logger.debug(
                    "no_metric_name_configured",
                    characteristic_id=char_id,
                    topic=topic,
                )
                continue

            value = metric_values.get(config.metric_name)
            if value is None:
                continue

            logger.debug(
                "received_sparkplug_metric",
                metric_name=config.metric_name,
                value=value,
                topic=topic,
                characteristic_id=char_id,
            )
            await self._dispatch_value(char_id, config, buffer, value)

    async def _handle_plain_message(
        self, topic: str, payload: bytes, char_ids: list[int]
    ) -> None:
        """Handle a plain (non-SparkplugB) message by parsing as float."""
        try:
            value = float(payload.decode().strip())
        except (ValueError, UnicodeDecodeError) as e:
            logger.error(
                "payload_parse_failed",
                topic=topic,
                payload=repr(payload),
                error=str(e),
            )
            return

        for char_id in char_ids:
            config = self._configs.get(char_id)
            buffer = self._buffers.get(char_id)
            if not config or not buffer:
                continue

            logger.debug("received_value", value=value, topic=topic, characteristic_id=char_id)
            await self._dispatch_value(char_id, config, buffer, value)

    async def _dispatch_value(
        self, char_id: int, config: TagConfig, buffer: SubgroupBuffer, value: float
    ) -> None:
        """Add a value to a buffer and flush if needed based on trigger strategy."""
        if config.trigger_strategy == TriggerStrategy.ON_CHANGE.value:
            is_full = buffer.add(value)
            if is_full:
                logger.debug("buffer_full", characteristic_id=char_id)
                await self._flush_buffer(char_id)
        elif config.trigger_strategy == TriggerStrategy.ON_TRIGGER.value:
            buffer.add(value)
            logger.debug(
                "value_buffered_waiting_trigger",
                characteristic_id=char_id,
                buffer_count=len(buffer.values),
                subgroup_size=config.subgroup_size,
            )
        elif config.trigger_strategy == TriggerStrategy.ON_TIMER.value:
            buffer.add(value)
            logger.debug(
                "value_buffered_timer_flush",
                characteristic_id=char_id,
                buffer_count=len(buffer.values),
                subgroup_size=config.subgroup_size,
            )

    async def _on_trigger_message(self, topic: str, payload: bytes) -> None:
        """Handle incoming MQTT message for a trigger tag.

        This callback is invoked when a message arrives on a trigger topic.
        It flushes all buffers that are configured to use this trigger tag.

        Args:
            topic: MQTT topic the message was received on
            payload: Message payload as bytes (not used)
        """
        logger.debug("trigger_received", topic=topic)

        # Find all characteristics using this trigger tag
        for char_id, config in self._configs.items():
            if config.trigger_tag == topic and config.trigger_strategy == TriggerStrategy.ON_TRIGGER.value:
                buffer = self._buffers.get(char_id)
                if buffer and buffer.values:
                    logger.info(
                        "flushing_buffer_on_trigger",
                        characteristic_id=char_id,
                        trigger_topic=topic,
                        value_count=len(buffer.values),
                    )
                    await self._flush_buffer(char_id)

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
            "flushing_buffer",
            characteristic_id=char_id,
            value_count=len(values),
        )

        # Create sample event
        event = SampleEvent(
            characteristic_id=char_id,
            measurements=values,
            timestamp=datetime.now(timezone.utc),
            context=SampleContext(source="TAG"),
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
            logger.info("sample_processed", characteristic_id=char_id)
        except Exception as e:
            logger.error(
                "callback_error",
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
        logger.info("Starting buffer timeout monitoring loop")

        while self._running:
            try:
                await asyncio.sleep(5)  # Check every 5 seconds

                for char_id, buffer in self._buffers.items():
                    config = self._configs.get(char_id)
                    if not config:
                        continue

                    if buffer.values and buffer.is_timed_out(config.buffer_timeout_seconds):
                        logger.warning(
                            "buffer_timeout",
                            characteristic_id=char_id,
                            buffer_count=len(buffer.values),
                            expected=config.subgroup_size,
                        )
                        await self._flush_buffer(char_id)

            except asyncio.CancelledError:
                logger.info("Buffer timeout loop cancelled")
                break
            except Exception as e:
                logger.error("timeout_loop_error", error=str(e), exc_info=True)

        logger.info("Buffer timeout monitoring loop stopped")
