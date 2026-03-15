"""MSA Linearity Study — AIAG MSA 4th Edition.

A linearity study evaluates whether a gage's bias varies systematically
across its operating range.  Reference standards spanning the range are
each measured multiple times.  Bias at each level is regressed against
reference value; a statistically significant slope indicates a linearity
problem.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from scipy.stats import linregress

from cassini.core.explain import ExplanationCollector


@dataclass
class LinearityResult:
    """Result of a linearity study (AIAG MSA 4th Ed.)."""

    reference_values: list[float]
    bias_values: list[float]  # mean(measured) - reference at each level
    bias_percentages: list[float]  # |bias| / tolerance * 100 (or NaN)
    slope: float
    intercept: float
    r_squared: float
    linearity: float  # |slope| * range_of_references
    linearity_percent: float  # linearity / tolerance * 100 (NaN if no tol)
    bias_avg: float  # average |bias| across all levels
    bias_percent: float  # avg |bias| / tolerance * 100 (NaN if no tol)
    is_acceptable: bool  # linearity_percent <= threshold
    individual_points: list[dict] = field(default_factory=list)
    verdict: str = "acceptable"  # acceptable / marginal / unacceptable
    p_value: float = 0.0  # p-value for slope significance


def compute_linearity(
    reference_values: list[float],
    measurements: list[list[float]],
    tolerance: float | None = None,
    threshold: float = 5.0,
    collector: ExplanationCollector | None = None,
) -> LinearityResult:
    """Compute linearity analysis per AIAG MSA 4th Edition.

    Args:
        reference_values: Known reference standard values (one per level).
        measurements: ``measurements[i]`` = list of readings at
            ``reference_values[i]``.
        tolerance: USL - LSL for percentage calculations.  If ``None``,
            percentage metrics are set to ``NaN``.
        threshold: Acceptable %Linearity limit (default 5%).
        collector: Optional explanation collector for Show Your Work.

    Returns:
        :class:`LinearityResult` with regression, bias, and verdict.

    Raises:
        ValueError: If fewer than 3 reference levels or empty measurements.
    """
    n_levels = len(reference_values)

    if n_levels < 3:
        raise ValueError("Linearity study requires at least 3 reference levels")
    if len(measurements) != n_levels:
        raise ValueError(
            f"Number of measurement groups ({len(measurements)}) must match "
            f"number of reference values ({n_levels})"
        )
    for i, m in enumerate(measurements):
        if len(m) == 0:
            raise ValueError(f"Measurement group {i} is empty")

    if collector:
        collector.input("n_levels", n_levels)
        collector.input("n_measurements_per_level", [len(m) for m in measurements])
        if tolerance is not None:
            collector.input("tolerance", tolerance)

    # ── Bias at each level ──
    bias_values: list[float] = []
    for i in range(n_levels):
        mean_i = sum(measurements[i]) / len(measurements[i])
        bias_i = mean_i - reference_values[i]
        bias_values.append(bias_i)

    if collector:
        for i in range(n_levels):
            mean_i = sum(measurements[i]) / len(measurements[i])
            collector.step(
                label=f"Bias at ref={reference_values[i]}",
                formula_latex=r"\text{Bias}_i = \bar{x}_i - \text{Ref}_i",
                substitution_latex=(
                    str(round(mean_i, 6)) + r" - " + str(round(reference_values[i], 6))
                ),
                result=bias_values[i],
            )

    # ── Individual points for scatter plot ──
    individual_points: list[dict] = []
    for i in range(n_levels):
        ref = reference_values[i]
        for j, val in enumerate(measurements[i]):
            individual_points.append({
                "reference": ref,
                "measured": val,
                "bias": val - ref,
                "replicate": j + 1,
            })

    # ── Regression: bias vs reference ──
    # Use all individual bias points for regression, not just means
    all_refs: list[float] = []
    all_biases: list[float] = []
    for i in range(n_levels):
        ref = reference_values[i]
        for val in measurements[i]:
            all_refs.append(ref)
            all_biases.append(val - ref)

    reg = linregress(all_refs, all_biases)
    slope = float(reg.slope)
    intercept = float(reg.intercept)
    r_squared = float(reg.rvalue ** 2)
    p_value = float(reg.pvalue)

    if collector:
        collector.step(
            label="Linear Regression (bias vs reference)",
            formula_latex=r"\text{Bias} = a + b \times \text{Reference}",
            substitution_latex=(
                r"\text{Bias} = "
                + str(round(intercept, 6))
                + r" + "
                + str(round(slope, 6))
                + r" \times \text{Reference}"
            ),
            result=slope,
            note=f"R² = {round(r_squared, 6)}, p = {round(p_value, 6)}",
        )

    # ── Linearity metric ──
    ref_range = max(reference_values) - min(reference_values)
    linearity = abs(slope) * ref_range

    if collector:
        collector.step(
            label="Linearity",
            formula_latex=r"\text{Linearity} = |b| \times (\text{Ref}_{\max} - \text{Ref}_{\min})",
            substitution_latex=(
                str(round(abs(slope), 6))
                + r" \times "
                + str(round(ref_range, 6))
            ),
            result=linearity,
        )

    # ── Bias average ──
    # AIAG: grand mean of all individual bias observations
    all_individual_biases = []
    for i, ref in enumerate(reference_values):
        for measurement in measurements[i]:
            all_individual_biases.append(abs(measurement - ref))
    bias_avg = sum(all_individual_biases) / len(all_individual_biases)

    if collector:
        collector.step(
            label="Average |Bias|",
            formula_latex=r"\text{Avg}|\text{Bias}| = \frac{\sum_{i=1}^{N} |x_i - \text{Ref}_i|}{N}",
            substitution_latex=(
                r"\frac{"
                + str(round(sum(all_individual_biases), 6))
                + r"}{"
                + str(len(all_individual_biases))
                + r"}"
            ),
            result=bias_avg,
        )

    # ── Percentage metrics ──
    if tolerance is not None and tolerance > 0:
        linearity_percent = (linearity / tolerance) * 100.0
        bias_percent = (bias_avg / tolerance) * 100.0
        bias_percentages = [(abs(b) / tolerance) * 100.0 for b in bias_values]

        if collector:
            collector.step(
                label="%Linearity",
                formula_latex=r"\%\text{Linearity} = \frac{\text{Linearity}}{\text{Tolerance}} \times 100",
                substitution_latex=(
                    r"\frac{" + str(round(linearity, 6))
                    + r"}{" + str(round(tolerance, 6))
                    + r"} \times 100"
                ),
                result=linearity_percent,
            )
            collector.step(
                label="%Bias",
                formula_latex=r"\%\text{Bias} = \frac{\text{Avg}|\text{Bias}|}{\text{Tolerance}} \times 100",
                substitution_latex=(
                    r"\frac{" + str(round(bias_avg, 6))
                    + r"}{" + str(round(tolerance, 6))
                    + r"} \times 100"
                ),
                result=bias_percent,
            )
    else:
        linearity_percent = math.nan
        bias_percent = math.nan
        bias_percentages = [math.nan] * n_levels

    # ── Verdict ──
    if math.isnan(linearity_percent):
        # Without tolerance we fall back to p-value significance
        is_acceptable = p_value > 0.05
        if is_acceptable:
            verdict = "acceptable"
        else:
            verdict = "unacceptable"
    else:
        is_acceptable = linearity_percent <= threshold
        if linearity_percent <= threshold:
            verdict = "acceptable"
        elif linearity_percent <= threshold * 2:
            verdict = "marginal"
        else:
            verdict = "unacceptable"

    if collector:
        collector.step(
            label="Verdict",
            formula_latex=(
                r"\text{Verdict} = \begin{cases} \text{Acceptable} & \%\text{Lin} \le "
                + str(round(threshold, 1))
                + r"\% \\ \text{Marginal} & "
                + str(round(threshold, 1))
                + r"\% < \%\text{Lin} \le "
                + str(round(threshold * 2, 1))
                + r"\% \\ \text{Unacceptable} & \%\text{Lin} > "
                + str(round(threshold * 2, 1))
                + r"\% \end{cases}"
            ),
            substitution_latex=r"\%\text{Linearity} = " + str(round(linearity_percent, 2)) + r"\%",
            result=0.0 if is_acceptable else 1.0,
            note=verdict,
        )

    return LinearityResult(
        reference_values=reference_values,
        bias_values=bias_values,
        bias_percentages=bias_percentages,
        slope=slope,
        intercept=intercept,
        r_squared=r_squared,
        linearity=linearity,
        linearity_percent=linearity_percent,
        bias_avg=bias_avg,
        bias_percent=bias_percent,
        is_acceptable=is_acceptable,
        individual_points=individual_points,
        verdict=verdict,
        p_value=p_value,
    )
