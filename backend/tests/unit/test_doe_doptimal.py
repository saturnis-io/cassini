"""Tests for D-Optimal design generation via coordinate-exchange.

Verifies the coordinate-exchange algorithm (Meyer & Nachtsheim, 1995),
model matrix construction, D-efficiency computation, input validation,
and integration with the engine dispatch.
"""
from __future__ import annotations

import numpy as np
import pytest

from cassini.core.doe.optimal import (
    _build_model_matrix,
    _count_model_params,
    d_efficiency,
    d_optimal,
)


# ---------------------------------------------------------------------------
# Model matrix construction
# ---------------------------------------------------------------------------


class TestBuildModelMatrix:
    """Verify model matrix construction for different model orders."""

    def test_linear_model_matrix_shape(self):
        """Linear model: intercept + k main effects = k+1 columns."""
        design = np.array([[-1, -1], [1, -1], [-1, 1], [1, 1]], dtype=float)
        X = _build_model_matrix(design, "linear")
        assert X.shape == (4, 3)  # intercept + 2 main effects

    def test_interaction_model_matrix_shape(self):
        """Interaction model: intercept + k + C(k,2) columns."""
        design = np.array([[-1, -1], [1, -1], [-1, 1], [1, 1]], dtype=float)
        X = _build_model_matrix(design, "interaction")
        assert X.shape == (4, 4)  # intercept + 2 main + 1 interaction

    def test_quadratic_model_matrix_shape(self):
        """Quadratic model: intercept + k + C(k,2) + k columns."""
        design = np.array([[-1, -1], [1, -1], [-1, 1], [1, 1]], dtype=float)
        X = _build_model_matrix(design, "quadratic")
        assert X.shape == (4, 6)  # intercept + 2 main + 1 interaction + 2 quadratic

    def test_3_factor_interaction_shape(self):
        """3 factors interaction: 1 + 3 + 3 = 7 columns."""
        design = np.random.default_rng(42).uniform(-1, 1, (10, 3))
        X = _build_model_matrix(design, "interaction")
        assert X.shape == (10, 7)

    def test_3_factor_quadratic_shape(self):
        """3 factors quadratic: 1 + 3 + 3 + 3 = 10 columns."""
        design = np.random.default_rng(42).uniform(-1, 1, (10, 3))
        X = _build_model_matrix(design, "quadratic")
        assert X.shape == (10, 10)

    def test_intercept_column_is_ones(self):
        """First column of model matrix should be all ones (intercept)."""
        design = np.random.default_rng(42).uniform(-1, 1, (8, 3))
        X = _build_model_matrix(design, "linear")
        np.testing.assert_array_equal(X[:, 0], np.ones(8))

    def test_invalid_model_order_raises(self):
        """Should raise ValueError for unrecognized model_order."""
        design = np.array([[-1, -1], [1, 1]], dtype=float)
        with pytest.raises(ValueError, match="model_order"):
            _build_model_matrix(design, "cubic")


class TestCountModelParams:
    """Verify parameter count computation."""

    def test_linear_2_factors(self):
        assert _count_model_params(2, "linear") == 3

    def test_linear_5_factors(self):
        assert _count_model_params(5, "linear") == 6

    def test_interaction_3_factors(self):
        # 1 + 3 + C(3,2) = 1 + 3 + 3 = 7
        assert _count_model_params(3, "interaction") == 7

    def test_quadratic_3_factors(self):
        # 1 + 3 + C(3,2) + 3 = 1 + 3 + 3 + 3 = 10
        assert _count_model_params(3, "quadratic") == 10

    def test_quadratic_2_factors(self):
        # 1 + 2 + C(2,2) + 2 = 1 + 2 + 1 + 2 = 6
        assert _count_model_params(2, "quadratic") == 6


# ---------------------------------------------------------------------------
# D-Optimal design generation
# ---------------------------------------------------------------------------


class TestDOptimalBasic:
    """Verify basic D-optimal design generation."""

    def test_produces_correct_shape(self):
        """Design matrix should have shape (n_runs, n_factors)."""
        result = d_optimal(n_factors=3, n_runs=10, seed=42)
        assert result.coded_matrix.shape == (10, 3)
        assert result.n_runs == 10
        assert result.n_factors == 3

    def test_design_type_label(self):
        result = d_optimal(n_factors=2, n_runs=6, seed=42)
        assert result.design_type == "d_optimal"

    def test_values_within_range(self):
        """All values should be within [-1, 1] for default factor ranges."""
        result = d_optimal(n_factors=3, n_runs=12, seed=42)
        assert np.all(result.coded_matrix >= -1.0)
        assert np.all(result.coded_matrix <= 1.0)

    def test_custom_factor_ranges(self):
        """Values should respect custom factor ranges."""
        ranges = [(0.0, 10.0), (100.0, 200.0)]
        result = d_optimal(
            n_factors=2, n_runs=8, factor_ranges=ranges, seed=42
        )
        assert np.all(result.coded_matrix[:, 0] >= 0.0)
        assert np.all(result.coded_matrix[:, 0] <= 10.0)
        assert np.all(result.coded_matrix[:, 1] >= 100.0)
        assert np.all(result.coded_matrix[:, 1] <= 200.0)

    def test_standard_order_sequential(self):
        result = d_optimal(n_factors=2, n_runs=6, seed=42)
        assert result.standard_order == list(range(1, 7))

    def test_no_center_points(self):
        result = d_optimal(n_factors=2, n_runs=6, seed=42)
        assert all(not cp for cp in result.is_center_point)

    def test_run_order_length(self):
        result = d_optimal(n_factors=2, n_runs=6, seed=42)
        assert len(result.run_order) == 6
        assert len(result.standard_order) == 6
        assert len(result.is_center_point) == 6


