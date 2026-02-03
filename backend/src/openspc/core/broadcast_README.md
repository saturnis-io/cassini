# Real-Time Broadcasting Module

This module provides real-time event broadcasting via WebSockets for OpenSPC.

## Quick Start

The broadcaster is automatically initialized during application startup and requires no manual configuration.

```python
# Already wired in main.py - no action needed
from openspc.core.broadcast import WebSocketBroadcaster
from openspc.core.events import event_bus
from openspc.api.v1.websocket import manager as ws_manager

# Application startup creates and wires the broadcaster
broadcaster = WebSocketBroadcaster(ws_manager, event_bus)
```

## Event Flow

```
Domain Event → Event Bus → WebSocketBroadcaster → Connection Manager → WebSocket Clients
```

## Supported Events

| Event Type | Source | Broadcast Destination |
|------------|--------|----------------------|
| Sample Processed | SPC Engine | Characteristic subscribers |
| Violation Created | Alert Manager | Characteristic subscribers |
| Violation Acknowledged | Alert Manager | All connected clients |
| Control Limits Updated | Control Limit Service | Characteristic subscribers |

## Message Format

All WebSocket messages follow this format:

```json
{
  "type": "sample|violation|ack_update|control_limits",
  "payload": {
    // Event-specific data
  }
}
```

See full documentation in `backend/docs/BE-019-Real-Time-Broadcasting.md`

## Architecture

- **WebSocketBroadcaster** (`broadcast.py`): Main broadcaster class
- **EventBus** (`core/events/`): Internal event bus
- **ConnectionManager** (`api/v1/websocket.py`): WebSocket connection management
- **AlertNotifier Protocol** (`core/alerts/manager.py`): Interface for alert broadcasting

## Testing

```bash
# Run unit tests
pytest tests/unit/test_broadcast.py -v

# Run integration tests
pytest tests/integration/test_broadcast_integration.py -v

# Run all broadcasting tests
pytest tests/unit/test_broadcast.py tests/integration/test_broadcast_integration.py -v
```

## Key Design Principles

1. **Decoupling**: Components publish events without knowing about WebSocket clients
2. **Error Isolation**: Broadcaster failures don't affect domain operations
3. **Async Non-blocking**: Event publishing doesn't block the main processing flow
4. **Protocol-based**: Uses `AlertNotifier` protocol for extensibility

## Extending the Broadcaster

To add a new notifier (e.g., email, MQTT):

```python
from openspc.core.alerts.manager import AlertNotifier, ViolationCreated, ViolationAcknowledged

class EmailNotifier(AlertNotifier):
    async def notify_violation_created(self, event: ViolationCreated) -> None:
        # Send email notification
        pass

    async def notify_violation_acknowledged(self, event: ViolationAcknowledged) -> None:
        # Send email notification
        pass

# Register in main.py or deps.py
alert_manager.add_notifier(email_notifier)
```

## Troubleshooting

**Events not being broadcast:**
- Check that `WebSocketBroadcaster` is initialized in `main.py`
- Verify Event Bus subscriptions: `event_bus.get_handler_count(SampleProcessedEvent)`
- Enable debug logging: `logging.getLogger('openspc.core.broadcast').setLevel(logging.DEBUG)`

**WebSocket connection issues:**
- Verify `ws_manager` is started during application startup
- Check client subscription: Client must send `{"type": "subscribe", "characteristic_ids": [...]}`
- Monitor heartbeat: Clients should send ping every 30 seconds

**Performance issues:**
- Consider implementing message batching for high-frequency events
- Check connection count: `ws_manager.get_connection_count()`
- Monitor event bus task queue: `len(event_bus._running_tasks)`
