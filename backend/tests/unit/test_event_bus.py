"""Unit tests for EventBus.

Tests cover:
- Event subscription and unsubscription
- Publishing events (fire-and-forget)
- Publishing events with synchronous waiting
- Error isolation between handlers
- Multiple subscribers per event type
- Handler cleanup and shutdown
"""

import asyncio
from datetime import datetime
from typing import Any

import pytest

from openspc.core.events import (
    CharacteristicUpdatedEvent,
    ControlLimitsUpdatedEvent,
    Event,
    EventBus,
    SampleProcessedEvent,
    ViolationAcknowledgedEvent,
    ViolationCreatedEvent,
)


class TestEventBusSubscription:
    """Tests for event subscription and unsubscription."""

    @pytest.mark.asyncio
    async def test_subscribe_handler(self) -> None:
        """Test subscribing a handler to an event type."""
        bus = EventBus()
        called = False

        async def handler(event: SampleProcessedEvent) -> None:
            nonlocal called
            called = True

        bus.subscribe(SampleProcessedEvent, handler)

        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        # Give handler time to execute
        await asyncio.sleep(0.01)
        assert called is True

    @pytest.mark.asyncio
    async def test_subscribe_multiple_handlers(self) -> None:
        """Test subscribing multiple handlers to same event type."""
        bus = EventBus()
        calls: list[int] = []

        async def handler1(event: SampleProcessedEvent) -> None:
            calls.append(1)

        async def handler2(event: SampleProcessedEvent) -> None:
            calls.append(2)

        bus.subscribe(SampleProcessedEvent, handler1)
        bus.subscribe(SampleProcessedEvent, handler2)

        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        await asyncio.sleep(0.01)
        assert len(calls) == 2
        assert 1 in calls
        assert 2 in calls

    @pytest.mark.asyncio
    async def test_unsubscribe_handler(self) -> None:
        """Test unsubscribing a handler from an event type."""
        bus = EventBus()
        called = False

        async def handler(event: SampleProcessedEvent) -> None:
            nonlocal called
            called = True

        bus.subscribe(SampleProcessedEvent, handler)
        bus.unsubscribe(SampleProcessedEvent, handler)

        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        await asyncio.sleep(0.01)
        assert called is False

    @pytest.mark.asyncio
    async def test_unsubscribe_one_of_many(self) -> None:
        """Test unsubscribing one handler leaves others intact."""
        bus = EventBus()
        calls: list[int] = []

        async def handler1(event: SampleProcessedEvent) -> None:
            calls.append(1)

        async def handler2(event: SampleProcessedEvent) -> None:
            calls.append(2)

        bus.subscribe(SampleProcessedEvent, handler1)
        bus.subscribe(SampleProcessedEvent, handler2)
        bus.unsubscribe(SampleProcessedEvent, handler1)

        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        await asyncio.sleep(0.01)
        assert calls == [2]

    @pytest.mark.asyncio
    async def test_unsubscribe_nonexistent_handler(self) -> None:
        """Test unsubscribing a handler that was never subscribed."""
        bus = EventBus()

        async def handler(event: SampleProcessedEvent) -> None:
            pass

        # Should not raise an error
        bus.unsubscribe(SampleProcessedEvent, handler)

    def test_get_handler_count(self) -> None:
        """Test getting the number of subscribed handlers."""
        bus = EventBus()

        async def handler1(event: SampleProcessedEvent) -> None:
            pass

        async def handler2(event: SampleProcessedEvent) -> None:
            pass

        assert bus.get_handler_count(SampleProcessedEvent) == 0

        bus.subscribe(SampleProcessedEvent, handler1)
        assert bus.get_handler_count(SampleProcessedEvent) == 1

        bus.subscribe(SampleProcessedEvent, handler2)
        assert bus.get_handler_count(SampleProcessedEvent) == 2

    def test_clear_handlers_specific_event(self) -> None:
        """Test clearing handlers for a specific event type."""
        bus = EventBus()

        async def handler1(event: SampleProcessedEvent) -> None:
            pass

        async def handler2(event: ViolationCreatedEvent) -> None:
            pass

        bus.subscribe(SampleProcessedEvent, handler1)
        bus.subscribe(ViolationCreatedEvent, handler2)

        bus.clear_handlers(SampleProcessedEvent)

        assert bus.get_handler_count(SampleProcessedEvent) == 0
        assert bus.get_handler_count(ViolationCreatedEvent) == 1

    def test_clear_all_handlers(self) -> None:
        """Test clearing all handlers."""
        bus = EventBus()

        async def handler1(event: SampleProcessedEvent) -> None:
            pass

        async def handler2(event: ViolationCreatedEvent) -> None:
            pass

        bus.subscribe(SampleProcessedEvent, handler1)
        bus.subscribe(ViolationCreatedEvent, handler2)

        bus.clear_handlers()

        assert bus.get_handler_count(SampleProcessedEvent) == 0
        assert bus.get_handler_count(ViolationCreatedEvent) == 0


