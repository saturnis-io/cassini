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


# ---------------------------------------------------------------------------
# NIST StRD Datasets (Public Domain, US Government)
# ---------------------------------------------------------------------------

NIST_MICHELSON = IndividualsDataset(
    name="NIST Michelson Speed of Light",
    source="NIST StRD: https://www.itl.nist.gov/div898/strd/univ/data/Michelso.dat",
    license="Public Domain (US Government)",
    values=(
        299.85, 299.74, 299.90, 300.07, 299.93,
        299.85, 299.95, 299.98, 299.98, 299.88,
        300.00, 299.98, 299.93, 299.65, 299.76,
        299.81, 300.00, 300.00, 299.96, 299.96,
        299.96, 299.94, 299.96, 299.94, 299.88,
        299.80, 299.85, 299.88, 299.90, 299.84,
        299.83, 299.79, 299.81, 299.88, 299.88,
        299.83, 299.80, 299.79, 299.76, 299.80,
        299.88, 299.88, 299.88, 299.86, 299.72,
        299.72, 299.62, 299.86, 299.97, 299.95,
        299.88, 299.91, 299.85, 299.87, 299.84,
        299.84, 299.85, 299.84, 299.84, 299.84,
        299.89, 299.81, 299.81, 299.82, 299.80,
        299.77, 299.76, 299.74, 299.75, 299.76,
        299.91, 299.92, 299.89, 299.86, 299.88,
        299.72, 299.84, 299.85, 299.85, 299.78,
        299.89, 299.84, 299.78, 299.81, 299.76,
        299.81, 299.79, 299.81, 299.82, 299.85,
        299.87, 299.87, 299.81, 299.74, 299.81,
        299.94, 299.95, 299.80, 299.81, 299.87,
    ),
    certified_mean=299.852400000000,
    certified_std=0.0790105478190518,
    precision=9,
)

NIST_MAVRO = IndividualsDataset(
    name="NIST Mavro Filter Transmittance",
    source="NIST StRD: https://www.itl.nist.gov/div898/strd/univ/data/Mavro.dat",
    license="Public Domain (US Government)",
    values=(
        2.00180, 2.00170, 2.00180, 2.00190, 2.00180,
        2.00170, 2.00150, 2.00140, 2.00150, 2.00150,
        2.00170, 2.00180, 2.00180, 2.00190, 2.00190,
        2.00210, 2.00200, 2.00160, 2.00140, 2.00130,
        2.00130, 2.00150, 2.00150, 2.00160, 2.00150,
        2.00140, 2.00130, 2.00140, 2.00150, 2.00140,
        2.00150, 2.00160, 2.00150, 2.00160, 2.00190,
        2.00200, 2.00200, 2.00210, 2.00220, 2.00230,
        2.00240, 2.00250, 2.00270, 2.00260, 2.00260,
        2.00260, 2.00270, 2.00260, 2.00250, 2.00240,
    ),
    certified_mean=2.00185600000000,
    certified_std=0.000429123454003053,
    precision=9,
)

NIST_LEW = IndividualsDataset(
    name="NIST Lew Beam Deflection",
    source="NIST StRD: https://www.itl.nist.gov/div898/strd/univ/data/Lew.dat",
    license="Public Domain (US Government)",
    values=(
        -213, -564,  -35,  -15,  141,  115, -420, -360,  203, -338,
        -431,  194, -220, -513,  154, -125, -559,   92,  -21, -579,
         -52,   99, -543, -175,  162, -457, -346,  204, -300, -474,
         164, -107, -572,   -8,   83, -541, -224,  180, -420, -374,
         201, -236, -531,   83,   27, -564, -112,  131, -507, -254,
         199, -311, -495,  143,  -46, -579,  -90,  136, -472, -338,
         202, -287, -477,  169, -124, -568,   17,   48, -568, -135,
         162, -430, -422,  172,  -74, -577,  -13,   92, -534, -243,
         194, -355, -465,  156,  -81, -578,  -64,  139, -449, -384,
         193, -198, -538,  110,  -44, -577,   -6,   66, -552, -164,
         161, -460, -344,  205, -281, -504,  134,  -28, -576, -118,
         156, -437, -381,  200, -220, -540,   83,   11, -568, -160,
         172, -414, -408,  188, -125, -572,  -32,  139, -492, -321,
         205, -262, -504,  142,  -83, -574,    0,   48, -571, -106,
         137, -501, -266,  190, -391, -406,  194, -186, -553,   83,
          -13, -577,  -49,  103, -515, -280,  201,  300, -506,  131,
          -45, -578,  -80,  138, -462, -361,  201, -211, -554,   32,
           74, -533, -235,  187, -372, -442,  182, -147, -566,   25,
           68, -535, -244,  194, -351, -463,  174, -125, -570,   15,
           72, -550, -190,  172, -424, -385,  198, -218, -536,   96,
    ),
    certified_mean=-177.435000000000,
    certified_std=277.332168044316,
    precision=9,
)

