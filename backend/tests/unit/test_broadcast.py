"""Unit tests for WebSocket broadcaster.

Tests the WebSocketBroadcaster class that bridges the Event Bus and WebSocket
infrastructure for real-time event broadcasting.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, call

import pytest

from openspc.core.alerts.manager import ViolationAcknowledged, ViolationCreated
from openspc.core.broadcast import WebSocketBroadcaster
from openspc.core.events import (
    ControlLimitsUpdatedEvent,
    EventBus,
    SampleProcessedEvent,
)


@pytest.fixture
def mock_connection_manager():
    """Create a mock WebSocket connection manager."""
    manager = MagicMock()
    manager.broadcast_to_characteristic = AsyncMock()
    manager.broadcast_to_all = AsyncMock()
    return manager


@pytest.fixture
def event_bus():
    """Create a fresh event bus for testing."""
    bus = EventBus()
    # Clear any existing handlers
    bus.clear_handlers()
    return bus


@pytest.fixture
def broadcaster(mock_connection_manager, event_bus):
    """Create a WebSocketBroadcaster instance for testing."""
    return WebSocketBroadcaster(mock_connection_manager, event_bus)


@pytest.mark.asyncio
class TestWebSocketBroadcaster:
    """Test suite for WebSocketBroadcaster."""

    async def test_initialization(self, broadcaster, event_bus):
        """Test that broadcaster initializes and subscribes to events."""
        # Verify subscriptions were set up
        assert event_bus.get_handler_count(SampleProcessedEvent) == 1
        assert event_bus.get_handler_count(ControlLimitsUpdatedEvent) == 1

    async def test_sample_processed_broadcast(
        self, broadcaster, mock_connection_manager, event_bus
    ):
        """Test broadcasting of SampleProcessedEvent."""
        # Create sample event
        event = SampleProcessedEvent(
            sample_id=42,
            characteristic_id=1,
            mean=10.5,
            range_value=0.5,
            zone="zone_c_upper",
            in_control=True,
            timestamp=datetime(2024, 1, 15, 10, 30, 0),
        )

        # Publish event
        await event_bus.publish(event)

        # Wait for async handlers to complete
        await event_bus.shutdown()

        # Verify broadcast was called with correct message
        mock_connection_manager.broadcast_to_characteristic.assert_called_once()

        call_args = mock_connection_manager.broadcast_to_characteristic.call_args
        char_id = call_args[0][0]
        message = call_args[0][1]

        assert char_id == 1
        assert message["type"] == "sample"
        assert message["characteristic_id"] == 1
        assert message["sample"]["id"] == 42
        assert message["sample"]["characteristic_id"] == 1
        assert message["sample"]["mean"] == 10.5
        assert message["sample"]["zone"] == "zone_c_upper"
        assert message["sample"]["in_control"] is True
        assert message["sample"]["timestamp"] == "2024-01-15T10:30:00"
        assert message["violations"] == []

    async def test_sample_processed_broadcast_out_of_control(
        self, broadcaster, mock_connection_manager, event_bus
    ):
        """Test broadcasting of out-of-control sample."""
        # Create out-of-control sample event
        event = SampleProcessedEvent(
            sample_id=43,
            characteristic_id=2,
            mean=15.8,
            range_value=None,
            zone="zone_a_upper",
            in_control=False,
            timestamp=datetime(2024, 1, 15, 10, 35, 0),
        )

        # Publish event
        await event_bus.publish(event)
        await event_bus.shutdown()

        # Verify broadcast
        mock_connection_manager.broadcast_to_characteristic.assert_called_once()
        call_args = mock_connection_manager.broadcast_to_characteristic.call_args
        message = call_args[0][1]

        assert message["sample"]["in_control"] is False
        assert message["sample"]["zone"] == "zone_a_upper"

    async def test_control_limits_updated_broadcast(
        self, broadcaster, mock_connection_manager, event_bus
    ):
        """Test broadcasting of ControlLimitsUpdatedEvent."""
        # Create control limits event
        event = ControlLimitsUpdatedEvent(
            characteristic_id=1,
            center_line=100.0,
            ucl=103.0,
            lcl=97.0,
            method="moving_range",
            sample_count=50,
            timestamp=datetime(2024, 1, 15, 10, 30, 0),
        )

        # Publish event
        await event_bus.publish(event)
        await event_bus.shutdown()

        # Verify broadcast was called with correct message
        mock_connection_manager.broadcast_to_characteristic.assert_called_once()

        call_args = mock_connection_manager.broadcast_to_characteristic.call_args
        char_id = call_args[0][0]
        message = call_args[0][1]

        assert char_id == 1
        assert message["type"] == "limits_update"
        assert message["characteristic_id"] == 1
        assert message["center_line"] == 100.0
        assert message["ucl"] == 103.0
        assert message["lcl"] == 97.0

    async def test_violation_created_broadcast(
        self, broadcaster, mock_connection_manager
    ):
        """Test broadcasting of ViolationCreated via AlertNotifier protocol."""
        # Create violation event
        event = ViolationCreated(
            violation_id=10,
            sample_id=42,
            characteristic_id=1,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            timestamp=datetime(2024, 1, 15, 10, 30, 0),
        )

        # Call notifier method directly (as AlertManager would)
        await broadcaster.notify_violation_created(event)

        # Verify broadcast was called with correct message
        mock_connection_manager.broadcast_to_characteristic.assert_called_once()

        call_args = mock_connection_manager.broadcast_to_characteristic.call_args
        char_id = call_args[0][0]
        message = call_args[0][1]

        assert char_id == 1
        assert message["type"] == "violation"
        assert message["violation"]["id"] == 10
        assert message["violation"]["sample_id"] == 42
        assert message["violation"]["characteristic_id"] == 1
        assert message["violation"]["rule_id"] == 1
        assert message["violation"]["rule_name"] == "Outlier"
        assert message["violation"]["severity"] == "CRITICAL"
        assert message["violation"]["timestamp"] == "2024-01-15T10:30:00"

    async def test_violation_acknowledged_broadcast(
        self, broadcaster, mock_connection_manager
    ):
        """Test broadcasting of ViolationAcknowledged via AlertNotifier protocol."""
        # Create acknowledgment event
        event = ViolationAcknowledged(
            violation_id=10,
            user="john.doe",
            reason="Tool Change",
            timestamp=datetime(2024, 1, 15, 11, 0, 0),
        )

        # Call notifier method directly (as AlertManager would)
        await broadcaster.notify_violation_acknowledged(event)

        # Verify broadcast was called with correct message
        # Note: Acknowledgments are broadcast to ALL clients
        mock_connection_manager.broadcast_to_all.assert_called_once()

        call_args = mock_connection_manager.broadcast_to_all.call_args
        message = call_args[0][0]

        assert message["type"] == "ack_update"
        assert message["violation_id"] == 10
        assert message["ack_user"] == "john.doe"
        assert message["ack_reason"] == "Tool Change"

    async def test_multiple_events_broadcast(
        self, broadcaster, mock_connection_manager, event_bus
    ):
        """Test broadcasting multiple events in sequence."""
        # Create multiple events
        sample_event = SampleProcessedEvent(
            sample_id=1,
            characteristic_id=1,
            mean=10.0,
            range_value=None,
            zone="zone_c_upper",
            in_control=True,
            timestamp=datetime(2024, 1, 15, 10, 0, 0),
        )

        limits_event = ControlLimitsUpdatedEvent(
            characteristic_id=1,
            center_line=100.0,
            ucl=103.0,
            lcl=97.0,
            method="moving_range",
            sample_count=30,
            timestamp=datetime(2024, 1, 15, 10, 5, 0),
        )

        # Publish events
        await event_bus.publish(sample_event)
        await event_bus.publish(limits_event)
        await event_bus.shutdown()

        # Verify both broadcasts occurred
        assert mock_connection_manager.broadcast_to_characteristic.call_count == 2

        # Check both message types were sent
        calls = mock_connection_manager.broadcast_to_characteristic.call_args_list
        message_types = [call[0][1]["type"] for call in calls]
        assert "sample" in message_types
        assert "limits_update" in message_types

    async def test_broadcast_to_different_characteristics(
        self, broadcaster, mock_connection_manager, event_bus
    ):
        """Test that events for different characteristics are broadcast separately."""
        # Create events for different characteristics
        event1 = SampleProcessedEvent(
            sample_id=1,
            characteristic_id=1,
            mean=10.0,
            range_value=None,
            zone="zone_c_upper",
            in_control=True,
            timestamp=datetime(2024, 1, 15, 10, 0, 0),
        )

        event2 = SampleProcessedEvent(
            sample_id=2,
            characteristic_id=2,
            mean=20.0,
            range_value=None,
            zone="zone_c_upper",
            in_control=True,
            timestamp=datetime(2024, 1, 15, 10, 1, 0),
        )

        # Publish events
        await event_bus.publish(event1)
        await event_bus.publish(event2)
        await event_bus.shutdown()

        # Verify broadcasts to different characteristics
        assert mock_connection_manager.broadcast_to_characteristic.call_count == 2

        calls = mock_connection_manager.broadcast_to_characteristic.call_args_list
        char_ids = [call[0][0] for call in calls]
        assert 1 in char_ids
        assert 2 in char_ids

    async def test_violation_and_acknowledgment_broadcast_destinations(
        self, broadcaster, mock_connection_manager
    ):
        """Test that violations go to characteristic subscribers and acks go to all."""
        # Create and broadcast violation
        violation = ViolationCreated(
            violation_id=1,
            sample_id=1,
            characteristic_id=1,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            timestamp=datetime(2024, 1, 15, 10, 0, 0),
        )
        await broadcaster.notify_violation_created(violation)

        # Create and broadcast acknowledgment
        ack = ViolationAcknowledged(
            violation_id=1,
            user="john.doe",
            reason="Tool Change",
            timestamp=datetime(2024, 1, 15, 11, 0, 0),
        )
        await broadcaster.notify_violation_acknowledged(ack)

        # Verify violation went to characteristic subscribers
        assert mock_connection_manager.broadcast_to_characteristic.call_count == 1
        # Verify ack went to all clients
        assert mock_connection_manager.broadcast_to_all.call_count == 1

    async def test_broadcast_with_connection_manager_error(
        self, broadcaster, mock_connection_manager, event_bus
    ):
        """Test that broadcaster handles connection manager errors gracefully."""
        # Make connection manager raise an error
        mock_connection_manager.broadcast_to_characteristic.side_effect = Exception(
            "Connection error"
        )

        # Create event
        event = SampleProcessedEvent(
            sample_id=1,
            characteristic_id=1,
            mean=10.0,
            range_value=None,
            zone="zone_c_upper",
            in_control=True,
            timestamp=datetime(2024, 1, 15, 10, 0, 0),
        )

        # Publish event - should not raise exception (error should be logged)
        await event_bus.publish(event)
        await event_bus.shutdown()

        # Verify broadcast was attempted
        mock_connection_manager.broadcast_to_characteristic.assert_called_once()

    async def test_event_message_format_consistency(
        self, broadcaster, mock_connection_manager, event_bus
    ):
        """Test that all event messages follow consistent format."""
        # Publish various events
        sample_event = SampleProcessedEvent(
            sample_id=1,
            characteristic_id=1,
            mean=10.0,
            range_value=None,
            zone="zone_c_upper",
            in_control=True,
            timestamp=datetime(2024, 1, 15, 10, 0, 0),
        )
        await event_bus.publish(sample_event)

        limits_event = ControlLimitsUpdatedEvent(
            characteristic_id=1,
            center_line=100.0,
            ucl=103.0,
            lcl=97.0,
            method="moving_range",
            sample_count=30,
            timestamp=datetime(2024, 1, 15, 10, 5, 0),
        )
        await event_bus.publish(limits_event)

        violation_event = ViolationCreated(
            violation_id=1,
            sample_id=1,
            characteristic_id=1,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            timestamp=datetime(2024, 1, 15, 10, 0, 0),
        )
        await broadcaster.notify_violation_created(violation_event)

        ack_event = ViolationAcknowledged(
            violation_id=1,
            user="john.doe",
            reason="Tool Change",
            timestamp=datetime(2024, 1, 15, 11, 0, 0),
        )
        await broadcaster.notify_violation_acknowledged(ack_event)

        await event_bus.shutdown()

        # Collect all messages
        messages = []
        for call_obj in mock_connection_manager.broadcast_to_characteristic.call_args_list:
            messages.append(call_obj[0][1])
        for call_obj in mock_connection_manager.broadcast_to_all.call_args_list:
            messages.append(call_obj[0][0])

        # Verify all messages have a type field
        for message in messages:
            assert "type" in message
            assert isinstance(message["type"], str)
