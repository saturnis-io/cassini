"""Attribute MSA calculation engine (Kappa analysis).

Implements within-appraiser, between-appraiser, and vs-reference agreement
analysis with Cohen's Kappa (pairwise) and Fleiss' Kappa (multi-rater).
"""
from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from itertools import combinations

from cassini.core.explain import ExplanationCollector
from cassini.core.msa.models import AttributeMSAResult


def _mode(values: Sequence[str]) -> str:
    """Return the most common value (ties broken by first occurrence)."""
    counter = Counter(values)
    return counter.most_common(1)[0][0]


def _cohens_kappa(
    ratings_a: list[str],
    ratings_b: list[str],
    collector: ExplanationCollector | None = None,
    pair_label: str | None = None,
) -> float:
    """Calculate Cohen's Kappa between two raters.

    Args:
        ratings_a: Ratings from rater A, one per item.
        ratings_b: Ratings from rater B, one per item.
        collector: Optional explanation collector for Show Your Work.
        pair_label: Human-readable label for the pair (e.g. "Op A vs Op B").

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
        kappa = 1.0  # Perfect agreement by chance (degenerate)
    else:
        kappa = (p_o - p_e) / (1.0 - p_e)

    if collector:
        label_suffix = f" ({pair_label})" if pair_label else ""
        collector.step(
            label=f"Cohen's Kappa p_o{label_suffix}",
            formula_latex=r"p_o = \frac{\text{agreements}}{n}",
            substitution_latex=r"p_o = \frac{" + str(int(p_o * n)) + r"}{" + str(n) + r"}",
            result=p_o,
        )
        collector.step(
            label=f"Cohen's Kappa p_e{label_suffix}",
            formula_latex=r"p_e = \sum_k p_{A,k} \cdot p_{B,k}",
            substitution_latex=r"p_e = " + str(round(p_e, 6)),
            result=p_e,
        )
        collector.step(
            label=f"Cohen's Kappa{label_suffix}",
            formula_latex=r"\kappa = \frac{p_o - p_e}{1 - p_e}",
            substitution_latex=r"\kappa = \frac{" + str(round(p_o, 6)) + r" - " + str(round(p_e, 6)) + r"}{1 - " + str(round(p_e, 6)) + r"}",
            result=kappa,
        )

    return kappa


def _fleiss_kappa(
    ratings_matrix: list[list[str]],
    n_raters: int,
    collector: ExplanationCollector | None = None,
) -> float:
    """Calculate Fleiss' Kappa for multiple raters.

    Args:
        ratings_matrix: ``[part_idx]`` -> list of all ratings for that part
            (length = n_raters * n_replicates_per_rater, flattened).
            Each rater contributes one "mode" rating per part.
        n_raters: Number of raters.
        collector: Optional explanation collector for Show Your Work.

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
        kappa = 1.0
    else:
        kappa = (p_bar - p_e) / (1.0 - p_e)

    if collector:
        collector.step(
            label="Fleiss' Kappa: P\u0304 (mean agreement)",
            formula_latex=r"\bar{P} = \frac{1}{N} \sum_{i} P_i, \quad P_i = \frac{\sum_j n_{ij}^2 - n}{n(n-1)}",
            substitution_latex=r"\bar{P} = \frac{" + str(round(sum(p_items), 6)) + r"}{" + str(n_items) + r"}",
            result=p_bar,
            note=f"N={n_items} items, n={n_raters} raters, {n_cats} categories",
        )
        collector.step(
            label="Fleiss' Kappa: P_e (expected agreement)",
            formula_latex=r"P_e = \sum_j \hat{p}_j^2",
            substitution_latex=r"P_e = " + str(round(p_e, 6)),
            result=p_e,
        )
        collector.step(
            label="Fleiss' Kappa",
            formula_latex=r"\kappa = \frac{\bar{P} - P_e}{1 - P_e}",
            substitution_latex=r"\kappa = \frac{" + str(round(p_bar, 6)) + r" - " + str(round(p_e, 6)) + r"}{1 - " + str(round(p_e, 6)) + r"}",
            result=kappa,
        )

    return kappa


