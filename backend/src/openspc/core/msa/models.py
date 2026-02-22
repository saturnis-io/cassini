"""MSA result dataclasses for Gage R&R and Attribute studies."""
from __future__ import annotations

from dataclasses import dataclass


# AIAG d2* constants table (MSA 4th Edition, Appendix C)
# Indexed by number of measurements in subgroup (m)
D2_STAR: dict[int, float] = {
    2: 1.128,
    3: 1.693,
    4: 2.059,
    5: 2.326,
    6: 2.534,
    7: 2.704,
    8: 2.847,
    9: 2.970,
    10: 3.078,
    15: 3.472,
    20: 3.735,
    25: 3.931,
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
