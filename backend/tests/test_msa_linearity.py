"""Tests for MSA Linearity Study (AIAG MSA 4th Edition).

Covers:
- Perfect linearity (zero bias at all levels)
- Known constant bias (slope=0, bias=offset)
- Known non-linearity (bias increases with reference)
- Edge case: minimum 3 reference levels
- Tolerance-based percentage calculations
"""
from __future__ import annotations

import math

import pytest

from cassini.core.msa.linearity import LinearityResult, compute_linearity


class TestPerfectLinearity:
    """Gage with zero bias at all levels -> slope=0, %linearity=0."""

    def test_zero_bias_all_levels(self):
        refs = [2.0, 4.0, 6.0, 8.0, 10.0]
        # Each level: measurements exactly equal the reference
        meas = [[r] * 10 for r in refs]
        result = compute_linearity(refs, meas, tolerance=10.0)

        assert result.slope == pytest.approx(0.0, abs=1e-10)
        assert result.intercept == pytest.approx(0.0, abs=1e-10)
        assert result.linearity == pytest.approx(0.0, abs=1e-10)
        assert result.linearity_percent == pytest.approx(0.0, abs=1e-10)
        assert result.bias_avg == pytest.approx(0.0, abs=1e-10)
        assert result.bias_percent == pytest.approx(0.0, abs=1e-10)
        assert result.is_acceptable is True
        assert result.verdict == "acceptable"
        # R-squared is undefined when all values are identical (0 variance)
        # scipy returns 0.0 in this case
        assert all(b == pytest.approx(0.0, abs=1e-10) for b in result.bias_values)

    def test_near_zero_bias_with_noise(self):
        """Small random noise around zero bias should still be acceptable."""
        refs = [2.0, 4.0, 6.0, 8.0, 10.0]
        # Add tiny noise: measured = ref + small_noise
        meas = [
            [r + 0.001, r - 0.001, r + 0.002, r - 0.002, r] for r in refs
        ]
        result = compute_linearity(refs, meas, tolerance=10.0)

        assert abs(result.slope) < 0.01
        assert result.linearity_percent < 1.0
        assert result.is_acceptable is True
        assert result.verdict == "acceptable"


class TestKnownBias:
    """Constant offset (no linearity problem, just bias)."""

    def test_constant_bias(self):
        """All levels biased by +0.05 -> slope~0, bias=0.05."""
        refs = [2.0, 4.0, 6.0, 8.0, 10.0]
        offset = 0.05
        meas = [[r + offset] * 10 for r in refs]
        result = compute_linearity(refs, meas, tolerance=1.0)

        # Slope should be ~0 since bias is constant
        assert result.slope == pytest.approx(0.0, abs=1e-10)
        # Bias at each level should be the offset
        for b in result.bias_values:
            assert b == pytest.approx(offset, abs=1e-10)
        # Average bias = offset
        assert result.bias_avg == pytest.approx(offset, abs=1e-10)
        # %Bias = offset / tolerance * 100 = 5%
        assert result.bias_percent == pytest.approx(5.0, abs=1e-6)
        # Linearity = |slope| * range = 0
        assert result.linearity == pytest.approx(0.0, abs=1e-10)
        assert result.linearity_percent == pytest.approx(0.0, abs=1e-10)
        assert result.is_acceptable is True

    def test_negative_constant_bias(self):
        """Negative constant offset -> bias_avg uses absolute values."""
        refs = [5.0, 10.0, 15.0]
        offset = -0.1
        meas = [[r + offset] * 5 for r in refs]
        result = compute_linearity(refs, meas, tolerance=2.0)

        assert result.slope == pytest.approx(0.0, abs=1e-10)
        assert result.bias_avg == pytest.approx(0.1, abs=1e-10)
        assert result.bias_percent == pytest.approx(5.0, abs=1e-6)


