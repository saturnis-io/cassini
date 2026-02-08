"""Unit tests for statistical constants and utility functions.

Tests verify:
- Statistical constants match ASTM E2587 standards
- Sigma estimation methods are accurate
- Control limit calculations are correct
- Zone boundaries are properly calculated
- Error handling for invalid inputs
"""

import pytest
from openspc.utils import (
    # Constants
    get_constants,
    get_d2,
    get_c4,
    get_A2,
    get_D3,
    get_D4,
    # Sigma estimation
    estimate_sigma_rbar,
    estimate_sigma_sbar,
    estimate_sigma_moving_range,
    # Control limits
    calculate_xbar_r_limits,
    calculate_imr_limits,
    calculate_zones,
    calculate_control_limits_from_sigma,
)


class TestConstants:
    """Test statistical constants retrieval."""

    def test_d2_values_match_astm(self):
        """Verify d2 constants match ASTM E2587 for key subgroup sizes."""
        assert get_d2(2) == 1.128
        assert get_d2(3) == 1.693
        assert get_d2(4) == 2.059
        assert get_d2(5) == 2.326
        assert get_d2(6) == 2.534
        assert get_d2(7) == 2.704
        assert get_d2(10) == 3.078
        assert get_d2(25) == 3.931

    def test_c4_values_match_astm(self):
        """Verify c4 constants match ASTM E2587 for key subgroup sizes."""
        assert get_c4(2) == 0.7979
        assert get_c4(3) == 0.8862
        assert get_c4(4) == 0.9213
        assert get_c4(5) == 0.9400
        assert get_c4(10) == 0.9727
        assert get_c4(15) == 0.9823
        assert get_c4(25) == 0.9896

    def test_A2_values_match_astm(self):
        """Verify A2 constants match ASTM E2587 for key subgroup sizes."""
        assert get_A2(2) == 1.880
        assert get_A2(3) == 1.023
        assert get_A2(4) == 0.729
        assert get_A2(5) == 0.577
        assert get_A2(10) == 0.308

    def test_D3_values_match_astm(self):
        """Verify D3 constants match ASTM E2587 for key subgroup sizes."""
        assert get_D3(2) == 0.0
        assert get_D3(5) == 0.0
        assert get_D3(7) == 0.076
        assert get_D3(10) == 0.223
        assert get_D3(15) == 0.347

    def test_D4_values_match_astm(self):
        """Verify D4 constants match ASTM E2587 for key subgroup sizes."""
        assert get_D4(2) == 3.267
        assert get_D4(3) == 2.574
        assert get_D4(4) == 2.282
        assert get_D4(5) == 2.114
        assert get_D4(10) == 1.777
        assert get_D4(25) == 1.541

    def test_get_constants_returns_all_values(self):
        """Verify get_constants returns complete SpcConstants object."""
        constants = get_constants(5)
        assert constants.n == 5
        assert constants.d2 == 2.326
        assert constants.c4 == 0.9400
        assert constants.A2 == 0.577
        assert constants.D3 == 0.0
        assert constants.D4 == 2.114

    def test_invalid_subgroup_size_raises_error(self):
        """Verify ValueError is raised for invalid subgroup sizes."""
        with pytest.raises(ValueError, match="must be between 1 and 25"):
            get_d2(0)

        with pytest.raises(ValueError, match="must be between 1 and 25"):
            get_d2(26)

        with pytest.raises(ValueError, match="must be between 1 and 25"):
            get_c4(-1)

        with pytest.raises(ValueError, match="must be between 1 and 25"):
            get_A2(100)


