"""Reference-value tests for SPC statistics functions.

Cross-validates our SPC calculations against raw numpy/scipy computations
and published NIST reference values. These tests prove correctness of our
statistical functions by comparing against independent implementations.
"""

import math

import numpy as np
import pytest

from openspc.utils.constants import get_A2, get_D3, get_D4, get_c4, get_d2
from openspc.utils.statistics import (
    calculate_imr_limits,
    calculate_xbar_r_limits,
    calculate_zones,
    estimate_sigma_moving_range,
    estimate_sigma_rbar,
    estimate_sigma_sbar,
)


class TestConstantsAgainstNIST:
    """Verify SPC constants against published NIST/ASTM E2587 reference values.

    Reference: NIST Engineering Statistics Handbook, Section 6.3.2
    https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc32.htm
    """

    @pytest.mark.parametrize(
        "n, expected_d2",
        [
            (2, 1.128),
            (3, 1.693),
            (4, 2.059),
            (5, 2.326),
            (6, 2.534),
            (7, 2.704),
            (8, 2.847),
            (9, 2.970),
            (10, 3.078),
            (15, 3.472),
            (25, 3.931),
        ],
    )
    def test_d2_nist_reference(self, n: int, expected_d2: float):
        """d2 values match NIST Engineering Statistics Handbook."""
        assert get_d2(n) == pytest.approx(expected_d2, abs=0.001)

    @pytest.mark.parametrize(
        "n, expected_c4",
        [
            (2, 0.7979),
            (3, 0.8862),
            (5, 0.9400),
            (10, 0.9727),
            (15, 0.9823),
            (25, 0.9896),
        ],
    )
    def test_c4_nist_reference(self, n: int, expected_c4: float):
        """c4 values match NIST Engineering Statistics Handbook."""
        assert get_c4(n) == pytest.approx(expected_c4, abs=0.0001)

    @pytest.mark.parametrize(
        "n, expected_A2",
        [
            (2, 1.880),
            (3, 1.023),
            (5, 0.577),
            (10, 0.308),
            (15, 0.223),
            (25, 0.153),
        ],
    )
    def test_A2_nist_reference(self, n: int, expected_A2: float):
        """A2 values match NIST Engineering Statistics Handbook."""
        assert get_A2(n) == pytest.approx(expected_A2, abs=0.001)

    @pytest.mark.parametrize(
        "n, expected_D3, expected_D4",
        [
            (2, 0.0, 3.267),
            (3, 0.0, 2.574),
            (5, 0.0, 2.114),
            (6, 0.0, 2.004),
            (7, 0.076, 1.924),
            (10, 0.223, 1.777),
            (15, 0.347, 1.653),
            (25, 0.459, 1.541),
        ],
    )
    def test_D3_D4_nist_reference(self, n: int, expected_D3: float, expected_D4: float):
        """D3 and D4 values match NIST Engineering Statistics Handbook."""
        assert get_D3(n) == pytest.approx(expected_D3, abs=0.001)
        assert get_D4(n) == pytest.approx(expected_D4, abs=0.001)

    def test_A2_equals_3_over_d2_sqrt_n(self):
        """A2 = 3 / (d2 * sqrt(n)) -- verify the identity for n=2..10."""
        for n in range(2, 11):
            d2 = get_d2(n)
            expected_A2 = 3.0 / (d2 * math.sqrt(n))
            assert get_A2(n) == pytest.approx(expected_A2, abs=0.002)