class TestNonLinearity:
    """Bias that varies systematically with reference value."""

    def test_increasing_bias(self):
        """Bias increases linearly with reference -> slope!=0."""
        refs = [2.0, 4.0, 6.0, 8.0, 10.0]
        # Bias = 0.01 * ref (increases linearly)
        meas = [[r + 0.01 * r] * 10 for r in refs]
        result = compute_linearity(refs, meas, tolerance=1.0)

        # Slope should be ~0.01
        assert result.slope == pytest.approx(0.01, abs=1e-6)
        # Linearity = |slope| * range = 0.01 * (10-2) = 0.08
        assert result.linearity == pytest.approx(0.08, abs=1e-6)
        # %Linearity = 0.08 / 1.0 * 100 = 8%
        assert result.linearity_percent == pytest.approx(8.0, abs=1e-4)
        # 8% -> marginal
        assert result.verdict == "marginal"
        assert result.is_acceptable is False

    def test_severe_non_linearity(self):
        """Large slope -> unacceptable."""
        refs = [2.0, 4.0, 6.0, 8.0, 10.0]
        # Bias = 0.05 * ref
        meas = [[r + 0.05 * r] * 10 for r in refs]
        result = compute_linearity(refs, meas, tolerance=1.0)

        # Linearity = 0.05 * 8 = 0.4 -> %Lin = 40% -> unacceptable
        assert result.linearity == pytest.approx(0.40, abs=1e-4)
        assert result.linearity_percent == pytest.approx(40.0, abs=0.1)
        assert result.verdict == "unacceptable"
        assert result.is_acceptable is False

    def test_r_squared_high_for_perfect_linear_bias(self):
        """Perfect linear relationship should give R² = 1.0."""
        refs = [1.0, 2.0, 3.0, 4.0, 5.0]
        # bias_i = 0.1 * ref_i (exactly linear)
        meas = [[r + 0.1 * r] * 10 for r in refs]
        result = compute_linearity(refs, meas)

        assert result.r_squared == pytest.approx(1.0, abs=1e-6)

    def test_p_value_significant_for_non_linearity(self):
        """Significant slope should have small p-value."""
        refs = [2.0, 4.0, 6.0, 8.0, 10.0]
        meas = [[r + 0.02 * r] * 20 for r in refs]
        result = compute_linearity(refs, meas, tolerance=1.0)

        assert result.p_value < 0.05
        assert result.slope != pytest.approx(0.0, abs=1e-6)


class TestEdgeCases:
    """Minimum inputs and boundary conditions."""

    def test_three_reference_levels(self):
        """Minimum valid: 3 reference levels."""
        refs = [5.0, 7.5, 10.0]
        meas = [[5.01, 5.02, 4.99], [7.51, 7.52, 7.49], [10.05, 10.04, 10.06]]
        result = compute_linearity(refs, meas, tolerance=1.0)

        assert isinstance(result, LinearityResult)
        assert len(result.reference_values) == 3
        assert len(result.bias_values) == 3
        assert len(result.individual_points) == 9

    def test_two_reference_levels_raises(self):
        """2 reference levels is degenerate (r²=1.0 always) — must raise."""
        with pytest.raises(ValueError, match="at least 3 reference levels"):
            compute_linearity([5.0, 10.0], [[5.01, 5.02, 4.99], [10.05, 10.04, 10.06]])

    def test_single_measurement_per_level(self):
        """One measurement per level is valid."""
        refs = [1.0, 3.0, 5.0]
        meas = [[1.01], [3.02], [5.03]]
        result = compute_linearity(refs, meas, tolerance=1.0)

        assert isinstance(result, LinearityResult)
        assert len(result.individual_points) == 3

    def test_fewer_than_three_levels_raises(self):
        """Must have at least 3 reference levels."""
        with pytest.raises(ValueError, match="at least 3 reference levels"):
            compute_linearity([5.0], [[5.01, 5.02]])

    def test_empty_measurements_raises(self):
        """Empty measurement group raises."""
        with pytest.raises(ValueError, match="empty"):
            compute_linearity([5.0, 10.0, 15.0], [[], [10.0], [15.0]])

    def test_mismatched_lengths_raises(self):
        """Measurements count must match reference count."""
        with pytest.raises(ValueError, match="must match"):
            compute_linearity([5.0, 10.0, 15.0], [[5.01]])

    def test_unequal_replicate_counts(self):
        """Different number of measurements per level is valid."""
        refs = [2.0, 4.0, 6.0]
        meas = [
            [2.01, 2.02],  # 2 replicates
            [4.01, 4.02, 4.03],  # 3 replicates
            [6.01],  # 1 replicate
        ]
        result = compute_linearity(refs, meas, tolerance=1.0)

        assert isinstance(result, LinearityResult)
        assert len(result.individual_points) == 6