class TestSigmaEstimation:
    """Test sigma estimation methods."""

    def test_estimate_sigma_rbar_basic(self):
        """Test R-bar method with known values."""
        ranges = [1.2, 1.5, 1.0, 1.3]
        subgroup_size = 5
        expected_sigma = sum(ranges) / len(ranges) / get_d2(5)
        result = estimate_sigma_rbar(ranges, subgroup_size)
        assert pytest.approx(result, abs=0.001) == expected_sigma

    def test_estimate_sigma_rbar_exact_calculation(self):
        """Test R-bar method with exact manual calculation."""
        # R-bar = 5.325 / 4 = 1.33125
        # d2(5) = 2.326
        # sigma = 1.33125 / 2.326 = 0.5723...
        ranges = [1.2, 1.5, 1.0, 1.625]
        result = estimate_sigma_rbar(ranges, 5)
        assert pytest.approx(result, abs=0.001) == 0.572

    def test_estimate_sigma_rbar_empty_list_raises_error(self):
        """Verify error is raised for empty ranges list."""
        with pytest.raises(ValueError, match="cannot be empty"):
            estimate_sigma_rbar([], 5)

    def test_estimate_sigma_rbar_negative_range_raises_error(self):
        """Verify error is raised for negative ranges."""
        with pytest.raises(ValueError, match="cannot be negative"):
            estimate_sigma_rbar([1.0, -0.5, 1.2], 5)

    def test_estimate_sigma_rbar_invalid_subgroup_size(self):
        """Verify error for subgroup sizes outside 2-10 range."""
        with pytest.raises(ValueError, match="recommended for subgroup sizes 2-10"):
            estimate_sigma_rbar([1.0, 1.2], 1)

        with pytest.raises(ValueError, match="recommended for subgroup sizes 2-10"):
            estimate_sigma_rbar([1.0, 1.2], 11)

    def test_estimate_sigma_sbar_basic(self):
        """Test S-bar method with known values."""
        std_devs = [2.1, 2.3, 2.0, 2.2]
        subgroup_size = 15
        expected_sigma = sum(std_devs) / len(std_devs) / get_c4(15)
        result = estimate_sigma_sbar(std_devs, subgroup_size)
        assert pytest.approx(result, abs=0.001) == expected_sigma

    def test_estimate_sigma_sbar_exact_calculation(self):
        """Test S-bar method with exact manual calculation."""
        # S-bar = 8.6 / 4 = 2.15
        # c4(15) = 0.9823
        # sigma = 2.15 / 0.9823 = 2.188...
        std_devs = [2.1, 2.3, 2.0, 2.2]
        result = estimate_sigma_sbar(std_devs, 15)
        assert pytest.approx(result, abs=0.001) == 2.188

    def test_estimate_sigma_sbar_empty_list_raises_error(self):
        """Verify error is raised for empty std_devs list."""
        with pytest.raises(ValueError, match="cannot be empty"):
            estimate_sigma_sbar([], 15)

    def test_estimate_sigma_sbar_negative_stddev_raises_error(self):
        """Verify error is raised for negative standard deviations."""
        with pytest.raises(ValueError, match="cannot be negative"):
            estimate_sigma_sbar([2.0, -1.0, 2.1], 15)

    def test_estimate_sigma_sbar_invalid_subgroup_size(self):
        """Verify error for subgroup sizes <= 10."""
        with pytest.raises(ValueError, match="recommended for subgroup sizes > 10"):
            estimate_sigma_sbar([2.0, 2.1], 10)

        with pytest.raises(ValueError, match="recommended for subgroup sizes > 10"):
            estimate_sigma_sbar([2.0, 2.1], 5)

    def test_estimate_sigma_moving_range_manual_example(self):
        """Test moving range method with manual calculation from spec.

        values [10, 12, 11, 13, 10]
        MR = [|12-10|, |11-12|, |13-11|, |10-13|] = [2, 1, 2, 3]
        avg(MR) = 8/4 = 2.0
        sigma = 2.0 / 1.128 = 1.773...
        """
        values = [10, 12, 11, 13, 10]
        result = estimate_sigma_moving_range(values)
        assert pytest.approx(result, abs=0.001) == 1.773

    def test_estimate_sigma_moving_range_span_2(self):
        """Test moving range with default span of 2."""
        values = [10, 12, 11, 13, 10, 12]
        # Moving ranges: [2, 1, 2, 3, 2]
        # MR-bar = 10/5 = 2.0
        # sigma = 2.0 / 1.128 = 1.773
        result = estimate_sigma_moving_range(values, span=2)
        assert pytest.approx(result, abs=0.001) == 1.773

    def test_estimate_sigma_moving_range_span_3(self):
        """Test moving range with span of 3."""
        values = [10, 12, 11, 13, 10]
        # Moving ranges: [max(10,12,11)-min(10,12,11), max(12,11,13)-min(12,11,13), max(11,13,10)-min(11,13,10)]
        # = [12-10, 13-11, 13-10] = [2, 2, 3]
        # MR-bar = 7/3 = 2.333...
        # d2(3) = 1.693
        # sigma = 2.333 / 1.693 = 1.378...
        result = estimate_sigma_moving_range(values, span=3)
        assert pytest.approx(result, abs=0.001) == 1.378

    def test_estimate_sigma_moving_range_insufficient_values(self):
        """Verify error when not enough values for span."""
        with pytest.raises(ValueError, match="Need at least 2 values"):
            estimate_sigma_moving_range([10], span=2)

        with pytest.raises(ValueError, match="Need at least 3 values"):
            estimate_sigma_moving_range([10, 11], span=3)

    def test_estimate_sigma_moving_range_invalid_span(self):
        """Verify error for invalid span values."""
        with pytest.raises(ValueError, match="Span must be at least 2"):
            estimate_sigma_moving_range([10, 11, 12], span=1)

        with pytest.raises(ValueError, match="Span must be at least 2"):
            estimate_sigma_moving_range([10, 11, 12], span=0)


