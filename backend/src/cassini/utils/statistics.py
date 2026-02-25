"""Statistical functions for SPC control chart calculations.

This module provides functions for:
- Sigma estimation (R-bar/d2, S-bar/c4, moving range methods)
- Control limit calculations (X-bar R, I-MR charts)
- Zone boundary calculations for Nelson Rules
"""

from dataclasses import dataclass
from typing import List

import numpy as np

from .constants import get_constants, get_d2, get_c4, get_A2, get_D3, get_D4


@dataclass
class ControlLimits:
    """Control limits for a control chart.

    Attributes:
        center_line: Center line (average) of the process
        ucl: Upper Control Limit (typically +3 sigma)
        lcl: Lower Control Limit (typically -3 sigma)
        sigma: Estimated process standard deviation
    """
    center_line: float
    ucl: float
    lcl: float
    sigma: float


@dataclass
class XbarRLimits:
    """Control limits for X-bar and R charts.

    Attributes:
        xbar_limits: Control limits for the X-bar (means) chart
        r_limits: Control limits for the R (range) chart
    """
    xbar_limits: ControlLimits
    r_limits: ControlLimits


@dataclass
class ZoneBoundaries:
    """Zone boundaries for Nelson Rules testing.

    Zones are defined as:
    - Zone C: Between center line and +/- 1 sigma
    - Zone B: Between +/- 1 sigma and +/- 2 sigma
    - Zone A: Between +/- 2 sigma and +/- 3 sigma (UCL/LCL)

    Attributes:
        center_line: Center line of the chart
        plus_1_sigma: Center line + 1 sigma
        plus_2_sigma: Center line + 2 sigma
        plus_3_sigma: Center line + 3 sigma (UCL)
        minus_1_sigma: Center line - 1 sigma
        minus_2_sigma: Center line - 2 sigma
        minus_3_sigma: Center line - 3 sigma (LCL)
    """
    center_line: float
    plus_1_sigma: float
    plus_2_sigma: float
    plus_3_sigma: float
    minus_1_sigma: float
    minus_2_sigma: float
    minus_3_sigma: float


def estimate_sigma_rbar(ranges: List[float], subgroup_size: int) -> float:
    """Estimate process sigma using R-bar/d2 method.

    This method is recommended for subgroup sizes 2-10.

    Args:
        ranges: List of subgroup ranges
        subgroup_size: The subgroup size (n), must be between 2 and 10

    Returns:
        Estimated process standard deviation (sigma)

    Raises:
        ValueError: If ranges is empty, subgroup_size is not 2-10,
                   or any range is negative

    Examples:
        >>> ranges = [5.0, 6.0, 4.5, 5.5]
        >>> estimate_sigma_rbar(ranges, 5)
        2.253...
    """
    if not ranges:
        raise ValueError("Ranges list cannot be empty")

    if subgroup_size < 2 or subgroup_size > 10:
        raise ValueError(
            f"R-bar method recommended for subgroup sizes 2-10, got {subgroup_size}"
        )

    if any(r < 0 for r in ranges):
        raise ValueError("Ranges cannot be negative")

    r_bar = float(np.mean(ranges))
    d2 = get_d2(subgroup_size)

    return r_bar / d2


def estimate_sigma_sbar(std_devs: List[float], subgroup_size: int) -> float:
    """Estimate process sigma using S-bar/c4 method.

    This method is recommended for subgroup sizes greater than 10.

    Args:
        std_devs: List of subgroup standard deviations
        subgroup_size: The subgroup size (n), must be greater than 10

    Returns:
        Estimated process standard deviation (sigma)

    Raises:
        ValueError: If std_devs is empty, subgroup_size is not > 10,
                   or any standard deviation is negative

    Examples:
        >>> std_devs = [2.1, 2.3, 2.0, 2.2]
        >>> estimate_sigma_sbar(std_devs, 15)
        2.177...
    """
    if not std_devs:
        raise ValueError("Standard deviations list cannot be empty")

    if subgroup_size <= 10:
        raise ValueError(
            f"S-bar method recommended for subgroup sizes > 10, got {subgroup_size}"
        )

    if any(s < 0 for s in std_devs):
        raise ValueError("Standard deviations cannot be negative")

    s_bar = float(np.mean(std_devs))
    c4 = get_c4(subgroup_size)

    return s_bar / c4


