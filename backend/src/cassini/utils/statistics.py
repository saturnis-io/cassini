"""Statistical functions for SPC control chart calculations.

PURPOSE:
    Provides sigma estimation, control limit computation, and zone boundary
    calculation functions used throughout the Cassini SPC engine. This module
    sits between the raw constants (utils/constants.py) and the higher-level
    engine orchestrators (core/engine/*.py).

STANDARDS:
    - AIAG SPC Manual, 2nd Ed. (2005), Chapter II: Control Chart Construction
    - ASTM E2587-16: Standard Practice for Use of Control Charts
    - Montgomery (2019), "Introduction to Statistical Quality Control", 8th Ed.,
      Chapters 6-7
    - Wheeler & Chambers (1992), "Understanding Statistical Process Control",
      SPC Press

ARCHITECTURE:
    This module provides three tiers of functionality:
    1. Sigma estimation: estimate_sigma_rbar(), estimate_sigma_sbar(),
       estimate_sigma_moving_range() -- the core within-subgroup estimators.
    2. Control limit calculation: calculate_xbar_r_limits(),
       calculate_xbar_s_limits(), calculate_imr_limits() -- full chart limit
       computation combining sigma estimation with the appropriate factors.
    3. Zone classification: calculate_zones(), classify_zone() -- partition
       the chart into Zones A/B/C for Nelson Rules evaluation.

KEY DECISIONS:
    - Sigma estimation methods are selected by subgroup size:
        n=1:    Moving Range / d2 (I-MR chart)
        n=2-10: R-bar / d2 (preferred; range is efficient for small n)
        n>10:   S-bar / c4 (range loses efficiency for large n)
      This selection follows AIAG SPC Manual 2nd Ed., Chapter II and
      Montgomery (2019), Section 6.4.
    - All control limits use 3-sigma convention (k=3) per industry standard.
      The n_sigma parameter in calculate_control_limits_from_sigma() exists
      for research/advanced use only.
    - Zone boundaries are symmetric about the center line by construction.
"""

from dataclasses import dataclass
from typing import List

import numpy as np

from .constants import get_constants, get_d2, get_c4, get_A2, get_D3, get_D4, get_B3, get_B4


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
class XbarSLimits:
    """Control limits for X-bar and S charts.

    Used for subgroup sizes > 10, where the S chart (standard deviation) is
    preferred over the R chart (range).

    Attributes:
        xbar_limits: Control limits for the X-bar (means) chart
        s_limits: Control limits for the S (standard deviation) chart
    """
    xbar_limits: ControlLimits
    s_limits: ControlLimits


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

    Formula:
        sigma_hat = R-bar / d2

    where R-bar is the average of subgroup ranges and d2 is the expected
    value of the relative range for samples of size n from a normal
    distribution (tabulated in utils/constants.py).

    This is the standard within-subgroup sigma estimator for n=2-10.
    For n>10, the S-bar/c4 method (estimate_sigma_sbar) is preferred
    because the range statistic loses relative efficiency as n increases
    (the range uses only the min and max, ignoring interior order statistics).

    Ref: AIAG SPC Manual, 2nd Ed., Chapter II, p.18;
         Montgomery (2019), Section 6.2.1, Eq. (6.4);
         ASTM E2587-16, Section 7.2.

    Args:
        ranges: List of subgroup ranges (R_i = max - min within each subgroup)
        subgroup_size: The subgroup size (n), must be between 2 and 10

    Returns:
        Estimated within-subgroup process standard deviation (sigma_hat)

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

    # sigma_hat = R-bar / d2  (AIAG SPC Manual, 2nd Ed., Chapter II)
    r_bar = float(np.mean(ranges))
    d2 = get_d2(subgroup_size)

    return r_bar / d2


