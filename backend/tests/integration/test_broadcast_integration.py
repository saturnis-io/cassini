"""Integration tests for WebSocket broadcasting with SPC Engine and AlertManager.

Tests the complete flow of events from domain operations through the Event Bus
to WebSocket broadcasts.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from openspc.core.alerts.manager import AlertManager, ViolationAcknowledged, ViolationCreated
from openspc.core.broadcast import WebSocketBroadcaster
from openspc.core.engine.nelson_rules import RuleResult, Severity
from openspc.core.events import (
    ControlLimitsUpdatedEvent,
    EventBus,
    SampleProcessedEvent,
)


@pytest.fixture
def event_bus():
    """Create a fresh event bus for testing."""
    bus = EventBus()
    bus.clear_handlers()
    return bus


@pytest.fixture
def mock_connection_manager():
    """Create a mock WebSocket connection manager."""
    manager = MagicMock()
    manager.broadcast_to_characteristic = AsyncMock()
    manager.broadcast_to_all = AsyncMock()
    return manager


@pytest.fixture
def broadcaster(mock_connection_manager, event_bus):
    """Create a WebSocketBroadcaster instance."""
    return WebSocketBroadcaster(mock_connection_manager, event_bus)


@pytest.fixture
def mock_violation_repo():
    """Create a mock violation repository."""
    repo = MagicMock()
    repo.session = MagicMock()
    repo.session.add = MagicMock()
    repo.session.flush = AsyncMock()
    repo.session.refresh = AsyncMock()
    repo.get_by_id = AsyncMock()
    return repo


@pytest.fixture
def mock_sample_repo():
    """Create a mock sample repository."""
    repo = MagicMock()
    repo.session = MagicMock()
    repo.session.flush = AsyncMock()
    repo.get_by_id = AsyncMock()
    return repo


@pytest.mark.asyncio
class TestBroadcastIntegration:
    """Integration tests for event broadcasting through the system."""

    async def test_sample_event_flow_through_event_bus(
        self, event_bus, mock_connection_manager, broadcaster
    ):
        """Test that SampleProcessedEvent flows through Event Bus to WebSocket."""
        # Publish sample event (as SPCEngine would)
        event = SampleProcessedEvent(
            sample_id=1,
            characteristic_id=1,
            mean=10.5,
            range_value=0.5,
            zone="zone_c_upper",
            in_control=True,
            timestamp=datetime(2024, 1, 15, 10, 0, 0),
        )

        await event_bus.publish(event)
        await event_bus.shutdown()

        # Verify broadcast occurred
        mock_connection_manager.broadcast_to_characteristic.assert_called_once()
        call_args = mock_connection_manager.broadcast_to_characteristic.call_args
        assert call_args[0][0] == 1  # characteristic_id
        assert call_args[0][1]["type"] == "sample"

    async def test_control_limits_event_flow(
        self, event_bus, mock_connection_manager, broadcaster
    ):
        """Test that ControlLimitsUpdatedEvent flows through Event Bus to WebSocket."""
        # Publish control limits event (as ControlLimitService would)
        event = ControlLimitsUpdatedEvent(
            characteristic_id=1,
            center_line=100.0,
            ucl=103.0,
            lcl=97.0,
            method="moving_range",
            sample_count=30,
            timestamp=datetime(2024, 1, 15, 10, 0, 0),
        )

        await event_bus.publish(event)
        await event_bus.shutdown()

        # Verify broadcast occurred
        mock_connection_manager.broadcast_to_characteristic.assert_called_once()
        call_args = mock_connection_manager.broadcast_to_characteristic.call_args
        assert call_args[0][0] == 1  # characteristic_id
        assert call_args[0][1]["type"] == "limits_update"

    async def test_violation_created_through_alert_manager(
        self, mock_connection_manager, broadcaster, mock_violation_repo, mock_sample_repo
    ):
        """Test that violations created by AlertManager are broadcast."""
        # Create AlertManager with broadcaster as notifier
        alert_manager = AlertManager(
            violation_repo=mock_violation_repo,
            sample_repo=mock_sample_repo,
            notifiers=[broadcaster],
        )

        # Mock sample for violation creation
        from openspc.db.models.sample import Sample

        sample = Sample(id=1, char_id=1, timestamp=datetime(2024, 1, 15, 10, 0, 0))
        mock_sample_repo.get_by_id.return_value = sample

        # Create rule result
        rule_result = RuleResult(
            rule_id=1,
            rule_name="Outlier",
            triggered=True,
            severity=Severity.CRITICAL,
            involved_sample_ids=[1],
            message="Point beyond 3 sigma",
        )

        # Create violations through AlertManager
        violations = await alert_manager.create_violations(
            sample_id=1, characteristic_id=1, rule_results=[rule_result]
        )

        # Verify broadcast occurred
        assert len(violations) == 1
        mock_connection_manager.broadcast_to_characteristic.assert_called_once()
        call_args = mock_connection_manager.broadcast_to_characteristic.call_args
        assert call_args[0][0] == 1  # characteristic_id
        assert call_args[0][1]["type"] == "violation"
        assert call_args[0][1]["violation"]["rule_id"] == 1
        assert call_args[0][1]["violation"]["severity"] == "CRITICAL"

    async def test_violation_acknowledged_through_alert_manager(
        self, mock_connection_manager, broadcaster, mock_violation_repo, mock_sample_repo
    ):
        """Test that violation acknowledgments by AlertManager are broadcast."""
        # Create AlertManager with broadcaster as notifier
        alert_manager = AlertManager(
            violation_repo=mock_violation_repo,
            sample_repo=mock_sample_repo,
            notifiers=[broadcaster],
        )

        # Mock violation
        from openspc.db.models.violation import Violation

        violation = Violation(
            id=1,
            sample_id=1,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        )
        mock_violation_repo.get_by_id.return_value = violation

        # Mock sample
        from openspc.db.models.sample import Sample

        sample = Sample(id=1, char_id=1, timestamp=datetime(2024, 1, 15, 10, 0, 0))
        mock_sample_repo.get_by_id.return_value = sample

        # Acknowledge violation through AlertManager
        await alert_manager.acknowledge(
            violation_id=1, user="john.doe", reason="Tool Change", exclude_sample=False
        )

        # Verify broadcast occurred to ALL clients (not just characteristic)
        mock_connection_manager.broadcast_to_all.assert_called_once()
        call_args = mock_connection_manager.broadcast_to_all.call_args
        assert call_args[0][0]["type"] == "ack_update"
        assert call_args[0][0]["violation_id"] == 1
        assert call_args[0][0]["ack_user"] == "john.doe"
        assert call_args[0][0]["ack_reason"] == "Tool Change"

    async def test_multiple_events_in_sequence(
        self, event_bus, mock_connection_manager, broadcaster
    ):
        """Test multiple events are broadcast in correct order."""
        # Publish multiple events
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

        sample_event2 = SampleProcessedEvent(
            sample_id=2,
            characteristic_id=1,
            mean=10.2,
            range_value=None,
            zone="zone_c_upper",
            in_control=True,
            timestamp=datetime(2024, 1, 15, 10, 10, 0),
        )

        await event_bus.publish(sample_event)
        await event_bus.publish(limits_event)
        await event_bus.publish(sample_event2)
        await event_bus.shutdown()

        # Verify all broadcasts occurred
        assert mock_connection_manager.broadcast_to_characteristic.call_count == 3

        # Verify message types
        calls = mock_connection_manager.broadcast_to_characteristic.call_args_list
        message_types = [call[0][1]["type"] for call in calls]
        assert message_types == ["sample", "limits_update", "sample"]

    async def test_broadcaster_handles_multiple_notifiers(
        self, mock_connection_manager, mock_violation_repo, mock_sample_repo, event_bus
    ):
        """Test that multiple notifiers can coexist (e.g., WebSocket + Email)."""
        # Create broadcaster
        broadcaster = WebSocketBroadcaster(mock_connection_manager, event_bus)

        # Create another mock notifier
        email_notifier = MagicMock()
        email_notifier.notify_violation_created = AsyncMock()
        email_notifier.notify_violation_acknowledged = AsyncMock()

        # Create AlertManager with both notifiers
        alert_manager = AlertManager(
            violation_repo=mock_violation_repo,
            sample_repo=mock_sample_repo,
            notifiers=[broadcaster, email_notifier],
        )

        # Mock sample
        from openspc.db.models.sample import Sample

        sample = Sample(id=1, char_id=1, timestamp=datetime(2024, 1, 15, 10, 0, 0))
        mock_sample_repo.get_by_id.return_value = sample

        # Create rule result
        rule_result = RuleResult(
            rule_id=1,
            rule_name="Outlier",
            triggered=True,
            severity=Severity.CRITICAL,
            involved_sample_ids=[1],
            message="Point beyond 3 sigma",
        )

        # Create violations
        await alert_manager.create_violations(
            sample_id=1, characteristic_id=1, rule_results=[rule_result]
        )

        # Verify both notifiers were called
        mock_connection_manager.broadcast_to_characteristic.assert_called_once()
        email_notifier.notify_violation_created.assert_called_once()

    async def test_broadcaster_isolation_on_error(
        self, event_bus, mock_connection_manager, broadcaster
    ):
        """Test that broadcaster errors don't crash the event bus."""
        # Make broadcaster raise an error
        mock_connection_manager.broadcast_to_characteristic.side_effect = Exception(
            "Connection error"
        )

        # Publish event - should not raise
        event = SampleProcessedEvent(
            sample_id=1,
            characteristic_id=1,
            mean=10.0,
            range_value=None,
            zone="zone_c_upper",
            in_control=True,
            timestamp=datetime(2024, 1, 15, 10, 0, 0),
        )

        # Should not raise exception
        await event_bus.publish(event)
        await event_bus.shutdown()

        # Verify broadcast was attempted
        mock_connection_manager.broadcast_to_characteristic.assert_called_once()
