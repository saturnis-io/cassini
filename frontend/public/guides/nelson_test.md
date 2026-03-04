# Nelson Rules Test — Demo Companion Guide

## Overview

This seed generates deliberate patterns that trigger each of the 8 Western Electric / Nelson rules. Use it to verify that Cassini correctly detects and annotates every rule, and to explain what each rule means to evaluators.

**Login:** `admin` / `password`

## The 8 Nelson Rules

| Rule | Name | Pattern | Detection Window |
|---|---|---|---|
| 1 | Beyond 3-sigma | One point beyond 3 standard deviations | Single point |
| 2 | Run of 9 | 9+ consecutive points on same side of center | 9 points |
| 3 | Trend of 6 | 6+ consecutive points steadily increasing or decreasing | 6 points |
| 4 | Alternating 14 | 14+ consecutive points alternating up and down | 14 points |
| 5 | 2 of 3 beyond 2-sigma | 2 out of 3 consecutive points beyond 2 sigma (same side) | 3 points |
| 6 | 4 of 5 beyond 1-sigma | 4 out of 5 consecutive points beyond 1 sigma (same side) | 5 points |
| 7 | 15 within 1-sigma | 15 consecutive points within 1 sigma of center (hugging) | 15 points |
| 8 | 8 beyond 1-sigma | 8 consecutive points beyond 1 sigma (both sides) | 8 points |

## Walkthrough

### 1. Rule 1 — Beyond 3-Sigma (Outlier)

> Find the characteristic labeled for Rule 1 testing.

- Look for a single red point beyond the upper or lower control limit.
- This is the most basic rule — a single extreme value.
- **Why it matters:** A 3-sigma exceedance has a 0.27% probability under normal variation. It almost certainly indicates a special cause.

### 2. Rule 2 — Run of 9 (Shift)

> Find the Rule 2 characteristic.

- Count 9+ consecutive points all above (or all below) the center line.
- The probability of 9 points on the same side by chance is (0.5)^9 = 0.2%.
- **Why it matters:** Indicates the process mean has shifted. Common cause: tool wear, material batch change.

### 3. Rule 3 — Trend of 6 (Drift)

> Find the Rule 3 characteristic.

- Look for 6+ points steadily increasing or steadily decreasing — no reversals.
- **Why it matters:** A monotonic trend indicates a drifting process — tool wear, temperature ramp, chemical depletion.

### 4. Rule 4 — Alternating 14 (Oscillation)

> Find the Rule 4 characteristic.

- Count 14+ points that alternate: up, down, up, down with no two consecutive on the same side.
- **Why it matters:** Systematic oscillation suggests two interleaved processes (e.g., two spindles alternating, two cavity mold).

### 5. Rule 5 — 2 of 3 Beyond 2-Sigma (Warning)

> Find the Rule 5 characteristic.

- Within any window of 3 consecutive points, 2 fall beyond the 2-sigma line on the same side.
- This is a "warning zone" rule — the process is not yet out of control but is trending toward it.

### 6. Rule 6 — 4 of 5 Beyond 1-Sigma (Bias)

> Find the Rule 6 characteristic.

- Within any 5 consecutive points, 4 are beyond 1-sigma on the same side.
- **Why it matters:** The process is consistently off-center, even if still within control limits.

### 7. Rule 7 — 15 Within 1-Sigma (Stratification)

> Find the Rule 7 characteristic.

- 15 consecutive points all hugging the center line (within +/- 1 sigma).
- Counter-intuitively, too little variation is also a problem.
- **Why it matters:** Often indicates mixed data from multiple sources, improper subgrouping, or a control chart computed from the wrong sigma.

### 8. Rule 8 — 8 Beyond 1-Sigma Both Sides (Mixture)

> Find the Rule 8 characteristic.

- 8 consecutive points beyond 1-sigma, but alternating sides (some above +1sigma, some below -1sigma, none in the center zone).
- **Why it matters:** Indicates a bimodal process — two distinct populations mixed together. Common cause: two machines, two raw material lots.

## Verification Process

For each rule:
1. Open the characteristic and visually confirm the pattern in the chart.
2. Check the **Violations** panel — the rule number and affected indices should be listed.
3. Click a violation to highlight the offending points on the chart.
4. Use **Show Your Work** on any control limit to verify the sigma calculation.

## Quick Reference Checklist

- [ ] Rule 1 — single outlier beyond 3-sigma
- [ ] Rule 2 — run of 9 on same side
- [ ] Rule 3 — trend of 6 monotonic
- [ ] Rule 4 — 14 alternating points
- [ ] Rule 5 — 2 of 3 beyond 2-sigma
- [ ] Rule 6 — 4 of 5 beyond 1-sigma
- [ ] Rule 7 — 15 points hugging center
- [ ] Rule 8 — 8 points beyond 1-sigma both sides
- [ ] All violations annotated in violations panel
- [ ] Custom rule preset — change parameters and verify detection changes
