"""Attribute MSA calculation engine (Kappa analysis).

Implements within-appraiser, between-appraiser, and vs-reference agreement
analysis with Cohen's Kappa (pairwise) and Fleiss' Kappa (multi-rater).
"""
from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from itertools import combinations

from openspc.core.msa.models import AttributeMSAResult


def _mode(values: Sequence[str]) -> str:
    """Return the most common value (ties broken by first occurrence)."""
    counter = Counter(values)
    return counter.most_common(1)[0][0]


def _cohens_kappa(ratings_a: list[str], ratings_b: list[str]) -> float:
    """Calculate Cohen's Kappa between two raters.

    Args:
        ratings_a: Ratings from rater A, one per item.
        ratings_b: Ratings from rater B, one per item.

    Returns:
        Cohen's Kappa coefficient.
    """
    n = len(ratings_a)
    if n == 0:
        return 0.0

    # All unique categories
    categories = sorted(set(ratings_a) | set(ratings_b))

    # Observed agreement
    p_o = sum(1 for a, b in zip(ratings_a, ratings_b) if a == b) / n

    # Expected agreement by chance
    p_e = 0.0
    for cat in categories:
        p_a = sum(1 for r in ratings_a if r == cat) / n
        p_b = sum(1 for r in ratings_b if r == cat) / n
        p_e += p_a * p_b

    if p_e >= 1.0:
        return 1.0  # Perfect agreement by chance (degenerate)
    return (p_o - p_e) / (1.0 - p_e)


def _fleiss_kappa(
    ratings_matrix: list[list[str]],
    n_raters: int,
) -> float:
    """Calculate Fleiss' Kappa for multiple raters.

    Args:
        ratings_matrix: ``[part_idx]`` -> list of all ratings for that part
            (length = n_raters * n_replicates_per_rater, flattened).
            Each rater contributes one "mode" rating per part.
        n_raters: Number of raters.

    Returns:
        Fleiss' Kappa coefficient.
    """
    n_items = len(ratings_matrix)
    if n_items == 0 or n_raters < 2:
        return 0.0

    # Discover all categories
    all_categories = sorted({r for row in ratings_matrix for r in row})
    n_cats = len(all_categories)
    if n_cats < 2:
        return 1.0  # Only one category — trivially perfect agreement

    cat_idx = {c: i for i, c in enumerate(all_categories)}

    # Build count matrix: n_items x n_categories
    counts = []
    for row in ratings_matrix:
        row_counts = [0] * n_cats
        for r in row:
            row_counts[cat_idx[r]] += 1
        counts.append(row_counts)

    # P_i for each item: proportion of agreeing pairs
    p_items = []
    for row_counts in counts:
        p_i = (sum(c * c for c in row_counts) - n_raters) / (n_raters * (n_raters - 1))
        p_items.append(p_i)

    p_bar = sum(p_items) / n_items

    # P_e: expected agreement by chance
    # p_j = proportion of all assignments to category j
    total_assignments = n_items * n_raters
    p_e = 0.0
    for j in range(n_cats):
        p_j = sum(counts[i][j] for i in range(n_items)) / total_assignments
        p_e += p_j * p_j

    if p_e >= 1.0:
        return 1.0
    return (p_bar - p_e) / (1.0 - p_e)


def _build_verdict(fleiss_kappa_value: float) -> str:
    """Determine verdict from Fleiss' Kappa."""
    if fleiss_kappa_value >= 0.90:
        return "acceptable"
    if fleiss_kappa_value >= 0.75:
        return "marginal"
    return "unacceptable"


class AttributeMSAEngine:
    """Attribute MSA calculation engine."""

    def calculate(
        self,
        ratings_3d: list[list[list[str]]],
        reference_decisions: list[str] | None = None,
        operator_names: list[str] | None = None,
    ) -> AttributeMSAResult:
        """Perform Attribute MSA study with Kappa analysis.

        Args:
            ratings_3d: ``[operator_idx][part_idx][replicate_idx]`` -> rating
                string (e.g. "pass", "fail", "accept", "reject").
            reference_decisions: Known-correct decision for each part.
                If provided, vs-reference agreement is calculated.
            operator_names: Human-readable names for operators. Defaults to
                "Operator 1", "Operator 2", etc.

        Returns:
            AttributeMSAResult with agreement percentages and Kappa statistics.
        """
        n_ops = len(ratings_3d)
        n_parts = len(ratings_3d[0])
        n_reps = len(ratings_3d[0][0])

        if n_ops < 2:
            raise ValueError("Attribute MSA requires at least 2 operators")
        if n_parts < 2:
            raise ValueError("Attribute MSA requires at least 2 parts")
        if n_reps < 1:
            raise ValueError("Attribute MSA requires at least 1 replicate")

        if operator_names is None:
            operator_names = [f"Operator {i + 1}" for i in range(n_ops)]

        # --- Within-appraiser agreement ---
        # For each operator, % of parts where ALL replicates give same answer
        within_appraiser: dict[str, float] = {}
        for i in range(n_ops):
            agree_count = 0
            for j in range(n_parts):
                reps = ratings_3d[i][j]
                if len(set(reps)) == 1:
                    agree_count += 1
            within_appraiser[operator_names[i]] = (agree_count / n_parts) * 100.0

        # --- Mode ratings per operator per part (for between/kappa) ---
        # mode_ratings[i][j] = mode of operator i's replicates for part j
        mode_ratings: list[list[str]] = []
        for i in range(n_ops):
            op_modes = []
            for j in range(n_parts):
                op_modes.append(_mode(ratings_3d[i][j]))
            mode_ratings.append(op_modes)

        # --- Between-appraiser agreement ---
        # % of parts where ALL operators' mode rating agrees
        between_agree = 0
        for j in range(n_parts):
            modes_for_part = [mode_ratings[i][j] for i in range(n_ops)]
            if len(set(modes_for_part)) == 1:
                between_agree += 1
        between_appraiser = (between_agree / n_parts) * 100.0

        # --- Vs reference agreement ---
        vs_reference: dict[str, float] | None = None
        if reference_decisions is not None:
            if len(reference_decisions) != n_parts:
                raise ValueError(
                    f"Reference decisions length ({len(reference_decisions)}) "
                    f"must match number of parts ({n_parts})"
                )
            vs_reference = {}
            for i in range(n_ops):
                match_count = sum(
                    1 for j in range(n_parts) if mode_ratings[i][j] == reference_decisions[j]
                )
                vs_reference[operator_names[i]] = (match_count / n_parts) * 100.0

        # --- Cohen's Kappa (pairwise) ---
        cohens_kappa_pairs: dict[str, float] = {}
        for (i1, name1), (i2, name2) in combinations(enumerate(operator_names), 2):
            kappa = _cohens_kappa(mode_ratings[i1], mode_ratings[i2])
            cohens_kappa_pairs[f"{name1} vs {name2}"] = kappa

        # --- Fleiss' Kappa (multi-rater) ---
        # Build per-part list of mode ratings from all operators
        fleiss_matrix: list[list[str]] = []
        for j in range(n_parts):
            part_ratings = [mode_ratings[i][j] for i in range(n_ops)]
            fleiss_matrix.append(part_ratings)
        fleiss_k = _fleiss_kappa(fleiss_matrix, n_raters=n_ops)

        verdict = _build_verdict(fleiss_k)

        return AttributeMSAResult(
            within_appraiser=within_appraiser,
            between_appraiser=between_appraiser,
            vs_reference=vs_reference,
            cohens_kappa_pairs=cohens_kappa_pairs,
            fleiss_kappa=fleiss_k,
            verdict=verdict,
        )
