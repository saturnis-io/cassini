# BE-003: Statistical Constants & Utilities Implementation

## Overview

This document describes the implementation of statistical constants and utility functions for Statistical Process Control (SPC) calculations in OpenSPC.

## Implementation Summary

### Files Created

1. **`backend/src/openspc/utils/constants.py`** - Statistical constants tables (d2, c4, A2, D3, D4)
2. **`backend/src/openspc/utils/statistics.py`** - Sigma estimation and control limit functions
3. **`backend/src/openspc/utils/__init__.py`** - Public API exports
4. **`backend/tests/unit/test_statistics.py`** - Comprehensive unit tests

### Statistical Constants

All constants are based on **ASTM E2587** and **NIST Engineering Statistics Handbook** standards.

#### Supported Subgroup Sizes
- Range: n = 1 to 25
- Constants provided: d2, c4, A2, D3, D4

#### Key Constants Verified

| n | d2 | c4 | A2 | D3 | D4 |
|---|----|----|----|----|----|
| 2 | 1.128 | 0.7979 | 1.880 | 0.000 | 3.267 |
| 5 | 2.326 | 0.9400 | 0.577 | 0.000 | 2.114 |
| 10 | 3.078 | 0.9727 | 0.308 | 0.223 | 1.777 |

## Core Functions

### Sigma Estimation Methods

#### 1. R-bar/d2 Method (n=2-10)
```python
sigma = estimate_sigma_rbar(ranges, subgroup_size)
```

**Use case:** Variable data with subgroup sizes 2-10

**Formula:** σ = R̄ / d2

**Example:**
```python
ranges = [1.2, 1.5, 1.0, 1.3]
sigma = estimate_sigma_rbar(ranges, subgroup_size=5)
# Returns: 0.537 (R̄=1.25 / d2=2.326)
```

#### 2. S-bar/c4 Method (n>10)
```python
sigma = estimate_sigma_sbar(std_devs, subgroup_size)
```

**Use case:** Variable data with subgroup sizes greater than 10

**Formula:** σ = S̄ / c4

**Example:**
```python
std_devs = [2.1, 2.3, 2.0, 2.2]
sigma = estimate_sigma_sbar(std_devs, subgroup_size=15)
# Returns: 2.188 (S̄=2.15 / c4=0.9823)
```

#### 3. Moving Range Method (n=1)
```python
sigma = estimate_sigma_moving_range(values, span=2)
```

**Use case:** Individual measurements (I-MR charts)

**Formula:** σ = MR̄ / d2(span)

**Example (from spec):**
```python
values = [10, 12, 11, 13, 10]
# Moving ranges: [2, 1, 2, 3]
# MR̄ = 2.0
# σ = 2.0 / 1.128 = 1.773
sigma = estimate_sigma_moving_range(values)
# Returns: 1.773
```

### Control Limit Calculations

#### X-bar and R Charts
```python
limits = calculate_xbar_r_limits(subgroup_means, ranges, subgroup_size)
```

**Returns:**
- `limits.xbar_limits`: X-bar chart control limits
  - `center_line`: X̄
  - `ucl`: X̄ + A2·R̄
  - `lcl`: X̄ - A2·R̄
  - `sigma`: Estimated process sigma

- `limits.r_limits`: R chart control limits
  - `center_line`: R̄
  - `ucl`: D4·R̄
  - `lcl`: D3·R̄

**Example:**
```python
means = [10.0, 10.2, 9.8, 10.1]
ranges = [1.2, 1.5, 1.0, 1.3]
limits = calculate_xbar_r_limits(means, ranges, subgroup_size=5)

# X-bar chart:
# CL = 10.025
# UCL = 10.746
# LCL = 9.304
# Sigma = 0.537
```

#### I-MR Charts (Individuals)
```python
limits = calculate_imr_limits(values, span=2)
```

**Returns:**
- `limits.xbar_limits`: Individuals chart control limits
  - `center_line`: X̄
  - `ucl`: X̄ + 3σ
  - `lcl`: X̄ - 3σ
  - `sigma`: Estimated from moving range

- `limits.r_limits`: Moving Range chart control limits
  - `center_line`: MR̄
  - `ucl`: D4·MR̄
  - `lcl`: D3·MR̄

**Example:**
```python
values = [10, 12, 11, 13, 10, 12]
limits = calculate_imr_limits(values)

# Individuals chart:
# CL = 11.333
# UCL = 16.652
# LCL = 6.014
# Sigma = 1.773
```

### Zone Boundary Calculations

```python
zones = calculate_zones(center_line, sigma)
```

**Returns:** Zone boundaries for Nelson Rules testing
- `center_line`: Process average
- `plus_1_sigma`, `plus_2_sigma`, `plus_3_sigma`: Upper zones
- `minus_1_sigma`, `minus_2_sigma`, `minus_3_sigma`: Lower zones

