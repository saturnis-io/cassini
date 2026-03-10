"""Statistical constants for SPC control chart calculations.

PURPOSE:
    Provides the complete table of Shewhart control chart constants (d2, c4,
    A2, D3, D4, B3, B4) for subgroup sizes n=1 through n=25.  These constants
    are the foundation of all sigma estimation and control limit calculations
    in the Cassini SPC engine.

STANDARDS:
    - ASTM E2587-16, Table 1: "Standard Practice for Use of Control Charts
      in Statistical Process Control" -- primary source for d2, c4, A2, D3, D4
    - AIAG SPC Manual, 2nd Ed. (2005), Appendix: Table of Control Chart
      Constants -- primary source for B3, B4
    - NIST/SEMATECH e-Handbook of Statistical Methods, Section 6.3.2:
      "What are Variables Control Charts?" -- verification source
    - Montgomery (2019), "Introduction to Statistical Quality Control",
      8th Ed., Appendix Table VI -- verification source

ARCHITECTURE:
    This module is the lowest layer of the SPC calculation stack. It has
    zero dependencies within Cassini and is consumed by:
      - utils/statistics.py (sigma estimation functions)
      - core/engine/control_limits.py (control limit service)
      - core/engine/spc_engine.py (R-chart/S-chart limit checks)

KEY DECISIONS:
    - Constants are stored as a frozen dataclass table rather than computed
      at runtime.  The published tabulated values are authoritative; computing
      them from integrals of the relative range distribution introduces
      floating-point error and adds unnecessary complexity.
    - The n=1 row stores span=2 constants as a convenience for I-MR charts
      (see note on _CONSTANTS_TABLE below).
    - B3/B4 constants default to 0.0 for n<6 because the S-chart LCL is
      zero for small subgroups (the sampling distribution of S is bounded
      at zero and highly skewed for small n).
"""

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class SpcConstants:
    """Statistical constants for a given subgroup size n.

    These constants relate the statistics of subgroup ranges and standard
    deviations to the population standard deviation under normality.

    Mathematical definitions (for a normal population with std dev sigma):
        d2 = E[R] / sigma           -- expected value of the relative range
        c4 = E[S] / sigma           -- expected value of the relative std dev
        A2 = 3 / (d2 * sqrt(n))    -- X-bar chart limit factor using R-bar
        D3 = 1 - 3*d3/d2           -- R chart lower limit factor (floored at 0)
        D4 = 1 + 3*d3/d2           -- R chart upper limit factor
        B3 = 1 - 3*sqrt(1-c4^2)/c4 -- S chart lower limit factor (floored at 0)
        B4 = 1 + 3*sqrt(1-c4^2)/c4 -- S chart upper limit factor

    where d3 = std dev of the relative range distribution.

    Ref: ASTM E2587-16, Table 1; AIAG SPC Manual 2nd Ed., Appendix;
         Montgomery (2019), Appendix Table VI.

    Attributes:
        n: Subgroup size (number of observations per rational subgroup)
        d2: E[R]/sigma -- ratio of expected range to population sigma
        c4: E[S]/sigma -- ratio of expected std dev to population sigma
        A2: X-bar chart control limit factor: UCL/LCL = X-double-bar +/- A2*R-bar
        D3: R chart lower limit factor: LCL_R = D3 * R-bar
        D4: R chart upper limit factor: UCL_R = D4 * R-bar
        B3: S chart lower limit factor: LCL_S = B3 * S-bar (AIAG SPC Manual)
        B4: S chart upper limit factor: UCL_S = B4 * S-bar (AIAG SPC Manual)
    """
    n: int
    d2: float
    c4: float
    A2: float
    D3: float
    D4: float
    B3: float = 0.0
    B4: float = 0.0


