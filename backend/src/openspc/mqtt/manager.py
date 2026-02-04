"""MQTT Manager for application lifecycle integration.

This module provides MQTTManager for managing MQTT client lifecycle
within the FastAPI application, including loading broker configuration
from the database and handling connection state.
"""

import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.broker import MQTTBroker
from openspc.db.repositories import BrokerRepository
from openspc.mqtt.client import MQTTClient, MQTTConfig

logger = logging.getLogger(__name__)


@dataclass
class ConnectionState:
    """Current state of MQTT connection.

    Attributes:
        broker_id: ID of connected broker (if any)
        broker_name: Name of connected broker (if any)
        is_connected: Whether currently connected
        last_connected: Timestamp of last successful connection
        error_message: Current error message if not connected
        subscribed_topics: List of currently subscribed topics
    """

    broker_id: int | None = None
    broker_name: str | None = None
    is_connected: bool = False
    last_connected: datetime | None = None
    error_message: str | None = None
    subscribed_topics: list[str] = None

    def __post_init__(self):
        if self.subscribed_topics is None:
            self.subscribed_topics = []


class MQTTManager:
    """Manages MQTT client lifecycle for the application.

    Provides a singleton-like manager for the MQTT client that:
    - Loads broker configuration from the database
    - Initializes and manages the MQTTClient
    - Tracks connection state
    - Handles reconnection on configuration changes

    Example:
        >>> manager = MQTTManager()
        >>> async with get_session() as session:
        ...     await manager.initialize(session)
        >>> # Later, on shutdown:
        >>> await manager.shutdown()
    """

    def __init__(self):
        """Initialize the MQTT manager."""
        self._client: MQTTClient | None = None
        self._state = ConnectionState()
        self._broker_config: MQTTBroker | None = None

    @property
    def client(self) -> MQTTClient | None:
        """Get the underlying MQTT client.

        Returns:
            The MQTTClient instance if initialized, None otherwise
        """
        return self._client

    @property
    def state(self) -> ConnectionState:
        """Get current connection state.

        Returns:
            Current ConnectionState
        """
        # Update connected status from client
        if self._client:
            self._state.is_connected = self._client.is_connected
            self._state.subscribed_topics = list(self._client._subscriptions.keys())
        return self._state

    @property
    def is_connected(self) -> bool:
        """Check if currently connected to a broker.

        Returns:
            True if connected, False otherwise
        """
        return self._client is not None and self._client.is_connected

    async def initialize(self, session: AsyncSession) -> bool:
        """Initialize MQTT client from database configuration.

        Loads the active broker configuration from the database and
        establishes a connection. If no active broker is configured,
        the manager remains in an unconnected state.

        Args:
            session: SQLAlchemy async session for database access

        Returns:
            True if connection was established, False otherwise
        """
        logger.info("Initializing MQTT manager")

        # Load active broker configuration
        repo = BrokerRepository(session)
        broker = await repo.get_active()

        if broker is None:
            logger.info("No active MQTT broker configured")
            self._state.error_message = "No active broker configured"
            return False

        return await self._connect_to_broker(broker)

    async def _connect_to_broker(self, broker: MQTTBroker) -> bool:
        """Connect to a specific broker.

        Args:
            broker: Broker configuration to connect to

        Returns:
            True if connection was established, False otherwise
        """
        logger.info(f"Connecting to broker: {broker.name} ({broker.host}:{broker.port})")

        # Disconnect from current broker if any
        if self._client:
            await self._client.disconnect()
            self._client = None

        # Create config from database model
        config = MQTTConfig(
            host=broker.host,
            port=broker.port,
            username=broker.username,
            password=broker.password,
            client_id=broker.client_id,
            keepalive=broker.keepalive,
            max_reconnect_delay=broker.max_reconnect_delay,
        )

        self._broker_config = broker
        self._state.broker_id = broker.id
        self._state.broker_name = broker.name

        try:
            self._client = MQTTClient(config)
            await self._client.connect()

            self._state.is_connected = True
            self._state.last_connected = datetime.now()
            self._state.error_message = None

            logger.info(f"Successfully connected to broker: {broker.name}")
            return True

        except Exception as e:
            logger.error(f"Failed to connect to broker {broker.name}: {e}")
            self._state.is_connected = False
            self._state.error_message = str(e)
            self._client = None
            return False

    async def reconnect(self, session: AsyncSession) -> bool:
        """Reconnect to the active broker.

        Useful when broker configuration has changed.

        Args:
            session: SQLAlchemy async session for database access

        Returns:
            True if reconnection was successful, False otherwise
        """
        logger.info("Reconnecting MQTT manager")

        # Disconnect current client
        if self._client:
            await self._client.disconnect()
            self._client = None

        # Re-initialize with fresh configuration
        return await self.initialize(session)

    async def switch_broker(self, broker_id: int, session: AsyncSession) -> bool:
        """Switch to a different broker.

        Args:
            broker_id: ID of broker to switch to
            session: SQLAlchemy async session for database access

        Returns:
            True if switch was successful, False otherwise
        """
        logger.info(f"Switching to broker ID: {broker_id}")

        repo = BrokerRepository(session)
        broker = await repo.get_by_id(broker_id)

        if broker is None:
            logger.error(f"Broker {broker_id} not found")
            self._state.error_message = f"Broker {broker_id} not found"
            return False

        return await self._connect_to_broker(broker)

    async def shutdown(self) -> None:
        """Shutdown MQTT manager and disconnect client.

        Gracefully disconnects from the broker and cleans up resources.
        """
        logger.info("Shutting down MQTT manager")

        if self._client:
            await self._client.disconnect()
            self._client = None

        self._state.is_connected = False
        self._state.error_message = "Manager shutdown"

        logger.info("MQTT manager shutdown complete")

    async def subscribe(self, topic: str, callback) -> None:
        """Subscribe to an MQTT topic.

        Args:
            topic: Topic pattern to subscribe to
            callback: Async callback for messages

        Raises:
            RuntimeError: If not connected to a broker
        """
        if not self._client:
            raise RuntimeError("MQTT manager not connected to a broker")

        await self._client.subscribe(topic, callback)
        logger.info(f"Subscribed to topic: {topic}")

    async def unsubscribe(self, topic: str) -> None:
        """Unsubscribe from an MQTT topic.

        Args:
            topic: Topic pattern to unsubscribe from
        """
        if self._client:
            await self._client.unsubscribe(topic)
            logger.info(f"Unsubscribed from topic: {topic}")

    async def publish(self, topic: str, payload: bytes, qos: int = 1) -> None:
        """Publish a message to an MQTT topic.

        Args:
            topic: Topic to publish to
            payload: Message payload
            qos: Quality of service level

        Raises:
            RuntimeError: If not connected to a broker
        """
        if not self._client:
            raise RuntimeError("MQTT manager not connected to a broker")

        await self._client.publish(topic, payload, qos)


# Global instance for application use
mqtt_manager = MQTTManager()
