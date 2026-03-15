"""MSA Stability Study — AIAG MSA 4th Edition, Chapter 4.

A stability study evaluates whether a measurement system's performance
is consistent over time.  An operator measures a single reference standard
repeatedly over time (n >= 20 recommended).  The individual measurements
are plotted on an I-MR (Individuals and Moving Range) control chart.
Nelson Rules are then applied to detect non-random patterns that indicate
instability.

Verdict logic (using existing Nelson Rules engine):
  - **Stable:** No points beyond limits AND no Nelson Rules 1-4 violations
  - **Potentially unstable:** Nelson Rules 5-8 violations only
  - **Unstable:** Points beyond limits OR Nelson Rules 1-4 triggered
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from cassini.core.explain import ExplanationCollector
from cassini.utils.constants import get_d2
from cassini.utils.statistics import estimate_sigma_moving_range


@dataclass
class StabilityResult:
    """Result of a stability study (AIAG MSA 4th Ed., Ch. 4)."""

    # I-chart data
    values: list[float]
    center_line: float
    ucl: float
    lcl: float
    sigma: float

    # MR-chart data
    moving_ranges: list[float]
    mr_center_line: float
    mr_ucl: float
    mr_lcl: float  # Always 0 for MR chart with span=2

    # Nelson Rules violations
    violations: list[dict] = field(default_factory=list)

    # Verdict
    verdict: str = "stable"  # stable / potentially_unstable / unstable
    verdict_reason: str = ""

    # Warnings
    warnings: list[str] = field(default_factory=list)


def compute_stability(
    measurements: list[float],
    collector: ExplanationCollector | None = None,
) -> StabilityResult:
    """Compute stability analysis per AIAG MSA 4th Edition, Chapter 4.

    Args:
        measurements: Time-ordered individual measurements of a reference
            standard.
        collector: Optional explanation collector for Show Your Work.

    Returns:
        :class:`StabilityResult` with I-MR chart data and Nelson Rules verdict.

    Raises:
        ValueError: If fewer than 2 measurements provided.
    """
    n = len(measurements)

    if n < 2:
        raise ValueError("Stability study requires at least 2 measurements")

    warnings: list[str] = []
    if n < 20:
        warnings.append(
            "Study may have insufficient power to detect instability (n < 20 recommended)"
        )

    if collector:
        collector.input("n_measurements", n)
        if warnings:
            for w in warnings:
                collector.warn(w)

    # ── I-chart: Individuals ──
    values = list(measurements)
    arr = np.asarray(values, dtype=np.float64)
    center_line = float(np.mean(arr))

    if collector:
        collector.step(
            label="Center Line (I-chart)",
            formula_latex=r"\bar{x} = \frac{\sum x_i}{n}",
            substitution_latex=(
                r"\bar{x} = \frac{"
                + str(round(float(np.sum(arr)), 6))
                + r"}{"
                + str(n)
                + r"}"
            ),
            result=center_line,
        )

    # Sigma estimated via moving range method (span=2)
    sigma = estimate_sigma_moving_range(values, span=2)

    # Moving ranges
    mr_values = [abs(values[i] - values[i - 1]) for i in range(1, n)]
    mr_bar = float(np.mean(mr_values)) if mr_values else 0.0
    d2 = get_d2(2)

    if collector:
        collector.step(
            label="MR-bar (Mean Moving Range)",
            formula_latex=r"\overline{MR} = \frac{\sum |x_i - x_{i-1}|}{n-1}",
            substitution_latex=(
                r"\overline{MR} = \frac{"
                + str(round(sum(mr_values), 6))
                + r"}{"
                + str(len(mr_values))
                + r"}"
            ),
            result=mr_bar,
        )
        collector.step(
            label="Sigma (Process Sigma)",
            formula_latex=r"\hat{\sigma} = \frac{\overline{MR}}{d_2}",
            substitution_latex=(
                r"\hat{\sigma} = \frac{"
                + str(round(mr_bar, 6))
                + r"}{"
                + str(d2)
                + r"}"
            ),
            result=sigma,
            note=f"d2 = {d2} for span=2",
        )

    # I-chart limits
    ucl = center_line + 3 * sigma
    lcl = center_line - 3 * sigma

    if collector:
        collector.step(
            label="UCL (I-chart)",
            formula_latex=r"UCL = \bar{x} + 3\hat{\sigma}",
            substitution_latex=(
                str(round(center_line, 6))
                + r" + 3 \times "
                + str(round(sigma, 6))
            ),
            result=ucl,
        )
        collector.step(
            label="LCL (I-chart)",
            formula_latex=r"LCL = \bar{x} - 3\hat{\sigma}",
            substitution_latex=(
                str(round(center_line, 6))
                + r" - 3 \times "
                + str(round(sigma, 6))
            ),
            result=lcl,
        )

    # ── MR-chart limits ──
    # D3=0, D4=3.267 for span=2 (AIAG constants)
    d4 = 3.267
    mr_ucl = d4 * mr_bar
    mr_lcl = 0.0  # D3=0 for span=2

    if collector:
        collector.step(
            label="UCL (MR-chart)",
            formula_latex=r"UCL_{MR} = D_4 \times \overline{MR}",
            substitution_latex=(
                str(d4) + r" \times " + str(round(mr_bar, 6))
            ),
            result=mr_ucl,
            note="D4 = 3.267 for span=2",
        )

    # ── Nelson Rules evaluation ──
    # We evaluate Nelson Rules against the I-chart data.
    # Rather than requiring the full RollingWindow infrastructure,
    # we implement a lightweight evaluation using the zone classification.
    violations = _evaluate_nelson_rules(values, center_line, sigma)

    # ── Verdict ──
    # Rules 1-4 are "critical" rules; Rules 5-8 are "supplementary"
    critical_rules = {1, 2, 3, 4}
    supplementary_rules = {5, 6, 7, 8}

    critical_violations = [v for v in violations if v["rule_id"] in critical_rules]
    supplementary_violations = [v for v in violations if v["rule_id"] in supplementary_rules]

    if critical_violations:
        verdict = "unstable"
        rule_ids = sorted({v["rule_id"] for v in critical_violations})
        verdict_reason = (
            f"Nelson Rule(s) {', '.join(str(r) for r in rule_ids)} triggered "
            f"({len(critical_violations)} violation(s))"
        )
    elif supplementary_violations:
        verdict = "potentially_unstable"
        rule_ids = sorted({v["rule_id"] for v in supplementary_violations})
        verdict_reason = (
            f"Nelson Rule(s) {', '.join(str(r) for r in rule_ids)} triggered "
            f"({len(supplementary_violations)} violation(s), supplementary rules only)"
        )
    else:
        verdict = "stable"
        verdict_reason = "No Nelson Rules violations detected"

    if collector:
        collector.step(
            label="Stability Verdict",
            formula_latex=(
                r"\text{Verdict} = \begin{cases}"
                r" \text{Stable} & \text{no Rules 1-8} \\"
                r" \text{Potentially Unstable} & \text{Rules 5-8 only} \\"
                r" \text{Unstable} & \text{Rules 1-4 triggered}"
                r" \end{cases}"
            ),
            substitution_latex=r"\text{" + verdict.replace("_", r"\_") + r"}",
            result=0.0 if verdict == "stable" else (0.5 if verdict == "potentially_unstable" else 1.0),
            note=verdict_reason,
        )

    return StabilityResult(
        values=values,
        center_line=center_line,
        ucl=ucl,
        lcl=lcl,
        sigma=sigma,
        moving_ranges=mr_values,
        mr_center_line=mr_bar,
        mr_ucl=mr_ucl,
        mr_lcl=mr_lcl,
        violations=violations,
        verdict=verdict,
        verdict_reason=verdict_reason,
        warnings=warnings,
    )


def _classify_zone(value: float, center: float, sigma: float) -> str:
    """Classify a point into a zone relative to center line."""
    if sigma <= 0:
        return "zone_c_upper" if value >= center else "zone_c_lower"

    distance = (value - center) / sigma

    if distance >= 3:
        return "beyond_ucl"
    elif distance >= 2:
        return "zone_a_upper"
    elif distance >= 1:
        return "zone_b_upper"
    elif distance >= 0:
        return "zone_c_upper"
    elif distance >= -1:
        return "zone_c_lower"
    elif distance >= -2:
        return "zone_b_lower"
    elif distance >= -3:
        return "zone_a_lower"
    else:
        return "beyond_lcl"


def _is_upper(zone: str) -> bool:
    return zone in ("zone_c_upper", "zone_b_upper", "zone_a_upper", "beyond_ucl")


def _is_lower(zone: str) -> bool:
    return zone in ("zone_c_lower", "zone_b_lower", "zone_a_lower", "beyond_lcl")


def _evaluate_nelson_rules(
    values: list[float],
    center: float,
    sigma: float,
) -> list[dict]:
    """Evaluate all 8 Nelson Rules against a sequence of values.

    This is a lightweight implementation that doesn't require the full
    RollingWindow/NelsonRuleLibrary infrastructure.  It scans the entire
    sequence (not just the tail) to find ALL violations for the stability
    report.

    Returns a list of violation dicts with rule_id, rule_name, indices, message.
    """
    n = len(values)
    zones = [_classify_zone(v, center, sigma) for v in values]
    violations: list[dict] = []

    # Rule 1: Point beyond 3-sigma
    for i in range(n):
        if zones[i] in ("beyond_ucl", "beyond_lcl"):
            violations.append({
                "rule_id": 1,
                "rule_name": "Outlier",
                "indices": [i],
                "message": f"Point {i + 1} at {values[i]:.4f} is beyond 3-sigma",
            })

    # Rule 2: 9 consecutive same side
    _consecutive = 9
    if n >= _consecutive:
        for start in range(n - _consecutive + 1):
            window = zones[start:start + _consecutive]
            if all(_is_upper(z) for z in window) or all(_is_lower(z) for z in window):
                side = "above" if _is_upper(window[0]) else "below"
                violations.append({
                    "rule_id": 2,
                    "rule_name": "Shift",
                    "indices": list(range(start, start + _consecutive)),
                    "message": f"{_consecutive} consecutive points {side} center (points {start + 1}-{start + _consecutive})",
                })
                break  # Report first occurrence only

    # Rule 3: 6 consecutive increasing or decreasing
    _consecutive = 6
    if n >= _consecutive:
        for start in range(n - _consecutive + 1):
            window_vals = values[start:start + _consecutive]
            all_inc = all(window_vals[j] < window_vals[j + 1] for j in range(_consecutive - 1))
            all_dec = all(window_vals[j] > window_vals[j + 1] for j in range(_consecutive - 1))
            if all_inc or all_dec:
                direction = "increasing" if all_inc else "decreasing"
                violations.append({
                    "rule_id": 3,
                    "rule_name": "Trend",
                    "indices": list(range(start, start + _consecutive)),
                    "message": f"{_consecutive} consecutive points {direction} (points {start + 1}-{start + _consecutive})",
                })
                break

    # Rule 4: 14 consecutive alternating
    _consecutive = 14
    if n >= _consecutive:
        for start in range(n - _consecutive + 1):
            window_vals = values[start:start + _consecutive]
            alternating = True
            for j in range(_consecutive - 2):
                d1 = window_vals[j + 1] - window_vals[j]
                d2_val = window_vals[j + 2] - window_vals[j + 1]
                if d1 * d2_val >= 0:
                    alternating = False
                    break
            if alternating:
                violations.append({
                    "rule_id": 4,
                    "rule_name": "Alternator",
                    "indices": list(range(start, start + _consecutive)),
                    "message": f"{_consecutive} consecutive alternating points (points {start + 1}-{start + _consecutive})",
                })
                break

    # Rule 5: 2 of 3 in Zone A or beyond, same side
    if n >= 3:
        zone_a_upper = {"zone_a_upper", "beyond_ucl"}
        zone_a_lower = {"zone_a_lower", "beyond_lcl"}
        for start in range(n - 2):
            window = zones[start:start + 3]
            upper_count = sum(1 for z in window if z in zone_a_upper)
            lower_count = sum(1 for z in window if z in zone_a_lower)
            if upper_count >= 2 or lower_count >= 2:
                side = "upper" if upper_count >= 2 else "lower"
                violations.append({
                    "rule_id": 5,
                    "rule_name": "Zone A Warning",
                    "indices": list(range(start, start + 3)),
                    "message": f"2 of 3 points in Zone A ({side} side, points {start + 1}-{start + 3})",
                })
                break

    # Rule 6: 4 of 5 in Zone B or beyond, same side
    if n >= 5:
        zone_b_upper = {"zone_b_upper", "zone_a_upper", "beyond_ucl"}
        zone_b_lower = {"zone_b_lower", "zone_a_lower", "beyond_lcl"}
        for start in range(n - 4):
            window = zones[start:start + 5]
            upper_count = sum(1 for z in window if z in zone_b_upper)
            lower_count = sum(1 for z in window if z in zone_b_lower)
            if upper_count >= 4 or lower_count >= 4:
                side = "upper" if upper_count >= 4 else "lower"
                violations.append({
                    "rule_id": 6,
                    "rule_name": "Zone B Warning",
                    "indices": list(range(start, start + 5)),
                    "message": f"4 of 5 points in Zone B+ ({side} side, points {start + 1}-{start + 5})",
                })
                break

    # Rule 7: 15 consecutive in Zone C
    _consecutive = 15
    if n >= _consecutive:
        zone_c = {"zone_c_upper", "zone_c_lower"}
        for start in range(n - _consecutive + 1):
            window = zones[start:start + _consecutive]
            if all(z in zone_c for z in window):
                violations.append({
                    "rule_id": 7,
                    "rule_name": "Stratification",
                    "indices": list(range(start, start + _consecutive)),
                    "message": f"{_consecutive} consecutive points in Zone C (points {start + 1}-{start + _consecutive})",
                })
                break

    # Rule 8: 8 consecutive outside Zone C, both sides
    _consecutive = 8
    if n >= _consecutive:
        zone_c = {"zone_c_upper", "zone_c_lower"}
        for start in range(n - _consecutive + 1):
            window = zones[start:start + _consecutive]
            if all(z not in zone_c for z in window):
                has_upper = any(_is_upper(z) and z not in zone_c for z in window)
                has_lower = any(_is_lower(z) and z not in zone_c for z in window)
                if has_upper and has_lower:
                    violations.append({
                        "rule_id": 8,
                        "rule_name": "Mixture",
                        "indices": list(range(start, start + _consecutive)),
                        "message": f"{_consecutive} consecutive points outside Zone C, both sides (points {start + 1}-{start + _consecutive})",
                    })
                    break

    return violations
