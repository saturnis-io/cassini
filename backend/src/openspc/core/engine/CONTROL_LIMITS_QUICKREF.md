# Control Limit Service - Quick Reference

## Import
```python
from openspc.core.engine import ControlLimitService, CalculationResult
```

## Initialize
```python
service = ControlLimitService(sample_repo, char_repo, window_manager)
```

## Calculate Only
```python
result = await service.calculate_limits(
    characteristic_id=1,
    exclude_ooc=False,
    min_samples=25
)
```

## Calculate and Save
```python
result = await service.recalculate_and_persist(
    characteristic_id=1,
    exclude_ooc=True,
    min_samples=25
)
```

## Result Properties
```python
result.center_line    # Process mean
result.ucl           # Upper Control Limit
result.lcl           # Lower Control Limit
result.sigma         # Process std deviation
result.method        # "moving_range", "r_bar_d2", or "s_bar_c4"
result.sample_count  # Samples used
result.excluded_count # Samples excluded
result.calculated_at # Timestamp
```

## Method Selection (Automatic)
- n=1: Moving Range
- n=2-10: R-bar / d2
- n>10: S-bar / c4

## Error Handling
```python
try:
    result = await service.calculate_limits(char_id)
except ValueError as e:
    # Characteristic not found OR insufficient samples
    pass
```

## Common Use Cases

### Auto-calculate on first sample
```python
char = await char_repo.get_by_id(char_id)
if char.ucl is None:
    try:
        await service.recalculate_and_persist(char_id, min_samples=25)
    except ValueError:
        pass  # Not enough samples yet
```

### Recalculate periodically
```python
# After process stabilization
await service.recalculate_and_persist(
    char_id,
    exclude_ooc=True,  # Exclude outliers
    min_samples=30
)
```

### Get current limits without saving
```python
# Preview calculation
result = await service.calculate_limits(char_id)
print(f"New UCL would be: {result.ucl}")
# Decide whether to persist
```
