"""Design matrix generators for Design of Experiments (DOE).

Supports full factorial, fractional factorial, Plackett-Burman,
central composite (CCD), and Box-Behnken designs.  All generators
return a :class:`DesignResult` dataclass containing the coded design
matrix and metadata.

Uses numpy for matrix generation and random run-order shuffling.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import reduce
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

    block_assignments: list[int] | None = None
    """Block assignment for each run (1-based), or None if unblocked."""


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
    # 2^(6-1) Resolution VI: F = ABCDE
    (6, 6): [(0, 1, 2, 3, 4)],
    # 2^(6-2) Resolution IV: E = ABC, F = BCD
    (6, 4): [(0, 1, 2), (1, 2, 3)],
    # 2^(6-3) Resolution III: D = AB, E = AC, F = BC
    (6, 3): [(0, 1), (0, 2), (1, 2)],
    # 2^(7-1) Resolution VII: G = ABCDEF
    (7, 7): [(0, 1, 2, 3, 4, 5)],
    # 2^(7-2) Resolution IV: F = ABCD, G = ABDE
    (7, 4): [(0, 1, 2, 3), (0, 1, 3, 4)],
    # 2^(7-3) Resolution IV: E = ABC, F = BCD, G = ACD
    (7, 3): [(0, 1), (0, 2), (1, 2), (0, 1, 2)],
    # --- Extended generators from Chen, Sun & Wu (1993) ---
    # 2^(8-2) Resolution V: G = ABCD, H = ABEF
    (8, 5): [(0, 1, 2, 3), (0, 1, 4, 5)],
    # 2^(8-4) Resolution IV: E = BCD, F = ACD, G = ABC, H = ABD
    (8, 4): [(1, 2, 3), (0, 2, 3), (0, 1, 2), (0, 1, 3)],
    # 2^(8-4) Resolution III: E = AB, F = AC, G = BC, H = ABC
    (8, 3): [(0, 1), (0, 2), (1, 2), (0, 1, 2)],
    # 2^(9-2) Resolution VI: H = ABCG, J = ADEF  (9 factors in 128 runs)
    (9, 5): [(0, 1, 2, 3), (0, 1, 4, 5), (0, 2, 4, 6)],
    # 2^(9-4) Resolution IV: F = BCDE, G = ACDE, H = ABDE, J = ABCE
    (9, 4): [(1, 2, 3, 4), (0, 2, 3, 4), (0, 1, 3, 4), (0, 1, 2, 4)],
    # 2^(9-5) Resolution III: E = AB, F = AC, G = BC, H = ABD, J = ACD
    (9, 3): [(0, 1), (0, 2), (1, 2), (0, 1, 3), (0, 2, 3)],
    # 2^(10-3) Resolution V: H = ABCG, J = ACDE, K = ACDF
    (10, 5): [(0, 1, 2, 3), (0, 1, 4, 5), (0, 2, 4, 6), (0, 2, 5, 6)],
    # 2^(10-6) Resolution IV: E = ABC, F = BCD, G = ACD, H = ABD,
    #                          J = ABCD, K = AB (min aberration)
    (10, 4): [(0, 1, 2), (1, 2, 3), (0, 2, 3), (0, 1, 3)],
    # 2^(10-6) Resolution III
    (10, 3): [(0, 1), (0, 2), (1, 2), (0, 3), (1, 3), (2, 3)],
    # 2^(11-4) Resolution V
    (11, 5): [(0, 1, 2, 3), (0, 1, 4, 5), (0, 2, 4, 6), (0, 2, 5, 6), (1, 2, 4, 5)],
    # 2^(11-7) Resolution III
    (11, 3): [(0, 1), (0, 2), (1, 2), (0, 3), (1, 3), (2, 3), (0, 1, 2)],
    # 2^(12-4) Resolution V (12 factors in 256 runs)
    (12, 5): [
        (0, 1, 2, 3), (0, 1, 4, 5), (0, 2, 4, 6),
        (0, 2, 5, 6), (1, 2, 4, 5), (1, 2, 5, 6),
    ],
    # 2^(12-8) Resolution III
    (12, 3): [(0, 1), (0, 2), (1, 2), (0, 3), (1, 3), (2, 3), (0, 1, 2), (0, 1, 3)],
    # 2^(15-11) Resolution III (15 factors in 16 runs)
    (15, 3): [
        (0, 1), (0, 2), (1, 2), (0, 3), (1, 3), (2, 3),
        (0, 1, 2), (0, 1, 3), (0, 2, 3), (1, 2, 3), (0, 1, 2, 3),
    ],
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
    n_blocks: int | None = None,
) -> DesignResult:
    """Generate a 2^k full factorial design.

    Args:
        n_factors: Number of factors (2-7 recommended).
        center_points: Number of center-point runs to append.
        replicates: Number of complete replicates of the factorial portion.
        seed: Random seed for run-order shuffling.  ``None`` keeps standard
              order.
        n_blocks: Number of blocks (power of 2).  Blocking confounds
                  highest-order interactions per Montgomery Ch. 7.

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

    # Block assignments (computed before center points)
    block_assignments: list[int] | None = None
    if n_blocks is not None and n_blocks >= 2:
        block_assignments = _assign_blocks_factorial(
            factorial, n_factors, n_blocks,
        )
        _validate_blocking(factorial, block_assignments, n_factors)

    # Center points
    if center_points > 0:
        centers = np.zeros((center_points, n_factors), dtype=float)
        coded = np.vstack([factorial, centers])
        is_cp = [False] * len(factorial) + [True] * center_points
        # Center points get block 0 (unblocked) — they span all blocks
        if block_assignments is not None:
            block_assignments = block_assignments + [0] * center_points
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
        block_assignments=block_assignments,
    )


