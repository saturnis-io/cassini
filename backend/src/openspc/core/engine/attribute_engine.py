"""Attribute SPC engine for p, np, c, and u control charts.

This module provides control limit calculations, plotted value computation,
and Nelson Rules 1-4 evaluation for attribute (count-based) charts.

Chart types:
- p-chart: Fraction defective (defects / sample_size)
- np-chart: Number defective (defect_count, fixed sample_size)
- c-chart: Defect count per unit (fixed inspection units)
- u-chart: Defect rate (defects / units_inspected)

Only Nelson Rules 1-4 apply to attribute charts because Rules 5-8 assume
a normal distribution with defined sigma zones, which attribute charts
(based on binomial/Poisson distributions) do not guarantee.
"""

import math
import time
import structlog
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openspc.db.repositories import (
        CharacteristicRepository,
        SampleRepository,
        ViolationRepository,
    )

logger = structlog.get_logger(__name__)

VALID_ATTRIBUTE_CHART_TYPES = {"p", "np", "c", "u"}

# Attribute charts only use Nelson Rules 1-4
ATTRIBUTE_NELSON_RULE_IDS = {1, 2, 3, 4}


@dataclass
class AttributeLimits:
    """Result of attribute control limit calculation.

    Attributes:
        center_line: Process average (p-bar, np-bar, c-bar, u-bar)
        ucl: Upper Control Limit
        lcl: Lower Control Limit (floored at 0)
        chart_type: Chart type (p, np, c, u)
        sample_count: Number of samples used in calculation
        calculated_at: Timestamp when calculation was performed
    """

    center_line: float
    ucl: float
    lcl: float
    chart_type: str
    sample_count: int
    calculated_at: datetime


@dataclass
class AttributeRuleResult:
    """Result of checking a Nelson Rule on attribute chart data.

    Attributes:
        rule_id: Nelson Rule number (1-4)
        rule_name: Human-readable rule name
        triggered: Whether the rule was violated
        severity: Severity level (CRITICAL for Rule 1, WARNING for 2-4)
        involved_indices: Indices in the plotted_values array that caused the violation
        message: Human-readable description
    """

    rule_id: int
    rule_name: str
    triggered: bool
    severity: str
    involved_indices: list[int]
    message: str


@dataclass
class AttributeProcessingResult:
    """Result of processing an attribute sample through the engine.

    Attributes:
        sample_id: Database ID of the created sample
        characteristic_id: ID of the characteristic
        timestamp: When the sample was taken
        plotted_value: The computed statistic plotted on the chart
        defect_count: Raw defect count from input
        sample_size: Sample size (for p/np charts)
        center_line: Process center line
        ucl: Upper control limit (per-point for variable-n charts)
        lcl: Lower control limit (per-point for variable-n charts)
        in_control: True if no violations were triggered
        violations: List of attribute rule results that triggered
        processing_time_ms: Time taken to process in milliseconds
    """

    sample_id: int
    characteristic_id: int
    timestamp: datetime
    plotted_value: float
    defect_count: int
    sample_size: int | None
    center_line: float
    ucl: float
    lcl: float
    in_control: bool
    violations: list[AttributeRuleResult] = field(default_factory=list)
    processing_time_ms: float = 0.0


def calculate_attribute_limits(
    chart_type: str,
    samples: list[dict],
) -> AttributeLimits:
    """Calculate attribute control limits from historical sample data.

    Args:
        chart_type: One of "p", "np", "c", "u"
        samples: List of dicts with keys:
            - defect_count (int): Number of defects/defectives
            - sample_size (int, optional): Number of items inspected (p/np charts)
            - units_inspected (int, optional): Number of inspection units (u chart)

    Returns:
        AttributeLimits with center_line, ucl, lcl

    Raises:
        ValueError: If chart_type is invalid or required fields are missing
    """
    if chart_type not in VALID_ATTRIBUTE_CHART_TYPES:
        raise ValueError(f"Invalid attribute chart type: {chart_type}")

    if not samples:
        raise ValueError("No samples provided for limit calculation")

    if chart_type == "p":
        return _calculate_p_limits(samples)
    elif chart_type == "np":
        return _calculate_np_limits(samples)
    elif chart_type == "c":
        return _calculate_c_limits(samples)
    elif chart_type == "u":
        return _calculate_u_limits(samples)

    # Unreachable due to validation above, but satisfies type checker
    raise ValueError(f"Unsupported chart type: {chart_type}")