class TestDOptimalDeterminism:
    """Verify seed-based reproducibility."""

    def test_same_seed_same_design(self):
        r1 = d_optimal(n_factors=3, n_runs=10, seed=42)
        r2 = d_optimal(n_factors=3, n_runs=10, seed=42)
        np.testing.assert_array_equal(r1.coded_matrix, r2.coded_matrix)

    def test_different_seeds_different_designs(self):
        r1 = d_optimal(n_factors=3, n_runs=10, seed=42)
        r2 = d_optimal(n_factors=3, n_runs=10, seed=99)
        # Not guaranteed but overwhelmingly likely
        assert not np.array_equal(r1.coded_matrix, r2.coded_matrix)


class TestDOptimalModelOrders:
    """Verify D-optimal works with different model orders."""

    def test_linear_model(self):
        result = d_optimal(n_factors=3, n_runs=6, model_order="linear", seed=42)
        assert result.n_runs == 6

    def test_interaction_model(self):
        # 3 factors interaction: p=7, need at least 7 runs
        result = d_optimal(
            n_factors=3, n_runs=10, model_order="interaction", seed=42
        )
        assert result.n_runs == 10

    def test_quadratic_model(self):
        # 3 factors quadratic: p=10, need at least 10 runs
        result = d_optimal(
            n_factors=3, n_runs=12, model_order="quadratic", seed=42
        )
        assert result.n_runs == 12


class TestDOptimalQuality:
    """Verify the quality of the generated design."""

    def test_information_matrix_is_nonsingular(self):
        """X'X should be nonsingular (positive determinant)."""
        result = d_optimal(n_factors=3, n_runs=10, seed=42)
        X = _build_model_matrix(result.coded_matrix, "linear")
        det = np.linalg.det(X.T @ X)
        assert det > 0

    def test_d_efficiency_positive(self):
        """D-efficiency should be positive for a valid design."""
        result = d_optimal(n_factors=3, n_runs=10, seed=42)
        eff = d_efficiency(result.coded_matrix, "linear")
        assert eff > 0

    def test_d_optimal_beats_random(self):
        """D-optimal design should have higher |X'X| than random."""
        rng = np.random.default_rng(42)
        random_design = rng.uniform(-1, 1, (10, 3))
        optimal = d_optimal(n_factors=3, n_runs=10, seed=42)

        X_random = _build_model_matrix(random_design, "linear")
        X_optimal = _build_model_matrix(optimal.coded_matrix, "linear")

        det_random = np.linalg.det(X_random.T @ X_random)
        det_optimal = np.linalg.det(X_optimal.T @ X_optimal)

        assert det_optimal >= det_random

    def test_interaction_model_nonsingular(self):
        """Interaction model should also be nonsingular."""
        result = d_optimal(
            n_factors=3, n_runs=10, model_order="interaction", seed=42
        )
        X = _build_model_matrix(result.coded_matrix, "interaction")
        det = np.linalg.det(X.T @ X)
        assert det > 0

    def test_quadratic_model_nonsingular(self):
        """Quadratic model should be nonsingular with enough runs."""
        result = d_optimal(
            n_factors=2, n_runs=10, model_order="quadratic", seed=42
        )
        X = _build_model_matrix(result.coded_matrix, "quadratic")
        det = np.linalg.det(X.T @ X)
        assert det > 0


# ---------------------------------------------------------------------------
# D-Efficiency
# ---------------------------------------------------------------------------


class TestDEfficiency:
    """Verify D-efficiency computation."""

    def test_efficiency_in_valid_range(self):
        """D-efficiency should be non-negative."""
        result = d_optimal(n_factors=2, n_runs=6, seed=42)
        eff = d_efficiency(result.coded_matrix, "linear")
        assert eff >= 0

    def test_orthogonal_design_high_efficiency(self):
        """Full factorial should have high D-efficiency for linear model."""
        # 2^2 full factorial
        design = np.array([[-1, -1], [1, -1], [-1, 1], [1, 1]], dtype=float)
        eff = d_efficiency(design, "linear")
        assert eff > 0.5  # Should be good for orthogonal design

    def test_singular_design_zero_efficiency(self):
        """Singular design should have zero D-efficiency."""
        design = np.array([[1, 0], [1, 0], [1, 0]], dtype=float)
        eff = d_efficiency(design, "linear")
        assert eff == 0.0


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


