"""MSA Standalone Bias Study — AIAG MSA 4th Edition, Chapter 3.

The Independent Sample Bias Method evaluates whether a measurement system
has a statistically significant bias relative to a known reference value.

Steps:
  1. bias = mean(measurements) - reference_value
  2. %bias = |bias| / tolerance * 100  (tolerance = USL - LSL)
     Falls back to 6*sigma_process if no tolerance, else None.
  3. t-test: t = bias / (s / sqrt(n)), two-sided, df = n-1
  4. Verdict: %bias < 10% acceptable, 10-30% marginal, > 30% unacceptable
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy.stats import t as t_dist

from cassini.core.explain import ExplanationCollector


@dataclass
class BiasResult:
    """Result of a standalone bias study (AIAG MSA 4th Ed., Ch. 3)."""

    reference_value: float
    n: int
    mean: float
    std_dev: float
    bias: float
    bias_percent: float | None  # None if no tolerance and no sigma_process
    t_statistic: float
    p_value: float
    df: int
    is_significant: bool  # p < 0.05
    verdict: str  # acceptable / marginal / unacceptable / indeterminate
    denominator_used: str  # "tolerance" / "6*sigma_process" / "none"
    measurements: list[float] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def compute_bias(
    measurements: list[float],
    reference_value: float,
    tolerance: float | None = None,
    sigma_process: float | None = None,
    collector: ExplanationCollector | None = None,
) -> BiasResult:
    """Compute bias analysis per AIAG MSA 4th Edition, Chapter 3.

    Args:
        measurements: Individual measurement values of the reference standard.
        reference_value: Known true value of the reference standard.
        tolerance: USL - LSL for %bias calculation.
        sigma_process: Process sigma (fallback denominator = 6*sigma_process).
        collector: Optional explanation collector for Show Your Work.

    Returns:
        :class:`BiasResult` with bias, t-test, and verdict.

    Raises:
        ValueError: If fewer than 2 measurements provided.
    """
    n = len(measurements)

    if n < 2:
        raise ValueError("Bias study requires at least 2 measurements")

    warnings: list[str] = []

    if collector:
        collector.input("n_measurements", n)
        collector.input("reference_value", reference_value)
        if tolerance is not None:
            collector.input("tolerance", tolerance)
        if sigma_process is not None:
            collector.input("sigma_process", sigma_process)

    # ── Mean ──
    arr = np.asarray(measurements, dtype=np.float64)
    mean_val = float(np.mean(arr))

    if collector:
        collector.step(
            label="Sample Mean",
            formula_latex=r"\bar{x} = \frac{\sum x_i}{n}",
            substitution_latex=(
                r"\bar{x} = \frac{"
                + str(round(float(np.sum(arr)), 6))
                + r"}{"
                + str(n)
                + r"}"
            ),
            result=mean_val,
        )

    # ── Standard deviation ──
    std_dev = float(np.std(arr, ddof=1))

    if collector:
        collector.step(
            label="Sample Std Dev",
            formula_latex=r"s = \sqrt{\frac{\sum (x_i - \bar{x})^2}{n-1}}",
            substitution_latex=r"s = " + str(round(std_dev, 6)),
            result=std_dev,
        )

    # ── Bias ──
    bias = mean_val - reference_value

    if collector:
        collector.step(
            label="Bias",
            formula_latex=r"\text{Bias} = \bar{x} - \text{Reference}",
            substitution_latex=(
                str(round(mean_val, 6))
                + r" - "
                + str(round(reference_value, 6))
            ),
            result=bias,
        )

    # ── %Bias ──
    bias_percent: float | None = None
    denominator_used = "none"

    if tolerance is not None and tolerance > 0:
        bias_percent = (abs(bias) / tolerance) * 100.0
        denominator_used = "tolerance"
        if collector:
            collector.step(
                label="%Bias",
                formula_latex=r"\%\text{Bias} = \frac{|\text{Bias}|}{\text{Tolerance}} \times 100",
                substitution_latex=(
                    r"\frac{|"
                    + str(round(bias, 6))
                    + r"|}{" + str(round(tolerance, 6))
                    + r"} \times 100"
                ),
                result=bias_percent,
            )
    elif sigma_process is not None and sigma_process > 0:
        denominator = 6.0 * sigma_process
        bias_percent = (abs(bias) / denominator) * 100.0
        denominator_used = "6*sigma_process"
        if collector:
            collector.step(
                label="%Bias (6*sigma fallback)",
                formula_latex=r"\%\text{Bias} = \frac{|\text{Bias}|}{6\sigma_{\text{process}}} \times 100",
                substitution_latex=(
                    r"\frac{|"
                    + str(round(bias, 6))
                    + r"|}{6 \times " + str(round(sigma_process, 6))
                    + r"} \times 100"
                ),
                result=bias_percent,
                note="Using 6*sigma_process as denominator (no tolerance available)",
            )
    else:
        warnings.append(
            "No tolerance or process sigma available — %Bias cannot be calculated"
        )

    # ── t-test ──
    se = std_dev / math.sqrt(n) if n > 0 else 0.0
    df = n - 1

    if se > 0:
        t_stat = bias / se
        # Two-sided p-value
        p_value = float(2.0 * t_dist.sf(abs(t_stat), df)) if df > 0 else 1.0
    elif abs(bias) > 0:
        # Zero variance but nonzero bias — effectively infinite t-stat
        t_stat = math.copysign(math.inf, bias)
        p_value = 0.0
    else:
        # Zero variance AND zero bias — no evidence of bias
        t_stat = 0.0
        p_value = 1.0

    is_significant = p_value < 0.05

    if collector:
        collector.step(
            label="Standard Error",
            formula_latex=r"SE = \frac{s}{\sqrt{n}}",
            substitution_latex=(
                r"\frac{"
                + str(round(std_dev, 6))
                + r"}{\sqrt{"
                + str(n)
                + r"}}"
            ),
            result=se,
        )
        t_stat_display = t_stat if math.isfinite(t_stat) else (1e30 if t_stat > 0 else -1e30)
        collector.step(
            label="t-statistic",
            formula_latex=r"t = \frac{\text{Bias}}{SE}",
            substitution_latex=(
                r"\frac{"
                + str(round(bias, 6))
                + r"}{"
                + str(round(se, 6))
                + r"}"
            ),
            result=t_stat_display,
            note=f"df = {df}, two-sided p = {round(p_value, 6)}"
            + (" (SE=0, bias\u22600 \u2192 t=\u221e)" if not math.isfinite(t_stat) else ""),
        )

    # ── Verdict ──
    if bias_percent is not None:
        if bias_percent < 10.0:
            verdict = "acceptable"
        elif bias_percent <= 30.0:
            verdict = "marginal"
        else:
            verdict = "unacceptable"
    else:
        # Without %bias, use t-test significance only
        verdict = "indeterminate"
        warnings.append(
            "Verdict is indeterminate because %Bias cannot be calculated. "
            "Provide tolerance (USL - LSL) or process sigma for a definitive verdict."
        )

    if collector:
        collector.step(
            label="Verdict",
            formula_latex=(
                r"\text{Verdict} = \begin{cases}"
                r" \text{Acceptable} & \%\text{Bias} < 10\% \\"
                r" \text{Marginal} & 10\% \le \%\text{Bias} \le 30\% \\"
                r" \text{Unacceptable} & \%\text{Bias} > 30\%"
                r" \end{cases}"
            ),
            substitution_latex=(
                r"\%\text{Bias} = " + str(round(bias_percent, 2)) + r"\%"
                if bias_percent is not None
                else r"\text{N/A (no denominator)}"
            ),
            result=0.0 if verdict == "acceptable" else (0.5 if verdict == "marginal" else 1.0),
            note=(
                f"{verdict}"
                + (f", t-test {'significant' if is_significant else 'not significant'} (p={p_value:.4f})" if True else "")
            ),
        )

    if warnings and collector:
        for w in warnings:
            collector.warn(w)

    # Clamp infinite t-stat for JSON serialization
    t_stat_json = t_stat if math.isfinite(t_stat) else (1e30 if t_stat > 0 else -1e30)

    return BiasResult(
        reference_value=reference_value,
        n=n,
        mean=mean_val,
        std_dev=std_dev,
        bias=bias,
        bias_percent=bias_percent,
        t_statistic=t_stat_json,
        p_value=p_value,
        df=df,
        is_significant=is_significant,
        verdict=verdict,
        denominator_used=denominator_used,
        measurements=list(measurements),
        warnings=warnings,
    )
