---
type: sprint
status: complete
created: 2026-03-06
updated: 2026-03-06
branch: feature/sprint1-visual-impact
started: 2026-02-22
completed: 2026-02-22
features:
  - "[[Features/Non-Normal Capability]]"
  - "[[Features/Custom Run Rules]]"
  - "[[Features/Laney Correction]]"
decisions: []
migration_range: "032"
tags:
  - sprint
  - complete
  - phase-a
  - statistical-credibility
aliases:
  - Sprint 5
---

## Overview

Sprint 5 delivered statistical credibility features that closed the non-normal capability gap identified in competitive analysis. The sprint added non-normal distribution fitting (6 families with auto-cascade), fully parameterized Nelson rules with industry presets, and Laney p'/u' overdispersion correction for attribute charts. Executed by a 4-agent parallel team in approximately 10 minutes.

## Features Delivered

- **A1 Non-Normal Capability** ([[Features/Non-Normal Capability]])
  - `core/distributions.py` — DistributionFitter with 6 distribution families
  - Auto-cascade fitting: Shapiro-Wilk -> Box-Cox -> distribution fit -> percentile fallback
  - 3 new API endpoints for distribution analysis
  - `DistributionAnalysis.tsx` modal with histogram, Q-Q plot, and comparison table
  - CapabilityCard enhancements for non-normal display

- **A2 Custom Run Rules** ([[Features/Custom Run Rules]])
  - All 8 Nelson rules parameterized with `__init__(params=None)`
  - `NelsonRuleLibrary.create_from_config()` factory
  - `rule_preset` table with 4 built-in presets: Nelson, AIAG, WECO, Wheeler
  - 4 preset API endpoints
  - RulesTab preset selector + parameter editor UI

- **A3 Laney p'/u'** ([[Features/Laney Correction]])
  - `calculate_laney_sigma_z()` + `get_per_point_limits_laney()` in `attribute_engine.py`
  - Sigma-Z badge display in `AttributeChart.tsx`
  - Laney correction checkbox in `LimitsTab.tsx`

## Key Commits

| Hash | Description |
|------|-------------|
| `1b1154d` | Sprint 5 commit 1 |
| `eadff32` | Sprint 5 commit 2 |
| `5420ba8` | Sprint 5 commit 3 |
| `ca14f5a` | Sprint 5 commit 4 |
| `1d56013` | Sprint 5 commit 5 |

## Migration

**Migration 032** added the following columns and tables:
- `characteristic` table: `distribution_method`, `box_cox_lambda`, `distribution_params`, `use_laney_correction`
- `characteristic_rules` table: `parameters` column
- New `rule_preset` table (4 built-in presets seeded)

## Codebase Impact

- **Backend models**: characteristic extended, new rule_preset model
- **Backend modules**: `core/distributions.py` (new), attribute_engine.py extended
- **API endpoints**: 3 distribution + 4 preset = 7 new endpoints
- **Frontend components**: DistributionAnalysis.tsx (new), CapabilityCard enhanced, RulesTab enhanced, LimitsTab enhanced, AttributeChart enhanced
- **Dependencies**: scipy, numpy (already present -- no new deps)

## Skeptic Review

Adversarial review by Opus skeptic agent found and resolved:

**3 BLOCKERs fixed:**
1. Custom parameters not actually applied in SPC engine execution path
2. Box-Cox transform producing Cp == Pp (wrong sigma used)
3. No parameter validation on custom rule parameters

**4 WARNINGs fixed:**
1. USL <= LSL not rejected
2. Shapiro-Wilk applied to full dataset instead of random sample (performance)
3. p-chart UCL not capped at 1.0
4. Parameter bounds not enforced (e.g., negative sigma multipliers)

**3 SUGGESTIONs documented** (deferred to backlog)

## Lessons Learned

- Capability GET endpoint must dispatch to `calculate_capability_nonnormal()` when `characteristic.distribution_method` is set and not "normal" -- same applies to `save_capability_snapshot`
- Backend config validation: `use_laney_correction` only valid for p/u charts -- must validate both directions
- Attribute Nelson rules: backend intersects with {1,2,3,4} -- rules 5-8 silently ignored; RulesTab must filter display by dataType
- See [[Lessons/Lessons Learned]] for full cross-sprint patterns
