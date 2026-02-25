"""Build chart context for LLM analysis."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.db.models.characteristic import Characteristic
from openspc.db.models.sample import Sample
from openspc.db.models.violation import Violation

logger = structlog.get_logger(__name__)


@dataclass
class ChartContext:
    """Complete chart context for AI analysis."""

    characteristic: dict
    control_limits: dict
    recent_values: list[float]
    statistics: dict
    capability: dict
    violations: list[dict]
    anomalies: list[dict]
    chart_patterns: dict


async def build_context(
    session: AsyncSession, char_id: int, sample_limit: int = 50
) -> ChartContext:
    """Build complete chart context for AI analysis.

    Loads the characteristic, recent samples (with measurements eager-loaded),
    violations, anomalies, and capability data, then computes descriptive
    statistics and detects basic chart patterns.
    """

    # Load characteristic
    char_stmt = select(Characteristic).where(Characteristic.id == char_id)
    char_result = await session.execute(char_stmt)
    char = char_result.scalar_one_or_none()
    if not char:
        raise ValueError(f"Characteristic {char_id} not found")

    # Pre-extract ORM attributes to avoid lazy-load traps in async
    char_name = char.name
    chart_type = char.chart_type
    usl = char.usl
    lsl = char.lsl
    target = char.target_value
    ucl = char.ucl
    lcl = char.lcl
    stored_center_line = char.stored_center_line

    # Derive center_line: prefer stored value, fall back to midpoint of limits
    center_line: float | None = None
    if stored_center_line is not None:
        center_line = stored_center_line
    elif ucl is not None and lcl is not None:
        center_line = (ucl + lcl) / 2

    # Load recent samples with measurements eager-loaded (async-safe)
    sample_stmt = (
        select(Sample)
        .where(Sample.char_id == char_id, Sample.is_excluded == False)  # noqa: E712
        .options(selectinload(Sample.measurements))
        .order_by(Sample.timestamp.desc())
        .limit(sample_limit)
    )
    sample_result = await session.execute(sample_stmt)
    samples = list(sample_result.scalars().all())
    samples.reverse()  # chronological order

    # Extract mean values from measurements
    values: list[float] = []
    for s in samples:
        measurements = [m.value for m in s.measurements]
        if measurements:
            values.append(float(np.mean(measurements)))

    # Compute statistics
    statistics: dict[str, Any] = {}
    if values:
        arr = np.array(values)
        statistics = {
            "mean": round(float(np.mean(arr)), 6),
            "std": round(float(np.std(arr, ddof=1)), 6) if len(arr) > 1 else 0,
            "min": round(float(np.min(arr)), 6),
            "max": round(float(np.max(arr)), 6),
            "range": round(float(np.max(arr) - np.min(arr)), 6),
            "sample_count": len(values),
        }

        # Trend direction (simple linear regression slope)
        if len(values) >= 5:
            x = np.arange(len(values))
            slope = float(np.polyfit(x, arr, 1)[0])
            statistics["trend_slope"] = round(slope, 6)
            statistics["trend_direction"] = (
                "up" if slope > 0 else "down" if slope < 0 else "flat"
            )

        # Run length (consecutive points same side of center line)
        if center_line is not None:
            run_length = 0
            current_side: str | None = None
            for v in reversed(values):
                side = "above" if v > center_line else "below"
                if current_side is None:
                    current_side = side
                if side == current_side:
                    run_length += 1
                else:
                    break
            statistics["run_length"] = run_length
            statistics["run_side"] = current_side

    # Detect patterns
    chart_patterns = _detect_patterns(values, center_line)

    # Load recent violations
    violation_stmt = (
        select(Violation)
        .where(Violation.char_id == char_id)
        .order_by(Violation.created_at.desc())
        .limit(10)
    )
    violation_result = await session.execute(violation_stmt)
    violations_raw = list(violation_result.scalars().all())

    violations = [
        {
            "rule_id": v.rule_id,
            "rule_name": v.rule_name,
            "severity": v.severity,
            "created_at": v.created_at.isoformat() if v.created_at else None,
            "acknowledged": v.acknowledged,
        }
        for v in violations_raw
    ]

    # Load active anomalies (if anomaly module exists)
    anomalies: list[dict] = []
    try:
        from openspc.db.models.anomaly import AnomalyEvent

        anomaly_stmt = (
            select(AnomalyEvent)
            .where(AnomalyEvent.char_id == char_id)
            .order_by(AnomalyEvent.detected_at.desc())
            .limit(5)
        )
        anomaly_result = await session.execute(anomaly_stmt)
        anomalies_raw = list(anomaly_result.scalars().all())
        anomalies = [
            {
                "event_type": a.event_type,
                "detector_type": a.detector_type,
                "severity": a.severity,
                "summary": a.summary[:200] if a.summary else "",
            }
            for a in anomalies_raw
        ]
    except Exception:
        pass  # Anomaly module may not exist or table structure differs

    # Load capability (if available)
    capability: dict = {}
    try:
        from openspc.db.models.capability import CapabilityHistory

        cap_stmt = (
            select(CapabilityHistory)
            .where(CapabilityHistory.characteristic_id == char_id)
            .order_by(CapabilityHistory.calculated_at.desc())
            .limit(1)
        )
        cap_result = await session.execute(cap_stmt)
        cap = cap_result.scalar_one_or_none()
        if cap:
            capability = {
                "cpk": cap.cpk,
                "ppk": cap.ppk,
                "cp": cap.cp,
                "pp": cap.pp,
            }
    except Exception:
        pass  # Capability module structure may vary

    return ChartContext(
        characteristic={
            "name": char_name,
            "chart_type": chart_type,
            "usl": usl,
            "lsl": lsl,
            "target": target,
        },
        control_limits={
            "ucl": ucl,
            "lcl": lcl,
            "center_line": center_line,
        },
        recent_values=values,
        statistics=statistics,
        capability=capability,
        violations=violations,
        anomalies=anomalies,
        chart_patterns=chart_patterns,
    )


def _detect_patterns(values: list[float], center_line: float | None) -> dict:
    """Detect basic chart patterns from values.

    Returns a dict of pattern names to booleans indicating detection.
    These are heuristic pre-detections to enrich the LLM prompt context.
    """
    patterns = {
        "trend_up": False,
        "trend_down": False,
        "shift": False,
        "stratification": False,
        "mixture": False,
        "oscillation": False,
    }

    if len(values) < 7 or center_line is None:
        return patterns

    # Trend: 7+ consecutive increasing or decreasing
    recent = values[-9:]
    for window_size in [7, 8, 9]:
        if len(recent) >= window_size:
            window = recent[-window_size:]
            if all(window[i] < window[i + 1] for i in range(len(window) - 1)):
                patterns["trend_up"] = True
            if all(window[i] > window[i + 1] for i in range(len(window) - 1)):
                patterns["trend_down"] = True

    # Shift: 9+ consecutive same side of center
    sides = ["above" if v > center_line else "below" for v in values[-15:]]
    for i in range(len(sides) - 8):
        if len(set(sides[i : i + 9])) == 1:
            patterns["shift"] = True
            break

    # Stratification: 15+ points in zone C (within +/-1 sigma of center)
    if len(values) >= 15:
        arr = np.array(values[-15:])
        sigma = float(np.std(arr, ddof=1))
        if sigma > 0:
            in_zone_c = int(np.sum(np.abs(arr - center_line) < sigma))
            if in_zone_c >= 15:
                patterns["stratification"] = True

    # Mixture / oscillation: 8+ alternating above/below center
    for i in range(len(values) - 7):
        window = values[i : i + 8]
        alternating = True
        for j in range(len(window) - 1):
            if (window[j] > center_line) == (window[j + 1] > center_line):
                alternating = False
                break
        if alternating:
            patterns["mixture"] = True
            break

    return patterns