class TestSigmaEstimationCrossValidation:
    """Cross-validate sigma estimation against raw numpy calculations."""

    def test_rbar_sigma_matches_numpy(self):
        """estimate_sigma_rbar matches manual numpy calculation."""
        ranges = [1.2, 1.5, 1.0, 1.3, 1.8, 0.9, 1.4, 1.6]
        n = 5

        # Independent numpy calculation
        r_bar = float(np.mean(ranges))
        d2 = get_d2(n)
        expected_sigma = r_bar / d2

        result = estimate_sigma_rbar(ranges, n)
        assert result == pytest.approx(expected_sigma, rel=1e-10)

    def test_sbar_sigma_matches_numpy(self):
        """estimate_sigma_sbar matches manual numpy calculation."""
        std_devs = [2.1, 2.3, 2.0, 2.2, 1.9, 2.4, 2.15, 2.05]
        n = 15

        # Independent numpy calculation
        s_bar = float(np.mean(std_devs))
        c4 = get_c4(n)
        expected_sigma = s_bar / c4

        result = estimate_sigma_sbar(std_devs, n)
        assert result == pytest.approx(expected_sigma, rel=1e-10)

    def test_moving_range_sigma_matches_numpy(self):
        """estimate_sigma_moving_range matches manual numpy calculation."""
        values = [10.0, 12.0, 11.0, 13.0, 10.0, 14.0, 11.5, 12.5]

        # Independent numpy calculation
        arr = np.array(values)
        moving_ranges = np.abs(np.diff(arr))
        mr_bar = float(np.mean(moving_ranges))
        d2 = get_d2(2)  # span=2
        expected_sigma = mr_bar / d2

        result = estimate_sigma_moving_range(values, span=2)
        assert result == pytest.approx(expected_sigma, rel=1e-10)

    def test_moving_range_span3_matches_numpy(self):
        """Moving range with span=3 matches manual numpy calculation."""
        values = [10.0, 12.0, 11.0, 13.0, 10.0, 14.0, 11.5]

        # Independent numpy calculation
        arr = np.array(values)
        mrs = np.array([np.ptp(arr[i : i + 3]) for i in range(len(arr) - 2)])
        mr_bar = float(np.mean(mrs))
        d2 = get_d2(3)
        expected_sigma = mr_bar / d2

        result = estimate_sigma_moving_range(values, span=3)
        assert result == pytest.approx(expected_sigma, rel=1e-10)


class TestXbarRLimitsReferenceValues:
    """Test X-bar R limits against hand-calculated reference values."""

    def test_nist_style_reference_dataset(self):
        """Full X-bar R calculation with independently verified reference values.

        Dataset: 5 subgroups of size 5
        Subgroup means: [20.0, 20.4, 19.6, 20.2, 19.8]
        Subgroup ranges: [1.0, 1.2, 0.8, 1.1, 0.9]

        Hand calculation:
          X-double-bar = (20.0+20.4+19.6+20.2+19.8)/5 = 100.0/5 = 20.0
          R-bar = (1.0+1.2+0.8+1.1+0.9)/5 = 5.0/5 = 1.0
          A2(5) = 0.577
          UCL_xbar = 20.0 + 0.577*1.0 = 20.577
          LCL_xbar = 20.0 - 0.577*1.0 = 19.423
          D3(5) = 0, D4(5) = 2.114
          UCL_R = 2.114 * 1.0 = 2.114
          LCL_R = 0 * 1.0 = 0.0
          sigma = R-bar/d2(5) = 1.0/2.326 = 0.4299
        """
        means = [20.0, 20.4, 19.6, 20.2, 19.8]
        ranges = [1.0, 1.2, 0.8, 1.1, 0.9]
        n = 5

        limits = calculate_xbar_r_limits(means, ranges, n)

        assert limits.xbar_limits.center_line == pytest.approx(20.0, abs=1e-10)
        assert limits.r_limits.center_line == pytest.approx(1.0, abs=1e-10)
        assert limits.xbar_limits.ucl == pytest.approx(20.577, abs=0.001)
        assert limits.xbar_limits.lcl == pytest.approx(19.423, abs=0.001)
        assert limits.r_limits.ucl == pytest.approx(2.114, abs=0.001)
        assert limits.r_limits.lcl == pytest.approx(0.0, abs=1e-10)
        assert limits.xbar_limits.sigma == pytest.approx(0.4299, abs=0.001)

    def test_ucl_lcl_symmetric_around_center(self):
        """UCL and LCL are exactly symmetric around the center line."""
        means = [50.1, 49.9, 50.2, 50.0, 49.8, 50.3]
        ranges = [2.0, 2.5, 1.8, 2.3, 2.1, 1.9]
        n = 5

        limits = calculate_xbar_r_limits(means, ranges, n)

        xbar_spread = limits.xbar_limits.ucl - limits.xbar_limits.center_line
        xbar_spread_lower = limits.xbar_limits.center_line - limits.xbar_limits.lcl
        assert xbar_spread == pytest.approx(xbar_spread_lower, rel=1e-10)

        r_spread = limits.r_limits.ucl - limits.r_limits.center_line
        r_expected_lcl_spread = limits.r_limits.center_line - limits.r_limits.lcl
        # R chart is NOT symmetric when D3 > 0, but for n=5 D3=0 so LCL=0
        assert limits.r_limits.lcl == 0.0

    def test_xbar_limits_equal_A2_times_rbar(self):
        """Verify UCL - center_line = A2 * R-bar (standard X-bar R formula).

        Note: A2 = 3/(d2*sqrt(n)) rounded to 3 decimal places, so using
        A2*R-bar is the standard approach and may differ slightly from
        3*sigma/sqrt(n) due to rounding in the A2 constant table.
        """
        means = [100.0, 100.5, 99.5, 100.2, 99.8]
        ranges = [2.5, 2.8, 2.3, 2.6, 2.4]
        n = 5

        limits = calculate_xbar_r_limits(means, ranges, n)

        r_bar = float(np.mean(ranges))
        A2 = get_A2(n)
        expected_spread = A2 * r_bar

        actual_spread = limits.xbar_limits.ucl - limits.xbar_limits.center_line
        assert actual_spread == pytest.approx(expected_spread, rel=1e-10)


