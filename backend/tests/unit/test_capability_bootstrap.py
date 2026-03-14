"""Tests for bootstrap confidence intervals on capability indices.

Validates that:
  - CIs are narrower for larger samples (more precision)
  - CIs are wider for smaller samples (less precision)
  - Point estimates fall within CIs
  - USL-only, LSL-only, and bilateral specs are handled correctly
  - Edge cases (too few values, no spec limits) return empty dicts
"""

import numpy as np
import pytest

from cassini.core.capability import compute_capability_confidence_intervals


# ---------------------------------------------------------------------------
# Fixtures: deterministic datasets
# ---------------------------------------------------------------------------

def _normal_data(n: int, mean: float = 10.0, std: float = 1.0, seed: int = 0) -> list[float]:
    """Generate reproducible normal data."""
    rng = np.random.default_rng(seed)
    return rng.normal(loc=mean, scale=std, size=n).tolist()


# ---------------------------------------------------------------------------
# Basic functionality
# ---------------------------------------------------------------------------

class TestBootstrapCIBasics:
    """Core bootstrap CI behaviour."""

    def test_bilateral_returns_ppk_and_pp(self):
        data = _normal_data(100)
        result = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0, sigma_within=1.0,
        )
        assert "ppk" in result
        assert "pp" in result
        # Each CI is a (lower, upper) tuple
        assert len(result["ppk"]) == 2
        assert result["ppk"][0] < result["ppk"][1]
        assert len(result["pp"]) == 2
        assert result["pp"][0] < result["pp"][1]

    def test_bilateral_returns_cpk_when_sigma_within_provided(self):
        data = _normal_data(100)
        result = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0, sigma_within=1.0,
        )
        assert "cpk" in result
        assert len(result["cpk"]) == 2
        assert result["cpk"][0] < result["cpk"][1]

    def test_no_cpk_without_sigma_within(self):
        data = _normal_data(100)
        result = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0,
        )
        assert "cpk" not in result
        assert "ppk" in result

    def test_usl_only(self):
        data = _normal_data(100)
        result = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=None,
        )
        assert "ppk" in result
        # No Pp for one-sided specs
        assert "pp" not in result

    def test_lsl_only(self):
        data = _normal_data(100)
        result = compute_capability_confidence_intervals(
            measurements=data, usl=None, lsl=7.0,
        )
        assert "ppk" in result
        assert "pp" not in result

    def test_cpk_usl_only(self):
        data = _normal_data(100)
        result = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=None, sigma_within=1.0,
        )
        assert "cpk" in result
        assert result["cpk"][0] < result["cpk"][1]

    def test_cpk_lsl_only(self):
        data = _normal_data(100)
        result = compute_capability_confidence_intervals(
            measurements=data, usl=None, lsl=7.0, sigma_within=1.0,
        )
        assert "cpk" in result
        assert result["cpk"][0] < result["cpk"][1]


# ---------------------------------------------------------------------------
# CI width vs sample size
# ---------------------------------------------------------------------------

class TestBootstrapCIWidth:
    """CIs should narrow with more data and widen with less."""

    def test_large_sample_narrow_ci(self):
        data_large = _normal_data(500, mean=10.0, std=1.0)
        data_small = _normal_data(30, mean=10.0, std=1.0, seed=1)

        ci_large = compute_capability_confidence_intervals(
            measurements=data_large, usl=13.0, lsl=7.0,
        )
        ci_small = compute_capability_confidence_intervals(
            measurements=data_small, usl=13.0, lsl=7.0,
        )

        width_large = ci_large["ppk"][1] - ci_large["ppk"][0]
        width_small = ci_small["ppk"][1] - ci_small["ppk"][0]

        assert width_large < width_small, (
            f"Large-sample CI width ({width_large:.4f}) should be narrower "
            f"than small-sample CI width ({width_small:.4f})"
        )

    def test_large_sample_narrow_cpk_ci(self):
        data_large = _normal_data(500, mean=10.0, std=1.0)
        data_small = _normal_data(30, mean=10.0, std=1.0, seed=1)

        ci_large = compute_capability_confidence_intervals(
            measurements=data_large, usl=13.0, lsl=7.0, sigma_within=1.0,
        )
        ci_small = compute_capability_confidence_intervals(
            measurements=data_small, usl=13.0, lsl=7.0, sigma_within=1.0,
        )

        width_large = ci_large["cpk"][1] - ci_large["cpk"][0]
        width_small = ci_small["cpk"][1] - ci_small["cpk"][0]

        assert width_large < width_small, (
            f"Large-sample Cpk CI width ({width_large:.4f}) should be narrower "
            f"than small-sample Cpk CI width ({width_small:.4f})"
        )