def _calculate_p_limits(samples: list[dict]) -> AttributeLimits:
    """p-chart: fraction defective.

    p-bar = total_defects / total_inspected
    UCL = p-bar + 3 * sqrt(p-bar * (1 - p-bar) / n-bar)
    LCL = p-bar - 3 * sqrt(p-bar * (1 - p-bar) / n-bar)

    Uses average sample size (n-bar) for overall limits.
    """
    total_defects = 0
    total_inspected = 0
    for s in samples:
        n = s.get("sample_size")
        if n is None or n <= 0:
            raise ValueError("p-chart requires positive sample_size for all samples")
        total_defects += s["defect_count"]
        total_inspected += n

    p_bar = total_defects / total_inspected
    n_bar = total_inspected / len(samples)

    sigma = math.sqrt(p_bar * (1 - p_bar) / n_bar) if p_bar > 0 and p_bar < 1 else 0
    ucl = p_bar + 3 * sigma
    lcl = max(0.0, p_bar - 3 * sigma)

    return AttributeLimits(
        center_line=p_bar,
        ucl=ucl,
        lcl=lcl,
        chart_type="p",
        sample_count=len(samples),
        calculated_at=datetime.now(timezone.utc),
    )


def _calculate_np_limits(samples: list[dict]) -> AttributeLimits:
    """np-chart: number defective (fixed sample size).

    np-bar = mean(defect_counts)
    p-bar = np-bar / n
    UCL = np-bar + 3 * sqrt(np-bar * (1 - p-bar))
    LCL = np-bar - 3 * sqrt(np-bar * (1 - p-bar))
    """
    defect_counts = [s["defect_count"] for s in samples]
    # np-chart requires constant sample size
    sample_sizes = {s.get("sample_size") for s in samples}
    sample_sizes.discard(None)
    if not sample_sizes:
        raise ValueError("np-chart requires sample_size")
    if len(sample_sizes) > 1:
        raise ValueError("np-chart requires constant sample_size across all samples")

    n = sample_sizes.pop()
    if n <= 0:
        raise ValueError("np-chart requires positive sample_size")

    np_bar = sum(defect_counts) / len(defect_counts)
    p_bar = np_bar / n

    sigma = math.sqrt(np_bar * (1 - p_bar)) if p_bar > 0 and p_bar < 1 else 0
    ucl = np_bar + 3 * sigma
    lcl = max(0.0, np_bar - 3 * sigma)

    return AttributeLimits(
        center_line=np_bar,
        ucl=ucl,
        lcl=lcl,
        chart_type="np",
        sample_count=len(samples),
        calculated_at=datetime.now(timezone.utc),
    )


def _calculate_c_limits(samples: list[dict]) -> AttributeLimits:
    """c-chart: defect count per unit (fixed inspection area/size).

    c-bar = mean(defect_counts)
    UCL = c-bar + 3 * sqrt(c-bar)
    LCL = c-bar - 3 * sqrt(c-bar)
    """
    defect_counts = [s["defect_count"] for s in samples]
    c_bar = sum(defect_counts) / len(defect_counts)

    sigma = math.sqrt(c_bar) if c_bar > 0 else 0
    ucl = c_bar + 3 * sigma
    lcl = max(0.0, c_bar - 3 * sigma)

    return AttributeLimits(
        center_line=c_bar,
        ucl=ucl,
        lcl=lcl,
        chart_type="c",
        sample_count=len(samples),
        calculated_at=datetime.now(timezone.utc),
    )