def _build_verdict(
    fleiss_kappa_value: float,
    acceptable_threshold: float = 0.75,
    marginal_threshold: float = 0.40,
) -> str:
    """Determine verdict from Fleiss' Kappa.

    Args:
        fleiss_kappa_value: Computed Fleiss' Kappa coefficient.
        acceptable_threshold: Kappa >= this value is "acceptable" (default 0.75).
            AIAG MSA 4th Ed does not specify numeric Kappa thresholds;
            0.75 aligns with Landis & Koch (1977) "substantial agreement"
            and common industry practice.
        marginal_threshold: Kappa >= this value (but < acceptable) is "marginal"
            (default 0.40, Landis & Koch "moderate agreement").
    """
    if fleiss_kappa_value >= acceptable_threshold:
        return "acceptable"
    if fleiss_kappa_value >= marginal_threshold:
        return "marginal"
    return "unacceptable"


class AttributeMSAEngine:
    """Attribute MSA calculation engine."""

    def calculate(
        self,
        ratings_3d: list[list[list[str]]],
        reference_decisions: list[str] | None = None,
        operator_names: list[str] | None = None,
        collector: ExplanationCollector | None = None,
    ) -> AttributeMSAResult:
        """Perform Attribute MSA study with Kappa analysis.

        Args:
            ratings_3d: ``[operator_idx][part_idx][replicate_idx]`` -> rating
                string (e.g. "pass", "fail", "accept", "reject").
            reference_decisions: Known-correct decision for each part.
                If provided, vs-reference agreement is calculated.
            operator_names: Human-readable names for operators. Defaults to
                "Operator 1", "Operator 2", etc.
            collector: Optional explanation collector for Show Your Work.

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

        if collector:
            collector.input("n_operators", n_ops)
            collector.input("n_parts", n_parts)
            collector.input("n_replicates", n_reps)

        # --- Within-appraiser agreement ---
        # For each operator, % of parts where ALL replicates give same answer
        within_appraiser: dict[str, float] = {}
        for i in range(n_ops):
            agree_count = 0
            for j in range(n_parts):
                reps = ratings_3d[i][j]
                if len(set(reps)) == 1:
                    agree_count += 1
            pct = (agree_count / n_parts) * 100.0
            within_appraiser[operator_names[i]] = pct
            if collector:
                collector.step(
                    label=f"Within-appraiser agreement ({operator_names[i]})",
                    formula_latex=r"\%\text{agree} = \frac{\text{parts with all reps same}}{n_p} \times 100",
                    substitution_latex=r"\frac{" + str(agree_count) + r"}{" + str(n_parts) + r"} \times 100",
                    result=pct,
                )

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

        if collector:
            collector.step(
                label="Between-appraiser agreement",
                formula_latex=r"\%\text{between} = \frac{\text{parts where all operators agree}}{n_p} \times 100",
                substitution_latex=r"\frac{" + str(between_agree) + r"}{" + str(n_parts) + r"} \times 100",
                result=between_appraiser,
            )

        # --- Vs reference agreement ---
        vs_reference: dict[str, float] | None = None
        miss_rates: dict[str, float] | None = None
        false_alarm_rates: dict[str, float] | None = None
        effectiveness: float | None = None
        confusion_matrix: dict[str, dict[str, dict[str, int]]] | None = None
        if reference_decisions is not None:
            if len(reference_decisions) != n_parts:
                raise ValueError(
                    f"Reference decisions length ({len(reference_decisions)}) "
                    f"must match number of parts ({n_parts})"
                )
            vs_reference = {}
            miss_rates = {}
            false_alarm_rates = {}
            confusion_matrix = {}
            total_matches = 0

            # Discover all categories for confusion matrix
            all_categories = sorted(
                set(reference_decisions)
                | {mode_ratings[i][j] for i in range(n_ops) for j in range(n_parts)}
            )

            for i in range(n_ops):
                match_count = sum(
                    1 for j in range(n_parts) if mode_ratings[i][j] == reference_decisions[j]
                )
                vs_reference[operator_names[i]] = (match_count / n_parts) * 100.0
                total_matches += match_count

                # Confusion matrix: actual (reference) vs predicted (operator decision)
                cm: dict[str, dict[str, int]] = {
                    actual: {predicted: 0 for predicted in all_categories}
                    for actual in all_categories
                }
                for j in range(n_parts):
                    actual = reference_decisions[j]
                    predicted = mode_ratings[i][j]
                    cm[actual][predicted] += 1
                confusion_matrix[operator_names[i]] = cm

                # Miss rate: P(good | defective) - probability of calling it good when it's defective
                # False alarm rate: P(defective | good) - probability of calling it defective when good
                # We determine "defective" vs "good" based on the most common reference categories.
                # For binary attribute studies (pass/fail, accept/reject, good/defective),
                # we identify "defective" as the minority reference class.
                # For multi-category, compute per-category miss and false alarm.
                ref_counts: dict[str, int] = {}
                for j in range(n_parts):
                    ref_counts[reference_decisions[j]] = ref_counts.get(reference_decisions[j], 0) + 1

                if len(all_categories) == 2:
                    # Binary case: minority class = "defective"
                    sorted_cats = sorted(all_categories, key=lambda c: ref_counts.get(c, 0))
                    defective_cat = sorted_cats[0]
                    good_cat = sorted_cats[1]

                    # Miss rate: P(operator says good | reference is defective)
                    n_defective = ref_counts.get(defective_cat, 0)
                    n_good = ref_counts.get(good_cat, 0)
                    if n_defective > 0:
                        missed = cm[defective_cat].get(good_cat, 0)
                        miss_rates[operator_names[i]] = (missed / n_defective) * 100.0
                    else:
                        miss_rates[operator_names[i]] = 0.0

                    # False alarm rate: P(operator says defective | reference is good)
                    if n_good > 0:
                        false_alarms = cm[good_cat].get(defective_cat, 0)
                        false_alarm_rates[operator_names[i]] = (false_alarms / n_good) * 100.0
                    else:
                        false_alarm_rates[operator_names[i]] = 0.0
                else:
                    # Multi-category: overall misclassification rate as "miss rate"
                    misses = sum(1 for j in range(n_parts) if mode_ratings[i][j] != reference_decisions[j])
                    miss_rates[operator_names[i]] = (misses / n_parts) * 100.0
                    false_alarm_rates[operator_names[i]] = 0.0  # Not meaningful for multi-category

            # Effectiveness: overall % matching reference across all operators
            effectiveness = (total_matches / (n_ops * n_parts)) * 100.0

        # --- Cohen's Kappa (pairwise) ---
        cohens_kappa_pairs: dict[str, float] = {}
        for (i1, name1), (i2, name2) in combinations(enumerate(operator_names), 2):
            pair_label = f"{name1} vs {name2}"
            kappa = _cohens_kappa(
                mode_ratings[i1], mode_ratings[i2],
                collector=collector, pair_label=pair_label,
            )
            cohens_kappa_pairs[pair_label] = kappa

        # --- Fleiss' Kappa (multi-rater) ---
        # Build per-part list of mode ratings from all operators
        fleiss_matrix: list[list[str]] = []
        for j in range(n_parts):
            part_ratings = [mode_ratings[i][j] for i in range(n_ops)]
            fleiss_matrix.append(part_ratings)
        fleiss_k = _fleiss_kappa(fleiss_matrix, n_raters=n_ops, collector=collector)

        verdict = _build_verdict(fleiss_k)

        return AttributeMSAResult(
            within_appraiser=within_appraiser,
            between_appraiser=between_appraiser,
            vs_reference=vs_reference,
            cohens_kappa_pairs=cohens_kappa_pairs,
            fleiss_kappa=fleiss_k,
            verdict=verdict,
            miss_rates=miss_rates,
            false_alarm_rates=false_alarm_rates,
            effectiveness=effectiveness,
            confusion_matrix=confusion_matrix,
        )
