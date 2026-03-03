# SPC Domain Audit -- Skeptic Review

Date: 2026-03-02
Auditor: Independent SPC domain expert review (Claude Opus 4.6)
Scope: All statistical engine code in `backend/src/cassini/core/` and `backend/src/cassini/utils/`

## Executive Summary

The Cassini SPC platform demonstrates solid foundational implementation of core SPC calculations. Control limit formulas for variable and attribute charts, Nelson Rules, capability indices, and MSA ANOVA are structurally correct against AIAG SPC 2nd Edition and MSA 4th Edition references. However, the audit identified **3 HIGH**, **8 MEDIUM**, and **7 LOW** severity findings spanning incorrect constants, missing sigma estimation methods, edge-case handling gaps, and compliance shortfalls that would be flagged during automotive/aerospace/medical device qualification audits.

---

## Findings

---

### [STATISTICAL CORRECTNESS] F-01: Constants Table n=1 row has incorrect d2 and A2 values

**Severity**: HIGH
**Location**: `backend/src/cassini/utils/constants.py:34`
**Description**: The constants table entry for `n=1` sets `d2=1.128` and `A2=2.660`. The value d2=1.128 is actually the constant for n=2 (moving range of span 2). For n=1 there is no meaningful "range within a subgroup" -- the d2 constant does not apply in the same way. The A2=2.660 value corresponds to A2 for n=2 in some older table conventions. While n=1 is typically handled by the I-MR path (which correctly uses span=2 and d2=1.128 via `calculate_imr_limits`), having a row for n=1 with these values creates a risk: any code path that naively calls `get_d2(1)` or `get_A2(1)` will get values that appear plausible but are semantically incorrect for an individuals chart.

**Standard Reference**: ASTM E2587, NIST/SEMATECH Engineering Statistics Handbook Table 6.3.2. The d2 constant is defined for subgroup sizes n>=2. For individuals, sigma estimation uses moving range with span m (usually m=2), and d2(m=2)=1.128.

**Evidence**: In `constants.py:34`:
```python
1: SpcConstants(n=1, d2=1.128, c4=0.7979, A2=2.660, D3=0.0, D4=3.267),
```
The c4=0.7979 is also the value for n=2, not n=1. The c4 for n=1 is undefined (division by zero in the c4 formula: `c4 = sqrt(2/(n-1)) * gamma(n/2) / gamma((n-1)/2)` which has `gamma(0)` = infinity for n=1).

**Knock-on Effects if Addressed**: The `estimate_sigma_rbar` function already guards `subgroup_size < 2`, so fixing this row would primarily prevent silent misuse. No current code path appears to call `get_d2(1)` for sigma estimation, so runtime impact is low.

**Recommendation**: Either remove the n=1 row entirely (raising ValueError for callers), or clearly document that n=1 values are placeholders matching the n=2/span=2 moving range convention. Adding a comment would prevent future confusion.

---

### [STATISTICAL CORRECTNESS] F-02: X-bar S chart limit calculation uses sigma/sqrt(n) directly instead of A3*S-bar

**Severity**: HIGH
**Location**: `backend/src/cassini/core/engine/spc_engine.py:826-831`
**Description**: The `recalculate_limits` method for subgroup_size > 10 computes X-bar S chart limits as:
```python
ucl = x_double_bar + 3.0 * sigma / math.sqrt(char.subgroup_size)
lcl = x_double_bar - 3.0 * sigma / math.sqrt(char.subgroup_size)
```
where `sigma = estimate_sigma_sbar(stdevs, char.subgroup_size)` which returns `s_bar / c4`.

This is algebraically equivalent to `X-double-bar +/- A3 * S-bar` since `A3 = 3 / (c4 * sqrt(n))`, so the final X-bar limits ARE correct. However, this approach does NOT compute or return S-chart limits (UCL_S and LCL_S for the standard deviation chart). The method returns only the X-bar chart limits, meaning there is no S-chart limit calculation anywhere for subgroup_size > 10.

**Standard Reference**: AIAG SPC Manual 2nd Edition, Chapter 2: For X-bar/S charts, both the X-bar chart AND the S chart must have control limits. The S chart uses `UCL_S = B4*S-bar` and `LCL_S = B3*S-bar`.

