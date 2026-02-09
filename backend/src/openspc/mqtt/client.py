"""MQTT client wrapper with connection lifecycle management.

This module provides MQTTClient for managing MQTT broker connections with
automatic reconnection, topic subscription management, and graceful shutdown.
"""

import asyncio
import contextlib
import structlog
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from aiomqtt import Client, MqttError

logger = structlog.get_logger(__name__)

MessageCallback = Callable[[str, bytes], Awaitable[None]]


@dataclass
class MQTTConfig:
    """Configuration for MQTT client connection.

    Attributes:
        host: MQTT broker hostname or IP address
        port: MQTT broker port (default: 1883)
        username: Optional username for authentication
        password: Optional password for authentication
        client_id: Unique client identifier
        keepalive: Keepalive interval in seconds
        max_reconnect_delay: Maximum delay between reconnection attempts
    """

    host: str = "localhost"
    port: int = 1883
    username: str | None = None
    password: str | None = None
    client_id: str = "openspc-server"
    keepalive: int = 60
    max_reconnect_delay: int = 30


class MQTTClient:
    """MQTT client wrapper with auto-reconnection.

    Provides a high-level interface to aiomqtt with automatic reconnection,
    subscription restoration, and graceful shutdown handling.

    The client automatically:
    - Reconnects with exponential backoff on connection loss
    - Restores subscriptions after reconnection
    - Routes incoming messages to registered callbacks
    - Handles topic wildcard matching (# and +)

    Example:
        >>> config = MQTTConfig(host="mqtt.example.com", port=1883)
        >>> client = MQTTClient(config)
        >>>
        >>> async def handle_message(topic: str, payload: bytes) -> None:
        ...     print(f"Received on {topic}: {payload}")
        >>>
        >>> await client.connect()
        >>> await client.subscribe("sensors/#", handle_message)
        >>> await client.publish("sensors/temp", b"22.5")
        >>> await client.disconnect()
    """

    def __init__(self, config: MQTTConfig):
        """Initialize MQTT client.

        Args:
            config: MQTT configuration settings
        """
        self._config = config
        self._client: Client | None = None
        self._connected = False
        self._subscriptions: dict[str, MessageCallback] = {}
        self._reconnect_task: asyncio.Task[None] | None = None
        self._message_task: asyncio.Task[None] | None = None
        self._shutdown_event = asyncio.Event()

    @property
    def is_connected(self) -> bool:
        """Check if client is currently connected to broker.

        Returns:
            True if connected, False otherwise
        """
        return self._connected

    async def connect(self) -> None:
        """Connect to MQTT broker with auto-reconnection.

        Attempts a single connection to the broker. If successful, starts
        the message processing loop. If the initial connection fails,
        starts background reconnection with exponential backoff so the
        application can continue starting up without blocking.

        If the connection drops later, automatic reconnection happens in
        the background via the message loop.
        """
        logger.info(
            "connecting_to_broker",
            host=self._config.host,
            port=self._config.port,
        )
        self._shutdown_event.clear()

        # Try a single connection attempt (non-blocking startup)
        if await self._try_connect_once():
            self._message_task = asyncio.create_task(self._message_loop())
            logger.info("MQTT client connected and message loop started")
        else:
            # Start background reconnection so the app isn't blocked
            logger.warning(
                "initial_connection_failed",
                host=self._config.host,
                port=self._config.port,
            )
            self._reconnect_task = asyncio.create_task(self._background_connect_loop())

    async def disconnect(self) -> None:
        """Gracefully disconnect from broker.

        Stops the message processing loop, cancels any pending reconnection
        attempts, and closes the connection to the broker.

        This method is safe to call multiple times.
        """
        logger.info("Disconnecting MQTT client")
        self._shutdown_event.set()

        # Cancel message loop
        if self._message_task and not self._message_task.done():
            self._message_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._message_task

        # Cancel reconnection task
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reconnect_task

        # Close client connection
        if self._client:
            try:
                await self._client.__aexit__(None, None, None)
            except Exception as e:
                logger.warning("error_closing_client", error=str(e))
            finally:
                self._client = None

        self._connected = False
        logger.info("MQTT client disconnected")

    async def subscribe(self, topic: str, callback: MessageCallback) -> None:
        """Subscribe to a topic with callback.

        Registers a callback for messages on the specified topic. If already
        connected, immediately subscribes to the broker. If not connected,
        the subscription will be established when connection is made.

        Supports MQTT wildcards:
        - Single level: sensors/+/temperature
        - Multi level: sensors/#

        Args:
            topic: Topic pattern to subscribe to (supports # and + wildcards)
            callback: Async function to call when message arrives

        Example:
            >>> async def handle_temp(topic: str, payload: bytes) -> None:
            ...     temp = float(payload.decode())
            ...     print(f"Temperature: {temp}")
            >>>
            >>> await client.subscribe("sensors/+/temp", handle_temp)
        """
        logger.info("subscribing_to_topic", topic=topic)
        self._subscriptions[topic] = callback

        if self._connected and self._client:
            try:
                await self._client.subscribe(topic)
                logger.info("subscribed", topic=topic)
            except MqttError as e:
                logger.error("subscribe_failed", topic=topic, error=str(e))
                raise

    async def unsubscribe(self, topic: str) -> None:
        """Unsubscribe from a topic.

        Removes the topic subscription and callback. If connected, immediately
        unsubscribes from the broker.

        Args:
            topic: Topic pattern to unsubscribe from

        Example:
            >>> await client.unsubscribe("sensors/+/temp")
        """
        logger.info("unsubscribing_from_topic", topic=topic)

        if topic in self._subscriptions:
            del self._subscriptions[topic]

            if self._connected and self._client:
                try:
                    await self._client.unsubscribe(topic)
                    logger.info("unsubscribed", topic=topic)
                except MqttError as e:
                    logger.error("unsubscribe_failed", topic=topic, error=str(e))
                    raise

    async def publish(self, topic: str, payload: bytes, qos: int = 1) -> None:
        """Publish a message to a topic.

        Sends a message to the specified topic. Requires an active connection.

        Args:
            topic: Topic to publish to (must not contain wildcards)
            payload: Message payload as bytes
            qos: Quality of Service level (0, 1, or 2)

        Raises:
            RuntimeError: If client is not connected
            MqttError: If publish fails

        Example:
            >>> await client.publish("sensors/temp", b"22.5", qos=1)
        """
        if not self._connected or not self._client:
            raise RuntimeError("Cannot publish: MQTT client not connected")

        logger.debug("publishing", topic=topic, payload_size=len(payload))

        try:
            await self._client.publish(topic, payload, qos=qos)
        except MqttError as e:
            logger.error("publish_failed", topic=topic, error=str(e))
            raise

    async def _try_connect_once(self) -> bool:
        """Attempt a single connection to the broker.

        Creates a new client, connects, and restores subscriptions.
        On failure, cleans up the partially-created client.

        Returns:
            True if connected successfully, False otherwise
        """
        try:
            self._client = Client(
                hostname=self._config.host,
                port=self._config.port,
                username=self._config.username,
                password=self._config.password,
                identifier=self._config.client_id,
                keepalive=self._config.keepalive,
            )
            await self._client.__aenter__()
            self._connected = True
            logger.info("Successfully connected to MQTT broker")

            # Restore subscriptions
            if self._subscriptions:
                logger.info(
                    "restoring_subscriptions",
                    count=len(self._subscriptions),
                )
                for topic in self._subscriptions:
                    try:
                        await self._client.subscribe(topic)
                        logger.debug("subscription_restored", topic=topic)
                    except MqttError as e:
                        logger.error("subscription_restore_failed", topic=topic, error=str(e))

            return True

        except (MqttError, OSError) as e:
            self._connected = False
            logger.warning("connection_attempt_failed", error=str(e))
            # Clean up failed client
            if self._client:
                try:
                    await self._client.__aexit__(None, None, None)
                except Exception:
                    pass
                self._client = None
            return False

        except Exception as e:
            self._connected = False
            logger.error("unexpected_connection_error", error=str(e))
            if self._client:
                try:
                    await self._client.__aexit__(None, None, None)
                except Exception:
                    pass
                self._client = None
            return False

    async def _background_connect_loop(self) -> None:
        """Background task that retries connection with exponential backoff.

        Runs after a failed initial connection attempt. Keeps retrying until
        connected, then starts the message loop. This allows the application
        to start up and function without waiting for broker connectivity.
        """
        delay = 1
        attempt = 1

        while not self._shutdown_event.is_set():
            await asyncio.sleep(delay)
            delay = min(delay * 2, self._config.max_reconnect_delay)

            if self._shutdown_event.is_set():
                break

            attempt += 1
            logger.info(
                "background_reconnect_attempt",
                attempt=attempt,
                host=self._config.host,
                port=self._config.port,
            )

            if await self._try_connect_once():
                self._message_task = asyncio.create_task(self._message_loop())
                logger.info("Background reconnection successful, message loop started")
                return

        logger.info("Background reconnection cancelled (shutdown)")

    async def _connect_with_retry(self) -> None:
        """Connect with exponential backoff retry (blocking).

        Used by the message loop to reconnect after losing an established
        connection. Blocks until reconnected or shutdown is signaled.

        Restores all subscriptions after successful connection.
        """
        delay = 1
        attempt = 0

        while not self._shutdown_event.is_set():
            attempt += 1
            logger.info(
                "reconnection_attempt",
                attempt=attempt,
                host=self._config.host,
                port=self._config.port,
            )

            if await self._try_connect_once():
                return

            logger.warning(
                "reconnection_failed",
                attempt=attempt,
                retry_delay=delay,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 2, self._config.max_reconnect_delay)

    async def _message_loop(self) -> None:
        """Process incoming messages.

        Main message processing loop. Receives messages from the broker and
        dispatches them to registered callbacks based on topic matching.

        Automatically reconnects if connection is lost.
        """
        logger.info("Message processing loop started")

        while not self._shutdown_event.is_set():
            try:
                if not self._client:
                    logger.warning("No client available, reconnecting...")
                    await self._connect_with_retry()
                    continue

                async for message in self._client.messages:
                    topic = str(message.topic)
                    payload = message.payload

                    logger.debug(
                        "message_received",
                        topic=topic,
                        payload_size=len(payload),
                    )

                    # Match topic to callbacks (handle wildcards)
                    for sub_topic, callback in self._subscriptions.items():
                        if self._topic_matches(sub_topic, topic):
                            try:
                                await callback(topic, payload)
                            except Exception as e:
                                logger.error(
                                    "callback_error",
                                    topic=topic,
                                    error=str(e),
                                    exc_info=True,
                                )

            except MqttError as e:
                self._connected = False
                logger.warning("connection_lost", error=str(e))

                if not self._shutdown_event.is_set():
                    logger.info("Attempting to reconnect...")
                    await self._connect_with_retry()

            except asyncio.CancelledError:
                logger.info("Message loop cancelled")
                break

            except Exception as e:
                logger.error("message_loop_error", error=str(e), exc_info=True)
                if not self._shutdown_event.is_set():
                    await asyncio.sleep(1)

        logger.info("Message processing loop stopped")

    @staticmethod
    def _topic_matches(pattern: str, topic: str) -> bool:
        """Check if topic matches subscription pattern.

        Implements MQTT wildcard matching:
        - # matches zero or more levels (must be last)
        - + matches exactly one level

        Args:
            pattern: Subscription pattern (may contain # and +)
            topic: Actual topic to match against

        Returns:
            True if topic matches pattern, False otherwise

        Examples:
            >>> MQTTClient._topic_matches("sensors/#", "sensors/temp/1")
            True
            >>> MQTTClient._topic_matches("sensors/+/temp", "sensors/device1/temp")
            True
            >>> MQTTClient._topic_matches("sensors/+/temp", "sensors/device1/humidity")
            False
        """
        # Split into levels
        pattern_parts = pattern.split("/")
        topic_parts = topic.split("/")

        # Handle multi-level wildcard (#)
        if "#" in pattern_parts:
            # # must be last and alone
            if pattern_parts[-1] != "#" or len(pattern_parts[-1]) > 1:
                return False

            # Match up to # position
            pattern_parts = pattern_parts[:-1]
            if len(topic_parts) < len(pattern_parts):
                return False
            topic_parts = topic_parts[: len(pattern_parts)]

        # Different lengths without # means no match
        if len(pattern_parts) != len(topic_parts):
            return False

        # Check each level
        for pattern_part, topic_part in zip(pattern_parts, topic_parts, strict=True):
            if pattern_part == "+":
                # Single level wildcard matches any single level
                continue
            elif pattern_part != topic_part:
                # Exact match required
                return False

        return True
