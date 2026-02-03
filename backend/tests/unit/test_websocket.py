"""Unit tests for WebSocket infrastructure.

Tests for the ConnectionManager, WebSocket endpoint, and notification helpers.
"""

import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import WebSocket

from openspc.api.v1.websocket import (
    ConnectionManager,
    WSConnection,
    notify_acknowledgment,
    notify_sample,
    notify_violation,
)


class TestWSConnection:
    """Tests for WSConnection dataclass."""

    def test_ws_connection_creation(self):
        """Test creating a WSConnection instance."""
        mock_ws = MagicMock(spec=WebSocket)
        now = datetime.utcnow()

        conn = WSConnection(
            websocket=mock_ws,
            connected_at=now,
        )

        assert conn.websocket == mock_ws
        assert conn.connected_at == now
        assert conn.subscribed_characteristics == set()
        assert isinstance(conn.last_heartbeat, datetime)

    def test_ws_connection_with_subscriptions(self):
        """Test WSConnection with initial subscriptions."""
        mock_ws = MagicMock(spec=WebSocket)
        now = datetime.utcnow()
        char_ids = {1, 2, 3}

        conn = WSConnection(
            websocket=mock_ws,
            connected_at=now,
            subscribed_characteristics=char_ids,
        )

        assert conn.subscribed_characteristics == char_ids


