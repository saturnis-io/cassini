"""D-Optimal design generation via the Coordinate-Exchange algorithm.

Implements the Coordinate-Exchange algorithm of Meyer & Nachtsheim (1995)
for generating D-optimal experimental designs.  Unlike Fedorov's
point-exchange, this algorithm operates directly on continuous factor
coordinates without requiring a candidate set.

Reference:
    Meyer, R. D. & Nachtsheim, C. J. (1995). The Coordinate-Exchange
    Algorithm for Constructing Exact Optimal Experimental Designs.
    *Technometrics*, 37(1), 60-69.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np

from cassini.core.doe.designs import DesignResult


# ---------------------------------------------------------------------------
# Model matrix construction
# ---------------------------------------------------------------------------

def _build_model_matrix(
    design: np.ndarray,
    model_order: str = "linear",
) -> np.ndarray:
    """Build the model matrix X from a design matrix and model specification.

    Args:
        design: Design matrix of shape (n_runs, n_factors) with coded values.
        model_order: One of ``'linear'``, ``'interaction'``, or ``'quadratic'``.

    Returns:
        Model matrix X with intercept column, shape (n_runs, p).

    Raises:
        ValueError: If ``model_order`` is not recognized.
    """
    n_runs, n_factors = design.shape

    # Always include intercept
    columns: list[np.ndarray] = [np.ones(n_runs)]

    # Main effects
    for j in range(n_factors):
        columns.append(design[:, j])

    # Two-factor interactions
    if model_order in ("interaction", "quadratic"):
        for j1 in range(n_factors):
            for j2 in range(j1 + 1, n_factors):
                columns.append(design[:, j1] * design[:, j2])

    # Quadratic (pure second-order) terms
    if model_order == "quadratic":
        for j in range(n_factors):
            columns.append(design[:, j] ** 2)

    if model_order not in ("linear", "interaction", "quadratic"):
        raise ValueError(
            f"model_order must be 'linear', 'interaction', or 'quadratic', "
            f"got '{model_order}'"
        )

    return np.column_stack(columns)


def _count_model_params(n_factors: int, model_order: str) -> int:
    """Count the number of model parameters (including intercept).

    Args:
        n_factors: Number of factors.
        model_order: ``'linear'``, ``'interaction'``, or ``'quadratic'``.

    Returns:
        Number of model parameters p.
    """
    p = 1 + n_factors  # intercept + main effects

    if model_order in ("interaction", "quadratic"):
        p += n_factors * (n_factors - 1) // 2  # 2FI terms

    if model_order == "quadratic":
        p += n_factors  # pure quadratic terms

    return p


# ---------------------------------------------------------------------------
# Coordinate-Exchange algorithm
# ---------------------------------------------------------------------------

def _coordinate_exchange_single(
    n_factors: int,
    n_runs: int,
    factor_ranges: Sequence[tuple[float, float]],
    model_order: str,
    rng: np.random.Generator,
    max_iterations: int,
    n_eval_points: int = 11,
) -> tuple[np.ndarray, float]:
    """Run one random start of the coordinate-exchange algorithm.

    For each design point and each coordinate, evaluates the |X'X|
    determinant at equally spaced candidate values across the factor
    range, selecting the value that maximizes the criterion.

    Args:
        n_factors: Number of factors.
        n_runs: Desired number of experimental runs.
        factor_ranges: List of (low, high) tuples for each factor (coded).
        model_order: Model specification.
        rng: NumPy random number generator.
        max_iterations: Maximum sweep iterations.
        n_eval_points: Number of candidate values per coordinate.

    Returns:
        Tuple of (best design matrix, best |X'X| determinant).
    """
    # Initialize random design within factor ranges
    design = np.empty((n_runs, n_factors), dtype=float)
    for j in range(n_factors):
        low, high = factor_ranges[j]
        design[:, j] = rng.uniform(low, high, size=n_runs)

    best_det = -np.inf

    for _iteration in range(max_iterations):
        improved = False

        for i in range(n_runs):
            for j in range(n_factors):
                low, high = factor_ranges[j]
                candidates = np.linspace(low, high, n_eval_points)

                current_val = design[i, j]
                best_val = current_val

                # Evaluate |X'X| for each candidate value
                best_local_det = -np.inf
                for cand in candidates:
                    design[i, j] = cand
                    X = _build_model_matrix(design, model_order)
                    XtX = X.T @ X
                    try:
                        det = np.linalg.det(XtX)
                    except np.linalg.LinAlgError:
                        det = 0.0

                    if det > best_local_det:
                        best_local_det = det
                        best_val = cand

                # Apply the best value for this coordinate
                if best_val != current_val:
                    design[i, j] = best_val
                    improved = True
                else:
                    design[i, j] = current_val

                if best_local_det > best_det:
                    best_det = best_local_det

        # Check convergence
        if not improved:
            break

    # Final determinant
    X = _build_model_matrix(design, model_order)
    final_det = float(np.linalg.det(X.T @ X))

    return design, final_det


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def d_optimal(
    n_factors: int,
    n_runs: int,
    factor_ranges: Sequence[tuple[float, float]] | None = None,
    model_order: str = "linear",
    n_starts: int = 10,
    max_iterations: int = 1000,
    seed: int | None = None,
) -> DesignResult:
    """Generate a D-optimal experimental design via coordinate-exchange.

    Uses the Coordinate-Exchange algorithm (Meyer & Nachtsheim, 1995)
    to find a design that maximizes |X'X|, the determinant of the
    information matrix.  Multiple random restarts are used to avoid
    local optima.

    Args:
        n_factors: Number of experimental factors (1-50).
        n_runs: Desired number of experimental runs.  Must be at least
                equal to the number of model parameters p.
        factor_ranges: Optional list of (low, high) tuples for each
                       factor.  Defaults to (-1, 1) for all factors
                       (coded units).
        model_order: Model specification:
            - ``'linear'``: intercept + main effects (p = k+1)
            - ``'interaction'``: linear + all two-factor interactions
            - ``'quadratic'``: interaction + pure quadratic terms
        n_starts: Number of random restarts (default 10).
        max_iterations: Maximum iterations per start (default 1000).
        seed: Random seed for reproducibility.

    Returns:
        :class:`DesignResult` with the D-optimal design matrix.  The
        ``coded_matrix`` contains actual coordinate values (continuous,
        not restricted to {-1, 0, +1}).

    Raises:
        ValueError: If inputs are invalid (too few runs, bad model_order,
                    mismatched factor_ranges length, etc.).

    Reference:
        Meyer, R. D. & Nachtsheim, C. J. (1995). The Coordinate-Exchange
        Algorithm for Constructing Exact Optimal Experimental Designs.
        *Technometrics*, 37(1), 60-69.
    """
    # --- Input validation ---
    if n_factors < 1:
        raise ValueError(f"n_factors must be >= 1, got {n_factors}")

    if model_order not in ("linear", "interaction", "quadratic"):
        raise ValueError(
            f"model_order must be 'linear', 'interaction', or 'quadratic', "
            f"got '{model_order}'"
        )

    p = _count_model_params(n_factors, model_order)
    if n_runs < p:
        raise ValueError(
            f"n_runs ({n_runs}) must be >= number of model parameters "
            f"({p}) for model_order='{model_order}' with {n_factors} "
            f"factors.  Minimum n_runs = {p}."
        )

    if factor_ranges is None:
        factor_ranges = [(-1.0, 1.0)] * n_factors
    else:
        factor_ranges = list(factor_ranges)

    if len(factor_ranges) != n_factors:
        raise ValueError(
            f"factor_ranges length ({len(factor_ranges)}) must match "
            f"n_factors ({n_factors})"
        )

    for idx, (lo, hi) in enumerate(factor_ranges):
        if lo >= hi:
            raise ValueError(
                f"Factor {idx}: low ({lo}) must be less than high ({hi})"
            )

    if n_starts < 1:
        raise ValueError(f"n_starts must be >= 1, got {n_starts}")

    # --- Run coordinate-exchange with multiple starts ---
    rng = np.random.default_rng(seed)

    best_design: np.ndarray | None = None
    best_det = -np.inf

    for _start in range(n_starts):
        # Each start gets a child RNG for independence
        child_seed = int(rng.integers(0, 2**31))
        child_rng = np.random.default_rng(child_seed)

        design, det = _coordinate_exchange_single(
            n_factors=n_factors,
            n_runs=n_runs,
            factor_ranges=factor_ranges,
            model_order=model_order,
            rng=child_rng,
            max_iterations=max_iterations,
        )

        if det > best_det:
            best_det = det
            best_design = design.copy()

    assert best_design is not None  # guaranteed by n_starts >= 1

    # --- Build result ---
    std_order = list(range(1, n_runs + 1))

    # Randomize run order
    if seed is not None:
        run_rng = np.random.default_rng(seed + 999)
        run_order = (run_rng.permutation(n_runs) + 1).tolist()
    else:
        run_order = list(std_order)

    # D-optimal designs have no center points in the traditional sense
    is_cp = [False] * n_runs

    return DesignResult(
        coded_matrix=best_design,
        standard_order=std_order,
        run_order=run_order,
        is_center_point=is_cp,
        n_runs=n_runs,
        n_factors=n_factors,
        design_type="d_optimal",
    )


def d_efficiency(
    design: np.ndarray,
    model_order: str = "linear",
) -> float:
    """Compute D-efficiency of a design.

    D-efficiency = (|X'X| / n)^(1/p), normalized so that the theoretical
    maximum is 1.0 for orthogonal designs.

    Args:
        design: Design matrix of shape (n_runs, n_factors).
        model_order: Model specification (same as for ``d_optimal``).

    Returns:
        D-efficiency as a float in [0, 1].  Returns 0.0 if |X'X| <= 0.
    """
    X = _build_model_matrix(design, model_order)
    n, p = X.shape

    try:
        det = np.linalg.det(X.T @ X)
    except np.linalg.LinAlgError:
        return 0.0

    if det <= 0:
        return 0.0

    return float((det / n) ** (1.0 / p))