class TestXbarRLimits:
    """Test X-bar and R chart control limit calculations."""

    def test_calculate_xbar_r_limits_basic(self):
        """Test X-bar R limits with known values."""
        means = [10.0, 10.2, 9.8, 10.1]
        ranges = [1.2, 1.5, 1.0, 1.3]
        subgroup_size = 5

        limits = calculate_xbar_r_limits(means, ranges, subgroup_size)

        # X-bar = 40.1 / 4 = 10.025
        assert pytest.approx(limits.xbar_limits.center_line, abs=0.001) == 10.025

        # R-bar = 5.0 / 4 = 1.25
        assert pytest.approx(limits.r_limits.center_line, abs=0.001) == 1.25

        # X-bar UCL = 10.025 + 0.577 * 1.25 = 10.74625
        # X-bar LCL = 10.025 - 0.577 * 1.25 = 9.30375
        assert pytest.approx(limits.xbar_limits.ucl, abs=0.001) == 10.746
        assert pytest.approx(limits.xbar_limits.lcl, abs=0.001) == 9.304

        # R UCL = 2.114 * 1.25 = 2.6425
        # R LCL = 0 * 1.25 = 0
        assert pytest.approx(limits.r_limits.ucl, abs=0.001) == 2.643
        assert pytest.approx(limits.r_limits.lcl, abs=0.001) == 0.0

        # Sigma = 1.25 / 2.326 = 0.5375...
        assert pytest.approx(limits.xbar_limits.sigma, abs=0.001) == 0.537

    def test_calculate_xbar_r_limits_with_d3_nonzero(self):
        """Test with subgroup size where D3 > 0."""
        means = [100.0, 100.5, 99.5, 100.2]
        ranges = [5.0, 6.0, 4.0, 5.0]
        subgroup_size = 10

        limits = calculate_xbar_r_limits(means, ranges, subgroup_size)

        # R-bar = 20.0 / 4 = 5.0
        # D3(10) = 0.223, D4(10) = 1.777
        # R LCL = 0.223 * 5.0 = 1.115
        # R UCL = 1.777 * 5.0 = 8.885
        assert pytest.approx(limits.r_limits.lcl, abs=0.001) == 1.115
        assert pytest.approx(limits.r_limits.ucl, abs=0.001) == 8.885

    def test_calculate_xbar_r_limits_empty_lists_raise_error(self):
        """Verify error for empty input lists."""
        with pytest.raises(ValueError, match="cannot be empty"):
            calculate_xbar_r_limits([], [1.0, 1.2], 5)

        with pytest.raises(ValueError, match="cannot be empty"):
            calculate_xbar_r_limits([10.0, 10.2], [], 5)

    def test_calculate_xbar_r_limits_mismatched_lengths_raise_error(self):
        """Verify error when means and ranges have different lengths."""
        with pytest.raises(ValueError, match="must have the same length"):
            calculate_xbar_r_limits([10.0, 10.2], [1.0, 1.2, 1.3], 5)

    def test_calculate_xbar_r_limits_invalid_subgroup_size(self):
        """Verify error for invalid subgroup sizes."""
        with pytest.raises(ValueError, match="must be between 2 and 25"):
            calculate_xbar_r_limits([10.0, 10.2], [1.0, 1.2], 1)

        with pytest.raises(ValueError, match="must be between 2 and 25"):
            calculate_xbar_r_limits([10.0, 10.2], [1.0, 1.2], 26)

    def test_calculate_xbar_r_limits_negative_range_raises_error(self):
        """Verify error for negative ranges."""
        with pytest.raises(ValueError, match="cannot be negative"):
            calculate_xbar_r_limits([10.0, 10.2], [1.0, -1.2], 5)