class TestConnectionManager:
    """Tests for ConnectionManager class."""

    @pytest.fixture
    def manager(self):
        """Create a ConnectionManager instance for testing."""
        return ConnectionManager(heartbeat_interval=1, heartbeat_timeout=2)

    @pytest.fixture
    def mock_websocket(self):
        """Create a mock WebSocket."""
        ws = AsyncMock(spec=WebSocket)
        ws.accept = AsyncMock()
        ws.send_json = AsyncMock()
        return ws

    @pytest.mark.asyncio
    async def test_manager_initialization(self, manager):
        """Test ConnectionManager initialization."""
        assert manager._heartbeat_interval == 1
        assert manager._heartbeat_timeout == 2
        assert manager._connections == {}
        assert manager._char_subscribers == {}
        assert manager._cleanup_task is None

    @pytest.mark.asyncio
    async def test_connect(self, manager, mock_websocket):
        """Test connecting a new WebSocket."""
        conn_id = "test-conn-1"

        await manager.connect(mock_websocket, conn_id)

        assert conn_id in manager._connections
        assert manager._connections[conn_id].websocket == mock_websocket
        mock_websocket.accept.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect(self, manager, mock_websocket):
        """Test disconnecting a WebSocket."""
        conn_id = "test-conn-1"

        await manager.connect(mock_websocket, conn_id)
        await manager.subscribe(conn_id, [1, 2, 3])

        await manager.disconnect(conn_id)

        assert conn_id not in manager._connections
        assert 1 not in manager._char_subscribers
        assert 2 not in manager._char_subscribers
        assert 3 not in manager._char_subscribers

    @pytest.mark.asyncio
    async def test_disconnect_nonexistent(self, manager):
        """Test disconnecting a nonexistent connection."""
        # Should not raise an error
        await manager.disconnect("nonexistent-id")

    @pytest.mark.asyncio
    async def test_subscribe(self, manager, mock_websocket):
        """Test subscribing to characteristics."""
        conn_id = "test-conn-1"
        char_ids = [1, 2, 3]

        await manager.connect(mock_websocket, conn_id)
        await manager.subscribe(conn_id, char_ids)

        conn = manager._connections[conn_id]
        assert conn.subscribed_characteristics == {1, 2, 3}
        assert manager._char_subscribers[1] == {conn_id}
        assert manager._char_subscribers[2] == {conn_id}
        assert manager._char_subscribers[3] == {conn_id}

    @pytest.mark.asyncio
    async def test_subscribe_multiple_connections(self, manager):
        """Test multiple connections subscribing to the same characteristic."""
        ws1 = AsyncMock(spec=WebSocket)
        ws2 = AsyncMock(spec=WebSocket)
        conn_id1 = "conn-1"
        conn_id2 = "conn-2"

        await manager.connect(ws1, conn_id1)
        await manager.connect(ws2, conn_id2)
        await manager.subscribe(conn_id1, [1])
        await manager.subscribe(conn_id2, [1])

        assert manager._char_subscribers[1] == {conn_id1, conn_id2}

    @pytest.mark.asyncio
    async def test_subscribe_nonexistent_connection(self, manager):
        """Test subscribing with nonexistent connection."""
        # Should not raise an error
        await manager.subscribe("nonexistent-id", [1, 2])

    @pytest.mark.asyncio
    async def test_unsubscribe(self, manager, mock_websocket):
        """Test unsubscribing from characteristics."""
        conn_id = "test-conn-1"
        char_ids = [1, 2, 3]

        await manager.connect(mock_websocket, conn_id)
        await manager.subscribe(conn_id, char_ids)
        await manager.unsubscribe(conn_id, [1, 3])

        conn = manager._connections[conn_id]
        assert conn.subscribed_characteristics == {2}
        assert 1 not in manager._char_subscribers
        assert manager._char_subscribers[2] == {conn_id}
        assert 3 not in manager._char_subscribers

    @pytest.mark.asyncio
    async def test_unsubscribe_cleans_empty_sets(self, manager, mock_websocket):
        """Test that unsubscribe removes empty subscriber sets."""
        conn_id = "test-conn-1"

        await manager.connect(mock_websocket, conn_id)
        await manager.subscribe(conn_id, [1])
        await manager.unsubscribe(conn_id, [1])

        # Subscriber set should be completely removed
        assert 1 not in manager._char_subscribers

    @pytest.mark.asyncio
    async def test_broadcast_to_characteristic(self, manager):
        """Test broadcasting to characteristic subscribers."""
        ws1 = AsyncMock(spec=WebSocket)
        ws2 = AsyncMock(spec=WebSocket)
        ws3 = AsyncMock(spec=WebSocket)
        conn_id1 = "conn-1"
        conn_id2 = "conn-2"
        conn_id3 = "conn-3"

        await manager.connect(ws1, conn_id1)
        await manager.connect(ws2, conn_id2)
        await manager.connect(ws3, conn_id3)
        await manager.subscribe(conn_id1, [1])
        await manager.subscribe(conn_id2, [1])
        await manager.subscribe(conn_id3, [2])  # Different characteristic

        message = {"type": "test", "data": "hello"}
        await manager.broadcast_to_characteristic(1, message)

        # Only conn1 and conn2 should receive the message
        ws1.send_json.assert_called_once_with(message)
        ws2.send_json.assert_called_once_with(message)
        ws3.send_json.assert_not_called()

    @pytest.mark.asyncio
    async def test_broadcast_to_nonexistent_characteristic(self, manager):
        """Test broadcasting to a characteristic with no subscribers."""
        message = {"type": "test", "data": "hello"}
        # Should not raise an error
        await manager.broadcast_to_characteristic(999, message)

    @pytest.mark.asyncio
    async def test_broadcast_handles_dead_connections(self, manager):
        """Test that dead connections are cleaned up during broadcast."""
        ws1 = AsyncMock(spec=WebSocket)
        ws2 = AsyncMock(spec=WebSocket)
        ws2.send_json.side_effect = Exception("Connection dead")
        conn_id1 = "conn-1"
        conn_id2 = "conn-2"

        await manager.connect(ws1, conn_id1)
        await manager.connect(ws2, conn_id2)
        await manager.subscribe(conn_id1, [1])
        await manager.subscribe(conn_id2, [1])

        message = {"type": "test", "data": "hello"}
        await manager.broadcast_to_characteristic(1, message)

        # conn2 should be disconnected
        assert conn_id1 in manager._connections
        assert conn_id2 not in manager._connections
        assert manager._char_subscribers[1] == {conn_id1}

    @pytest.mark.asyncio
    async def test_broadcast_to_all(self, manager):
        """Test broadcasting to all connections."""
        ws1 = AsyncMock(spec=WebSocket)
        ws2 = AsyncMock(spec=WebSocket)
        ws3 = AsyncMock(spec=WebSocket)
        conn_id1 = "conn-1"
        conn_id2 = "conn-2"
        conn_id3 = "conn-3"

        await manager.connect(ws1, conn_id1)
        await manager.connect(ws2, conn_id2)
        await manager.connect(ws3, conn_id3)

        message = {"type": "test", "data": "broadcast"}
        await manager.broadcast_to_all(message)

        ws1.send_json.assert_called_once_with(message)
        ws2.send_json.assert_called_once_with(message)
        ws3.send_json.assert_called_once_with(message)

    @pytest.mark.asyncio
    async def test_update_heartbeat(self, manager, mock_websocket):
        """Test updating heartbeat timestamp."""
        conn_id = "test-conn-1"

        await manager.connect(mock_websocket, conn_id)
        old_heartbeat = manager._connections[conn_id].last_heartbeat

        # Wait a bit to ensure timestamp difference
        await asyncio.sleep(0.01)

        manager.update_heartbeat(conn_id)
        new_heartbeat = manager._connections[conn_id].last_heartbeat

        assert new_heartbeat > old_heartbeat

    @pytest.mark.asyncio
    async def test_update_heartbeat_nonexistent(self, manager):
        """Test updating heartbeat for nonexistent connection."""
        # Should not raise an error
        manager.update_heartbeat("nonexistent-id")

    @pytest.mark.asyncio
    async def test_cleanup_loop_removes_stale_connections(self, manager):
        """Test that cleanup loop removes stale connections."""
        ws = AsyncMock(spec=WebSocket)
        conn_id = "test-conn-1"

        await manager.connect(ws, conn_id)
        await manager.subscribe(conn_id, [1])

        # Manually set old heartbeat
        manager._connections[conn_id].last_heartbeat = datetime.utcnow() - timedelta(seconds=5)

        # Start cleanup task
        await manager.start()

        # Wait for cleanup to run
        await asyncio.sleep(1.5)

        # Connection should be removed
        assert conn_id not in manager._connections
        assert 1 not in manager._char_subscribers

        # Stop cleanup task
        await manager.stop()

    @pytest.mark.asyncio
    async def test_cleanup_loop_keeps_active_connections(self, manager):
        """Test that cleanup loop keeps connections with recent heartbeats."""
        ws = AsyncMock(spec=WebSocket)
        conn_id = "test-conn-1"

        await manager.connect(ws, conn_id)

        # Update heartbeat to current time
        manager.update_heartbeat(conn_id)

        # Start cleanup task
        await manager.start()

        # Wait for cleanup to run
        await asyncio.sleep(1.5)

        # Connection should still exist
        assert conn_id in manager._connections

        # Stop cleanup task
        await manager.stop()

    @pytest.mark.asyncio
    async def test_start_and_stop(self, manager):
        """Test starting and stopping the manager."""
        await manager.start()
        assert manager._cleanup_task is not None
        assert not manager._cleanup_task.done()

        await manager.stop()
        await asyncio.sleep(0.1)  # Give task time to finish
        assert manager._cleanup_task.cancelled() or manager._cleanup_task.done()

    @pytest.mark.asyncio
    async def test_get_connection_count(self, manager):
        """Test getting connection count."""
        assert manager.get_connection_count() == 0

        ws1 = AsyncMock(spec=WebSocket)
        ws2 = AsyncMock(spec=WebSocket)
        await manager.connect(ws1, "conn-1")
        await manager.connect(ws2, "conn-2")

        assert manager.get_connection_count() == 2

    @pytest.mark.asyncio
    async def test_get_subscription_count(self, manager):
        """Test getting subscription count for a characteristic."""
        assert manager.get_subscription_count(1) == 0

        ws1 = AsyncMock(spec=WebSocket)
        ws2 = AsyncMock(spec=WebSocket)
        await manager.connect(ws1, "conn-1")
        await manager.connect(ws2, "conn-2")
        await manager.subscribe("conn-1", [1])
        await manager.subscribe("conn-2", [1])

        assert manager.get_subscription_count(1) == 2

    @pytest.mark.asyncio
    async def test_get_subscribed_characteristics(self, manager, mock_websocket):
        """Test getting subscribed characteristics for a connection."""
        conn_id = "test-conn-1"

        await manager.connect(mock_websocket, conn_id)
        await manager.subscribe(conn_id, [1, 2, 3])

        subscriptions = manager.get_subscribed_characteristics(conn_id)
        assert subscriptions == {1, 2, 3}

    @pytest.mark.asyncio
    async def test_get_subscribed_characteristics_nonexistent(self, manager):
        """Test getting subscriptions for nonexistent connection."""
        subscriptions = manager.get_subscribed_characteristics("nonexistent-id")
        assert subscriptions == set()