class TestDOptimalValidation:
    """Verify input validation."""

    def test_rejects_zero_factors(self):
        with pytest.raises(ValueError, match="n_factors must be >= 1"):
            d_optimal(n_factors=0, n_runs=5)

    def test_rejects_negative_factors(self):
        with pytest.raises(ValueError, match="n_factors must be >= 1"):
            d_optimal(n_factors=-1, n_runs=5)

    def test_rejects_insufficient_runs_linear(self):
        """n_runs must be >= p (3 for 2 factors linear)."""
        with pytest.raises(ValueError, match="n_runs.*must be >= number of model parameters"):
            d_optimal(n_factors=2, n_runs=2, model_order="linear")

    def test_rejects_insufficient_runs_quadratic(self):
        """n_runs must be >= p (6 for 2 factors quadratic)."""
        with pytest.raises(ValueError, match="n_runs.*must be >= number of model parameters"):
            d_optimal(n_factors=2, n_runs=4, model_order="quadratic")

    def test_rejects_invalid_model_order(self):
        with pytest.raises(ValueError, match="model_order"):
            d_optimal(n_factors=2, n_runs=5, model_order="cubic")

    def test_rejects_mismatched_factor_ranges(self):
        with pytest.raises(ValueError, match="factor_ranges length"):
            d_optimal(
                n_factors=3,
                n_runs=6,
                factor_ranges=[(-1, 1), (-1, 1)],
            )

    def test_rejects_inverted_factor_range(self):
        with pytest.raises(ValueError, match="low.*must be less than high"):
            d_optimal(
                n_factors=2,
                n_runs=6,
                factor_ranges=[(1, -1), (-1, 1)],
            )

    def test_rejects_zero_n_starts(self):
        with pytest.raises(ValueError, match="n_starts must be >= 1"):
            d_optimal(n_factors=2, n_runs=6, n_starts=0)

    def test_minimum_runs_equals_params_accepted(self):
        """Should accept n_runs exactly equal to p."""
        # 2 factors linear: p=3, n_runs=3 should work
        result = d_optimal(n_factors=2, n_runs=3, model_order="linear", seed=42)
        assert result.n_runs == 3


# ---------------------------------------------------------------------------
# Engine dispatch integration
# ---------------------------------------------------------------------------


class TestDOptimalDispatch:
    """Verify D-optimal integrates with engine dispatch."""

    def test_dispatch_table_has_d_optimal(self):
        from cassini.core.doe.engine import _DESIGN_DISPATCH
        assert "d_optimal" in _DESIGN_DISPATCH

    def test_call_generator_d_optimal(self):
        from cassini.core.doe.engine import DOEEngine
        result = DOEEngine._call_generator(
            "d_optimal", 3, None, 42,
            n_runs=10, model_order="linear",
        )
        assert result.design_type == "d_optimal"
        assert result.n_runs == 10
        assert result.n_factors == 3

    def test_call_generator_d_optimal_requires_n_runs(self):
        from cassini.core.doe.engine import DOEEngine
        with pytest.raises(ValueError, match="n_runs"):
            DOEEngine._call_generator("d_optimal", 3, None, 42)

    def test_call_generator_d_optimal_with_factor_ranges(self):
        from cassini.core.doe.engine import DOEEngine
        result = DOEEngine._call_generator(
            "d_optimal", 2, None, 42,
            n_runs=8,
            model_order="interaction",
            factor_ranges=[(-1.0, 1.0), (-1.0, 1.0)],
        )
        assert result.n_runs == 8
        assert result.n_factors == 2


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


class TestDOptimalSchema:
    """Verify DOEStudyCreate schema validation for d_optimal."""

    def test_d_optimal_requires_n_runs(self):
        from cassini.api.schemas.doe import DOEStudyCreate
        with pytest.raises(Exception, match="n_runs"):
            DOEStudyCreate(
                name="Test",
                plant_id=1,
                design_type="d_optimal",
                factors=[
                    {"name": "A", "low_level": -1, "high_level": 1},
                    {"name": "B", "low_level": -1, "high_level": 1},
                ],
            )

    def test_d_optimal_validates_min_runs(self):
        from cassini.api.schemas.doe import DOEStudyCreate
        with pytest.raises(Exception, match="at least"):
            DOEStudyCreate(
                name="Test",
                plant_id=1,
                design_type="d_optimal",
                n_runs=2,
                model_order="linear",
                factors=[
                    {"name": "A", "low_level": -1, "high_level": 1},
                    {"name": "B", "low_level": -1, "high_level": 1},
                ],
            )

    def test_d_optimal_accepts_valid_config(self):
        from cassini.api.schemas.doe import DOEStudyCreate
        study = DOEStudyCreate(
            name="Test D-Optimal",
            plant_id=1,
            design_type="d_optimal",
            n_runs=10,
            model_order="linear",
            factors=[
                {"name": "A", "low_level": -1, "high_level": 1},
                {"name": "B", "low_level": -1, "high_level": 1},
                {"name": "C", "low_level": -1, "high_level": 1},
            ],
        )
        assert study.n_runs == 10
        assert study.model_order == "linear"
        assert study.design_type == "d_optimal"
