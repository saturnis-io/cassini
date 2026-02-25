"""MYT (Mason-Young-Tracy) T-squared decomposition.

Decomposes a multivariate T² statistic into per-variable conditional
contributions to identify which variable(s) drove an out-of-control
signal.

References:
    Mason, R.L., Tracy, N.D. & Young, J.C. (1995). Decomposition of T²
    for Multivariate Control Chart Interpretation.
    *Journal of Quality Technology*, 27(2), 99-108.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class DecompositionTerm:
    """One term from the MYT decomposition of T².

    Attributes:
        variable_index: Original column index of this variable.
        variable_name: Human-readable variable name.
        conditional_t2: T² contribution conditional on all preceding
            variables (T²_{i|1,..,i-1}).
        unconditional_t2: Marginal (univariate) T² for this variable alone.
        proportion: ``conditional_t2 / total_t2``.
    """

    variable_index: int
    variable_name: str
    conditional_t2: float
    unconditional_t2: float
    proportion: float


class T2Decomposition:
    """MYT decomposition engine.

    Expresses the total Hotelling T² as a telescoping sum of conditional
    contributions:

        T² = T²_1 + T²_{2|1} + T²_{3|1,2} + ...

    Each conditional term isolates the *additional* information contributed
    by variable *i* beyond what was already explained by variables
    1 through i-1.  Sorting the result by contribution size quickly
    identifies the root-cause variable(s).
    """

    def decompose(
        self,
        x: np.ndarray,
        mean: np.ndarray,
        cov: np.ndarray,
        var_names: list[str],
    ) -> list[DecompositionTerm]:
        """Decompose T² for a single observation.

        Args:
            x: ``(p,)`` observation vector.
            mean: ``(p,)`` in-control mean vector.
            cov: ``(p, p)`` in-control covariance matrix.
            var_names: Variable names of length *p*.

        Returns:
            List of :class:`DecompositionTerm`, sorted by
            ``conditional_t2`` descending (largest contributor first).
        """
        p = len(x)

        # Total T² (for proportion calculation)
        cov_inv_full = _safe_inv(cov)
        diff_full = x - mean
        total_t2 = float(diff_full @ cov_inv_full @ diff_full)

        terms: list[DecompositionTerm] = []
        prev_t2 = 0.0  # T² accumulated through variables 0..i-1

        for i in range(p):
            # Unconditional (marginal) T² for variable i alone
            var_i = cov[i, i]
            uncond_t2 = float((x[i] - mean[i]) ** 2 / var_i) if var_i > 0 else 0.0

            # Conditional T²: T²(0..i) - T²(0..i-1)
            sub_x = x[: i + 1]
            sub_mean = mean[: i + 1]
            sub_cov = cov[: i + 1, : i + 1]
            sub_inv = _safe_inv(sub_cov)
            t2_through_i = float((sub_x - sub_mean) @ sub_inv @ (sub_x - sub_mean))

            cond_t2 = t2_through_i - prev_t2
            prev_t2 = t2_through_i

            proportion = cond_t2 / total_t2 if total_t2 > 0 else 0.0

            terms.append(
                DecompositionTerm(
                    variable_index=i,
                    variable_name=var_names[i],
                    conditional_t2=cond_t2,
                    unconditional_t2=uncond_t2,
                    proportion=proportion,
                )
            )

        # Sort by conditional contribution descending
        terms.sort(key=lambda t: t.conditional_t2, reverse=True)
        return terms


def _safe_inv(mat: np.ndarray) -> np.ndarray:
    """Invert a matrix, falling back to pseudo-inverse if ill-conditioned."""
    cond = np.linalg.cond(mat)
    if cond > 1e10:
        return np.linalg.pinv(mat)
    return np.linalg.inv(mat)
