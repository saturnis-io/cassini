"""Tests for MSA by-operator data and GRR% confidence interval."""
from __future__ import annotations

import math

import pytest

from cassini.core.msa.engine import GageRREngine, _compute_operator_data, _compute_grr_ci


# Fixture: simple balanced 3-operator, 5-part, 2-rep dataset
MEASUREMENTS_3D = [
    # Operator 0
    [
        [10.1, 10.2],  # Part 0
        [20.3, 20.1],  # Part 1
        [30.0, 30.2],  # Part 2
        [40.1, 40.0],  # Part 3
        [50.2, 50.1],  # Part 4
    ],
    # Operator 1
    [
        [10.3, 10.0],
        [20.2, 20.4],
        [30.1, 30.3],
        [40.3, 40.2],
        [50.0, 50.3],
    ],
    # Operator 2
    [
        [10.2, 10.1],
        [20.0, 20.3],
        [30.2, 30.0],
        [40.0, 40.1],
        [50.1, 50.0],
    ],
]

OPERATOR_NAMES = ["Alice", "Bob", "Charlie"]


class TestComputeOperatorData:
    def test_operator_data_basic(self):
        data = _compute_operator_data(MEASUREMENTS_3D, OPERATOR_NAMES)
        assert len(data) == 3
        assert data[0]["name"] == "Alice"
        assert data[1]["name"] == "Bob"
        assert data[2]["name"] == "Charlie"

    def test_operator_measurements_count(self):
        data = _compute_operator_data(MEASUREMENTS_3D, OPERATOR_NAMES)
        # 5 parts * 2 reps = 10 measurements per operator
        for op in data:
            assert len(op["measurements"]) == 10

    def test_operator_part_means(self):
        data = _compute_operator_data(MEASUREMENTS_3D, OPERATOR_NAMES)
        # Part 0 of Operator 0: mean of [10.1, 10.2] = 10.15
        assert abs(data[0]["part_means"][0] - 10.15) < 1e-10
        # Part 1 of Operator 0: mean of [20.3, 20.1] = 20.2
        assert abs(data[0]["part_means"][1] - 20.2) < 1e-10

    def test_operator_mean(self):
        data = _compute_operator_data(MEASUREMENTS_3D, OPERATOR_NAMES)
        # All measurements for operator 0
        all_vals = [v for part in MEASUREMENTS_3D[0] for v in part]
        expected_mean = sum(all_vals) / len(all_vals)
        assert abs(data[0]["mean"] - expected_mean) < 1e-10

    def test_operator_range(self):
        data = _compute_operator_data(MEASUREMENTS_3D, OPERATOR_NAMES)
        # Ranges for operator 0: [0.1, 0.2, 0.2, 0.1, 0.1], avg = 0.14
        ranges = [max(MEASUREMENTS_3D[0][j]) - min(MEASUREMENTS_3D[0][j]) for j in range(5)]
        expected_range = sum(ranges) / 5
        assert abs(data[0]["range"] - expected_range) < 1e-10

    def test_default_operator_names(self):
        data = _compute_operator_data(MEASUREMENTS_3D)
        assert data[0]["name"] == "Operator 1"
        assert data[1]["name"] == "Operator 2"
        assert data[2]["name"] == "Operator 3"


class TestGageRRWithOperatorData:
    def test_crossed_anova_includes_operator_data(self):
        engine = GageRREngine()
        result = engine.calculate_crossed_anova(
            MEASUREMENTS_3D, tolerance=50.0, operator_names=OPERATOR_NAMES,
        )
        assert result.operator_data is not None
        assert len(result.operator_data) == 3
        assert result.operator_data[0]["name"] == "Alice"
        assert len(result.operator_data[0]["measurements"]) == 10
        assert len(result.operator_data[0]["part_means"]) == 5

    def test_range_method_includes_operator_data(self):
        engine = GageRREngine()
        result = engine.calculate_range_method(
            MEASUREMENTS_3D, tolerance=50.0, operator_names=OPERATOR_NAMES,
        )
        assert result.operator_data is not None
        assert len(result.operator_data) == 3
        assert result.operator_data[1]["name"] == "Bob"

    def test_nested_anova_includes_operator_data(self):
        engine = GageRREngine()
        result = engine.calculate_nested_anova(
            MEASUREMENTS_3D, tolerance=50.0, operator_names=OPERATOR_NAMES,
        )
        assert result.operator_data is not None
        assert len(result.operator_data) == 3
        assert result.operator_data[2]["name"] == "Charlie"