# Statistical constants table for subgroup sizes 1-25
# Based on ASTM E2587, NIST Engineering Statistics Handbook, and AIAG SPC Manual
#
# NOTE on n=1 row: The d2, c4, A2, D3, D4 values for n=1 are actually the
# constants for span=2 (moving range of 2 consecutive observations).  The d2
# constant is formally undefined for a single observation.  This row exists as
# a convenience for the I-MR (Individuals & Moving Range) chart path, where
# span=2 is the standard convention.  Callers that need sigma estimation for
# individuals data should use `estimate_sigma_moving_range()` from
# `utils/statistics.py`, which explicitly uses span=2.
# Ref: ASTM E2587, NIST/SEMATECH Handbook Table 6.3.2.
#
# B3 and B4 constants (S-chart control limit factors) are from AIAG SPC Manual
# 2nd Edition, Table of Control Chart Constants.
#   UCL_S = B4 * S_bar,  LCL_S = B3 * S_bar
_CONSTANTS_TABLE: Dict[int, SpcConstants] = {
    1: SpcConstants(n=1, d2=1.128, c4=0.7979, A2=2.660, D3=0.0, D4=3.267, B3=0.0, B4=0.0),
    2: SpcConstants(n=2, d2=1.128, c4=0.7979, A2=1.880, D3=0.0, D4=3.267, B3=0.0, B4=3.267),
    3: SpcConstants(n=3, d2=1.693, c4=0.8862, A2=1.023, D3=0.0, D4=2.574, B3=0.0, B4=2.568),
    4: SpcConstants(n=4, d2=2.059, c4=0.9213, A2=0.729, D3=0.0, D4=2.282, B3=0.0, B4=2.266),
    5: SpcConstants(n=5, d2=2.326, c4=0.9400, A2=0.577, D3=0.0, D4=2.114, B3=0.0, B4=2.089),
    6: SpcConstants(n=6, d2=2.534, c4=0.9515, A2=0.483, D3=0.0, D4=2.004, B3=0.030, B4=1.970),
    7: SpcConstants(n=7, d2=2.704, c4=0.9594, A2=0.419, D3=0.076, D4=1.924, B3=0.118, B4=1.882),
    8: SpcConstants(n=8, d2=2.847, c4=0.9650, A2=0.373, D3=0.136, D4=1.864, B3=0.185, B4=1.815),
    9: SpcConstants(n=9, d2=2.970, c4=0.9693, A2=0.337, D3=0.184, D4=1.816, B3=0.239, B4=1.761),
    10: SpcConstants(n=10, d2=3.078, c4=0.9727, A2=0.308, D3=0.223, D4=1.777, B3=0.284, B4=1.716),
    11: SpcConstants(n=11, d2=3.173, c4=0.9754, A2=0.285, D3=0.256, D4=1.744, B3=0.321, B4=1.679),
    12: SpcConstants(n=12, d2=3.258, c4=0.9776, A2=0.266, D3=0.283, D4=1.717, B3=0.354, B4=1.646),
    13: SpcConstants(n=13, d2=3.336, c4=0.9794, A2=0.249, D3=0.307, D4=1.693, B3=0.382, B4=1.618),
    14: SpcConstants(n=14, d2=3.407, c4=0.9810, A2=0.235, D3=0.328, D4=1.672, B3=0.406, B4=1.594),
    15: SpcConstants(n=15, d2=3.472, c4=0.9823, A2=0.223, D3=0.347, D4=1.653, B3=0.428, B4=1.572),
    16: SpcConstants(n=16, d2=3.532, c4=0.9835, A2=0.212, D3=0.363, D4=1.637, B3=0.448, B4=1.552),
    17: SpcConstants(n=17, d2=3.588, c4=0.9845, A2=0.203, D3=0.378, D4=1.622, B3=0.466, B4=1.534),
    18: SpcConstants(n=18, d2=3.640, c4=0.9854, A2=0.194, D3=0.391, D4=1.608, B3=0.482, B4=1.518),
    19: SpcConstants(n=19, d2=3.689, c4=0.9862, A2=0.187, D3=0.403, D4=1.597, B3=0.497, B4=1.503),
    20: SpcConstants(n=20, d2=3.735, c4=0.9869, A2=0.180, D3=0.415, D4=1.585, B3=0.510, B4=1.490),
    21: SpcConstants(n=21, d2=3.778, c4=0.9876, A2=0.173, D3=0.425, D4=1.575, B3=0.523, B4=1.477),
    22: SpcConstants(n=22, d2=3.819, c4=0.9882, A2=0.167, D3=0.434, D4=1.566, B3=0.534, B4=1.466),
    23: SpcConstants(n=23, d2=3.858, c4=0.9887, A2=0.162, D3=0.443, D4=1.557, B3=0.545, B4=1.455),
    24: SpcConstants(n=24, d2=3.895, c4=0.9892, A2=0.157, D3=0.451, D4=1.548, B3=0.555, B4=1.445),
    25: SpcConstants(n=25, d2=3.931, c4=0.9896, A2=0.153, D3=0.459, D4=1.541, B3=0.565, B4=1.435),
}


def get_constants(subgroup_size: int) -> SpcConstants:
    """Get SPC constants for a given subgroup size.

    Args:
        subgroup_size: The subgroup size (n), must be between 1 and 25

    Returns:
        SpcConstants object containing d2, c4, A2, D3, D4 for the given n

    Raises:
        ValueError: If subgroup_size is not between 1 and 25

    Examples:
        >>> constants = get_constants(5)
        >>> constants.d2
        2.326
        >>> constants.c4
        0.9400
    """
    if subgroup_size < 1 or subgroup_size > 25:
        raise ValueError(
            f"Subgroup size must be between 1 and 25, got {subgroup_size}"
        )

    return _CONSTANTS_TABLE[subgroup_size]


def get_d2(subgroup_size: int) -> float:
    """Get d2 constant for a given subgroup size.

    The d2 constant is the expected value of the relative range W = R/sigma
    for samples of size n from a normal distribution:
        d2 = E[W] = E[R] / sigma

    Used in sigma estimation: sigma_hat = R-bar / d2

    Ref: ASTM E2587-16, Table 1; Montgomery (2019), Table VI.

    Args:
        subgroup_size: The subgroup size (n), must be between 1 and 25

    Returns:
        The d2 constant for the given subgroup size

    Raises:
        ValueError: If subgroup_size is not between 1 and 25

    Examples:
        >>> get_d2(5)
        2.326
    """
    return get_constants(subgroup_size).d2