class TestIMRLimits:
    """Test I-MR (Individuals and Moving Range) chart calculations."""

    def test_calculate_imr_limits_basic(self):
        """Test I-MR limits with known values."""
        values = [10, 12, 11, 13, 10, 12]

        limits = calculate_imr_limits(values)

        # X-bar = 68 / 6 = 11.333...
        assert pytest.approx(limits.xbar_limits.center_line, abs=0.001) == 11.333

        # Moving ranges: [2, 1, 2, 3, 2]
        # MR-bar = 10 / 5 = 2.0
        assert pytest.approx(limits.r_limits.center_line, abs=0.001) == 2.0

        # Sigma = 2.0 / 1.128 = 1.773...
        assert pytest.approx(limits.xbar_limits.sigma, abs=0.001) == 1.773

        # I UCL = 11.333 + 3 * 1.773 = 16.652
        # I LCL = 11.333 - 3 * 1.773 = 6.014
        assert pytest.approx(limits.xbar_limits.ucl, abs=0.001) == 16.652
        assert pytest.approx(limits.xbar_limits.lcl, abs=0.001) == 6.014

        # MR UCL = 3.267 * 2.0 = 6.534
        # MR LCL = 0 * 2.0 = 0
        assert pytest.approx(limits.r_limits.ucl, abs=0.001) == 6.534
        assert pytest.approx(limits.r_limits.lcl, abs=0.001) == 0.0

    def test_calculate_imr_limits_spec_example(self):
        """Test with the exact example from the specification."""
        values = [10, 12, 11, 13, 10]

        limits = calculate_imr_limits(values)

        # Sigma should be 1.773 as per spec
        assert pytest.approx(limits.xbar_limits.sigma, abs=0.001) == 1.773

    def test_calculate_imr_limits_insufficient_values(self):
        """Verify error when not enough values."""
        with pytest.raises(ValueError, match="Need at least 2 values"):
            calculate_imr_limits([10])

    def test_calculate_imr_limits_with_span_3(self):
        """Test I-MR with span of 3."""
        values = [10, 12, 11, 13, 10, 12]

        limits = calculate_imr_limits(values, span=3)

        # Moving ranges with span 3: [2, 2, 3, 3]
        # MR-bar = 10 / 4 = 2.5
        assert pytest.approx(limits.r_limits.center_line, abs=0.001) == 2.5

        # d2(3) = 1.693
        # Sigma = 2.5 / 1.693 = 1.477...
        assert pytest.approx(limits.xbar_limits.sigma, abs=0.001) == 1.477


class TestZoneBoundaries:
    """Test zone boundary calculations for Nelson Rules."""

    def test_calculate_zones_symmetric(self):
        """Verify zones are symmetric around center line."""
        center = 100.0
        sigma = 2.0

        zones = calculate_zones(center, sigma)

        assert zones.center_line == 100.0
        assert zones.plus_1_sigma == 102.0
        assert zones.plus_2_sigma == 104.0
        assert zones.plus_3_sigma == 106.0
        assert zones.minus_1_sigma == 98.0
        assert zones.minus_2_sigma == 96.0
        assert zones.minus_3_sigma == 94.0

    def test_calculate_zones_with_offset_center(self):
        """Test zones with non-zero center line."""
        center = 50.5
        sigma = 1.5

        zones = calculate_zones(center, sigma)

        assert zones.center_line == 50.5
        assert pytest.approx(zones.plus_1_sigma, abs=0.001) == 52.0
        assert pytest.approx(zones.plus_2_sigma, abs=0.001) == 53.5
        assert pytest.approx(zones.plus_3_sigma, abs=0.001) == 55.0
        assert pytest.approx(zones.minus_1_sigma, abs=0.001) == 49.0
        assert pytest.approx(zones.minus_2_sigma, abs=0.001) == 47.5
        assert pytest.approx(zones.minus_3_sigma, abs=0.001) == 46.0

    def test_calculate_zones_zero_sigma_raises_error(self):
        """Verify error for zero sigma."""
        with pytest.raises(ValueError, match="must be positive"):
            calculate_zones(100.0, 0.0)

    def test_calculate_zones_negative_sigma_raises_error(self):
        """Verify error for negative sigma."""
        with pytest.raises(ValueError, match="must be positive"):
            calculate_zones(100.0, -1.0)


