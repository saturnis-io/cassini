"""Process capability calculations (Cp, Cpk, Pp, Ppk, Cpm).

Provides functions to calculate process capability indices from measurement
data, including normality testing via Shapiro-Wilk.

Formulas:
    Cp  = (USL - LSL) / (6 * sigma_within)
    Cpk = min((USL - mean) / (3 * sigma_within), (mean - LSL) / (3 * sigma_within))
    Pp  = (USL - LSL) / (6 * sigma_overall)
    Ppk = min((USL - mean) / (3 * sigma_overall), (mean - LSL) / (3 * sigma_overall))
    Cpm = Cp / sqrt(1 + ((mean - target) / sigma_within)^2)

Where:
    sigma_within  = from control chart (stored_sigma or R-bar/d2)
    sigma_overall = sample standard deviation of all individual values
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import math

import numpy as np
from scipy import stats as scipy_stats

from cassini.core.explain import ExplanationCollector


@dataclass
class CapabilityResult:
    """Result of a process capability calculation."""

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


def calculate_capability(
    values: list[float],
    usl: float | None,
    lsl: float | None,
    target: float | None = None,
    sigma_within: float | None = None,
    collector: ExplanationCollector | None = None,
) -> CapabilityResult:
    """Calculate process capability indices from measurement values.

    Args:
        values: Individual measurement values (flattened from subgroups).
        usl: Upper specification limit. None if one-sided.
        lsl: Lower specification limit. None if one-sided.
        target: Process target value. Defaults to midpoint of spec limits.
        sigma_within: Within-subgroup sigma from control chart (R-bar/d2).
            If None, Cp/Cpk are not calculated.

    Returns:
        CapabilityResult with all computed indices.

    Raises:
        ValueError: If fewer than 2 values or both USL and LSL are None.
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
        collector.input("x̄", round(mean, 6))
        collector.input("σ_overall", round(sigma_overall, 6))
        if sigma_within is not None:
            collector.input("σ_within", round(sigma_within, 6))
        if usl is not None:
            collector.input("USL", usl)
        if lsl is not None:
            collector.input("LSL", lsl)
        if target is not None:
            collector.input("Target", target)

    # Normality test (Shapiro-Wilk, max 5000 samples)
    # Use random subsample (not first-5000) to avoid temporal bias from
    # startup transients or mid-run shifts.  Fixed seed for reproducibility.
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
            if collector:
                geq_sym = r"\geq" if is_normal else "<"
                collector.step(
                    label="Normality Test (Shapiro-Wilk)",
                    formula_latex=r"H_0: \text{Data is normally distributed}",
                    substitution_latex=rf"p = {normality_p:.6f} {geq_sym} 0.05",
                    result=normality_p,
                    note="Normal" if is_normal else "Non-normal distribution detected",
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
                        label="τ (Taguchi loss sigma)",
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

    # --- 95% Confidence Intervals (ISO 22514-2:2017 Section 7.2) ---
    cp_lower: float | None = None
    cp_upper: float | None = None
    cpk_lower: float | None = None
    cpk_upper: float | None = None

    if n >= 2:
        alpha = 0.05
        # Cp CI: Cp * sqrt(chi2_lower / (n-1)), Cp * sqrt(chi2_upper / (n-1))
        # where chi2_lower = chi2.ppf(alpha/2, n-1), chi2_upper = chi2.ppf(1-alpha/2, n-1)
        if cp is not None:
            chi2_lo = float(scipy_stats.chi2.ppf(alpha / 2, n - 1))
            chi2_hi = float(scipy_stats.chi2.ppf(1 - alpha / 2, n - 1))
            cp_lower = cp * math.sqrt(chi2_lo / (n - 1))
            cp_upper = cp * math.sqrt(chi2_hi / (n - 1))

        # Cpk CI: approximate normal method (Kushler & Hurley, 1992)
        # Cpk +/- z_{alpha/2} * sqrt(1/(9*n*Cpk^2) + 1/(2*(n-1)))  -- simplified
        # More precisely: SE(Cpk) = sqrt(1/(9*n) + Cpk^2/(2*(n-1)))
        if cpk is not None and cpk > 0:
            z_crit = float(scipy_stats.norm.ppf(1 - alpha / 2))
            se_cpk = math.sqrt(1.0 / (9.0 * n) + cpk**2 / (2.0 * (n - 1)))
            cpk_lower = cpk - z_crit * se_cpk
            cpk_upper = cpk + z_crit * se_cpk

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
    )


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