def _calculate_u_limits(samples: list[dict]) -> AttributeLimits:
    """u-chart: defect rate (variable inspection units).

    u-bar = total_defects / total_units
    UCL = u-bar + 3 * sqrt(u-bar / n-bar)
    LCL = u-bar - 3 * sqrt(u-bar / n-bar)

    Uses average units_inspected (n-bar) for overall limits.
    """
    total_defects = 0
    total_units = 0
    for s in samples:
        n = s.get("units_inspected")
        if n is None or n <= 0:
            raise ValueError("u-chart requires positive units_inspected for all samples")
        total_defects += s["defect_count"]
        total_units += n

    u_bar = total_defects / total_units
    n_bar = total_units / len(samples)

    sigma = math.sqrt(u_bar / n_bar) if u_bar > 0 else 0
    ucl = u_bar + 3 * sigma
    lcl = max(0.0, u_bar - 3 * sigma)

    return AttributeLimits(
        center_line=u_bar,
        ucl=ucl,
        lcl=lcl,
        chart_type="u",
        sample_count=len(samples),
        calculated_at=datetime.now(timezone.utc),
    )


def get_plotted_value(
    chart_type: str,
    defect_count: int,
    sample_size: int | None = None,
    units_inspected: int | None = None,
) -> float:
    """Calculate the plotted statistic for a single sample.

    Args:
        chart_type: One of "p", "np", "c", "u"
        defect_count: Number of defects/defectives found
        sample_size: Number of items inspected (p/np charts)
        units_inspected: Number of inspection units (u chart)

    Returns:
        The value to plot on the control chart

    Raises:
        ValueError: If required parameters are missing
    """
    if chart_type == "p":
        if sample_size is None or sample_size <= 0:
            raise ValueError("p-chart requires positive sample_size")
        return defect_count / sample_size
    elif chart_type == "np":
        return float(defect_count)
    elif chart_type == "c":
        return float(defect_count)
    elif chart_type == "u":
        if units_inspected is None or units_inspected <= 0:
            raise ValueError("u-chart requires positive units_inspected")
        return defect_count / units_inspected
    else:
        raise ValueError(f"Invalid chart type: {chart_type}")


def get_per_point_limits(
    chart_type: str,
    center_line: float,
    sample_size: int | None = None,
    units_inspected: int | None = None,
) -> tuple[float, float]:
    """Calculate per-point UCL/LCL for variable-n charts (p, u).

    For charts with variable sample sizes, control limits vary per point.
    np and c charts have fixed limits (return the overall limits).

    Args:
        chart_type: One of "p", "np", "c", "u"
        center_line: Process center line (p-bar, u-bar, etc.)
        sample_size: Sample size for this specific point (p chart)
        units_inspected: Units inspected for this specific point (u chart)

    Returns:
        Tuple of (ucl, lcl) for this specific point
    """
    if chart_type == "p":
        if sample_size is None or sample_size <= 0:
            raise ValueError("p-chart per-point limits require positive sample_size")
        sigma = math.sqrt(center_line * (1 - center_line) / sample_size) if 0 < center_line < 1 else 0
        ucl = center_line + 3 * sigma
        lcl = max(0.0, center_line - 3 * sigma)
        return ucl, lcl

    elif chart_type == "np":
        if sample_size is None or sample_size <= 0:
            raise ValueError("np-chart per-point limits require positive sample_size")
        p_bar = center_line / sample_size
        sigma = math.sqrt(center_line * (1 - p_bar)) if 0 < p_bar < 1 else 0
        ucl = center_line + 3 * sigma
        lcl = max(0.0, center_line - 3 * sigma)
        return ucl, lcl

    elif chart_type == "c":
        sigma = math.sqrt(center_line) if center_line > 0 else 0
        ucl = center_line + 3 * sigma
        lcl = max(0.0, center_line - 3 * sigma)
        return ucl, lcl

    elif chart_type == "u":
        if units_inspected is None or units_inspected <= 0:
            raise ValueError("u-chart per-point limits require positive units_inspected")
        sigma = math.sqrt(center_line / units_inspected) if center_line > 0 else 0
        ucl = center_line + 3 * sigma
        lcl = max(0.0, center_line - 3 * sigma)
        return ucl, lcl

    raise ValueError(f"Invalid chart type: {chart_type}")


