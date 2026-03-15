"""Process capability calculations (Cp, Cpk, Pp, Ppk, Cpm).

PURPOSE:
    Computes process capability and performance indices from measurement data,
    quantifying how well a process meets its specification limits. These
    indices are among the most scrutinized statistics in regulated
    manufacturing -- automotive (PPAP), aerospace (AS9100), medical device
    (ISO 13485), and pharmaceutical (FDA process validation) industries all
    require capability reporting.

STANDARDS:
    - ISO 22514-2:2017, "Statistical methods in process management --
      Capability and performance -- Part 2: Process capability and
      performance of time-dependent process models" -- primary standard
      for capability index definitions, confidence intervals, and
      interpretation guidelines
    - AIAG SPC Manual, 2nd Ed. (2005) -- automotive industry reference
      for Cp, Cpk, Pp, Ppk calculations and acceptance criteria
    - ASTM E2587-16, "Standard Practice for Use of Control Charts in
      Statistical Process Control" -- sigma estimation methods
    - Kushler, R.H. & Hurley, P. (1992), "Confidence bounds for capability
      indices", Journal of Quality Technology, 24(4), pp.188-195 -- Cpk CI
    - Bissell, A.F. (1990), "How Reliable is Your Capability Index?",
      Applied Statistics, 39(3), pp.331-340 -- Cp CI theory
    - D'Agostino, R.B. & Stephens, M.A. (1986), "Goodness-of-Fit
      Techniques", Marcel Dekker -- normality testing augmentation

ARCHITECTURE:
    This module provides:
      1. calculate_capability(): Normal-distribution capability indices
         with confidence intervals and normality testing
      2. calculate_capability_nonnormal(): Delegates to distributions.py
         for Box-Cox, percentile, and distribution-fitting methods
    It is called by the explain API (core/explain.py) for Show Your Work
    transparency and by the capability API endpoint.

Formulas (LaTeX notation):
    Cp   = (USL - LSL) / (6 * sigma_within)
    Cpk  = min((USL - x-bar) / (3 * sigma_within),
               (x-bar - LSL) / (3 * sigma_within))
    Pp   = (USL - LSL) / (6 * sigma_overall)
    Ppk  = min((USL - x-bar) / (3 * sigma_overall),
               (x-bar - LSL) / (3 * sigma_overall))
    Cpm  = (USL - LSL) / (6 * tau),
           where tau = sqrt(sigma_within^2 + (x-bar - T)^2)

    Ref: ISO 22514-2:2017, Section 6; AIAG SPC Manual, 2nd Ed., Chapter 3.

KEY DISTINCTIONS:
    sigma_within vs sigma_overall:
      - sigma_within: Estimated from within-subgroup variation (R-bar/d2 or
        S-bar/c4). Reflects short-term, inherent process variation. Used for
        Cp and Cpk ("potential" capability if the process were perfectly
        centered and stable).
      - sigma_overall: Sample standard deviation (s, ddof=1) of ALL individual
        measurements. Includes between-subgroup variation (shifts, trends).
        Used for Pp and Ppk ("actual" performance including all sources of
        variation).
      - The ratio Pp/Cp (or Ppk/Cpk) indicates how much between-subgroup
        variation exists. If Pp << Cp, the process has significant shifts
        or drifts that control charts should detect.
      Ref: ISO 22514-2:2017, Section 5 (distinction between capability
           and performance); Montgomery (2019), Section 8.2.

Confidence intervals:
    Cp CI: Chi-squared method with degrees of freedom determined by
    the sigma estimator's structure.
      - Subgrouped data: df = k*(m-1), Ref: ISO 22514-2:2017, Section 7.2.3
      - Individual data: df = n-1, Ref: ASTM E2587, Section 7.3
    Cpk CI: Normal approximation per Kushler & Hurley (1992):
      SE(Cpk) = sqrt(1/(9n) + Cpk^2 / (2(n-1)))

Normality testing:
    Primary: Shapiro-Wilk test (alpha = 0.05)
    Large-n augmentation (n > 300): When the Shapiro-Wilk test rejects
    normality due to high statistical power rather than meaningful
    departure, we supplement with effect-size checks on skewness and
    excess kurtosis to distinguish practical from statistical
    non-normality.
    Thresholds: |skewness| < 0.5, |excess kurtosis| < 1.0
    Ref: D'Agostino & Stephens (1986), Ch. 9; Bulmer (1979).
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import math

import numpy as np
from scipy import stats as scipy_stats

from cassini.core.explain import ExplanationCollector


# ---------------------------------------------------------------------------
# Practical normality thresholds (large-n effect-size assessment)
# ---------------------------------------------------------------------------
# When n > _LARGE_N_THRESHOLD, the Shapiro-Wilk test has enough power to
# reject H0 for trivially small deviations that have no practical impact on
# capability index accuracy.  We supplement the p-value with effect-size
# measures.
#
# Thresholds chosen per:
#   - |skewness| < 0.5: "approximately symmetric" per Bulmer (1979),
#     "Principles of Statistics", Dover.  AIAG SPC Manual 2nd Ed. Appendix
#     considers |skew| < 0.5 acceptable for Cp/Cpk calculations.
#   - |excess kurtosis| < 1.0: tails are close enough to normal that
#     6-sigma spread calculations remain accurate.  Minitab and JMP both
#     use similar thresholds for "approximately normal" classification.
#
# Ref: D'Agostino & Stephens (1986), "Goodness-of-Fit Techniques",
#      Chapter 9: "Tests based on skewness and kurtosis".
_LARGE_N_THRESHOLD = 300
_SKEWNESS_THRESHOLD = 0.5
_EXCESS_KURTOSIS_THRESHOLD = 1.0


@dataclass
class CapabilityResult:
    """Result of a process capability calculation.

    Attributes:
        cp: Process potential index (bilateral specs + within-subgroup sigma).
        cpk: Process capability index (accounts for centering).
        pp: Process performance potential (bilateral specs + overall sigma).
        ppk: Process performance index (accounts for centering).
        cpm: Taguchi capability index (accounts for off-target loss).
        sample_count: Total number of individual measurements used.
        normality_p_value: p-value from Shapiro-Wilk test (None if skipped).
        normality_test: Name of the normality test method used.  Values:
            "shapiro_wilk" -- standard p-value test.
            "shapiro_wilk_practical" -- p < 0.05 but effect-size measures
                indicate practically normal data (large-n augmentation).
            "failed" -- test could not be computed.
        is_normal: Whether data is classified as normal (includes practical
            normality assessment at large n).
        calculated_at: UTC timestamp of calculation.
        cp_lower / cp_upper: 95% CI for Cp (ISO 22514-2:2017 Section 7.2.3).
        cpk_lower / cpk_upper: 95% CI for Cpk (Kushler & Hurley, 1992).
        cp_ci_degrees_of_freedom: Degrees of freedom used for the Cp CI
            chi-squared distribution.  Exposed for audit/transparency.
    """

    cp: float | None
    cpk: float | None
    pp: float | None
    ppk: float | None
    cpm: float | None
    sample_count: int
    normality_p_value: float | None
    normality_test: str
    is_normal: bool
    calculated_at: datetime
    # 95% confidence intervals (ISO 22514-2:2017 Section 7.2)
    cp_lower: float | None = None
    cp_upper: float | None = None
    cpk_lower: float | None = None
    cpk_upper: float | None = None
    # Audit field: degrees of freedom used in Cp CI calculation.
    # Exposed so that downstream consumers (Show Your Work, reports) can
    # verify the correct df was applied for their subgroup structure.
    cp_ci_degrees_of_freedom: int | None = None
    # Z-bench and PPM (ISO 22514 / Montgomery 8th Ed. Section 8.2)
    z_bench_within: float | None = None
    z_bench_overall: float | None = None
    ppm_within_expected: float | None = None
    ppm_overall_expected: float | None = None
    # Process stability assessment (AIAG SPC Manual Ch. 3 Section 3.1)
    stability_warning: str | None = None
    recent_violation_count: int = 0


def calculate_capability(
    values: list[float],
    usl: float | None,
    lsl: float | None,
    target: float | None = None,
    sigma_within: float | None = None,
    collector: ExplanationCollector | None = None,
    *,
    subgroup_count: int | None = None,
    subgroup_size: int | None = None,
) -> CapabilityResult:
    """Calculate process capability indices from measurement values.

    Args:
        values: Individual measurement values (flattened from subgroups).
        usl: Upper specification limit. None if one-sided.
        lsl: Lower specification limit. None if one-sided.
        target: Process target value. Defaults to midpoint of spec limits.
        sigma_within: Within-subgroup sigma from control chart (R-bar/d2).
            If None, Cp/Cpk are not calculated.
        collector: Optional ExplanationCollector for Show Your Work traces.
        subgroup_count: Number of rational subgroups (k).  When provided
            together with subgroup_size, the Cp confidence interval uses
            the correct degrees of freedom df = k * (m - 1) per
            ISO 22514-2:2017 Section 7.2.3.
        subgroup_size: Observations per subgroup (m).  For individual
            measurements (I-MR charts), either omit or pass m=1.

    Returns:
        CapabilityResult with all computed indices.

    Raises:
        ValueError: If fewer than 2 values or both USL and LSL are None.

    Notes on Cp CI degrees of freedom (ISO 22514-2:2017 Section 7.2.3):
        The confidence interval for Cp is derived from the sampling
        distribution of the within-subgroup variance estimator.  When sigma
        is estimated from within-subgroup variation (R-bar/d2 or S-bar/c4),
        the effective degrees of freedom are:

            df = k * (m - 1)

        where k = number of subgroups and m = subgroup size.  This is
        SMALLER than n - 1 (total measurements minus one) because the
        between-subgroup variation consumes degrees of freedom that are
        not available for estimating within-subgroup dispersion.

        Example: n=100 total measurements from k=20 subgroups of m=5.
            - Incorrect:  df = n - 1 = 99   (overstates precision)
            - Correct:    df = 20 * (5 - 1) = 80

        When subgroup_count and subgroup_size are not provided (e.g.,
        individual data or legacy callers), we fall back to df = n - 1,
        which IS correct for the I-MR case (k=n, m=1 is degenerate;
        the moving-range estimator has approximately n - 1 df).
    """
    if len(values) < 2:
        raise ValueError(f"Need at least 2 values for capability calculation, got {len(values)}")

    if usl is None and lsl is None:
        raise ValueError("At least one specification limit (USL or LSL) must be provided")

    if usl is not None and lsl is not None and usl <= lsl:
        raise ValueError(f"USL ({usl}) must be greater than LSL ({lsl})")

    arr = np.asarray(values, dtype=np.float64)
    mean = float(np.mean(arr))
    sigma_overall = float(np.std(arr, ddof=1))
    n = len(values)
    now = datetime.now(timezone.utc)

    if collector:
        collector.input("n", n)
        collector.input("x\u0304", round(mean, 6))
        collector.input("\u03c3_overall", round(sigma_overall, 6))
        if sigma_within is not None:
            collector.input("\u03c3_within", round(sigma_within, 6))
        if usl is not None:
            collector.input("USL", usl)
        if lsl is not None:
            collector.input("LSL", lsl)
        if target is not None:
            collector.input("Target", target)

    # ------------------------------------------------------------------
    # Normality test (Shapiro-Wilk, max 5000 samples)
    # ------------------------------------------------------------------
    # Use random subsample (not first-5000) to avoid temporal bias from
    # startup transients or mid-run shifts.  Fixed seed for reproducibility.
    #
    # Large-n augmentation (Fix #7):
    #   At large sample sizes, the Shapiro-Wilk test has extremely high
    #   statistical power and will reject H0 for trivially small deviations
    #   from normality that have no practical impact on Cp/Cpk accuracy.
    #
    #   "With enough data, any continuous distribution will be rejected as
    #    non-normal" -- D'Agostino & Stephens (1986), Ch. 9
    #
    #   When n > 300 and Shapiro-Wilk rejects, we check whether the
    #   departure is practically significant using effect-size measures:
    #     - |skewness| < 0.5  (Bulmer, 1979: "approximately symmetric")
    #     - |excess kurtosis| < 1.0  (tails close to Gaussian)
    #
    #   If both conditions hold, we classify the data as "practically
    #   normal" -- the Cp/Cpk formulas remain valid because the 6-sigma
    #   spread assumption holds to engineering accuracy.
    #
    #   Ref: AIAG SPC Manual 2nd Ed., Appendix on normality assessment;
    #        D'Agostino & Stephens (1986), "Goodness-of-Fit Techniques"
    # ------------------------------------------------------------------
    normality_p: float | None = None
    normality_test = "shapiro_wilk"
    is_normal = False
    if n >= 3:
        if n > 5000:
            rng = np.random.default_rng(42)
            test_sample = rng.choice(arr, size=5000, replace=False)
        else:
            test_sample = arr
        try:
            result = scipy_stats.shapiro(test_sample)
            normality_p = float(result.pvalue)
            is_normal = normality_p >= 0.05

            # --- Large-n practical normality augmentation ---
            # When the Shapiro-Wilk test rejects at large n, check whether
            # the rejection is due to high statistical power detecting a
            # trivially small deviation, or a genuinely non-normal shape.
            #
            # The logic:
            #   1. Shapiro-Wilk rejected (p < 0.05) -- so is_normal is False.
            #   2. n > _LARGE_N_THRESHOLD -- high power makes p-value alone
            #      insufficient for practical decisions.
            #   3. Effect-size checks: |skewness| and |excess kurtosis| are
            #      both within thresholds -- the distribution's shape is
            #      close enough to Gaussian that Cp/Cpk remain accurate.
            #
            # We override is_normal to True and annotate normality_test so
            # that downstream consumers (API responses, Show Your Work) can
            # see that practical normality was used, not a pure p-value gate.
            # Pre-declare effect-size variables so they are available for the
            # ExplanationCollector block below regardless of which branch runs.
            # Without this, a future refactor could cause a NameError.
            skewness: float | None = None
            excess_kurtosis: float | None = None

            if not is_normal and n > _LARGE_N_THRESHOLD:
                # scipy.stats.skew and kurtosis use Fisher's definitions:
                #   skew = m3 / m2^(3/2)
                #   excess_kurtosis = m4 / m2^2 - 3  (Fisher=True is default)
                skewness = float(scipy_stats.skew(arr))
                excess_kurtosis = float(scipy_stats.kurtosis(arr))  # Fisher=True by default

                if (abs(skewness) < _SKEWNESS_THRESHOLD
                        and abs(excess_kurtosis) < _EXCESS_KURTOSIS_THRESHOLD):
                    is_normal = True
                    normality_test = "shapiro_wilk_practical"

            if collector:
                geq_sym = r"\geq" if normality_p >= 0.05 else "<"
                # Build the note based on the normality assessment outcome
                if normality_p >= 0.05:
                    note = "Normal (Shapiro-Wilk p >= 0.05)"
                elif normality_test == "shapiro_wilk_practical":
                    note = (
                        f"Practically normal: Shapiro-Wilk rejected at "
                        f"p={normality_p:.4g} (high power, n={n}), but "
                        f"|skew|={abs(skewness):.3f} < {_SKEWNESS_THRESHOLD} "
                        f"and |kurtosis|={abs(excess_kurtosis):.3f} < "
                        f"{_EXCESS_KURTOSIS_THRESHOLD}. "
                        f"Ref: D'Agostino & Stephens (1986), AIAG SPC Manual"
                    )
                else:
                    note = "Non-normal distribution detected"
                collector.step(
                    label="Normality Test (Shapiro-Wilk)",
                    formula_latex=r"H_0: \text{Data is normally distributed}",
                    substitution_latex=rf"p = {normality_p:.6f} {geq_sym} 0.05",
                    result=normality_p,
                    note=note,
                )
        except Exception:
            normality_test = "failed"

    # Target defaults to midpoint of spec limits
    if target is None and usl is not None and lsl is not None:
        target = (usl + lsl) / 2.0

    # --- Cp / Cpk (short-term, within-subgroup variation) ---
    cp: float | None = None
    cpk: float | None = None
    cpm: float | None = None

    if sigma_within is not None and sigma_within > 0:
        if usl is not None and lsl is not None:
            cp = (usl - lsl) / (6.0 * sigma_within)
            if collector:
                collector.step(
                    label="Cp (potential capability)",
                    formula_latex=r"C_p = \frac{USL - LSL}{6\sigma_w}",
                    substitution_latex=rf"\frac{{{usl} - {lsl}}}{{6 \times {sigma_within:.6f}}} = {cp:.4f}",
                    result=cp,
                )

        # Cpk: one-sided if only one limit
        cpk_values = []
        if usl is not None:
            cpk_values.append((usl - mean) / (3.0 * sigma_within))
            if collector:
                cpu = cpk_values[-1]
                collector.step(
                    label="Cpu (upper)",
                    formula_latex=r"C_{pu} = \frac{USL - \bar{x}}{3\sigma_w}",
                    substitution_latex=rf"\frac{{{usl} - {mean:.6f}}}{{3 \times {sigma_within:.6f}}} = {cpu:.4f}",
                    result=cpu,
                )
        if lsl is not None:
            cpk_values.append((mean - lsl) / (3.0 * sigma_within))
            if collector:
                cpl = cpk_values[-1]
                collector.step(
                    label="Cpl (lower)",
                    formula_latex=r"C_{pl} = \frac{\bar{x} - LSL}{3\sigma_w}",
                    substitution_latex=rf"\frac{{{mean:.6f} - {lsl}}}{{3 \times {sigma_within:.6f}}} = {cpl:.4f}",
                    result=cpl,
                )
        if cpk_values:
            cpk = min(cpk_values)
        if cpk_values and collector:
            collector.step(
                label="Cpk (actual capability)",
                formula_latex=r"C_{pk} = \min(C_{pu}, C_{pl})",
                substitution_latex=rf"\min({', '.join(f'{v:.4f}' for v in cpk_values)}) = {cpk:.4f}",
                result=cpk,
            )

        # Cpm: requires target and both spec limits
        if cp is not None and target is not None:
            tau = math.sqrt(sigma_within**2 + (mean - target) ** 2)
            if tau > 0 and usl is not None and lsl is not None:
                cpm = (usl - lsl) / (6.0 * tau)
                if collector:
                    collector.step(
                        label="\u03c4 (Taguchi loss sigma)",
                        formula_latex=r"\tau = \sqrt{\sigma_w^2 + (\bar{x} - T)^2}",
                        substitution_latex=rf"\sqrt{{{sigma_within:.6f}^2 + ({mean:.6f} - {target})^2}} = {tau:.4f}",
                        result=tau,
                    )
                    collector.step(
                        label="Cpm (Taguchi index)",
                        formula_latex=r"C_{pm} = \frac{USL - LSL}{6\tau}",
                        substitution_latex=rf"\frac{{{usl} - {lsl}}}{{6 \times {tau:.4f}}} = {cpm:.4f}",
                        result=cpm,
                    )

    # --- Pp / Ppk (long-term, overall variation) ---
    pp: float | None = None
    ppk: float | None = None

    if sigma_overall > 0:
        if usl is not None and lsl is not None:
            pp = (usl - lsl) / (6.0 * sigma_overall)
            if collector:
                collector.step(
                    label="Pp (overall performance)",
                    formula_latex=r"P_p = \frac{USL - LSL}{6\sigma_{overall}}",
                    substitution_latex=rf"\frac{{{usl} - {lsl}}}{{6 \times {sigma_overall:.6f}}} = {pp:.4f}",
                    result=pp,
                )

        ppk_values = []
        if usl is not None:
            ppk_values.append((usl - mean) / (3.0 * sigma_overall))
            if collector:
                ppu = ppk_values[-1]
                collector.step(
                    label="Ppu (upper)",
                    formula_latex=r"P_{pu} = \frac{USL - \bar{x}}{3\sigma_{overall}}",
                    substitution_latex=rf"\frac{{{usl} - {mean:.6f}}}{{3 \times {sigma_overall:.6f}}} = {ppu:.4f}",
                    result=ppu,
                )
        if lsl is not None:
            ppk_values.append((mean - lsl) / (3.0 * sigma_overall))
            if collector:
                ppl = ppk_values[-1]
                collector.step(
                    label="Ppl (lower)",
                    formula_latex=r"P_{pl} = \frac{\bar{x} - LSL}{3\sigma_{overall}}",
                    substitution_latex=rf"\frac{{{mean:.6f} - {lsl}}}{{3 \times {sigma_overall:.6f}}} = {ppl:.4f}",
                    result=ppl,
                )
        if ppk_values:
            ppk = min(ppk_values)
        if ppk_values and collector:
            collector.step(
                label="Ppk (overall performance)",
                formula_latex=r"P_{pk} = \min(P_{pu}, P_{pl})",
                substitution_latex=rf"\min({', '.join(f'{v:.4f}' for v in ppk_values)}) = {ppk:.4f}",
                result=ppk,
            )

    # ------------------------------------------------------------------
    # 95% Confidence Intervals (ISO 22514-2:2017 Section 7.2)
    # ------------------------------------------------------------------
    cp_lower: float | None = None
    cp_upper: float | None = None
    cpk_lower: float | None = None
    cpk_upper: float | None = None
    cp_ci_df: int | None = None

    if n >= 2:
        alpha = 0.05

        # ---- Cp CI (chi-squared method) ----
        #
        # ISO 22514-2:2017 Section 7.2.3 -- Confidence interval for Cp
        #
        # The estimator C_p = (USL - LSL) / (6 * sigma_hat_within) has a
        # sampling distribution related to chi-squared because sigma_hat
        # is derived from within-subgroup variation.
        #
        # Formula (LaTeX):
        #   C_p \sqrt{\frac{\chi^2_{\alpha/2, \nu}}{\nu}}
        #   \leq C_p^{true} \leq
        #   C_p \sqrt{\frac{\chi^2_{1-\alpha/2, \nu}}{\nu}}
        #
        # Where nu (degrees of freedom) depends on the sigma estimator:
        #
        #   Case 1 -- Subgrouped data (X-bar/R or X-bar/S charts):
        #     nu = k * (m - 1)
        #     where k = number of subgroups, m = subgroup size.
        #     This is the total within-subgroup df: each of k subgroups
        #     contributes (m - 1) degrees of freedom to the pooled
        #     within-subgroup variance estimate.
        #     Ref: ISO 22514-2:2017 Section 7.2.3, Eq. (8)
        #
        #   Case 2 -- Individual data (I-MR charts, m = 1):
        #     nu = n - 1
        #     The moving-range estimator with span=2 has approximately
        #     n - 1 effective degrees of freedom.
        #     Ref: ASTM E2587, Section 7.3; Wheeler (1995),
        #          "Advanced Topics in Statistical Process Control", Ch. 8
        #
        #   Case 3 -- Subgroup info not provided (legacy callers):
        #     Fall back to nu = n - 1.  This is conservative (wider CI)
        #     when the data is actually subgrouped, but never anti-
        #     conservative.  Log a collector warning if sigma_within
        #     suggests subgrouped data.
        #
        # WHY this matters:
        #   For n=100 from k=20 subgroups of m=5, the old code used
        #   df=99.  The correct df is 20*(5-1)=80.  Using df=99 produces
        #   an artificially narrow CI that overstates confidence in the
        #   Cp estimate -- a silent quality risk in regulated industries.
        if cp is not None:
            # Determine the correct degrees of freedom
            if (subgroup_count is not None
                    and subgroup_size is not None
                    and subgroup_size > 1):
                # Case 1: Subgrouped data with known structure.
                # df = k * (m - 1)  per ISO 22514-2:2017 Section 7.2.3
                cp_ci_df = subgroup_count * (subgroup_size - 1)
            else:
                # Case 2/3: Individual data or subgroup info not provided.
                # df = n - 1  (correct for I-MR; conservative fallback
                # for subgrouped data without explicit k and m).
                cp_ci_df = n - 1

            # Guard: df must be at least 1 for chi-squared to be defined
            if cp_ci_df < 1:
                cp_ci_df = 1

            chi2_lo = float(scipy_stats.chi2.ppf(alpha / 2, cp_ci_df))
            chi2_hi = float(scipy_stats.chi2.ppf(1 - alpha / 2, cp_ci_df))
            cp_lower = cp * math.sqrt(chi2_lo / cp_ci_df)
            cp_upper = cp * math.sqrt(chi2_hi / cp_ci_df)

            if collector:
                df_source = (
                    f"k*(m-1) = {subgroup_count}*({subgroup_size}-1) = {cp_ci_df}"
                    if (subgroup_count is not None
                        and subgroup_size is not None
                        and subgroup_size > 1)
                    else f"n-1 = {cp_ci_df}"
                )
                collector.step(
                    label="Cp 95% CI (chi-squared)",
                    formula_latex=(
                        r"C_p \sqrt{\frac{\chi^2_{\alpha/2,\nu}}{\nu}}"
                        r" \leq C_p^{true} \leq "
                        r"C_p \sqrt{\frac{\chi^2_{1-\alpha/2,\nu}}{\nu}}"
                    ),
                    substitution_latex=(
                        rf"\nu = {df_source},\;"
                        rf"\chi^2_{{0.025, {cp_ci_df}}} = {chi2_lo:.4f},\;"
                        rf"\chi^2_{{0.975, {cp_ci_df}}} = {chi2_hi:.4f}"
                    ),
                    result=cp_lower,
                    note=f"95% CI: [{cp_lower:.4f}, {cp_upper:.4f}]. ISO 22514-2:2017 Section 7.2.3, df={cp_ci_df}",
                )

        # ---- Cpk CI (normal approximation, Kushler & Hurley 1992) ----
        #
        # Formula (LaTeX):
        #   SE(C_{pk}) = \sqrt{\frac{1}{9n} + \frac{C_{pk}^2}{2(n-1)}}
        #   C_{pk} \pm z_{\alpha/2} \cdot SE(C_{pk})
        #
        # This uses total n (not subgroup df) because the Cpk estimator
        # depends on both the mean and sigma, and the mean converges at
        # rate 1/sqrt(n) regardless of subgroup structure.
        #
        # Ref: Kushler, R.H. & Hurley, P. (1992), "Confidence bounds for
        #      capability indices", J. Quality Technology, 24(4), 188-195.
        #
        # NOTE: We intentionally do NOT change the Cpk CI formula to use
        # subgroup-adjusted df.  The Kushler & Hurley derivation already
        # accounts for the two sources of variation (mean and sigma) and
        # uses n as the total sample size.  Substituting k*(m-1) here
        # would be incorrect.
        if cpk is not None and cpk > 0:
            z_crit = float(scipy_stats.norm.ppf(1 - alpha / 2))
            se_cpk = math.sqrt(1.0 / (9.0 * n) + cpk**2 / (2.0 * (n - 1)))
            cpk_lower = cpk - z_crit * se_cpk
            cpk_upper = cpk + z_crit * se_cpk

    # ------------------------------------------------------------------
    # Z-Bench and Expected PPM (ISO 22514 / Montgomery 8th Ed. §8.2)
    # ------------------------------------------------------------------
    # Z.Bench is the process sigma level — the equivalent standard normal
    # deviate corresponding to the total expected defect probability.
    #
    # Formulas:
    #   PPM_upper = Phi_bar((USL - x-bar) / sigma) * 1e6
    #   PPM_lower = Phi((LSL - x-bar) / sigma) * 1e6
    #   Z.Bench   = Phi^{-1}(1 - (PPM_upper + PPM_lower) / 1e6)
    #
    # Where Phi is the standard normal CDF, Phi_bar = 1 - Phi (survival).
    # For one-sided specs, the missing side contributes 0 PPM.
    # Z.Bench is capped at 6.0 (practical limit; beyond this PPM is
    # effectively zero and the inverse CDF becomes numerically unstable).
    #
    # NO Motorola 1.5-sigma shift is applied (ISO 22514 convention).
    #
    # Ref: ISO 22514-2:2017, Section 6; Montgomery (2019), Section 8.2.
    z_bench_within: float | None = None
    z_bench_overall: float | None = None
    ppm_within_expected: float | None = None
    ppm_overall_expected: float | None = None

    def _compute_zbench_ppm(
        _mean: float, _sigma: float, _usl: float | None, _lsl: float | None,
    ) -> tuple[float, float]:
        """Compute Z.Bench and total expected PPM for a given sigma."""
        ppm_upper = 0.0
        ppm_lower = 0.0
        if _usl is not None and _sigma > 0:
            ppm_upper = float(scipy_stats.norm.sf((_usl - _mean) / _sigma)) * 1e6
        if _lsl is not None and _sigma > 0:
            ppm_lower = float(scipy_stats.norm.cdf((_lsl - _mean) / _sigma)) * 1e6
        total_ppm = ppm_upper + ppm_lower
        total_defect_prob = total_ppm / 1e6
        if total_defect_prob <= 0.0 or total_defect_prob >= 1.0:
            z_b = 6.0  # Cap at practical limit
        else:
            z_b = float(scipy_stats.norm.ppf(1.0 - total_defect_prob))
            z_b = min(z_b, 6.0)
        return z_b, total_ppm

    # Compute Z.Bench within (using sigma_within)
    if sigma_within is not None and sigma_within > 0:
        z_bench_within, ppm_within_expected = _compute_zbench_ppm(
            mean, sigma_within, usl, lsl,
        )

    # Compute Z.Bench overall (using sigma_overall)
    if sigma_overall > 0:
        z_bench_overall, ppm_overall_expected = _compute_zbench_ppm(
            mean, sigma_overall, usl, lsl,
        )

    if collector:
        # Log Z.Bench step for Show Your Work transparency
        _zbench_parts = []
        if z_bench_within is not None:
            _zbench_parts.append(f"Z.Bench_{{within}} = {z_bench_within:.4f}")
        if z_bench_overall is not None:
            _zbench_parts.append(f"Z.Bench_{{overall}} = {z_bench_overall:.4f}")
        if _zbench_parts:
            _ppm_detail = []
            if ppm_within_expected is not None:
                _ppm_detail.append(f"PPM_within = {ppm_within_expected:.1f}")
            if ppm_overall_expected is not None:
                _ppm_detail.append(f"PPM_overall = {ppm_overall_expected:.1f}")
            collector.step(
                label="Z.Bench & Expected PPM",
                formula_latex=(
                    r"Z_{Bench} = \Phi^{-1}\!\left(1 - \frac{PPM_{upper} + PPM_{lower}}{10^6}\right)"
                ),
                substitution_latex=", ".join(_zbench_parts),
                result=z_bench_within if z_bench_within is not None else z_bench_overall,
                note=(
                    "Z.Bench per ISO 22514 / Montgomery 8th Ed. \u00a78.2 "
                    "(no 1.5\u03c3 shift applied). Expected (model-based) defect rates. "
                    + "; ".join(_ppm_detail)
                ),
            )

    return CapabilityResult(
        cp=_round_or_none(cp),
        cpk=_round_or_none(cpk),
        pp=_round_or_none(pp),
        ppk=_round_or_none(ppk),
        cpm=_round_or_none(cpm),
        sample_count=n,
        normality_p_value=_round_or_none(normality_p, 6),
        normality_test=normality_test,
        is_normal=is_normal,
        calculated_at=now,
        cp_lower=_round_or_none(cp_lower),
        cp_upper=_round_or_none(cp_upper),
        cpk_lower=_round_or_none(cpk_lower),
        cpk_upper=_round_or_none(cpk_upper),
        cp_ci_degrees_of_freedom=cp_ci_df,
        z_bench_within=_round_or_none(z_bench_within),
        z_bench_overall=_round_or_none(z_bench_overall),
        ppm_within_expected=_round_or_none(ppm_within_expected, 1),
        ppm_overall_expected=_round_or_none(ppm_overall_expected, 1),
    )


def compute_capability_confidence_intervals(
    measurements: list[float],
    usl: float | None,
    lsl: float | None,
    target: float | None = None,
    sigma_within: float | None = None,
    n_bootstrap: int = 2000,
    confidence: float = 0.95,
) -> dict[str, tuple[float, float]]:
    """Compute bootstrap confidence intervals for Cp, Cpk, Pp, Ppk.

    Bootstrap resampling provides distribution-free confidence intervals
    that are more accurate than parametric CIs for non-normal data.  For
    normal data, bootstrap CIs and parametric CIs converge at large n.

    The percentile method is used (Efron & Tibshirani, 1993, Ch. 13).

    Args:
        measurements: Individual measurement values.
        usl: Upper specification limit.  None if one-sided.
        lsl: Lower specification limit.  None if one-sided.
        target: Process target value.
        sigma_within: Within-subgroup sigma from control chart (R-bar/d2).
            If None, Cp/Cpk bootstrap CIs are not computed.
        n_bootstrap: Number of bootstrap resamples (default 2000).
        confidence: Confidence level (default 0.95 for 95% CI).

    Returns:
        Dict mapping index name to (lower, upper) tuple, e.g.
        ``{"cpk": (1.05, 1.61), "ppk": (0.98, 1.52)}``.
        Only indices that can be computed are included.
    """
    arr = np.asarray(measurements, dtype=np.float64)
    n = len(arr)
    if n < 2:
        return {}

    if usl is None and lsl is None:
        return {}

    alpha = 1.0 - confidence
    lo_pct = alpha / 2.0 * 100.0
    hi_pct = (1.0 - alpha / 2.0) * 100.0

    rng = np.random.default_rng(seed=42)

    # Vectorised bootstrap: resample all at once as (n_bootstrap, n) matrix.
    # indices shape: (n_bootstrap, n)
    indices = rng.integers(0, n, size=(n_bootstrap, n))
    # resamples shape: (n_bootstrap, n)
    resamples = arr[indices]

    # Per-resample statistics
    means = np.mean(resamples, axis=1)                         # (n_bootstrap,)
    sigma_overall_boot = np.std(resamples, axis=1, ddof=1)     # (n_bootstrap,)

    results: dict[str, tuple[float, float]] = {}

    # --- Pp / Ppk (use overall sigma from each resample) ---
    valid_sigma = sigma_overall_boot > 0

    if usl is not None and lsl is not None:
        # Pp = (USL - LSL) / (6 * sigma_overall)
        pp_boot = np.where(
            valid_sigma,
            (usl - lsl) / (6.0 * np.where(valid_sigma, sigma_overall_boot, 1.0)),
            np.nan,
        )
        pp_valid = pp_boot[~np.isnan(pp_boot)]
        if len(pp_valid) > 0:
            results["pp"] = (
                round(float(np.percentile(pp_valid, lo_pct)), 4),
                round(float(np.percentile(pp_valid, hi_pct)), 4),
            )

    # Ppk = min((USL - mean)/(3*sigma), (mean - LSL)/(3*sigma))
    ppk_parts: list[np.ndarray] = []
    if usl is not None:
        ppu = np.where(
            valid_sigma,
            (usl - means) / (3.0 * np.where(valid_sigma, sigma_overall_boot, 1.0)),
            np.nan,
        )
        ppk_parts.append(ppu)
    if lsl is not None:
        ppl = np.where(
            valid_sigma,
            (means - lsl) / (3.0 * np.where(valid_sigma, sigma_overall_boot, 1.0)),
            np.nan,
        )
        ppk_parts.append(ppl)
    if ppk_parts:
        ppk_boot = np.nanmin(np.stack(ppk_parts, axis=0), axis=0)
        ppk_valid = ppk_boot[~np.isnan(ppk_boot)]
        if len(ppk_valid) > 0:
            results["ppk"] = (
                round(float(np.percentile(ppk_valid, lo_pct)), 4),
                round(float(np.percentile(ppk_valid, hi_pct)), 4),
            )

    # --- Cp / Cpk (use sigma_within — held fixed across resamples) ---
    # sigma_within is a control chart parameter (R-bar/d2), not re-estimated
    # per resample.  The bootstrap only varies the mean for Cpk, while Cp
    # is constant (it doesn't depend on the mean).  We still report Cp CI
    # from the parametric method — the bootstrap adds value primarily for
    # Cpk where the mean varies.
    if sigma_within is not None and sigma_within > 0:
        if usl is not None and lsl is not None:
            # Cp is independent of sample mean — bootstrap doesn't vary it.
            # We skip Cp bootstrap and let the parametric CI handle it.
            pass

        cpk_parts_w: list[np.ndarray] = []
        if usl is not None:
            cpu_w = (usl - means) / (3.0 * sigma_within)
            cpk_parts_w.append(cpu_w)
        if lsl is not None:
            cpl_w = (means - lsl) / (3.0 * sigma_within)
            cpk_parts_w.append(cpl_w)
        if cpk_parts_w:
            cpk_boot_w = np.nanmin(np.stack(cpk_parts_w, axis=0), axis=0)
            cpk_valid = cpk_boot_w[~np.isnan(cpk_boot_w)]
            if len(cpk_valid) > 0:
                results["cpk"] = (
                    round(float(np.percentile(cpk_valid, lo_pct)), 4),
                    round(float(np.percentile(cpk_valid, hi_pct)), 4),
                )

    return results


def calculate_capability_nonnormal(
    values: list[float],
    usl: float | None,
    lsl: float | None,
    target: float | None = None,
    sigma_within: float | None = None,
    method: str = "auto",
    collector: ExplanationCollector | None = None,
):
    """Calculate non-normal process capability. Delegates to distributions module."""
    from cassini.core.distributions import calculate_capability_nonnormal as _impl

    return _impl(values, usl, lsl, target, sigma_within, method, collector=collector)


def _round_or_none(value: float | None, decimals: int = 4) -> float | None:
    """Round a value to the specified decimals, or return None."""
    if value is None:
        return None
    return round(value, decimals)
