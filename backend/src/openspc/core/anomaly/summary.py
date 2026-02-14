"""Template-based natural language summary generation for anomaly events.

Generates human-readable descriptions of detected anomalies without
requiring an external LLM. Uses simple template interpolation for
determinism and speed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openspc.core.anomaly.detector import AnomalyResult


def generate_event_summary(result: "AnomalyResult") -> str:
    """Generate a natural language summary for a single anomaly result.

    Args:
        result: The AnomalyResult from a detector.

    Returns:
        Human-readable summary string.
    """
    if result.summary:
        return result.summary
    return _generate_from_details(result)


def _generate_from_details(result: "AnomalyResult") -> str:
    """Generate summary from result details when no pre-built summary exists."""
    d = result.details

    if result.event_type == "changepoint":
        before = d.get("segment_before_mean", 0)
        after = d.get("segment_after_mean", 0)
        shift_sigma = d.get("shift_sigma", 0)
        return (
            f"Process shift detected: mean changed from {before:.3f} "
            f"to {after:.3f} ({shift_sigma:.1f} sigma shift)."
        )

    if result.event_type == "outlier":
        score = d.get("anomaly_score", 0)
        threshold = d.get("threshold", -0.5)
        return (
            f"Multivariate anomaly detected (score: {score:.3f}, "
            f"threshold: {threshold}). Multiple process variables deviate "
            f"from normal operating patterns."
        )

    if result.event_type == "distribution_shift":
        p_value = d.get("p_value", 0)
        ks_stat = d.get("ks_statistic", 0)
        return (
            f"Process distribution has shifted (K-S statistic: {ks_stat:.4f}, "
            f"p-value: {p_value:.4f}). Recent data does not match the "
            f"established reference distribution."
        )

    return f"Anomaly detected by {result.detector_type}: {result.event_type}"


def generate_characteristic_summary(
    results: list["AnomalyResult"], characteristic_name: str
) -> str:
    """Generate a combined summary for multiple anomaly results.

    Args:
        results: List of AnomalyResult objects from all detectors.
        characteristic_name: Name of the characteristic being monitored.

    Returns:
        Combined human-readable summary.
    """
    if not results:
        return "No anomalies detected."

    parts: list[str] = []

    changepoints = [r for r in results if r.event_type == "changepoint"]
    outliers = [r for r in results if r.event_type == "outlier"]
    shifts = [r for r in results if r.event_type == "distribution_shift"]

    if changepoints:
        cp = changepoints[0]
        d = cp.details
        parts.append(
            f"Process shift detected in {characteristic_name}: "
            f"mean changed from {d.get('segment_before_mean', 0):.3f} to "
            f"{d.get('segment_after_mean', 0):.3f} "
            f"({d.get('shift_sigma', 0):.1f} sigma shift)."
        )

    if outliers:
        o = outliers[0]
        parts.append(
            f"Unusual data point detected (anomaly score: "
            f"{o.details.get('anomaly_score', 0):.3f}). "
            f"Multiple process variables deviate from normal operating patterns."
        )

    if shifts:
        s = shifts[0]
        parts.append(
            f"Process distribution has shifted "
            f"(K-S p-value: {s.details.get('p_value', 0):.4f}). "
            f"Recent data does not match the established reference distribution."
        )

    return " ".join(parts)