**Evidence**: The `XbarRLimits` dataclass has `r_limits` for the range chart, but for subgroup_size > 10, the function returns a raw tuple `(x_double_bar, ucl, lcl)` instead of an `XbarRLimits` object, meaning S-chart limits (B3, B4 factors) are never computed. The B3 and B4 constants are also entirely absent from the constants table.

**Knock-on Effects if Addressed**: Would require adding B3/B4 constants to the table and returning S-chart limits alongside X-bar limits for large subgroups.

**Recommendation**: Add B3 and B4 constants to `constants.py` for n=2..25. Return `XbarRLimits` (or a new `XbarSLimits` dataclass) from the n>10 branch of `recalculate_limits` with proper S-chart limits.

---

### [STATISTICAL CORRECTNESS] F-03: CUSUM/EWMA sigma estimation uses sample standard deviation instead of within-subgroup estimator

**Severity**: HIGH
**Location**: `backend/src/cassini/core/engine/cusum_engine.py:140-148`, `backend/src/cassini/core/engine/ewma_engine.py:162-180`
**Description**: Both CUSUM and EWMA engines estimate sigma by computing the overall sample standard deviation (ddof=1) of all historical values when `stored_sigma` is not available. This uses overall variation (long-term sigma) rather than within-subgroup variation (short-term sigma via moving range / d2).

For CUSUM and EWMA charts, the correct sigma is the short-term within-subgroup estimate (R-bar/d2 or MR-bar/d2 for individuals), because these charts are designed to detect shifts AWAY from a stable baseline. Using overall sigma inflates the estimate if there are already shifts in the data, making the charts LESS sensitive to detecting those shifts -- exactly the opposite of their purpose.

**Standard Reference**: Montgomery, "Introduction to Statistical Quality Control" 8th Ed., Ch. 9 (CUSUM) and Ch. 10 (EWMA): "The standard deviation sigma should be estimated from the in-control Phase I data using the moving range method."

**Evidence**: In `ewma_engine.py:162-180`:
```python
def estimate_sigma_from_values(values: list[float]) -> float:
    n = len(values)
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / (n - 1)
    return math.sqrt(variance)
```
This is the overall standard deviation, not the within-subgroup estimate.

**Knock-on Effects if Addressed**: CUSUM and EWMA charts would become more sensitive when sigma is not pre-stored, potentially triggering more violations. Existing charts with stored_sigma would be unaffected.

**Recommendation**: When stored_sigma is unavailable, use `estimate_sigma_moving_range()` from `utils/statistics.py` for individuals data, or `estimate_sigma_rbar()` for subgroup data, rather than `np.std(ddof=1)`.

---

### [STATISTICAL CORRECTNESS] F-04: Percentile method Ppk uses asymmetric half-spreads instead of standard formula

**Severity**: MEDIUM
**Location**: `backend/src/cassini/core/distributions.py:367-377`
**Description**: The percentile-based capability calculation computes Ppk as:
```python
upper_half = p99_865 - p50
lower_half = p50 - p0_135
ppk_values = []
if usl is not None and upper_half > 0:
    ppk_values.append((usl - p50) / upper_half)
if lsl is not None and lower_half > 0:
    ppk_values.append((p50 - lsl) / lower_half)
ppk = min(ppk_values)
```

This uses asymmetric half-spreads (P50 to P99.865 and P0.135 to P50) rather than the full spread divided by 6. Some references use the full spread method: `Ppk = min((USL - median) / (P99.865 - P50), (median - LSL) / (P50 - P0.135))`. The implementation here is actually the MORE conservative and distribution-aware approach for skewed data, which is defensible. However, it differs from the simpler "equivalent normal" percentile method used by some commercial SPC tools (Minitab, JMP) which use `(P99.865 - P0.135)` as the spread denominator throughout.

**Standard Reference**: ISO 21747:2006 recommends the percentile method where `Pp = (USL - LSL) / (X_99.865 - X_0.135)` and `Ppk = min((USL - X_50) / (X_99.865 - X_50), (X_50 - LSL) / (X_50 - X_0.135))`. The implementation matches this standard.

**Evidence**: The Pp computation correctly uses `spread = p99_865 - p0_135`, but the Ppk half-spread approach, while technically more correct for skewed distributions, may produce different results from what users expect if they are comparing with Minitab output using the symmetric denominator.

**Knock-on Effects if Addressed**: Changing to symmetric denominator would give slightly different Ppk for skewed data. The current approach is more conservative.

