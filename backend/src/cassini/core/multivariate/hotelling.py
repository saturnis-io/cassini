"""Hotelling T-squared control chart engine.

Implements both Phase I (retrospective parameter estimation) and Phase II
(prospective monitoring) Hotelling T² charts for multivariate SPC.

Supports two covariance estimation methods:
  - **classical**: Standard sample mean and covariance (default).
  - **mcd**: Minimum Covariance Determinant (Rousseeuw & Van Driessen, 1999).
    MCD is robust to outliers in Phase I data — it finds the subset of *h*
    observations (h >= n/2) whose classical covariance has the smallest
    determinant, then re-weights for consistency.

References:
    Montgomery, D.C. (2019). *Introduction to Statistical Quality Control*,
    8th ed., Chapter 11.
    Rousseeuw, P.J. & Van Driessen, K. (1999). A Fast Algorithm for the
    Minimum Covariance Determinant Estimator. *Technometrics*, 41(3), 212-223.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

import numpy as np
from scipy import stats


@dataclass
class PhaseIResult:
    """Results from Phase I (retrospective) Hotelling T² analysis.

    Attributes:
        mean: ``(p,)`` estimated mean vector.
        covariance: ``(p, p)`` estimated covariance matrix.
        cov_inv: ``(p, p)`` (pseudo-)inverse of covariance.
        t_squared: T² statistic for each observation.
        ucl: Upper control limit (F-distribution based).
        n: Number of observations used.
        p: Number of variables (characteristics).
        outlier_count: Number of Phase I outliers detected by MCD (0 for classical).
        covariance_method: Method used for estimation ("classical" or "mcd").
    """

    mean: np.ndarray
    covariance: np.ndarray
    cov_inv: np.ndarray
    t_squared: list[float]
    ucl: float
    n: int
    p: int
    outlier_count: int = 0
    covariance_method: str = "classical"


@dataclass
class T2Point:
    """A single point on a Hotelling T² chart.

    Attributes:
        t_squared: T² value for this observation.
        ucl: Applicable upper control limit.
        in_control: Whether this observation is within the UCL.
        timestamp: Optional timestamp of the observation.
        raw_values: Optional raw variable values for this observation.
    """

    t_squared: float
    ucl: float
    in_control: bool
    timestamp: datetime | None = None
    raw_values: list[float] | None = None


def compute_confidence_ellipse(
    mean: np.ndarray,
    cov: np.ndarray,
    ucl: float,
    n_points: int = 100,
) -> list[tuple[float, float]]:
    """Compute parametric ellipse boundary points for 2D bivariate data.

    The ellipse satisfies: (x - mu)^T Sigma^{-1} (x - mu) = UCL

    Uses eigendecomposition of the covariance matrix:
    - Semi-axes lengths: sqrt(UCL * eigenvalue_i)
    - Rotation angle: from the first eigenvector

    Args:
        mean: ``(2,)`` center of the ellipse (mean vector).
        cov: ``(2, 2)`` covariance matrix.
        ucl: Upper control limit (determines ellipse size).
        n_points: Number of boundary points to generate.

    Returns:
        List of ``(x, y)`` coordinate pairs tracing the ellipse boundary.

    Raises:
        ValueError: If inputs are not 2-dimensional or UCL is non-positive.
    """
    if mean.shape != (2,):
        raise ValueError(f"Mean must be (2,), got {mean.shape}")
    if cov.shape != (2, 2):
        raise ValueError(f"Covariance must be (2, 2), got {cov.shape}")
    if ucl <= 0:
        raise ValueError(f"UCL must be positive, got {ucl}")

    eigenvalues, eigenvectors = np.linalg.eigh(cov)

    # Guard against negative eigenvalues from numerical noise
    eigenvalues = np.maximum(eigenvalues, 0.0)

    angle = np.arctan2(eigenvectors[1, 0], eigenvectors[0, 0])

    # Parametric ellipse
    theta = np.linspace(0, 2 * np.pi, n_points)
    a = np.sqrt(ucl * eigenvalues[0])  # semi-axis 1
    b = np.sqrt(ucl * eigenvalues[1])  # semi-axis 2

    # Rotate and translate
    cos_a, sin_a = np.cos(angle), np.sin(angle)
    x = mean[0] + a * np.cos(theta) * cos_a - b * np.sin(theta) * sin_a
    y = mean[1] + a * np.cos(theta) * sin_a + b * np.sin(theta) * cos_a

    return [(float(xi), float(yi)) for xi, yi in zip(x, y)]


class HotellingT2Engine:
    """Hotelling T² multivariate control chart engine."""

    # ------------------------------------------------------------------
    # Phase I
    # ------------------------------------------------------------------

    def compute_phase_i(
        self,
        X: np.ndarray,
        alpha: float = 0.0027,
        covariance_method: str = "classical",
    ) -> PhaseIResult:
        """Phase I retrospective analysis — estimate parameters and screen
        historical data.

        Computes the mean vector and covariance matrix from *X* using either
        classical estimation or the Minimum Covariance Determinant (MCD),
        then calculates T² for every observation.

        The upper control limit uses the exact F-distribution:

            UCL = p(n+1)(n-1) / [n(n-p)] * F_{1-alpha, p, n-p}

        Args:
            X: ``(n, p)`` data matrix — *n* observations of *p* variables.
            alpha: Significance level (default 0.0027 ≈ 3-sigma equivalent).
            covariance_method: ``"classical"`` (default) or ``"mcd"`` for
                robust Minimum Covariance Determinant estimation.

        Returns:
            :class:`PhaseIResult` with estimated parameters and per-point T².

        Raises:
            ValueError: If ``n < 2p`` (insufficient observations).
            ValueError: If ``covariance_method`` is not ``"classical"`` or ``"mcd"``.
        """
        n, p = X.shape
        if n < 2 * p:
            raise ValueError(
                f"Need at least {2 * p} observations for {p} variables (have {n})"
            )

        outlier_count = 0

        if covariance_method == "mcd":
            from sklearn.covariance import MinCovDet

            mcd = MinCovDet(support_fraction=None)  # auto-select h
            mcd.fit(X)
            mean = mcd.location_
            cov = mcd.covariance_

            # Count Phase I outliers using chi-squared threshold at 97.5%
            chi2_threshold = float(stats.chi2.ppf(0.975, p))
            outlier_mask = mcd.dist_ > chi2_threshold
            outlier_count = int(np.sum(outlier_mask))
        elif covariance_method == "classical":
            mean = np.mean(X, axis=0)
            cov = np.cov(X.T, ddof=1)
        else:
            raise ValueError(
                f"Unknown covariance_method '{covariance_method}' — "
                "expected 'classical' or 'mcd'"
            )

        # Ensure cov is 2-D even for p == 1
        if cov.ndim == 0:
            cov = cov.reshape(1, 1)

        # Inversion — fall back to pseudo-inverse for near-singular cases
        cond = np.linalg.cond(cov)
        cov_inv = np.linalg.pinv(cov) if cond > 1e10 else np.linalg.inv(cov)

        # T² for every observation
        t_sq: list[float] = []
        for i in range(n):
            diff = X[i] - mean
            t2 = float(diff @ cov_inv @ diff)
            t_sq.append(t2)

        # Phase I UCL
        ucl = (
            p * (n + 1) * (n - 1)
            / (n * (n - p))
            * stats.f.ppf(1 - alpha, p, n - p)
        )

        return PhaseIResult(
            mean=mean,
            covariance=cov,
            cov_inv=cov_inv,
            t_squared=t_sq,
            ucl=float(ucl),
            n=n,
            p=p,
            outlier_count=outlier_count,
            covariance_method=covariance_method,
        )

    # ------------------------------------------------------------------
    # Phase II
    # ------------------------------------------------------------------

    def compute_phase_ii(
        self,
        x: np.ndarray,
        mean: np.ndarray,
        cov_inv: np.ndarray,
        n_ref: int,
        p: int,
        alpha: float = 0.0027,
    ) -> T2Point:
        """Phase II monitoring — evaluate a *new* observation against frozen
        Phase I parameters.

        For large reference samples (``n_ref > 100``) the UCL simplifies
        to the chi-squared distribution.

        Args:
            x: ``(p,)`` new observation vector.
            mean: ``(p,)`` frozen mean vector from Phase I.
            cov_inv: ``(p, p)`` frozen inverse covariance from Phase I.
            n_ref: Number of observations used in Phase I.
            p: Number of variables.
            alpha: Significance level.

        Returns:
            :class:`T2Point` with T² value and control limit.
        """
        if n_ref <= p:
            raise ValueError(f"n_ref ({n_ref}) must be > p ({p}) for Phase II UCL computation")

        diff = x - mean
        t2 = float(diff @ cov_inv @ diff)

        if n_ref > 100:
            ucl = float(stats.chi2.ppf(1 - alpha, p))
        else:
            ucl = float(
                p
                * (n_ref + 1)
                * (n_ref - 1)
                / (n_ref * (n_ref - p))
                * stats.f.ppf(1 - alpha, p, n_ref - p)
            )

        return T2Point(t_squared=t2, ucl=ucl, in_control=t2 <= ucl)

    # ------------------------------------------------------------------
    # Batch chart data
    # ------------------------------------------------------------------

    def compute_chart_data(
        self,
        X: np.ndarray,
        mean: np.ndarray,
        cov_inv: np.ndarray,
        n_ref: int,
        alpha: float = 0.0027,
        timestamps: list[datetime] | None = None,
    ) -> list[T2Point]:
        """Compute T² for every row of *X* using frozen Phase I parameters.

        Args:
            X: ``(n, p)`` data matrix.
            mean: Frozen mean vector.
            cov_inv: Frozen inverse covariance.
            n_ref: Phase I sample count (for UCL computation).
            alpha: Significance level.
            timestamps: Optional per-row timestamps.

        Returns:
            List of :class:`T2Point`, one per observation.
        """
        n, p = X.shape
        points: list[T2Point] = []
        for i in range(n):
            pt = self.compute_phase_ii(X[i], mean, cov_inv, n_ref, p, alpha)
            pt.raw_values = X[i].tolist()
            if timestamps and i < len(timestamps):
                pt.timestamp = timestamps[i]
            points.append(pt)
        return points
