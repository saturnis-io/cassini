"""Explanation capture for Show Your Work feature.

The ExplanationCollector captures computation steps inline within existing
engine functions. When None is passed (the default), zero overhead — just
`if collector:` checks which cost nanoseconds vs the numpy/scipy operations.
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

    Usage in engine functions:
        def calculate_cpk(data, usl, lsl, collector=None):
            mean = np.mean(data)
            if collector:
                collector.input("x\u0304", round(float(mean), 4))
            ...
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