**Recommendation**: LOW priority. Document that the percentile Ppk uses ISO 21747 asymmetric half-spread method. Optionally offer a toggle for symmetric vs asymmetric.

---

### [STATISTICAL CORRECTNESS] F-05: Box-Cox capability uses delta method for sigma_within transformation -- approximation may be poor

**Severity**: MEDIUM
**Location**: `backend/src/cassini/core/distributions.py:439-458`
**Description**: When computing Cp/Cpk on Box-Cox transformed data, the code transforms sigma_within using the delta method:
```python
deriv = abs(x_bar_orig ** (lmbda - 1.0))
sigma_within_t = sigma_within * deriv
```
The delta method `Var(g(X)) approx [g'(mu)]^2 * Var(X)` is a first-order Taylor approximation that works well when sigma is small relative to the mean but can be significantly biased for large coefficients of variation or extreme lambda values.

**Standard Reference**: No single standard governs this. Chou, Owen & Borrego (1990) recommend transforming individual data points and computing capability on the transformed scale rather than transforming sigma. Montgomery (2020) notes the delta method is "adequate for most practical applications."

**Evidence**: The code clamps lambda to |lambda| < 5 which helps, but for lambda values near 0 (log transform) with large CV, the approximation error can be material (>5% relative error in Cp/Cpk).

**Knock-on Effects if Addressed**: Would require storing or recomputing within-subgroup ranges on the transformed data, which changes the Cp calculation.

**Recommendation**: Document the approximation. For highest accuracy, consider re-estimating sigma_within on the transformed data by transforming subgroup ranges and using the range method on the transformed scale. This is a significant engineering effort for marginal improvement.

---

### [DOMAIN ANTI-PATTERN] F-06: Nelson Rule 2 (Shift) excludes points exactly ON the center line

**Severity**: MEDIUM
**Location**: `backend/src/cassini/core/engine/nelson_rules.py:174-181` and `backend/src/cassini/core/engine/attribute_engine.py:663-664`
**Description**: Rule 2 checks `all(v > center_line for v in last_n)` (strictly above) and `all(v < center_line for v in last_n)` (strictly below). Points exactly equal to the center line are excluded from both groups, meaning a sequence like [above, above, above, exactly_center, above, above, above, above, above] would NOT trigger Rule 2 even though 8 of 9 points are above and 1 is exactly on center.

The Nelson/WECO convention is ambiguous on this point. Some references say "same side of center line" which excludes points on the line. Others (including the AIAG SPC Manual) count points on the center line as belonging to neither side.

**Standard Reference**: Nelson (1984) original paper: "Nine points in a row on one side of the center line." AIAG SPC Manual: "9 points in a row on one side of the central line." Both are silent on the exact-center edge case.

**Evidence**: In `nelson_rules.py:174`:
```python
all_upper = all(p.zone in (Zone.ZONE_C_UPPER, Zone.ZONE_B_UPPER,
                            Zone.ZONE_A_UPPER, Zone.BEYOND_UCL) for p in last_n)
```
A point exactly at center_line is classified as `ZONE_C_UPPER` in `rolling_window.py:228`:
```python
elif value >= b.center_line:
    zone = Zone.ZONE_C_UPPER
```
So points exactly at center line ARE classified as upper, which means Rule 2 WILL fire if all 9 points are >= center_line. This is actually correct behavior for the zone-based implementation. However, the attribute engine at line 663-664 uses strict `>` comparison, creating inconsistency between the two engines.

**Knock-on Effects if Addressed**: Fixing attribute engine to use `>=` for consistency would marginally increase Rule 2 sensitivity.

**Recommendation**: Make the attribute engine's Rule 2 check consistent with the variable engine: use `>=` / `<=` (or equivalently, route through zone classification) to match the zone-based approach.

---

### [DOMAIN ANTI-PATTERN] F-07: No R-chart or S-chart Nelson Rules evaluation

**Severity**: MEDIUM
**Location**: `backend/src/cassini/core/engine/spc_engine.py` (entire file)
**Description**: The SPC engine processes Nelson Rules only on the X-bar (means) chart. There is no evaluation of rules on the R-chart (ranges) or S-chart (standard deviations). Out-of-control signals on the R/S chart indicate instability in process variation, which is a separate and important signal from mean shifts.

