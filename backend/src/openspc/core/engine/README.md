# SPC Engine Core

The SPC Engine Core is the heart of OpenSPC, orchestrating the complete Statistical Process Control workflow from sample collection through rule evaluation and violation detection.

## Overview

The SPC Engine provides a complete pipeline for processing quality control samples:

1. **Validation** - Ensures characteristic exists and measurements are valid
2. **Persistence** - Stores samples and measurements to the database
3. **Statistics** - Calculates mean, range, and zone classification
4. **Rolling Window** - Maintains recent sample history with zone boundaries
5. **Rule Evaluation** - Checks enabled Nelson Rules against the window
6. **Violation Tracking** - Creates violations for triggered rules
7. **Result Generation** - Returns comprehensive processing results

## Components

### SPCEngine

Main orchestrator that coordinates all SPC operations.

```python
from openspc.core.engine.spc_engine import SPCEngine, SampleContext

# Initialize engine with dependencies
engine = SPCEngine(
    sample_repo=sample_repo,
    char_repo=char_repo,
    violation_repo=violation_repo,
    window_manager=window_manager,
    rule_library=rule_library,
)

# Process a sample
result = await engine.process_sample(
    characteristic_id=1,
    measurements=[10.1, 10.2, 10.0],
    context=SampleContext(
        batch_number="BATCH-001",
        operator_id="OPR-123",
        source="MANUAL"
    )
)

# Check results
print(f"Sample {result.sample_id}: In control = {result.in_control}")
print(f"Mean: {result.mean}, Range: {result.range_value}")
print(f"Zone: {result.zone}, Sigma distance: {result.sigma_distance}")
print(f"Violations: {len(result.violations)}")
```

### RollingWindowManager

Manages in-memory caching of recent samples with LRU eviction.

```python
from openspc.core.engine.rolling_window import RollingWindowManager, ZoneBoundaries

# Initialize manager
manager = RollingWindowManager(
    sample_repository=sample_repo,
    max_cached_windows=1000,
    window_size=25
)

# Get window for a characteristic
window = await manager.get_window(char_id=1)

# Add new sample to window
boundaries = ZoneBoundaries(
    center_line=100.0,
    sigma=2.0,
    plus_1_sigma=102.0,
    plus_2_sigma=104.0,
    plus_3_sigma=106.0,
    minus_1_sigma=98.0,
    minus_2_sigma=96.0,
    minus_3_sigma=94.0
)

window_sample = await manager.add_sample(
    char_id=1,
    sample=sample,
    boundaries=boundaries
)
```

### NelsonRuleLibrary

Provides all 8 Nelson Rules for violation detection.

```python
from openspc.core.engine.nelson_rules import NelsonRuleLibrary

# Initialize library
library = NelsonRuleLibrary()

# Check all enabled rules
violations = library.check_all(
    window=window,
    enabled_rules={1, 2, 3, 4, 5, 6, 7, 8}
)

# Check single rule
result = library.check_single(window, rule_id=1)
if result and result.triggered:
    print(f"Rule {result.rule_id} triggered: {result.message}")
```

## Data Models

### SampleContext

Context information provided when processing a sample:

- `batch_number` (str | None) - Batch or lot number
- `operator_id` (str | None) - Operator identifier
- `source` (str) - Data source: "MANUAL" or "TAG"

### ProcessingResult

Complete result of sample processing:

```python
@dataclass
class ProcessingResult:
    sample_id: int                    # Database ID
    characteristic_id: int            # Characteristic ID
    timestamp: datetime               # Sample timestamp

    # Statistics
    mean: float                       # Sample mean
    range_value: float | None         # Sample range (n>1)

    # Zone information
    zone: str                         # Zone classification
    sigma_distance: float             # Distance from center
    is_above_center: bool             # Above/below center

    # Control state
    in_control: bool                  # No violations?
    violations: list[ViolationInfo]   # Triggered violations

    # Performance
    processing_time_ms: float         # Processing time
```

### ViolationInfo

Information about a triggered rule:

- `rule_id` (int) - Nelson Rule number (1-8)
- `rule_name` (str) - Human-readable name
- `severity` (str) - "WARNING" or "CRITICAL"
- `message` (str) - Description of violation
- `involved_sample_ids` (list[int]) - Samples involved

## Processing Flow

```
┌─────────────────┐
│  1. Validate    │
│  - Char exists  │
│  - Count OK     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. Persist     │
│  - Sample       │
│  - Measurements │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. Calculate   │
│  - Mean         │
│  - Range        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. Window      │
│  - Get bounds   │
│  - Classify     │
│  - Append       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. Rules       │
│  - Get enabled  │
│  - Check all    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  6. Violations  │
│  - Persist      │
│  - Build info   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  7. Result      │
│  - Build        │
│  - Return       │
└─────────────────┘
```

## Chart Types

### Individuals Chart (n=1)

For single measurements per sample:

```python
# Characteristic with subgroup_size=1
result = await engine.process_sample(
    characteristic_id=1,
    measurements=[100.5],  # Single value
)

# Result has no range_value
assert result.range_value is None
```

Uses I-MR (Individuals and Moving Range) control limits.

### X-bar R Chart (n>1)

For subgroups of measurements:

```python
# Characteristic with subgroup_size=3
result = await engine.process_sample(
    characteristic_id=2,
    measurements=[50.1, 50.2, 49.9],  # 3 values
)

# Result includes range
assert result.range_value == 0.3  # max - min
```

Uses X-bar R control limits for subgroup means and ranges.

## Control Limits

### Using Stored Limits

If characteristic has `ucl` and `lcl` stored:

