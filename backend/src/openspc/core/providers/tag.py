"""Tag-based data provider for automated MQTT data collection.

This module provides the TagProvider class, which subscribes to MQTT topics
and automatically collects measurements from machine tags, buffering them
into subgroups and triggering sample processing based on configured strategies.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from openspc.core.providers.protocol import DataProvider, SampleCallback, SampleContext, SampleEvent
from openspc.mqtt.client import MQTTClient

if TYPE_CHECKING:
    from openspc.db.repositories.characteristic import CharacteristicRepository

logger = logging.getLogger(__name__)


class TriggerStrategy(Enum):
    """Strategy for triggering sample submission.

    Attributes:
        ON_CHANGE: Trigger on each message (default)
        ON_TRIGGER: Wait for trigger tag before submitting
        ON_TIMER: Time-based batching of readings
    """

    ON_CHANGE = "on_change"
    ON_TRIGGER = "on_trigger"
    ON_TIMER = "on_timer"


@dataclass
class TagConfig:
    """Configuration for a tag subscription.

    Attributes:
        characteristic_id: ID of the characteristic this tag measures
        mqtt_topic: MQTT topic to subscribe to
        subgroup_size: Number of readings to accumulate per subgroup
        trigger_strategy: How to trigger sample submission
        trigger_tag: MQTT topic for trigger signal (used with ON_TRIGGER)
        buffer_timeout_seconds: Timeout for flushing partial buffers
    """

    characteristic_id: int
    mqtt_topic: str
    subgroup_size: int
    trigger_strategy: TriggerStrategy = TriggerStrategy.ON_CHANGE
    trigger_tag: str | None = None
    buffer_timeout_seconds: float = 60.0


@dataclass
class SubgroupBuffer:
    """Buffer for accumulating readings into a subgroup.

    This buffer collects individual measurements until the subgroup size
    is reached or a timeout occurs, at which point the buffered values
    are flushed and submitted as a sample.

    Attributes:
        config: Configuration for this buffer
        values: Accumulated measurement values
        first_reading_time: Timestamp of first reading in current buffer
    """

    config: TagConfig
    values: list[float] = field(default_factory=list)
    first_reading_time: datetime | None = None

    def add(self, value: float) -> bool:
        """Add a value to the buffer.

        Args:
            value: Measurement value to add

        Returns:
            True if buffer is now full (reached subgroup_size)
        """
        if not self.values:
            self.first_reading_time = datetime.utcnow()
        self.values.append(value)
        return len(self.values) >= self.config.subgroup_size

    def is_ready(self) -> bool:
        """Check if buffer has enough readings to flush.

        Returns:
            True if buffer has reached subgroup_size
        """
        return len(self.values) >= self.config.subgroup_size

    def is_timed_out(self, timeout_seconds: float) -> bool:
        """Check if buffer has timed out.

        A buffer times out if it has pending values and the elapsed time
        since the first reading exceeds the timeout threshold.

        Args:
            timeout_seconds: Timeout threshold in seconds

        Returns:
            True if buffer has timed out
        """
        if not self.first_reading_time or not self.values:
            return False
        elapsed = (datetime.utcnow() - self.first_reading_time).total_seconds()
        return elapsed >= timeout_seconds

    def flush(self) -> list[float]:
        """Get all values and clear the buffer.

        Returns:
            List of buffered values (may be less than subgroup_size)
        """
        values = self.values.copy()
        self.values.clear()
        self.first_reading_time = None
        return values


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
        char_repo: "CharacteristicRepository",
    ):
        """Initialize the tag provider.

        Args:
            mqtt_client: MQTT client for topic subscriptions
            char_repo: Repository for characteristic lookups
        """
        self._mqtt = mqtt_client
        self._char_repo = char_repo
        self._callback: SampleCallback | None = None
        self._configs: dict[int, TagConfig] = {}  # char_id -> config
        self._buffers: dict[int, SubgroupBuffer] = {}  # char_id -> buffer
        self._topic_to_char: dict[str, int] = {}  # topic -> char_id
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
            f"TagProvider started with {len(self._configs)} characteristics subscribed"
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
        for topic in list(self._topic_to_char.keys()):
            try:
                await self._mqtt.unsubscribe(topic)
                logger.debug(f"Unsubscribed from topic: {topic}")
            except Exception as e:
                logger.error(f"Error unsubscribing from {topic}: {e}")

        # Clear state
        self._configs.clear()
        self._buffers.clear()
        self._topic_to_char.clear()

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
        """Load all TAG-type characteristics and subscribe to their topics.

        This method queries the database for all characteristics with
        provider_type="TAG", creates configurations and buffers for them,
        and subscribes to their MQTT topics.
        """
        logger.info("Loading TAG-type characteristics")
        chars = await self._char_repo.get_by_provider_type("TAG")

        for char in chars:
            if not char.mqtt_topic:
                logger.warning(
                    f"Characteristic {char.id} ({char.name}) has no mqtt_topic configured, skipping"
                )
                continue

            # Determine trigger strategy
            trigger_strategy = TriggerStrategy.ON_CHANGE
            if char.trigger_tag:
                trigger_strategy = TriggerStrategy.ON_TRIGGER

            # Create configuration
            config = TagConfig(
                characteristic_id=char.id,
                mqtt_topic=char.mqtt_topic,
                subgroup_size=char.subgroup_size,
                trigger_strategy=trigger_strategy,
                trigger_tag=char.trigger_tag,
            )

            # Store configuration and create buffer
            self._configs[char.id] = config
            self._buffers[char.id] = SubgroupBuffer(config)
            self._topic_to_char[char.mqtt_topic] = char.id

            # Subscribe to topic
            try:
                await self._mqtt.subscribe(char.mqtt_topic, self._on_message)
                logger.info(
                    f"Subscribed to {char.mqtt_topic} for characteristic "
                    f"{char.id} ({char.name})"
                )
            except Exception as e:
                logger.error(
                    f"Failed to subscribe to {char.mqtt_topic} for "
                    f"characteristic {char.id}: {e}"
                )
                # Clean up partial state
                del self._configs[char.id]
                del self._buffers[char.id]
                del self._topic_to_char[char.mqtt_topic]
                continue

            # Subscribe to trigger tag if configured
            if char.trigger_tag and char.trigger_tag not in self._topic_to_char:
                try:
                    await self._mqtt.subscribe(char.trigger_tag, self._on_trigger_message)
                    logger.info(f"Subscribed to trigger tag: {char.trigger_tag}")
                except Exception as e:
                    logger.error(f"Failed to subscribe to trigger tag {char.trigger_tag}: {e}")

        logger.info(f"Loaded {len(self._configs)} TAG-type characteristics")

    async def _on_message(self, topic: str, payload: bytes) -> None:
        """Handle incoming MQTT message for a data tag.

        This callback is invoked when a message arrives on a subscribed
        data topic. It parses the payload, adds the value to the buffer,
        and flushes if the buffer is full (for ON_CHANGE strategy).

        Args:
            topic: MQTT topic the message was received on
            payload: Message payload as bytes
        """
        if topic not in self._topic_to_char:
            logger.warning(f"Received message on unmapped topic: {topic}")
            return

        char_id = self._topic_to_char[topic]
        config = self._configs.get(char_id)
        buffer = self._buffers.get(char_id)

        if not config or not buffer:
            logger.warning(f"No config/buffer found for characteristic {char_id}")
            return

        # Parse value from payload
        try:
            value = float(payload.decode().strip())
        except (ValueError, UnicodeDecodeError) as e:
            logger.error(
                f"Failed to parse payload on {topic}: {payload!r} - {e}"
            )
            return

        logger.debug(f"Received value {value} on {topic} for char {char_id}")

        # Add to buffer based on trigger strategy
        if config.trigger_strategy == TriggerStrategy.ON_CHANGE:
            is_full = buffer.add(value)
            if is_full:
                logger.debug(f"Buffer full for char {char_id}, flushing")
                await self._flush_buffer(char_id)
        elif config.trigger_strategy == TriggerStrategy.ON_TRIGGER:
            # Just add to buffer, wait for trigger
            buffer.add(value)
            logger.debug(
                f"Added value to buffer for char {char_id} "
                f"({len(buffer.values)}/{config.subgroup_size}), waiting for trigger"
            )
        elif config.trigger_strategy == TriggerStrategy.ON_TIMER:
            # Add to buffer, timeout loop will handle flushing
            buffer.add(value)
            logger.debug(
                f"Added value to buffer for char {char_id} "
                f"({len(buffer.values)}/{config.subgroup_size}), timer-based flush"
            )

    async def _on_trigger_message(self, topic: str, payload: bytes) -> None:
        """Handle incoming MQTT message for a trigger tag.

        This callback is invoked when a message arrives on a trigger topic.
        It flushes all buffers that are configured to use this trigger tag.

        Args:
            topic: MQTT topic the message was received on
            payload: Message payload as bytes (not used)
        """
        logger.debug(f"Trigger received on {topic}")

        # Find all characteristics using this trigger tag
        for char_id, config in self._configs.items():
            if config.trigger_tag == topic and config.trigger_strategy == TriggerStrategy.ON_TRIGGER:
                buffer = self._buffers.get(char_id)
                if buffer and buffer.values:
                    logger.info(
                        f"Flushing buffer for char {char_id} on trigger {topic} "
                        f"({len(buffer.values)} values)"
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
            logger.warning(f"No buffer found for characteristic {char_id}")
            return

        buffer = self._buffers[char_id]
        values = buffer.flush()

        if not values:
            logger.debug(f"Buffer for char {char_id} is empty, nothing to flush")
            return

        logger.info(
            f"Flushing buffer for characteristic {char_id} with {len(values)} values"
        )

        # Create sample event
        event = SampleEvent(
            characteristic_id=char_id,
            measurements=values,
            timestamp=datetime.utcnow(),
            context=SampleContext(source="TAG"),
        )

        # Invoke callback
        if self._callback is None:
            logger.warning(
                f"No callback set for TagProvider, discarding sample for char {char_id}"
            )
            return

        try:
            await self._callback(event)
            logger.info(f"Successfully processed sample for characteristic {char_id}")
        except Exception as e:
            logger.error(
                f"Error in callback for characteristic {char_id}: {e}",
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
                            f"Buffer timeout for char {char_id}: flushing "
                            f"{len(buffer.values)} values (expected {config.subgroup_size})"
                        )
                        await self._flush_buffer(char_id)

            except asyncio.CancelledError:
                logger.info("Buffer timeout loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error in timeout loop: {e}", exc_info=True)

        logger.info("Buffer timeout monitoring loop stopped")