**Standard Reference**: AIAG SPC Manual 2nd Edition, Chapter 2: "Both the R chart and the X-bar chart should be interpreted for lack of control." The R chart should be evaluated FIRST because its control limits affect the X-bar chart limits.

**Evidence**: The `process_sample` method computes `range_value` but never evaluates it against R-chart control limits. The `RollingWindowManager` stores `range_value` in `WindowSample` but it is never used for rule checking.

**Knock-on Effects if Addressed**: Would require computing R-chart control limits (D3*R-bar, D4*R-bar), maintaining a separate rolling window for range values, and running Nelson Rules on the range chart. Would generate additional violations when process variation is unstable.

**Recommendation**: Implement R-chart (n<=10) and S-chart (n>10) rule evaluation. At minimum, implement Rule 1 (point beyond D3/D4 limits) on the range/sigma chart.

---

### [DOMAIN ANTI-PATTERN] F-08: Capability calculation does not validate USL > LSL

**Severity**: MEDIUM
**Location**: `backend/src/cassini/core/capability.py:44-67`
**Description**: The `calculate_capability()` function checks that at least one spec limit is provided, but does not verify that USL > LSL when both are given. If USL < LSL (data entry error), the function will compute negative Cp values without raising an error. The non-normal version at `distributions.py:580` DOES validate this: `if usl is not None and lsl is not None and usl <= lsl: raise ValueError(...)`. The inconsistency means normal capability silently produces nonsensical results while non-normal capability correctly rejects the inputs.

**Standard Reference**: AIAG SPC Manual 2nd Edition: "USL - LSL" is always a positive quantity representing the tolerance band.

**Evidence**: `capability.py:71` checks `if usl is None and lsl is None` but not the ordering.

**Knock-on Effects if Addressed**: Would reject invalid spec limit configurations earlier with a clear error message instead of producing negative capability indices.

**Recommendation**: Add `if usl is not None and lsl is not None and usl <= lsl: raise ValueError(...)` to `calculate_capability()` to match the non-normal version.

---

### [DOMAIN ANTI-PATTERN] F-09: Gage R&R %Tolerance uses 5.15 multiplier instead of 6.0

**Severity**: MEDIUM
**Location**: `backend/src/cassini/core/msa/engine.py:179`
**Description**: The `_build_result` function computes %Tolerance GRR as:
```python
pct_tolerance_grr = (5.15 * grr / tolerance) * 100.0
```
The 5.15 multiplier (5.15 sigma = 99% of the distribution) is AIAG MSA 4th Edition standard. However, some organizations and standards (including some automotive OEMs) require the 6.0 multiplier (6 sigma = 99.73%). The code hardcodes 5.15 with no option to use 6.0.

**Standard Reference**: AIAG MSA 4th Edition uses 5.15 (99% coverage). Some OEM-specific requirements (e.g., certain Ford STA documents) use 6.0. ISO/TR 12888:2021 discusses both conventions.

**Evidence**: `engine.py:179`: `pct_tolerance_grr = (5.15 * grr / tolerance) * 100.0`

**Knock-on Effects if Addressed**: Making the multiplier configurable would change %Tolerance values for any organization using the 6-sigma convention.

**Recommendation**: Make the GRR study sigma multiplier configurable (default 5.15, option for 6.0). This is a common request from automotive suppliers.

---

### [DOMAIN ANTI-PATTERN] F-10: Attribute MSA Kappa verdict thresholds are strict compared to AIAG guidance

**Severity**: MEDIUM
**Location**: `backend/src/cassini/core/msa/attribute_msa.py:167-173`
**Description**: The `_build_verdict` function uses:
```python
if fleiss_kappa_value >= 0.90: return "acceptable"
if fleiss_kappa_value >= 0.75: return "marginal"
return "unacceptable"
```
The AIAG MSA Manual 4th Edition does not define specific numeric Kappa thresholds for acceptability. Instead it states that attribute measurement system acceptability depends on agreement percentages (typically requiring >90% within-appraiser and >80% between-appraiser agreement). The Kappa thresholds used here (0.90/0.75) come from Landis & Koch (1977) benchmarks for "almost perfect" and "substantial" agreement, which are more stringent than what many quality engineers expect.

**Standard Reference**: AIAG MSA 4th Edition, Chapter 5 does not specify Kappa thresholds. Landis & Koch (1977) suggest 0.81-1.00 = "almost perfect", 0.61-0.80 = "substantial".

