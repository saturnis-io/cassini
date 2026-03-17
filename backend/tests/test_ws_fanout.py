"""Test WebSocket cross-node fan-out via BroadcastChannel."""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from cassini.core.broker.local import LocalBroadcast, LocalEventBus
from cassini.core.broker.event_adapter import TypedEventBusAdapter
from cassini.core.broadcast import WebSocketBroadcaster


@pytest.fixture
def mock_ws_manager():
    """Mock WebSocket connection manager."""
    mgr = AsyncMock()
    mgr.broadcast_to_characteristic = AsyncMock()
    mgr.broadcast_to_all = AsyncMock()
    return mgr


@pytest.fixture
def local_event_bus():
    return LocalEventBus()


@pytest.fixture
def typed_event_bus(local_event_bus):
    from cassini.core.events.events import (
        SampleProcessedEvent,
        ControlLimitsUpdatedEvent,
        AnomalyDetectedEvent,
        CharacteristicUpdatedEvent,
    )

    adapter = TypedEventBusAdapter(local_event_bus)
    adapter.register_event_type(SampleProcessedEvent, "sample.processed")
    adapter.register_event_type(ControlLimitsUpdatedEvent, "control_limits.updated")
    adapter.register_event_type(AnomalyDetectedEvent, "anomaly.detected")
    adapter.register_event_type(CharacteristicUpdatedEvent, "characteristic.updated")
    return adapter


class TestWebSocketFanoutWithoutChannel:
    """Without a BroadcastChannel, behavior is unchanged."""

    def test_init_without_channel(self, mock_ws_manager, typed_event_bus):
        broadcaster = WebSocketBroadcaster(mock_ws_manager, typed_event_bus)
        assert broadcaster._broadcast_channel is None

    @pytest.mark.asyncio
    async def test_publish_to_broadcast_noop_without_channel(self, mock_ws_manager, typed_event_bus):
        broadcaster = WebSocketBroadcaster(mock_ws_manager, typed_event_bus)
        # Should not raise
        await broadcaster._publish_to_broadcast({"type": "test"})


class TestWebSocketFanoutWithChannel:
    """With a BroadcastChannel, messages are forwarded cross-node."""

    @pytest.mark.asyncio
    async def test_init_with_channel_subscribes(self, mock_ws_manager, typed_event_bus):
        bc = LocalBroadcast()
        broadcaster = WebSocketBroadcaster(
            mock_ws_manager, typed_event_bus, broadcast_channel=bc
        )
        assert broadcaster._broadcast_channel is bc
        # Allow scheduled subscribe task to run
        await asyncio.sleep(0.05)
        # Channel should have a subscriber for the fanout channel
        assert "cassini:ws:fanout" in bc._handlers

    @pytest.mark.asyncio
    async def test_local_event_publishes_to_broadcast(self, mock_ws_manager, typed_event_bus):
        """When an event fires locally, it should also go to the BroadcastChannel."""
        bc = LocalBroadcast()
        broadcast_received = []

        async def capture(msg):
            broadcast_received.append(msg)

        await bc.subscribe("cassini:ws:fanout", capture)

        broadcaster = WebSocketBroadcaster(
            mock_ws_manager, typed_event_bus, broadcast_channel=bc
        )
        # Allow subscriptions to settle
        await asyncio.sleep(0.05)

        from cassini.core.events.events import SampleProcessedEvent

        event = SampleProcessedEvent(
            sample_id=1,
            characteristic_id=5,
            mean=10.0,
            range_value=None,
            zone="zone_c",
            in_control=True,
        )
        await typed_event_bus.publish(event)
        await asyncio.sleep(0.1)

        # Local WS manager should have been called
        assert mock_ws_manager.broadcast_to_characteristic.call_count >= 1

        # BroadcastChannel should also have received the message
        assert len(broadcast_received) >= 1
        assert broadcast_received[0]["type"] == "sample"
        assert broadcast_received[0]["characteristic_id"] == 5

    @pytest.mark.asyncio
    async def test_remote_message_rebroadcast_to_local(self, mock_ws_manager, typed_event_bus):
        """Messages from BroadcastChannel should be sent to local WS clients."""
        bc = LocalBroadcast()

        broadcaster = WebSocketBroadcaster(
            mock_ws_manager, typed_event_bus, broadcast_channel=bc
        )
        # Allow the broadcast listener to subscribe
        await asyncio.sleep(0.05)

        # Simulate a message arriving from another node via the BroadcastChannel
        remote_message = {
            "type": "limits_update",
            "characteristic_id": 42,
            "ucl": 103.0,
            "lcl": 97.0,
            "center_line": 100.0,
        }
        await bc.broadcast("cassini:ws:fanout", remote_message)
        await asyncio.sleep(0.05)

        mock_ws_manager.broadcast_to_characteristic.assert_called_with(
            42, remote_message
        )

    @pytest.mark.asyncio
    async def test_remote_ack_message_broadcasts_to_all(self, mock_ws_manager, typed_event_bus):
        """Remote ack_update messages should broadcast to all local clients."""
        bc = LocalBroadcast()

        broadcaster = WebSocketBroadcaster(
            mock_ws_manager, typed_event_bus, broadcast_channel=bc
        )
        await asyncio.sleep(0.05)

        ack_message = {
            "type": "ack_update",
            "violation_id": 99,
            "ack_user": "admin",
            "ack_reason": "test",
        }
        await bc.broadcast("cassini:ws:fanout", ack_message)
        await asyncio.sleep(0.05)

        mock_ws_manager.broadcast_to_all.assert_called_with(ack_message)
