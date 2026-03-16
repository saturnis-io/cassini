"""Design of Experiments (DOE) engine and design generators."""
from cassini.core.doe.analysis import (
    ANOVAResult,
    ANOVARow,
    EffectResult,
    InteractionResult,
    RegressionResult,
    compute_anova,
    compute_interactions,
    compute_main_effects,
    compute_regression,
)
from cassini.core.doe.designs import (
    DesignResult,
    box_behnken,
    central_composite,
    coded_to_actual,
    fractional_factorial,
    full_factorial,
)
from cassini.core.doe.engine import DOEEngine
from cassini.core.doe.optimal import d_efficiency, d_optimal
from cassini.core.doe.taguchi import (
    ANOMFactorResult,
    ANOMResult,
    SNResult,
    compute_anom,
    compute_sn_ratio,
    taguchi,
)

__all__ = [
    "DOEEngine",
    # Designs
    "DesignResult",
    "full_factorial",
    "fractional_factorial",
    "central_composite",
    "box_behnken",
    "d_optimal",
    "d_efficiency",
    "taguchi",
    "coded_to_actual",
    # Analysis
    "EffectResult",
    "InteractionResult",
    "ANOVARow",
    "ANOVAResult",
    "RegressionResult",
    "compute_main_effects",
    "compute_interactions",
    "compute_anova",
    "compute_regression",
    # Taguchi
    "SNResult",
    "ANOMResult",
    "ANOMFactorResult",
    "compute_sn_ratio",
    "compute_anom",
]