```python
char.ucl = 106.0
char.lcl = 94.0

# Engine uses stored limits
boundaries = await engine._get_zone_boundaries(char_id)
```

### Calculating from History

If limits are not stored, calculates from recent data:

```python
char.ucl = None
char.lcl = None

# Engine recalculates from last 100 samples
center_line, ucl, lcl = await engine.recalculate_limits(
    characteristic_id=1,
    exclude_ooc=False
)

# Update characteristic
char.ucl = ucl
char.lcl = lcl
```

## Zone Classification

Samples are classified into zones based on distance from center line:

- **Beyond UCL/LCL** - Greater than 3σ from center
- **Zone A** - Between 2σ and 3σ from center
- **Zone B** - Between 1σ and 2σ from center
- **Zone C** - Between 0σ and 1σ from center

Zones are used by Nelson Rules to detect non-random patterns.

## Nelson Rules

All 8 Nelson Rules are supported:

1. **Outlier** (CRITICAL) - Point beyond 3σ
2. **Shift** (WARNING) - 9 points same side of center
3. **Trend** (WARNING) - 6 points increasing/decreasing
4. **Alternator** (WARNING) - 14 points alternating up/down
5. **Zone A Warning** (WARNING) - 2 of 3 in Zone A or beyond
6. **Zone B Warning** (WARNING) - 4 of 5 in Zone B or beyond
7. **Stratification** (WARNING) - 15 points in Zone C
8. **Mixture** (WARNING) - 8 points outside Zone C

Rules can be individually enabled/disabled per characteristic:

```python
# Enable only Rules 1, 2, and 3
from openspc.db.models.characteristic import CharacteristicRule

for rule_id in [1, 2, 3]:
    rule = CharacteristicRule(
        char_id=char.id,
        rule_id=rule_id,
        is_enabled=True
    )
    session.add(rule)
```

## Performance

The engine tracks processing time for each sample:

```python
result = await engine.process_sample(...)
print(f"Processed in {result.processing_time_ms:.2f}ms")
```

Typical performance:
- Single sample: < 10ms
- With violations: < 20ms
- Rolling window cached: < 5ms overhead

## Error Handling

The engine validates inputs and provides clear error messages:

```python
# Characteristic not found
try:
    await engine.process_sample(
        characteristic_id=99999,
        measurements=[100.0]
    )
except ValueError as e:
    print(f"Error: {e}")
    # Error: Characteristic 99999 not found

# Wrong measurement count
try:
    await engine.process_sample(
        characteristic_id=1,  # subgroup_size=3
        measurements=[100.0, 101.0]  # Only 2 measurements
    )
except ValueError as e:
    print(f"Error: {e}")
    # Error: Expected 3 measurements for characteristic 1, got 2
```

## Testing

### Unit Tests

Unit tests use mocked dependencies:

```bash
pytest tests/unit/test_spc_engine.py
```

Coverage:
- Sample processing with/without violations
- All validation scenarios
- Rule evaluation logic
- Zone boundary calculation
- Limit recalculation
- Performance tracking

### Integration Tests

Integration tests use real database:

```bash
pytest tests/integration/test_spc_integration.py
```

Coverage:
- End-to-end workflow
- Individuals chart (n=1)
- X-bar R chart (n>1)
- All 8 Nelson Rules
- Rule configuration
- Multiple characteristics
- Concurrent processing
- Performance benchmarks

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  SPCEngine                      │
│  - Orchestrates complete pipeline              │
│  - Validates inputs                             │
│  - Coordinates all components                   │
└───────────┬─────────────────────────────────────┘
            │
            ├──────────────┬──────────────┬─────────────┐
            │              │              │             │
            ▼              ▼              ▼             ▼
    ┌──────────┐  ┌──────────────┐  ┌────────┐  ┌───────────┐
    │  Sample  │  │   Rolling    │  │ Nelson │  │ Violation │
    │   Repo   │  │   Window     │  │ Rules  │  │   Repo    │
    │          │  │   Manager    │  │Library │  │           │
    └──────────┘  └──────────────┘  └────────┘  └───────────┘
         │              │                │             │
         ▼              ▼                │             ▼
    ┌──────────┐  ┌──────────────┐     │        ┌───────────┐
    │ Database │  │   LRU Cache  │     │        │ Database  │
    │ Samples  │  │   Windows    │     │        │Violations │
    └──────────┘  └──────────────┘     │        └───────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │   8 Rule Classes │
                              │  - Rule1Outlier  │
                              │  - Rule2Shift    │
                              │  - Rule3Trend    │
                              │  - ...           │
                              └──────────────────┘
```

## Dependencies

Required packages:
- `sqlalchemy` - Database ORM
- `aiosqlite` - Async SQLite driver
- `pytest` - Testing framework
- `pytest-asyncio` - Async test support

Required modules:
- `openspc.db.models` - Database models
- `openspc.db.repositories` - Data access layer
- `openspc.utils.statistics` - Control limit calculations
- `openspc.core.engine.rolling_window` - Window management
- `openspc.core.engine.nelson_rules` - Rule library

## Best Practices

1. **Always use context** - Provide batch and operator information for traceability
2. **Enable appropriate rules** - Don't enable all rules unless needed
3. **Monitor performance** - Track processing times for optimization
4. **Recalculate limits periodically** - Keep control limits current
5. **Handle violations promptly** - Acknowledge and investigate violations
6. **Validate inputs** - Check measurement count matches subgroup size
7. **Use transactions** - Commit after processing to ensure consistency

## Future Enhancements

Planned features:
- Custom rule definitions
- Western Electric rules
- CUSUM and EWMA charts
- Capability analysis (Cp, Cpk)
- Run chart detection
- Automated limit recalculation
- Real-time alerting
- Historical trending
