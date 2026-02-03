# Statistical Constants Reference Table (ASTM E2587)

## Complete Constants Table for Subgroup Sizes n=1-25

This table contains all statistical constants used in SPC control chart calculations, verified against ASTM E2587 and NIST Engineering Statistics Handbook.

### Constants Definitions

- **n**: Subgroup size
- **d2**: Average range factor (σ = R̄/d2)
- **c4**: Standard deviation correction factor (σ = S̄/c4)
- **A2**: Factor for X-bar chart control limits from R̄ (UCL/LCL = X̄ ± A2·R̄)
- **D3**: Lower control limit factor for R chart (LCL = D3·R̄)
- **D4**: Upper control limit factor for R chart (UCL = D4·R̄)

### Full Constants Table

| n  | d2    | c4     | A2    | D3    | D4    |
|----|-------|--------|-------|-------|-------|
| 1  | 1.128 | 0.7979 | 2.660 | 0.000 | 3.267 |
| 2  | 1.128 | 0.7979 | 1.880 | 0.000 | 3.267 |
| 3  | 1.693 | 0.8862 | 1.023 | 0.000 | 2.574 |
| 4  | 2.059 | 0.9213 | 0.729 | 0.000 | 2.282 |
| 5  | 2.326 | 0.9400 | 0.577 | 0.000 | 2.114 |
| 6  | 2.534 | 0.9515 | 0.483 | 0.000 | 2.004 |
| 7  | 2.704 | 0.9594 | 0.419 | 0.076 | 1.924 |
| 8  | 2.847 | 0.9650 | 0.373 | 0.136 | 1.864 |
| 9  | 2.970 | 0.9693 | 0.337 | 0.184 | 1.816 |
| 10 | 3.078 | 0.9727 | 0.308 | 0.223 | 1.777 |
| 11 | 3.173 | 0.9754 | 0.285 | 0.256 | 1.744 |
| 12 | 3.258 | 0.9776 | 0.266 | 0.283 | 1.717 |
| 13 | 3.336 | 0.9794 | 0.249 | 0.307 | 1.693 |
| 14 | 3.407 | 0.9810 | 0.235 | 0.328 | 1.672 |
| 15 | 3.472 | 0.9823 | 0.223 | 0.347 | 1.653 |
| 16 | 3.532 | 0.9835 | 0.212 | 0.363 | 1.637 |
| 17 | 3.588 | 0.9845 | 0.203 | 0.378 | 1.622 |
| 18 | 3.640 | 0.9854 | 0.194 | 0.391 | 1.608 |
| 19 | 3.689 | 0.9862 | 0.187 | 0.403 | 1.597 |
| 20 | 3.735 | 0.9869 | 0.180 | 0.415 | 1.585 |
| 21 | 3.778 | 0.9876 | 0.173 | 0.425 | 1.575 |
| 22 | 3.819 | 0.9882 | 0.167 | 0.434 | 1.566 |
| 23 | 3.858 | 0.9887 | 0.162 | 0.443 | 1.557 |
| 24 | 3.895 | 0.9892 | 0.157 | 0.451 | 1.548 |
| 25 | 3.931 | 0.9896 | 0.153 | 0.459 | 1.541 |

## Usage Notes

### Recommended Methods by Subgroup Size

| Subgroup Size | Recommended Method | Constant Used |
|---------------|-------------------|---------------|
| n = 1 | Moving Range | d2 (with span=2) |
| n = 2-10 | R-bar method | d2, A2, D3, D4 |
| n > 10 | S-bar method | c4 |

### Key Observations

1. **d2 increases with n**: Larger subgroups have larger average ranges
2. **c4 approaches 1.0**: For large n, S̄ ≈ σ (S̄ is nearly unbiased)
3. **A2 decreases with n**: Larger subgroups provide tighter control limits
4. **D3 = 0 for n < 7**: Range chart has no lower control limit for small n
5. **D4 decreases with n**: Range control limits tighten with larger subgroups

## Formulas

### Sigma Estimation

**R-bar method (n=2-10):**
```
σ = R̄ / d2(n)
```

**S-bar method (n>10):**
```
σ = S̄ / c4(n)
```

**Moving Range (n=1):**
```
σ = MR̄ / d2(span)
```
where span is typically 2

### Control Limits

**X-bar Chart:**
```
UCL = X̄ + A2 · R̄
CL  = X̄
LCL = X̄ - A2 · R̄
```

**R Chart:**
```
UCL = D4 · R̄
CL  = R̄
LCL = D3 · R̄
```

**Individuals Chart (n=1):**
```
UCL = X̄ + 3σ
CL  = X̄
LCL = X̄ - 3σ
```
where σ = MR̄ / d2(2) = MR̄ / 1.128

**Moving Range Chart:**
```
UCL = D4 · MR̄ = 3.267 · MR̄
CL  = MR̄
LCL = D3 · MR̄ = 0
```

## Examples

### Example 1: X-bar R Chart (n=5)

Given:
- X̄ = 100.0
- R̄ = 5.0

Constants (n=5):
- d2 = 2.326
- A2 = 0.577
- D3 = 0.000
- D4 = 2.114

Calculations:
```
σ = R̄/d2 = 5.0/2.326 = 2.150

X-bar Chart:
  UCL = 100.0 + 0.577(5.0) = 102.885
  CL  = 100.0
  LCL = 100.0 - 0.577(5.0) = 97.115

R Chart:
  UCL = 2.114(5.0) = 10.570
  CL  = 5.0
  LCL = 0.000(5.0) = 0.000
```

### Example 2: I-MR Chart (n=1)

Given:
- X̄ = 50.0
- MR̄ = 3.0

Constants (span=2):
- d2 = 1.128
- D3 = 0.000
- D4 = 3.267

Calculations:
```
σ = MR̄/d2 = 3.0/1.128 = 2.660

Individuals Chart:
  UCL = 50.0 + 3(2.660) = 57.980
  CL  = 50.0
  LCL = 50.0 - 3(2.660) = 42.020

MR Chart:
  UCL = 3.267(3.0) = 9.801
  CL  = 3.0
  LCL = 0.000
```

### Example 3: S-bar Chart (n=15)

Given:
- X̄ = 200.0
- S̄ = 4.0

Constants (n=15):
- c4 = 0.9823

Calculations:
```
σ = S̄/c4 = 4.0/0.9823 = 4.072

Control Limits:
  UCL = 200.0 + 3(4.072) = 212.216
  CL  = 200.0
  LCL = 200.0 - 3(4.072) = 187.784
```

## References

1. **ASTM E2587-16** - Standard Practice for Use of Control Charts in Statistical Process Control
2. **NIST/SEMATECH e-Handbook of Statistical Methods**
   - Section 6.3.2: What are Variables Control Charts?
   - https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc32.htm
3. **ISO 7870-2:2013** - Control charts — Part 2: Shewhart control charts
4. **Montgomery, D.C.** - Introduction to Statistical Quality Control, 7th Edition

## Implementation

In OpenSPC, access these constants via:

```python
from openspc.utils import get_d2, get_c4, get_A2, get_D3, get_D4

d2_value = get_d2(5)  # Returns 2.326
c4_value = get_c4(10)  # Returns 0.9727
```

For complete API documentation, see: [BE-003 Statistical Utilities](BE-003-Statistical-Utilities.md)