def estimate_sigma_sbar(std_devs: List[float], subgroup_size: int) -> float:
    """Estimate process sigma using S-bar/c4 method.

    Formula:
        sigma_hat = S-bar / c4

    where S-bar is the average of subgroup sample standard deviations
    (each computed with ddof=1) and c4 is the bias correction factor
    for the sample standard deviation under normality (tabulated in
    utils/constants.py).

    This method is preferred for subgroup sizes n > 10 because the
    sample standard deviation uses all n observations (not just min/max
    like the range), making it more statistically efficient for larger n.

    Ref: AIAG SPC Manual, 2nd Ed., Chapter II;
         Montgomery (2019), Section 6.4, Eq. (6.26);
         ASTM E2587-16, Section 7.3.

    Args:
        std_devs: List of subgroup sample standard deviations (S_i, ddof=1)
        subgroup_size: The subgroup size (n), must be greater than 10

    Returns:
        Estimated within-subgroup process standard deviation (sigma_hat)

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

    # sigma_hat = S-bar / c4  (AIAG SPC Manual, 2nd Ed., Chapter II)
    s_bar = float(np.mean(std_devs))
    c4 = get_c4(subgroup_size)

    return s_bar / c4


def estimate_sigma_moving_range(values: List[float], span: int = 2) -> float:
    """Estimate process sigma for individuals (n=1) using moving range method.

    Formula:
        MR_i = |x_i - x_{i-1}|   (for span=2)
        MR-bar = mean(MR_i)
        sigma_hat = MR-bar / d2   (d2 = 1.128 for span=2)

    This is the standard within-subgroup sigma estimator for I-MR
    (Individuals and Moving Range) charts. The default span of 2 is
    the most common choice because:
    1. It uses the minimum number of consecutive points, maximizing
       sensitivity to short-term variation.
    2. The d2 constant for span=2 (1.128) is well-established.
    3. It matches the AIAG SPC Manual and Montgomery recommendations.

    WHY moving range rather than sample std dev: The moving range method
    estimates WITHIN-subgroup (short-term) variation, which is the correct
    basis for control limits. The overall sample standard deviation would
    include between-subgroup variation (process shifts), leading to
    inflated limits that mask special causes.

    Ref: AIAG SPC Manual, 2nd Ed., Chapter II, p.93 (I-MR charts);
         Montgomery (2019), Section 6.4;
         Wheeler & Chambers (1992), Chapter 7.

    Args:
        values: List of individual measurements (time-ordered)
        span: Number of consecutive values to use for range calculation
              (default: 2, per AIAG/Montgomery convention)

    Returns:
        Estimated within-subgroup process standard deviation (sigma_hat)

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

    # sigma_hat = MR-bar / d2  (d2 = 1.128 for span=2)
    # Ref: ASTM E2587-16, Section 7.2; NIST/SEMATECH Handbook, Table 6.3.2
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

    # X-bar chart limits (AIAG SPC Manual 2nd Ed., Chapter II, p.45):
    #   CL  = X-double-bar = mean of subgroup means
    #   UCL = X-double-bar + A2 * R-bar
    #   LCL = X-double-bar - A2 * R-bar
    # where A2 = 3 / (d2 * sqrt(n)), giving 3-sigma limits on the
    # distribution of subgroup means.
    xbar = float(np.mean(subgroup_means))
    r_bar = float(np.mean(ranges))

    A2 = get_A2(subgroup_size)
    xbar_ucl = xbar + A2 * r_bar
    xbar_lcl = xbar - A2 * r_bar

    # Estimate sigma (within-subgroup): sigma_hat = R-bar / d2
    sigma = estimate_sigma_rbar(ranges, subgroup_size)

    xbar_limits = ControlLimits(
        center_line=xbar,
        ucl=xbar_ucl,
        lcl=xbar_lcl,
        sigma=sigma
    )

    # R chart limits (AIAG SPC Manual 2nd Ed., Chapter II, p.46):
    #   CL  = R-bar
    #   UCL = D4 * R-bar
    #   LCL = D3 * R-bar  (D3 = 0 for n <= 6)
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


