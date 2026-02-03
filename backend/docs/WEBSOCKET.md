# WebSocket Infrastructure Documentation

## Overview

The OpenSPC WebSocket infrastructure provides real-time, bidirectional communication between the server and clients. It enables instant notifications for sample updates, violation alerts, and acknowledgment changes without polling.

## Architecture

### Components

1. **ConnectionManager**: Manages WebSocket connections, subscriptions, and message broadcasting
2. **WebSocket Endpoint**: FastAPI endpoint at `/ws` that handles client connections
3. **Notification Helpers**: Convenience functions for broadcasting different message types

### Connection Management

- **Connection Tracking**: Each connection is assigned a unique UUID
- **Subscription-Based**: Clients subscribe to specific characteristic IDs
- **Heartbeat Monitoring**: Automatic cleanup of stale connections after 90 seconds without heartbeat
- **Automatic Reconnection**: Dead connections are detected and removed during broadcasts

## Message Protocol

### Client → Server Messages

#### Subscribe
Subscribe to updates for specific characteristics:
```json
{
  "type": "subscribe",
  "characteristic_ids": [1, 2, 3]
}
```

Server responds with:
```json
{
  "type": "subscribed",
  "characteristic_ids": [1, 2, 3]
}
```

#### Unsubscribe
Unsubscribe from specific characteristics:
```json
{
  "type": "unsubscribe",
  "characteristic_ids": [1]
}
```

Server responds with:
```json
{
  "type": "unsubscribed",
  "characteristic_ids": [1]
}
```

#### Ping (Heartbeat)
Keep connection alive:
```json
{
  "type": "ping"
}
```

Server responds with:
```json
{
  "type": "pong"
}
```

### Server → Client Messages

#### Sample Update
Broadcast when a new sample is processed:
```json
{
  "type": "sample",
  "payload": {
    "sample_id": 123,
    "characteristic_id": 1,
    "timestamp": "2026-02-02T12:00:00Z",
    "value": 10.5,
    "zone": "zone_c_upper",
    "in_control": true
  }
}
```

#### Violation Alert
Broadcast when a Nelson Rule is violated:
```json
{
  "type": "violation",
  "payload": {
    "violation_id": 456,
    "characteristic_id": 1,
    "sample_id": 123,
    "rule_id": 1,
    "rule_name": "One point beyond 3 sigma",
    "severity": "CRITICAL"
  }
}
```

#### Acknowledgment Update
Broadcast when a violation is acknowledged:
```json
{
  "type": "ack_update",
  "payload": {
    "violation_id": 456,
    "characteristic_id": 1,
    "acknowledged": true,
    "ack_user": "operator1",
    "ack_reason": "Process adjusted"
  }
}
```

#### Error
Sent when a client message is invalid:
```json
{
  "type": "error",
  "message": "Message must contain 'type' field"
}
```

## Usage

### Connecting to WebSocket

**JavaScript (Browser)**
```javascript
const ws = new WebSocket('ws://localhost:8000/ws');

ws.onopen = () => {
  console.log('Connected!');

  // Subscribe to characteristics
  ws.send(JSON.stringify({
    type: 'subscribe',
    characteristic_ids: [1, 2, 3]
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'sample':
      console.log('New sample:', message.payload);
      break;
    case 'violation':
      console.log('Violation detected:', message.payload);
      break;
    case 'ack_update':
      console.log('Acknowledgment update:', message.payload);
      break;
  }
};

// Send heartbeat every 30 seconds
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);
```

**Python (websockets library)**
```python
import asyncio
import json
import websockets

async def client():
    uri = "ws://localhost:8000/ws"
    async with websockets.connect(uri) as websocket:
        # Subscribe
        await websocket.send(json.dumps({
            "type": "subscribe",
            "characteristic_ids": [1, 2, 3]
        }))

        # Listen for updates
        async for message in websocket:
            data = json.loads(message)
            print(f"Received: {data['type']}")

asyncio.run(client())
```

### Broadcasting Notifications

**From API Endpoints**
```python
from openspc.api.v1.websocket import (
    notify_sample,
    notify_violation,
    notify_acknowledgment,
)

# In your sample processing endpoint
await notify_sample(
    char_id=characteristic.id,
    sample_id=sample.id,
    timestamp=sample.timestamp,
    value=mean_value,
    zone=zone_classification,
    in_control=is_in_control,
)

# When a violation is detected
await notify_violation(
    char_id=characteristic.id,
    violation_id=violation.id,
    sample_id=sample.id,
    rule_id=rule.id,
    rule_name=rule.name,
    severity=violation.severity,
)

# When a violation is acknowledged
await notify_acknowledgment(
    char_id=characteristic.id,
    violation_id=violation.id,
    acknowledged=True,
    ack_user=user.id,
    ack_reason=reason,
)
```

## Connection Manager API

### Methods

#### `async start()`
Start background cleanup task. Should be called during application startup.

#### `async stop()`
Stop background cleanup task. Should be called during application shutdown.

