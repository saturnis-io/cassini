# BE-019: Real-Time Broadcasting Implementation

## Overview

This document describes the implementation of real-time event broadcasting for OpenSPC, which enables WebSocket clients to receive live updates about samples, violations, acknowledgments, and control limit changes.

## Architecture

The broadcasting system consists of three main components:

1. **Event Bus**: Publishes domain events within the application
2. **WebSocket Broadcaster**: Subscribes to events and broadcasts to WebSocket clients
3. **WebSocket Connection Manager**: Manages client connections and subscriptions

```
┌─────────────────┐
│   SPC Engine    │──────┐
└─────────────────┘      │
                         │
┌─────────────────┐      │    ┌──────────────┐
│ Control Limit   │──────┼───>│  Event Bus   │
│    Service      │      │    └──────────────┘
└─────────────────┘      │           │
                         │           │
┌─────────────────┐      │           v
│ Alert Manager   │──────┘    ┌──────────────────┐
└─────────────────┘           │   WebSocket      │
                              │   Broadcaster    │
                              └──────────────────┘
                                      │
                                      v
                              ┌──────────────────┐
                              │   Connection     │
                              │    Manager       │
                              └──────────────────┘
                                      │
                                      v
                              ┌──────────────────┐
                              │  WebSocket       │
                              │   Clients        │
                              └──────────────────┘
```

## Implementation Details

### 1. WebSocketBroadcaster (`backend/src/openspc/core/broadcast.py`)

The `WebSocketBroadcaster` class acts as a bridge between the internal event bus and external WebSocket clients.

**Key Features:**
- Implements `AlertNotifier` protocol for integration with `AlertManager`
- Subscribes to `SampleProcessedEvent` and `ControlLimitsUpdatedEvent` from Event Bus
- Translates domain events into WebSocket message format
- Routes messages to appropriate subscribers

**Event Handling:**

| Event Type | Source | WebSocket Message Type | Broadcast Scope |
|------------|--------|------------------------|-----------------|
| `SampleProcessedEvent` | SPC Engine | `sample` | Characteristic subscribers |
| `ViolationCreatedEvent` | Alert Manager | `violation` | Characteristic subscribers |
| `ViolationAcknowledgedEvent` | Alert Manager | `ack_update` | All connected clients |
| `ControlLimitsUpdatedEvent` | Control Limit Service | `control_limits` | Characteristic subscribers |

### 2. Event Publishing Integration

#### SPC Engine (`backend/src/openspc/core/engine/spc_engine.py`)

**Changes:**
- Added `event_bus` parameter to constructor (optional, uses global instance if not provided)
- Publishes `SampleProcessedEvent` after processing each sample
- Event includes: `sample_id`, `characteristic_id`, `mean`, `range_value`, `zone`, `in_control`, `timestamp`

**Code Location:**
```python
# Step 8: Publish SampleProcessedEvent to Event Bus (line ~230)
event = SampleProcessedEvent(
    sample_id=sample.id,
    characteristic_id=characteristic_id,
    mean=mean,
    range_value=range_value,
    zone=window_sample.zone.value,
    in_control=len(violations) == 0,
    timestamp=sample.timestamp,
)
await self._event_bus.publish(event)
```

#### Control Limit Service (`backend/src/openspc/core/engine/control_limits.py`)

**Changes:**
- Added `event_bus` parameter to constructor (optional, uses global instance if not provided)
- Publishes `ControlLimitsUpdatedEvent` after persisting new limits
- Event includes: `characteristic_id`, `center_line`, `ucl`, `lcl`, `method`, `sample_count`, `timestamp`

**Code Location:**
```python
# Publish ControlLimitsUpdatedEvent to Event Bus (line ~225)
event = ControlLimitsUpdatedEvent(
    characteristic_id=characteristic_id,
    center_line=result.center_line,
    ucl=result.ucl,
    lcl=result.lcl,
    method=result.method,
    sample_count=result.sample_count,
    timestamp=result.calculated_at,
)
await self._event_bus.publish(event)
```

#### Alert Manager Integration

**Changes:**
- Modified `get_alert_manager` dependency in `backend/src/openspc/api/deps.py`
- Automatically wires `WebSocketBroadcaster` as a notifier when available in app state
- No changes required to `AlertManager` code - uses existing `AlertNotifier` protocol

### 3. Application Wiring (`backend/src/openspc/main.py`)

**Startup Sequence:**
1. Initialize database connection
2. Start WebSocket connection manager
3. Create `WebSocketBroadcaster` instance
4. Store broadcaster in `app.state` for access by dependencies
5. Broadcaster automatically subscribes to Event Bus

**Shutdown Sequence:**
1. Wait for pending event handlers to complete (`event_bus.shutdown()`)
2. Stop WebSocket connection manager
3. Dispose database connection

## WebSocket Message Formats

### Sample Event
```json
{
  "type": "sample",
  "payload": {
    "sample_id": 42,
    "characteristic_id": 1,
    "timestamp": "2024-01-15T10:30:00",
    "value": 10.5,
    "zone": "zone_c_upper",
    "in_control": true
  }
}
```

### Violation Event
```json
{
  "type": "violation",
  "payload": {
    "violation_id": 10,
    "sample_id": 42,
    "characteristic_id": 1,
    "rule_id": 1,
    "rule_name": "Outlier",
    "severity": "CRITICAL",
    "timestamp": "2024-01-15T10:30:00"
  }
}
```

