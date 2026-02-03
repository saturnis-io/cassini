"""Example usage of the OpenSPC event bus.

This example demonstrates:
1. Subscribing handlers to events
2. Publishing events
3. Multiple handlers for the same event
4. Error isolation between handlers
5. Integration with SPC components
"""

import asyncio
from datetime import datetime

from openspc.core.events import (
    ControlLimitsUpdatedEvent,
    SampleProcessedEvent,
    ViolationAcknowledgedEvent,
    ViolationCreatedEvent,
    event_bus,
)


# Example 1: Simple event handler
async def log_sample_processed(event: SampleProcessedEvent) -> None:
    """Log when a sample is processed."""
    print(f"Sample {event.sample_id} processed:")
    print(f"  Mean: {event.mean}")
    print(f"  Zone: {event.zone}")
    print(f"  In Control: {event.in_control}")
    print()


# Example 2: Handler that broadcasts to WebSocket clients
async def broadcast_sample_to_clients(event: SampleProcessedEvent) -> None:
    """Simulate broadcasting to WebSocket clients."""
    print(f"Broadcasting sample {event.sample_id} to WebSocket clients...")
    # In real code: await websocket_manager.broadcast(...)
    await asyncio.sleep(0.1)  # Simulate network delay
    print(f"Broadcast complete for sample {event.sample_id}")
    print()


# Example 3: Handler that updates statistics
async def update_statistics(event: SampleProcessedEvent) -> None:
    """Update real-time statistics."""
    print(f"Updating statistics for characteristic {event.characteristic_id}")
    # In real code: update dashboard metrics, cache, etc.
    print()


# Example 4: Violation handler
async def alert_on_violation(event: ViolationCreatedEvent) -> None:
    """Alert when violation is created."""
    severity_mark = "[CRITICAL]" if event.severity == "CRITICAL" else "[WARNING]"
    print(f"{severity_mark} VIOLATION DETECTED!")
    print(f"  Rule: {event.rule_name} (#{event.rule_id})")
    print(f"  Sample: {event.sample_id}")
    print(f"  Severity: {event.severity}")
    print()


# Example 5: Handler with error (to demonstrate error isolation)
async def failing_handler(event: SampleProcessedEvent) -> None:
    """Handler that fails - demonstrates error isolation."""
    print("This handler will fail, but others will continue...")
    raise ValueError("Intentional error for demonstration")


# Example 6: Acknowledgment handler
async def log_acknowledgment(event: ViolationAcknowledgedEvent) -> None:
    """Log violation acknowledgment."""
    print(f"Violation {event.violation_id} acknowledged by {event.user}")
    print(f"  Reason: {event.reason}")
    print()


# Example 7: Control limits update handler
async def notify_limits_updated(event: ControlLimitsUpdatedEvent) -> None:
    """Notify when control limits are updated."""
    print(f"Control limits updated for characteristic {event.characteristic_id}:")
    print(f"  Center Line: {event.center_line}")
    print(f"  UCL: {event.ucl}")
    print(f"  LCL: {event.lcl}")
    print(f"  Method: {event.method}")
    print(f"  Samples used: {event.sample_count}")
    print()


async def main() -> None:
    """Run event bus examples."""
    print("=" * 60)
    print("OpenSPC Event Bus Examples")
    print("=" * 60)
    print()

    # Subscribe handlers to events
    print("Subscribing handlers...")
    event_bus.subscribe(SampleProcessedEvent, log_sample_processed)
    event_bus.subscribe(SampleProcessedEvent, broadcast_sample_to_clients)
    event_bus.subscribe(SampleProcessedEvent, update_statistics)
    event_bus.subscribe(SampleProcessedEvent, failing_handler)  # Will fail
    event_bus.subscribe(ViolationCreatedEvent, alert_on_violation)
    event_bus.subscribe(ViolationAcknowledgedEvent, log_acknowledgment)
    event_bus.subscribe(ControlLimitsUpdatedEvent, notify_limits_updated)
    print(f"Subscribed {event_bus.get_handler_count(SampleProcessedEvent)} handlers to SampleProcessedEvent")
    print()

    # Example 1: Publish a sample processed event (fire and forget)
    print("-" * 60)
    print("Example 1: Publishing SampleProcessedEvent (fire-and-forget)")
    print("-" * 60)
    await event_bus.publish(
        SampleProcessedEvent(
            sample_id=1,
            characteristic_id=101,
            mean=10.5,
            range_value=None,
            zone="zone_c_upper",
            in_control=True,
        )
    )
    print("Event published (non-blocking)")
    print("Waiting for handlers to complete...")
    await asyncio.sleep(0.2)  # Give handlers time to execute

    # Example 2: Publish a violation event
    print("-" * 60)
    print("Example 2: Publishing ViolationCreatedEvent")
    print("-" * 60)
    await event_bus.publish(
        ViolationCreatedEvent(
            violation_id=1,
            sample_id=1,
            characteristic_id=101,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
        )
    )
    await asyncio.sleep(0.1)

    # Example 3: Publish acknowledgment event
    print("-" * 60)
    print("Example 3: Publishing ViolationAcknowledgedEvent")
    print("-" * 60)
    await event_bus.publish(
        ViolationAcknowledgedEvent(
            violation_id=1,
            user="john.doe",
            reason="Tool Change",
        )
    )
    await asyncio.sleep(0.1)

    # Example 4: Publish and wait (synchronous)
    print("-" * 60)
    print("Example 4: Publishing with synchronous wait")
    print("-" * 60)
    errors = await event_bus.publish_and_wait(
        SampleProcessedEvent(
            sample_id=2,
            characteristic_id=101,
            mean=12.3,
            range_value=None,
            zone="zone_b_upper",
            in_control=True,
        )
    )
    print(f"All handlers completed. Errors: {len(errors)}")
    if errors:
        print("Failed handlers:")
        for error in errors:
            print(f"  - {type(error).__name__}: {error}")
    print()

    # Example 5: Control limits update
    print("-" * 60)
    print("Example 5: Publishing ControlLimitsUpdatedEvent")
    print("-" * 60)
    await event_bus.publish(
        ControlLimitsUpdatedEvent(
            characteristic_id=101,
            center_line=100.0,
            ucl=103.0,
            lcl=97.0,
            method="moving_range",
            sample_count=25,
        )
    )
    await asyncio.sleep(0.1)

    # Example 6: Multiple events in sequence (workflow)
    print("-" * 60)
    print("Example 6: Publishing workflow sequence")
    print("-" * 60)
    # Sample processed -> violation detected -> limits recalculated
    await event_bus.publish(
        SampleProcessedEvent(
            sample_id=3,
            characteristic_id=102,
            mean=15.7,
            range_value=None,
            zone="zone_a_upper",
            in_control=False,
        )
    )
    await event_bus.publish(
        ViolationCreatedEvent(
            violation_id=2,
            sample_id=3,
            characteristic_id=102,
            rule_id=5,
            rule_name="Two out of Three Beyond 2-Sigma",
            severity="WARNING",
        )
    )
    await event_bus.publish(
        ControlLimitsUpdatedEvent(
            characteristic_id=102,
            center_line=100.0,
            ucl=106.0,
            lcl=94.0,
            method="moving_range",
            sample_count=30,
        )
    )
    await asyncio.sleep(0.2)

    # Shutdown and wait for pending tasks
    print("-" * 60)
    print("Shutting down event bus...")
    print("-" * 60)
    await event_bus.shutdown()
    print("All handlers completed successfully")
    print()

    # Cleanup for next run
    event_bus.clear_handlers()


if __name__ == "__main__":
    asyncio.run(main())
