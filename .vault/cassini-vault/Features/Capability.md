---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/Sprint 2 - Production Polish]]"
tags:
  - feature
  - active
aliases:
  - Non-Normal Capability
  - Process Capability
---

# Capability

Calculates process capability indices (Cp, Cpk, Pp, Ppk, Cpm) with support for normal and non-normal distributions. Includes distribution fitting (6 families), Box-Cox transformation, Shapiro-Wilk normality testing, and capability history snapshots for trend tracking.

## Key Backend Components

- **Capability Service**: `core/capability.py` -- `calculate_capability()`, `calculate_capability_nonnormal()`, `save_capability_snapshot()`
- **Distribution Fitter**: `core/distributions.py` -- `DistributionFitter.fit()`, 6 families (normal, lognormal, weibull, gamma, exponential, beta), auto-cascade (Shapiro-Wilk -> Box-Cox -> dist fit -> percentile)
- **Model**: `CapabilityHistory` in `db/models/capability.py`
- **Router**: `api/v1/capability.py` (3 endpoints), `api/v1/distributions.py` (3 endpoints)
- **Repository**: `db/repositories/capability.py`
- **Migrations**: 025 (capability_history), 032 (distribution fields on characteristic)

## Key Frontend Components

- `CapabilityCard.tsx` -- displays Cp/Cpk/Pp/Ppk with color coding and Cpk trend chart
- `DistributionAnalysis.tsx` -- modal with histogram, Q-Q plot, comparison table for distribution fitting
- Hooks: `useCapability`, `useCapabilityHistory`, `useSaveCapabilitySnapshot`, `useFitDistribution`

## Connections

- Depends on [[SPC Engine]] for sample/measurement data
- Integrates with [[Reporting]] (capability values in generated reports via `ReportPreview`)
- Explainable via Show Your Work -- see [[Architecture/System Overview]]
- Non-normal capability added in [[Sprints/Sprint 5 - Statistical Credibility]]

## Known Limitations

- GET capability must dispatch to `calculate_capability_nonnormal()` when `distribution_method` is set and not "normal"
- Box-Cox transform must use different sigma for Cp vs Pp (fixed in Sprint 5 skeptic review)
- Shapiro-Wilk limited to 5000 samples per scipy constraint
- USL must be greater than LSL (validation enforced)