def check_attribute_nelson_rules(
    plotted_values: list[float],
    center_line: float,
    ucl_values: list[float],
    lcl_values: list[float],
    sample_ids: list[int],
    enabled_rules: set[int] | None = None,
) -> list[AttributeRuleResult]:
    """Evaluate Nelson Rules 1-4 against attribute chart data.

    Rules 5-8 do NOT apply to attribute charts because they assume a
    normal distribution with defined sigma zones (A, B, C), which
    attribute charts (binomial/Poisson distributions) do not guarantee.

    Args:
        plotted_values: List of computed statistics (p, np, c, or u values)
        center_line: Process center line
        ucl_values: Per-point UCL values (same length as plotted_values)
        lcl_values: Per-point LCL values (same length as plotted_values)
        sample_ids: Sample IDs corresponding to plotted_values
        enabled_rules: Set of rule IDs to check (default: all 4)

    Returns:
        List of AttributeRuleResult for triggered rules only
    """
    if enabled_rules is None:
        enabled_rules = ATTRIBUTE_NELSON_RULE_IDS

    # Only check rules 1-4, intersect with enabled_rules
    rules_to_check = enabled_rules & ATTRIBUTE_NELSON_RULE_IDS

    results = []

    if not plotted_values:
        return results

    # Rule 1: Point beyond control limits (CRITICAL)
    if 1 in rules_to_check:
        result = _check_rule_1(plotted_values, ucl_values, lcl_values, sample_ids)
        if result is not None:
            results.append(result)

    # Rule 2: 9 consecutive on same side of center (WARNING)
    if 2 in rules_to_check:
        result = _check_rule_2(plotted_values, center_line, sample_ids)
        if result is not None:
            results.append(result)

    # Rule 3: 6 consecutive increasing/decreasing (WARNING)
    if 3 in rules_to_check:
        result = _check_rule_3(plotted_values, sample_ids)
        if result is not None:
            results.append(result)

    # Rule 4: 14 consecutive alternating (WARNING)
    if 4 in rules_to_check:
        result = _check_rule_4(plotted_values, sample_ids)
        if result is not None:
            results.append(result)

    return results


def _check_rule_1(
    values: list[float],
    ucl_values: list[float],
    lcl_values: list[float],
    sample_ids: list[int],
) -> AttributeRuleResult | None:
    """Rule 1: One point beyond control limits."""
    latest = values[-1]
    ucl = ucl_values[-1]
    lcl = lcl_values[-1]

    if latest > ucl or latest < lcl:
        side = "above UCL" if latest > ucl else "below LCL"
        return AttributeRuleResult(
            rule_id=1,
            rule_name="Outlier",
            triggered=True,
            severity="CRITICAL",
            involved_indices=[len(values) - 1],
            message=f"Point at {latest:.4f} is beyond control limits ({side})",
        )
    return None


def _check_rule_2(
    values: list[float],
    center_line: float,
    sample_ids: list[int],
) -> AttributeRuleResult | None:
    """Rule 2: Nine consecutive on same side of center line."""
    if len(values) < 9:
        return None

    last_9 = values[-9:]
    all_above = all(v > center_line for v in last_9)
    all_below = all(v < center_line for v in last_9)

    if all_above or all_below:
        side = "above" if all_above else "below"
        start_idx = len(values) - 9
        return AttributeRuleResult(
            rule_id=2,
            rule_name="Shift",
            triggered=True,
            severity="WARNING",
            involved_indices=list(range(start_idx, len(values))),
            message=f"9 consecutive points {side} center line",
        )
    return None


def _check_rule_3(
    values: list[float],
    sample_ids: list[int],
) -> AttributeRuleResult | None:
    """Rule 3: Six consecutive increasing or decreasing."""
    if len(values) < 6:
        return None

    last_6 = values[-6:]

    all_increasing = all(last_6[i] < last_6[i + 1] for i in range(5))
    all_decreasing = all(last_6[i] > last_6[i + 1] for i in range(5))

    if all_increasing or all_decreasing:
        direction = "increasing" if all_increasing else "decreasing"
        start_idx = len(values) - 6
        return AttributeRuleResult(
            rule_id=3,
            rule_name="Trend",
            triggered=True,
            severity="WARNING",
            involved_indices=list(range(start_idx, len(values))),
            message=f"6 consecutive points {direction}",
        )
    return None