# ---------------------------------------------------------------------------
# Point estimate containment
# ---------------------------------------------------------------------------

class TestBootstrapCIContainment:
    """Point estimates should typically fall within bootstrap CIs."""

    def test_ppk_point_estimate_within_ci(self):
        data = _normal_data(200, mean=10.0, std=1.0)
        ci = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0,
        )
        # Compute point estimate of Ppk
        arr = np.array(data)
        mean = float(np.mean(arr))
        sigma = float(np.std(arr, ddof=1))
        ppu = (13.0 - mean) / (3.0 * sigma)
        ppl = (mean - 7.0) / (3.0 * sigma)
        ppk_point = min(ppu, ppl)

        lo, hi = ci["ppk"]
        assert lo <= ppk_point <= hi, (
            f"Ppk point estimate {ppk_point:.4f} not within CI [{lo:.4f}, {hi:.4f}]"
        )

    def test_cpk_point_estimate_within_ci(self):
        data = _normal_data(200, mean=10.0, std=1.0)
        sigma_within = 1.0
        ci = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0, sigma_within=sigma_within,
        )
        arr = np.array(data)
        mean = float(np.mean(arr))
        cpu = (13.0 - mean) / (3.0 * sigma_within)
        cpl = (mean - 7.0) / (3.0 * sigma_within)
        cpk_point = min(cpu, cpl)

        lo, hi = ci["cpk"]
        assert lo <= cpk_point <= hi, (
            f"Cpk point estimate {cpk_point:.4f} not within CI [{lo:.4f}, {hi:.4f}]"
        )

    def test_pp_point_estimate_within_ci(self):
        data = _normal_data(200, mean=10.0, std=1.0)
        ci = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0,
        )
        arr = np.array(data)
        sigma = float(np.std(arr, ddof=1))
        pp_point = (13.0 - 7.0) / (6.0 * sigma)

        lo, hi = ci["pp"]
        assert lo <= pp_point <= hi, (
            f"Pp point estimate {pp_point:.4f} not within CI [{lo:.4f}, {hi:.4f}]"
        )


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestBootstrapCIEdgeCases:
    """Edge cases that should return empty or handle gracefully."""

    def test_fewer_than_2_values_returns_empty(self):
        result = compute_capability_confidence_intervals(
            measurements=[5.0], usl=10.0, lsl=0.0,
        )
        assert result == {}

    def test_no_spec_limits_returns_empty(self):
        data = _normal_data(50)
        result = compute_capability_confidence_intervals(
            measurements=data, usl=None, lsl=None,
        )
        assert result == {}

    def test_zero_sigma_within_no_cpk(self):
        data = _normal_data(50)
        result = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0, sigma_within=0.0,
        )
        # sigma_within=0 should not produce Cpk CI
        assert "cpk" not in result
        # But Ppk should still be computed
        assert "ppk" in result

    def test_custom_confidence_level(self):
        data = _normal_data(100)
        ci_95 = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0, confidence=0.95,
        )
        ci_99 = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0, confidence=0.99,
        )
        # 99% CI should be wider than 95% CI
        width_95 = ci_95["ppk"][1] - ci_95["ppk"][0]
        width_99 = ci_99["ppk"][1] - ci_99["ppk"][0]
        assert width_99 > width_95

    def test_custom_n_bootstrap(self):
        data = _normal_data(50)
        # Just verify it doesn't crash with different n_bootstrap
        result = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0, n_bootstrap=500,
        )
        assert "ppk" in result

    def test_deterministic_with_fixed_seed(self):
        """Bootstrap uses seed=42 internally — results should be reproducible."""
        data = _normal_data(100)
        r1 = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0,
        )
        r2 = compute_capability_confidence_intervals(
            measurements=data, usl=13.0, lsl=7.0,
        )
        assert r1 == r2
