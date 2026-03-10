"""Explanation capture for the "Show Your Work" transparency feature.

PURPOSE:
    Provides the ExplanationCollector pattern for capturing statistical
    computation steps (formulas, substitutions, intermediate results)
    inline within engine functions. This enables regulated-industry users
    to see EXACTLY how every displayed value was computed, satisfying
    audit requirements for computational transparency.

STANDARDS:
    - FDA 21 CFR Part 11: Electronic records and electronic signatures --
      requires ability to demonstrate computational integrity
    - IATF 16949 (automotive): Process capability reporting must be
      verifiable by auditors
    - ISO 22514-2:2017: Capability calculations must be traceable to
      published formulas

ARCHITECTURE:
    The ExplanationCollector uses a "null object" pattern: engine functions
    accept an optional collector parameter. When None (the default), the
    `if collector:` guards short-circuit with negligible overhead (a single
    boolean check per formula step). When provided, the collector accumulates:
      - inputs: Named input values (n, x-bar, sigma, USL, LSL, etc.)
      - steps: Formula steps with LaTeX notation, numeric substitution,
        computed result, and optional notes/references
      - warnings: Advisory messages (e.g., "subgroup info not provided")

    The collected data is serialized to the API response by the explain
    endpoint (api/v1/explain.py), where the frontend renders it using
    KaTeX in the ExplanationPanel slide-out component.

KEY DECISIONS:
    - Zero-cost when not used: No allocations, no string formatting,
      no LaTeX construction unless collector is explicitly provided.
      This is critical because the engine processes thousands of samples
      per second in production.
    - LaTeX formulas are embedded as raw strings in the engine code
      (not in a separate template file) to keep the formula co-located
      with the computation it describes. If the formula and code diverge,
      the proximity makes the discrepancy obvious during code review.
    - Citation objects are defined as module-level constants for reuse
      across multiple API endpoints.

CITATION REGISTRY:
    CAPABILITY_CITATION: AIAG SPC Manual, 2nd Ed., Chapter 3
    MSA_CITATION: AIAG MSA Manual, 4th Ed., Chapter 3
    ATTRIBUTE_MSA_CITATION: AIAG MSA Manual, 4th Ed., Chapter 5
    NORMALITY_CITATION: ISO 11462-1:2001, Shapiro-Wilk Test
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ExplanationStep:
    """One step in a computation breakdown."""

    label: str
    formula_latex: str
    substitution_latex: str
    result: float
    note: str | None = None


@dataclass
class Citation:
    """Reference to an industry standard."""

    standard: str
    reference: str
    section: str | None = None


@dataclass
class Explanation:
    """Complete explanation of a computed metric."""

    metric: str
    display_name: str
    value: float
    formula_latex: str
    steps: list[ExplanationStep] = field(default_factory=list)
    inputs: dict[str, float | str] = field(default_factory=dict)
    citation: Citation | None = None
    method: str | None = None
    warnings: list[str] = field(default_factory=list)


class ExplanationCollector:
    """Captures computation steps when active. Zero cost when not used.

    This implements a "passive observer" pattern: engine functions call
    collector.step() and collector.input() at each computation step, but
    ONLY when a collector instance is provided. The collector never
    influences the computation -- it is strictly read-only observation.

    The accumulated steps form a complete audit trail of how a statistical
    value was computed, including:
      - The formula (in LaTeX for rendering)
      - The numeric substitution (actual values plugged in)
      - The computed result
      - Optional notes and standard references

    Usage in engine functions::

        def calculate_cpk(data, usl, lsl, collector=None):
            mean = np.mean(data)
            if collector:
                collector.input("x-bar", round(float(mean), 4))
            sigma = estimate_sigma_rbar(ranges, n)
            if collector:
                collector.step(
                    label="sigma (Process Sigma)",
                    formula_latex=r"\\sigma = \\frac{\\bar{R}}{d_2}",
                    substitution_latex=r"\\sigma = \\frac{2.5}{2.326}",
                    result=sigma,
                    note="Ref: AIAG SPC Manual, 2nd Ed., Chapter II",
                )
    """

    def __init__(self) -> None:
        self.steps: list[ExplanationStep] = []
        self.inputs: dict[str, float | str] = {}
        self._warnings: list[str] = []

    def step(
        self,
        label: str,
        formula_latex: str,
        substitution_latex: str,
        result: float,
        note: str | None = None,
    ) -> None:
        self.steps.append(
            ExplanationStep(
                label=label,
                formula_latex=formula_latex,
                substitution_latex=substitution_latex,
                result=round(result, 6),
                note=note,
            )
        )

    def input(self, name: str, value: float | str) -> None:
        self.inputs[name] = value

    def warn(self, message: str) -> None:
        self._warnings.append(message)

    @property
    def warnings(self) -> list[str]:
        return self._warnings


# Citation registry — standard references per metric family
CAPABILITY_CITATION = Citation(
    standard="AIAG",
    reference="AIAG SPC Manual, 2nd Edition",
    section="Chapter 3: Control Chart Analysis",
)

MSA_CITATION = Citation(
    standard="AIAG",
    reference="AIAG MSA Manual, 4th Edition",
    section="Chapter 3: Gage R&R Studies",
)

ATTRIBUTE_MSA_CITATION = Citation(
    standard="AIAG",
    reference="AIAG MSA Manual, 4th Edition",
    section="Chapter 5: Attribute Measurement Systems",
)

NORMALITY_CITATION = Citation(
    standard="ISO",
    reference="ISO 11462-1:2001",
    section="Shapiro-Wilk Test",
)