NIST_STRD_DATASETS = [NIST_MICHELSON, NIST_MAVRO, NIST_LEW]


# ---------------------------------------------------------------------------
# NIST/SEMATECH e-Handbook Datasets (Public Domain)
# ---------------------------------------------------------------------------

HANDBOOK_FLOWRATE = IndividualsDataset(
    name="NIST e-Handbook Flowrate I-MR",
    source="NIST/SEMATECH e-Handbook Section 6.3.2.2",
    license="Public Domain (US Government)",
    values=(49.6, 47.6, 49.9, 51.3, 47.8, 51.2, 52.6, 52.4, 53.6, 52.1),
    certified_mean=50.81,
    certified_std=1.8674,
    certified_i_chart=ControlLimitsCertified(
        center_line=50.81,
        ucl=55.8041,
        lcl=45.8159,
    ),
    certified_mr_chart=ControlLimitsCertified(
        center_line=1.8778,
        ucl=6.1349,
        lcl=0.0,
    ),
    precision=4,
)

HANDBOOK_WAFER_DEFECTS = AttributeDataset(
    name="NIST e-Handbook Wafer Defects C-chart",
    source="NIST/SEMATECH e-Handbook Section 6.3.3.1",
    license="Public Domain (US Government)",
    chart_type="c",
    counts=(16, 14, 28, 16, 12, 20, 10, 12, 10, 17, 19, 17, 14, 16, 15, 13, 14, 16, 11, 20, 11, 19, 16, 31, 13),
    sample_sizes=(1,) * 25,
    certified_center=16.0,
    certified_ucl=28.0,
    certified_lcl=4.0,
    precision=1,
)

HANDBOOK_P_CHART = AttributeDataset(
    name="NIST e-Handbook Wafer P-chart",
    source="NIST/SEMATECH e-Handbook Section 6.3.3.2",
    license="Public Domain (US Government)",
    chart_type="p",
    counts=(12, 15, 8, 10, 4, 7, 16, 9, 14, 10, 5, 6, 17, 12, 22, 8, 10, 5, 13, 11, 20, 18, 24, 15, 9, 12, 7, 13, 9, 6),
    sample_sizes=(50,) * 30,
    certified_center=0.2313,
    certified_ucl=0.4103,
    certified_lcl=0.0524,
    precision=4,
)

HANDBOOK_DATASETS: list[IndividualsDataset | AttributeDataset] = [
    HANDBOOK_FLOWRATE, HANDBOOK_WAFER_DEFECTS, HANDBOOK_P_CHART,
]


# ---------------------------------------------------------------------------
# Montgomery / qcc Subgroup Datasets
# ---------------------------------------------------------------------------