**Evidence**: Some organizations consider Kappa >= 0.75 acceptable. The 0.90 threshold for "acceptable" is very strict.

**Knock-on Effects if Addressed**: Loosening thresholds would change verdicts for borderline studies.

**Recommendation**: Make verdict thresholds configurable. Consider defaulting to 0.75 for acceptable and 0.40 for marginal, which better matches industry practice.

---

### [DATA INTEGRITY] F-11: Capability rounding to 4 decimal places may mask pass/fail boundary

**Severity**: MEDIUM
**Location**: `backend/src/cassini/core/capability.py:260-264`
**Description**: All capability indices are rounded to 4 decimal places via `_round_or_none(cp)`. A Cpk of 1.33004999... would round to 1.3300, while 1.33005... would round to 1.3301. If a customer specification requires Cpk >= 1.33, this 4-decimal rounding could cause a value of 1.329999... (which is truly below 1.33) to display as 1.3300, appearing to pass.

**Standard Reference**: AIAG SPC Manual recommends reporting capability indices to "appropriate precision" but does not specify. ISO 22514-2:2017 recommends "at least 2 decimal places."

**Evidence**: `capability.py:233`: `cp=_round_or_none(cp),` with `decimals=4`.

**Knock-on Effects if Addressed**: Changing precision would affect displayed values across the platform.

**Recommendation**: This is acceptable for most use cases. However, consider storing the full-precision value internally and only rounding for display. Pass/fail decisions should compare against the unrounded value.

---

### [COMPLIANCE] F-12: No confidence intervals on capability indices

**Severity**: MEDIUM
**Location**: `backend/src/cassini/core/capability.py` (entire file)
**Description**: The capability calculation returns point estimates (Cp, Cpk, etc.) without any confidence intervals or uncertainty quantification. For regulatory submissions (especially medical devices under 21 CFR 820 / ISO 13485), capability indices with confidence intervals are often required to demonstrate statistical rigor. A Cpk of 1.33 based on 30 samples has a much wider confidence interval than one based on 300 samples.

**Standard Reference**: AIAG SPC Manual 2nd Edition, Appendix: "Confidence intervals should be constructed for capability indices." ISO 22514-2:2017 Section 7.2: Confidence intervals for Cp and Cpk are required.

**Evidence**: The `CapabilityResult` dataclass has no fields for confidence bounds. The `sample_count` is returned but not used to compute intervals.

**Knock-on Effects if Addressed**: Would add upper/lower confidence bounds to all capability results. The formulas are well-established (chi-squared for Cp, noncentral t-distribution for Cpk).

**Recommendation**: Add optional confidence interval computation (e.g., 95% CI). At minimum, display the sample count prominently so users can assess statistical adequacy.

---

### [COMPLIANCE] F-13: Shapiro-Wilk test uses first 5000 samples instead of random subsample in capability.py

**Severity**: LOW
**Location**: `backend/src/cassini/core/capability.py:98`
**Description**: When n > 5000, the normality test uses `arr[:5000]` (first 5000 samples) rather than a random subsample. If the process had an initial transient (common during startup) or a shift partway through, the first 5000 samples may not be representative of the overall distribution. The non-normal version in `distributions.py:611` correctly uses `rng.choice(arr, size=5000, replace=False)`.

**Standard Reference**: Shapiro-Wilk implementation guidance generally recommends random subsampling to avoid temporal bias.

**Evidence**: `capability.py:98`: `test_sample = arr[:5000] if n > 5000 else arr`
vs. `distributions.py:611-612`:
```python
rng = np.random.default_rng(42)
test_sample = rng.choice(arr, size=5000, replace=False)
```

**Knock-on Effects if Addressed**: May change normality test results for large datasets with temporal structure.

**Recommendation**: Use the same random subsampling approach as `distributions.py`. Use a fixed seed (42) for reproducibility.

---

### [COMPLIANCE] F-14: FAI model separation-of-duties not enforced at database level

**Severity**: LOW
**Location**: `backend/src/cassini/api/v1/fai.py` (referenced, not fully read)
**Description**: Based on the MEMORY.md notes, FAI separation of duties (approver != submitter) is enforced via `submitted_by` column comparison at the API level. AS9102 Rev C requires that the person approving the FAI report is different from the person who prepared/submitted it. If enforcement is only at the API level, a direct database modification could bypass this control.

