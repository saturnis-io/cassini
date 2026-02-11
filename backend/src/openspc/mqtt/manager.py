"""MQTT Manager for application lifecycle integration.

This module provides MQTTManager for managing multiple MQTT client connections
within the FastAPI application, including loading broker configurations
from the database and handling connection state per broker.
"""

import asyncio
import structlog
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.dialects import decrypt_password, get_encryption_key
from openspc.db.models.broker import MQTTBroker
from openspc.db.repositories import BrokerRepository
from openspc.mqtt.client import MQTTClient, MQTTConfig

logger = structlog.get_logger(__name__)


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
    """Manages multiple MQTT client connections for the application.

    Provides multi-broker management where each plant can have its own
    broker connection(s) running independently. Maintains backward
    compatibility with single-broker API.

    Features:
    - Multiple concurrent broker connections
    - Per-broker connection lifecycle
    - Backward-compatible single-broker API
    - Topic discovery service integration

    Example:
        >>> manager = MQTTManager()
        >>> async with get_session() as session:
        ...     await manager.initialize(session)
        >>> # Later, on shutdown:
        >>> await manager.shutdown()
    """

    def __init__(self):
        """Initialize the MQTT manager with multi-broker support."""
        self._clients: dict[int, MQTTClient] = {}  # broker_id -> client
        self._states: dict[int, ConnectionState] = {}  # broker_id -> state
        self._broker_configs: dict[int, MQTTBroker] = {}  # broker_id -> config
        self._discovery_services: dict[int, object] = {}  # broker_id -> TopicDiscoveryService

    # -----------------------------------------------------------------------
    # Backward-compatible single-broker properties
    # -----------------------------------------------------------------------

    @property
    def client(self) -> MQTTClient | None:
        """Get the first connected MQTT client (backward compat).

        Returns:
            The first connected MQTTClient instance, or None
        """
        for client in self._clients.values():
            if client.is_connected:
                return client
        # Return first client even if not connected
        if self._clients:
            return next(iter(self._clients.values()))
        return None

    @property
    def state(self) -> ConnectionState:
        """Get combined connection state (backward compat).

        Returns the state of the first connected broker, or a default
        disconnected state if no brokers are connected.

        Returns:
            Current ConnectionState
        """
        # Find first connected broker state
        for broker_id, client in self._clients.items():
            state = self._states.get(broker_id)
            if state and client.is_connected:
                state.is_connected = True
                state.subscribed_topics = list(client._subscriptions.keys())
                return state

        # Return first state or default
        if self._states:
            first_id = next(iter(self._states))
            state = self._states[first_id]
            client = self._clients.get(first_id)
            if client:
                state.is_connected = client.is_connected
                state.subscribed_topics = list(client._subscriptions.keys())
            return state

        return ConnectionState(error_message="No broker configured")

    @property
    def is_connected(self) -> bool:
        """Check if any broker is currently connected.

        Returns:
            True if at least one broker is connected, False otherwise
        """
        return any(client.is_connected for client in self._clients.values())

    # -----------------------------------------------------------------------
    # Multi-broker API
    # -----------------------------------------------------------------------

    def get_client(self, broker_id: int) -> MQTTClient | None:
        """Get the MQTT client for a specific broker.

        Args:
            broker_id: ID of the broker

        Returns:
            The MQTTClient instance if exists, None otherwise
        """
        return self._clients.get(broker_id)

    def get_state(self, broker_id: int) -> ConnectionState | None:
        """Get connection state for a specific broker.

        Args:
            broker_id: ID of the broker

        Returns:
            ConnectionState if exists, None otherwise
        """
        state = self._states.get(broker_id)
        if state:
            client = self._clients.get(broker_id)
            if client:
                state.is_connected = client.is_connected
                state.subscribed_topics = list(client._subscriptions.keys())
        return state

    def get_all_states(self) -> dict[int, ConnectionState]:
        """Get connection states for all brokers.

        Returns:
            Dict mapping broker_id to ConnectionState
        """
        result = {}
        for broker_id, state in self._states.items():
            client = self._clients.get(broker_id)
            if client:
                state.is_connected = client.is_connected
                state.subscribed_topics = list(client._subscriptions.keys())
            result[broker_id] = state
        return result

    def get_discovery_service(self, broker_id: int):
        """Get the TopicDiscoveryService for a specific broker.

        Args:
            broker_id: ID of the broker

        Returns:
            TopicDiscoveryService if exists, None otherwise
        """
        return self._discovery_services.get(broker_id)

    def set_discovery_service(self, broker_id: int, service) -> None:
        """Set the TopicDiscoveryService for a specific broker.

        Args:
            broker_id: ID of the broker
            service: TopicDiscoveryService instance
        """
        self._discovery_services[broker_id] = service

    def remove_discovery_service(self, broker_id: int) -> None:
        """Remove the TopicDiscoveryService for a specific broker.

        Args:
            broker_id: ID of the broker
        """
        self._discovery_services.pop(broker_id, None)

    # -----------------------------------------------------------------------
    # Lifecycle management
    # -----------------------------------------------------------------------

    async def initialize(self, session: AsyncSession) -> bool:
        """Initialize MQTT clients from database configuration.

        Loads all active broker configurations from the database and
        establishes connections concurrently. If no active brokers are
        configured, the manager remains in an unconnected state.

        Args:
            session: SQLAlchemy async session for database access

        Returns:
            True if at least one connection was established, False otherwise
        """
        logger.info("Initializing MQTT manager (multi-broker)")

        # Load all active broker configurations
        repo = BrokerRepository(session)
        brokers = await repo.get_all_active()

        if not brokers:
            logger.info("No active MQTT brokers configured")
            return False

        # Connect to all active brokers concurrently
        results = await asyncio.gather(
            *[self._connect_to_broker(broker) for broker in brokers],
            return_exceptions=True,
        )

        connected = sum(1 for r in results if r is True)
        logger.info(
            "mqtt_manager_initialized",
            connected=connected,
            total=len(brokers),
        )

        return connected > 0

    async def connect_broker(self, broker_id: int, session: AsyncSession) -> bool:
        """Connect to a specific broker by ID.

        Args:
            broker_id: ID of broker to connect to
            session: SQLAlchemy async session for database access

        Returns:
            True if connection was established, False otherwise
        """
        logger.info("connecting_to_broker", broker_id=broker_id)

        repo = BrokerRepository(session)
        broker = await repo.get_by_id(broker_id)

        if broker is None:
            logger.error("broker_not_found", broker_id=broker_id)
            return False

        return await self._connect_to_broker(broker)

    async def disconnect_broker(self, broker_id: int) -> bool:
        """Disconnect a specific broker.

        Args:
            broker_id: ID of broker to disconnect

        Returns:
            True if disconnected successfully, False if broker not found
        """
        logger.info("disconnecting_broker", broker_id=broker_id)

        client = self._clients.get(broker_id)
        if client is None:
            logger.warning("no_client_for_broker", broker_id=broker_id)
            return False

        # Stop discovery if active
        discovery = self._discovery_services.pop(broker_id, None)
        if discovery:
            try:
                await discovery.stop_discovery(client)
            except Exception as e:
                logger.warning("discovery_stop_error", broker_id=broker_id, error=str(e))

        await client.disconnect()
        del self._clients[broker_id]

        if broker_id in self._states:
            self._states[broker_id].is_connected = False
            self._states[broker_id].error_message = "Disconnected"

        logger.info("broker_disconnected", broker_id=broker_id)
        return True

    async def _connect_to_broker(self, broker: MQTTBroker) -> bool:
        """Connect to a specific broker.

        Args:
            broker: Broker configuration to connect to

        Returns:
            True if connection was established, False otherwise
        """
        logger.info("connecting_to_broker_config", name=broker.name, host=broker.host, port=broker.port)

        # Disconnect existing client for this broker if any
        if broker.id in self._clients:
            old_client = self._clients[broker.id]
            await old_client.disconnect()

        # Decrypt credentials if stored encrypted
        username = broker.username
        password = broker.password
        try:
            key = get_encryption_key()
            if username:
                username = decrypt_password(username, key)
            if password:
                password = decrypt_password(password, key)
        except (ValueError, Exception) as e:
            # Legacy unencrypted passwords — use as-is
            logger.warning(
                "broker_credential_decrypt_fallback",
                broker_id=broker.id,
                error=str(e),
            )
            username = broker.username
            password = broker.password

        # Create config from database model
        config = MQTTConfig(
            host=broker.host,
            port=broker.port,
            username=username,
            password=password,
            client_id=broker.client_id,
            keepalive=broker.keepalive,
            max_reconnect_delay=broker.max_reconnect_delay,
        )

        # Initialize state
        self._broker_configs[broker.id] = broker
        self._states[broker.id] = ConnectionState(
            broker_id=broker.id,
            broker_name=broker.name,
        )

        try:
            client = MQTTClient(config)
            await client.connect()  # Non-blocking: returns immediately even if broker is offline

            # Always register the client — it may be reconnecting in background
            self._clients[broker.id] = client
            self._states[broker.id].is_connected = client.is_connected

            if client.is_connected:
                self._states[broker.id].last_connected = datetime.now()
                self._states[broker.id].error_message = None
                logger.info("broker_connected", name=broker.name)
            else:
                self._states[broker.id].error_message = "Connecting in background"
                logger.info("broker_reconnecting_background", name=broker.name)

            return client.is_connected

        except Exception as e:
            logger.error("broker_init_failed", name=broker.name, error=str(e))
            self._states[broker.id].is_connected = False
            self._states[broker.id].error_message = str(e)
            return False

    async def reconnect(self, session: AsyncSession) -> bool:
        """Reconnect all brokers.

        Useful when broker configuration has changed.

        Args:
            session: SQLAlchemy async session for database access

        Returns:
            True if at least one reconnection was successful, False otherwise
        """
        logger.info("Reconnecting MQTT manager")

        # Disconnect all current clients
        await self.shutdown()

        # Re-initialize with fresh configuration
        return await self.initialize(session)

    async def switch_broker(self, broker_id: int, session: AsyncSession) -> bool:
        """Connect to a broker (multi-broker aware, backward compat).

        In multi-broker mode, this simply connects the specified broker
        without disconnecting others.

        Args:
            broker_id: ID of broker to switch to
            session: SQLAlchemy async session for database access

        Returns:
            True if switch was successful, False otherwise
        """
        logger.info("switching_broker", broker_id=broker_id)

        repo = BrokerRepository(session)
        broker = await repo.get_by_id(broker_id)

        if broker is None:
            logger.error("broker_not_found", broker_id=broker_id)
            return False

        return await self._connect_to_broker(broker)

    async def shutdown(self) -> None:
        """Shutdown MQTT manager and disconnect all clients.

        Gracefully disconnects from all brokers and cleans up resources.
        """
        logger.info("Shutting down MQTT manager")

        # Stop all discovery services
        for broker_id, discovery in list(self._discovery_services.items()):
            client = self._clients.get(broker_id)
            if client and discovery:
                try:
                    await discovery.stop_discovery(client)
                except Exception as e:
                    logger.warning("discovery_stop_error", broker_id=broker_id, error=str(e))
        self._discovery_services.clear()

        # Disconnect all clients
        for broker_id, client in list(self._clients.items()):
            try:
                await client.disconnect()
                logger.debug("broker_disconnected", broker_id=broker_id)
            except Exception as e:
                logger.warning("broker_disconnect_error", broker_id=broker_id, error=str(e))

        self._clients.clear()

        # Update all states
        for state in self._states.values():
            state.is_connected = False
            state.error_message = "Manager shutdown"

        self._states.clear()
        self._broker_configs.clear()

        logger.info("MQTT manager shutdown complete")

    # -----------------------------------------------------------------------
    # Subscribe / Unsubscribe / Publish (with optional broker_id)
    # -----------------------------------------------------------------------

    async def subscribe(
        self,
        topic: str,
        callback,
        broker_id: int | None = None,
    ) -> None:
        """Subscribe to an MQTT topic.

        Args:
            topic: Topic pattern to subscribe to
            callback: Async callback for messages
            broker_id: Optional broker ID (None = first available client)

        Raises:
            RuntimeError: If not connected to any broker
        """
        client = self._get_client_for_operation(broker_id)
        await client.subscribe(topic, callback)
        logger.info("subscribed_to_topic", topic=topic)

    async def unsubscribe(
        self,
        topic: str,
        broker_id: int | None = None,
    ) -> None:
        """Unsubscribe from an MQTT topic.

        Args:
            topic: Topic pattern to unsubscribe from
            broker_id: Optional broker ID (None = first available client)
        """
        if broker_id is not None:
            client = self._clients.get(broker_id)
        else:
            client = self.client

        if client:
            await client.unsubscribe(topic)
            logger.info("unsubscribed_from_topic", topic=topic)

    async def publish(
        self,
        topic: str,
        payload: bytes,
        qos: int = 1,
        broker_id: int | None = None,
    ) -> None:
        """Publish a message to an MQTT topic.

        Args:
            topic: Topic to publish to
            payload: Message payload
            qos: Quality of service level
            broker_id: Optional broker ID (None = first available client)

        Raises:
            RuntimeError: If not connected to any broker
        """
        client = self._get_client_for_operation(broker_id)
        await client.publish(topic, payload, qos)

    def _get_client_for_operation(self, broker_id: int | None = None) -> MQTTClient:
        """Get client for a subscribe/publish operation.

        Args:
            broker_id: Optional specific broker ID

        Returns:
            MQTTClient instance

        Raises:
            RuntimeError: If no suitable client found
        """
        if broker_id is not None:
            client = self._clients.get(broker_id)
            if client is None:
                raise RuntimeError(f"Broker {broker_id} not connected")
            return client

        client = self.client
        if client is None:
            raise RuntimeError("MQTT manager not connected to any broker")
        return client


# Global instance for application use
mqtt_manager = MQTTManager()
