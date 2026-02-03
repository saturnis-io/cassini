"""Example: Integrating Event Bus with Alert Manager.

This example demonstrates how the existing AlertManager can be integrated
with the event bus to provide decoupled communication between components.

The AlertManager already uses ViolationCreated and ViolationAcknowledged
events (dataclasses), but they're passed directly to notifiers. With the
event bus, we can decouple this further.
"""

import asyncio
from datetime import datetime

from openspc.core.events import (
    ViolationAcknowledgedEvent,
    ViolationCreatedEvent,
    event_bus,
)


# Example: WebSocket notifier that subscribes to events
class WebSocketNotifier:
    """Notifier that broadcasts events via WebSocket."""

    def __init__(self) -> None:
        """Initialize and subscribe to events."""
        event_bus.subscribe(ViolationCreatedEvent, self.on_violation_created)
        event_bus.subscribe(ViolationAcknowledgedEvent, self.on_violation_acknowledged)

    async def on_violation_created(self, event: ViolationCreatedEvent) -> None:
        """Handle violation created event."""
        print(f"[WebSocket] Broadcasting violation {event.violation_id}")
        print(f"  Rule: {event.rule_name}")
        print(f"  Severity: {event.severity}")
        # In real code: await websocket_manager.broadcast(...)
        print()

    async def on_violation_acknowledged(self, event: ViolationAcknowledgedEvent) -> None:
        """Handle violation acknowledged event."""
        print(f"[WebSocket] Broadcasting acknowledgment for violation {event.violation_id}")
        print(f"  User: {event.user}")
        print(f"  Reason: {event.reason}")
        # In real code: await websocket_manager.broadcast(...)
        print()


# Example: Email notifier that subscribes to events
class EmailNotifier:
    """Notifier that sends email alerts."""

    def __init__(self) -> None:
        """Initialize and subscribe to critical violations only."""
        event_bus.subscribe(ViolationCreatedEvent, self.on_violation_created)

    async def on_violation_created(self, event: ViolationCreatedEvent) -> None:
        """Send email for critical violations."""
        if event.severity == "CRITICAL":
            print(f"[Email] Sending alert for critical violation {event.violation_id}")
            print(f"  To: quality@example.com")
            print(f"  Subject: Critical SPC Violation - {event.rule_name}")
            # In real code: await email_service.send(...)
            await asyncio.sleep(0.1)  # Simulate email sending
            print(f"[Email] Alert sent successfully")
            print()


# Example: Audit logger that subscribes to events
class AuditLogger:
    """Logger that records all events to audit trail."""

    def __init__(self) -> None:
        """Initialize and subscribe to all violation events."""
        event_bus.subscribe(ViolationCreatedEvent, self.log_violation_created)
        event_bus.subscribe(ViolationAcknowledgedEvent, self.log_violation_acknowledged)

    async def log_violation_created(self, event: ViolationCreatedEvent) -> None:
        """Log violation creation to audit trail."""
        print(f"[Audit] Logging violation_created event")
        print(f"  Timestamp: {event.timestamp}")
        print(f"  Violation ID: {event.violation_id}")
        print(f"  Sample ID: {event.sample_id}")
        # In real code: await audit_db.insert(...)
        print()

    async def log_violation_acknowledged(self, event: ViolationAcknowledgedEvent) -> None:
        """Log violation acknowledgment to audit trail."""
        print(f"[Audit] Logging violation_acknowledged event")
        print(f"  Timestamp: {event.timestamp}")
        print(f"  Violation ID: {event.violation_id}")
        print(f"  User: {event.user}")
        # In real code: await audit_db.insert(...)
        print()


# Example: Statistics tracker
class StatisticsTracker:
    """Tracks violation statistics in real-time."""

    def __init__(self) -> None:
        """Initialize statistics."""
        self.violation_count = 0
        self.acknowledgment_count = 0
        event_bus.subscribe(ViolationCreatedEvent, self.on_violation_created)
        event_bus.subscribe(ViolationAcknowledgedEvent, self.on_violation_acknowledged)

    async def on_violation_created(self, event: ViolationCreatedEvent) -> None:
        """Update statistics when violation is created."""
        self.violation_count += 1
        print(f"[Statistics] Total violations: {self.violation_count}")
        print()

    async def on_violation_acknowledged(self, event: ViolationAcknowledgedEvent) -> None:
        """Update statistics when violation is acknowledged."""
        self.acknowledgment_count += 1
        unacked = self.violation_count - self.acknowledgment_count
        print(f"[Statistics] Total acknowledged: {self.acknowledgment_count}")
        print(f"[Statistics] Unacknowledged: {unacked}")
        print()


