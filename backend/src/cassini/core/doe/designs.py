"""Design matrix generators for Design of Experiments (DOE).

Supports full factorial, fractional factorial, central composite (CCD),
and Box-Behnken designs.  All generators return a :class:`DesignResult`
dataclass containing the coded design matrix and metadata.

Uses numpy for matrix generation and random run-order shuffling.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations
from typing import Sequence

import numpy as np


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class DesignResult:
    """Output from a design generator."""

    coded_matrix: np.ndarray
    """Coded design matrix, shape (n_runs, n_factors), values in {-1, 0, +1}
    or axial alpha values for CCD."""

    standard_order: list[int]
    """1-based standard order index for each row."""

    run_order: list[int]
    """Randomized (or original) run order for each row."""

    is_center_point: list[bool]
    """Whether each row is a center point."""

    n_runs: int
    """Total number of runs."""

    n_factors: int
    """Number of factors in the design."""

    design_type: str
    """Design type label (e.g. 'full_factorial', 'ccd')."""


# ---------------------------------------------------------------------------
# Lookup tables for fractional factorial generators
# ---------------------------------------------------------------------------

# Maps (n_factors, resolution) -> list of generator column definitions.
# Each generator column is defined as a tuple of base column indices whose
# element-wise product produces the new column.  Column indices are 0-based.
#
# For example, (3, III) means 2^(3-1) = 4 runs: columns A, B are independent,
# C = A*B (generator tuple (0, 1)).
_FRAC_GENERATORS: dict[tuple[int, int], list[tuple[int, ...]]] = {
    # 2^(3-1) Resolution III: C = AB
    (3, 3): [(0, 1)],
    # 2^(4-1) Resolution IV: D = ABC
    (4, 4): [(0, 1, 2)],
    # 2^(5-1) Resolution V: E = ABCD
    (5, 5): [(0, 1, 2, 3)],
    # 2^(5-2) Resolution III: D = AB, E = AC
    (5, 3): [(0, 1), (0, 2)],
    # 2^(6-2) Resolution IV: E = ABC, F = BCD
    (6, 4): [(0, 1, 2), (1, 2, 3)],
    # 2^(7-3) Resolution IV: E = ABC, F = BCD, G = ACD
    (7, 4): [(0, 1, 2), (1, 2, 3), (0, 2, 3)],
}


# ---------------------------------------------------------------------------
# Box-Behnken pair tables (3-7 factors)
# ---------------------------------------------------------------------------

def _box_behnken_pairs(k: int) -> list[tuple[int, int]]:
    """Return the set of factor-index pairs for a Box-Behnken design.

    For k factors we need a balanced incomplete block design where each
    factor appears in the same number of blocks.  Standard references
    give specific pair sets.
    """
    if k < 3 or k > 7:
        raise ValueError(f"Box-Behnken requires 3-7 factors, got {k}")

    if k == 3:
        # All pairs of 3 factors
        return list(combinations(range(k), 2))
    if k == 4:
        # Each factor appears in 3 pairs (BIBD)
        return [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]
    if k == 5:
        # Each factor appears in 4 pairs
        return [
            (0, 1), (0, 2), (1, 3), (2, 4), (3, 4),
            (0, 3), (1, 4), (2, 3), (0, 4), (1, 2),
        ]
    if k == 6:
        # Each factor appears in 5 pairs
        return list(combinations(range(k), 2))
    # k == 7: all pairs
    return list(combinations(range(k), 2))


# ---------------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------------

def full_factorial(
    n_factors: int,
    center_points: int = 0,
    replicates: int = 1,
    seed: int | None = None,
) -> DesignResult:
    """Generate a 2^k full factorial design.

    Args:
        n_factors: Number of factors (2-7 recommended).
        center_points: Number of center-point runs to append.
        replicates: Number of complete replicates of the factorial portion.
        seed: Random seed for run-order shuffling.  ``None`` keeps standard
              order.

    Returns:
        :class:`DesignResult` with coded values in {-1, 0, +1}.
    """
    if n_factors < 1:
        raise ValueError(f"n_factors must be >= 1, got {n_factors}")

    n_base = 2 ** n_factors
    # Build base factorial matrix: each row is a combination of -1/+1
    base = np.zeros((n_base, n_factors), dtype=float)
    for col in range(n_factors):
        # Pattern repeats: each column alternates in blocks of 2^col
        repeat_block = 2 ** col
        pattern = np.array([-1.0] * repeat_block + [1.0] * repeat_block)
        full_pattern = np.tile(pattern, n_base // (2 * repeat_block))
        base[:, col] = full_pattern

    # Replicates
    if replicates > 1:
        parts = [base.copy() for _ in range(replicates)]
        factorial = np.vstack(parts)
    else:
        factorial = base

    # Center points
    if center_points > 0:
        centers = np.zeros((center_points, n_factors), dtype=float)
        coded = np.vstack([factorial, centers])
        is_cp = [False] * len(factorial) + [True] * center_points
    else:
        coded = factorial
        is_cp = [False] * len(factorial)

    n_runs = len(coded)
    std_order = list(range(1, n_runs + 1))

    # Run order (randomize if seed given)
    if seed is not None:
        rng = np.random.default_rng(seed)
        run_order_arr = rng.permutation(n_runs) + 1
        run_order = run_order_arr.tolist()
    else:
        run_order = list(std_order)

    return DesignResult(
        coded_matrix=coded,
        standard_order=std_order,
        run_order=run_order,
        is_center_point=is_cp,
        n_runs=n_runs,
        n_factors=n_factors,
        design_type="full_factorial",
    )


def fractional_factorial(
    n_factors: int,
    resolution: int = 4,
    center_points: int = 0,
    seed: int | None = None,
) -> DesignResult:
    """Generate a 2^(k-p) fractional factorial design.

    Uses a lookup table of common generator columns for standard designs.

    Args:
        n_factors: Number of factors (3-7).
        resolution: Desired resolution (III=3, IV=4, V=5).
        center_points: Number of center-point runs to append.
        seed: Random seed for run-order shuffling.

    Returns:
        :class:`DesignResult` with coded values in {-1, 0, +1}.

    Raises:
        ValueError: If the requested (n_factors, resolution) combination
                    is not in the lookup table.
    """
    key = (n_factors, resolution)
    if key not in _FRAC_GENERATORS:
        available = [
            f"({k}, res={r})" for (k, r) in sorted(_FRAC_GENERATORS.keys())
        ]
        raise ValueError(
            f"No fractional factorial design for {n_factors} factors at "
            f"resolution {resolution}. Available: {', '.join(available)}"
        )

    generators = _FRAC_GENERATORS[key]
    n_independent = n_factors - len(generators)

    # Build full factorial of independent columns
    n_base = 2 ** n_independent
    base = np.zeros((n_base, n_independent), dtype=float)
    for col in range(n_independent):
        repeat_block = 2 ** col
        pattern = np.array([-1.0] * repeat_block + [1.0] * repeat_block)
        full_pattern = np.tile(pattern, n_base // (2 * repeat_block))
        base[:, col] = full_pattern

    # Generate additional columns from products of independent columns
    gen_cols = []
    for gen in generators:
        col = np.ones(n_base, dtype=float)
        for idx in gen:
            col *= base[:, idx]
        gen_cols.append(col)

    factorial = np.column_stack([base] + [c.reshape(-1, 1) for c in gen_cols])

    # Center points
    if center_points > 0:
        centers = np.zeros((center_points, n_factors), dtype=float)
        coded = np.vstack([factorial, centers])
        is_cp = [False] * len(factorial) + [True] * center_points
    else:
        coded = factorial
        is_cp = [False] * len(factorial)

    n_runs = len(coded)
    std_order = list(range(1, n_runs + 1))

    if seed is not None:
        rng = np.random.default_rng(seed)
        run_order_arr = rng.permutation(n_runs) + 1
        run_order = run_order_arr.tolist()
    else:
        run_order = list(std_order)

    return DesignResult(
        coded_matrix=coded,
        standard_order=std_order,
        run_order=run_order,
        is_center_point=is_cp,
        n_runs=n_runs,
        n_factors=n_factors,
        design_type="fractional_factorial",
    )


def central_composite(
    n_factors: int,
    alpha_type: str = "rotatable",
    center_points: int = 5,
    seed: int | None = None,
) -> DesignResult:
    """Generate a Central Composite Design (CCD).

    CCD = 2^k factorial + 2k axial (star) points + center points.

    Args:
        n_factors: Number of factors (2-7).
        alpha_type: ``'rotatable'`` (alpha = 2^(k/4)) or
                    ``'face_centered'`` (alpha = 1).
        center_points: Number of center-point runs.
        seed: Random seed for run-order shuffling.

    Returns:
        :class:`DesignResult` with coded values including axial alpha.
    """
    if n_factors < 2:
        raise ValueError(f"CCD requires at least 2 factors, got {n_factors}")

    # Alpha distance
    if alpha_type == "face_centered":
        alpha = 1.0
    elif alpha_type == "rotatable":
        alpha = 2.0 ** (n_factors / 4.0)
    else:
        raise ValueError(f"alpha_type must be 'rotatable' or 'face_centered', got '{alpha_type}'")

    # 1. Factorial portion (2^k)
    n_fact = 2 ** n_factors
    factorial = np.zeros((n_fact, n_factors), dtype=float)
    for col in range(n_factors):
        repeat_block = 2 ** col
        pattern = np.array([-1.0] * repeat_block + [1.0] * repeat_block)
        factorial[:, col] = np.tile(pattern, n_fact // (2 * repeat_block))

    # 2. Axial (star) points: +/-alpha along each axis
    n_axial = 2 * n_factors
    axial = np.zeros((n_axial, n_factors), dtype=float)
    for i in range(n_factors):
        axial[2 * i, i] = -alpha
        axial[2 * i + 1, i] = alpha

    # 3. Center points
    centers = np.zeros((center_points, n_factors), dtype=float)

    coded = np.vstack([factorial, axial, centers])
    is_cp = (
        [False] * n_fact
        + [False] * n_axial
        + [True] * center_points
    )

    n_runs = len(coded)
    std_order = list(range(1, n_runs + 1))

    if seed is not None:
        rng = np.random.default_rng(seed)
        run_order_arr = rng.permutation(n_runs) + 1
        run_order = run_order_arr.tolist()
    else:
        run_order = list(std_order)

    return DesignResult(
        coded_matrix=coded,
        standard_order=std_order,
        run_order=run_order,
        is_center_point=is_cp,
        n_runs=n_runs,
        n_factors=n_factors,
        design_type="central_composite",
    )


def box_behnken(
    n_factors: int,
    center_points: int = 3,
    seed: int | None = None,
) -> DesignResult:
    """Generate a Box-Behnken design.

    Each pair of factors takes all four combinations of -1/+1 while the
    remaining factors are held at 0 (center).  Suitable for 3-7 factors.

    Args:
        n_factors: Number of factors (3-7).
        center_points: Number of center-point runs.
        seed: Random seed for run-order shuffling.

    Returns:
        :class:`DesignResult` with coded values in {-1, 0, +1}.
    """
    pairs = _box_behnken_pairs(n_factors)

    rows: list[np.ndarray] = []
    for i, j in pairs:
        for vi in [-1.0, 1.0]:
            for vj in [-1.0, 1.0]:
                row = np.zeros(n_factors, dtype=float)
                row[i] = vi
                row[j] = vj
                rows.append(row)

    factorial = np.array(rows)
    is_cp_fact = [False] * len(factorial)

    # Center points
    if center_points > 0:
        centers = np.zeros((center_points, n_factors), dtype=float)
        coded = np.vstack([factorial, centers])
        is_cp = is_cp_fact + [True] * center_points
    else:
        coded = factorial
        is_cp = is_cp_fact

    n_runs = len(coded)
    std_order = list(range(1, n_runs + 1))

    if seed is not None:
        rng = np.random.default_rng(seed)
        run_order_arr = rng.permutation(n_runs) + 1
        run_order = run_order_arr.tolist()
    else:
        run_order = list(std_order)

    return DesignResult(
        coded_matrix=coded,
        standard_order=std_order,
        run_order=run_order,
        is_center_point=is_cp,
        n_runs=n_runs,
        n_factors=n_factors,
        design_type="box_behnken",
    )


# ---------------------------------------------------------------------------
# Coded <-> Actual conversion
# ---------------------------------------------------------------------------

def coded_to_actual(
    coded: np.ndarray,
    factors: Sequence[dict],
) -> np.ndarray:
    """Convert coded design matrix to actual (natural) factor values.

    For each factor, ``actual = center + coded * half_range`` where
    ``center = (high + low) / 2`` and ``half_range = (high - low) / 2``.

    If a factor dict has a ``center_point`` key, that overrides the
    calculated center.

    Args:
        coded: Coded design matrix, shape (n_runs, n_factors).
        factors: Sequence of factor dicts with keys ``low_level``,
                 ``high_level``, and optionally ``center_point``.

    Returns:
        Actual-value matrix with the same shape as ``coded``.
    """
    actual = np.empty_like(coded, dtype=float)
    for col, fdef in enumerate(factors):
        low = float(fdef["low_level"])
        high = float(fdef["high_level"])
        center = float(fdef.get("center_point") or (low + high) / 2.0)
        half_range = (high - low) / 2.0
        actual[:, col] = center + coded[:, col] * half_range
    return actual
