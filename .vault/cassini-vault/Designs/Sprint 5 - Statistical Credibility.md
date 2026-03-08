---
type: design
status: complete
created: 2026-02-21
updated: 2026-03-06
sprint: "[[Sprints/Sprint 5 - Statistical Credibility]]"
tags: [design, complete]
---

# Sprint 5: Statistical Credibility

Three features closing the statistical credibility gap: non-normal capability analysis, custom run rules with industry presets, and Laney p'/u' overdispersion correction.

## Features

- **A1**: Non-Normal Capability Analysis
- **A2**: Custom Run Rules & Presets
- **A3**: Laney p'/u' Charts

## Migration 032

Single migration covering all three features:

| Target | Changes |
|--------|---------|
| `characteristic` | +`distribution_method`, +`box_cox_lambda`, +`distribution_params`, +`use_laney_correction` |
| `characteristic_rules` | +`parameters` (JSON) |
| New: `rule_preset` | Stores named rule configurations with 4 built-in presets |

## A1: Non-Normal Capability Analysis

### Architecture

New module `core/distributions.py` with `DistributionFitter` class supporting 6 distribution families: Normal, Lognormal, Weibull, Gamma, Johnson SU, Johnson SB.

### Auto-Cascade Method ("auto" mode)

1. **Shapiro-Wilk normality test** (p >= 0.05 -> normal method)
2. **Box-Cox transformation** (requires all values > 0; transform data + spec limits)
3. **Distribution fitting** (best fit by AIC from candidate families)
4. **Percentile method** (fallback -- always computed for comparison)

### Key Formulas

- **Box-Cox**: y(lambda) = (x^lambda - 1) / lambda (lambda != 0), ln(x) (lambda = 0). Spec limits transformed consistently.
- **Percentile**: Pp = (USL - LSL) / (P99.865 - P0.135), Ppk = min of upper/lower using P50 (median)
- **Distribution fitting**: MLE parameter estimation, AIC = 2k - 2ln(L) for model selection, Anderson-Darling goodness-of-fit

### API Endpoints

- `POST /characteristics/{id}/capability/nonnormal` -- Compute with method selection
- `POST /characteristics/{id}/capability/fit-distribution` -- Rank all candidate fits
- `PUT /characteristics/{id}/distribution-config` -- Save preferred method

### Frontend

- `DistributionAnalysis.tsx` -- Modal with histogram + fitted curve overlay, Q-Q plot, comparison table, "Apply" button
- `CapabilityCard.tsx` -- Enhanced with distribution method badge and side-by-side normal vs adjusted indices

## A2: Custom Run Rules & Presets

### Architecture

All 8 Nelson rule classes parameterized via `__init__(params=None)`. Each rule reads from a params dict with sensible defaults matching standard Nelson (1984).

### Industry Presets

| Preset | Key Differences from Standard Nelson |
|--------|--------------------------------------|
| **Nelson (Standard)** | All 8 rules, standard parameters |
| **AIAG** | Rule 2 uses 7 consecutive (not 9) |
| **Western Electric** | Rules 1-6 only, Rule 2 uses 8 consecutive |
| **Wheeler** | Rules 1-4 only, Rule 2 uses 8 consecutive |

### `NelsonRuleLibrary` Changes

- `create_from_config(rule_configs)` -- Rebuild rules from per-rule JSON config
- Backward compatible: `__init__(params=None)` means all existing call sites unaffected

### API Endpoints

- `GET/POST /rule-presets` -- List/create presets
- `PUT /characteristics/{id}/rules/preset` -- Apply preset to characteristic
- `PUT /characteristics/{id}/rules` -- Now accepts `parameters` field per rule

### Frontend

- Rules tab: Preset dropdown (Nelson/AIAG/WECO/Wheeler/Custom) at top
- Per-rule expandable parameter sections (consecutive count, sigma multiplier, count/window)
- "Save as Preset" for custom configurations

## A3: Laney p'/u' Charts

### Mathematical Foundation (Laney, 2002)

1. Calculate standard p-chart residuals: Z_i = (p_i - p-bar) / sqrt(p-bar(1-p-bar)/n_i)
2. Compute sigma_z from moving range: sigma_z = MR-bar / d2 (d2 = 1.128)
3. Corrected limits: UCL_i = p-bar + 3 * sigma_z * sqrt(p-bar(1-p-bar)/n_i)

**Interpretation**: sigma_z ~ 1.0 means no overdispersion (standard limits correct); sigma_z > 1.0 means overdispersion (wider limits, fewer false alarms).

### Backend

- `calculate_laney_sigma_z()` and `get_per_point_limits_laney()` added to `attribute_engine.py`
- Integrated into `process_attribute_sample()` when `use_laney_correction=True`
- Returns `sigma_z` in `AttributeProcessingResult`

### Frontend

- `LimitsTab.tsx`: Laney checkbox (only shown for p/u charts)
- `AttributeChart.tsx`: sigma_z badge with color-coded interpretation

## Execution Model

Migration-first, then 3 parallel full-stack agents (A1 Opus + A2 Sonnet + A3 Sonnet), followed by Opus skeptic review.

## Skeptic Findings (Fixed)

- 3 BLOCKERs: Custom params not applied in SPC engine, Box-Cox Cp==Pp wrong sigma, no param validation
- 4 WARNINGs: USL<=LSL guard, Shapiro-Wilk random sample for n>5000, p-chart UCL cap at 1.0, param bounds