class TestControlLimitsFromSigma:
    """Test general control limit calculations from known sigma."""

    def test_calculate_control_limits_from_sigma_default(self):
        """Test control limits with default 3-sigma."""
        center = 100.0
        sigma = 2.0

        limits = calculate_control_limits_from_sigma(center, sigma)

        assert limits.center_line == 100.0
        assert limits.ucl == 106.0
        assert limits.lcl == 94.0
        assert limits.sigma == 2.0

    def test_calculate_control_limits_from_sigma_custom_n_sigma(self):
        """Test control limits with custom n-sigma."""
        center = 50.0
        sigma = 3.0
        n_sigma = 2.0

        limits = calculate_control_limits_from_sigma(center, sigma, n_sigma)

        assert limits.center_line == 50.0
        assert limits.ucl == 56.0
        assert limits.lcl == 44.0
        assert limits.sigma == 3.0

    def test_calculate_control_limits_zero_sigma_raises_error(self):
        """Verify error for zero sigma."""
        with pytest.raises(ValueError, match="must be positive"):
            calculate_control_limits_from_sigma(100.0, 0.0)

    def test_calculate_control_limits_negative_sigma_raises_error(self):
        """Verify error for negative sigma."""
        with pytest.raises(ValueError, match="must be positive"):
            calculate_control_limits_from_sigma(100.0, -1.0)

    def test_calculate_control_limits_negative_n_sigma_raises_error(self):
        """Verify error for negative n_sigma."""
        with pytest.raises(ValueError, match="cannot be negative"):
            calculate_control_limits_from_sigma(100.0, 2.0, -1.0)


class TestIntegration:
    """Integration tests combining multiple functions."""

    def test_full_xbar_r_workflow(self):
        """Test complete workflow for X-bar R chart."""
        import math

        # Sample data
        means = [100.1, 99.9, 100.2, 100.0, 99.8]
        ranges = [2.5, 2.8, 2.3, 2.6, 2.4]
        subgroup_size = 5

        # Calculate limits
        limits = calculate_xbar_r_limits(means, ranges, subgroup_size)

        # Verify sigma estimation
        expected_sigma = estimate_sigma_rbar(ranges, subgroup_size)
        assert limits.xbar_limits.sigma == expected_sigma

        # For X-bar chart, zones use sigma_xbar = sigma / sqrt(n)
        sigma_xbar = expected_sigma / math.sqrt(subgroup_size)
        zones = calculate_zones(limits.xbar_limits.center_line, sigma_xbar)

        # Verify UCL approximately matches +3 sigma_xbar zone
        # (Small difference due to A2 table rounding vs exact 3/(d2*sqrt(n)))
        assert pytest.approx(zones.plus_3_sigma, abs=0.01) == limits.xbar_limits.ucl
        assert pytest.approx(zones.minus_3_sigma, abs=0.01) == limits.xbar_limits.lcl

    def test_full_imr_workflow(self):
        """Test complete workflow for I-MR chart."""
        # Sample data
        values = [10.1, 10.5, 9.8, 10.2, 10.0, 9.9, 10.3]

        # Calculate limits
        limits = calculate_imr_limits(values)

        # Verify sigma estimation
        expected_sigma = estimate_sigma_moving_range(values)
        assert limits.xbar_limits.sigma == expected_sigma

        # Calculate zones
        zones = calculate_zones(limits.xbar_limits.center_line, limits.xbar_limits.sigma)

        # Verify UCL matches +3 sigma zone
        assert pytest.approx(zones.plus_3_sigma, abs=0.001) == limits.xbar_limits.ucl
        assert pytest.approx(zones.minus_3_sigma, abs=0.001) == limits.xbar_limits.lcl

    def test_constants_consistency_across_functions(self):
        """Verify constants are consistent when accessed different ways."""
        n = 7

        # Get constants via individual functions
        d2_individual = get_d2(n)
        c4_individual = get_c4(n)
        A2_individual = get_A2(n)
        D3_individual = get_D3(n)
        D4_individual = get_D4(n)

        # Get constants via get_constants
        constants = get_constants(n)

        # Verify they match
        assert d2_individual == constants.d2
        assert c4_individual == constants.c4
        assert A2_individual == constants.A2
        assert D3_individual == constants.D3
        assert D4_individual == constants.D4
