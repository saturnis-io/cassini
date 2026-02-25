"""Hotelling T-squared control chart engine.

Implements both Phase I (retrospective parameter estimation) and Phase II
(prospective monitoring) Hotelling T² charts for multivariate SPC.

References:
    Montgomery, D.C. (2019). *Introduction to Statistical Quality Control*,
    8th ed., Chapter 11.
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
    """

    mean: np.ndarray
    covariance: np.ndarray
    cov_inv: np.ndarray
    t_squared: list[float]
    ucl: float
    n: int
    p: int


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


class HotellingT2Engine:
    """Hotelling T² multivariate control chart engine."""

    # ------------------------------------------------------------------
    # Phase I
    # ------------------------------------------------------------------

    def compute_phase_i(
        self,
        X: np.ndarray,
        alpha: float = 0.0027,
    ) -> PhaseIResult:
        """Phase I retrospective analysis — estimate parameters and screen
        historical data.

        Computes the sample mean vector and covariance matrix from *X*,
        then calculates T² for every observation.

        The upper control limit uses the exact F-distribution:

            UCL = p(n+1)(n-1) / [n(n-p)] * F_{1-alpha, p, n-p}

        Args:
            X: ``(n, p)`` data matrix — *n* observations of *p* variables.
            alpha: Significance level (default 0.0027 ≈ 3-sigma equivalent).

        Returns:
            :class:`PhaseIResult` with estimated parameters and per-point T².

        Raises:
            ValueError: If ``n < 2p`` (insufficient observations).
        """
        n, p = X.shape
        if n < 2 * p:
            raise ValueError(
                f"Need at least {2 * p} observations for {p} variables (have {n})"
            )

        mean = np.mean(X, axis=0)
        cov = np.cov(X.T, ddof=1)

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
