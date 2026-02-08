"""Integration tests for ControlLimitService.

Tests verify:
- _select_method() routes correctly for n=1, n=5, n=15
- UCL - center_line = 3 * sigma / sqrt(n) for subgrouped charts
- UCL/LCL symmetric around center_line
- Process sigma (not sigma_xbar) is returned in result.sigma
"""

import math
from unittest.mock import MagicMock

import numpy as np
import pytest

from openspc.core.engine.control_limits import ControlLimitService
from openspc.db.models.sample import Measurement, Sample


def _make_service() -> ControlLimitService:
    return ControlLimitService(
        sample_repo=MagicMock(),
        char_repo=MagicMock(),
        window_manager=MagicMock(),
    )


def _make_samples_n1(values: list[float]) -> list:
    """Create mock samples with 1 measurement each."""
    samples = []
    for v in values:
        sample = MagicMock(spec=Sample)
        m = MagicMock(spec=Measurement)
        m.value = v
        sample.measurements = [m]
        samples.append(sample)
    return samples


def _make_samples_subgroup(subgroups: list[list[float]]) -> list:
    """Create mock samples with multiple measurements each."""
    samples = []
    for sg in subgroups:
        sample = MagicMock(spec=Sample)
        measurements = []
        for v in sg:
            m = MagicMock(spec=Measurement)
            m.value = v
            measurements.append(m)
        sample.measurements = measurements
        samples.append(sample)
    return samples


class TestSelectMethod:
    """Verify method routing based on subgroup size."""

    @pytest.mark.parametrize("n, expected", [
        (1, "moving_range"),
        (2, "r_bar_d2"),
        (5, "r_bar_d2"),
        (10, "r_bar_d2"),
        (11, "s_bar_c4"),
        (15, "s_bar_c4"),
        (25, "s_bar_c4"),
    ])
    def test_method_routing(self, n: int, expected: str):
        service = _make_service()
        assert service._select_method(n) == expected


class TestRBarLimitSymmetry:
    """Verify UCL - CL = CL - LCL and UCL - CL = 3*sigma/sqrt(n) for R-bar method."""

    @pytest.mark.parametrize("n", [2, 3, 5, 7, 10])
    def test_xbar_limits_symmetric(self, n: int):
        """UCL and LCL are symmetric around center_line."""
        service = _make_service()

        # Generate subgroups with known variation
        np.random.seed(42)
        subgroups = [list(np.random.normal(100, 2, n)) for _ in range(25)]
        samples = _make_samples_subgroup(subgroups)

        center_line, ucl, lcl, sigma = service._calculate_r_bar(samples, subgroup_size=n)

        upper_spread = ucl - center_line
        lower_spread = center_line - lcl
        assert upper_spread == pytest.approx(lower_spread, rel=1e-10)

    @pytest.mark.parametrize("n", [2, 3, 5, 7, 10])
    def test_xbar_spread_equals_3_sigma_over_sqrt_n(self, n: int):
        """UCL - center_line = 3 * sigma / sqrt(n)."""
        service = _make_service()

        np.random.seed(42)
        subgroups = [list(np.random.normal(50, 3, n)) for _ in range(25)]
        samples = _make_samples_subgroup(subgroups)

        center_line, ucl, lcl, sigma = service._calculate_r_bar(samples, subgroup_size=n)

        expected_spread = 3 * sigma / math.sqrt(n)
        actual_spread = ucl - center_line
        assert actual_spread == pytest.approx(expected_spread, rel=1e-10)


class TestSBarLimitSymmetry:
    """Verify UCL - CL = CL - LCL and UCL - CL = 3*sigma/sqrt(n) for S-bar method."""

    @pytest.mark.parametrize("n", [11, 15, 20, 25])
    def test_xbar_limits_symmetric(self, n: int):
        """UCL and LCL are symmetric around center_line."""
        service = _make_service()

        np.random.seed(42)
        subgroups = [list(np.random.normal(100, 2, n)) for _ in range(25)]
        samples = _make_samples_subgroup(subgroups)

        center_line, ucl, lcl, sigma = service._calculate_s_bar(samples, subgroup_size=n)

        upper_spread = ucl - center_line
        lower_spread = center_line - lcl
        assert upper_spread == pytest.approx(lower_spread, rel=1e-10)

    @pytest.mark.parametrize("n", [11, 15, 20, 25])
    def test_xbar_spread_equals_3_sigma_over_sqrt_n(self, n: int):
        """UCL - center_line = 3 * sigma / sqrt(n)."""
        service = _make_service()

        np.random.seed(42)
        subgroups = [list(np.random.normal(50, 3, n)) for _ in range(25)]
        samples = _make_samples_subgroup(subgroups)

        center_line, ucl, lcl, sigma = service._calculate_s_bar(samples, subgroup_size=n)

        expected_spread = 3 * sigma / math.sqrt(n)
        actual_spread = ucl - center_line
        assert actual_spread == pytest.approx(expected_spread, rel=1e-10)


