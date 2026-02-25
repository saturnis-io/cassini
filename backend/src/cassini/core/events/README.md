# OpenSPC Event Bus

Internal event bus implementation for decoupled component communication in OpenSPC.

## Overview

The event bus provides a publish-subscribe pattern that enables loose coupling between different parts of the application. Components can publish domain events without knowing who will handle them, and subscribers can register handlers for specific event types.

## Key Features

- **Type-safe subscriptions**: Handlers are registered for specific event types
- **Multiple handlers**: Multiple handlers can subscribe to the same event type
- **Async by default**: Non-blocking event publishing
- **Error isolation**: Handler failures don't affect other handlers or the publisher
- **Optional synchronous waiting**: Can wait for all handlers to complete when needed
- **Automatic timestamps**: All events include UTC timestamps for audit trails

## Architecture

```
Publisher → EventBus → [Handler 1]
                    → [Handler 2]
                    → [Handler 3]
```

Publishers and subscribers are completely decoupled - they only share knowledge of event types.

## Event Types

### Sample Events
- `SampleProcessedEvent`: Emitted when SPC engine processes a sample
  - Contains: sample_id, characteristic_id, mean, range_value, zone, in_control

### Violation Events
- `ViolationCreatedEvent`: Emitted when a Nelson rule violation is detected
  - Contains: violation_id, sample_id, characteristic_id, rule_id, rule_name, severity
- `ViolationAcknowledgedEvent`: Emitted when a user acknowledges a violation
  - Contains: violation_id, user, reason

### Control Limits Events
- `ControlLimitsUpdatedEvent`: Emitted when control limits are recalculated
  - Contains: characteristic_id, center_line, ucl, lcl, method, sample_count

### Characteristic Events
- `CharacteristicCreatedEvent`: Emitted when a new characteristic is created
  - Contains: characteristic_id, name, hierarchy_id, chart_type
- `CharacteristicUpdatedEvent`: Emitted when characteristic configuration changes
  - Contains: characteristic_id, changes (dict)
- `CharacteristicDeletedEvent`: Emitted when a characteristic is deleted
  - Contains: characteristic_id, name

### Alert Events
- `AlertThresholdExceededEvent`: Emitted when alert thresholds are exceeded
  - Contains: characteristic_id, threshold_type, threshold_value, current_value

## Usage

### Basic Usage

```python
from openspc.core.events import event_bus, SampleProcessedEvent

# Subscribe a handler
async def on_sample_processed(event: SampleProcessedEvent) -> None:
    print(f"Sample {event.sample_id} processed with mean {event.mean}")

event_bus.subscribe(SampleProcessedEvent, on_sample_processed)

# Publish an event (non-blocking)
await event_bus.publish(
    SampleProcessedEvent(
        sample_id=1,
        characteristic_id=101,
        mean=10.5,
        range_value=None,
        zone="zone_c_upper",
        in_control=True
    )
)
```

### Multiple Handlers

```python
# Multiple handlers can subscribe to the same event
event_bus.subscribe(SampleProcessedEvent, log_sample)
event_bus.subscribe(SampleProcessedEvent, broadcast_to_websocket)
event_bus.subscribe(SampleProcessedEvent, update_statistics)

# All handlers will be invoked when event is published
await event_bus.publish(sample_event)
```

### Synchronous Waiting

```python
# Wait for all handlers to complete
errors = await event_bus.publish_and_wait(sample_event)

if errors:
    print(f"{len(errors)} handler(s) failed")
    for error in errors:
        print(f"  {type(error).__name__}: {error}")
```

### Unsubscribing

```python
# Remove a specific handler
event_bus.unsubscribe(SampleProcessedEvent, my_handler)

# Clear all handlers for an event type
event_bus.clear_handlers(SampleProcessedEvent)

# Clear all handlers
event_bus.clear_handlers()
```

### Application Shutdown

```python
# Wait for all pending event handlers to complete
await event_bus.shutdown()
```

## Integration Examples

### SPC Engine Integration

```python
class SPCEngine:
    async def process_sample(self, sample: Sample) -> None:
        # Process sample...
        result = self.calculate_statistics(sample)

        # Publish event
        await event_bus.publish(
            SampleProcessedEvent(
                sample_id=sample.id,
                characteristic_id=sample.char_id,
                mean=result.mean,
                range_value=result.range_value,
                zone=result.zone,
                in_control=result.in_control
            )
        )
```

### Alert Manager Integration

```python
class AlertManager:
    async def create_violation(self, violation: Violation) -> None:
        # Save violation to database...

        # Publish event
        await event_bus.publish(
            ViolationCreatedEvent(
                violation_id=violation.id,
                sample_id=violation.sample_id,
                characteristic_id=characteristic_id,
                rule_id=violation.rule_id,
                rule_name=violation.rule_name,
                severity=violation.severity
            )
        )
```