MONTGOMERY_PISTON_RINGS = SubgroupDataset(
    name="Montgomery Piston Rings",
    source="Montgomery ISQC 2nd ed pp 206-213; R qcc v2.7 pistonrings.txt",
    license="GPL-2 (qcc package)",
    subgroup_size=5,
    phase1_count=25,
    subgroups=(
        (74.030, 74.002, 74.019, 73.992, 74.008),
        (73.995, 73.992, 74.001, 74.011, 74.004),
        (73.988, 74.024, 74.021, 74.005, 74.002),
        (74.002, 73.996, 73.993, 74.015, 74.009),
        (73.992, 74.007, 74.015, 73.989, 74.014),
        (74.009, 73.994, 73.997, 73.985, 73.993),
        (73.995, 74.006, 73.994, 74.000, 74.005),
        (73.985, 74.003, 73.993, 74.015, 73.988),
        (74.008, 73.995, 74.009, 74.005, 74.004),
        (73.998, 74.000, 73.990, 74.007, 73.995),
        (73.994, 73.998, 73.994, 73.995, 73.990),
        (74.004, 74.000, 74.007, 74.000, 73.996),
        (73.983, 74.002, 73.998, 73.997, 74.012),
        (74.006, 73.967, 73.994, 74.000, 73.984),
        (74.012, 74.014, 73.998, 73.999, 74.007),
        (74.000, 73.984, 74.005, 73.998, 73.996),
        (73.994, 74.012, 73.986, 74.005, 74.007),
        (74.006, 74.010, 74.018, 74.003, 74.000),
        (73.984, 74.002, 74.003, 74.005, 73.997),
        (74.000, 74.010, 74.013, 74.020, 74.003),
        (73.988, 74.001, 74.009, 74.005, 73.996),
        (74.004, 73.999, 73.990, 74.006, 74.009),
        (74.010, 73.989, 73.990, 74.009, 74.014),
        (74.015, 74.008, 73.993, 74.000, 74.010),
        (73.982, 73.984, 73.995, 74.017, 74.013),
        (74.012, 74.015, 74.030, 73.986, 74.000),
        (73.995, 74.010, 73.990, 74.015, 74.001),
        (73.987, 73.999, 73.985, 74.000, 73.990),
        (74.008, 74.010, 74.003, 73.991, 74.006),
        (74.003, 74.000, 74.001, 73.986, 73.997),
        (73.994, 74.003, 74.015, 74.020, 74.004),
        (74.008, 74.002, 74.018, 73.995, 74.005),
        (74.001, 74.004, 73.990, 73.996, 73.998),
        (74.015, 74.000, 74.016, 74.025, 74.000),
        (74.030, 74.005, 74.000, 74.016, 74.012),
        (74.001, 73.990, 73.995, 74.010, 74.024),
        (74.015, 74.020, 74.024, 74.005, 74.019),
        (74.035, 74.010, 74.012, 74.015, 74.026),
        (74.017, 74.013, 74.036, 74.025, 74.026),
        (74.010, 74.005, 74.029, 74.000, 74.020),
    ),
    certified_xbar_bar=74.00118,
    certified_r_bar=0.02276,
    certified_xbar_chart=ControlLimitsCertified(
        center_line=74.00118,
        ucl=74.0143,
        lcl=73.98805,
    ),
    certified_r_chart=ControlLimitsCertified(
        center_line=0.02276,
        ucl=0.04812,
        lcl=0.0,
    ),
    spec_limits=SpecLimits(lsl=73.95, usl=74.05, target=74.000),
    certified_capability=CapabilityCertified(
        cp=1.70, cpk=1.66,
        lsl=73.95, usl=74.05, target=74.000,
    ),
    precision=4,
)

MONTGOMERY_HARD_BAKE = SubgroupDataset(
    name="Montgomery Hard Bake Flow Width",
    source="Montgomery ISQC, Table 6.1 (samples 1-25)",
    license="Fair use (textbook reference data)",
    subgroup_size=5,
    phase1_count=None,
    subgroups=(
        (1.3235, 1.4128, 1.6744, 1.4573, 1.6914),
        (1.4314, 1.3592, 1.6075, 1.4666, 1.6109),
        (1.4284, 1.4871, 1.4932, 1.4324, 1.5674),
        (1.5028, 1.6352, 1.3841, 1.2831, 1.5507),
        (1.5604, 1.2735, 1.5265, 1.4363, 1.6441),
        (1.5955, 1.5451, 1.3574, 1.3281, 1.4198),
        (1.6274, 1.5064, 1.8366, 1.4177, 1.5144),
        (1.4190, 1.4303, 1.6637, 1.6067, 1.5519),
        (1.3884, 1.7277, 1.5355, 1.5176, 1.3688),
        (1.4039, 1.6697, 1.5089, 1.4627, 1.5220),
        (1.4158, 1.7667, 1.4278, 1.5928, 1.4181),
        (1.5821, 1.3355, 1.5777, 1.3908, 1.7559),
        (1.2856, 1.4106, 1.4447, 1.6398, 1.1928),
        (1.4951, 1.4036, 1.5893, 1.6458, 1.4969),
        (1.3589, 1.2863, 1.5996, 1.2497, 1.5471),
        (1.5747, 1.5301, 1.5171, 1.1839, 1.8662),
        (1.3680, 1.7269, 1.3957, 1.5014, 1.4449),
        (1.4163, 1.3864, 1.3057, 1.6210, 1.5573),
        (1.5796, 1.4185, 1.6541, 1.5116, 1.7247),
        (1.7106, 1.4412, 1.2361, 1.3820, 1.7601),
        (1.4371, 1.5051, 1.3485, 1.5670, 1.4880),
        (1.4738, 1.5936, 1.6583, 1.4973, 1.4720),
        (1.5917, 1.4333, 1.5551, 1.5295, 1.6866),
        (1.6399, 1.5243, 1.5705, 1.5563, 1.5530),
        (1.5797, 1.3663, 1.6240, 1.3732, 1.6887),
    ),
    certified_xbar_bar=1.5056,
    certified_r_bar=0.32521,
    certified_xbar_chart=ControlLimitsCertified(
        center_line=1.5056,
        ucl=1.5056 + 0.577 * 0.32521,
        lcl=1.5056 - 0.577 * 0.32521,
    ),
    certified_r_chart=ControlLimitsCertified(
        center_line=0.32521,
        ucl=2.115 * 0.32521,
        lcl=0.0,
    ),
    spec_limits=SpecLimits(lsl=1.00, usl=2.00, target=1.50),
    precision=3,
)