class TestMovingRangeLimitSymmetry:
    """Verify I-chart limits are symmetric (sigma/sqrt(1) = sigma)."""

    def test_i_chart_limits_symmetric(self):
        """UCL and LCL are symmetric around center_line for I chart."""
        service = _make_service()

        values = [10.0, 12.0, 11.0, 13.0, 10.0, 11.5, 12.5, 10.5, 11.0, 13.0,
                  10.5, 12.0, 11.5, 10.0, 13.5, 11.0, 12.0, 10.5, 11.5, 12.5,
                  10.0, 13.0, 11.0, 12.0, 10.5]
        samples = _make_samples_n1(values)

        center_line, ucl, lcl, sigma = service._calculate_moving_range(samples)

        upper_spread = ucl - center_line
        lower_spread = center_line - lcl
        assert upper_spread == pytest.approx(lower_spread, rel=1e-10)

    def test_i_chart_spread_equals_3_sigma(self):
        """UCL - center_line = 3 * sigma for I chart (n=1, so sigma_xbar = sigma)."""
        service = _make_service()

        values = [10.0, 12.0, 11.0, 13.0, 10.0, 11.5, 12.5, 10.5, 11.0, 13.0]
        samples = _make_samples_n1(values)

        center_line, ucl, lcl, sigma = service._calculate_moving_range(samples)

        expected_spread = 3 * sigma
        actual_spread = ucl - center_line
        assert actual_spread == pytest.approx(expected_spread, rel=1e-10)


class TestProcessSigmaReturned:
    """Verify that the service returns process sigma, NOT sigma_xbar."""

    def test_r_bar_returns_process_sigma(self):
        """_calculate_r_bar returns process sigma (not sigma/sqrt(n))."""
        service = _make_service()

        np.random.seed(42)
        n = 5
        subgroups = [list(np.random.normal(100, 2, n)) for _ in range(25)]
        samples = _make_samples_subgroup(subgroups)

        center_line, ucl, lcl, sigma = service._calculate_r_bar(samples, subgroup_size=n)

        # sigma should be process sigma (~2.0), not sigma_xbar (~2/sqrt(5)=~0.89)
        # The UCL spread uses sigma_xbar, so: spread = 3 * sigma / sqrt(n)
        spread = ucl - center_line
        sigma_xbar_from_spread = spread / 3.0
        sigma_from_sigma_xbar = sigma_xbar_from_spread * math.sqrt(n)

        # The returned sigma should equal the process sigma derived from limits
        assert sigma == pytest.approx(sigma_from_sigma_xbar, rel=1e-10)

    def test_s_bar_returns_process_sigma(self):
        """_calculate_s_bar returns process sigma (not sigma/sqrt(n))."""
        service = _make_service()

        np.random.seed(42)
        n = 15
        subgroups = [list(np.random.normal(100, 2, n)) for _ in range(25)]
        samples = _make_samples_subgroup(subgroups)

        center_line, ucl, lcl, sigma = service._calculate_s_bar(samples, subgroup_size=n)

        spread = ucl - center_line
        sigma_xbar_from_spread = spread / 3.0
        sigma_from_sigma_xbar = sigma_xbar_from_spread * math.sqrt(n)

        assert sigma == pytest.approx(sigma_from_sigma_xbar, rel=1e-10)


class TestCrossValidation:
    """Cross-validate service calculations against raw numpy."""

    def test_r_bar_matches_direct_calculation(self):
        """Service R-bar results match independent numpy calculation."""
        service = _make_service()

        subgroups = [
            [10.0, 10.2, 10.1, 10.3, 10.0],
            [10.5, 10.7, 10.6, 10.8, 10.5],
            [9.8, 10.0, 9.9, 10.1, 9.8],
            [10.2, 10.4, 10.3, 10.5, 10.2],
            [10.1, 10.3, 10.2, 10.4, 10.1],
        ]
        samples = _make_samples_subgroup(subgroups)
        n = 5

        center_line, ucl, lcl, sigma = service._calculate_r_bar(samples, subgroup_size=n)

        # Independent calculation with numpy
        means = [float(np.mean(sg)) for sg in subgroups]
        ranges = [float(np.ptp(sg)) for sg in subgroups]
        expected_center = float(np.mean(means))
        expected_r_bar = float(np.mean(ranges))
        from openspc.utils.constants import get_d2
        expected_sigma = expected_r_bar / get_d2(n)
        expected_sigma_xbar = expected_sigma / math.sqrt(n)

        assert center_line == pytest.approx(expected_center, rel=1e-10)
        assert sigma == pytest.approx(expected_sigma, rel=1e-10)
        assert ucl == pytest.approx(expected_center + 3 * expected_sigma_xbar, rel=1e-10)
        assert lcl == pytest.approx(expected_center - 3 * expected_sigma_xbar, rel=1e-10)

    def test_s_bar_matches_direct_calculation(self):
        """Service S-bar results match independent numpy calculation."""
        service = _make_service()

        np.random.seed(123)
        n = 15
        subgroups = [list(np.random.normal(50, 3, n)) for _ in range(10)]
        samples = _make_samples_subgroup(subgroups)

        center_line, ucl, lcl, sigma = service._calculate_s_bar(samples, subgroup_size=n)

        # Independent calculation with numpy
        means = [float(np.mean(sg)) for sg in subgroups]
        stds = [float(np.std(sg, ddof=1)) for sg in subgroups]
        expected_center = float(np.mean(means))
        expected_s_bar = float(np.mean(stds))
        from openspc.utils.constants import get_c4
        expected_sigma = expected_s_bar / get_c4(n)
        expected_sigma_xbar = expected_sigma / math.sqrt(n)

        assert center_line == pytest.approx(expected_center, rel=1e-10)
        assert sigma == pytest.approx(expected_sigma, rel=1e-10)
        assert ucl == pytest.approx(expected_center + 3 * expected_sigma_xbar, rel=1e-10)
        assert lcl == pytest.approx(expected_center - 3 * expected_sigma_xbar, rel=1e-10)
