# Nelson Rules Quick Reference

## Overview

The Nelson Rules module provides 8 statistical tests for detecting non-random patterns in control charts. These rules help identify when a process has gone out of control.

## Quick Start

```python
from openspc.core.engine import NelsonRuleLibrary, RollingWindow, ZoneBoundaries

# Create library (reuse for multiple checks)
library = NelsonRuleLibrary()

# Populate your RollingWindow with samples
window = RollingWindow(max_size=25)
window.set_boundaries(boundaries)
# ... add samples ...

# Check all rules
violations = library.check_all(window)

# Process violations
for violation in violations:
    if violation.severity == Severity.CRITICAL:
        # Immediate action required
        alert_operator(violation)
    else:
        # Log warning
        log_warning(violation)
```

## The 8 Rules

### Rule 1: Outlier (CRITICAL)
**One point beyond 3σ from center**
- **When to alert**: Immediately - indicates special cause
- **Possible causes**: Equipment failure, measurement error, operator error
- **Action**: Stop process, investigate immediately

### Rule 2: Shift (WARNING)
**Nine points in a row on same side of center**
- **When to alert**: Process mean has shifted
- **Possible causes**: New material, different operator, tool wear
- **Action**: Investigate cause of shift, adjust process if needed

### Rule 3: Trend (WARNING)
**Six points in a row all increasing OR all decreasing**
- **When to alert**: Gradual process change detected
- **Possible causes**: Tool wear, temperature drift, material degradation
- **Action**: Preventive maintenance, adjust process parameters

### Rule 4: Alternator (WARNING)
**Fourteen points alternating up and down**
- **When to alert**: Systematic variation detected
- **Possible causes**: Two different machines/operators alternating
- **Action**: Check for alternating conditions in process

### Rule 5: Zone A Warning (WARNING)
**2 out of 3 consecutive points in Zone A or beyond (same side)**
- **When to alert**: Early warning of mean shift
- **Possible causes**: Process variation increasing
- **Action**: Investigate before it becomes critical

### Rule 6: Zone B Warning (WARNING)
**4 out of 5 consecutive points in Zone B or beyond (same side)**
- **When to alert**: Mean may be shifting
- **Possible causes**: Gradual process change
- **Action**: Monitor closely, investigate if continues

### Rule 7: Stratification (WARNING)
**15 consecutive points within Zone C (< 1σ)**
- **When to alert**: Data appears too good
- **Possible causes**: Control limits too wide, data smoothing, mixing samples
- **Action**: Recalculate control limits, check data collection method

### Rule 8: Mixture (WARNING)
**8 consecutive points outside Zone C (> 1σ on either side)**
- **When to alert**: Two populations detected
- **Possible causes**: Multiple processes mixed, different materials
- **Action**: Separate processes, use different control charts

## API Reference

### NelsonRuleLibrary

```python
library = NelsonRuleLibrary()
```

**Methods:**

- `check_all(window, enabled_rules=None) -> list[RuleResult]`
  - Check all enabled rules
  - `enabled_rules`: Optional set of rule IDs (1-8) to check
  - Returns list of violations

- `check_single(window, rule_id) -> RuleResult | None`
  - Check a specific rule
  - Returns violation or None

- `get_rule(rule_id) -> NelsonRule | None`
  - Get rule instance by ID
  - Returns rule or None if not found

### RuleResult

```python
@dataclass
class RuleResult:
    rule_id: int                    # 1-8
    rule_name: str                  # "Outlier", "Shift", etc.
    triggered: bool                 # Always True in results
    severity: Severity              # WARNING or CRITICAL
    involved_sample_ids: list[int]  # Sample IDs causing violation
    message: str                    # Human-readable description
```

### Severity

```python
class Severity(Enum):
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
```

## Usage Patterns

### Check Only Critical Rules

```python
violations = library.check_all(window, enabled_rules={1})
```

### Check Common Rules

```python
# Most common rules (Western Electric)
violations = library.check_all(window, enabled_rules={1, 2, 3, 4})
```

### Check All Rules

```python
violations = library.check_all(window)
```

### React to Specific Rules

```python
violations = library.check_all(window)

for v in violations:
    if v.rule_id == 1:
        # Critical - stop process
        stop_process()
        alert_supervisor(v.message)
    elif v.rule_id in {2, 3}:
        # Process shift/trend - adjust
        log_warning(v.message)
        notify_operator()
    else:
        # Log other warnings
        log_warning(v.message)
```

