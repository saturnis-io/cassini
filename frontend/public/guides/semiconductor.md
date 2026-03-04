# Semiconductor Fab — Demo Companion Guide

## Overview

This seed models a semiconductor fabrication facility monitoring wafer-level processes. It highlights Laney correction for overdispersed attribute data, CUSUM for critical dimension (CD) drift, multivariate analysis, and non-normal distribution handling for oxide thickness.

**Login:** `admin` / `password`
**Plant:** Semiconductor Fab (auto-selected)

## Walkthrough

### 1. Laney p'/u' for Particle Counts

> Navigate to the **Dashboard** and find the particle count characteristic.

Semiconductor fabs inspect thousands of die per wafer. With large sample sizes, traditional p-charts produce control limits that are far too tight, causing massive false alarms. This is **overdispersion**.

- The Laney p' chart adjusts limits by a sigma-z factor that accounts for extra-binomial variation.
- Look for the **sigma-z badge** on the chart — values significantly above 1.0 confirm overdispersion.
- Compare the Laney limits (wider) to what standard p-chart limits would be (shown in configuration).

**Talking point:** A fab running 10,000 die per wafer on a standard p-chart will flag nearly every lot. Laney correction fixes this without hiding real defect spikes.

| Sigma-z | Interpretation |
|---|---|
| ~1.0 | No overdispersion — standard p-chart is fine |
| 1.5-3.0 | Moderate overdispersion — Laney correction needed |
| > 3.0 | Severe — investigate assignable causes first |

### 2. CUSUM for CD Drift

> Find the **Critical Dimension** (CD) characteristic — likely a line width or gate length.

- CD control at the nanometer scale requires catching drift early — before the lot is scrapped.
- CUSUM accumulates deviations from target. A small but persistent etch drift shows up as a steadily rising cumulative sum.
- When the CUSUM crosses the decision interval H, a violation triggers.

**Why not EWMA?** CUSUM is preferred here because CD drift in etch processes is typically monotonic (one direction), and CUSUM is optimal for detecting sustained one-sided shifts.

### 3. Non-Normal Oxide Thickness

> Find the **Oxide Thickness** characteristic and open it.

- Oxide growth is bounded at zero and often follows a lognormal or Weibull distribution.
- Open **Analytics > Capability** for this characteristic.
- The distribution analysis modal shows:
  - Histogram with fitted distribution overlay
  - Q-Q plot comparing empirical vs. theoretical quantiles
  - Comparison table across candidate distributions (Normal, Lognormal, Weibull, Gamma, etc.)
- Capability indices (Cpk, Ppk) are computed using percentile-based methods instead of the normal assumption.

**Talking point:** Computing Cpk with a normal assumption on non-normal data gives dangerously optimistic results. Cassini auto-detects the best-fit distribution and adjusts.

### 4. Multivariate Analysis

> Navigate to **Analytics** in the sidebar.

- Semiconductor processes have correlated parameters — CD, sidewall angle, etch rate.
- The T-squared chart monitors all variables simultaneously.
- The correlation matrix shows pairwise relationships between characteristics.

**Why multivariate matters:** A CD that is within spec and an etch rate that is within spec can still indicate a process problem if their correlation structure has shifted.

### 5. Anomaly Detection on Wafer Data

> Return to any control chart and toggle **AI Insights** in the toolbar.

- PELT changepoint detection identifies regime changes in the process (e.g., after a chamber clean).
- Isolation Forest flags individual outlier wafers that deviate from the multivariate pattern.
- K-S distribution shift tests detect when the underlying process distribution has changed.

## Quick Reference Checklist

- [ ] Laney p'/u' — sigma-z badge, overdispersion correction, large sample sizes
- [ ] CUSUM — CD drift detection, H/K parameters, one-sided shift
- [ ] Non-normal capability — distribution fitting, Q-Q plot, percentile Cpk
- [ ] Multivariate — T-squared chart, correlation matrix
- [ ] Anomaly detection — PELT changepoints, isolation forest, K-S shifts
- [ ] Show Your Work — verify Cpk computation uses non-normal percentile method