### WebSocket Broadcasting

```python
# Subscribe to events for real-time updates
async def broadcast_sample(event: SampleProcessedEvent) -> None:
    await websocket_manager.broadcast_to_characteristic(
        event.characteristic_id,
        {
            "type": "sample_processed",
            "data": {
                "sample_id": event.sample_id,
                "mean": event.mean,
                "zone": event.zone,
                "in_control": event.in_control
            }
        }
    )

event_bus.subscribe(SampleProcessedEvent, broadcast_sample)
```

### Audit Logging

```python
async def audit_log_violation(event: ViolationCreatedEvent) -> None:
    await audit_logger.log(
        event_type="violation_created",
        timestamp=event.timestamp,
        data={
            "violation_id": event.violation_id,
            "sample_id": event.sample_id,
            "rule": event.rule_name,
            "severity": event.severity
        }
    )

event_bus.subscribe(ViolationCreatedEvent, audit_log_violation)
```

## Error Handling

The event bus provides automatic error isolation:

```python
async def failing_handler(event: SampleProcessedEvent) -> None:
    raise ValueError("Something went wrong")

async def working_handler(event: SampleProcessedEvent) -> None:
    print("This still executes")

# Both subscribed
event_bus.subscribe(SampleProcessedEvent, failing_handler)
event_bus.subscribe(SampleProcessedEvent, working_handler)

# Publish event
await event_bus.publish(sample_event)

# Result:
# - failing_handler logs error but doesn't crash
# - working_handler executes normally
# - Publisher is not affected
```

Errors are logged automatically with full stack traces for debugging.

## Design Decisions

### Why Not Use External Message Queue?

The event bus is designed for **internal, in-process** communication. For external integrations (e.g., MQTT, message queues), use dedicated adapters that subscribe to events and forward them.

### Why Async?

- Non-blocking event publishing
- Natural fit with FastAPI and async database operations
- Allows concurrent handler execution
- Better resource utilization

### Why Error Isolation?

In a monitoring system, one component failure shouldn't cascade to others. The event bus ensures that:
- Database logging failures don't prevent WebSocket broadcasting
- WebSocket errors don't prevent audit logging
- Publishers never see subscriber errors

### Global vs Dependency Injection

Both patterns are supported:

```python
# Global instance (simpler)
from openspc.core.events import event_bus
await event_bus.publish(event)

# Dependency injection (more testable)
def create_spc_engine(bus: EventBus = Depends(get_event_bus)):
    return SPCEngine(bus)
```

## Testing

### Unit Tests

```python
from openspc.core.events import EventBus, SampleProcessedEvent

async def test_handler_receives_event():
    bus = EventBus()
    received = None

    async def handler(event: SampleProcessedEvent):
        nonlocal received
        received = event

    bus.subscribe(SampleProcessedEvent, handler)

    event = SampleProcessedEvent(
        sample_id=1,
        characteristic_id=1,
        mean=10.5,
        range_value=None,
        zone="zone_c",
        in_control=True
    )

    await bus.publish(event)
    await asyncio.sleep(0.01)  # Let handler execute

    assert received is not None
    assert received.sample_id == 1
```

### Integration Tests

```python
async def test_spc_workflow():
    bus = EventBus()
    events_received = []

    async def track_events(event):
        events_received.append(type(event).__name__)

    bus.subscribe(SampleProcessedEvent, track_events)
    bus.subscribe(ViolationCreatedEvent, track_events)

    # Simulate workflow
    await bus.publish(SampleProcessedEvent(...))
    await bus.publish(ViolationCreatedEvent(...))

    await asyncio.sleep(0.1)

    assert "SampleProcessedEvent" in events_received
    assert "ViolationCreatedEvent" in events_received
```

## Performance Considerations

- **Handler execution**: Handlers run concurrently (within single event loop)
- **Memory**: Each event creates task objects; use shutdown() to clean up
- **Blocking handlers**: Use `asyncio.to_thread()` for CPU-bound work
- **Event volume**: Designed for typical SPC volumes (1-1000 events/sec)

## Migration from Direct Calls

Before (tightly coupled):
```python
class SPCEngine:
    def __init__(self, websocket_manager, alert_manager):
        self.websocket = websocket_manager
        self.alerts = alert_manager

    async def process_sample(self, sample):
        result = self.calculate(sample)
        await self.websocket.broadcast(result)
        await self.alerts.check_violations(result)
```

After (loosely coupled):
```python
class SPCEngine:
    async def process_sample(self, sample):
        result = self.calculate(sample)
        await event_bus.publish(SampleProcessedEvent(...))
        # SPCEngine doesn't know about websockets or alerts!
```

## Further Reading

- See `examples/event_bus_example.py` for complete usage examples
- See `tests/unit/test_event_bus.py` for comprehensive test cases
- See individual event docstrings for detailed attribute information
