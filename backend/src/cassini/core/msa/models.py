"""MSA result dataclasses for Gage R&R and Attribute studies."""
from __future__ import annotations

from dataclasses import dataclass, field


# AIAG d2* constants table (MSA 4th Edition, Appendix C)
# 2D lookup: d2_star(m, g) where m = subgroup size, g = number of subgroups
# For large g (>=25), d2* approaches d2 (the standard control chart constant)
# g=1 values are critical for Range Method AV (K1) and PV (K3) calculations
D2_STAR_TABLE: dict[int, dict[int, float]] = {
    # m: {g: d2*}
    2:  {1: 1.414, 2: 1.279, 3: 1.231, 4: 1.206, 5: 1.191, 6: 1.181, 7: 1.173, 8: 1.168, 9: 1.163, 10: 1.160, 15: 1.149, 20: 1.143, 25: 1.140, 50: 1.134, 100: 1.131},
    3:  {1: 1.912, 2: 1.806, 3: 1.768, 4: 1.749, 5: 1.738, 6: 1.731, 7: 1.726, 8: 1.722, 9: 1.719, 10: 1.716, 15: 1.709, 20: 1.704, 25: 1.702, 50: 1.698, 100: 1.696},
    4:  {1: 2.239, 2: 2.151, 3: 2.120, 4: 2.104, 5: 2.095, 6: 2.089, 7: 2.085, 8: 2.082, 9: 2.079, 10: 2.077, 15: 2.071, 20: 2.067, 25: 2.065, 50: 2.062, 100: 2.060},
    5:  {1: 2.481, 2: 2.405, 3: 2.379, 4: 2.366, 5: 2.357, 6: 2.352, 7: 2.349, 8: 2.346, 9: 2.344, 10: 2.342, 15: 2.337, 20: 2.334, 25: 2.332, 50: 2.329, 100: 2.327},
    6:  {1: 2.673, 2: 2.604, 3: 2.582, 4: 2.570, 5: 2.563, 6: 2.558, 7: 2.555, 8: 2.553, 9: 2.551, 10: 2.549, 15: 2.544, 20: 2.541, 25: 2.539, 50: 2.537, 100: 2.535},
    7:  {1: 2.830, 2: 2.768, 3: 2.748, 4: 2.738, 5: 2.731, 6: 2.727, 7: 2.724, 8: 2.722, 9: 2.720, 10: 2.719, 15: 2.714, 20: 2.711, 25: 2.710, 50: 2.707, 100: 2.706},
    8:  {1: 2.963, 2: 2.905, 3: 2.887, 4: 2.878, 5: 2.872, 6: 2.869, 7: 2.866, 8: 2.864, 9: 2.863, 10: 2.861, 15: 2.857, 20: 2.854, 25: 2.853, 50: 2.850, 100: 2.849},
    9:  {1: 3.078, 2: 3.023, 3: 3.007, 4: 2.998, 5: 2.993, 6: 2.990, 7: 2.987, 8: 2.985, 9: 2.984, 10: 2.983, 15: 2.979, 20: 2.976, 25: 2.975, 50: 2.973, 100: 2.972},
    10: {1: 3.179, 2: 3.127, 3: 3.112, 4: 3.104, 5: 3.099, 6: 3.096, 7: 3.093, 8: 3.092, 9: 3.090, 10: 3.089, 15: 3.086, 20: 3.083, 25: 3.082, 50: 3.080, 100: 3.079},
}

# Convenience: d2 values for large g (g → infinity, standard control chart constants)
D2_STAR: dict[int, float] = {
    2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 6: 2.534, 7: 2.704,
    8: 2.847, 9: 2.970, 10: 3.078, 15: 3.472, 20: 3.735, 25: 3.931,
}


@dataclass
class GageRRResult:
    """Result of a Gage R&R (variable) MSA study."""

    method: str  # "crossed_anova" | "range" | "nested_anova"

    # Variance components (standard deviations)
    repeatability_ev: float
    reproducibility_av: float
    interaction: float | None
    gage_rr: float
    part_variation: float
    total_variation: float

    # %Contribution (variance-based, sums to 100%)
    pct_contribution_ev: float
    pct_contribution_av: float
    pct_contribution_interaction: float | None
    pct_contribution_grr: float
    pct_contribution_pv: float

    # %Study Variation (5.15-sigma-based)
    pct_study_ev: float
    pct_study_av: float
    pct_study_grr: float
    pct_study_pv: float

    # Tolerance-based
    pct_tolerance_grr: float | None

    # Number of distinct categories
    ndc: int

    # ANOVA table (crossed method only)
    anova_table: dict | None

    # Verdict
    verdict: str  # "acceptable" | "marginal" | "unacceptable"

    # Per-operator data for by-operator charts (optional, populated by engine)
    operator_data: list[dict] | None = None

    # GRR% confidence interval (Satterthwaite approximation)
    grr_ci_lower: float | None = None
    grr_ci_upper: float | None = None
    grr_ci_df: float | None = None


@dataclass
class AttributeMSAResult:
    """Result of an Attribute MSA study (Kappa analysis)."""

    # Per-appraiser agreement
    within_appraiser: dict[str, float]  # operator_name -> % agreement
    between_appraiser: float  # % all-operators-agree

    # Vs reference (only if reference decisions provided)
    vs_reference: dict[str, float] | None  # operator -> % vs known correct

    # Kappa statistics
    cohens_kappa_pairs: dict[str, float]  # "Op-A vs Op-B" -> kappa
    fleiss_kappa: float

    # Verdict
    verdict: str  # "acceptable" | "marginal" | "unacceptable"

    # Per-operator miss/false alarm rates (only when reference_decisions provided)
    miss_rates: dict[str, float] | None = None  # operator -> P(good|defective)
    false_alarm_rates: dict[str, float] | None = None  # operator -> P(defective|good)
    effectiveness: float | None = None  # overall % matching reference

    # Confusion matrix: {operator_name: {actual: {predicted: count}}}
    confusion_matrix: dict[str, dict[str, dict[str, int]]] | None = None

    # Binary studies only: which category was identified as "defective".
    # Heuristic: the minority reference class is assumed to be defective.
    # Users should verify this matches their domain expectation and
    # interpret miss_rates / false_alarm_rates accordingly.
    defective_category: str | None = None