SUBGROUP_DATASETS = [MONTGOMERY_PISTON_RINGS, MONTGOMERY_HARD_BAKE]
CAPABILITY_DATASETS = [MONTGOMERY_PISTON_RINGS]


# ---------------------------------------------------------------------------
# R qcc Package Datasets (GPL-2)
# ---------------------------------------------------------------------------

QCC_ORANGE_JUICE = AttributeDataset(
    name="qcc Orange Juice P-chart",
    source="Montgomery ISQC 2nd ed pp 152-155; R qcc v2.7 orangejuice.txt",
    license="GPL-2 (qcc package)",
    chart_type="p",
    counts=(
        12, 15, 8, 10, 4, 7, 16, 9, 14, 10,
        5, 6, 17, 12, 22, 8, 10, 5, 13, 11,
        20, 18, 24, 15, 9, 12, 7, 13, 9, 6,
        9, 6, 12, 5, 6, 4, 6, 3, 7, 6,
        2, 4, 3, 6, 5, 4, 8, 5, 6, 7,
        5, 6, 3, 5,
    ),
    sample_sizes=(50,) * 54,
    certified_center=0.2313333,
    certified_ucl=0.4102391,
    certified_lcl=0.05242755,
    phase1_count=30,
    precision=4,
)

QCC_CIRCUIT = AttributeDataset(
    name="qcc Circuit Board C-chart",
    source="Montgomery ISQC 2nd ed; R qcc v2.7 circuit.txt",
    license="GPL-2 (qcc package)",
    chart_type="c",
    counts=(
        21, 24, 16, 12, 15, 5, 28, 20, 31, 25,
        20, 24, 16, 19, 10, 17, 13, 22, 18, 39,
        30, 24, 16, 19, 17, 15,
        16, 18, 12, 15, 24, 21, 28, 20, 25, 19,
        18, 21, 16, 22, 19, 12, 14, 9, 16, 21,
    ),
    sample_sizes=(1,) * 46,
    certified_center=19.84615,
    certified_ucl=33.21086,
    certified_lcl=6.481447,
    phase1_count=26,
    precision=4,
)

QCC_DYED_CLOTH = AttributeDataset(
    name="qcc Dyed Cloth U-chart",
    source="R qcc v2.7 dyedcloth dataset",
    license="GPL-2 (qcc package)",
    chart_type="u",
    counts=(14, 12, 20, 11, 7, 10, 21, 16, 19, 23),
    sample_sizes=(10, 8, 13, 10, 10, 10, 12, 11, 12, 13),
    certified_center=1.40367,
    certified_ucl=2.48034,
    certified_lcl=0.32700,
    precision=3,
)


# ---------------------------------------------------------------------------
# Collection lists for parametrized tests
# ---------------------------------------------------------------------------

ATTRIBUTE_DATASETS = [
    HANDBOOK_WAFER_DEFECTS, HANDBOOK_P_CHART,
    QCC_ORANGE_JUICE, QCC_CIRCUIT, QCC_DYED_CLOTH,
]

IMR_DATASETS_WITH_LIMITS = [HANDBOOK_FLOWRATE]

ALL_INDIVIDUALS = [NIST_MICHELSON, NIST_MAVRO, NIST_LEW, HANDBOOK_FLOWRATE]

ALL_DATASETS = (
    NIST_STRD_DATASETS
    + list(HANDBOOK_DATASETS)
    + SUBGROUP_DATASETS
    + ATTRIBUTE_DATASETS
)
