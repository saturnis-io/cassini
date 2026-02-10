"""OPC-UA client wrapper with connection lifecycle management.

This module provides OPCUAClient for managing OPC-UA server connections with
automatic reconnection, subscription restoration, and graceful shutdown.
"""

import asyncio
import contextlib
import structlog
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from asyncua import Client, ua
from asyncua.common.subscription import Subscription

logger = structlog.get_logger(__name__)

DataChangeCallback = Callable[[str, ua.DataValue], Awaitable[None]]


@dataclass
class OPCUAConfig:
    """Configuration for OPC-UA client connection.

    Attributes:
        endpoint_url: OPC-UA server endpoint URL (opc.tcp://...)
        auth_mode: Authentication mode ("anonymous" or "username_password")
        username: Decrypted plaintext username (if auth_mode is "username_password")
        password: Decrypted plaintext password (if auth_mode is "username_password")
        security_policy: Security policy ("None" or "Basic256Sha256")
        security_mode: Security mode ("None", "Sign", or "SignAndEncrypt")
        session_timeout: OPC-UA session timeout in milliseconds
        publishing_interval: Default subscription publishing interval in ms
        sampling_interval: Default monitored item sampling interval in ms
        connect_timeout: Connection timeout in seconds
        max_reconnect_delay: Maximum delay between reconnection attempts in seconds
        watchdog_interval: Connection watchdog check interval in seconds
    """

    endpoint_url: str = "opc.tcp://localhost:4840"
    auth_mode: str = "anonymous"
    username: str | None = None
    password: str | None = None
    security_policy: str = "None"
    security_mode: str = "None"
    session_timeout: int = 30000
    publishing_interval: int = 1000
    sampling_interval: int = 250
    connect_timeout: float = 10.0
    max_reconnect_delay: int = 30
    watchdog_interval: float = 5.0