def estimate_sigma_moving_range(values: List[float], span: int = 2) -> float:
    """Estimate process sigma for individuals (n=1) using moving range method.

    This is the standard method for I-MR (Individuals and Moving Range) charts.
    The default span of 2 is most commonly used.

    Args:
        values: List of individual measurements
        span: Number of consecutive values to use for range calculation (default: 2)

    Returns:
        Estimated process standard deviation (sigma)

    Raises:
        ValueError: If values has fewer than span elements, or span is invalid

    Examples:
        >>> values = [10, 12, 11, 13, 10]
        >>> estimate_sigma_moving_range(values)
        1.773...
    """
    if span < 2:
        raise ValueError(f"Span must be at least 2, got {span}")

    if len(values) < span:
        raise ValueError(
            f"Need at least {span} values for moving range calculation, got {len(values)}"
        )

    # Calculate moving ranges using numpy
    arr = np.asarray(values, dtype=np.float64)
    if span == 2:
        # Optimised path for the most common case
        moving_ranges = np.abs(np.diff(arr))
    else:
        # General case: rolling window max - min
        moving_ranges = np.array([
            np.ptp(arr[i:i + span]) for i in range(len(arr) - span + 1)
        ])

    mr_bar = float(np.mean(moving_ranges))

    # Use d2 for the span size (typically span=2, so d2=1.128)
    d2 = get_d2(span)

    return mr_bar / d2


def calculate_xbar_r_limits(
    subgroup_means: List[float],
    ranges: List[float],
    subgroup_size: int
) -> XbarRLimits:
    """Calculate X-bar and R chart control limits.

    Args:
        subgroup_means: List of subgroup means
        ranges: List of subgroup ranges
        subgroup_size: The subgroup size (n), must be between 2 and 25

    Returns:
        XbarRLimits containing control limits for both X-bar and R charts

    Raises:
        ValueError: If lists are empty, have different lengths, subgroup_size
                   is invalid, or any range is negative

    Examples:
        >>> means = [10.0, 10.2, 9.8, 10.1]
        >>> ranges = [1.2, 1.5, 1.0, 1.3]
        >>> limits = calculate_xbar_r_limits(means, ranges, 5)
        >>> limits.xbar_limits.center_line
        10.025
    """
    if not subgroup_means or not ranges:
        raise ValueError("Subgroup means and ranges cannot be empty")

    if len(subgroup_means) != len(ranges):
        raise ValueError(
            f"Subgroup means ({len(subgroup_means)}) and ranges ({len(ranges)}) "
            "must have the same length"
        )

    if subgroup_size < 2 or subgroup_size > 25:
        raise ValueError(
            f"Subgroup size must be between 2 and 25, got {subgroup_size}"
        )

    if any(r < 0 for r in ranges):
        raise ValueError("Ranges cannot be negative")

    # Calculate X-bar chart limits
    xbar = float(np.mean(subgroup_means))
    r_bar = float(np.mean(ranges))

    A2 = get_A2(subgroup_size)
    xbar_ucl = xbar + A2 * r_bar
    xbar_lcl = xbar - A2 * r_bar

    # Estimate sigma
    sigma = estimate_sigma_rbar(ranges, subgroup_size)

    xbar_limits = ControlLimits(
        center_line=xbar,
        ucl=xbar_ucl,
        lcl=xbar_lcl,
        sigma=sigma
    )

    # Calculate R chart limits
    D3 = get_D3(subgroup_size)
    D4 = get_D4(subgroup_size)

    r_ucl = D4 * r_bar
    r_lcl = D3 * r_bar

    r_limits = ControlLimits(
        center_line=r_bar,
        ucl=r_ucl,
        lcl=r_lcl,
        sigma=sigma  # Same sigma estimate for both charts
    )

    return XbarRLimits(xbar_limits=xbar_limits, r_limits=r_limits)


def calculate_imr_limits(values: List[float], span: int = 2) -> XbarRLimits:
    """Calculate I-MR (Individuals and Moving Range) chart control limits.

    This is used for processes where only individual measurements are available (n=1).

    Args:
        values: List of individual measurements
        span: Number of consecutive values for moving range (default: 2)

    Returns:
        XbarRLimits containing control limits for both I and MR charts

    Raises:
        ValueError: If values has fewer than span elements

    Examples:
        >>> values = [10, 12, 11, 13, 10, 12]
        >>> limits = calculate_imr_limits(values)
        >>> round(limits.xbar_limits.center_line, 2)
        11.33
    """
    if len(values) < span:
        raise ValueError(
            f"Need at least {span} values for I-MR chart, got {len(values)}"
        )

    # Calculate individuals (I) chart limits
    x_bar = float(np.mean(values))
    sigma = estimate_sigma_moving_range(values, span)

    # For individuals chart, limits are x-bar +/- 3*sigma
    i_ucl = x_bar + 3 * sigma
    i_lcl = x_bar - 3 * sigma

    i_limits = ControlLimits(
        center_line=x_bar,
        ucl=i_ucl,
        lcl=i_lcl,
        sigma=sigma
    )

    # Calculate moving range (MR) chart limits
    arr = np.asarray(values, dtype=np.float64)
    if span == 2:
        moving_ranges = np.abs(np.diff(arr))
    else:
        moving_ranges = np.array([
            np.ptp(arr[i:i + span]) for i in range(len(arr) - span + 1)
        ])

    mr_bar = float(np.mean(moving_ranges))

    # For MR chart with span=2: UCL = D4 * MR_bar, LCL = D3 * MR_bar
    D3 = get_D3(span)
    D4 = get_D4(span)

    mr_ucl = D4 * mr_bar
    mr_lcl = D3 * mr_bar

    mr_limits = ControlLimits(
        center_line=mr_bar,
        ucl=mr_ucl,
        lcl=mr_lcl,
        sigma=sigma
    )

    return XbarRLimits(xbar_limits=i_limits, r_limits=mr_limits)