def get_c4(subgroup_size: int) -> float:
    """Get c4 constant for a given subgroup size.

    The c4 constant is the expected value of the relative standard deviation
    for samples of size n from a normal distribution:
        c4 = E[S] / sigma

    Used in sigma estimation: sigma_hat = S-bar / c4

    Note: c4 approaches 1.0 as n increases (c4=0.9400 at n=5, c4=0.9896 at
    n=25). For large n, S-bar is nearly unbiased for sigma.

    Ref: ASTM E2587-16, Table 1; Montgomery (2019), Table VI.

    Args:
        subgroup_size: The subgroup size (n), must be between 1 and 25

    Returns:
        The c4 constant for the given subgroup size

    Raises:
        ValueError: If subgroup_size is not between 1 and 25

    Examples:
        >>> get_c4(10)
        0.9727
    """
    return get_constants(subgroup_size).c4


def get_A2(subgroup_size: int) -> float:
    """Get A2 constant for a given subgroup size.

    A2 is used for X-bar chart control limits when sigma is estimated
    from R-bar:
        UCL = X-double-bar + A2 * R-bar
        LCL = X-double-bar - A2 * R-bar

    Derivation: A2 = 3 / (d2 * sqrt(n)), which yields 3-sigma limits
    on the distribution of subgroup means.

    Ref: AIAG SPC Manual 2nd Ed., Chapter II, p.45;
         Montgomery (2019), Section 6.2.1.

    Args:
        subgroup_size: The subgroup size (n), must be between 1 and 25

    Returns:
        The A2 constant for the given subgroup size

    Raises:
        ValueError: If subgroup_size is not between 1 and 25

    Examples:
        >>> get_A2(5)
        0.577
    """
    return get_constants(subgroup_size).A2


def get_D3(subgroup_size: int) -> float:
    """Get D3 constant for a given subgroup size.

    D3 is the lower 3-sigma factor for the R chart:
        LCL_R = D3 * R-bar

    Derivation: D3 = max(0, 1 - 3*d3/d2), where d3 is the standard
    deviation of the relative range distribution. D3 = 0 for n <= 6
    because the sampling distribution of R is bounded below at zero
    and the -3sigma point falls at or below zero.

    Ref: ASTM E2587-16, Table 1; Montgomery (2019), Section 6.2.2.

    Args:
        subgroup_size: The subgroup size (n), must be between 1 and 25

    Returns:
        The D3 constant for the given subgroup size

    Raises:
        ValueError: If subgroup_size is not between 1 and 25

    Examples:
        >>> get_D3(7)
        0.076
    """
    return get_constants(subgroup_size).D3


def get_D4(subgroup_size: int) -> float:
    """Get D4 constant for a given subgroup size.

    D4 is the upper 3-sigma factor for the R chart:
        UCL_R = D4 * R-bar

    Derivation: D4 = 1 + 3*d3/d2, where d3 is the standard deviation
    of the relative range distribution.

    Ref: ASTM E2587-16, Table 1; Montgomery (2019), Section 6.2.2.

    Args:
        subgroup_size: The subgroup size (n), must be between 1 and 25

    Returns:
        The D4 constant for the given subgroup size

    Raises:
        ValueError: If subgroup_size is not between 1 and 25

    Examples:
        >>> get_D4(5)
        2.114
    """
    return get_constants(subgroup_size).D4


def get_B3(subgroup_size: int) -> float:
    """Get B3 constant for a given subgroup size.

    The B3 constant is used for calculating the lower control limit on S charts.
    LCL_S = B3 * S_bar.

    Args:
        subgroup_size: The subgroup size (n), must be between 2 and 25

    Returns:
        The B3 constant for the given subgroup size

    Raises:
        ValueError: If subgroup_size is not between 2 and 25

    Reference:
        AIAG SPC Manual 2nd Edition, Table of Control Chart Constants.

    Examples:
        >>> get_B3(10)
        0.284
    """
    if subgroup_size < 2 or subgroup_size > 25:
        raise ValueError(
            f"Subgroup size must be between 2 and 25, got {subgroup_size}"
        )
    return get_constants(subgroup_size).B3


def get_B4(subgroup_size: int) -> float:
    """Get B4 constant for a given subgroup size.

    The B4 constant is used for calculating the upper control limit on S charts.
    UCL_S = B4 * S_bar.

    Args:
        subgroup_size: The subgroup size (n), must be between 2 and 25

    Returns:
        The B4 constant for the given subgroup size

    Raises:
        ValueError: If subgroup_size is not between 2 and 25

    Reference:
        AIAG SPC Manual 2nd Edition, Table of Control Chart Constants.

    Examples:
        >>> get_B4(10)
        1.716
    """
    if subgroup_size < 2 or subgroup_size > 25:
        raise ValueError(
            f"Subgroup size must be between 2 and 25, got {subgroup_size}"
        )
    return get_constants(subgroup_size).B4