class OPCUAClient:
    """OPC-UA client wrapper with auto-reconnection.

    Provides a high-level interface to asyncua.Client with automatic
    reconnection, subscription restoration, and graceful shutdown.

    The client automatically:
    - Reconnects with exponential backoff on connection loss
    - Restores subscriptions after reconnection
    - Routes data change notifications to per-node callbacks
    """

    def __init__(self, config: OPCUAConfig):
        self._config = config
        self._client: Client | None = None
        self._connected = False
        self._subscription: Subscription | None = None
        self._monitored_items: dict[str, int] = {}  # node_id -> handle
        self._callbacks: dict[str, DataChangeCallback] = {}  # node_id -> callback
        self._reconnect_task: asyncio.Task | None = None
        self._shutdown_event = asyncio.Event()

    @property
    def is_connected(self) -> bool:
        """Check if client is currently connected to server."""
        return self._connected

    @property
    def native_client(self) -> Client | None:
        """Access the underlying asyncua.Client for node browsing."""
        return self._client

    # --- Connection lifecycle ---

    async def connect(self) -> None:
        """Connect to OPC-UA server (non-blocking startup).

        Attempts a single connection. If successful, the client is ready.
        If the initial connection fails, starts background reconnection
        with exponential backoff so the application can continue starting up.
        """
        self._shutdown_event.clear()
        if await self._try_connect_once():
            logger.info("opcua_connected", url=self._config.endpoint_url)
        else:
            logger.warning(
                "opcua_initial_connect_failed",
                url=self._config.endpoint_url,
            )
            self._reconnect_task = asyncio.create_task(
                self._background_connect_loop()
            )

    async def disconnect(self) -> None:
        """Gracefully disconnect from server.

        Cancels reconnection tasks, deletes subscriptions, and closes
        the connection. Safe to call multiple times.
        """
        self._shutdown_event.set()

        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reconnect_task

        if self._subscription:
            try:
                await self._subscription.delete()
            except Exception as e:
                logger.warning("opcua_sub_delete_error", error=str(e))
            self._subscription = None

        if self._client:
            try:
                await self._client.disconnect()
            except Exception as e:
                logger.warning("opcua_disconnect_error", error=str(e))
            self._client = None

        self._connected = False
        self._monitored_items.clear()

    # --- Subscription management ---

    async def subscribe_data_change(
        self,
        node_id: str,
        callback: DataChangeCallback,
        sampling_interval: int | None = None,
    ) -> None:
        """Subscribe to data changes on a node.

        Args:
            node_id: OPC-UA NodeId string (e.g. "ns=2;i=1234")
            callback: Async callback(node_id, DataValue)
            sampling_interval: Per-node override (ms), or None for server default
        """
        self._callbacks[node_id] = callback

        if self._connected and self._client:
            await self._ensure_subscription()
            node = self._client.get_node(node_id)
            si = sampling_interval or self._config.sampling_interval
            handle = await self._subscription.subscribe_data_change(
                node, sampling_interval=float(si)
            )
            self._monitored_items[node_id] = handle

    async def unsubscribe(self, node_id: str) -> None:
        """Unsubscribe from a node.

        Args:
            node_id: OPC-UA NodeId string to unsubscribe from
        """
        handle = self._monitored_items.pop(node_id, None)
        self._callbacks.pop(node_id, None)

        if handle is not None and self._subscription:
            try:
                await self._subscription.unsubscribe(handle)
            except Exception as e:
                logger.warning(
                    "opcua_unsubscribe_error",
                    node_id=node_id,
                    error=str(e),
                )

    # --- Internal methods ---

    async def _try_connect_once(self) -> bool:
        """Attempt a single connection to the server.

        Creates a new asyncua Client, connects, and restores any
        previously tracked subscriptions. On failure, cleans up.

        Returns:
            True if connected successfully, False otherwise
        """
        try:
            client = Client(
                url=self._config.endpoint_url,
                timeout=self._config.connect_timeout,
                watchdog_intervall=self._config.watchdog_interval,
            )

            # Authentication
            if self._config.auth_mode == "username_password":
                client.set_user(self._config.username)
                client.set_password(self._config.password)

            await client.connect()
            self._client = client
            self._connected = True

            # Restore subscriptions
            if self._callbacks:
                await self._restore_subscriptions()

            return True

        except (ConnectionError, OSError, asyncio.TimeoutError) as e:
            self._connected = False
            logger.warning("opcua_connect_failed", error=str(e))
            if self._client:
                try:
                    await self._client.disconnect()
                except Exception:
                    pass
                self._client = None
            return False

        except Exception as e:
            self._connected = False
            logger.error("opcua_connect_unexpected", error=str(e))
            if self._client:
                try:
                    await self._client.disconnect()
                except Exception:
                    pass
                self._client = None
            return False

    async def _background_connect_loop(self) -> None:
        """Retry connection with exponential backoff.

        Runs after a failed initial connection attempt. Keeps retrying
        until connected or shutdown is signaled.
        """
        delay = 1
        while not self._shutdown_event.is_set():
            await asyncio.sleep(delay)
            delay = min(delay * 2, self._config.max_reconnect_delay)
            if self._shutdown_event.is_set():
                break
            if await self._try_connect_once():
                return

    async def _ensure_subscription(self) -> None:
        """Create subscription if not exists."""
        if self._subscription is None and self._client:
            handler = _DataChangeHandler(self._callbacks)
            self._subscription = await self._client.create_subscription(
                period=float(self._config.publishing_interval),
                handler=handler,
            )

    async def _restore_subscriptions(self) -> None:
        """Re-subscribe all tracked nodes after reconnect."""
        await self._ensure_subscription()
        for node_id in self._callbacks:
            try:
                node = self._client.get_node(node_id)
                handle = await self._subscription.subscribe_data_change(
                    node,
                    sampling_interval=float(self._config.sampling_interval),
                )
                self._monitored_items[node_id] = handle
            except Exception as e:
                logger.error(
                    "opcua_restore_sub_failed",
                    node_id=node_id,
                    error=str(e),
                )


class _DataChangeHandler:
    """asyncua SubscriptionHandler that routes to per-node callbacks.

    Each data change notification is dispatched to the callback registered
    for that specific node_id.
    """

    def __init__(self, callbacks: dict[str, DataChangeCallback]):
        self._callbacks = callbacks

    async def datachange_notification(self, node, val, data) -> None:
        """Handle data change notifications from asyncua subscription."""
        node_id = node.nodeid.to_string()
        callback = self._callbacks.get(node_id)
        if callback:
            try:
                await callback(node_id, data.monitored_item.Value)
            except Exception as e:
                logger.error(
                    "opcua_callback_error",
                    node_id=node_id,
                    error=str(e),
                )

    def status_change_notification(self, status) -> None:
        """Handle subscription status change notifications."""
        logger.warning("opcua_status_change", status=str(status))
