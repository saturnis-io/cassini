"""Correlation analysis and Principal Component Analysis (PCA).

Provides pairwise correlation matrices (Pearson or Spearman) with
hypothesis-test p-values, and PCA via eigendecomposition of the
correlation matrix.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import stats


@dataclass
class CorrelationMatrixResult:
    """Pairwise correlation matrix with p-values.

    Attributes:
        matrix: ``n_chars x n_chars`` correlation coefficients.
        p_values: ``n_chars x n_chars`` two-sided p-values.
        method: ``'pearson'`` or ``'spearman'``.
        sample_count: Number of observations used.
        char_names: Characteristic names in column/row order.
    """

    matrix: list[list[float]]
    p_values: list[list[float]]
    method: str
    sample_count: int
    char_names: list[str]


@dataclass
class PCAResult:
    """Principal Component Analysis results.

    Attributes:
        eigenvalues: Eigenvalues in descending order.
        loadings: ``n_components x n_vars`` loading matrix (rows = PCs).
        explained_variance_ratio: Proportion of total variance per PC.
        scores: ``n_samples x n_components`` projection of data onto PCs.
        char_names: Variable names corresponding to loading columns.
    """

    eigenvalues: list[float]
    loadings: list[list[float]]
    explained_variance_ratio: list[float]
    scores: list[list[float]]
    char_names: list[str]


class CorrelationEngine:
    """Correlation and PCA computation engine."""

    def compute_correlation_matrix(
        self,
        X: np.ndarray,
        char_names: list[str],
        method: str = "pearson",
    ) -> CorrelationMatrixResult:
        """Compute a pairwise correlation matrix with p-values.

        Args:
            X: ``(n, p)`` data matrix.
            char_names: Variable names for labelling.
            method: ``'pearson'`` (default) or ``'spearman'``.

        Returns:
            :class:`CorrelationMatrixResult`.

        Raises:
            ValueError: If *method* is not recognized.
        """
        if method not in ("pearson", "spearman"):
            raise ValueError(f"Unknown correlation method: {method!r}")

        n, p = X.shape
        corr_matrix = np.zeros((p, p))
        p_matrix = np.zeros((p, p))

        for i in range(p):
            corr_matrix[i][i] = 1.0
            p_matrix[i][i] = 0.0
            for j in range(i + 1, p):
                if method == "pearson":
                    r, pval = stats.pearsonr(X[:, i], X[:, j])
                else:
                    r, pval = stats.spearmanr(X[:, i], X[:, j])
                corr_matrix[i][j] = r
                corr_matrix[j][i] = r
                p_matrix[i][j] = pval
                p_matrix[j][i] = pval

        return CorrelationMatrixResult(
            matrix=corr_matrix.tolist(),
            p_values=p_matrix.tolist(),
            method=method,
            sample_count=n,
            char_names=char_names,
        )

    def compute_pca(
        self,
        X: np.ndarray,
        char_names: list[str],
    ) -> PCAResult:
        """Principal Component Analysis via eigendecomposition of the
        correlation matrix.

        Data is standardised (zero-mean, unit-variance) before computing
        the correlation matrix so that PCA operates on comparable scales.

        Args:
            X: ``(n, p)`` data matrix.
            char_names: Variable names for labelling.

        Returns:
            :class:`PCAResult`.

        Raises:
            ValueError: If fewer than 3 observations are provided (need
                n > p to compute a meaningful correlation matrix).
        """
        n, p = X.shape
        if n < 3:
            raise ValueError(
                f"PCA requires at least 3 observations (have {n})"
            )

        stds = np.std(X, axis=0, ddof=1)
        # Guard against zero-variance columns
        stds[stds == 0] = 1.0
        X_std = (X - np.mean(X, axis=0)) / stds

        # Correlation matrix = covariance of standardised data
        corr = np.corrcoef(X_std.T)

        # Eigendecomposition (symmetric, so use eigh for stability)
        eigenvalues, eigenvectors = np.linalg.eigh(corr)

        # Sort descending
        idx = np.argsort(eigenvalues)[::-1]
        eigenvalues = eigenvalues[idx]
        eigenvectors = eigenvectors[:, idx]

        # Clamp tiny negative eigenvalues (floating-point artefacts) to zero
        eigenvalues = np.maximum(eigenvalues, 0.0)

        # Explained variance ratios
        total_var = np.sum(eigenvalues)
        if total_var > 0:
            explained = (eigenvalues / total_var).tolist()
        else:
            explained = [0.0] * len(eigenvalues)

        # Scores — project standardised data onto principal components
        scores = (X_std @ eigenvectors).tolist()

        return PCAResult(
            eigenvalues=eigenvalues.tolist(),
            loadings=eigenvectors.T.tolist(),  # rows = PCs
            explained_variance_ratio=explained,
            scores=scores,
            char_names=char_names,
        )