class TestEventBusPublish:
    """Tests for publishing events."""

    @pytest.mark.asyncio
    async def test_publish_delivers_event(self) -> None:
        """Test that published event is delivered to handler."""
        bus = EventBus()
        received_event: Event | None = None

        async def handler(event: SampleProcessedEvent) -> None:
            nonlocal received_event
            received_event = event

        bus.subscribe(SampleProcessedEvent, handler)

        event = SampleProcessedEvent(
            sample_id=42,
            characteristic_id=1,
            mean=10.5,
            range_value=2.0,
            zone="zone_b_upper",
            in_control=True,
        )

        await bus.publish(event)
        await asyncio.sleep(0.01)

        assert received_event is not None
        assert received_event.sample_id == 42
        assert received_event.characteristic_id == 1
        assert received_event.mean == 10.5

    @pytest.mark.asyncio
    async def test_publish_no_subscribers(self) -> None:
        """Test publishing event with no subscribers does not raise error."""
        bus = EventBus()

        # Should not raise
        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

    @pytest.mark.asyncio
    async def test_publish_returns_immediately(self) -> None:
        """Test that publish() returns immediately without waiting for handlers."""
        bus = EventBus()
        handler_started = False
        handler_completed = False

        async def slow_handler(event: SampleProcessedEvent) -> None:
            nonlocal handler_started, handler_completed
            handler_started = True
            await asyncio.sleep(0.1)
            handler_completed = True

        bus.subscribe(SampleProcessedEvent, slow_handler)

        # Publish should return quickly
        start_time = asyncio.get_event_loop().time()
        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )
        elapsed = asyncio.get_event_loop().time() - start_time

        # Should return almost immediately (much less than 0.1s)
        assert elapsed < 0.05

        # But handler should still be running
        await asyncio.sleep(0.01)
        assert handler_started is True
        assert handler_completed is False

        # Wait for handler to complete
        await asyncio.sleep(0.1)
        assert handler_completed is True

    @pytest.mark.asyncio
    async def test_publish_multiple_event_types(self) -> None:
        """Test publishing different event types to different handlers."""
        bus = EventBus()
        sample_calls = 0
        violation_calls = 0

        async def sample_handler(event: SampleProcessedEvent) -> None:
            nonlocal sample_calls
            sample_calls += 1

        async def violation_handler(event: ViolationCreatedEvent) -> None:
            nonlocal violation_calls
            violation_calls += 1

        bus.subscribe(SampleProcessedEvent, sample_handler)
        bus.subscribe(ViolationCreatedEvent, violation_handler)

        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        await bus.publish(
            ViolationCreatedEvent(
                violation_id=1,
                sample_id=1,
                characteristic_id=1,
                rule_id=1,
                rule_name="Outlier",
                severity="CRITICAL",
            )
        )

        await asyncio.sleep(0.01)
        assert sample_calls == 1
        assert violation_calls == 1