**Standard Reference**: AS9102 Rev C, Section 4.4: "The person approving the FAI shall be other than the person(s) who performed the inspection."

**Knock-on Effects if Addressed**: Adding a database constraint would require a migration.

**Recommendation**: Add a CHECK constraint or application-level double-check at the database layer. For most deployments, API-level enforcement is sufficient if database access is properly restricted.

---

### [SHOW YOUR WORK] F-15: Explain API capability mode uses sigma of means for dashboard, creating Cp == Pp

**Severity**: LOW
**Location**: `backend/src/cassini/api/v1/explain.py:178-181`
**Description**: When chart options (start_date/end_date/limit) are provided, the explain API computes `sigma_within` as the sample standard deviation of subgroup means. This is the overall sigma of means, not the within-subgroup sigma (R-bar/d2). As a result, Cp and Cpk will exactly equal Pp and Ppk, and the explanation explicitly warns about this. While the implementation is CORRECT in matching what the dashboard displays, it means the "Show Your Work" explanation for Cp/Cpk from the dashboard view is explaining a statistic that has lost its intended meaning (short-term vs. long-term distinction).

**Standard Reference**: AIAG SPC Manual 2nd Edition: Cp uses within-subgroup sigma, Pp uses overall sigma. They should differ unless the process is perfectly stable.

**Evidence**: `explain.py:180`:
```python
sigma_within = float(np.std(np.asarray(values, dtype=np.float64), ddof=1))
```
And the warning at line 191-194: `"Using sample sigma of subgroup means to match the dashboard display. Cp/Cpk will equal Pp/Ppk."`

**Knock-on Effects if Addressed**: Users see Cp == Pp and may not understand why. The warning is present but may be confusing.

**Recommendation**: Consider prominently displaying that this is a "dashboard view" approximation and directing users to the CapabilityCard for the proper AIAG-correct Cp/Cpk with within-subgroup sigma.

---

### [SHOW YOUR WORK] F-16: Non-normal capability has no Show Your Work instrumentation

**Severity**: LOW
**Location**: `backend/src/cassini/core/distributions.py:542-766`
**Description**: The `calculate_capability_nonnormal` function and its helpers (`_box_cox_capability`, `_distribution_fit_capability`, `calculate_percentile_capability`) do not accept or use an `ExplanationCollector`. When a characteristic uses non-normal capability (Box-Cox, distribution fitting, or percentile method), clicking "Show Your Work" on those values has no step-by-step explanation available.

**Standard Reference**: N/A -- this is a feature completeness issue for the platform's transparency feature.

**Evidence**: The function signature is:
```python
def calculate_capability_nonnormal(values, usl, lsl, target=None, sigma_within=None, method="auto", distribution_params=None):
```
No `collector` parameter exists, unlike `calculate_capability()` which has full collector integration.

**Knock-on Effects if Addressed**: Would require threading a collector parameter through Box-Cox, distribution fit, and percentile code paths.

**Recommendation**: Add ExplanationCollector support to non-normal capability paths. This is important for regulated industries where users need to understand how their capability index was derived.

---

### [EDGE CASE] F-17: Nelson Rule 3 (Trend) and Rule 4 (Alternating) fail on equal consecutive values

**Severity**: LOW
**Location**: `backend/src/cassini/core/engine/nelson_rules.py:232-235,287-291`
**Description**: Rule 3 checks `values[i] < values[i+1]` (strictly increasing) and `values[i] > values[i+1]` (strictly decreasing). If two consecutive values are exactly equal, neither condition is met, and the trend is broken. This means a sequence like [1, 2, 3, 3, 4, 5] would NOT trigger Rule 3 even though the visual pattern clearly shows an upward trend with one plateau. Similarly, Rule 4 checks `dir1 * dir2 >= 0` which includes zero, so equal consecutive values break the alternating pattern.

