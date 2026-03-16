"""Taguchi orthogonal array designs, S/N ratio analysis, and ANOM.

Provides standard orthogonal arrays (OAs) as constant matrices, signal-to-noise
ratio computations for four quality objective types, and Analysis of Means
(ANOM) for factor ranking and optimal level selection.

Inner array only.  Outer array (noise factor) support planned for future release.
Users can manually replicate under different noise conditions and compute S/N
across replicates.

References:
    Taguchi, Chowdhury & Wu (2005). Quality Engineering Handbook.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Sequence

import numpy as np

from cassini.core.doe.designs import DesignResult
from cassini.core.explain import ExplanationCollector

logger = logging.getLogger(__name__)

# Maximum S/N cap when variance is zero (prevents inf)
_SN_CAP_DB = 100.0

# Citation used in SYW steps
_TAGUCHI_CITATION = "Taguchi, Chowdhury & Wu (2005). Quality Engineering Handbook."


# ---------------------------------------------------------------------------
# Orthogonal array constant matrices
# ---------------------------------------------------------------------------
# Each OA is stored as a 2D list of coded level indices.
# For 2-level arrays: 0 -> coded -1, 1 -> coded +1
# For 3-level arrays: 0 -> coded -1, 1 -> coded 0, 2 -> coded +1
# ---------------------------------------------------------------------------

# L4(2^3): 4 runs, up to 3 two-level factors
_L4 = [
    [0, 0, 0],
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
]

# L8(2^7): 8 runs, up to 7 two-level factors
_L8 = [
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1],
    [0, 1, 1, 0, 0, 1, 1],
    [0, 1, 1, 1, 1, 0, 0],
    [1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 1, 0, 1, 0],
    [1, 1, 0, 0, 1, 1, 0],
    [1, 1, 0, 1, 0, 0, 1],
]

# L9(3^4): 9 runs, up to 4 three-level factors
_L9 = [
    [0, 0, 0, 0],
    [0, 1, 1, 1],
    [0, 2, 2, 2],
    [1, 0, 1, 2],
    [1, 1, 2, 0],
    [1, 2, 0, 1],
    [2, 0, 2, 1],
    [2, 1, 0, 2],
    [2, 2, 1, 0],
]

# L12(2^11): 12 runs, up to 11 two-level factors (Plackett-Burman style)
_L12 = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1],
    [0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1],
    [0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0],
    [0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 0],
    [1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0],
    [1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0],
    [1, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
    [1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0],
    [1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    [1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1],
]

# L16(2^15): 16 runs, up to 15 two-level factors
_L16 = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1],
    [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
    [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    [0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0],
    [1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0],
    [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1],
    [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0],
    [1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1],
    [1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1],
    [1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0],
]

# L18(2^1 x 3^7): 18 runs, 1 two-level + up to 7 three-level factors
# Column 0 is 2-level (coded 0/1 -> -1/+1)
# Columns 1-7 are 3-level (coded 0/1/2 -> -1/0/+1)
_L18 = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1],
    [0, 0, 2, 2, 2, 2, 2, 2],
    [0, 1, 0, 0, 1, 1, 2, 2],
    [0, 1, 1, 1, 2, 2, 0, 0],
    [0, 1, 2, 2, 0, 0, 1, 1],
    [0, 2, 0, 1, 0, 2, 1, 2],
    [0, 2, 1, 2, 1, 0, 2, 0],
    [0, 2, 2, 0, 2, 1, 0, 1],
    [1, 0, 0, 2, 1, 2, 0, 1],
    [1, 0, 1, 0, 2, 0, 1, 2],
    [1, 0, 2, 1, 0, 1, 2, 0],
    [1, 1, 0, 1, 2, 0, 2, 1],
    [1, 1, 1, 2, 0, 1, 0, 2],
    [1, 1, 2, 0, 1, 2, 1, 0],
    [1, 2, 0, 2, 2, 1, 1, 0],
    [1, 2, 1, 0, 0, 2, 2, 1],
    [1, 2, 2, 1, 1, 0, 0, 2],
]

# L27(3^13): 27 runs, up to 13 three-level factors
_L27 = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    [0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 2, 2, 2],
    [0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 0, 0, 0],
    [0, 1, 1, 1, 2, 2, 2, 0, 0, 0, 1, 1, 1],
    [0, 2, 2, 2, 0, 0, 0, 2, 2, 2, 1, 1, 1],
    [0, 2, 2, 2, 1, 1, 1, 0, 0, 0, 2, 2, 2],
    [0, 2, 2, 2, 2, 2, 2, 1, 1, 1, 0, 0, 0],
    [1, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2],
    [1, 0, 1, 2, 1, 2, 0, 1, 2, 0, 1, 2, 0],
    [1, 0, 1, 2, 2, 0, 1, 2, 0, 1, 2, 0, 1],
    [1, 1, 2, 0, 0, 1, 2, 1, 2, 0, 2, 0, 1],
    [1, 1, 2, 0, 1, 2, 0, 2, 0, 1, 0, 1, 2],
    [1, 1, 2, 0, 2, 0, 1, 0, 1, 2, 1, 2, 0],
    [1, 2, 0, 1, 0, 1, 2, 2, 0, 1, 1, 2, 0],
    [1, 2, 0, 1, 1, 2, 0, 0, 1, 2, 2, 0, 1],
    [1, 2, 0, 1, 2, 0, 1, 1, 2, 0, 0, 1, 2],
    [2, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1],
    [2, 0, 2, 1, 1, 0, 2, 1, 0, 2, 1, 0, 2],
    [2, 0, 2, 1, 2, 1, 0, 2, 1, 0, 2, 1, 0],
    [2, 1, 0, 2, 0, 2, 1, 1, 0, 2, 2, 1, 0],
    [2, 1, 0, 2, 1, 0, 2, 2, 1, 0, 0, 2, 1],
    [2, 1, 0, 2, 2, 1, 0, 0, 2, 1, 1, 0, 2],
    [2, 2, 1, 0, 0, 2, 1, 2, 1, 0, 1, 0, 2],
    [2, 2, 1, 0, 1, 0, 2, 0, 2, 1, 2, 1, 0],
    [2, 2, 1, 0, 2, 1, 0, 1, 0, 2, 0, 2, 1],
]


# Registry: (n_levels, max_factors) -> (OA matrix, n_runs, total_columns)
# For L18, columns have mixed levels: col 0 is 2-level, cols 1-7 are 3-level.
# We handle L18 specially in _select_oa().
_OA_REGISTRY: dict[str, tuple[list[list[int]], int, int, int]] = {
    # key: (matrix, n_runs, max_cols, n_levels)
    "L4":  (_L4,  4,  3,  2),
    "L8":  (_L8,  8,  7,  2),
    "L9":  (_L9,  9,  4,  3),
    "L12": (_L12, 12, 11, 2),
    "L16": (_L16, 16, 15, 2),
    "L18": (_L18, 18, 8,  3),  # mixed: col 0 is 2-level, rest 3-level
    "L27": (_L27, 27, 13, 3),
}

# Sorted selection order for 2-level arrays (by n_runs ascending)
_TWO_LEVEL_OAS = ["L4", "L8", "L12", "L16"]
# Sorted selection order for 3-level arrays (by n_runs ascending)
_THREE_LEVEL_OAS = ["L9", "L18", "L27"]


def _select_oa(
    n_factors: int,
    n_levels: int,
) -> tuple[str, list[list[int]], int]:
    """Select the smallest orthogonal array that fits the given factors.

    Args:
        n_factors: Number of factors to accommodate.
        n_levels: Number of levels per factor (2 or 3).

    Returns:
        Tuple of (OA name, matrix rows, number of columns in full OA).

    Raises:
        ValueError: If no suitable OA exists for the given parameters.
    """
    if n_levels == 2:
        candidates = _TWO_LEVEL_OAS
    elif n_levels == 3:
        candidates = _THREE_LEVEL_OAS
    else:
        raise ValueError(
            f"Taguchi OAs support 2 or 3 levels per factor, got {n_levels}"
        )

    for oa_name in candidates:
        _, n_runs, max_cols, oa_levels = _OA_REGISTRY[oa_name]
        # For L18 (mixed): 3-level factors use columns 1-7 (7 cols)
        # but if user wants 2-level, L18 is not in the 2-level list anyway.
        # For 3-level, L18 offers cols 1-7 = 7 three-level columns.
        if oa_levels == n_levels or (oa_name == "L18" and n_levels == 3):
            usable_cols = max_cols
            if oa_name == "L18" and n_levels == 3:
                usable_cols = 7  # only columns 1-7 are 3-level
            if usable_cols >= n_factors:
                matrix = _OA_REGISTRY[oa_name][0]
                return oa_name, matrix, max_cols

    if n_levels == 2:
        raise ValueError(
            f"No Taguchi orthogonal array for {n_factors} two-level factors. "
            f"Maximum supported: 15 factors (L16). "
            f"Consider Plackett-Burman or D-Optimal designs."
        )
    else:
        raise ValueError(
            f"No Taguchi orthogonal array for {n_factors} three-level factors. "
            f"Maximum supported: 13 factors (L27). "
            f"Consider D-Optimal designs."
        )


def taguchi(
    n_factors: int,
    n_levels: int = 2,
    seed: int | None = None,
) -> DesignResult:
    """Generate a Taguchi orthogonal array design.

    Selects the smallest standard OA that can accommodate the requested
    number of factors and levels.  Unused columns are dropped.

    Inner array only.  Outer array (noise factor) support planned for
    future release.

    Args:
        n_factors: Number of factors (2-15 for 2-level, 2-13 for 3-level).
        n_levels: Number of levels per factor (2 or 3).
        seed: Random seed for run-order shuffling.

    Returns:
        :class:`DesignResult` with coded values.
        For 2-level: coded values in {-1, +1}.
        For 3-level: coded values in {-1, 0, +1}.

    Raises:
        ValueError: If parameters are invalid or no suitable OA exists.
    """
    if n_factors < 2:
        raise ValueError(
            f"Taguchi designs require at least 2 factors, got {n_factors}"
        )

    if n_levels not in (2, 3):
        raise ValueError(
            f"Taguchi OAs support 2 or 3 levels, got {n_levels}"
        )

    oa_name, matrix_raw, total_cols = _select_oa(n_factors, n_levels)
    n_runs = len(matrix_raw)

    # For L18, 3-level factors should use columns 1-7 (skip col 0 which is 2-level)
    if oa_name == "L18" and n_levels == 3:
        col_offset = 1
    else:
        col_offset = 0

    # Build coded matrix: convert level indices to coded values
    # 2-level: 0 -> -1, 1 -> +1
    # 3-level: 0 -> -1, 1 -> 0, 2 -> +1
    coded = np.zeros((n_runs, n_factors), dtype=float)
    for row_idx in range(n_runs):
        for col_idx in range(n_factors):
            raw_col = col_idx + col_offset
            level_idx = matrix_raw[row_idx][raw_col]
            if n_levels == 2:
                coded[row_idx, col_idx] = -1.0 if level_idx == 0 else 1.0
            else:  # 3-level
                coded[row_idx, col_idx] = float(level_idx - 1)  # 0->-1, 1->0, 2->+1

    std_order = list(range(1, n_runs + 1))
    is_cp = [False] * n_runs

    if seed is not None:
        rng = np.random.default_rng(seed)
        run_order = (rng.permutation(n_runs) + 1).tolist()
    else:
        run_order = list(std_order)

    return DesignResult(
        coded_matrix=coded,
        standard_order=std_order,
        run_order=run_order,
        is_center_point=is_cp,
        n_runs=n_runs,
        n_factors=n_factors,
        design_type="taguchi",
    )


# ---------------------------------------------------------------------------
# Signal-to-Noise ratio computations
# ---------------------------------------------------------------------------

@dataclass
class SNResult:
    """Signal-to-noise ratio computation result for a single trial."""

    sn_ratio: float | None
    """S/N ratio in dB, or None if computation failed."""

    warning: str | None = None
    """Warning message if computation had issues."""


def _sn_smaller_is_better(
    y: np.ndarray,
    collector: ExplanationCollector | None = None,
) -> SNResult:
    """S/N for smaller-is-better: -10 * log10(mean(y^2)).

    All yi must be defined (no NaN).
    """
    if len(y) == 0:
        return SNResult(sn_ratio=None, warning="No response values provided")

    if np.any(np.isnan(y)):
        return SNResult(sn_ratio=None, warning="NaN values in response data")

    mean_y_sq = float(np.mean(y ** 2))

    if mean_y_sq <= 0:
        sn = _SN_CAP_DB
    else:
        sn = -10.0 * math.log10(mean_y_sq)

    if collector:
        collector.step(
            label="S/N Ratio (Smaller-is-Better)",
            formula_latex=r"\eta = -10 \log_{10}\left(\frac{1}{n}\sum_{i=1}^{n} y_i^2\right)",
            substitution_latex=(
                rf"\eta = -10 \log_{{10}}\left(\frac{{1}}{{{len(y)}}}"
                rf"\cdot {mean_y_sq:.6f}\right)"
            ),
            result=sn,
            note=_TAGUCHI_CITATION,
        )

    return SNResult(sn_ratio=sn)


def _sn_larger_is_better(
    y: np.ndarray,
    collector: ExplanationCollector | None = None,
) -> SNResult:
    """S/N for larger-is-better: -10 * log10(mean(1/y^2)).

    All yi must be > 0.
    """
    if len(y) == 0:
        return SNResult(sn_ratio=None, warning="No response values provided")

    if np.any(np.isnan(y)):
        return SNResult(sn_ratio=None, warning="NaN values in response data")

    if np.any(y <= 0):
        return SNResult(
            sn_ratio=None,
            warning="All response values must be > 0 for larger-is-better S/N",
        )

    mean_inv_y_sq = float(np.mean(1.0 / (y ** 2)))

    if mean_inv_y_sq <= 0:
        sn = _SN_CAP_DB
    else:
        sn = -10.0 * math.log10(mean_inv_y_sq)

    if collector:
        collector.step(
            label="S/N Ratio (Larger-is-Better)",
            formula_latex=r"\eta = -10 \log_{10}\left(\frac{1}{n}\sum_{i=1}^{n} \frac{1}{y_i^2}\right)",
            substitution_latex=(
                rf"\eta = -10 \log_{{10}}\left(\frac{{1}}{{{len(y)}}}"
                rf"\cdot {mean_inv_y_sq:.6f}\right)"
            ),
            result=sn,
            note=_TAGUCHI_CITATION,
        )

    return SNResult(sn_ratio=sn)


def _sn_nominal_is_best_1(
    y: np.ndarray,
    collector: ExplanationCollector | None = None,
) -> SNResult:
    """S/N for NTB-1 (mean adjustable): 10 * log10(y_bar^2 / s^2).

    Guards: s^2 > 0 and y_bar != 0.
    """
    if len(y) < 2:
        return SNResult(
            sn_ratio=None,
            warning="NTB-1 requires at least 2 observations",
        )

    if np.any(np.isnan(y)):
        return SNResult(sn_ratio=None, warning="NaN values in response data")

    y_bar = float(np.mean(y))
    s_sq = float(np.var(y, ddof=1))

    if s_sq <= 0:
        # Variance is zero -> cap at maximum
        sn = _SN_CAP_DB
        if collector:
            collector.step(
                label="S/N Ratio (NTB-1, Variance = 0)",
                formula_latex=r"\eta = 10 \log_{10}\left(\frac{\bar{y}^2}{s^2}\right)",
                substitution_latex=rf"\eta = \text{{capped at }} {_SN_CAP_DB} \text{{ dB (variance = 0)}}",
                result=sn,
                note=_TAGUCHI_CITATION,
            )
        return SNResult(sn_ratio=sn)

    if abs(y_bar) < 1e-30:
        return SNResult(
            sn_ratio=None,
            warning="Mean is zero for NTB-1 S/N — cannot compute ratio. "
            "Consider using NTB-2 (nominal-is-best with fixed target).",
        )

    sn = 10.0 * math.log10(y_bar ** 2 / s_sq)

    if collector:
        collector.step(
            label="S/N Ratio (Nominal-is-Best Type 1)",
            formula_latex=r"\eta = 10 \log_{10}\left(\frac{\bar{y}^2}{s^2}\right)",
            substitution_latex=(
                rf"\eta = 10 \log_{{10}}\left(\frac{{{y_bar:.6f}^2}}"
                rf"{{{s_sq:.6f}}}\right)"
            ),
            result=sn,
            note=_TAGUCHI_CITATION,
        )

    return SNResult(sn_ratio=sn)


def _sn_nominal_is_best_2(
    y: np.ndarray,
    collector: ExplanationCollector | None = None,
) -> SNResult:
    """S/N for NTB-2 (mean on target): -10 * log10(s^2).

    Guard: s^2 > 0.
    """
    if len(y) < 2:
        return SNResult(
            sn_ratio=None,
            warning="NTB-2 requires at least 2 observations",
        )

    if np.any(np.isnan(y)):
        return SNResult(sn_ratio=None, warning="NaN values in response data")

    s_sq = float(np.var(y, ddof=1))

    if s_sq <= 0:
        sn = _SN_CAP_DB
    else:
        sn = -10.0 * math.log10(s_sq)

    if collector:
        collector.step(
            label="S/N Ratio (Nominal-is-Best Type 2)",
            formula_latex=r"\eta = -10 \log_{10}(s^2)",
            substitution_latex=rf"\eta = -10 \log_{{10}}({s_sq:.6f})",
            result=sn,
            note=_TAGUCHI_CITATION,
        )

    return SNResult(sn_ratio=sn)


# Dispatch map
_SN_FUNCTIONS = {
    "smaller_is_better": _sn_smaller_is_better,
    "larger_is_better": _sn_larger_is_better,
    "nominal_is_best_1": _sn_nominal_is_best_1,
    "nominal_is_best_2": _sn_nominal_is_best_2,
}

SN_TYPES = list(_SN_FUNCTIONS.keys())


def compute_sn_ratio(
    y: np.ndarray,
    sn_type: str,
    collector: ExplanationCollector | None = None,
) -> SNResult:
    """Compute the signal-to-noise ratio for a response vector.

    Args:
        y: Response values (1D array).
        sn_type: One of 'smaller_is_better', 'larger_is_better',
                 'nominal_is_best_1', 'nominal_is_best_2'.
        collector: Optional SYW explanation collector.

    Returns:
        :class:`SNResult` with computed S/N ratio.

    Raises:
        ValueError: If sn_type is not recognized.
    """
    if sn_type not in _SN_FUNCTIONS:
        raise ValueError(
            f"Unknown S/N type '{sn_type}'. "
            f"Supported: {', '.join(SN_TYPES)}"
        )

    y = np.asarray(y, dtype=float)
    return _SN_FUNCTIONS[sn_type](y, collector)


# ---------------------------------------------------------------------------
# ANOM — Analysis of Means
# ---------------------------------------------------------------------------

@dataclass
class ANOMFactorResult:
    """ANOM result for a single factor."""

    factor_name: str
    level_means: dict[str, float]
    """Mean S/N ratio at each factor level.
    Keys are level labels: '-1', '0', '+1' for coded levels."""

    best_level: str
    """Level with the highest mean S/N ratio."""

    best_level_value: float
    """Mean S/N ratio at the best level."""

    range: float
    """Max mean S/N - min mean S/N across levels."""

    rank: int
    """Rank by range (1 = most influential factor)."""


@dataclass
class ANOMResult:
    """Full ANOM analysis result."""

    factors: list[ANOMFactorResult]
    """ANOM results for each factor, sorted by rank."""

    optimal_settings: dict[str, str]
    """Factor name -> best coded level for the optimal combination."""

    sn_ratios: list[float | None]
    """S/N ratio for each experimental run."""

    warnings: list[str]
    """Warnings from S/N computation."""


def compute_anom(
    design_matrix: np.ndarray,
    response_values: np.ndarray,
    factor_names: list[str],
    sn_type: str,
    collector: ExplanationCollector | None = None,
) -> ANOMResult:
    """Compute Analysis of Means (ANOM) on S/N ratios for a Taguchi design.

    This is a SEPARATE analysis path from compute_anova(). For each factor,
    computes the average S/N ratio at each level and ranks factors by the
    range of their level means.

    Args:
        design_matrix: Coded design matrix, shape (n_runs, n_factors).
            Values in {-1, +1} for 2-level or {-1, 0, +1} for 3-level.
        response_values: Response values, one per run.
        factor_names: Name for each factor column.
        sn_type: Signal-to-noise ratio type.
        collector: Optional SYW explanation collector.

    Returns:
        :class:`ANOMResult` with factor rankings and optimal settings.
    """
    n_runs, n_factors = design_matrix.shape
    response_values = np.asarray(response_values, dtype=float)

    if len(response_values) != n_runs:
        raise ValueError(
            f"Response values length ({len(response_values)}) does not match "
            f"design matrix rows ({n_runs})"
        )

    # Step 1: Compute S/N ratio for each run
    sn_ratios: list[float | None] = []
    warnings: list[str] = []

    for run_idx in range(n_runs):
        y = np.array([response_values[run_idx]])
        result = compute_sn_ratio(y, sn_type)
        sn_ratios.append(result.sn_ratio)
        if result.warning:
            warnings.append(f"Run {run_idx + 1}: {result.warning}")

    # Filter out runs where S/N could not be computed
    valid_mask = [sn is not None for sn in sn_ratios]
    if not any(valid_mask):
        return ANOMResult(
            factors=[],
            optimal_settings={},
            sn_ratios=sn_ratios,
            warnings=warnings + ["No valid S/N ratios computed — cannot perform ANOM"],
        )

    sn_arr = np.array([sn if sn is not None else np.nan for sn in sn_ratios])

    # Step 2: For each factor, compute mean S/N at each level
    factor_results: list[ANOMFactorResult] = []

    # Determine levels present in the design matrix
    all_possible_levels = sorted(set(design_matrix.flatten()))
    level_labels = {-1.0: "-1", 0.0: "0", 1.0: "+1"}

    for col_idx in range(n_factors):
        col = design_matrix[:, col_idx]
        levels_in_col = sorted(set(col))

        level_means: dict[str, float] = {}
        for level in levels_in_col:
            mask = (col == level) & ~np.isnan(sn_arr)
            if np.any(mask):
                level_means[level_labels.get(level, str(level))] = float(
                    np.mean(sn_arr[mask])
                )

        if not level_means:
            continue

        best_level_key = max(level_means, key=lambda k: level_means[k])
        best_val = level_means[best_level_key]
        level_range = max(level_means.values()) - min(level_means.values())

        factor_results.append(
            ANOMFactorResult(
                factor_name=factor_names[col_idx],
                level_means=level_means,
                best_level=best_level_key,
                best_level_value=best_val,
                range=level_range,
                rank=0,  # assigned after sorting
            )
        )

    # Step 3: Rank by range (descending)
    factor_results.sort(key=lambda f: f.range, reverse=True)
    for rank_idx, fr in enumerate(factor_results):
        fr.rank = rank_idx + 1

    # Step 4: Optimal settings
    optimal_settings: dict[str, str] = {}
    for fr in factor_results:
        optimal_settings[fr.factor_name] = fr.best_level

    # SYW steps for ANOM
    if collector and factor_results:
        # Log response table
        top_factor = factor_results[0]
        means_str = ", ".join(
            f"Level {k}: {v:.4f}" for k, v in top_factor.level_means.items()
        )
        collector.step(
            label="ANOM Response Table (Top Factor)",
            formula_latex=(
                r"\text{Mean S/N at level } j = "
                r"\frac{1}{n_j}\sum_{i \in \text{level } j} \eta_i"
            ),
            substitution_latex=(
                rf"\text{{{top_factor.factor_name}}}: {means_str}"
            ),
            result=top_factor.range,
            note=_TAGUCHI_CITATION,
        )

        collector.step(
            label="Factor Ranking (by Range)",
            formula_latex=(
                r"\text{Range} = \max(\bar{\eta}_j) - \min(\bar{\eta}_j)"
            ),
            substitution_latex=(
                ", ".join(
                    f"{fr.factor_name}: {fr.range:.4f}" for fr in factor_results
                )
            ),
            result=factor_results[0].range,
            note=_TAGUCHI_CITATION,
        )

    return ANOMResult(
        factors=factor_results,
        optimal_settings=optimal_settings,
        sn_ratios=sn_ratios,
        warnings=warnings,
    )
