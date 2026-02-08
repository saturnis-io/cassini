"""WebSocket infrastructure for real-time SPC updates.

This module provides WebSocket endpoints and connection management for real-time
communication between the server and clients. Clients can subscribe to specific
characteristics and receive updates about new samples, violations, and acknowledgments.
"""

import asyncio
import logging
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@dataclass
class WSConnection:
    """Represents a WebSocket connection.

    Attributes:
        websocket: The FastAPI WebSocket instance
        connected_at: Timestamp when the connection was established
        subscribed_characteristics: Set of characteristic IDs this connection subscribes to
        last_heartbeat: Timestamp of the last received heartbeat/ping
    """

    websocket: WebSocket
    connected_at: datetime
    subscribed_characteristics: set[int] = field(default_factory=set)
    last_heartbeat: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class ConnectionManager:
    """Manages WebSocket connections and subscriptions.

    This manager handles all WebSocket lifecycle operations including connection
    establishment, subscription management, message broadcasting, and cleanup
    of stale connections.

    Attributes:
        _connections: Mapping of connection IDs to WSConnection instances
        _char_subscribers: Mapping of characteristic IDs to sets of connection IDs
        _heartbeat_interval: Seconds between cleanup checks
        _heartbeat_timeout: Seconds before a connection is considered stale
        _cleanup_task: Background task for connection cleanup
    """

    def __init__(
        self,
        heartbeat_interval: int = 30,
        heartbeat_timeout: int = 90,
    ):
        """Initialize the connection manager.

        Args:
            heartbeat_interval: Seconds between cleanup checks (default: 30)
            heartbeat_timeout: Seconds before considering a connection stale (default: 90)
        """
        self._connections: dict[str, WSConnection] = {}
        self._char_subscribers: dict[int, set[str]] = {}
        self._heartbeat_interval = heartbeat_interval
        self._heartbeat_timeout = heartbeat_timeout
        self._cleanup_task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start background tasks.

        Launches the cleanup loop that periodically removes stale connections.
        Should be called during application startup.
        """
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def stop(self) -> None:
        """Stop background tasks.

        Cancels the cleanup task and performs any necessary cleanup.
        Should be called during application shutdown.
        """
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

    async def connect(self, websocket: WebSocket, connection_id: str) -> None:
        """Accept and register a new WebSocket connection.

        Args:
            websocket: The WebSocket instance to accept
            connection_id: Unique identifier for this connection
        """
        await websocket.accept()
        self._connections[connection_id] = WSConnection(
            websocket=websocket,
            connected_at=datetime.now(timezone.utc),
        )

    async def disconnect(self, connection_id: str) -> None:
        """Remove a connection and clean up all subscriptions.

        This method removes the connection from all characteristic subscriptions
        and deletes the connection record.

        Args:
            connection_id: ID of the connection to remove
        """
        if connection_id in self._connections:
            conn = self._connections[connection_id]
            # Remove from all characteristic subscriptions
            for char_id in conn.subscribed_characteristics:
                if char_id in self._char_subscribers:
                    self._char_subscribers[char_id].discard(connection_id)
                    # Clean up empty subscriber sets
                    if not self._char_subscribers[char_id]:
                        del self._char_subscribers[char_id]
            del self._connections[connection_id]

    async def subscribe(self, connection_id: str, characteristic_ids: list[int]) -> None:
        """Subscribe a connection to updates for specific characteristics.

        After subscribing, the connection will receive all messages broadcast
        to any of the subscribed characteristics.

        Args:
            connection_id: ID of the connection to subscribe
            characteristic_ids: List of characteristic IDs to subscribe to
        """
        if connection_id not in self._connections:
            return

        conn = self._connections[connection_id]
        for char_id in characteristic_ids:
            conn.subscribed_characteristics.add(char_id)
            if char_id not in self._char_subscribers:
                self._char_subscribers[char_id] = set()
            self._char_subscribers[char_id].add(connection_id)

    async def unsubscribe(self, connection_id: str, characteristic_ids: list[int]) -> None:
        """Unsubscribe a connection from specific characteristics.

        The connection will no longer receive messages broadcast to these
        characteristics.

        Args:
            connection_id: ID of the connection to unsubscribe
            characteristic_ids: List of characteristic IDs to unsubscribe from
        """
        if connection_id not in self._connections:
            return

        conn = self._connections[connection_id]
        for char_id in characteristic_ids:
            conn.subscribed_characteristics.discard(char_id)
            if char_id in self._char_subscribers:
                self._char_subscribers[char_id].discard(connection_id)
                # Clean up empty subscriber sets
                if not self._char_subscribers[char_id]:
                    del self._char_subscribers[char_id]

    async def broadcast_to_characteristic(self, char_id: int, message: dict[str, Any]) -> None:
        """Send a message to all subscribers of a specific characteristic.

        Dead connections (those that raise exceptions during send) are automatically
        disconnected and cleaned up.

        Args:
            char_id: ID of the characteristic to broadcast to
            message: Message dictionary to send as JSON
        """
        if char_id not in self._char_subscribers:
            return

        dead_connections = []
        for conn_id in self._char_subscribers[char_id]:
            if conn_id in self._connections:
                try:
                    await self._connections[conn_id].websocket.send_json(message)
                except Exception:
                    dead_connections.append(conn_id)

        # Clean up dead connections
        for conn_id in dead_connections:
            await self.disconnect(conn_id)

    async def broadcast_to_all(self, message: dict[str, Any]) -> None:
        """Send a message to all connected clients.

        Dead connections are automatically disconnected and cleaned up.

        Args:
            message: Message dictionary to send as JSON
        """
        dead_connections = []
        for conn_id, conn in self._connections.items():
            try:
                await conn.websocket.send_json(message)
            except Exception:
                dead_connections.append(conn_id)

        for conn_id in dead_connections:
            await self.disconnect(conn_id)

    def update_heartbeat(self, connection_id: str) -> None:
        """Update the last heartbeat timestamp for a connection.

        This should be called when a ping message is received to prevent
        the connection from being considered stale.

        Args:
            connection_id: ID of the connection to update
        """
        if connection_id in self._connections:
            self._connections[connection_id].last_heartbeat = datetime.now(timezone.utc)

    async def _cleanup_loop(self) -> None:
        """Background task that periodically removes stale connections.

        This task runs indefinitely, checking connections at regular intervals
        and disconnecting those that have not sent a heartbeat within the timeout
        period.
        """
        while True:
            try:
                await asyncio.sleep(self._heartbeat_interval)
                now = datetime.now(timezone.utc)
                stale = []

                for conn_id, conn in self._connections.items():
                    time_since_heartbeat = (now - conn.last_heartbeat).total_seconds()
                    if time_since_heartbeat > self._heartbeat_timeout:
                        stale.append(conn_id)

                for conn_id in stale:
                    await self.disconnect(conn_id)

            except asyncio.CancelledError:
                # Task was cancelled, exit cleanly
                break
            except Exception:
                logger.debug("WebSocket cleanup error", exc_info=True)

    def get_connection_count(self) -> int:
        """Get the total number of active connections.

        Returns:
            Number of currently connected clients
        """
        return len(self._connections)

    def get_subscription_count(self, char_id: int) -> int:
        """Get the number of subscribers for a specific characteristic.

        Args:
            char_id: ID of the characteristic

        Returns:
            Number of connections subscribed to this characteristic
        """
        return len(self._char_subscribers.get(char_id, set()))

    def get_subscribed_characteristics(self, connection_id: str) -> set[int]:
        """Get the set of characteristics a connection is subscribed to.

        Args:
            connection_id: ID of the connection

        Returns:
            Set of characteristic IDs, or empty set if connection not found
        """
        if connection_id in self._connections:
            return self._connections[connection_id].subscribed_characteristics.copy()
        return set()


# Global connection manager instance
# In production, you might want to use FastAPI's dependency injection
# or store this in app.state
manager = ConnectionManager()


@router.websocket("/ws/samples")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str | None = Query(None),
):
    """WebSocket endpoint for real-time updates.

    Requires JWT authentication via the ``token`` query parameter.
    If the token is missing or invalid the connection is closed with code 4001.

    Message Protocol:
        Client -> Server:
            - {"type": "subscribe", "characteristic_ids": [1, 2, 3]}
            - {"type": "unsubscribe", "characteristic_ids": [1]}
            - {"type": "ping"}

        Server -> Client:
            - {"type": "sample", "characteristic_id": ..., "sample": {...}, "violations": [...]}
            - {"type": "violation", "violation": {...}}
            - {"type": "ack_update", "violation_id": ..., ...}
            - {"type": "limits_update", "characteristic_id": ..., ...}
            - {"type": "pong"}
            - {"type": "error", "message": "..."}

    Args:
        websocket: The WebSocket connection instance
        token: JWT access token as query parameter
    """
    # --- authenticate ---
    from openspc.core.auth.jwt import verify_access_token

    if not token or verify_access_token(token) is None:
        # Accept first so the close frame goes through the proxy cleanly
        # (closing before accept sends HTTP 403 which breaks WS proxies)
        await websocket.accept()
        await websocket.send_json({
            "type": "error",
            "message": "Authentication required" if not token else "Invalid or expired token",
        })
        await websocket.close(code=4001, reason="Authentication failed")
        return

    connection_id = str(uuid.uuid4())
    await manager.connect(websocket, connection_id)

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()

            # Accept both "type" and "action" as the message type field
            message_type = data.get("type") or data.get("action")
            if not message_type:
                await websocket.send_json({
                    "type": "error",
                    "message": "Message must contain 'type' or 'action' field"
                })
                continue

            # Handle subscribe message
            if message_type == "subscribe":
                # Accept both "characteristic_ids" (array) and "characteristic_id" (single)
                char_ids = data.get("characteristic_ids")
                if char_ids is None and "characteristic_id" in data:
                    char_ids = [data["characteristic_id"]]

                if char_ids is None:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Subscribe message must contain 'characteristic_ids' or 'characteristic_id' field"
                    })
                    continue

                if not isinstance(char_ids, list):
                    char_ids = [char_ids]

                await manager.subscribe(connection_id, char_ids)
                await websocket.send_json({
                    "type": "subscribed",
                    "characteristic_ids": char_ids
                })

            # Handle unsubscribe message
            elif message_type == "unsubscribe":
                # Accept both "characteristic_ids" (array) and "characteristic_id" (single)
                char_ids = data.get("characteristic_ids")
                if char_ids is None and "characteristic_id" in data:
                    char_ids = [data["characteristic_id"]]

                if char_ids is None:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Unsubscribe message must contain 'characteristic_ids' or 'characteristic_id' field"
                    })
                    continue

                if not isinstance(char_ids, list):
                    char_ids = [char_ids]

                await manager.unsubscribe(connection_id, char_ids)
                await websocket.send_json({
                    "type": "unsubscribed",
                    "characteristic_ids": char_ids
                })

            # Handle ping message
            elif message_type == "ping":
                manager.update_heartbeat(connection_id)
                await websocket.send_json({"type": "pong"})

            # Handle unknown message types
            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                })

    except WebSocketDisconnect:
        # Client disconnected normally
        await manager.disconnect(connection_id)
    except Exception:
        # Unexpected error, clean up connection
        logger.exception("Unexpected error in WebSocket connection %s", connection_id)
        await manager.disconnect(connection_id)


async def notify_sample(
    char_id: int,
    sample_id: int,
    timestamp: datetime,
    value: float,
    zone: str,
    in_control: bool,
    violations: list[dict[str, Any]] | None = None,
) -> None:
    """Notify clients about a new sample.

    This is a convenience function for broadcasting sample updates to all
    subscribers of a characteristic.

    Args:
        char_id: ID of the characteristic
        sample_id: ID of the created sample
        timestamp: When the sample was taken
        value: Sample mean value
        zone: Zone classification (e.g., "zone_c_upper")
        in_control: Whether the sample is in control
        violations: List of violation dicts to include in the message
    """
    message = {
        "type": "sample",
        "characteristic_id": char_id,
        "sample": {
            "id": sample_id,
            "characteristic_id": char_id,
            "timestamp": timestamp.isoformat(),
            "mean": value,
            "zone": zone,
            "in_control": in_control,
        },
        "violations": violations or [],
    }
    await manager.broadcast_to_characteristic(char_id, message)


async def notify_violation(
    char_id: int,
    violation_id: int,
    sample_id: int,
    rule_id: int,
    rule_name: str,
    severity: str,
) -> None:
    """Notify clients about a new violation.

    This is a convenience function for broadcasting violation updates to all
    subscribers of a characteristic.

    Args:
        char_id: ID of the characteristic
        violation_id: ID of the created violation
        sample_id: ID of the sample that triggered the violation
        rule_id: Nelson Rule ID (1-8)
        rule_name: Human-readable rule name
        severity: Violation severity (WARNING or CRITICAL)
    """
    message = {
        "type": "violation",
        "violation": {
            "id": violation_id,
            "characteristic_id": char_id,
            "sample_id": sample_id,
            "rule_id": rule_id,
            "rule_name": rule_name,
            "severity": severity,
        },
    }
    await manager.broadcast_to_characteristic(char_id, message)


async def notify_acknowledgment(
    char_id: int,
    violation_id: int,
    acknowledged: bool,
    ack_user: str | None = None,
    ack_reason: str | None = None,
) -> None:
    """Notify clients about a violation acknowledgment update.

    This is a convenience function for broadcasting acknowledgment updates
    to all subscribers of a characteristic.

    Args:
        char_id: ID of the characteristic
        violation_id: ID of the violation
        acknowledged: New acknowledgment status
        ack_user: User who acknowledged (if acknowledged is True)
        ack_reason: Reason for acknowledgment (if provided)
    """
    message = {
        "type": "ack_update",
        "characteristic_id": char_id,
        "violation_id": violation_id,
        "acknowledged": acknowledged,
        "ack_user": ack_user,
        "ack_reason": ack_reason,
    }
    await manager.broadcast_to_characteristic(char_id, message)


# Expose the manager for testing and integration
__all__ = [
    "router",
    "ConnectionManager",
    "WSConnection",
    "manager",
    "notify_sample",
    "notify_violation",
    "notify_acknowledgment",
]
