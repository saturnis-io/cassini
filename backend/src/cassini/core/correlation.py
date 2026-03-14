"""Standalone Correlation Analysis engine.

Provides correlation matrix, partial correlation, PCA decomposition,
and variable importance ranking for the Pro-tier Correlation Analysis
feature. Delegates to numpy/scipy for computation.

Complements the multivariate.correlation module which is tightly coupled
to the multivariate SPC workflow. This module exposes a stateless,
functional API suitable for the dedicated correlation router.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
from scipy import stats

logger = logging.getLogger(__name__)


@dataclass
class CorrelationResult:
    """Pairwise correlation matrix with p-values.

    Attributes:
        matrix: ``p x p`` correlation coefficients.
        p_values: ``p x p`` two-sided p-values.
        method: ``'pearson'`` or ``'spearman'``.
        sample_count: Number of aligned observations used.
        variable_names: Variable labels in column/row order.
    """

    matrix: list[list[float]]
    p_values: list[list[float]]
    method: str
    sample_count: int
    variable_names: list[str]


@dataclass
class PCAResult:
    """Principal Component Analysis results.

    Attributes:
        eigenvalues: Eigenvalues in descending order.
        explained_variance_ratios: Proportion of total variance per PC.
        cumulative_variance: Running sum of explained variance ratios.
        loadings: ``n_components x n_vars`` loading matrix (rows = PCs).
        scores: ``n_samples x n_components`` projected data.
        variable_names: Variable names corresponding to loading columns.
    """

    eigenvalues: list[float]
    explained_variance_ratios: list[float]
    cumulative_variance: list[float]
    loadings: list[list[float]]
    scores: list[list[float]]
    variable_names: list[str]


@dataclass
class PartialCorrelationResult:
    """Partial correlation between two variables controlling for others.

    Attributes:
        r: Partial correlation coefficient.
        p_value: Two-sided p-value for the partial correlation.
        df: Degrees of freedom (n - k - 2, where k = number of controls).
        var1: Name of the first variable.
        var2: Name of the second variable.
        controlling_for: Names of the control variables.
    """

    r: float
    p_value: float
    df: int
    var1: str
    var2: str
    controlling_for: list[str]


@dataclass
class VariableImportance:
    """A single variable's correlation strength to a target.

    Attributes:
        variable_name: Name of the variable.
        characteristic_id: Database ID of the characteristic.
        pearson_r: Pearson correlation coefficient.
        abs_pearson_r: Absolute Pearson r (used for ranking).
        p_value: Two-sided p-value.
    """

    variable_name: str
    characteristic_id: int
    pearson_r: float
    abs_pearson_r: float
    p_value: float


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_correlation_matrix(
    data: dict[str, list[float]],
    method: str = "pearson",
) -> CorrelationResult:
    """Compute a pairwise correlation matrix with p-values.

    Args:
        data: Mapping of variable name -> list of aligned observations.
            All lists must have the same length (>= 3).
        method: ``'pearson'`` (default) or ``'spearman'``.

    Returns:
        :class:`CorrelationResult`.

    Raises:
        ValueError: If fewer than 2 variables or fewer than 3 observations.
    """
    if method not in ("pearson", "spearman"):
        raise ValueError(f"Unknown correlation method: {method!r}")

    names = list(data.keys())
    if len(names) < 2:
        raise ValueError("Correlation matrix requires at least 2 variables")

    X = np.column_stack([np.asarray(data[name], dtype=np.float64) for name in names])
    n, p = X.shape

    if n < 3:
        raise ValueError(f"Need at least 3 observations (have {n})")

    corr_fn = stats.pearsonr if method == "pearson" else stats.spearmanr
    corr_matrix = np.eye(p)
    p_matrix = np.zeros((p, p))

    # Warn about zero-variance columns before computing correlations
    col_stds = np.std(X, axis=0, ddof=1)
    for idx, std_val in enumerate(col_stds):
        if std_val == 0.0:
            logger.warning(
                "Zero-variance column detected: %r (index %d) — "
                "correlation values for this column will be set to 0",
                names[idx],
                idx,
            )

    for i in range(p):
        for j in range(i + 1, p):
            r, pval = corr_fn(X[:, i], X[:, j])
            corr_matrix[i, j] = r
            corr_matrix[j, i] = r
            p_matrix[i, j] = pval
            p_matrix[j, i] = pval

    # Replace NaN values that arise from constant-variance columns
    corr_matrix = np.nan_to_num(corr_matrix, nan=0.0)
    p_matrix = np.nan_to_num(p_matrix, nan=1.0)

    return CorrelationResult(
        matrix=corr_matrix.tolist(),
        p_values=p_matrix.tolist(),
        method=method,
        sample_count=n,
        variable_names=names,
    )


def compute_partial_correlation(
    data: dict[str, list[float]],
    var1: str,
    var2: str,
    controlling_for: list[str],
) -> PartialCorrelationResult:
    """Compute partial correlation between two variables controlling for others.

    Uses the inverse covariance (precision) matrix approach:
        r_{ij|rest} = -P_{ij} / sqrt(P_{ii} * P_{jj})
    where P = inv(corr_matrix).

    For a single control variable, this is equivalent to the first-order
    partial correlation formula.

    Args:
        data: Mapping of variable name -> aligned observations.
        var1: First variable name.
        var2: Second variable name.
        controlling_for: List of control variable names.

    Returns:
        :class:`PartialCorrelationResult`.

    Raises:
        ValueError: If variables not found in data, or insufficient observations.
    """
    all_vars = [var1, var2] + controlling_for
    for v in all_vars:
        if v not in data:
            raise ValueError(f"Variable {v!r} not found in data")

    # Build the sub-matrix of just the variables we need
    names = all_vars
    X = np.column_stack([np.asarray(data[name], dtype=np.float64) for name in names])
    n, p = X.shape
    k = len(controlling_for)

    if n < 3:
        raise ValueError(f"Need at least 3 observations (have {n})")

    # Special case: no controls -- just compute bivariate correlation
    if k == 0:
        r, pval = stats.pearsonr(X[:, 0], X[:, 1])
        return PartialCorrelationResult(
            r=float(r),
            p_value=float(pval),
            df=n - 2,
            var1=var1,
            var2=var2,
            controlling_for=[],
        )

    if n < p + 1:
        raise ValueError(
            f"Need at least {p + 1} observations for {p} variables (have {n})"
        )

    # Compute correlation matrix of all involved variables
    corr_matrix = np.corrcoef(X.T)

    # Invert to get precision matrix
    try:
        # Use pseudo-inverse if near-singular
        if np.linalg.cond(corr_matrix) > 1e10:
            precision = np.linalg.pinv(corr_matrix)
        else:
            precision = np.linalg.inv(corr_matrix)
    except np.linalg.LinAlgError:
        precision = np.linalg.pinv(corr_matrix)

    # Indices: var1 is 0, var2 is 1 in our sub-matrix
    i, j = 0, 1
    denom = np.sqrt(precision[i, i] * precision[j, j])
    if denom < 1e-15:
        r_partial = 0.0
    else:
        r_partial = -precision[i, j] / denom

    # Clamp to [-1, 1] for numerical safety
    r_partial = float(np.clip(r_partial, -1.0, 1.0))

    # Degrees of freedom and p-value via t-test
    df = n - k - 2
    if df <= 0:
        p_value = 1.0
    else:
        if abs(r_partial) >= 1.0:
            p_value = 0.0
        else:
            t_stat = r_partial * np.sqrt(df / (1.0 - r_partial**2))
            p_value = float(2.0 * stats.t.sf(abs(t_stat), df))

    return PartialCorrelationResult(
        r=r_partial,
        p_value=p_value,
        df=max(df, 0),
        var1=var1,
        var2=var2,
        controlling_for=controlling_for,
    )


def compute_pca(
    data: dict[str, list[float]],
) -> PCAResult:
    """Principal Component Analysis via eigendecomposition.

    Data is standardised (zero-mean, unit-variance) before computing
    the correlation matrix so that PCA operates on comparable scales.

    Args:
        data: Mapping of variable name -> aligned observations.

    Returns:
        :class:`PCAResult`.

    Raises:
        ValueError: If fewer than 3 observations or fewer than 2 variables.
    """
    names = list(data.keys())
    if len(names) < 2:
        raise ValueError("PCA requires at least 2 variables")

    X = np.column_stack([np.asarray(data[name], dtype=np.float64) for name in names])
    n, p = X.shape

    if n < 3:
        raise ValueError(f"PCA requires at least 3 observations (have {n})")

    # Standardise
    stds = np.std(X, axis=0, ddof=1)
    stds[stds == 0] = 1.0  # Guard against zero-variance columns
    X_std = (X - np.mean(X, axis=0)) / stds

    # Correlation matrix of standardised data
    # Use covariance of standardised data directly (more robust to
    # zero-variance columns that np.corrcoef can turn into NaN).
    corr = np.cov(X_std.T, ddof=1)
    if corr.ndim == 0:
        corr = corr.reshape(1, 1)
    # Replace any NaN (from constant columns) with 0
    np.nan_to_num(corr, copy=False, nan=0.0)

    # Eigendecomposition (symmetric, use eigh for stability)
    eigenvalues, eigenvectors = np.linalg.eigh(corr)

    # Sort descending
    idx = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[idx]
    eigenvectors = eigenvectors[:, idx]

    # Clamp tiny negative eigenvalues (floating-point artefacts)
    eigenvalues = np.maximum(eigenvalues, 0.0)

    # Explained variance ratios
    total_var = np.sum(eigenvalues)
    if total_var > 0:
        ratios = (eigenvalues / total_var).tolist()
    else:
        ratios = [0.0] * len(eigenvalues)

    # Cumulative variance
    cumulative: list[float] = []
    running = 0.0
    for ratio in ratios:
        running += ratio
        cumulative.append(running)

    # Scores — project standardised data onto principal components
    scores = (X_std @ eigenvectors).tolist()

    return PCAResult(
        eigenvalues=eigenvalues.tolist(),
        explained_variance_ratios=ratios,
        cumulative_variance=cumulative,
        loadings=eigenvectors.T.tolist(),  # rows = PCs
        scores=scores,
        variable_names=names,
    )


def rank_variable_importance(
    data: dict[str, list[float]],
    target_var: str,
) -> list[VariableImportance]:
    """Rank variables by absolute Pearson correlation to a target.

    Args:
        data: Mapping of variable name -> aligned observations.
            Must include ``target_var`` and at least one other variable.
        target_var: The target variable name.

    Returns:
        List of :class:`VariableImportance` sorted descending by ``abs_pearson_r``.

    Raises:
        ValueError: If target not found or no other variables.
    """
    if target_var not in data:
        raise ValueError(f"Target variable {target_var!r} not found in data")

    target = np.asarray(data[target_var], dtype=np.float64)
    n = len(target)

    if n < 3:
        raise ValueError(f"Need at least 3 observations (have {n})")

    results: list[VariableImportance] = []
    for name, values in data.items():
        if name == target_var:
            continue
        x = np.asarray(values, dtype=np.float64)
        if len(x) != n:
            continue  # Skip misaligned variables
        r, pval = stats.pearsonr(x, target)
        results.append(
            VariableImportance(
                variable_name=name,
                characteristic_id=0,  # Filled in by the API layer
                pearson_r=float(r),
                abs_pearson_r=float(abs(r)),
                p_value=float(pval),
            )
        )

    results.sort(key=lambda v: v.abs_pearson_r, reverse=True)
    return results
