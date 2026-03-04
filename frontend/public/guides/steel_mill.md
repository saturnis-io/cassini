# Steel Mill — Demo Companion Guide

## Overview

This seed models a steel rolling mill monitoring strip thickness and furnace temperature. It demonstrates advanced control chart types (CUSUM, EWMA) for detecting slow drift in continuous processes, shift handoff patterns, and custom rule presets.

**Login:** `admin` / `password`
**Plant:** Steel Mill (auto-selected)

## Walkthrough

### 1. Dashboard — Continuous Process Monitoring

> Login and navigate to the **Dashboard**.

- You will see characteristics for **Strip Thickness** and **Furnace Temperature**.
- Strip Thickness uses a CUSUM chart — ideal for detecting small, persistent shifts that X-bar charts miss.
- Furnace Temperature uses an EWMA chart — smooths out noise to reveal thermal drift over time.

**Talking point:** In steel mills, a 0.02mm thickness drift costs thousands per coil. Traditional Shewhart charts only catch large shifts (1.5-2 sigma). CUSUM catches 0.5-sigma drift within 10-15 samples.

### 2. CUSUM Chart Deep Dive

> Click into the **Strip Thickness** characteristic.

- The CUSUM chart plots cumulative deviations from the target mean.
- Look for the V-mask or tabular CUSUM boundaries (H = decision interval).
- When the cumulative sum exceeds H, a violation fires.
- Check the violations panel — these represent confirmed drift events.

**Key parameters:**
| Parameter | Typical Value | Purpose |
|---|---|---|
| K (allowance) | 0.5 sigma | Minimum shift to detect |
| H (decision interval) | 4-5 sigma | Sensitivity threshold |
| Target | Process nominal | Reference value |

### 3. EWMA Chart for Furnace Temperature

> Navigate to the **Furnace Temperature** characteristic.

- EWMA applies exponential weighting — recent points matter more.
- The lambda parameter controls smoothing: lower lambda = more smoothing = better for small shifts.
- Control limits narrow compared to Shewhart because EWMA reduces variance.

**Talking point:** Furnace temperature drifts slowly as refractory lining degrades. EWMA with lambda=0.1 detects a 0.5-degree drift before operators notice.

### 4. Custom Rule Presets

> Open **Configuration**, select any characteristic, go to the **Rules** tab.

- Cassini ships 4 built-in presets: Nelson (all 8 rules), AIAG, WECO, Wheeler.
- This seed uses a custom steel-mill preset that emphasizes trend detection (Rules 3, 4) and zone violations (Rules 5, 6).
- Show how individual rule parameters can be tuned — e.g., increasing the run length for Rule 2 from 9 to 12 on noisy processes.

### 5. Shift Handoff Patterns

> Return to the dashboard and look at the time axis.

- Data clusters correspond to 8-hour shifts.
- Use the time-axis zoom to compare shift A vs. shift B performance.
- If the CUSUM resets between shifts, each crew starts clean — a policy decision visible in the chart configuration.

**Talking point:** Some mills reset CUSUM at shift change to avoid blaming the incoming crew for prior drift. Others keep it running to catch cross-shift degradation.

## Quick Reference Checklist

- [ ] CUSUM chart — cumulative sum, H/K parameters, drift detection
- [ ] EWMA chart — smoothing lambda, narrower limits, thermal drift
- [ ] Custom rule presets — steel-mill tuning, parameter editor
- [ ] Shift patterns — time-axis zoom, 8-hour clusters
- [ ] Violations panel — drift events with timestamps and severity
- [ ] Show Your Work — click any CUSUM/EWMA statistic for formula trace