**Zone Definitions:**
- **Zone C**: Between center line and ±1σ
- **Zone B**: Between ±1σ and ±2σ
- **Zone A**: Between ±2σ and ±3σ (control limits)

**Example:**
```python
zones = calculate_zones(100.0, 2.0)
# Returns:
# center_line: 100.0
# plus_1_sigma: 102.0
# plus_2_sigma: 104.0
# plus_3_sigma: 106.0 (UCL)
# minus_1_sigma: 98.0
# minus_2_sigma: 96.0
# minus_3_sigma: 94.0 (LCL)
```

## Data Classes

### ControlLimits
```python
@dataclass
class ControlLimits:
    center_line: float  # Process average
    ucl: float         # Upper Control Limit (+3σ)
    lcl: float         # Lower Control Limit (-3σ)
    sigma: float       # Estimated process standard deviation
```

### XbarRLimits
```python
@dataclass
class XbarRLimits:
    xbar_limits: ControlLimits  # X-bar or Individuals chart limits
    r_limits: ControlLimits     # R or Moving Range chart limits
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

## Error Handling

All functions include comprehensive validation:

### ValueError Conditions

1. **Invalid subgroup size**
   - Must be 1-25 for constants
   - Must be 2-10 for R-bar method
   - Must be >10 for S-bar method

2. **Empty data**
   - All list parameters must be non-empty

3. **Negative values**
   - Ranges cannot be negative
   - Standard deviations cannot be negative
   - Sigma must be positive

4. **Mismatched lengths**
   - Means and ranges must have same length

5. **Insufficient data**
   - Moving range needs at least `span` values
   - I-MR charts need at least 2 values

## Testing

### Test Coverage

**Unit tests:** 40+ test cases covering:
- Constant accuracy verification (ASTM E2587)
- Sigma estimation methods
- Control limit calculations
- Zone boundaries
- Error handling
- Integration workflows

### Running Tests

```bash
cd backend
python -m pytest tests/unit/test_statistics.py -v
```

### Verification Script

A standalone verification script is provided:

```bash
cd backend
python verify_statistics.py
```

This script demonstrates all functionality and verifies calculations against known values.

## Usage Examples

### Example 1: X-bar R Chart
```python
from openspc.utils import calculate_xbar_r_limits, calculate_zones

# Collect data
means = [100.1, 99.9, 100.2, 100.0, 99.8]
ranges = [2.5, 2.8, 2.3, 2.6, 2.4]

# Calculate limits
limits = calculate_xbar_r_limits(means, ranges, subgroup_size=5)

# Calculate zones for pattern detection
zones = calculate_zones(
    limits.xbar_limits.center_line,
    limits.xbar_limits.sigma
)

# Check if a new point is out of control
new_mean = 102.5
if new_mean > limits.xbar_limits.ucl or new_mean < limits.xbar_limits.lcl:
    print("Out of control!")
```

### Example 2: I-MR Chart
```python
from openspc.utils import calculate_imr_limits

# Collect individual measurements
values = [10.1, 10.5, 9.8, 10.2, 10.0, 9.9, 10.3, 10.1]

# Calculate limits
limits = calculate_imr_limits(values)

# Check new measurement
new_value = 15.0
if new_value > limits.xbar_limits.ucl:
    print(f"Value {new_value} exceeds UCL {limits.xbar_limits.ucl}")
```

### Example 3: Custom Sigma Calculation
```python
from openspc.utils import (
    estimate_sigma_moving_range,
    calculate_control_limits_from_sigma
)

# Estimate sigma from historical data
historical_values = [10.1, 10.5, 9.8, 10.2, 10.0]
sigma = estimate_sigma_moving_range(historical_values)

# Apply to new process with same variability
new_process_average = 50.0
limits = calculate_control_limits_from_sigma(new_process_average, sigma)
```

## References

1. **ASTM E2587** - Standard Practice for Use of Control Charts in Statistical Process Control
2. **NIST/SEMATECH e-Handbook of Statistical Methods** - Section 6.3.2: Control Chart Constants
3. **ISO 7870-2:2013** - Control charts — Part 2: Shewhart control charts
4. **Montgomery, D.C.** - Introduction to Statistical Quality Control (7th Edition)

## Acceptance Criteria Status

- ✅ d2/c4 constants match ASTM E2587 for n=2-25
- ✅ Moving range method correct for n=1 (MR/1.128)
- ✅ R-bar/d2 method correct for n=2-10
- ✅ S/c4 method correct for n>10
- ✅ Zone boundaries calculated correctly (+/- 1σ, 2σ, 3σ)
- ✅ Functions raise ValueError for invalid subgroup sizes
- ✅ All test cases pass with exact matches to specification

## Future Enhancements

Potential additions for future iterations:

1. **Additional constants** for other chart types (p, np, c, u charts)
2. **Attribute chart functions** for defect/count data
3. **Capability indices** (Cp, Cpk, Pp, Ppk)
4. **EWMA and CUSUM** chart calculations
5. **Probability plot** correlation coefficients