class TestNotificationHelpers:
    """Tests for notification helper functions."""

    @pytest.mark.asyncio
    async def test_notify_sample(self):
        """Test notify_sample helper."""
        mock_manager = AsyncMock()

        with patch("openspc.api.v1.websocket.manager", mock_manager):
            timestamp = datetime.utcnow()
            await notify_sample(
                char_id=1,
                sample_id=100,
                timestamp=timestamp,
                value=10.5,
                zone="zone_c_upper",
                in_control=True,
            )

            mock_manager.broadcast_to_characteristic.assert_called_once()
            call_args = mock_manager.broadcast_to_characteristic.call_args
            assert call_args[0][0] == 1  # char_id
            message = call_args[0][1]
            assert message["type"] == "sample"
            assert message["payload"]["sample_id"] == 100
            assert message["payload"]["characteristic_id"] == 1
            assert message["payload"]["value"] == 10.5
            assert message["payload"]["zone"] == "zone_c_upper"
            assert message["payload"]["in_control"] is True

    @pytest.mark.asyncio
    async def test_notify_violation(self):
        """Test notify_violation helper."""
        mock_manager = AsyncMock()

        with patch("openspc.api.v1.websocket.manager", mock_manager):
            await notify_violation(
                char_id=1,
                violation_id=200,
                sample_id=100,
                rule_id=1,
                rule_name="One point beyond 3 sigma",
                severity="CRITICAL",
            )

            mock_manager.broadcast_to_characteristic.assert_called_once()
            call_args = mock_manager.broadcast_to_characteristic.call_args
            assert call_args[0][0] == 1  # char_id
            message = call_args[0][1]
            assert message["type"] == "violation"
            assert message["payload"]["violation_id"] == 200
            assert message["payload"]["characteristic_id"] == 1
            assert message["payload"]["sample_id"] == 100
            assert message["payload"]["rule_id"] == 1
            assert message["payload"]["rule_name"] == "One point beyond 3 sigma"
            assert message["payload"]["severity"] == "CRITICAL"

    @pytest.mark.asyncio
    async def test_notify_acknowledgment(self):
        """Test notify_acknowledgment helper."""
        mock_manager = AsyncMock()

        with patch("openspc.api.v1.websocket.manager", mock_manager):
            await notify_acknowledgment(
                char_id=1,
                violation_id=200,
                acknowledged=True,
                ack_user="operator1",
                ack_reason="Adjusted process",
            )

            mock_manager.broadcast_to_characteristic.assert_called_once()
            call_args = mock_manager.broadcast_to_characteristic.call_args
            assert call_args[0][0] == 1  # char_id
            message = call_args[0][1]
            assert message["type"] == "ack_update"
            assert message["payload"]["violation_id"] == 200
            assert message["payload"]["characteristic_id"] == 1
            assert message["payload"]["acknowledged"] is True
            assert message["payload"]["ack_user"] == "operator1"
            assert message["payload"]["ack_reason"] == "Adjusted process"

    @pytest.mark.asyncio
    async def test_notify_acknowledgment_unack(self):
        """Test notify_acknowledgment for un-acknowledging."""
        mock_manager = AsyncMock()

        with patch("openspc.api.v1.websocket.manager", mock_manager):
            await notify_acknowledgment(
                char_id=1,
                violation_id=200,
                acknowledged=False,
            )

            mock_manager.broadcast_to_characteristic.assert_called_once()
            call_args = mock_manager.broadcast_to_characteristic.call_args
            message = call_args[0][1]
            assert message["payload"]["acknowledged"] is False
            assert message["payload"]["ack_user"] is None
            assert message["payload"]["ack_reason"] is None
