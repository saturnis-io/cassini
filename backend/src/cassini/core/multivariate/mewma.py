"""Multivariate Exponentially Weighted Moving Average (MEWMA) control chart.

Implements the MEWMA chart of Lowry, Woodall, Champ & Rigdon (1992),
which smooths each observation vector toward the process mean and
monitors the resulting T² statistic.

References:
    Lowry, C.A., Woodall, W.H., Champ, C.W. & Rigdon, S.E. (1992).
    A Multivariate Exponentially Weighted Moving Average Control Chart.
    *Technometrics*, 34(1), 46-53.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import numpy as np
from scipy import stats


@dataclass
class MEWMAPoint:
    """A single point on an MEWMA chart.

    Attributes:
        t_squared: T² of the smoothed vector Z_i.
        ucl: Upper control limit.
        in_control: Whether the point is within the UCL.
        smoothed_values: Current EWMA vector Z_i.
        timestamp: Optional observation timestamp.
    """

    t_squared: float
    ucl: float
    in_control: bool
    smoothed_values: list[float]
    timestamp: datetime | None = None


class MEWMAEngine:
    """MEWMA multivariate control chart engine.

    The smoothed vector is:

        Z_i = lambda * X_i + (1 - lambda) * Z_{i-1}

    with Z_0 = 0 (centered data).  The covariance of Z_i is
    time-varying:

        Sigma_Z = [lambda / (2 - lambda)] * [1 - (1 - lambda)^{2i}] * Sigma

    The chart plots T²_i = Z_i' * Sigma_Z^{-1} * Z_i against a fixed UCL.
    """

    # Approximate UCL values for ARL_0 ~ 370 (Lowry et al. 1992, Table 3).
    # Keyed by (p, lambda).
    DEFAULT_UCL: dict[tuple[int, float], float] = {
        (2, 0.05): 10.65,
        (2, 0.10): 10.55,
        (2, 0.20): 10.30,
        (3, 0.05): 12.75,
        (3, 0.10): 12.55,
        (3, 0.20): 12.20,
        (4, 0.05): 14.70,
        (4, 0.10): 14.45,
        (4, 0.20): 14.05,
        (5, 0.05): 16.55,
        (5, 0.10): 16.25,
        (5, 0.20): 15.80,
    }

    def compute_chart_data(
        self,
        X: np.ndarray,
        cov: np.ndarray,
        lambda_param: float = 0.1,
        ucl: float | None = None,
        timestamps: list[datetime] | None = None,
    ) -> list[MEWMAPoint]:
        """Compute MEWMA chart data for a data matrix.

        Args:
            X: ``(n, p)`` observation matrix (raw, un-centered).
            cov: ``(p, p)`` in-control covariance matrix (typically
                from Phase I estimation).
            lambda_param: Smoothing parameter in (0, 1].
            ucl: Fixed upper control limit.  If *None*, looked up from
                :attr:`DEFAULT_UCL` or approximated via chi-squared.
            timestamps: Optional per-row timestamps.

        Returns:
            List of :class:`MEWMAPoint`, one per observation.
        """
        if not (0 < lambda_param <= 1):
            raise ValueError(f"lambda_param must be in (0, 1], got {lambda_param}")

        n, p = X.shape
        mean = np.mean(X, axis=0)
        X_centered = X - mean

        if ucl is None:
            key = (p, lambda_param)
            ucl = self.DEFAULT_UCL.get(key, float(stats.chi2.ppf(0.9973, p)))

        Z = np.zeros(p)
        points: list[MEWMAPoint] = []

        for i in range(n):
            Z = lambda_param * X_centered[i] + (1 - lambda_param) * Z

            # Time-varying covariance of Z_i
            factor = (lambda_param / (2 - lambda_param)) * (
                1 - (1 - lambda_param) ** (2 * (i + 1))
            )
            sigma_z = factor * cov

            cond = np.linalg.cond(sigma_z)
            sigma_z_inv = (
                np.linalg.pinv(sigma_z) if cond > 1e10 else np.linalg.inv(sigma_z)
            )

            t2 = float(Z @ sigma_z_inv @ Z)

            pt = MEWMAPoint(
                t_squared=t2,
                ucl=float(ucl),
                in_control=t2 <= ucl,
                smoothed_values=Z.tolist(),
            )
            if timestamps and i < len(timestamps):
                pt.timestamp = timestamps[i]
            points.append(pt)

        return points