def calculate_zones(center_line: float, sigma: float) -> ZoneBoundaries:
    """Calculate zone boundaries for Nelson Rules testing.

    Zones are used to detect non-random patterns in control charts:
    - Zone C: Between center line and +/- 1 sigma
    - Zone B: Between +/- 1 sigma and +/- 2 sigma
    - Zone A: Between +/- 2 sigma and +/- 3 sigma (control limits)

    Args:
        center_line: The center line (average) of the process
        sigma: The process standard deviation

    Returns:
        ZoneBoundaries with all zone boundaries calculated

    Raises:
        ValueError: If sigma is negative or zero

    Examples:
        >>> zones = calculate_zones(100.0, 2.0)
        >>> zones.plus_1_sigma
        102.0
        >>> zones.plus_3_sigma
        106.0
        >>> zones.minus_2_sigma
        96.0
    """
    if sigma <= 0:
        raise ValueError(f"Sigma must be positive, got {sigma}")

    return ZoneBoundaries(
        center_line=center_line,
        plus_1_sigma=center_line + sigma,
        plus_2_sigma=center_line + 2 * sigma,
        plus_3_sigma=center_line + 3 * sigma,
        minus_1_sigma=center_line - sigma,
        minus_2_sigma=center_line - 2 * sigma,
        minus_3_sigma=center_line - 3 * sigma
    )


def calculate_control_limits_from_sigma(
    center_line: float,
    sigma: float,
    n_sigma: float = 3.0
) -> ControlLimits:
    """Calculate control limits given center line and sigma.

    This is a general-purpose function for calculating control limits
    when sigma is already known or estimated.

    Args:
        center_line: The center line (average) of the process
        sigma: The process standard deviation
        n_sigma: Number of sigma for control limits (default: 3.0)

    Returns:
        ControlLimits with calculated UCL and LCL

    Raises:
        ValueError: If sigma is negative or zero, or n_sigma is negative

    Examples:
        >>> limits = calculate_control_limits_from_sigma(100.0, 2.0)
        >>> limits.ucl
        106.0
        >>> limits.lcl
        94.0
    """
    if sigma <= 0:
        raise ValueError(f"Sigma must be positive, got {sigma}")

    if n_sigma < 0:
        raise ValueError(f"n_sigma cannot be negative, got {n_sigma}")

    ucl = center_line + n_sigma * sigma
    lcl = center_line - n_sigma * sigma

    return ControlLimits(
        center_line=center_line,
        ucl=ucl,
        lcl=lcl,
        sigma=sigma
    )


def classify_zone(value: float, zones: ZoneBoundaries, center_line: float) -> str:
    """Classify a value into a zone label based on zone boundaries.

    Args:
        value: The sample value to classify.
        zones: ZoneBoundaries with all six boundaries.
        center_line: The center line of the chart.

    Returns:
        Zone label string: "beyond_ucl", "zone_a_upper", "zone_b_upper",
        "zone_c_upper", "zone_c_lower", "zone_b_lower", "zone_a_lower",
        or "beyond_lcl".
    """
    if value >= zones.plus_3_sigma:
        return "beyond_ucl"
    elif value >= zones.plus_2_sigma:
        return "zone_a_upper"
    elif value >= zones.plus_1_sigma:
        return "zone_b_upper"
    elif value >= center_line:
        return "zone_c_upper"
    elif value >= zones.minus_1_sigma:
        return "zone_c_lower"
    elif value >= zones.minus_2_sigma:
        return "zone_b_lower"
    elif value >= zones.minus_3_sigma:
        return "zone_a_lower"
    else:
        return "beyond_lcl"


def calculate_mean_range(values: List[float]) -> tuple[float, float | None]:
    """Calculate mean and range from a list of measurement values.

    Args:
        values: Non-empty list of measurement values.

    Returns:
        Tuple of (mean, range). Range is None for single values.
    """
    if not values:
        return 0.0, None
    mean = sum(values) / len(values)
    range_val = (max(values) - min(values)) if len(values) > 1 else None
    return mean, range_val