def calculate_xbar_s_limits(
    subgroup_means: List[float],
    subgroup_stdevs: List[float],
    subgroup_size: int,
) -> XbarSLimits:
    """Calculate X-bar and S chart control limits.

    Used for subgroup sizes > 10, where the S chart is preferred over
    the R chart per AIAG SPC Manual 2nd Edition.

    X-bar limits: X-double-bar +/- A3 * S-bar, where A3 = 3 / (c4 * sqrt(n))
    S-chart limits: UCL_S = B4 * S-bar, LCL_S = B3 * S-bar

    Args:
        subgroup_means: List of subgroup means
        subgroup_stdevs: List of subgroup standard deviations
        subgroup_size: The subgroup size (n), must be > 10

    Returns:
        XbarSLimits containing control limits for both X-bar and S charts

    Raises:
        ValueError: If lists are empty, have different lengths, or
                   subgroup_size is invalid

    Reference:
        AIAG SPC Manual 2nd Edition, Chapter 2.
    """
    if not subgroup_means or not subgroup_stdevs:
        raise ValueError("Subgroup means and standard deviations cannot be empty")

    if len(subgroup_means) != len(subgroup_stdevs):
        raise ValueError(
            f"Subgroup means ({len(subgroup_means)}) and stdevs ({len(subgroup_stdevs)}) "
            "must have the same length"
        )

    if subgroup_size <= 10 or subgroup_size > 25:
        raise ValueError(
            f"S-chart is for subgroup sizes 11-25, got {subgroup_size}"
        )

    import math

    x_double_bar = float(np.mean(subgroup_means))
    s_bar = float(np.mean(subgroup_stdevs))
    c4 = get_c4(subgroup_size)
    # sigma_hat = S-bar / c4  (within-subgroup estimator)
    sigma = s_bar / c4

    # X-bar chart limits using S-bar method
    # (AIAG SPC Manual 2nd Ed., Chapter II):
    #   A3 = 3 / (c4 * sqrt(n))
    #   UCL = X-double-bar + A3 * S-bar
    #   LCL = X-double-bar - A3 * S-bar
    # This is algebraically equivalent to X-double-bar +/- 3*sigma/sqrt(n),
    # where sigma = S-bar/c4.
    a3 = 3.0 / (c4 * math.sqrt(subgroup_size))
    xbar_ucl = x_double_bar + a3 * s_bar
    xbar_lcl = x_double_bar - a3 * s_bar

    xbar_limits = ControlLimits(
        center_line=x_double_bar,
        ucl=xbar_ucl,
        lcl=xbar_lcl,
        sigma=sigma,
    )

    # S-chart limits (AIAG SPC Manual 2nd Ed., Appendix):
    #   UCL_S = B4 * S-bar
    #   LCL_S = B3 * S-bar  (B3 = 0 for n <= 5)
    # where B3 = max(0, 1 - 3*sqrt(1-c4^2)/c4) and
    #       B4 = 1 + 3*sqrt(1-c4^2)/c4
    B3 = get_B3(subgroup_size)
    B4 = get_B4(subgroup_size)
    s_ucl = B4 * s_bar
    s_lcl = B3 * s_bar

    s_limits = ControlLimits(
        center_line=s_bar,
        ucl=s_ucl,
        lcl=s_lcl,
        sigma=sigma,
    )

    return XbarSLimits(xbar_limits=xbar_limits, s_limits=s_limits)