For manufacturing data with limited measurement resolution (e.g., measurements rounded to 0.001"), equal consecutive values are relatively common.

**Standard Reference**: Nelson (1984) specifies "six points in a row, all increasing or all decreasing." The word "increasing" is ambiguous -- strict or non-strict. Most implementations use strict comparisons, matching this code.

**Evidence**: This is the standard interpretation and matches most commercial SPC software.

**Knock-on Effects if Addressed**: Making comparisons non-strict would increase false positives.

**Recommendation**: No change needed. The strict comparison is the standard approach. Consider documenting this behavior for users who may expect non-strict comparison.

---

### [EDGE CASE] F-18: Rolling window cold-load for short-run standardized mode uses characteristic subgroup_size as proxy

**Severity**: LOW
**Location**: `backend/src/cassini/core/engine/spc_engine.py:516-524`
**Description**: When the rolling window is cold-loaded from the database for short-run standardized mode, the code uses the characteristic's configured `subgroup_size` as the proxy for each historical sample's actual_n in the Z-score transformation. This is noted in a comment as a known limitation. For variable-n characteristics (Mode B/C), historical samples may have different actual_n values, leading to slightly incorrect Z-score transforms in the rolling window.

**Standard Reference**: N/A -- implementation detail.

**Evidence**: Comment at line 517-520:
```python
# NOTE: For historical samples loaded from DB we don't know
# each sample's actual_n.  We use the characteristic's
# configured subgroup_size as the best available proxy.
```

**Knock-on Effects if Addressed**: Would require storing actual_n in the rolling window query results and applying per-sample transformations.

**Recommendation**: LOW priority. Short-run + variable-n is an unusual combination. If it becomes important, store actual_n in the query results and transform per-sample.

---

## Compliance Matrix

| Standard | Status | Gaps |
|----------|--------|------|
| AIAG SPC 2nd Ed | Partially Compliant | No R/S chart rule evaluation (F-07), no S-chart limits for n>10 (F-02), no confidence intervals on capability (F-12), constants table n=1 row misleading (F-01) |
| AIAG MSA 4th Ed | Mostly Compliant | %Tolerance multiplier not configurable (F-09), Kappa verdict thresholds stricter than typical (F-10). ANOVA degrees of freedom and variance components are correct. |
| AS9102 Rev C | Mostly Compliant | Separation of duties is API-level only (F-14). Forms 1/2/3 structure is implemented. |
| 21 CFR Part 11 | Partially Compliant | Electronic signatures are implemented. No confidence intervals on capability (F-12), no full audit trail on statistical recomputations (limit recalculations are logged via middleware but individual calculation inputs/outputs are not recorded). |
| ISO 22514-2:2017 | Partially Compliant | Missing confidence intervals on Cp/Cpk (F-12). Percentile method matches ISO 21747. |
| Montgomery (CUSUM/EWMA) | Partially Compliant | Sigma estimation fallback uses overall sigma instead of within-subgroup (F-03). CUSUM/EWMA formulas themselves are correct. |

## Positive Findings (What Was Done Well)

1. **Capability formulas are textbook-correct**: Cp, Cpk, Pp, Ppk, and Cpm all match AIAG SPC Manual 2nd Edition exactly.
2. **Crossed ANOVA Gage R&R is thorough**: Degrees of freedom, expected mean squares, variance components, F-tests, and the interaction pooling decision (p <= 0.25 threshold) all match AIAG MSA 4th Edition.
3. **d2* 2D lookup table is accurate**: The Range Method uses the full 2D d2*(m,g) table from AIAG MSA Appendix C, not the simplified 1D approximation. This is important for accuracy in small studies.
4. **Laney p'/u' implementation is correct**: The sigma_z calculation using Z-value moving ranges and d2=1.128 matches the Laney (2002) method exactly.
5. **Show Your Work system is well-designed**: The ExplanationCollector pattern captures computation steps with zero overhead when not active. Step filtering by metric is clean and the value-matching protocol (dashboard vs. capability card) is well-documented.
6. **Nelson Rules implementation is clean and parameterizable**: All 8 rules are correct, parameterizable via JSON config, and Rule 8 (Mixture) correctly requires points on BOTH sides of center (preventing false triggers from sustained shifts).
7. **Non-normal capability auto-cascade is sound**: The Shapiro-Wilk -> Box-Cox -> distribution fit -> percentile fallback chain is a reasonable approach that handles most non-normal data well.
8. **EWMA time-varying limits are implemented**: Using the exact formula `(1 - (1-lambda)^(2i))` rather than only steady-state limits is a nice touch that improves early-sample sensitivity.
9. **Attribute chart limit formulas are correct**: p, np, c, u chart center lines and control limits all match textbook formulas. Variable-n per-point limits are correctly computed.

## Statistics

- Total findings: 18
- HIGH: 3
- MEDIUM: 8
- LOW: 7
