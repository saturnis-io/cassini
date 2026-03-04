# Chart Type Showcase — Demo Companion Guide

## Overview

This seed creates characteristics configured for every control chart type Cassini supports. Use it to compare chart types side by side and explain when each is appropriate. Ideal for technical evaluations where the prospect wants to see breadth of chart support.

**Login:** `admin` / `password`

## Chart Type Comparison

| Chart | Data Type | Subgroup Size | Best For |
|---|---|---|---|
| I-MR | Variable | n=1 | Destructive testing, slow processes, expensive measurements |
| X-bar R | Variable | 2-10 | Most common manufacturing SPC |
| X-bar S | Variable | >10 | Large subgroups where range is less efficient |
| CUSUM | Variable | Any | Small sustained shifts (< 1.5 sigma) |
| EWMA | Variable | Any | Drift detection with noise smoothing |
| p | Attribute | Variable | Proportion defective (variable sample size) |
| np | Attribute | Fixed | Count defective (fixed sample size) |
| c | Attribute | Fixed | Defects per unit (fixed inspection area) |
| u | Attribute | Variable | Defects per unit (variable inspection area) |

## Walkthrough

### 1. I-MR (Individuals and Moving Range)

> Find the **I-MR** characteristic on the dashboard.

- **Top panel:** Individual values with UCL/LCL based on moving range.
- **Bottom panel:** Moving range (consecutive differences) with its own UCL.
- Control limits: X-bar +/- 2.66 * MR-bar (using d2=1.128 for n=2 moving range).

**When to use:** Each measurement is a single value — no subgrouping possible. Examples: one batch per day, destructive tests, environmental readings.

### 2. X-bar R (Mean and Range)

> Find the **X-bar R** characteristic.

- **Top panel:** Subgroup means with UCL/LCL.
- **Bottom panel:** Subgroup ranges with UCL (LCL = 0 for n < 7).
- Limits use A2, D3, D4 constants based on subgroup size.

**When to use:** The workhorse of manufacturing SPC. Multiple measurements per subgroup (e.g., 5 parts per hour). Subgroups of 2-10.

**Compared to X-bar S:** Range is simpler to compute (max - min) and sufficient for small subgroups. For n > 10, range loses efficiency and standard deviation is preferred.

### 3. X-bar S (Mean and Standard Deviation)

> Find the **X-bar S** characteristic.

- **Top panel:** Subgroup means (same as X-bar R).
- **Bottom panel:** Subgroup standard deviations with UCL/LCL.
- Limits use A3, B3, B4 constants.

**When to use:** Subgroups larger than 10. Also preferred when automation makes standard deviation computation trivial (CMMs, automated gages).

### 4. CUSUM (Cumulative Sum)

> Find the **CUSUM** characteristic.

- Plots cumulative deviations from the target mean.
- Decision interval H and allowance K control sensitivity.
- The chart "remembers" all past deviations — a small persistent shift accumulates into a detectable signal.

**When to use:** Detecting small shifts (0.5-1.5 sigma) that Shewhart charts miss. High-precision processes, chemical manufacturing, semiconductor.

### 5. EWMA (Exponentially Weighted Moving Average)

> Find the **EWMA** characteristic.

- Plots a weighted average where recent points have more weight.
- Lambda parameter controls the weighting: lower = more smoothing.
- Control limits are tighter than Shewhart because averaging reduces variance.

**When to use:** Noisy processes where you need to see through the noise. Gradual drift detection. Complementary to CUSUM.

### 6. Attribute Charts (p / np / c / u)

> Find the attribute characteristics (defect rate, defect count).

**p-chart (proportion defective):**
- Variable sample size allowed. Limits adjust per subgroup.
- Plot: fraction defective per lot.

**np-chart (count defective):**
- Fixed sample size required. Simpler than p-chart.
- Plot: number of defective items.

**c-chart (defects per unit):**
- Fixed inspection area. Counts defects (not defectives).
- Example: scratches per windshield.

**u-chart (defects per unit rate):**
- Variable inspection area. Rate-based.
- Example: defects per square meter when panel sizes vary.

### 7. Side-by-Side Comparison

For a powerful demo moment, open two browser tabs:

1. An **I-MR** chart and an **X-bar R** chart on similar data.
2. Point out how subgrouping in X-bar R narrows the control limits (sigma / sqrt(n) effect).
3. Show how a shift that is invisible on I-MR is caught immediately on X-bar R.

Then compare:
1. A **Shewhart** chart (X-bar R) and a **CUSUM** chart on the same data.
2. The Shewhart chart shows random variation. The CUSUM reveals a small upward trend that has been accumulating over 20+ subgroups.

## Quick Reference Checklist

- [ ] I-MR — individual values, moving range, d2 constant
- [ ] X-bar R — subgroup means, range, A2/D3/D4 constants
- [ ] X-bar S — subgroup means, std dev, A3/B3/B4 constants
- [ ] CUSUM — cumulative sum, H/K parameters
- [ ] EWMA — weighted average, lambda smoothing
- [ ] p-chart — proportion defective, variable sample size
- [ ] np-chart — count defective, fixed sample size
- [ ] c-chart — defects per unit, fixed area
- [ ] u-chart — defect rate, variable area
- [ ] Show Your Work — click any limit or statistic for formula trace