### Custom Notification

```python
violations = library.check_all(window)

for v in violations:
    notification = {
        'rule_id': v.rule_id,
        'rule_name': v.rule_name,
        'severity': v.severity.value,
        'message': v.message,
        'sample_ids': v.involved_sample_ids,
        'timestamp': datetime.utcnow()
    }
    send_notification(notification)
```

## Integration with RollingWindow

The Nelson Rules work seamlessly with the existing RollingWindow:

```python
from openspc.core.engine import RollingWindow, WindowSample, Zone, ZoneBoundaries
from datetime import datetime

# Create boundaries
boundaries = ZoneBoundaries(
    center_line=100.0,
    plus_1_sigma=110.0,
    plus_2_sigma=120.0,
    plus_3_sigma=130.0,
    minus_1_sigma=90.0,
    minus_2_sigma=80.0,
    minus_3_sigma=70.0,
    sigma=10.0
)

# Create and configure window
window = RollingWindow(max_size=25)
window.set_boundaries(boundaries)

# Add samples (let window classify them)
zone, is_above, sigma_dist = window.classify_value(new_value)
sample = WindowSample(
    sample_id=1,
    timestamp=datetime.utcnow(),
    value=new_value,
    range_value=None,
    zone=zone,
    is_above_center=is_above,
    sigma_distance=sigma_dist
)
window.append(sample)

# Check rules
violations = library.check_all(window)
```

## Best Practices

### 1. Reuse NelsonRuleLibrary
```python
# Good - create once
library = NelsonRuleLibrary()

# Use many times
violations1 = library.check_all(window1)
violations2 = library.check_all(window2)
```

### 2. Filter Rules for Different Contexts
```python
# Production monitoring - all rules
violations = library.check_all(window)

# Quick check - critical only
violations = library.check_all(window, enabled_rules={1})

# Setup phase - ignore stratification
violations = library.check_all(window, enabled_rules={1,2,3,4,5,6,8})
```

### 3. Handle Severity Appropriately
```python
for v in violations:
    if v.severity == Severity.CRITICAL:
        # Immediate action
        stop_process()
        page_supervisor()
    else:
        # Log and notify
        log_warning(v)
        email_operator()
```

### 4. Store Violation History
```python
violations = library.check_all(window)

for v in violations:
    db.save_violation(
        sample_id=v.involved_sample_ids[-1],  # Most recent
        rule_id=v.rule_id,
        rule_name=v.rule_name,
        severity=v.severity.value,
        message=v.message
    )
```

## Minimum Sample Requirements

Each rule requires a minimum number of samples:

| Rule | Min Samples | Note |
|------|-------------|------|
| 1 | 1 | Can trigger immediately |
| 2 | 9 | Need 9 to detect shift |
| 3 | 6 | Need 6 to detect trend |
| 4 | 14 | Need 14 to detect alternation |
| 5 | 3 | Check 2 of 3 |
| 6 | 5 | Check 4 of 5 |
| 7 | 15 | Need 15 consecutive |
| 8 | 8 | Need 8 consecutive |

Rules return `None` if insufficient samples exist.

## Performance Notes

- All rules are O(1) with fixed window sizes
- Maximum window size typically 25 samples
- Check all rules: ~25µs (microseconds)
- Memory overhead: ~100 bytes per violation
- Safe to check on every sample insert

## Troubleshooting

### No Violations Detected
- Check that window has enough samples
- Verify boundaries are set correctly
- Ensure samples are classified into zones
- Check enabled_rules filter

### Too Many False Positives
- Consider checking only critical rules
- Verify control limits are calculated correctly
- Check for proper sample exclusion
- May need to recalculate control limits

### Rule Always Triggering
- Rule 7: Control limits may be too wide
- Rule 8: May have mixed populations
- Rules 2-6: Process may actually be shifting

## Examples

See the following files for complete examples:
- `backend/verify_nelson_rules.py` - Standalone verification
- `backend/test_nelson_integration.py` - Integration examples
- `backend/tests/unit/test_nelson_rules.py` - Unit test examples

## References

- [BE-005 Documentation](../../../docs/BE-005-Nelson-Rules.md)
- [Nelson (1984) Original Paper]
- [AIAG SPC Manual]
- [Western Electric Rules]
