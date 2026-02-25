# Control Limit Calculation Service - Usage Guide

## Overview

The `ControlLimitService` calculates and manages control limits from historical sample data. It automatically selects the appropriate calculation method based on subgroup size and supports exclusion of out-of-control samples.

## Calculation Methods

The service automatically selects the appropriate method:

- **n=1**: Moving Range (MR-bar / d2) - For Individuals charts
- **n=2-10**: R-bar / d2 method - For X-bar R charts
- **n>10**: S-bar / c4 method - For X-bar S charts

## Basic Usage

### Initialize the Service

```python
from openspc.core.engine import ControlLimitService
from openspc.db.repositories import SampleRepository, CharacteristicRepository
from openspc.core.engine import RollingWindowManager

# Initialize repositories and manager
sample_repo = SampleRepository(session)
char_repo = CharacteristicRepository(session)
window_manager = RollingWindowManager(sample_repo)

# Create service
service = ControlLimitService(sample_repo, char_repo, window_manager)
```

### Calculate Limits (without persisting)

```python
# Calculate limits from historical data
result = await service.calculate_limits(
    characteristic_id=1,
    exclude_ooc=False,  # Include all samples
    min_samples=25      # Minimum samples required
)

print(f"Center Line: {result.center_line}")
print(f"UCL: {result.ucl}")
print(f"LCL: {result.lcl}")
print(f"Sigma: {result.sigma}")
print(f"Method: {result.method}")
print(f"Samples used: {result.sample_count}")
```

### Calculate and Persist Limits

```python
# Calculate and save to database
result = await service.recalculate_and_persist(
    characteristic_id=1,
    exclude_ooc=True,   # Exclude samples with violations
    min_samples=30      # Require at least 30 samples
)

# Limits are now saved to the characteristic
# Rolling window cache is automatically invalidated
```

## Integration with SPCEngine

The service should be used by SPCEngine when:

1. **Characteristic has no control limits** (ucl/lcl are NULL)
2. **User explicitly requests recalculation**
3. **After bulk data import**

Example integration:

```python
class SPCEngine:
    def __init__(self, ...):
        # ... existing initialization
        self.control_limit_service = ControlLimitService(
            sample_repo, char_repo, window_manager
        )

    async def process_sample(self, characteristic_id: int, values: list[float]):
        # Check if limits need to be calculated
        characteristic = await self.char_repo.get_by_id(characteristic_id)

        if characteristic.ucl is None or characteristic.lcl is None:
            # Auto-calculate limits if not set
            try:
                await self.control_limit_service.recalculate_and_persist(
                    characteristic_id=characteristic_id,
                    exclude_ooc=False,
                    min_samples=25
                )
            except ValueError as e:
                # Not enough samples yet, continue without limits
                pass

        # Continue with normal sample processing
        ...
```

## Example: Method Selection

```python
# For n=1 (Individuals chart)
characteristic.subgroup_size = 1
result = await service.calculate_limits(characteristic_id=1)
assert result.method == "moving_range"

# For n=5 (X-bar R chart)
characteristic.subgroup_size = 5
result = await service.calculate_limits(characteristic_id=2)
assert result.method == "r_bar_d2"

# For n=15 (X-bar S chart)
characteristic.subgroup_size = 15
result = await service.calculate_limits(characteristic_id=3)
assert result.method == "s_bar_c4"
```

## Example: OOC Exclusion

```python
# Calculate limits excluding out-of-control samples
result = await service.calculate_limits(
    characteristic_id=1,
    exclude_ooc=True,
    min_samples=25
)

print(f"Used {result.sample_count} samples")
print(f"Excluded {result.excluded_count} OOC samples")
```

## Error Handling

```python
try:
    result = await service.calculate_limits(
        characteristic_id=999,
        min_samples=25
    )
except ValueError as e:
    if "not found" in str(e):
        print("Characteristic doesn't exist")
    elif "Insufficient samples" in str(e):
        print("Not enough samples for calculation")
```

## Calculation Results

The `CalculationResult` dataclass contains:

```python
@dataclass
class CalculationResult:
    center_line: float       # Process center line (mean)
    ucl: float              # Upper Control Limit
    lcl: float              # Lower Control Limit
    sigma: float            # Estimated process standard deviation
    method: str             # Calculation method used
    sample_count: int       # Number of samples used
    excluded_count: int     # Number of samples excluded
    calculated_at: datetime # When calculation was performed
```

## Best Practices

1. **Minimum Samples**: Use at least 25 samples for reliable estimates
2. **OOC Exclusion**: Only exclude OOC samples after initial stabilization
3. **Recalculation**: Recalculate periodically or when process changes
4. **Cache Invalidation**: Service automatically invalidates rolling window
5. **Method Selection**: Trust automatic method selection based on subgroup size

## Test Data Examples

### Moving Range Test (n=1)
```python
# Values: [10.0, 12.0, 11.0, 13.0, 10.0]
# Expected:
# - X-bar = 11.2
# - MR-bar = 2.0
# - sigma = 1.773
# - UCL = 16.52
# - LCL = 5.88
```

### R-bar Test (n=5)
```python
# Subgroups:
# [10.0, 10.2, 10.1, 10.3, 10.0]  # mean=10.12, R=0.3
# [10.5, 10.7, 10.6, 10.8, 10.5]  # mean=10.62, R=0.3
# [9.8, 10.0, 9.9, 10.1, 9.8]     # mean=9.92, R=0.3
# [10.2, 10.4, 10.3, 10.5, 10.2]  # mean=10.32, R=0.3
# Expected:
# - X-double-bar = 10.245
# - R-bar = 0.3
# - sigma = 0.129
# - UCL = 10.632
# - LCL = 9.858
```

## Performance Considerations

- Calculation is O(n) where n is the number of samples
- Database queries are optimized to fetch all needed data in one call
- Rolling window invalidation ensures fresh data on next evaluation
- Service is async-safe and can handle concurrent requests
