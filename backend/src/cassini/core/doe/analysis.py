"""ANOVA, effects, and regression analysis for DOE studies.

Provides main-effect estimation, two-factor interaction analysis,
full ANOVA table computation, and OLS polynomial regression for
response surface methodology (RSM).

Uses numpy for matrix algebra and scipy.stats for F-test p-values.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations
from typing import Sequence

import numpy as np
from scipy import stats as sp_stats


# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------

@dataclass
class EffectResult:
    """Estimated main effect for a single factor."""

    factor_name: str
    effect: float
    """Contrast: mean(+1) - mean(-1)."""

    coefficient: float
    """Half-effect (regression coefficient)."""

    sum_of_squares: float
    t_statistic: float
    p_value: float
    significant: bool
    """True if p_value < 0.05."""


@dataclass
class InteractionResult:
    """Estimated two-factor interaction effect."""

    factors: tuple[str, str]
    effect: float
    coefficient: float
    sum_of_squares: float
    t_statistic: float
    p_value: float
    significant: bool


@dataclass
class ANOVARow:
    """Single row of an ANOVA table."""

    source: str
    df: int
    sum_of_squares: float
    mean_square: float
    f_value: float | None
    p_value: float | None


@dataclass
class ANOVAResult:
    """Full ANOVA table with model fit statistics."""

    rows: list[ANOVARow]
    r_squared: float
    adj_r_squared: float


@dataclass
class RegressionResult:
    """OLS polynomial regression fit."""

    coefficients: dict[str, float]
    """Mapping of term name (e.g. 'A', 'B', 'A*B', 'A^2') to coefficient."""

    intercept: float
    r_squared: float
    adj_r_squared: float
    optimal_settings: dict[str, float] | None
    """Factor settings that optimize the response (gradient = 0), or None
    if the system is not solvable."""

    residuals: np.ndarray
    predicted: np.ndarray


# ---------------------------------------------------------------------------
# Main effects
# ---------------------------------------------------------------------------

def compute_main_effects(
    design: np.ndarray,
    response: np.ndarray,
    factor_names: list[str],
    alpha: float = 0.05,
) -> list[EffectResult]:
    """Compute main effects for each factor.

    The effect is the difference in mean response between the +1 and -1
    levels.  A t-test is used against the residual MSE for significance.

    Args:
        design: Coded design matrix, shape (n, k).
        response: Response vector, length n.
        factor_names: Names for each factor column.
        alpha: Significance threshold.

    Returns:
        List of :class:`EffectResult`, one per factor.
    """
    n, k = design.shape
    response = np.asarray(response, dtype=float)
    results: list[EffectResult] = []

    # Compute residual MSE from the full model (main effects only)
    ss_total = float(np.sum((response - np.mean(response)) ** 2))
    ss_model = 0.0
    effects_raw: list[tuple[float, float]] = []

    for col in range(k):
        plus_mask = design[:, col] > 0
        minus_mask = design[:, col] < 0
        if not np.any(plus_mask) or not np.any(minus_mask):
            effects_raw.append((0.0, 0.0))
            continue
        mean_plus = float(np.mean(response[plus_mask]))
        mean_minus = float(np.mean(response[minus_mask]))
        effect = mean_plus - mean_minus
        n_plus = int(np.sum(plus_mask))
        n_minus = int(np.sum(minus_mask))
        ss_factor = (n_plus * n_minus) / (n_plus + n_minus) * effect ** 2
        ss_model += ss_factor
        effects_raw.append((effect, ss_factor))

    df_model = k
    df_resid = n - k - 1
    ss_resid = max(ss_total - ss_model, 1e-30)
    mse = ss_resid / max(df_resid, 1)

    for col in range(k):
        effect, ss_factor = effects_raw[col]
        coeff = effect / 2.0

        # Standard error of effect estimate
        plus_mask = design[:, col] > 0
        minus_mask = design[:, col] < 0
        n_plus = int(np.sum(plus_mask))
        n_minus = int(np.sum(minus_mask))
        if n_plus == 0 or n_minus == 0:
            results.append(EffectResult(
                factor_name=factor_names[col],
                effect=0.0, coefficient=0.0,
                sum_of_squares=0.0, t_statistic=0.0,
                p_value=1.0, significant=False,
            ))
            continue

        se_effect = np.sqrt(mse * (1.0 / n_plus + 1.0 / n_minus))
        if se_effect < 1e-30:
            t_stat = float("inf") if abs(effect) > 0 else 0.0
            p_val = 0.0 if abs(effect) > 0 else 1.0
        else:
            t_stat = effect / se_effect
            if df_resid > 0:
                p_val = float(2 * sp_stats.t.sf(abs(t_stat), df_resid))
            else:
                # With no residual df, we cannot compute a valid p-value;
                # use a permutation-like heuristic based on effect magnitude
                p_val = 0.0 if abs(t_stat) > 2 else 1.0

        results.append(EffectResult(
            factor_name=factor_names[col],
            effect=float(effect),
            coefficient=float(coeff),
            sum_of_squares=float(ss_factor),
            t_statistic=float(t_stat),
            p_value=float(p_val),
            significant=p_val < alpha,
        ))

    return results


# ---------------------------------------------------------------------------
# Two-factor interactions
# ---------------------------------------------------------------------------

def compute_interactions(
    design: np.ndarray,
    response: np.ndarray,
    factor_names: list[str],
    max_order: int = 2,
    alpha: float = 0.05,
) -> list[InteractionResult]:
    """Compute two-factor interaction effects.

    For each pair of factors (i, j), the interaction column is the
    element-wise product ``design[:, i] * design[:, j]``.  The effect
    is computed as mean(+1) - mean(-1) on the interaction column.

    Args:
        design: Coded design matrix, shape (n, k).
        response: Response vector, length n.
        factor_names: Names for each factor column.
        max_order: Maximum interaction order (only 2 is supported).
        alpha: Significance threshold.

    Returns:
        List of :class:`InteractionResult` for each pair.
    """
    n, k = design.shape
    response = np.asarray(response, dtype=float)
    results: list[InteractionResult] = []

    # Pre-compute residual MSE including main effects + interactions
    all_interaction_cols: list[np.ndarray] = []
    pairs = list(combinations(range(k), 2))
    for i, j in pairs:
        all_interaction_cols.append(design[:, i] * design[:, j])

    # Build full model matrix for MSE
    X_full = np.column_stack(
        [np.ones(n), design]
        + ([np.column_stack(all_interaction_cols)] if all_interaction_cols else [])
    )
    p_full = X_full.shape[1]
    df_resid = n - p_full
    # OLS residuals
    try:
        beta_hat = np.linalg.lstsq(X_full, response, rcond=None)[0]
        residuals = response - X_full @ beta_hat
        ss_resid = float(np.sum(residuals ** 2))
    except np.linalg.LinAlgError:
        ss_resid = float(np.sum((response - np.mean(response)) ** 2))

    mse = ss_resid / max(df_resid, 1) if df_resid > 0 else max(ss_resid, 1e-30)

    for idx, (i, j) in enumerate(pairs):
        int_col = design[:, i] * design[:, j]
        plus_mask = int_col > 0
        minus_mask = int_col < 0

        if not np.any(plus_mask) or not np.any(minus_mask):
            results.append(InteractionResult(
                factors=(factor_names[i], factor_names[j]),
                effect=0.0, coefficient=0.0,
                sum_of_squares=0.0, t_statistic=0.0,
                p_value=1.0, significant=False,
            ))
            continue

        mean_plus = float(np.mean(response[plus_mask]))
        mean_minus = float(np.mean(response[minus_mask]))
        effect = mean_plus - mean_minus
        n_plus = int(np.sum(plus_mask))
        n_minus = int(np.sum(minus_mask))
        ss_int = (n_plus * n_minus) / (n_plus + n_minus) * effect ** 2

        se_effect = np.sqrt(mse * (1.0 / n_plus + 1.0 / n_minus))
        if se_effect < 1e-30:
            t_stat = float("inf") if abs(effect) > 0 else 0.0
            p_val = 0.0 if abs(effect) > 0 else 1.0
        else:
            t_stat = effect / se_effect
            if df_resid > 0:
                p_val = float(2 * sp_stats.t.sf(abs(t_stat), df_resid))
            else:
                p_val = 0.0 if abs(t_stat) > 2 else 1.0

        results.append(InteractionResult(
            factors=(factor_names[i], factor_names[j]),
            effect=float(effect),
            coefficient=float(effect / 2.0),
            sum_of_squares=float(ss_int),
            t_statistic=float(t_stat),
            p_value=float(p_val),
            significant=p_val < alpha,
        ))

    return results


# ---------------------------------------------------------------------------
# ANOVA table
# ---------------------------------------------------------------------------

def compute_anova(
    design: np.ndarray,
    response: np.ndarray,
    factor_names: list[str],
    alpha: float = 0.05,
) -> ANOVAResult:
    """Compute full ANOVA table for a DOE study.

    Decomposes the total sum of squares into contributions from each
    main effect, two-factor interactions, and residual.

    Args:
        design: Coded design matrix, shape (n, k).
        response: Response vector, length n.
        factor_names: Names for each factor column.
        alpha: Significance threshold (used for reference only).

    Returns:
        :class:`ANOVAResult` with rows for each source, R^2 and adj R^2.
    """
    n, k = design.shape
    response = np.asarray(response, dtype=float)
    grand_mean = float(np.mean(response))
    ss_total = float(np.sum((response - grand_mean) ** 2))

    rows: list[ANOVARow] = []
    ss_model = 0.0
    df_model = 0

    # Main effects
    for col in range(k):
        plus_mask = design[:, col] > 0
        minus_mask = design[:, col] < 0
        if not np.any(plus_mask) or not np.any(minus_mask):
            rows.append(ANOVARow(
                source=factor_names[col], df=1,
                sum_of_squares=0.0, mean_square=0.0,
                f_value=None, p_value=None,
            ))
            df_model += 1
            continue
        mean_plus = float(np.mean(response[plus_mask]))
        mean_minus = float(np.mean(response[minus_mask]))
        effect = mean_plus - mean_minus
        n_plus = int(np.sum(plus_mask))
        n_minus = int(np.sum(minus_mask))
        ss_factor = (n_plus * n_minus) / (n_plus + n_minus) * effect ** 2
        ss_model += ss_factor
        df_model += 1
        rows.append(ANOVARow(
            source=factor_names[col], df=1,
            sum_of_squares=float(ss_factor),
            mean_square=float(ss_factor),  # df=1
            f_value=None, p_value=None,  # filled after residual
        ))

    # Two-factor interactions
    pairs = list(combinations(range(k), 2))
    for i, j in pairs:
        int_col = design[:, i] * design[:, j]
        plus_mask = int_col > 0
        minus_mask = int_col < 0
        if not np.any(plus_mask) or not np.any(minus_mask):
            rows.append(ANOVARow(
                source=f"{factor_names[i]}*{factor_names[j]}", df=1,
                sum_of_squares=0.0, mean_square=0.0,
                f_value=None, p_value=None,
            ))
            df_model += 1
            continue
        mean_plus = float(np.mean(response[plus_mask]))
        mean_minus = float(np.mean(response[minus_mask]))
        effect = mean_plus - mean_minus
        n_plus = int(np.sum(plus_mask))
        n_minus = int(np.sum(minus_mask))
        ss_int = (n_plus * n_minus) / (n_plus + n_minus) * effect ** 2
        ss_model += ss_int
        df_model += 1
        rows.append(ANOVARow(
            source=f"{factor_names[i]}*{factor_names[j]}", df=1,
            sum_of_squares=float(ss_int), mean_square=float(ss_int),
            f_value=None, p_value=None,
        ))

    # Residual
    df_resid = n - df_model - 1
    ss_resid = max(ss_total - ss_model, 0.0)
    ms_resid = ss_resid / max(df_resid, 1)

    # Fill in F-values and p-values
    for row in rows:
        if row.sum_of_squares > 0 and ms_resid > 0:
            row.f_value = row.mean_square / ms_resid
            if df_resid > 0:
                row.p_value = float(sp_stats.f.sf(row.f_value, row.df, df_resid))
            else:
                row.p_value = None
        else:
            row.f_value = 0.0
            row.p_value = 1.0

    # Residual row
    rows.append(ANOVARow(
        source="Residual",
        df=max(df_resid, 0),
        sum_of_squares=float(ss_resid),
        mean_square=float(ms_resid),
        f_value=None,
        p_value=None,
    ))

    # Total row
    rows.append(ANOVARow(
        source="Total",
        df=n - 1,
        sum_of_squares=float(ss_total),
        mean_square=float(ss_total / max(n - 1, 1)),
        f_value=None,
        p_value=None,
    ))

    # R-squared
    r_sq = 1.0 - ss_resid / max(ss_total, 1e-30)
    if n - df_model - 1 > 0:
        adj_r_sq = 1.0 - (ss_resid / max(n - df_model - 1, 1)) / (
            ss_total / max(n - 1, 1)
        )
    else:
        adj_r_sq = r_sq

    return ANOVAResult(rows=rows, r_squared=r_sq, adj_r_squared=adj_r_sq)


# ---------------------------------------------------------------------------
# Regression (RSM)
# ---------------------------------------------------------------------------

def compute_regression(
    design: np.ndarray,
    response: np.ndarray,
    factor_names: list[str],
    include_squares: bool = False,
    include_interactions: bool = True,
) -> RegressionResult:
    """Fit an OLS polynomial regression model.

    Builds a design matrix with intercept, linear terms, optional
    interaction terms, and optional quadratic (squared) terms, then
    solves via least-squares.

    For RSM designs (CCD, Box-Behnken), set ``include_squares=True``
    to fit a full second-order model.

    When ``include_squares=True``, attempts to find the stationary point
    (gradient = 0) for response optimization.

    Args:
        design: Coded design matrix, shape (n, k).
        response: Response vector, length n.
        factor_names: Names for each factor column.
        include_squares: Include X_i^2 quadratic terms.
        include_interactions: Include X_i*X_j interaction terms.

    Returns:
        :class:`RegressionResult` with coefficients, fit statistics,
        and optional optimal settings.
    """
    n, k = design.shape
    response = np.asarray(response, dtype=float)

    # Build model matrix
    terms: list[str] = []
    columns: list[np.ndarray] = []

    # Intercept
    columns.append(np.ones(n))
    terms.append("Intercept")

    # Linear
    for col in range(k):
        columns.append(design[:, col])
        terms.append(factor_names[col])

    # Interactions
    if include_interactions:
        for i, j in combinations(range(k), 2):
            columns.append(design[:, i] * design[:, j])
            terms.append(f"{factor_names[i]}*{factor_names[j]}")

    # Quadratic
    if include_squares:
        for col in range(k):
            columns.append(design[:, col] ** 2)
            terms.append(f"{factor_names[col]}^2")

    X = np.column_stack(columns)
    p = X.shape[1]

    # OLS fit
    result = np.linalg.lstsq(X, response, rcond=None)
    beta = result[0]

    predicted = X @ beta
    residuals = response - predicted
    ss_res = float(np.sum(residuals ** 2))
    ss_tot = float(np.sum((response - np.mean(response)) ** 2))

    r_sq = 1.0 - ss_res / max(ss_tot, 1e-30)
    df_resid = n - p
    if df_resid > 0 and (n - 1) > 0:
        adj_r_sq = 1.0 - (ss_res / df_resid) / (ss_tot / (n - 1))
    else:
        adj_r_sq = r_sq

    coefficients = {terms[i]: float(beta[i]) for i in range(len(terms))}
    intercept = float(beta[0])

    # Optimal settings via stationary point (for second-order models)
    optimal: dict[str, float] | None = None
    if include_squares:
        optimal = _find_stationary_point(beta, k, factor_names, include_interactions)

    return RegressionResult(
        coefficients=coefficients,
        intercept=intercept,
        r_squared=r_sq,
        adj_r_squared=adj_r_sq,
        optimal_settings=optimal,
        residuals=residuals,
        predicted=predicted,
    )


def _find_stationary_point(
    beta: np.ndarray,
    k: int,
    factor_names: list[str],
    include_interactions: bool,
) -> dict[str, float] | None:
    """Find the stationary point of a second-order response surface.

    The second-order model is:
        y = b0 + b'x + x'Bx
    where b is the vector of linear coefficients and B is the matrix
    of quadratic/interaction coefficients.

    The stationary point is: x* = -0.5 * B^{-1} * b

    Returns None if B is singular.
    """
    # Extract linear coefficients (indices 1..k in beta)
    b_linear = beta[1:k + 1]

    # Build B matrix (symmetric)
    B = np.zeros((k, k))

    # Quadratic (diagonal) terms
    # In beta, quadratic terms come after intercept + k linear + C(k,2) interactions
    n_interactions = k * (k - 1) // 2 if include_interactions else 0
    quad_start = 1 + k + n_interactions
    for i in range(k):
        B[i, i] = beta[quad_start + i]

    # Interaction (off-diagonal) terms: b_ij / 2 on each side
    if include_interactions:
        idx = 1 + k  # start of interaction terms in beta
        for i, j in combinations(range(k), 2):
            B[i, j] = beta[idx] / 2.0
            B[j, i] = beta[idx] / 2.0
            idx += 1

    # Solve for stationary point: x* = -0.5 * B^{-1} * b
    try:
        cond = np.linalg.cond(B)
        if cond > 1e10:
            return None  # near-singular — no meaningful stationary point
        B_inv = np.linalg.inv(B)
        x_star = -0.5 * B_inv @ b_linear
        return {factor_names[i]: float(x_star[i]) for i in range(k)}
    except np.linalg.LinAlgError:
        return None