class TestIMRLimitsReferenceValues:
    """Test I-MR limits against hand-calculated reference values."""

    def test_reference_dataset(self):
        """Full I-MR calculation with independently verified reference values.

        Dataset: [25, 28, 23, 27, 24, 26, 29, 22, 25, 28]

        Hand calculation:
          X-bar = 257/10 = 25.7
          MRs = [3, 5, 4, 3, 2, 3, 7, 3, 3] (9 values)
          MR-bar = 33/9 = 3.6667
          d2(2) = 1.128
          sigma = 3.6667 / 1.128 = 3.2506
          UCL = 25.7 + 3*3.2506 = 35.452
          LCL = 25.7 - 3*3.2506 = 15.948
          MR UCL = D4(2) * MR-bar = 3.267 * 3.6667 = 11.978
          MR LCL = D3(2) * MR-bar = 0 * 3.6667 = 0
        """
        values = [25.0, 28.0, 23.0, 27.0, 24.0, 26.0, 29.0, 22.0, 25.0, 28.0]

        limits = calculate_imr_limits(values)

        assert limits.xbar_limits.center_line == pytest.approx(25.7, abs=0.001)
        assert limits.xbar_limits.sigma == pytest.approx(3.2506, abs=0.01)
        assert limits.xbar_limits.ucl == pytest.approx(35.452, abs=0.05)
        assert limits.xbar_limits.lcl == pytest.approx(15.948, abs=0.05)
        assert limits.r_limits.center_line == pytest.approx(3.6667, abs=0.01)
        assert limits.r_limits.ucl == pytest.approx(11.978, abs=0.05)
        assert limits.r_limits.lcl == pytest.approx(0.0, abs=1e-10)

    def test_imr_cross_validate_with_numpy(self):
        """Cross-validate I-MR against raw numpy computation."""
        values = [10.5, 11.2, 10.8, 11.5, 10.3, 11.0, 10.7, 11.3, 10.6, 10.9]

        arr = np.array(values)
        expected_xbar = float(np.mean(arr))
        expected_mrs = np.abs(np.diff(arr))
        expected_mr_bar = float(np.mean(expected_mrs))
        expected_sigma = expected_mr_bar / 1.128  # d2(2)

        limits = calculate_imr_limits(values)

        assert limits.xbar_limits.center_line == pytest.approx(expected_xbar, rel=1e-10)
        assert limits.r_limits.center_line == pytest.approx(expected_mr_bar, rel=1e-10)
        assert limits.xbar_limits.sigma == pytest.approx(expected_sigma, rel=1e-10)
        assert limits.xbar_limits.ucl == pytest.approx(
            expected_xbar + 3 * expected_sigma, rel=1e-10
        )
        assert limits.xbar_limits.lcl == pytest.approx(
            expected_xbar - 3 * expected_sigma, rel=1e-10
        )


