"""Tests for Taguchi orthogonal arrays, S/N ratios, and ANOM analysis.

Verifies OA construction, factor selection, S/N ratio computations for all
four variants, ANOM analysis, edge cases, and integration with the design
dispatch.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from cassini.core.doe.taguchi import (
    ANOMResult,
    SNResult,
    _L4,
    _L8,
    _L9,
    _L12,
    _L16,
    _L18,
    _L27,
    _SN_CAP_DB,
    _select_oa,
    compute_anom,
    compute_sn_ratio,
    taguchi,
)
from cassini.core.doe.designs import DesignResult
from cassini.core.explain import ExplanationCollector


# ---------------------------------------------------------------------------
# Orthogonal array matrix structure tests
# ---------------------------------------------------------------------------


class TestOAMatrixProperties:
    """Verify structural properties of stored OA constant matrices."""

    def test_l4_dimensions(self):
        assert len(_L4) == 4
        assert all(len(row) == 3 for row in _L4)

    def test_l8_dimensions(self):
        assert len(_L8) == 8
        assert all(len(row) == 7 for row in _L8)

    def test_l9_dimensions(self):
        assert len(_L9) == 9
        assert all(len(row) == 4 for row in _L9)

    def test_l12_dimensions(self):
        assert len(_L12) == 12
        assert all(len(row) == 11 for row in _L12)

    def test_l16_dimensions(self):
        assert len(_L16) == 16
        assert all(len(row) == 15 for row in _L16)

    def test_l18_dimensions(self):
        assert len(_L18) == 18
        assert all(len(row) == 8 for row in _L18)

    def test_l27_dimensions(self):
        assert len(_L27) == 27
        assert all(len(row) == 13 for row in _L27)

    def test_l4_values_are_0_1(self):
        """2-level OA should only have values 0 and 1."""
        for row in _L4:
            for val in row:
                assert val in (0, 1)

    def test_l8_values_are_0_1(self):
        for row in _L8:
            for val in row:
                assert val in (0, 1)

    def test_l9_values_are_0_1_2(self):
        """3-level OA should only have values 0, 1, and 2."""
        for row in _L9:
            for val in row:
                assert val in (0, 1, 2)

    def test_l27_values_are_0_1_2(self):
        for row in _L27:
            for val in row:
                assert val in (0, 1, 2)

    def test_l18_column_0_is_2_level(self):
        """L18 column 0 should be 2-level (values 0 and 1)."""
        col0_vals = {row[0] for row in _L18}
        assert col0_vals == {0, 1}

    def test_l18_columns_1_7_are_3_level(self):
        """L18 columns 1-7 should be 3-level (values 0, 1, 2)."""
        for col in range(1, 8):
            col_vals = {row[col] for row in _L18}
            assert col_vals == {0, 1, 2}, f"Column {col} values: {col_vals}"


# ---------------------------------------------------------------------------
# OA column balance (orthogonality check)
# ---------------------------------------------------------------------------


class TestOABalance:
    """Verify column balance of OA matrices."""

    def test_l4_column_balance(self):
        """Each column of L4 should have 2 zeros and 2 ones."""
        for col in range(3):
            vals = [_L4[row][col] for row in range(4)]
            assert vals.count(0) == 2
            assert vals.count(1) == 2

    def test_l8_column_balance(self):
        """Each column of L8 should have 4 zeros and 4 ones."""
        for col in range(7):
            vals = [_L8[row][col] for row in range(8)]
            assert vals.count(0) == 4
            assert vals.count(1) == 4

    def test_l9_column_balance(self):
        """Each column of L9 should have 3 of each level."""
        for col in range(4):
            vals = [_L9[row][col] for row in range(9)]
            assert vals.count(0) == 3
            assert vals.count(1) == 3
            assert vals.count(2) == 3

    def test_l27_column_balance(self):
        """Each column of L27 should have 9 of each level."""
        for col in range(13):
            vals = [_L27[row][col] for row in range(27)]
            assert vals.count(0) == 9
            assert vals.count(1) == 9
            assert vals.count(2) == 9


# ---------------------------------------------------------------------------
# OA selection tests
# ---------------------------------------------------------------------------


class TestOASelection:
    """Verify correct OA selection for given parameters."""

    def test_2_factors_2_level_selects_l4(self):
        name, _, _ = _select_oa(2, 2)
        assert name == "L4"

    def test_3_factors_2_level_selects_l4(self):
        name, _, _ = _select_oa(3, 2)
        assert name == "L4"

    def test_4_factors_2_level_selects_l8(self):
        name, _, _ = _select_oa(4, 2)
        assert name == "L8"

    def test_7_factors_2_level_selects_l8(self):
        name, _, _ = _select_oa(7, 2)
        assert name == "L8"

    def test_8_factors_2_level_selects_l12(self):
        name, _, _ = _select_oa(8, 2)
        assert name == "L12"

    def test_12_factors_2_level_selects_l16(self):
        name, _, _ = _select_oa(12, 2)
        assert name == "L16"

    def test_2_factors_3_level_selects_l9(self):
        name, _, _ = _select_oa(2, 3)
        assert name == "L9"

    def test_4_factors_3_level_selects_l9(self):
        name, _, _ = _select_oa(4, 3)
        assert name == "L9"

    def test_5_factors_3_level_selects_l18(self):
        name, _, _ = _select_oa(5, 3)
        assert name == "L18"

    def test_7_factors_3_level_selects_l18(self):
        name, _, _ = _select_oa(7, 3)
        assert name == "L18"

    def test_8_factors_3_level_selects_l27(self):
        name, _, _ = _select_oa(8, 3)
        assert name == "L27"

    def test_13_factors_3_level_selects_l27(self):
        name, _, _ = _select_oa(13, 3)
        assert name == "L27"

    def test_rejects_unsupported_levels(self):
        with pytest.raises(ValueError, match="2 or 3 levels"):
            _select_oa(3, 4)

    def test_rejects_too_many_2_level_factors(self):
        with pytest.raises(ValueError, match="15 factors"):
            _select_oa(16, 2)

    def test_rejects_too_many_3_level_factors(self):
        with pytest.raises(ValueError, match="13 factors"):
            _select_oa(14, 3)


# ---------------------------------------------------------------------------
# Taguchi design generation tests
# ---------------------------------------------------------------------------


class TestTaguchiDesign:
    """Verify taguchi() design generator."""

    def test_basic_2_level_design(self):
        result = taguchi(3, n_levels=2)
        assert isinstance(result, DesignResult)
        assert result.n_factors == 3
        assert result.n_runs == 4  # L4
        assert result.design_type == "taguchi"

    def test_basic_3_level_design(self):
        result = taguchi(4, n_levels=3)
        assert result.n_factors == 4
        assert result.n_runs == 9  # L9

    def test_coded_values_2_level(self):
        """2-level design should have coded values -1 and +1."""
        result = taguchi(3, n_levels=2)
        unique = set(np.unique(result.coded_matrix))
        assert unique == {-1.0, 1.0}

    def test_coded_values_3_level(self):
        """3-level design should have coded values -1, 0, +1."""
        result = taguchi(4, n_levels=3)
        unique = set(np.unique(result.coded_matrix))
        assert unique == {-1.0, 0.0, 1.0}

    def test_column_projection(self):
        """Design for 2 factors using L4 should only have 2 columns."""
        result = taguchi(2, n_levels=2)
        assert result.coded_matrix.shape == (4, 2)

    def test_l18_3_level_drops_col_0(self):
        """L18 with 3-level factors should use columns 1-7, not column 0."""
        result = taguchi(5, n_levels=3)
        assert result.n_runs == 18  # L18
        assert result.coded_matrix.shape == (18, 5)
        # All values should be -1, 0, +1 (not just -1, +1)
        unique = set(np.unique(result.coded_matrix))
        assert 0.0 in unique

    def test_seed_deterministic(self):
        r1 = taguchi(3, n_levels=2, seed=42)
        r2 = taguchi(3, n_levels=2, seed=42)
        assert r1.run_order == r2.run_order

    def test_no_seed_standard_order(self):
        result = taguchi(3, n_levels=2, seed=None)
        assert result.run_order == result.standard_order

    def test_no_center_points(self):
        result = taguchi(3, n_levels=2)
        assert all(not cp for cp in result.is_center_point)

    def test_rejects_fewer_than_2_factors(self):
        with pytest.raises(ValueError, match="at least 2 factors"):
            taguchi(1)

    def test_rejects_invalid_levels(self):
        with pytest.raises(ValueError, match="2 or 3 levels"):
            taguchi(3, n_levels=4)


# ---------------------------------------------------------------------------
# S/N ratio computation tests
# ---------------------------------------------------------------------------


class TestSNSmallerIsBetter:
    """S/N = -10 * log10(mean(y^2))."""

    def test_basic_computation(self):
        y = np.array([1.0, 2.0, 3.0])
        result = compute_sn_ratio(y, "smaller_is_better")
        expected = -10 * math.log10(np.mean(y ** 2))
        assert result.sn_ratio is not None
        assert abs(result.sn_ratio - expected) < 1e-6
        assert result.warning is None

    def test_zero_values(self):
        y = np.array([0.0, 0.0, 0.0])
        result = compute_sn_ratio(y, "smaller_is_better")
        assert result.sn_ratio == _SN_CAP_DB

    def test_empty_array(self):
        y = np.array([])
        result = compute_sn_ratio(y, "smaller_is_better")
        assert result.sn_ratio is None
        assert result.warning is not None

    def test_nan_values(self):
        y = np.array([1.0, float("nan"), 3.0])
        result = compute_sn_ratio(y, "smaller_is_better")
        assert result.sn_ratio is None

    def test_single_value(self):
        y = np.array([5.0])
        result = compute_sn_ratio(y, "smaller_is_better")
        expected = -10 * math.log10(25.0)
        assert result.sn_ratio is not None
        assert abs(result.sn_ratio - expected) < 1e-6


class TestSNLargerIsBetter:
    """S/N = -10 * log10(mean(1/y^2))."""

    def test_basic_computation(self):
        y = np.array([10.0, 20.0, 30.0])
        result = compute_sn_ratio(y, "larger_is_better")
        expected = -10 * math.log10(np.mean(1.0 / (y ** 2)))
        assert result.sn_ratio is not None
        assert abs(result.sn_ratio - expected) < 1e-6

    def test_rejects_zero_values(self):
        y = np.array([5.0, 0.0, 10.0])
        result = compute_sn_ratio(y, "larger_is_better")
        assert result.sn_ratio is None
        assert "must be > 0" in (result.warning or "")

    def test_rejects_negative_values(self):
        y = np.array([5.0, -1.0, 10.0])
        result = compute_sn_ratio(y, "larger_is_better")
        assert result.sn_ratio is None

    def test_empty_array(self):
        y = np.array([])
        result = compute_sn_ratio(y, "larger_is_better")
        assert result.sn_ratio is None


class TestSNNominalIsBest1:
    """S/N = 10 * log10(y_bar^2 / s^2)."""

    def test_basic_computation(self):
        y = np.array([10.0, 11.0, 9.0, 10.0])
        result = compute_sn_ratio(y, "nominal_is_best_1")
        y_bar = float(np.mean(y))
        s_sq = float(np.var(y, ddof=1))
        expected = 10 * math.log10(y_bar ** 2 / s_sq)
        assert result.sn_ratio is not None
        assert abs(result.sn_ratio - expected) < 1e-6

    def test_zero_variance_capped(self):
        """Variance = 0 should be capped at 100 dB."""
        y = np.array([5.0, 5.0, 5.0])
        result = compute_sn_ratio(y, "nominal_is_best_1")
        assert result.sn_ratio == _SN_CAP_DB

    def test_zero_mean_returns_none(self):
        """Mean = 0 should return None with warning."""
        y = np.array([-1.0, 1.0])
        result = compute_sn_ratio(y, "nominal_is_best_1")
        assert result.sn_ratio is None
        assert "zero" in (result.warning or "").lower()

    def test_requires_at_least_2_observations(self):
        y = np.array([5.0])
        result = compute_sn_ratio(y, "nominal_is_best_1")
        assert result.sn_ratio is None


class TestSNNominalIsBest2:
    """S/N = -10 * log10(s^2)."""

    def test_basic_computation(self):
        y = np.array([10.0, 11.0, 9.0, 10.0])
        result = compute_sn_ratio(y, "nominal_is_best_2")
        s_sq = float(np.var(y, ddof=1))
        expected = -10 * math.log10(s_sq)
        assert result.sn_ratio is not None
        assert abs(result.sn_ratio - expected) < 1e-6

    def test_zero_variance_capped(self):
        y = np.array([5.0, 5.0, 5.0])
        result = compute_sn_ratio(y, "nominal_is_best_2")
        assert result.sn_ratio == _SN_CAP_DB

    def test_requires_at_least_2_observations(self):
        y = np.array([5.0])
        result = compute_sn_ratio(y, "nominal_is_best_2")
        assert result.sn_ratio is None


class TestSNDispatch:
    """Test compute_sn_ratio dispatch."""

    def test_unknown_type_raises(self):
        with pytest.raises(ValueError, match="Unknown S/N type"):
            compute_sn_ratio(np.array([1.0]), "invalid")

    def test_all_types_callable(self):
        y = np.array([5.0, 10.0, 15.0])
        for sn_type in [
            "smaller_is_better",
            "larger_is_better",
            "nominal_is_best_1",
            "nominal_is_best_2",
        ]:
            result = compute_sn_ratio(y, sn_type)
            assert result.sn_ratio is not None, f"Failed for {sn_type}"


class TestSNShowYourWork:
    """Verify SYW collector integration."""

    def test_collector_receives_step(self):
        collector = ExplanationCollector()
        y = np.array([1.0, 2.0, 3.0])
        compute_sn_ratio(y, "smaller_is_better", collector=collector)
        assert len(collector.steps) == 1
        assert "Smaller-is-Better" in collector.steps[0].label
        assert "Taguchi" in (collector.steps[0].note or "")

    def test_larger_is_better_collector(self):
        collector = ExplanationCollector()
        compute_sn_ratio(np.array([5.0, 10.0]), "larger_is_better", collector)
        assert len(collector.steps) == 1
        assert "Larger-is-Better" in collector.steps[0].label

    def test_ntb1_collector(self):
        collector = ExplanationCollector()
        compute_sn_ratio(np.array([5.0, 6.0, 7.0]), "nominal_is_best_1", collector)
        assert len(collector.steps) == 1

    def test_ntb2_collector(self):
        collector = ExplanationCollector()
        compute_sn_ratio(np.array([5.0, 6.0, 7.0]), "nominal_is_best_2", collector)
        assert len(collector.steps) == 1


# ---------------------------------------------------------------------------
# ANOM analysis tests
# ---------------------------------------------------------------------------


class TestANOM:
    """Verify Analysis of Means on Taguchi designs."""

    def _make_design_and_response(self):
        """Create a simple L4 design with known response values."""
        design = taguchi(3, n_levels=2)
        # Response values where factor 0 has the biggest effect
        # L4 coded matrix:
        #   [-1, -1, -1]
        #   [-1, +1, +1]
        #   [+1, -1, +1]
        #   [+1, +1, -1]
        response = np.array([10.0, 12.0, 20.0, 22.0])
        return design.coded_matrix, response

    def test_basic_anom(self):
        design, response = self._make_design_and_response()
        factor_names = ["A", "B", "C"]

        result = compute_anom(design, response, factor_names, "smaller_is_better")

        assert isinstance(result, ANOMResult)
        assert len(result.factors) == 3
        assert len(result.sn_ratios) == 4
        assert all(sn is not None for sn in result.sn_ratios)

    def test_factors_ranked_by_range(self):
        design, response = self._make_design_and_response()
        factor_names = ["A", "B", "C"]

        result = compute_anom(design, response, factor_names, "smaller_is_better")

        # Factor A has the biggest effect (10 -> 20 gap)
        # so A should rank #1
        assert result.factors[0].factor_name == "A"
        assert result.factors[0].rank == 1

        # Verify ranks are sequential
        ranks = [f.rank for f in result.factors]
        assert ranks == [1, 2, 3]

    def test_optimal_settings(self):
        design, response = self._make_design_and_response()
        factor_names = ["A", "B", "C"]

        result = compute_anom(design, response, factor_names, "smaller_is_better")

        assert "A" in result.optimal_settings
        assert "B" in result.optimal_settings
        assert "C" in result.optimal_settings

    def test_level_means_present(self):
        design, response = self._make_design_and_response()
        factor_names = ["A", "B", "C"]

        result = compute_anom(design, response, factor_names, "smaller_is_better")

        for fr in result.factors:
            assert len(fr.level_means) >= 2
            assert fr.best_level in fr.level_means

    def test_3_level_anom(self):
        """ANOM should work with 3-level factors."""
        design = taguchi(4, n_levels=3)
        response = np.random.default_rng(42).uniform(10, 50, size=9)
        factor_names = ["A", "B", "C", "D"]

        result = compute_anom(design.coded_matrix, response, factor_names, "smaller_is_better")

        assert len(result.factors) == 4
        # 3-level factors should have level means for -1, 0, +1
        for fr in result.factors:
            assert len(fr.level_means) == 3

    def test_mismatched_response_length_raises(self):
        design = taguchi(3, n_levels=2)
        response = np.array([1.0, 2.0])  # wrong length
        with pytest.raises(ValueError, match="does not match"):
            compute_anom(design.coded_matrix, response, ["A", "B", "C"], "smaller_is_better")

    def test_anom_syw_collector(self):
        design, response = self._make_design_and_response()
        factor_names = ["A", "B", "C"]
        collector = ExplanationCollector()

        compute_anom(
            design, response, factor_names, "smaller_is_better",
            collector=collector,
        )

        assert len(collector.steps) >= 2
        assert any("Response Table" in s.label for s in collector.steps)
        assert any("Ranking" in s.label for s in collector.steps)

    def test_all_sn_types_work_with_anom(self):
        """ANOM should work with all four S/N types."""
        design = taguchi(3, n_levels=2)
        # Use positive values so larger_is_better works
        response = np.array([5.0, 10.0, 15.0, 20.0])
        factor_names = ["A", "B", "C"]

        for sn_type in [
            "smaller_is_better",
            "larger_is_better",
            "nominal_is_best_1",
            "nominal_is_best_2",
        ]:
            result = compute_anom(
                design.coded_matrix, response, factor_names, sn_type,
            )
            # NTB-1 and NTB-2 need at least 2 observations for variance,
            # but with single observations per run they'll return None
            # — that's expected behavior
            if sn_type in ("nominal_is_best_1", "nominal_is_best_2"):
                # With single observations, S/N cannot be computed
                assert len(result.warnings) > 0
            else:
                assert len(result.factors) > 0


# ---------------------------------------------------------------------------
# Integration with design dispatch
# ---------------------------------------------------------------------------


class TestTaguchiDispatch:
    """Verify taguchi integrates with the engine dispatch."""

    def test_design_type_label(self):
        result = taguchi(3, n_levels=2)
        assert result.design_type == "taguchi"

    def test_standard_order_and_run_order_lengths(self):
        result = taguchi(3, n_levels=2)
        assert len(result.standard_order) == result.n_runs
        assert len(result.run_order) == result.n_runs
        assert len(result.is_center_point) == result.n_runs

    def test_coded_matrix_shape(self):
        result = taguchi(5, n_levels=2)
        assert result.coded_matrix.shape == (result.n_runs, result.n_factors)

    def test_15_factor_2_level(self):
        """Maximum 2-level: 15 factors -> L16."""
        result = taguchi(15, n_levels=2)
        assert result.n_runs == 16
        assert result.n_factors == 15

    def test_13_factor_3_level(self):
        """Maximum 3-level: 13 factors -> L27."""
        result = taguchi(13, n_levels=3)
        assert result.n_runs == 27
        assert result.n_factors == 13