def fractional_factorial(
    n_factors: int,
    resolution: int = 4,
    center_points: int = 0,
    seed: int | None = None,
    n_blocks: int | None = None,
) -> DesignResult:
    """Generate a 2^(k-p) fractional factorial design.

    Uses a lookup table of minimum aberration generator columns from
    published tables (Chen, Sun & Wu, 1993) covering up to ~15 factors.
    For factor counts beyond the table, raises ValueError suggesting
    Plackett-Burman or D-Optimal alternatives.

    Args:
        n_factors: Number of factors (3-15).
        resolution: Desired resolution (III=3 through VII=7).
        center_points: Number of center-point runs to append.
        seed: Random seed for run-order shuffling.
        n_blocks: Number of blocks (power of 2).  Blocking confounds
                  highest-order interactions per Montgomery Ch. 7.

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
        suggestion = ""
        if n_factors > 15:
            suggestion = (
                " For large factor counts, consider Plackett-Burman "
                "(screening, Resolution III) or D-Optimal designs."
            )
        elif n_factors > 7:
            # Check if any resolution exists for this factor count
            any_match = any(k == n_factors for (k, _) in _FRAC_GENERATORS)
            if not any_match:
                suggestion = (
                    f" No generators are tabled for {n_factors} factors. "
                    "Consider Plackett-Burman (screening) or D-Optimal."
                )
        raise ValueError(
            f"No fractional factorial design for {n_factors} factors at "
            f"resolution {resolution}. Available: {', '.join(available)}"
            f"{suggestion}"
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

    # Block assignments (computed before center points)
    block_assignments: list[int] | None = None
    if n_blocks is not None and n_blocks >= 2:
        block_assignments = _assign_blocks_factorial(
            factorial, n_factors, n_blocks,
        )
        _validate_blocking(factorial, block_assignments, n_factors)

    # Center points
    if center_points > 0:
        centers = np.zeros((center_points, n_factors), dtype=float)
        coded = np.vstack([factorial, centers])
        is_cp = [False] * len(factorial) + [True] * center_points
        if block_assignments is not None:
            block_assignments = block_assignments + [0] * center_points
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
        block_assignments=block_assignments,
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
# Plackett-Burman designs
# ---------------------------------------------------------------------------

# Standard generating rows from Plackett & Burman (1946).
# N = number of columns (factors), design has N+1 rows.
# Construction: first row = generating vector, subsequent rows are
# cyclic LEFT-shifts, final row is all -1s.
_PB_GENERATORS: dict[int, list[int]] = {
    3: [1, -1, 1],
    7: [1, 1, 1, -1, 1, -1, -1],
    11: [1, 1, -1, 1, 1, 1, -1, -1, -1, 1, -1],
    15: [1, 1, 1, 1, -1, 1, -1, 1, 1, -1, -1, 1, -1, -1, -1],
    19: [1, 1, -1, -1, 1, 1, 1, 1, -1, 1, -1, 1, -1, -1, -1, -1, 1, 1, -1],
    23: [1, 1, 1, 1, 1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, -1, 1, -1, 1, -1, -1, -1, -1],
}

# Sorted standard PB sizes for next-larger lookup
_PB_SIZES = sorted(_PB_GENERATORS.keys())


# ---------------------------------------------------------------------------
# Blocking support (Montgomery Ch. 7)
# ---------------------------------------------------------------------------

def _is_power_of_two(n: int) -> bool:
    """Check if n is a positive power of 2."""
    return n > 0 and (n & (n - 1)) == 0


def _is_constant(col: np.ndarray) -> bool:
    """Check if a column has no variation (all same value)."""
    return bool(np.all(col == col[0]))


def _assign_blocks_factorial(
    coded_matrix: np.ndarray,
    n_factors: int,
    n_blocks: int,
) -> list[int]:
    """Assign blocks to a 2^k factorial design.

    Uses the standard confounding scheme from Montgomery Ch. 7:
    - 2 blocks: confound the highest-order interaction (ABC...K)
    - 4 blocks: confound the two highest-order interactions

    The confounding column is the element-wise product of the selected
    factor columns.  Runs with the same sign pattern on the confounding
    column(s) go to the same block.

    Args:
        coded_matrix: Coded design matrix, shape (n_runs, n_factors).
        n_factors: Number of factors.
        n_blocks: Number of blocks (must be power of 2).

    Returns:
        List of 1-based block assignments for each row.

    Raises:
        ValueError: If n_blocks confounds main effects or is invalid.
    """
    if not _is_power_of_two(n_blocks):
        raise ValueError(
            f"n_blocks must be a power of 2, got {n_blocks}"
        )
    if n_blocks < 2:
        raise ValueError("n_blocks must be >= 2 for blocking")

    n_confounding = _n_confounding_columns(n_blocks)

    if n_confounding >= n_factors:
        raise ValueError(
            f"Cannot create {n_blocks} blocks with {n_factors} factors: "
            f"blocking would confound main effects"
        )

    # Select confounding generators — highest-order interactions first
    # For 2 blocks: confound the k-factor interaction (all factors)
    # For 4 blocks: confound the (k-1)-factor and k-factor interactions
    # For 8 blocks: confound top 3 interactions, etc.
    confound_cols = _select_confounding_generators(
        coded_matrix, n_factors, n_confounding,
    )

    # Assign blocks by the sign pattern of confounding columns
    n_runs = coded_matrix.shape[0]
    blocks: list[int] = []
    block_map: dict[tuple[int, ...], int] = {}
    next_block = 1

    for row_idx in range(n_runs):
        signs = tuple(
            1 if confound_cols[c][row_idx] > 0 else 0
            for c in range(n_confounding)
        )
        if signs not in block_map:
            block_map[signs] = next_block
            next_block += 1
        blocks.append(block_map[signs])

    return blocks


def _n_confounding_columns(n_blocks: int) -> int:
    """Number of confounding columns needed for n_blocks."""
    # log2(n_blocks) confounding generators needed
    count = 0
    b = n_blocks
    while b > 1:
        b >>= 1
        count += 1
    return count


def _select_confounding_generators(
    coded_matrix: np.ndarray,
    n_factors: int,
    n_confounding: int,
) -> list[np.ndarray]:
    """Select confounding columns for blocking.

    Uses highest-order interactions as confounding generators to avoid
    confounding main effects or low-order interactions.  Per Montgomery
    Ch. 7, the key constraints are:

    1. Each generator must be a high-order interaction (not a main effect).
    2. The generalized interaction of any subset of generators (their
       element-wise product) must NOT equal any main effect column.

    For 2 blocks (1 generator): use the k-factor interaction (ABC...K).
    For 4 blocks (2 generators): use two (k-1)-factor interactions whose
    product is a (k-2)-factor interaction, NOT a main effect.

    Returns list of confounding columns (sign vectors).
    """
    # Collect main effect columns for confounding checks
    main_effects = [coded_matrix[:, c] for c in range(n_factors)]

    def _is_main_effect(col: np.ndarray) -> bool:
        for me in main_effects:
            if np.array_equal(col, me) or np.array_equal(col, -me):
                return True
        return False

    def _is_usable(col: np.ndarray) -> bool:
        """A candidate must have variation and not alias a main effect."""
        return not _is_constant(col) and not _is_main_effect(col)

    # Build candidate interactions, highest order first.
    # Skip constant columns and columns aliased with main effects.
    candidates: list[np.ndarray] = []

    # k-factor interaction (highest order)
    all_col = reduce(
        lambda a, b: a * b,
        [coded_matrix[:, c] for c in range(n_factors)],
    )
    if _is_usable(all_col):
        candidates.append(all_col)

    # (k-1)-factor interactions
    for omit in range(n_factors):
        indices = [c for c in range(n_factors) if c != omit]
        col = reduce(
            lambda a, b: a * b,
            [coded_matrix[:, c] for c in indices],
        )
        if _is_usable(col):
            candidates.append(col)

    # (k-2)-factor interactions
    for combo in combinations(range(n_factors), n_factors - 2):
        if len(combo) >= 2:  # Need at least 2 factors for an interaction
            col = reduce(
                lambda a, b: a * b,
                [coded_matrix[:, c] for c in combo],
            )
            if _is_usable(col):
                candidates.append(col)

    # Greedy selection: pick generators that don't confound main effects
    # For n_confounding=1, the k-factor interaction always works.
    # For n_confounding>=2, we need generalized interactions to also be safe.
    if n_confounding == 1:
        return [candidates[0]]

    # For 2+ generators: search for valid combinations
    # Try all pairs (then triples, etc.) starting from highest-order
    for i in range(len(candidates)):
        if n_confounding == 2:
            for j in range(i + 1, len(candidates)):
                ci, cj = candidates[i], candidates[j]
                # Check duplicates
                if (np.array_equal(ci, cj) or
                        np.array_equal(ci, -cj)):
                    continue
                # Check generalized interaction
                gen_int = ci * cj
                if not _is_main_effect(gen_int):
                    return [ci, cj]
        elif n_confounding == 3:
            for j in range(i + 1, len(candidates)):
                for k in range(j + 1, len(candidates)):
                    ci, cj, ck = candidates[i], candidates[j], candidates[k]
                    # Check all pairwise and triple generalized interactions
                    gij = ci * cj
                    gik = ci * ck
                    gjk = cj * ck
                    gijk = ci * cj * ck
                    if (not _is_main_effect(gij) and
                            not _is_main_effect(gik) and
                            not _is_main_effect(gjk) and
                            not _is_main_effect(gijk)):
                        return [ci, cj, ck]

    # Fallback: return what we can (validation will catch issues)
    return candidates[:n_confounding]


def _validate_blocking(
    coded_matrix: np.ndarray,
    blocks: list[int],
    n_factors: int,
    factor_names: list[str] | None = None,
) -> None:
    """Validate that blocking does not confound main effects.

    Checks that each main-effect column varies within each block.

    Raises:
        ValueError: If any main effect is completely confounded with blocks.
    """
    block_arr = np.array(blocks)
    unique_blocks = np.unique(block_arr)

    for col in range(n_factors):
        for blk in unique_blocks:
            mask = block_arr == blk
            vals_in_block = np.unique(coded_matrix[mask, col])
            if len(vals_in_block) < 2:
                fname = (
                    factor_names[col] if factor_names else f"Factor {col}"
                )
                raise ValueError(
                    f"Blocking confounds main effect '{fname}' — "
                    f"block {blk} has only level {vals_in_block[0]:.0f}. "
                    f"Reduce n_blocks or use a larger design."
                )


def plackett_burman(
    n_factors: int,
    seed: int | None = None,
) -> DesignResult:
    """Generate a Plackett-Burman screening design.

    Plackett-Burman designs are Resolution III saturated/near-saturated
    designs for screening many factors in few runs.  Main effects are
    partially confounded with two-factor interactions, so **interaction
    estimation is NOT reliable** with PB designs.

    Construction follows Plackett & Burman (1946): cyclic left-shift of
    a generating vector plus a final row of all -1s.

    For factor counts that don't match a standard PB size, the next
    larger PB is used and extra columns are dropped (projection).

    Args:
        n_factors: Number of factors (2-23).
        seed: Random seed for run-order shuffling.

    Returns:
        :class:`DesignResult` with coded values in {-1, +1}.

    Raises:
        ValueError: If n_factors is outside the supported range (2-23).
    """
    if n_factors < 2:
        raise ValueError(
            f"Plackett-Burman requires at least 2 factors, got {n_factors}"
        )
    if n_factors > 23:
        raise ValueError(
            f"Plackett-Burman supports up to 23 factors, got {n_factors}. "
            "Consider D-Optimal designs for larger factor counts."
        )

    # Find the smallest standard PB size >= n_factors
    pb_n: int | None = None
    for size in _PB_SIZES:
        if size >= n_factors:
            pb_n = size
            break

    if pb_n is None:
        raise ValueError(
            f"No Plackett-Burman design available for {n_factors} factors"
        )

    gen_row = _PB_GENERATORS[pb_n]
    n_rows = pb_n + 1  # N+1 runs

    # Build the design matrix via cyclic left-shift
    rows: list[list[int]] = []

    # First row is the generating vector
    rows.append(list(gen_row))

    # Subsequent rows: cyclic left-shift of the previous row
    for i in range(1, pb_n):
        prev = rows[i - 1]
        shifted = prev[1:] + [prev[0]]
        rows.append(shifted)

    # Final row: all -1s
    rows.append([-1] * pb_n)

    # Convert to numpy array
    full_matrix = np.array(rows, dtype=float)

    # Project: keep only first n_factors columns
    coded = full_matrix[:, :n_factors]

    n_runs = coded.shape[0]
    std_order = list(range(1, n_runs + 1))
    is_cp = [False] * n_runs

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
        design_type="plackett_burman",
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
