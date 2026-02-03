# BE-013: Alert Manager

## Overview
The AlertManager provides violation creation, acknowledgment workflow, and notification broadcasting for OpenSPC.

## Features
- ✅ Create violation records from rule evaluation results
- ✅ Only process triggered rules
- ✅ Acknowledgment workflow with reason codes
- ✅ Optional sample exclusion on acknowledgment
- ✅ Notification broadcasting via pluggable notifiers
- ✅ Violation statistics for dashboards
- ✅ Standard reason codes

## Architecture

### Components

1. **AlertManager**: Main service class for violation management
2. **AlertNotifier Protocol**: Interface for notification broadcasting
3. **ViolationCreated Event**: Emitted when violations are created
4. **ViolationAcknowledged Event**: Emitted when violations are acknowledged
5. **ViolationStats**: Aggregated statistics for dashboards

### Design Pattern
The AlertManager uses the **Observer Pattern** for notification broadcasting. Notifiers implement the `AlertNotifier` protocol and are called when events occur.

## Usage

### Basic Usage

```python
from openspc.core.alerts import AlertManager
from openspc.db.repositories import ViolationRepository, SampleRepository

# Initialize
alert_manager = AlertManager(
    violation_repo=violation_repo,
    sample_repo=sample_repo,
)

# Add notifiers (optional)
alert_manager.add_notifier(websocket_notifier)
alert_manager.add_notifier(mqtt_notifier)

# Create violations from rule results
violations = await alert_manager.create_violations(
    sample_id=42,
    characteristic_id=1,
    rule_results=rule_results,  # From Nelson Rules evaluation
)

# Acknowledge a violation
violation = await alert_manager.acknowledge(
    violation_id=1,
    user="john.doe",
    reason="Tool Change",
    exclude_sample=True,  # Optional: exclude sample from control limits
)
```

### Integration with SPCEngine

The AlertManager is designed to replace the violation creation logic in SPCEngine:

**Before (SPCEngine creates violations directly):**
```python
# In SPCEngine._create_violations()
for result in rule_results:
    if not result.triggered:
        continue

    violation = Violation(
        sample_id=sample_id,
        rule_id=result.rule_id,
        rule_name=result.rule_name,
        severity=result.severity.value,
        acknowledged=False,
    )
    self._sample_repo.session.add(violation)
```

**After (Using AlertManager):**
```python
# In SPCEngine initialization
self._alert_manager = AlertManager(
    violation_repo=violation_repo,
    sample_repo=sample_repo,
)

# In SPCEngine.process_sample()
violations = await self._alert_manager.create_violations(
    sample_id=sample.id,
    characteristic_id=characteristic_id,
    rule_results=rule_results,
)
```

### Creating Custom Notifiers

Implement the `AlertNotifier` protocol:

```python
from openspc.core.alerts import AlertNotifier, ViolationCreated, ViolationAcknowledged

class WebSocketNotifier:
    """Broadcast alerts via WebSocket."""

    def __init__(self, websocket_manager):
        self.ws_manager = websocket_manager

    async def notify_violation_created(self, event: ViolationCreated) -> None:
        """Broadcast new violation."""
        await self.ws_manager.broadcast({
            "type": "violation_created",
            "violation_id": event.violation_id,
            "sample_id": event.sample_id,
            "characteristic_id": event.characteristic_id,
            "rule_name": event.rule_name,
            "severity": event.severity,
            "timestamp": event.timestamp.isoformat(),
        })

    async def notify_violation_acknowledged(self, event: ViolationAcknowledged) -> None:
        """Broadcast acknowledgment."""
        await self.ws_manager.broadcast({
            "type": "violation_acknowledged",
            "violation_id": event.violation_id,
            "user": event.user,
            "reason": event.reason,
            "timestamp": event.timestamp.isoformat(),
        })

# Register with AlertManager
alert_manager.add_notifier(WebSocketNotifier(ws_manager))
```

### Getting Statistics

```python
# Get total unacknowledged count
count = await alert_manager.get_unacknowledged_count()

# Get count for specific characteristic
count = await alert_manager.get_unacknowledged_count(characteristic_id=1)

# Get detailed statistics
stats = await alert_manager.get_violation_stats(
    characteristic_id=1,
    start_date=datetime(2026, 1, 1),
    end_date=datetime(2026, 1, 31),
)

print(f"Total: {stats.total}")
print(f"Unacknowledged: {stats.unacknowledged}")
print(f"By rule: {stats.by_rule}")
print(f"By severity: {stats.by_severity}")
```

### Standard Reason Codes

```python
from openspc.core.alerts import REASON_CODES

# Get list of standard reason codes
codes = REASON_CODES
# ['Tool Change', 'Raw Material Change', 'Setup Adjustment', ...]

# Or via AlertManager
codes = AlertManager.get_reason_codes()
```