#### `async connect(websocket: WebSocket, connection_id: str)`
Accept and register a new WebSocket connection.

#### `async disconnect(connection_id: str)`
Remove a connection and clean up all subscriptions.

#### `async subscribe(connection_id: str, characteristic_ids: list[int])`
Subscribe a connection to specific characteristics.

#### `async unsubscribe(connection_id: str, characteristic_ids: list[int])`
Unsubscribe a connection from specific characteristics.

#### `async broadcast_to_characteristic(char_id: int, message: dict)`
Send a message to all subscribers of a characteristic.

#### `async broadcast_to_all(message: dict)`
Send a message to all connected clients.

#### `update_heartbeat(connection_id: str)`
Update the last heartbeat timestamp for a connection.

#### `get_connection_count() -> int`
Get the total number of active connections.

#### `get_subscription_count(char_id: int) -> int`
Get the number of subscribers for a specific characteristic.

#### `get_subscribed_characteristics(connection_id: str) -> set[int]`
Get the set of characteristics a connection is subscribed to.

## Configuration

### Heartbeat Settings

The ConnectionManager accepts two configuration parameters:

```python
manager = ConnectionManager(
    heartbeat_interval=30,  # Seconds between cleanup checks
    heartbeat_timeout=90,   # Seconds before considering connection stale
)
```

Default values:
- `heartbeat_interval`: 30 seconds
- `heartbeat_timeout`: 90 seconds

Clients should send ping messages at least every 60 seconds to ensure they aren't disconnected.

## Testing

### Unit Tests

The WebSocket infrastructure includes comprehensive unit tests:

```bash
pytest tests/unit/test_websocket.py -v
```

Test coverage includes:
- Connection management
- Subscription/unsubscription
- Message broadcasting
- Heartbeat mechanism
- Dead connection cleanup
- Edge cases and error handling

### Integration Testing

Use the provided example client:

```bash
# Terminal 1: Start the server
uvicorn openspc.main:app --reload

# Terminal 2: Run the WebSocket client
python examples/websocket_example.py

# Terminal 3: Submit samples via API
curl -X POST http://localhost:8000/api/v1/samples \
  -H "Content-Type: application/json" \
  -d '{
    "characteristic_id": 1,
    "measurements": [10.5, 10.6, 10.4]
  }'
```

## Best Practices

### Client Implementation

1. **Heartbeat**: Send ping messages every 30-60 seconds
2. **Reconnection**: Implement automatic reconnection on disconnect
3. **Subscription Management**: Subscribe only to needed characteristics
4. **Error Handling**: Handle connection errors gracefully
5. **Message Validation**: Validate message structure before processing

### Server Integration

1. **Notification Timing**: Call notification functions after database commit
2. **Error Handling**: Wrap notifications in try-catch to prevent disrupting main flow
3. **Performance**: Notifications are async and non-blocking
4. **Characteristic Filtering**: Only broadcast to subscribers of affected characteristics

## Performance Considerations

### Scalability

- **Per-Characteristic Subscriptions**: Reduces unnecessary message traffic
- **Async Broadcasting**: Non-blocking message delivery
- **Dead Connection Cleanup**: Automatic removal of stale connections
- **Efficient Data Structures**: O(1) lookups for connection and subscription management

### Resource Usage

- **Memory**: ~1KB per active connection (approximate)
- **CPU**: Minimal overhead for message routing
- **Network**: Only sends messages to subscribed clients

## Troubleshooting

### Connection Drops

**Problem**: Client connections dropping frequently

**Solutions**:
1. Ensure client sends ping messages regularly
2. Check network stability
3. Increase `heartbeat_timeout` if necessary

### No Messages Received

**Problem**: Client connected but not receiving updates

**Solutions**:
1. Verify subscription was confirmed
2. Check characteristic IDs match samples being submitted
3. Confirm server is broadcasting notifications

### Memory Leaks

**Problem**: Server memory usage growing over time

**Solutions**:
1. Ensure `ws_manager.stop()` is called on shutdown
2. Verify dead connections are being cleaned up
3. Check for exceptions in cleanup loop

## Future Enhancements

Possible improvements for future versions:

1. **Authentication**: JWT token-based WebSocket authentication
2. **Compression**: Enable WebSocket message compression
3. **Rate Limiting**: Prevent message flooding from clients
4. **Reconnection Tokens**: Allow clients to resume subscriptions
5. **Binary Protocol**: Use binary format for better performance
6. **Room-Based Broadcasting**: Subscribe to facility/line/characteristic groups
7. **Message History**: Buffer recent messages for new subscribers
8. **Metrics**: Track connection counts, message rates, and latency

## References

- [FastAPI WebSocket Documentation](https://fastapi.tiangolo.com/advanced/websockets/)
- [WebSocket Protocol RFC 6455](https://tools.ietf.org/html/rfc6455)
- [websockets Python Library](https://websockets.readthedocs.io/)