### Acknowledgment Update
```json
{
  "type": "ack_update",
  "payload": {
    "violation_id": 10,
    "acknowledged": true,
    "user": "john.doe",
    "reason": "Tool Change",
    "timestamp": "2024-01-15T11:00:00"
  }
}
```

### Control Limits Update
```json
{
  "type": "control_limits",
  "payload": {
    "characteristic_id": 1,
    "center_line": 100.0,
    "ucl": 103.0,
    "lcl": 97.0,
    "method": "moving_range",
    "sample_count": 50
  }
}
```

## Testing

### Unit Tests (`backend/tests/unit/test_broadcast.py`)

Tests for `WebSocketBroadcaster` class:
- Event subscription initialization
- Sample event broadcasting
- Control limits event broadcasting
- Violation event broadcasting (AlertNotifier protocol)
- Acknowledgment broadcasting (AlertNotifier protocol)
- Multiple events in sequence
- Broadcasting to different characteristics
- Error handling and isolation

**Run Tests:**
```bash
cd backend
pytest tests/unit/test_broadcast.py -v
```

### Integration Tests (`backend/tests/integration/test_broadcast_integration.py`)

End-to-end tests for event flow:
- Sample events through Event Bus to WebSocket
- Control limits events through Event Bus to WebSocket
- Violations through AlertManager to WebSocket
- Acknowledgments through AlertManager to WebSocket
- Multiple events in sequence
- Multiple notifiers coexisting
- Error isolation

**Run Tests:**
```bash
cd backend
pytest tests/integration/test_broadcast_integration.py -v
```

## Client Usage Example

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8000/api/v1/ws');

// Subscribe to characteristic updates
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    characteristic_ids: [1, 2, 3]
  }));
};

// Handle incoming messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'sample':
      console.log('New sample:', message.payload);
      updateChart(message.payload);
      break;

    case 'violation':
      console.log('Violation detected:', message.payload);
      showAlert(message.payload);
      break;

    case 'ack_update':
      console.log('Violation acknowledged:', message.payload);
      updateViolationStatus(message.payload);
      break;

    case 'control_limits':
      console.log('Control limits updated:', message.payload);
      updateChartLimits(message.payload);
      break;

    default:
      console.log('Unknown message type:', message.type);
  }
};

// Send heartbeat to keep connection alive
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);
```

## Performance Considerations

1. **Event Bus Async Publishing**: Events are published asynchronously and don't block the main processing flow
2. **Error Isolation**: Failures in broadcaster don't affect the SPC engine or other components
3. **Subscription Filtering**: Only subscribed clients receive characteristic-specific events
4. **Connection Cleanup**: Stale connections are automatically cleaned up by heartbeat mechanism

## Configuration

No additional configuration is required. The broadcaster uses:
- Global `event_bus` instance from `openspc.core.events`
- Global `manager` instance from `openspc.api.v1.websocket`

Both are automatically wired during application startup.

## Monitoring and Debugging

**Logging:**
The broadcaster logs at different levels:
- `INFO`: Violation events and control limit updates
- `DEBUG`: Sample events and subscription setup
- `ERROR`: Broadcast failures (logged by Event Bus)

**Enable Debug Logging:**
```python
import logging
logging.getLogger('openspc.core.broadcast').setLevel(logging.DEBUG)
logging.getLogger('openspc.core.events').setLevel(logging.DEBUG)
```

## Future Enhancements

Potential improvements for future iterations:

1. **Message Batching**: Batch multiple events within a configurable time window
2. **Rate Limiting**: Limit broadcast rate for high-frequency characteristics
3. **Message Filtering**: Allow clients to filter by severity or rule type
4. **Replay Buffer**: Store recent events for new clients to catch up
5. **Metrics**: Track broadcast latency and delivery rates
6. **Compression**: Compress messages for bandwidth efficiency

## Acceptance Criteria Status

- [x] New samples broadcast to subscribed clients
- [x] New violations broadcast with severity
- [x] Acknowledgment updates broadcast to all
- [x] Control limit changes broadcast
- [x] Event Bus properly wired to broadcaster
- [x] AlertNotifier protocol implemented
- [x] Unit tests written and passing
- [x] Integration tests written and passing
- [x] Documentation complete

## Files Created/Modified

### Created
1. `backend/src/openspc/core/broadcast.py` - WebSocketBroadcaster implementation
2. `backend/tests/unit/test_broadcast.py` - Unit tests
3. `backend/tests/integration/test_broadcast_integration.py` - Integration tests
4. `backend/docs/BE-019-Real-Time-Broadcasting.md` - This documentation

### Modified
1. `backend/src/openspc/core/engine/spc_engine.py` - Added event publishing
2. `backend/src/openspc/core/engine/control_limits.py` - Added event publishing
3. `backend/src/openspc/main.py` - Application wiring and lifecycle
4. `backend/src/openspc/api/deps.py` - Wired broadcaster to AlertManager
5. `backend/tests/unit/test_spc_engine.py` - Updated fixture for event_bus

## Conclusion

The real-time broadcasting feature is now fully implemented and tested. The system provides a clean, decoupled architecture that allows domain events to be broadcast to WebSocket clients without tight coupling between components. The implementation follows best practices for error handling, logging, and testing.