class TestGRRConfidenceInterval:
    def test_ci_present_for_crossed_anova(self):
        engine = GageRREngine()
        result = engine.calculate_crossed_anova(
            MEASUREMENTS_3D, tolerance=50.0, operator_names=OPERATOR_NAMES,
        )
        # CI should be computed since we have ANOVA table
        assert result.grr_ci_lower is not None
        assert result.grr_ci_upper is not None
        assert result.grr_ci_df is not None

    def test_ci_lower_less_than_upper(self):
        engine = GageRREngine()
        result = engine.calculate_crossed_anova(
            MEASUREMENTS_3D, tolerance=50.0, operator_names=OPERATOR_NAMES,
        )
        if result.grr_ci_lower is not None and result.grr_ci_upper is not None:
            assert result.grr_ci_lower < result.grr_ci_upper

    def test_ci_contains_point_estimate(self):
        engine = GageRREngine()
        result = engine.calculate_crossed_anova(
            MEASUREMENTS_3D, tolerance=50.0, operator_names=OPERATOR_NAMES,
        )
        if result.grr_ci_lower is not None and result.grr_ci_upper is not None:
            assert result.grr_ci_lower <= result.pct_study_grr
            assert result.pct_study_grr <= result.grr_ci_upper

    def test_ci_none_for_range_method(self):
        engine = GageRREngine()
        result = engine.calculate_range_method(
            MEASUREMENTS_3D, tolerance=50.0, operator_names=OPERATOR_NAMES,
        )
        # Range method has no ANOVA table, so CI should be None
        assert result.grr_ci_lower is None
        assert result.grr_ci_upper is None

    def test_ci_positive_df(self):
        engine = GageRREngine()
        result = engine.calculate_crossed_anova(
            MEASUREMENTS_3D, tolerance=50.0, operator_names=OPERATOR_NAMES,
        )
        if result.grr_ci_df is not None:
            assert result.grr_ci_df > 0

    def test_ci_values_positive(self):
        engine = GageRREngine()
        result = engine.calculate_crossed_anova(
            MEASUREMENTS_3D, tolerance=50.0, operator_names=OPERATOR_NAMES,
        )
        if result.grr_ci_lower is not None:
            assert result.grr_ci_lower > 0
        if result.grr_ci_upper is not None:
            assert result.grr_ci_upper > 0


class TestGRRCIDirectFunction:
    def test_returns_none_for_no_anova_table(self):
        lower, upper, df = _compute_grr_ci(
            sigma2_grr=0.01,
            anova_table=None,
            sigma2_equipment=0.005,
            sigma2_operator=0.003,
            sigma2_interaction=0.002,
            total_variation=1.0,
            n_ops=3,
            n_parts=5,
            n_reps=2,
            interaction_significant=True,
        )
        assert lower is None
        assert upper is None
        assert df is None

    def test_returns_none_for_zero_grr(self):
        lower, upper, df = _compute_grr_ci(
            sigma2_grr=0.0,
            anova_table={"equipment": {"MS": 0.0, "df": 20}, "operator": {"MS": 0.0, "df": 2}, "interaction": {"MS": 0.0, "df": 8}},
            sigma2_equipment=0.0,
            sigma2_operator=0.0,
            sigma2_interaction=0.0,
            total_variation=1.0,
            n_ops=3,
            n_parts=5,
            n_reps=2,
            interaction_significant=True,
        )
        assert lower is None
        assert upper is None

    def test_returns_values_for_valid_input(self):
        lower, upper, df = _compute_grr_ci(
            sigma2_grr=0.05,
            anova_table={
                "equipment": {"MS": 0.02, "df": 20},
                "operator": {"MS": 0.10, "df": 2},
                "interaction": {"MS": 0.04, "df": 8},
            },
            sigma2_equipment=0.02,
            sigma2_operator=0.02,
            sigma2_interaction=0.01,
            total_variation=1.0,
            n_ops=3,
            n_parts=5,
            n_reps=2,
            interaction_significant=True,
        )
        assert lower is not None
        assert upper is not None
        assert df is not None
        assert lower < upper
        assert df > 0
