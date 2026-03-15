"""MYT (Mason-Young-Tracy) T-squared decomposition.

Decomposes a multivariate T² statistic into per-variable conditional
contributions to identify which variable(s) drove an out-of-control
signal.

References:
    Mason, R.L., Tracy, N.D. & Young, J.C. (1995). Decomposition of T²
    for Multivariate Control Chart Interpretation.
    *Journal of Quality Technology*, 27(2), 99-108.

    Mason, R.L., Tracy, N.D. & Young, J.C. (1997). A Practical Approach
    for Interpreting Multivariate T² Control Chart Signals.
    *Journal of Quality Technology*, 29(4), 396-406.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from cassini.core.explain import ExplanationCollector


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

    def decompose_all_last(
        self,
        x: np.ndarray,
        mean: np.ndarray,
        cov: np.ndarray,
        var_names: list[str],
        collector: ExplanationCollector | None = None,
    ) -> list[DecompositionTerm]:
        """Order-independent decomposition via the last-variable strategy.

        For each of the *p* variables, computes a reordered decomposition
        where that variable is placed last.  The conditional T² of the
        last variable equals its *unique contribution* — the information
        it adds beyond all other variables — and this value is invariant
        to the ordering of the preceding variables.

        This implements the recommendation of Mason, Tracy & Young (1997):
        compute p separate decompositions to obtain order-independent
        unique contributions for root-cause identification.

        Args:
            x: ``(p,)`` observation vector.
            mean: ``(p,)`` in-control mean vector.
            cov: ``(p, p)`` in-control covariance matrix.
            var_names: Variable names of length *p*.
            collector: Optional explanation collector for Show Your Work.

        Returns:
            List of :class:`DecompositionTerm` (one per variable),
            sorted by ``conditional_t2`` descending.  Each term's
            ``conditional_t2`` represents the unique contribution of
            that variable, independent of variable ordering.
        """
        p = len(var_names)

        # Total T² for proportion calculation
        cov_inv_full = _safe_inv(cov)
        diff_full = x - mean
        total_t2 = float(diff_full @ cov_inv_full @ diff_full)

        if collector:
            collector.input("p (variables)", p)
            collector.input("Total T\u00b2", round(total_t2, 6))
            for i, name in enumerate(var_names):
                collector.input(f"x_{name}", round(float(x[i]), 6))
                collector.input(f"\u03bc_{name}", round(float(mean[i]), 6))

        results: list[DecompositionTerm] = []

        for target in range(p):
            # Reorder: all other variables first, target variable last
            order = [i for i in range(p) if i != target] + [target]
            x_reordered = x[order]
            mean_reordered = mean[order]
            cov_reordered = cov[np.ix_(order, order)]
            names_reordered = [var_names[i] for i in order]

            terms = self.decompose(
                x_reordered, mean_reordered, cov_reordered, names_reordered
            )

            # The last term in the (unsorted) decomposition is the target's
            # unique contribution. decompose() sorts by conditional_t2, so
            # find by variable_name (last in reordered list).
            target_name = var_names[target]
            unique_term = next(
                (t for t in terms if t.variable_name == target_name), terms[-1]
            )

            # Marginal T² for this variable alone
            var_i = cov[target, target]
            uncond_t2 = (
                float((x[target] - mean[target]) ** 2 / var_i) if var_i > 0 else 0.0
            )

            unique_proportion = (
                unique_term.conditional_t2 / total_t2 if total_t2 > 0 else 0.0
            )

            results.append(
                DecompositionTerm(
                    variable_index=target,
                    variable_name=target_name,
                    conditional_t2=unique_term.conditional_t2,
                    unconditional_t2=uncond_t2,
                    proportion=unique_proportion,
                )
            )

            if collector:
                collector.step(
                    label=f"Unique contribution of {target_name}",
                    formula_latex=(
                        r"T^2_{" + target_name + r"|rest}"
                        r" = T^2_{1,\ldots,p} - T^2_{1,\ldots,p \setminus "
                        + target_name + r"}"
                    ),
                    substitution_latex=(
                        r"T^2_{" + target_name + r"|rest}"
                        r" = " + f"{total_t2:.4f}"
                        r" - " + f"{total_t2 - unique_term.conditional_t2:.4f}"
                    ),
                    result=unique_term.conditional_t2,
                    note=(
                        "Mason, R.L., Tracy, N.D. & Young, J.C. (1995). "
                        "Decomposition of T\u00b2 for Multivariate Control Chart "
                        "Interpretation. JQT, 27(2), 99-108. "
                        "Order-independent unique contributions per "
                        "Mason et al. (1997)."
                    ),
                )

        # Sort by unique contribution descending
        results.sort(key=lambda t: t.conditional_t2, reverse=True)
        return results


# Citation constant for Show Your Work
MTY_CITATION_TEXT = (
    "Mason, R.L., Tracy, N.D. & Young, J.C. (1995). "
    "Decomposition of T\u00b2 for Multivariate Control Chart Interpretation. "
    "Journal of Quality Technology, 27(2), 99-108. "
    "Order-independent unique contributions computed via last-variable "
    "strategy per Mason et al. (1997)."
)


def _safe_inv(mat: np.ndarray) -> np.ndarray:
    """Invert a matrix, falling back to pseudo-inverse if ill-conditioned."""
    cond = np.linalg.cond(mat)
    if cond > 1e10:
        return np.linalg.pinv(mat)
    return np.linalg.inv(mat)
