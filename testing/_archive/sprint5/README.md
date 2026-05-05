# Sprint 5: Statistical Credibility — Verification Checklist

**Status**: Complete
**Branch**: `feature/sprint1-visual-impact`
**Migration**: 032
**Features**: A1 Non-Normal Capability, A2 Custom Run Rules, A3 Laney p'/u' Charts

---

## A1: Non-Normal Capability Analysis

**Seed plant**: "A1: Distribution Fitting" with 6 characteristics

### Distribution Method Assignment

- [ ] Normal baseline characteristic shows standard Cp/Cpk (no distribution override)
- [ ] Lognormal characteristic has `distribution_method='box_cox'` — verify Box-Cox lambda is stored in `box_cox_lambda` column
- [ ] Weibull characteristic has `distribution_method='distribution_fit'` — verify `distribution_params` JSON contains shape/scale parameters
- [ ] Gamma characteristic tests the percentile fallback path when parametric fitting fails
- [ ] Heavy-tailed characteristic tests the auto-cascade (Shapiro-Wilk -> Box-Cox -> distribution fit -> percentile)
- [ ] Pre-configured Box-Cox characteristic verifies stored `lambda=0.5` is used directly without re-estimation

### UI Verification

- [ ] CapabilityCard displays the distribution method badge (e.g., "Box-Cox", "Weibull Fit", "Percentile")
- [ ] CapabilityCard color coding works: green (Cpk >= 1.33), yellow (1.0-1.33), red (< 1.0)
- [ ] Distribution Analysis modal opens from CapabilityCard action button
- [ ] Modal shows histogram with fitted distribution overlay
- [ ] Modal shows Q-Q plot comparing empirical vs theoretical quantiles
- [ ] Modal shows comparison table with all fitted distributions ranked by AIC/BIC

### API Verification

- [ ] `GET /api/v1/distributions/{char_id}/analysis` returns distribution fit results
- [ ] `GET /api/v1/distributions/{char_id}/fit` triggers fresh fit and returns parameters
- [ ] `PUT /api/v1/distributions/{char_id}/method` updates the stored distribution method

---

## A2: Custom Run Rules

**Seed plant**: "A2: Custom Run Rules" with 5 characteristics

### Preset Behavior

- [ ] Nelson preset characteristic triggers violations at expected sample indices (standard Nelson 8-rule set)
- [ ] AIAG preset characteristic uses 7-consecutive rule (not Nelson's 9-consecutive) for Run Rule 2
- [ ] RulesTab shows preset selector dropdown with all 4 built-in presets (Nelson, AIAG, WECO, Wheeler)

### Custom Parameters

- [ ] Custom `sigma_multiplier=2.5` characteristic fires Rule 1 when data reaches 2.7 sigma (but not 2.4 sigma)
- [ ] Custom `count=3, window=4` rule fires correctly — 3 out of 4 consecutive points beyond 1 sigma
- [ ] Selective-enable characteristic (only Rule 1 enabled) shows only Rule 1 violations, no others

### UI Verification

- [ ] RulesTab parameter editor appears when "Custom" preset is selected
- [ ] Each Nelson rule shows its parameters (sigma_multiplier, count, window as applicable)
- [ ] Changing a parameter value and saving persists to the database
- [ ] Switching presets updates the parameter display immediately
- [ ] Chart violations update after rule configuration change (may require re-fetch)

### API Verification

- [ ] `GET /api/v1/rule-presets` returns all 4 built-in presets
- [ ] `GET /api/v1/rule-presets/{id}` returns preset detail with all rule parameters
- [ ] `POST /api/v1/rule-presets` creates a custom preset
- [ ] `PUT /api/v1/rule-presets/{id}` updates custom preset (built-in presets are read-only)

---

## A3: Laney p'/u' Charts

**Seed plant**: "A3: Laney Charts" with 4 attribute characteristics

### Sigma-Z Verification

- [ ] Overdispersed p-chart shows sigma_z badge with value approximately 1.8
- [ ] Underdispersed p-chart shows sigma_z badge with value approximately 0.6
- [ ] Sigma_z badge is visible on the chart header or legend area

### Limit Comparison

- [ ] Overdispersed p-chart: Laney limits are wider than standard binomial limits
- [ ] Underdispersed p-chart: Laney limits are tighter than standard binomial limits
- [ ] No-Laney baseline characteristic (same data, `use_laney_correction=false`) shows standard limits for comparison
- [ ] u-chart with overdispersion shows Laney correction applied (wider limits than standard Poisson)

### UI Verification

- [ ] LimitsTab shows "Use Laney Correction" checkbox
- [ ] Toggling Laney correction on/off recalculates and redraws limits
- [ ] Per-point control limits render correctly (Laney charts have varying limits per subgroup)
- [ ] AttributeChart component handles both standard and Laney mode without errors

---

## Quick Smoke Test

Run through these 5 items for a fast confidence check:

1. [ ] Open "A1: Distribution Fitting" plant, pick the Lognormal characteristic, confirm CapabilityCard shows "Box-Cox" badge
2. [ ] Open "A2: Custom Run Rules" plant, pick the AIAG preset characteristic, confirm violations list shows Rule 2 at 7-count
3. [ ] Open "A3: Laney Charts" plant, pick overdispersed p-chart, confirm sigma_z badge shows ~1.8
4. [ ] Open Distribution Analysis modal on any A1 characteristic, confirm histogram renders
5. [ ] Open RulesTab on any A2 characteristic, confirm preset selector is populated