class TestZoneBoundariesReferenceValues:
    """Test zone boundary calculations with reference values."""

    def test_zones_match_sigma_multiples(self):
        """Zone boundaries are exactly 1, 2, 3 sigma from center line."""
        center = 50.0
        sigma = 2.5

        zones = calculate_zones(center, sigma)

        assert zones.plus_1_sigma == pytest.approx(center + 1 * sigma, rel=1e-10)
        assert zones.plus_2_sigma == pytest.approx(center + 2 * sigma, rel=1e-10)
        assert zones.plus_3_sigma == pytest.approx(center + 3 * sigma, rel=1e-10)
        assert zones.minus_1_sigma == pytest.approx(center - 1 * sigma, rel=1e-10)
        assert zones.minus_2_sigma == pytest.approx(center - 2 * sigma, rel=1e-10)
        assert zones.minus_3_sigma == pytest.approx(center - 3 * sigma, rel=1e-10)

    def test_zones_symmetry(self):
        """Upper and lower boundaries are symmetric around center."""
        center = 123.456
        sigma = 7.89

        zones = calculate_zones(center, sigma)

        assert (zones.plus_1_sigma - center) == pytest.approx(
            center - zones.minus_1_sigma, rel=1e-10
        )
        assert (zones.plus_2_sigma - center) == pytest.approx(
            center - zones.minus_2_sigma, rel=1e-10
        )
        assert (zones.plus_3_sigma - center) == pytest.approx(
            center - zones.minus_3_sigma, rel=1e-10
        )


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_all_identical_values_imr(self):
        """All identical values should produce zero sigma and collapsed limits."""
        values = [42.0] * 10
        limits = calculate_imr_limits(values)

        assert limits.xbar_limits.center_line == 42.0
        assert limits.xbar_limits.sigma == 0.0
        assert limits.xbar_limits.ucl == 42.0
        assert limits.xbar_limits.lcl == 42.0
        assert limits.r_limits.center_line == 0.0

    def test_all_identical_values_xbar_r(self):
        """All identical ranges=0 should produce zero sigma."""
        means = [100.0, 100.0, 100.0, 100.0]
        ranges = [0.0, 0.0, 0.0, 0.0]
        n = 5

        limits = calculate_xbar_r_limits(means, ranges, n)

        assert limits.xbar_limits.center_line == 100.0
        assert limits.xbar_limits.sigma == 0.0
        assert limits.xbar_limits.ucl == 100.0
        assert limits.xbar_limits.lcl == 100.0

    def test_minimum_subgroup_for_imr(self):
        """I-MR works with exactly 2 values (minimum for span=2)."""
        values = [10.0, 12.0]
        limits = calculate_imr_limits(values)

        assert limits.xbar_limits.center_line == 11.0
        assert limits.xbar_limits.sigma > 0
        assert limits.r_limits.center_line == 2.0  # Only 1 moving range

    def test_single_subgroup_xbar_r(self):
        """X-bar R works with a single subgroup."""
        means = [50.0]
        ranges = [3.0]
        n = 5

        limits = calculate_xbar_r_limits(means, ranges, n)

        assert limits.xbar_limits.center_line == 50.0
        assert limits.r_limits.center_line == 3.0
        assert limits.xbar_limits.sigma > 0

    def test_large_dataset_stability(self):
        """Verify numerical stability with a large dataset."""
        np.random.seed(42)
        values = list(np.random.normal(1000.0, 5.0, 500))

        limits = calculate_imr_limits(values)

        # Center should be close to 1000
        assert abs(limits.xbar_limits.center_line - 1000.0) < 2.0
        # Sigma should be close to 5.0 (within reasonable range)
        assert 3.0 < limits.xbar_limits.sigma < 8.0
        # Limits should be reasonable
        assert limits.xbar_limits.ucl > limits.xbar_limits.center_line
        assert limits.xbar_limits.lcl < limits.xbar_limits.center_line

    def test_negative_values(self):
        """SPC functions handle negative measurement values correctly."""
        values = [-5.0, -3.0, -4.0, -2.0, -6.0, -3.5, -4.5, -2.5, -5.5, -3.0]

        limits = calculate_imr_limits(values)

        assert limits.xbar_limits.center_line < 0
        assert limits.xbar_limits.sigma > 0
        assert limits.xbar_limits.ucl > limits.xbar_limits.lcl

    def test_very_small_values(self):
        """SPC functions handle very small values without precision loss."""
        values = [0.001, 0.0012, 0.0011, 0.0013, 0.001, 0.0014, 0.0009, 0.0011]

        limits = calculate_imr_limits(values)

        assert limits.xbar_limits.center_line > 0
        assert limits.xbar_limits.sigma > 0
        assert limits.xbar_limits.ucl > limits.xbar_limits.center_line
