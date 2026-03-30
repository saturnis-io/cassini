"""
NIST and Textbook Reference Datasets for SPC Validation
=========================================================

Certified/published statistical results for validating Cassini's SPC engines.
All data sourced from public-domain NIST datasets, R qcc package (GPL-2),
and published textbook examples.

Sources:
    - NIST Statistical Reference Datasets (StRD): https://www.itl.nist.gov/div898/strd/
    - NIST/SEMATECH e-Handbook of Statistical Methods: https://www.itl.nist.gov/div898/handbook/
    - R qcc package v2.7 (Scrucca, 2004): https://github.com/luca-scr/qcc
    - Montgomery, D.C. "Introduction to Statistical Quality Control" (various editions)
"""

from __future__ import annotations

from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Certified value containers
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ControlLimitsCertified:
    """Published/certified control chart limits."""
    center_line: float
    ucl: float
    lcl: float


@dataclass(frozen=True)
class CapabilityCertified:
    """Published/certified capability indices."""
    cp: float
    cpk: float
    lsl: float
    usl: float
    target: float | None = None
    pp: float | None = None
    ppk: float | None = None
    cpm: float | None = None


@dataclass(frozen=True)
class SpecLimits:
    """Specification limits for a characteristic."""
    lsl: float
    usl: float
    target: float | None = None


# ---------------------------------------------------------------------------
# Dataset types
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class IndividualsDataset:
    """Reference dataset for I-MR (individuals) charts.

    For NIST StRD datasets, certified_mean/certified_std are the NIST-certified
    sample statistics (computed with ddof=1). These validate data integrity,
    NOT Cassini's MR-bar/d2 sigma estimator.

    For datasets with certified_i_chart/certified_mr_chart, those validate
    Cassini's calculate_imr_limits() output directly.
    """
    name: str
    source: str
    license: str
    values: tuple[float, ...]
    certified_mean: float
    certified_std: float
    certified_i_chart: ControlLimitsCertified | None = None
    certified_mr_chart: ControlLimitsCertified | None = None
    precision: int = 6  # significant digits for pytest.approx(rel=...)


@dataclass(frozen=True)
class SubgroupDataset:
    """Reference dataset for X-bar/R charts.

    subgroups is a tuple of tuples (immutable). phase1_count indicates
    how many subgroups from the start are Phase I (trial) data - certified
    values are always computed from Phase I data only.
    """
    name: str
    source: str
    license: str
    subgroups: tuple[tuple[float, ...], ...]
    subgroup_size: int
    certified_xbar_bar: float
    certified_r_bar: float
    certified_xbar_chart: ControlLimitsCertified
    certified_r_chart: ControlLimitsCertified
    spec_limits: SpecLimits | None = None
    certified_capability: CapabilityCertified | None = None
    phase1_count: int | None = None  # None = all subgroups are Phase I
    precision: int = 4  # significant digits

    @property
    def phase1_subgroups(self) -> tuple[tuple[float, ...], ...]:
        """Return only Phase I subgroups (for limit calculation)."""
        if self.phase1_count is None:
            return self.subgroups
        return self.subgroups[:self.phase1_count]


@dataclass(frozen=True)
class AttributeDataset:
    """Reference dataset for attribute charts (p, np, c, u).

    counts and sample_sizes are parallel tuples. For c-charts,
    sample_sizes should all be 1 (or the inspection unit count).
    phase1_count indicates Phase I boundary.
    """
    name: str
    source: str
    license: str
    chart_type: str  # "p", "np", "c", "u"
    counts: tuple[int, ...]
    sample_sizes: tuple[int, ...]
    certified_center: float
    certified_ucl: float
    certified_lcl: float
    phase1_count: int | None = None  # None = all samples are Phase I
    precision: int = 4  # significant digits

    @property
    def phase1_counts(self) -> tuple[int, ...]:
        """Return only Phase I defect counts."""
        if self.phase1_count is None:
            return self.counts
        return self.counts[:self.phase1_count]

    @property
    def phase1_sample_sizes(self) -> tuple[int, ...]:
        """Return only Phase I sample sizes."""
        if self.phase1_count is None:
            return self.sample_sizes
        return self.sample_sizes[:self.phase1_count]