class TestEventBusPublishAndWait:
    """Tests for synchronous event publishing."""

    @pytest.mark.asyncio
    async def test_publish_and_wait_blocks_until_complete(self) -> None:
        """Test that publish_and_wait() waits for all handlers to complete."""
        bus = EventBus()
        handler_completed = False

        async def slow_handler(event: SampleProcessedEvent) -> None:
            nonlocal handler_completed
            await asyncio.sleep(0.05)
            handler_completed = True

        bus.subscribe(SampleProcessedEvent, slow_handler)

        await bus.publish_and_wait(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        # Handler should be complete by the time publish_and_wait returns
        assert handler_completed is True

    @pytest.mark.asyncio
    async def test_publish_and_wait_returns_errors(self) -> None:
        """Test that publish_and_wait() returns exceptions from failed handlers."""
        bus = EventBus()

        async def failing_handler(event: SampleProcessedEvent) -> None:
            raise ValueError("Handler failed")

        async def successful_handler(event: SampleProcessedEvent) -> None:
            pass

        bus.subscribe(SampleProcessedEvent, failing_handler)
        bus.subscribe(SampleProcessedEvent, successful_handler)

        errors = await bus.publish_and_wait(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        assert len(errors) == 1
        assert isinstance(errors[0], ValueError)
        assert str(errors[0]) == "Handler failed"

    @pytest.mark.asyncio
    async def test_publish_and_wait_all_succeed(self) -> None:
        """Test publish_and_wait() with all handlers succeeding."""
        bus = EventBus()
        calls = 0

        async def handler1(event: SampleProcessedEvent) -> None:
            nonlocal calls
            calls += 1

        async def handler2(event: SampleProcessedEvent) -> None:
            nonlocal calls
            calls += 1

        bus.subscribe(SampleProcessedEvent, handler1)
        bus.subscribe(SampleProcessedEvent, handler2)

        errors = await bus.publish_and_wait(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        assert len(errors) == 0
        assert calls == 2


class TestEventBusErrorIsolation:
    """Tests for error isolation between handlers."""

    @pytest.mark.asyncio
    async def test_handler_error_does_not_affect_others(self) -> None:
        """Test that one handler's error doesn't prevent other handlers from running."""
        bus = EventBus()
        handler1_called = False
        handler2_called = False

        async def failing_handler(event: SampleProcessedEvent) -> None:
            raise ValueError("Handler failed")

        async def handler1(event: SampleProcessedEvent) -> None:
            nonlocal handler1_called
            handler1_called = True

        async def handler2(event: SampleProcessedEvent) -> None:
            nonlocal handler2_called
            handler2_called = True

        bus.subscribe(SampleProcessedEvent, handler1)
        bus.subscribe(SampleProcessedEvent, failing_handler)
        bus.subscribe(SampleProcessedEvent, handler2)

        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        await asyncio.sleep(0.01)

        # Both non-failing handlers should have been called
        assert handler1_called is True
        assert handler2_called is True

    @pytest.mark.asyncio
    async def test_handler_error_logged_not_raised(self) -> None:
        """Test that handler errors are logged but not raised."""
        bus = EventBus()

        async def failing_handler(event: SampleProcessedEvent) -> None:
            raise ValueError("Handler failed")

        bus.subscribe(SampleProcessedEvent, failing_handler)

        # Should not raise an exception
        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        await asyncio.sleep(0.01)


class TestEventBusShutdown:
    """Tests for event bus shutdown."""

    @pytest.mark.asyncio
    async def test_shutdown_waits_for_handlers(self) -> None:
        """Test that shutdown waits for running handlers to complete."""
        bus = EventBus()
        handler_completed = False

        async def slow_handler(event: SampleProcessedEvent) -> None:
            nonlocal handler_completed
            await asyncio.sleep(0.05)
            handler_completed = True

        bus.subscribe(SampleProcessedEvent, slow_handler)

        # Publish and don't wait
        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        # Give handler time to start
        await asyncio.sleep(0.01)
        assert handler_completed is False

        # Shutdown should wait for it
        await bus.shutdown()
        assert handler_completed is True

    @pytest.mark.asyncio
    async def test_shutdown_with_no_pending_tasks(self) -> None:
        """Test shutdown when there are no pending tasks."""
        bus = EventBus()

        # Should not raise or hang
        await bus.shutdown()


class TestEventTimestamps:
    """Tests for event timestamp handling."""

    @pytest.mark.asyncio
    async def test_event_has_automatic_timestamp(self) -> None:
        """Test that events get automatic UTC timestamps."""
        event = SampleProcessedEvent(
            sample_id=1,
            characteristic_id=1,
            mean=10.5,
            range_value=None,
            zone="zone_c_upper",
            in_control=True,
        )

        assert event.timestamp is not None
        assert isinstance(event.timestamp, datetime)

    @pytest.mark.asyncio
    async def test_event_custom_timestamp(self) -> None:
        """Test creating event with custom timestamp."""
        custom_time = datetime(2025, 1, 15, 12, 30, 0)

        event = SampleProcessedEvent(
            sample_id=1,
            characteristic_id=1,
            mean=10.5,
            range_value=None,
            zone="zone_c_upper",
            in_control=True,
            timestamp=custom_time,
        )

        assert event.timestamp == custom_time


class TestAllEventTypes:
    """Tests for all event type definitions."""

    @pytest.mark.asyncio
    async def test_sample_processed_event(self) -> None:
        """Test SampleProcessedEvent creation and publishing."""
        bus = EventBus()
        received = None

        async def handler(event: SampleProcessedEvent) -> None:
            nonlocal received
            received = event

        bus.subscribe(SampleProcessedEvent, handler)

        event = SampleProcessedEvent(
            sample_id=1,
            characteristic_id=2,
            mean=10.5,
            range_value=1.5,
            zone="zone_a_upper",
            in_control=False,
        )

        await bus.publish(event)
        await asyncio.sleep(0.01)

        assert received is not None
        assert received.sample_id == 1
        assert received.characteristic_id == 2
        assert received.mean == 10.5
        assert received.range_value == 1.5
        assert received.zone == "zone_a_upper"
        assert received.in_control is False

    @pytest.mark.asyncio
    async def test_violation_created_event(self) -> None:
        """Test ViolationCreatedEvent creation and publishing."""
        bus = EventBus()
        received = None

        async def handler(event: ViolationCreatedEvent) -> None:
            nonlocal received
            received = event

        bus.subscribe(ViolationCreatedEvent, handler)

        event = ViolationCreatedEvent(
            violation_id=1,
            sample_id=2,
            characteristic_id=3,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
        )

        await bus.publish(event)
        await asyncio.sleep(0.01)

        assert received is not None
        assert received.violation_id == 1
        assert received.sample_id == 2
        assert received.characteristic_id == 3
        assert received.rule_id == 1
        assert received.rule_name == "Outlier"
        assert received.severity == "CRITICAL"

    @pytest.mark.asyncio
    async def test_violation_acknowledged_event(self) -> None:
        """Test ViolationAcknowledgedEvent creation and publishing."""
        bus = EventBus()
        received = None

        async def handler(event: ViolationAcknowledgedEvent) -> None:
            nonlocal received
            received = event

        bus.subscribe(ViolationAcknowledgedEvent, handler)

        event = ViolationAcknowledgedEvent(
            violation_id=1,
            user="john.doe",
            reason="Tool Change",
        )

        await bus.publish(event)
        await asyncio.sleep(0.01)

        assert received is not None
        assert received.violation_id == 1
        assert received.user == "john.doe"
        assert received.reason == "Tool Change"

    @pytest.mark.asyncio
    async def test_control_limits_updated_event(self) -> None:
        """Test ControlLimitsUpdatedEvent creation and publishing."""
        bus = EventBus()
        received = None

        async def handler(event: ControlLimitsUpdatedEvent) -> None:
            nonlocal received
            received = event

        bus.subscribe(ControlLimitsUpdatedEvent, handler)

        event = ControlLimitsUpdatedEvent(
            characteristic_id=1,
            center_line=100.0,
            ucl=103.0,
            lcl=97.0,
            method="moving_range",
            sample_count=25,
        )

        await bus.publish(event)
        await asyncio.sleep(0.01)

        assert received is not None
        assert received.characteristic_id == 1
        assert received.center_line == 100.0
        assert received.ucl == 103.0
        assert received.lcl == 97.0
        assert received.method == "moving_range"
        assert received.sample_count == 25

    @pytest.mark.asyncio
    async def test_characteristic_updated_event(self) -> None:
        """Test CharacteristicUpdatedEvent creation and publishing."""
        bus = EventBus()
        received = None

        async def handler(event: CharacteristicUpdatedEvent) -> None:
            nonlocal received
            received = event

        bus.subscribe(CharacteristicUpdatedEvent, handler)

        event = CharacteristicUpdatedEvent(
            characteristic_id=1,
            changes={"subgroup_size": 5, "ucl": 105.0},
        )

        await bus.publish(event)
        await asyncio.sleep(0.01)

        assert received is not None
        assert received.characteristic_id == 1
        assert received.changes == {"subgroup_size": 5, "ucl": 105.0}


class TestEventBusIntegration:
    """Integration tests for realistic usage patterns."""

    @pytest.mark.asyncio
    async def test_complex_workflow(self) -> None:
        """Test complex workflow with multiple event types and handlers."""
        bus = EventBus()
        events_received: list[str] = []

        async def log_sample(event: SampleProcessedEvent) -> None:
            events_received.append(f"sample_{event.sample_id}")

        async def log_violation(event: ViolationCreatedEvent) -> None:
            events_received.append(f"violation_{event.violation_id}")

        async def log_acknowledgment(event: ViolationAcknowledgedEvent) -> None:
            events_received.append(f"ack_{event.violation_id}")

        bus.subscribe(SampleProcessedEvent, log_sample)
        bus.subscribe(ViolationCreatedEvent, log_violation)
        bus.subscribe(ViolationAcknowledgedEvent, log_acknowledgment)

        # Publish a workflow of events
        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
            )
        )

        await bus.publish(
            ViolationCreatedEvent(
                violation_id=1,
                sample_id=1,
                characteristic_id=1,
                rule_id=1,
                rule_name="Outlier",
                severity="CRITICAL",
            )
        )

        await bus.publish(
            ViolationAcknowledgedEvent(
                violation_id=1,
                user="john.doe",
                reason="Tool Change",
            )
        )

        await asyncio.sleep(0.01)

        assert len(events_received) == 3
        assert "sample_1" in events_received
        assert "violation_1" in events_received
        assert "ack_1" in events_received

    @pytest.mark.asyncio
    async def test_handler_can_publish_events(self) -> None:
        """Test that handlers can publish additional events (cascading)."""
        bus = EventBus()
        events: list[str] = []

        async def on_sample(event: SampleProcessedEvent) -> None:
            events.append("sample")
            # Handler publishes another event
            if not event.in_control:
                await bus.publish(
                    ViolationCreatedEvent(
                        violation_id=1,
                        sample_id=event.sample_id,
                        characteristic_id=event.characteristic_id,
                        rule_id=1,
                        rule_name="Outlier",
                        severity="CRITICAL",
                    )
                )

        async def on_violation(event: ViolationCreatedEvent) -> None:
            events.append("violation")

        bus.subscribe(SampleProcessedEvent, on_sample)
        bus.subscribe(ViolationCreatedEvent, on_violation)

        await bus.publish(
            SampleProcessedEvent(
                sample_id=1,
                characteristic_id=1,
                mean=10.5,
                range_value=None,
                zone="zone_a_upper",
                in_control=False,
            )
        )

        # Wait for cascading events
        await asyncio.sleep(0.02)

        assert "sample" in events
        assert "violation" in events