def calculate_imr_limits(values: List[float], span: int = 2) -> XbarRLimits:
    """Calculate I-MR (Individuals and Moving Range) chart control limits.

    Used when only individual measurements are available (subgroup size n=1).

    Individuals chart (I chart):
        CL  = X-bar (mean of all individual values)
        UCL = X-bar + 3 * sigma_hat
        LCL = X-bar - 3 * sigma_hat
        where sigma_hat = MR-bar / d2  (d2 = 1.128 for span=2)

    Moving Range chart (MR chart):
        CL  = MR-bar
        UCL = D4 * MR-bar  (D4 = 3.267 for span=2)
        LCL = D3 * MR-bar  (D3 = 0 for span=2)

    Ref: AIAG SPC Manual, 2nd Ed., Chapter II, pp.93-100;
         Montgomery (2019), Section 6.4;
         Wheeler & Chambers (1992), Chapter 7.

    Args:
        values: List of individual measurements (time-ordered)
        span: Number of consecutive values for moving range (default: 2)

    Returns:
        XbarRLimits containing control limits for both I and MR charts
        (xbar_limits = Individuals chart, r_limits = Moving Range chart)

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

    # I chart: CL = X-bar, UCL/LCL = X-bar +/- 3*sigma_hat
    # where sigma_hat = MR-bar / d2  (within-subgroup estimator)
    x_bar = float(np.mean(values))
    sigma = estimate_sigma_moving_range(values, span)

    i_ucl = x_bar + 3 * sigma
    i_lcl = x_bar - 3 * sigma

    i_limits = ControlLimits(
        center_line=x_bar,
        ucl=i_ucl,
        lcl=i_lcl,
        sigma=sigma
    )

    # MR chart: CL = MR-bar, UCL = D4*MR-bar, LCL = D3*MR-bar
    arr = np.asarray(values, dtype=np.float64)
    if span == 2:
        moving_ranges = np.abs(np.diff(arr))
    else:
        moving_ranges = np.array([
            np.ptp(arr[i:i + span]) for i in range(len(arr) - span + 1)
        ])

    mr_bar = float(np.mean(moving_ranges))

    # For MR chart with span=2: D4 = 3.267, D3 = 0 (ASTM E2587-16, Table 1)
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

    The control chart is divided into six zones (three on each side of the
    center line), each one sigma wide. This zone structure is the basis for
    Nelson Rules 5-8, which detect non-random patterns by examining the
    distribution of points across zones.

    Zone layout (symmetric about center line):
        Beyond UCL:  value >= CL + 3*sigma  (out of control)
        Zone A:      CL + 2*sigma <= value < CL + 3*sigma
        Zone B:      CL + 1*sigma <= value < CL + 2*sigma
        Zone C:      CL <= value < CL + 1*sigma
        Zone C:      CL - 1*sigma <= value < CL  (lower)
        Zone B:      CL - 2*sigma <= value < CL - 1*sigma  (lower)
        Zone A:      CL - 3*sigma <= value < CL - 2*sigma  (lower)
        Beyond LCL:  value < CL - 3*sigma  (out of control)

    Under normality, the expected proportions are:
        Zone C: ~68.26% of points (34.13% each side)
        Zone B: ~27.18% of points (13.59% each side)
        Zone A: ~4.28% of points  (2.14% each side)
        Beyond: ~0.27% of points  (0.135% each side)

    Ref: Nelson (1984), "The Shewhart Control Chart -- Tests for Special
         Causes", JQT 16(4), pp.237-239;
         AIAG SPC Manual, 2nd Ed., Chapter II.

    Args:
        center_line: The center line (average) of the process
        sigma: The process standard deviation (within-subgroup)

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

    Classification uses >= (greater-than-or-equal) comparisons from the
    outermost zone inward. A value exactly on a boundary is placed in the
    zone ABOVE that boundary (e.g., a value exactly at +2sigma is classified
    as Zone A upper, not Zone B upper). A value exactly at the center line
    is classified as Zone C upper. This convention matches the rolling window
    zone classification in core/engine/rolling_window.py and ensures
    consistent Nelson Rules evaluation across the entire pipeline.

    Ref: Nelson (1984), JQT 16(4), pp.237-239.

    Args:
        value: The sample value to classify (subgroup mean or individual value).
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