## API Reference

### AlertManager

#### `__init__(violation_repo, sample_repo, notifiers=None)`
Initialize AlertManager.

**Parameters:**
- `violation_repo`: ViolationRepository instance
- `sample_repo`: SampleRepository instance
- `notifiers`: Optional list of AlertNotifier instances

#### `add_notifier(notifier: AlertNotifier) -> None`
Add a notifier for event broadcasting.

#### `create_violations(sample_id, characteristic_id, rule_results) -> list[Violation]`
Create violation records for triggered rules.

**Parameters:**
- `sample_id`: ID of the sample that triggered violations
- `characteristic_id`: ID of the characteristic being monitored
- `rule_results`: List of RuleResult from Nelson Rules evaluation

**Returns:** List of created Violation records

**Raises:** `ValueError` if sample not found

#### `acknowledge(violation_id, user, reason, exclude_sample=False) -> Violation`
Acknowledge a violation.

**Parameters:**
- `violation_id`: ID of violation to acknowledge
- `user`: User performing acknowledgment
- `reason`: Reason code or description
- `exclude_sample`: If True, mark associated sample as excluded

**Returns:** Updated Violation record

**Raises:**
- `ValueError` if violation not found
- `ValueError` if already acknowledged

#### `get_unacknowledged_count(characteristic_id=None) -> int`
Get count of unacknowledged violations.

**Parameters:**
- `characteristic_id`: Optional characteristic ID filter

**Returns:** Count of unacknowledged violations

#### `get_violation_stats(characteristic_id=None, start_date=None, end_date=None) -> ViolationStats`
Get violation statistics for dashboard.

**Parameters:**
- `characteristic_id`: Optional characteristic ID filter
- `start_date`: Optional start of date range
- `end_date`: Optional end of date range

**Returns:** ViolationStats with aggregated data

#### `get_reason_codes() -> list[str]`
Static method to get list of standard reason codes.

### AlertNotifier Protocol

```python
class AlertNotifier(Protocol):
    async def notify_violation_created(self, event: ViolationCreated) -> None: ...
    async def notify_violation_acknowledged(self, event: ViolationAcknowledged) -> None: ...
```

### ViolationCreated Event

```python
@dataclass
class ViolationCreated:
    violation_id: int
    sample_id: int
    characteristic_id: int
    rule_id: int
    rule_name: str
    severity: str
    timestamp: datetime
```

### ViolationAcknowledged Event

```python
@dataclass
class ViolationAcknowledged:
    violation_id: int
    user: str
    reason: str
    timestamp: datetime
```

### ViolationStats

```python
@dataclass
class ViolationStats:
    total: int
    unacknowledged: int
    by_rule: dict[int, int]  # rule_id -> count
    by_severity: dict[str, int]  # severity -> count
```

## Standard Reason Codes

The following standard reason codes are provided:

1. Tool Change
2. Raw Material Change
3. Setup Adjustment
4. Measurement Error
5. Process Adjustment
6. Environmental Factor
7. Operator Error
8. Equipment Malfunction
9. False Alarm
10. Under Investigation
11. Other

## Testing

Comprehensive unit tests are provided in `tests/unit/test_alert_manager.py`:

```bash
# Run AlertManager tests
pytest tests/unit/test_alert_manager.py -v

# Run with coverage
pytest tests/unit/test_alert_manager.py --cov=openspc.core.alerts
```

## Implementation Notes

### Thread Safety
The AlertManager is designed for use with AsyncIO and SQLAlchemy async sessions. Multiple concurrent operations are safe as long as separate sessions are used per request/operation.

### Transaction Management
The AlertManager uses the session from the provided repositories. It calls `flush()` to persist changes but does not commit. The caller is responsible for transaction management (commit/rollback).

### Notifier Execution
Notifiers are called sequentially in the order they were added. If a notifier raises an exception, subsequent notifiers will not be called. Consider implementing error handling in your notifiers.

### Performance
- Violation creation: O(n) where n = number of triggered rules
- Statistics queries: Uses efficient database aggregation
- Notifiers: Called synchronously, consider async patterns for high throughput

## Future Enhancements

Possible future improvements:

1. **Batch Operations**: Add `create_violations_batch()` for processing multiple samples
2. **Notification Queue**: Add async queue for notifiers to prevent blocking
3. **Event Store**: Add event sourcing for audit trail
4. **Alert Rules**: Add configurable alert rules (e.g., "notify if >5 unacknowledged")
5. **Escalation**: Add escalation policies for unacknowledged violations
6. **Notification Templates**: Add templating for email/SMS notifications

## Related Documentation

- [BE-005: Nelson Rules](BE-005-Nelson-Rules.md)
- [BE-006: Violation Repository](BE-006-Violation-Repository.md)
- [BE-010: SPC Engine](BE-010-SPC-Engine.md)
