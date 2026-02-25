# OpenSPC Statistical Utilities

Statistical constants and utility functions for SPC control chart calculations.

## Quick Start

```python
from openspc.utils import (
    calculate_xbar_r_limits,
    calculate_imr_limits,
    calculate_zones,
)

# X-bar R Chart
means = [100.1, 99.9, 100.2, 100.0]
ranges = [2.5, 2.8, 2.3, 2.6]
limits = calculate_xbar_r_limits(means, ranges, subgroup_size=5)

# I-MR Chart (Individuals)
values = [10.1, 10.5, 9.8, 10.2, 10.0]
limits = calculate_imr_limits(values)

# Zone Boundaries (for Nelson Rules)
zones = calculate_zones(center_line=100.0, sigma=2.0)
```

## Modules

### `constants.py`
Statistical constants from ASTM E2587 for subgroup sizes 1-25:
- `d2` - Average range factor
- `c4` - Standard deviation correction factor
- `A2` - X-bar chart control limit factor
- `D3`, `D4` - R chart control limit factors

### `statistics.py`
Core statistical functions:
- **Sigma Estimation**: R-bar/d2, S-bar/c4, Moving Range methods
- **Control Limits**: X-bar R charts, I-MR charts
- **Zone Calculations**: Nelson Rules zone boundaries

## API Reference

### Constants

```python
get_d2(subgroup_size: int) -> float
get_c4(subgroup_size: int) -> float
get_A2(subgroup_size: int) -> float
get_D3(subgroup_size: int) -> float
get_D4(subgroup_size: int) -> float
get_constants(subgroup_size: int) -> SpcConstants
```

### Sigma Estimation

```python
estimate_sigma_rbar(ranges: List[float], subgroup_size: int) -> float
estimate_sigma_sbar(std_devs: List[float], subgroup_size: int) -> float
estimate_sigma_moving_range(values: List[float], span: int = 2) -> float
```

### Control Limits

```python
calculate_xbar_r_limits(
    subgroup_means: List[float],
    ranges: List[float],
    subgroup_size: int
) -> XbarRLimits

calculate_imr_limits(values: List[float], span: int = 2) -> XbarRLimits

calculate_zones(center_line: float, sigma: float) -> ZoneBoundaries

calculate_control_limits_from_sigma(
    center_line: float,
    sigma: float,
    n_sigma: float = 3.0
) -> ControlLimits
```

## Data Classes

### ControlLimits
```python
@dataclass
class ControlLimits:
    center_line: float
    ucl: float
    lcl: float
    sigma: float
```

### XbarRLimits
```python
@dataclass
class XbarRLimits:
    xbar_limits: ControlLimits
    r_limits: ControlLimits
```

### ZoneBoundaries
```python
@dataclass
class ZoneBoundaries:
    center_line: float
    plus_1_sigma: float
    plus_2_sigma: float
    plus_3_sigma: float   # UCL
    minus_1_sigma: float
    minus_2_sigma: float
    minus_3_sigma: float  # LCL
```

## Examples

### Example 1: Variable Data (X-bar R)
```python
from openspc.utils import calculate_xbar_r_limits

# Collect subgroup data
means = [100.1, 99.9, 100.2, 100.0, 99.8]
ranges = [2.5, 2.8, 2.3, 2.6, 2.4]

# Calculate control limits
limits = calculate_xbar_r_limits(means, ranges, subgroup_size=5)

print(f"X-bar: {limits.xbar_limits.center_line:.2f}")
print(f"UCL: {limits.xbar_limits.ucl:.2f}")
print(f"LCL: {limits.xbar_limits.lcl:.2f}")
```

### Example 2: Individuals Data (I-MR)
```python
from openspc.utils import calculate_imr_limits

# Individual measurements
values = [10.1, 10.5, 9.8, 10.2, 10.0, 9.9, 10.3]

# Calculate control limits
limits = calculate_imr_limits(values)

print(f"Average: {limits.xbar_limits.center_line:.2f}")
print(f"Sigma: {limits.xbar_limits.sigma:.3f}")
```

### Example 3: Nelson Rules Detection
```python
from openspc.utils import calculate_zones

# Calculate zone boundaries
zones = calculate_zones(center_line=100.0, sigma=2.0)

# Check if point is in Zone A (warning)
point = 104.5
if zones.plus_2_sigma < point <= zones.plus_3_sigma:
    print("Point in Zone A (upper)")
elif point > zones.plus_3_sigma:
    print("Point exceeds UCL")
```

## Standards Compliance

All constants are verified against:
- **ASTM E2587** - Standard Practice for Use of Control Charts
- **NIST Engineering Statistics Handbook** - Section 6.3.2

## Testing

Run unit tests:
```bash
pytest tests/unit/test_statistics.py -v
```

Run verification script:
```bash
python verify_statistics.py
```

## Documentation

For complete documentation, see:
- [BE-003 Implementation Guide](../../../docs/BE-003-Statistical-Utilities.md)
- Module docstrings in source code

## License

Copyright 2025 - OpenSPC Project