# Example: Modified AlertManager that uses event bus
class AlertManager:
    """Alert manager that publishes events instead of calling notifiers directly."""

    async def create_violation(
        self,
        violation_id: int,
        sample_id: int,
        characteristic_id: int,
        rule_id: int,
        rule_name: str,
        severity: str,
    ) -> None:
        """Create a violation and publish event."""
        print(f"\n[AlertManager] Creating violation {violation_id}")

        # Save to database (not shown)
        # ...

        # Publish event - all subscribers will be notified automatically
        await event_bus.publish(
            ViolationCreatedEvent(
                violation_id=violation_id,
                sample_id=sample_id,
                characteristic_id=characteristic_id,
                rule_id=rule_id,
                rule_name=rule_name,
                severity=severity,
            )
        )
        print(f"[AlertManager] Event published\n")

    async def acknowledge_violation(
        self,
        violation_id: int,
        user: str,
        reason: str,
    ) -> None:
        """Acknowledge a violation and publish event."""
        print(f"\n[AlertManager] Acknowledging violation {violation_id}")

        # Update database (not shown)
        # ...

        # Publish event
        await event_bus.publish(
            ViolationAcknowledgedEvent(
                violation_id=violation_id,
                user=user,
                reason=reason,
            )
        )
        print(f"[AlertManager] Event published\n")


async def main() -> None:
    """Run integration example."""
    print("=" * 70)
    print("Event Bus Integration Example: Alert Manager + Multiple Notifiers")
    print("=" * 70)
    print()

    # Initialize all components (they self-subscribe to events)
    print("Initializing components...")
    websocket_notifier = WebSocketNotifier()
    email_notifier = EmailNotifier()
    audit_logger = AuditLogger()
    stats_tracker = StatisticsTracker()
    alert_manager = AlertManager()

    print(f"Subscribers to ViolationCreatedEvent: {event_bus.get_handler_count(ViolationCreatedEvent)}")
    print(
        f"Subscribers to ViolationAcknowledgedEvent: {event_bus.get_handler_count(ViolationAcknowledgedEvent)}"
    )
    print()

    # Scenario 1: Critical violation
    print("=" * 70)
    print("Scenario 1: Critical Violation Detected")
    print("=" * 70)
    await alert_manager.create_violation(
        violation_id=1,
        sample_id=42,
        characteristic_id=101,
        rule_id=1,
        rule_name="Outlier (Beyond 3σ)",
        severity="CRITICAL",
    )

    # Wait for all handlers to complete
    await asyncio.sleep(0.2)

    # Scenario 2: Warning violation (no email sent)
    print("=" * 70)
    print("Scenario 2: Warning Violation Detected")
    print("=" * 70)
    await alert_manager.create_violation(
        violation_id=2,
        sample_id=43,
        characteristic_id=101,
        rule_id=2,
        rule_name="Nine Points One Side",
        severity="WARNING",
    )

    await asyncio.sleep(0.2)

    # Scenario 3: Acknowledge first violation
    print("=" * 70)
    print("Scenario 3: Acknowledging Violation")
    print("=" * 70)
    await alert_manager.acknowledge_violation(
        violation_id=1,
        user="john.doe",
        reason="Tool change performed",
    )

    await asyncio.sleep(0.2)

    # Scenario 4: Another critical violation
    print("=" * 70)
    print("Scenario 4: Another Critical Violation")
    print("=" * 70)
    await alert_manager.create_violation(
        violation_id=3,
        sample_id=44,
        characteristic_id=102,
        rule_id=1,
        rule_name="Outlier (Beyond 3σ)",
        severity="CRITICAL",
    )

    await asyncio.sleep(0.2)

    # Summary
    print("=" * 70)
    print("Summary")
    print("=" * 70)
    print(f"Total violations created: {stats_tracker.violation_count}")
    print(f"Total acknowledged: {stats_tracker.acknowledgment_count}")
    print(f"Unacknowledged: {stats_tracker.violation_count - stats_tracker.acknowledgment_count}")
    print()

    # Cleanup
    await event_bus.shutdown()
    event_bus.clear_handlers()

    print("\n" + "=" * 70)
    print("Benefits of Event Bus Pattern:")
    print("=" * 70)
    print("1. AlertManager doesn't know about WebSocket, Email, or Audit")
    print("2. Can add new notifiers without changing AlertManager")
    print("3. Notifiers can be enabled/disabled independently")
    print("4. Error in one notifier doesn't affect others")
    print("5. Easy to test components in isolation")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