class TestTolerancePercentages:
    """Percentage calculations with and without tolerance."""

    def test_with_tolerance(self):
        """With tolerance, %Linearity and %Bias are computed."""
        refs = [2.0, 4.0, 6.0, 8.0, 10.0]
        # Bias = 0.005 * ref (small)
        meas = [[r + 0.005 * r] * 10 for r in refs]
        tolerance = 1.0
        result = compute_linearity(refs, meas, tolerance=tolerance)

        # Linearity = 0.005 * 8 = 0.04
        assert result.linearity == pytest.approx(0.04, abs=1e-6)
        # %Linearity = 0.04 / 1.0 * 100 = 4.0%
        assert result.linearity_percent == pytest.approx(4.0, abs=0.1)
        assert result.is_acceptable is True
        assert result.verdict == "acceptable"
        # All bias_percentages should be finite
        assert all(not math.isnan(bp) for bp in result.bias_percentages)
        assert not math.isnan(result.bias_percent)

    def test_without_tolerance(self):
        """Without tolerance, percentage metrics are NaN."""
        refs = [2.0, 4.0, 6.0, 8.0, 10.0]
        meas = [[r + 0.005 * r] * 10 for r in refs]
        result = compute_linearity(refs, meas, tolerance=None)

        assert math.isnan(result.linearity_percent)
        assert math.isnan(result.bias_percent)
        assert all(math.isnan(bp) for bp in result.bias_percentages)
        # Still computes absolute linearity
        assert result.linearity == pytest.approx(0.04, abs=1e-6)

    def test_zero_tolerance_treated_as_none(self):
        """Tolerance=0 should not cause division by zero."""
        refs = [2.0, 4.0, 6.0]
        meas = [[r] * 5 for r in refs]
        result = compute_linearity(refs, meas, tolerance=0.0)

        assert math.isnan(result.linearity_percent)
        assert math.isnan(result.bias_percent)

    def test_large_tolerance_small_percentages(self):
        """Large tolerance makes percentages very small."""
        refs = [10.0, 20.0, 30.0, 40.0, 50.0]
        # Bias = 0.1 * ref
        meas = [[r + 0.1 * r] * 5 for r in refs]
        tolerance = 100.0
        result = compute_linearity(refs, meas, tolerance=tolerance)

        # Linearity = 0.1 * 40 = 4.0; %Lin = 4.0/100*100 = 4.0%
        assert result.linearity == pytest.approx(4.0, abs=0.1)
        assert result.linearity_percent == pytest.approx(4.0, abs=0.1)
        assert result.is_acceptable is True


class TestIndividualPoints:
    """Validate the individual_points structure for scatter plots."""

    def test_individual_points_structure(self):
        refs = [5.0, 7.5, 10.0]
        meas = [[5.1, 4.9], [7.6, 7.4], [10.2, 9.8]]
        result = compute_linearity(refs, meas)

        assert len(result.individual_points) == 6
        for pt in result.individual_points:
            assert "reference" in pt
            assert "measured" in pt
            assert "bias" in pt
            assert "replicate" in pt
            assert pt["bias"] == pytest.approx(pt["measured"] - pt["reference"], abs=1e-10)

    def test_individual_points_count_matches(self):
        """Total points = sum of measurements across all levels."""
        refs = [1.0, 2.0, 3.0]
        meas = [[1.01] * 5, [2.01] * 3, [3.01] * 7]
        result = compute_linearity(refs, meas)

        assert len(result.individual_points) == 15


class TestCustomThreshold:
    """Test custom acceptability threshold."""

    def test_custom_threshold_10_percent(self):
        refs = [2.0, 4.0, 6.0, 8.0, 10.0]
        # Bias = 0.01 * ref -> linearity = 0.08, %Lin = 8% with tol=1.0
        meas = [[r + 0.01 * r] * 10 for r in refs]
        # Default threshold (5%) -> marginal
        result_default = compute_linearity(refs, meas, tolerance=1.0)
        assert result_default.is_acceptable is False

        # Custom threshold (10%) -> acceptable
        result_custom = compute_linearity(refs, meas, tolerance=1.0, threshold=10.0)
        assert result_custom.is_acceptable is True