def _check_rule_4(
    values: list[float],
    sample_ids: list[int],
) -> AttributeRuleResult | None:
    """Rule 4: Fourteen consecutive alternating up and down."""
    if len(values) < 14:
        return None

    last_14 = values[-14:]

    alternating = True
    for i in range(12):
        dir1 = last_14[i + 1] - last_14[i]
        dir2 = last_14[i + 2] - last_14[i + 1]
        if dir1 * dir2 >= 0:  # Same sign or zero means not alternating
            alternating = False
            break

    if alternating:
        start_idx = len(values) - 14
        return AttributeRuleResult(
            rule_id=4,
            rule_name="Alternator",
            triggered=True,
            severity="WARNING",
            involved_indices=list(range(start_idx, len(values))),
            message="14 consecutive points alternating up and down",
        )
    return None


async def process_attribute_sample(
    char_id: int,
    defect_count: int,
    sample_size: int | None,
    units_inspected: int | None,
    batch_number: str | None,
    operator_id: str | None,
    sample_repo: "SampleRepository",
    char_repo: "CharacteristicRepository",
    violation_repo: "ViolationRepository",
) -> AttributeProcessingResult:
    """Full attribute sample processing pipeline.

    Steps:
    1. Load characteristic and validate it's attribute type
    2. Create the sample with attribute columns
    3. Load historical window for limit calculation
    4. Calculate plotted value and per-point limits
    5. Run Nelson Rules 1-4
    6. Create violations for triggered rules
    7. Return result

    Args:
        char_id: Characteristic ID
        defect_count: Number of defects/defectives
        sample_size: Items inspected (p/np)
        units_inspected: Inspection units (u chart)
        batch_number: Optional batch identifier
        operator_id: Optional operator identifier
        sample_repo: Sample repository
        char_repo: Characteristic repository
        violation_repo: Violation repository

    Returns:
        AttributeProcessingResult with all processing data

    Raises:
        ValueError: If characteristic not found or validation fails
    """
    start_time = time.perf_counter()

    # Step 1: Load characteristic with rules
    char = await char_repo.get_with_rules(char_id)
    if char is None:
        raise ValueError(f"Characteristic {char_id} not found")

    if char.data_type != "attribute":
        raise ValueError(f"Characteristic {char_id} is not an attribute type (data_type={char.data_type})")

    chart_type = char.attribute_chart_type
    if chart_type not in VALID_ATTRIBUTE_CHART_TYPES:
        raise ValueError(f"Invalid attribute_chart_type: {chart_type}")

    # Extract values from ORM to avoid lazy loading
    char_ucl = char.ucl
    char_lcl = char.lcl
    char_stored_center_line = char.stored_center_line
    enabled_rules = {rule.rule_id for rule in char.rules if rule.is_enabled}
    rule_require_ack = {rule.rule_id: rule.require_acknowledgement for rule in char.rules}

    # Use default_sample_size from characteristic if not provided
    if sample_size is None and char.default_sample_size is not None:
        sample_size = char.default_sample_size

    # Step 2: Validate inputs for chart type
    if chart_type in ("p", "np"):
        if sample_size is None or sample_size <= 0:
            raise ValueError(f"{chart_type}-chart requires a positive sample_size")
        if defect_count > sample_size:
            raise ValueError(f"defect_count ({defect_count}) cannot exceed sample_size ({sample_size})")
    if chart_type == "u":
        if units_inspected is None or units_inspected <= 0:
            raise ValueError("u-chart requires a positive units_inspected")

    # Step 3: Create the sample
    sample = await sample_repo.create_attribute_sample(
        char_id=char_id,
        defect_count=defect_count,
        sample_size=sample_size,
        units_inspected=units_inspected,
        batch_number=batch_number,
        operator_id=operator_id,
    )

    # Step 4: Calculate plotted value
    plotted_value = get_plotted_value(
        chart_type=chart_type,
        defect_count=defect_count,
        sample_size=sample_size,
        units_inspected=units_inspected,
    )

    # Step 5: Get historical window for Nelson Rules evaluation
    window_data = await sample_repo.get_attribute_rolling_window(
        char_id=char_id,
        window_size=100,
        exclude_excluded=True,
    )

    # Compute plotted values and per-point limits for the window
    plotted_values = []
    ucl_values = []
    lcl_values = []
    window_sample_ids = []

    # Determine center line: use stored if available, else calculate from window
    if char_stored_center_line is not None:
        center_line = char_stored_center_line
    elif len(window_data) >= 2:
        limits = calculate_attribute_limits(chart_type, window_data)
        center_line = limits.center_line
    else:
        # Not enough data for limits - use plotted value as center
        center_line = plotted_value

    for wd in window_data:
        pv = get_plotted_value(
            chart_type=chart_type,
            defect_count=wd["defect_count"],
            sample_size=wd.get("sample_size"),
            units_inspected=wd.get("units_inspected"),
        )
        plotted_values.append(pv)
        window_sample_ids.append(wd["sample_id"])

        # Per-point limits
        if char_ucl is not None and char_lcl is not None:
            # Use stored overall limits as defaults
            pt_ucl, pt_lcl = char_ucl, char_lcl
            # For variable-n charts, compute per-point limits
            if chart_type in ("p", "u"):
                pt_ucl, pt_lcl = get_per_point_limits(
                    chart_type=chart_type,
                    center_line=center_line,
                    sample_size=wd.get("sample_size"),
                    units_inspected=wd.get("units_inspected"),
                )
            ucl_values.append(pt_ucl)
            lcl_values.append(pt_lcl)
        else:
            # No stored limits; compute from window if possible
            if len(window_data) >= 2:
                pt_ucl, pt_lcl = get_per_point_limits(
                    chart_type=chart_type,
                    center_line=center_line,
                    sample_size=wd.get("sample_size"),
                    units_inspected=wd.get("units_inspected"),
                )
                ucl_values.append(pt_ucl)
                lcl_values.append(pt_lcl)
            else:
                ucl_values.append(float("inf"))
                lcl_values.append(0.0)

    # Step 6: Check Nelson Rules 1-4
    rule_results = check_attribute_nelson_rules(
        plotted_values=plotted_values,
        center_line=center_line,
        ucl_values=ucl_values,
        lcl_values=lcl_values,
        sample_ids=window_sample_ids,
        enabled_rules=enabled_rules,
    )

    # Step 7: Create violations for triggered rules
    violations = []
    for result in rule_results:
        requires_ack = rule_require_ack.get(result.rule_id, True)
        violation_record = await violation_repo.create(
            sample_id=sample.id,
            char_id=char_id,
            rule_id=result.rule_id,
            rule_name=result.rule_name,
            severity=result.severity,
            acknowledged=False,
            requires_acknowledgement=requires_ack,
        )
        violations.append(result)

    # Get the effective limits for this point
    if ucl_values and lcl_values:
        effective_ucl = ucl_values[-1]
        effective_lcl = lcl_values[-1]
    elif char_ucl is not None and char_lcl is not None:
        effective_ucl = char_ucl
        effective_lcl = char_lcl
    else:
        effective_ucl = float("inf")
        effective_lcl = 0.0

    end_time = time.perf_counter()
    processing_time_ms = (end_time - start_time) * 1000

    return AttributeProcessingResult(
        sample_id=sample.id,
        characteristic_id=char_id,
        timestamp=sample.timestamp,
        plotted_value=plotted_value,
        defect_count=defect_count,
        sample_size=sample_size,
        center_line=center_line,
        ucl=effective_ucl,
        lcl=effective_lcl,
        in_control=len(violations) == 0,
        violations=violations,
        processing_time_ms=processing_time_ms,
    )
