"""Tests for Z-bench, PPM, and stability warning in capability calculations.

Validates:
  - Z-bench within and overall both computed for bilateral specs
  - PPM within expected for capable process < 1000
  - One-sided specs (USL only, LSL only) produce correct Z-bench/PPM
  - Z-bench capped at 6.0 (practical limit)
  - Stability warning field is passed through correctly
  - ISO 22514 convention: NO Motorola 1.5-sigma shift applied

References:
  - ISO 22514-2:2017, Section 6
  - Montgomery (2019), "Introduction to Statistical Quality Control", 8th Ed., Section 8.2
"""

import numpy as np
import pytest
from scipy import stats as scipy_stats

from cassini.core.capability import CapabilityResult, calculate_capability


# ---------------------------------------------------------------------------
# Fixtures: deterministic datasets
# ---------------------------------------------------------------------------

def _normal_data(n: int, mean: float = 10.0, std: float = 1.0, seed: int = 0) -> list[float]:
    """Generate reproducible normal data."""
    rng = np.random.default_rng(seed)
    return rng.normal(loc=mean, scale=std, size=n).tolist()


# ---------------------------------------------------------------------------
# Z-bench within and overall
# ---------------------------------------------------------------------------

class TestZBenchComputation:
    """Z-bench should be computed from PPM defective rates."""

    def test_zbench_within_and_overall_both_computed(self):
        """Both z_bench_within and z_bench_overall should be populated."""
        data = _normal_data(200, mean=10.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=13.0,
            lsl=7.0,
            sigma_within=1.0,
        )
        assert result.z_bench_within is not None, "z_bench_within should be computed"
        assert result.z_bench_overall is not None, "z_bench_overall should be computed"

    def test_zbench_overall_without_sigma_within(self):
        """z_bench_overall should still be computed even without sigma_within."""
        data = _normal_data(200, mean=10.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=13.0,
            lsl=7.0,
            sigma_within=None,
        )
        assert result.z_bench_within is None, "z_bench_within should be None without sigma_within"
        assert result.z_bench_overall is not None, "z_bench_overall should always be computed"

    def test_zbench_no_motorola_shift(self):
        """Z-bench should NOT include the Motorola 1.5-sigma shift (ISO 22514 convention)."""
        # For a perfectly centered process with USL=LSL=3*sigma, z_bench should be ~3.0
        # NOT 4.5 (which would include the 1.5-sigma shift).
        n = 10000
        data = _normal_data(n, mean=0.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=3.0,
            lsl=-3.0,
            sigma_within=1.0,
        )
        # With sigma_within=1.0, USL-mean=3, LSL-mean=-3
        # PPM_upper = norm.sf(3.0) * 1e6 = 1350
        # PPM_lower = norm.cdf(-3.0) * 1e6 = 1350
        # total_defect_prob = 2700 / 1e6
        # z_bench = norm.ppf(1 - 0.0027) = ~2.78
        # Definitely NOT ~4.5
        assert result.z_bench_within is not None
        assert result.z_bench_within < 4.0, (
            f"Z-bench within={result.z_bench_within:.4f} suggests Motorola shift was applied"
        )

    def test_zbench_values_reasonable_for_capable_process(self):
        """A well-centered process with 3-sigma specs should have z_bench ~3."""
        data = _normal_data(5000, mean=0.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=3.0,
            lsl=-3.0,
            sigma_within=1.0,
        )
        # z_bench_within should be around 2.78 (theoretical for 3-sigma bilateral)
        assert result.z_bench_within is not None
        assert 2.0 < result.z_bench_within < 4.0


# ---------------------------------------------------------------------------
# PPM expected
# ---------------------------------------------------------------------------

class TestPPMExpected:
    """PPM expected should be model-based (not observed counts)."""

    def test_ppm_within_for_capable_process_under_1000(self):
        """A well-centered process with wide specs should have low PPM."""
        # USL/LSL at 4-sigma from mean => PPM ~63.3 total (expected)
        data = _normal_data(500, mean=10.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=14.0,
            lsl=6.0,
            sigma_within=1.0,
        )
        assert result.ppm_within_expected is not None
        assert result.ppm_within_expected < 1000, (
            f"PPM within={result.ppm_within_expected:.1f} should be < 1000 for 4-sigma process"
        )

    def test_ppm_overall_computed(self):
        """PPM overall should always be computed when specs exist."""
        data = _normal_data(200, mean=10.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=14.0,
            lsl=6.0,
        )
        assert result.ppm_overall_expected is not None
        assert result.ppm_overall_expected >= 0

    def test_ppm_within_not_computed_without_sigma_within(self):
        """PPM within should be None without sigma_within."""
        data = _normal_data(200, mean=10.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=14.0,
            lsl=6.0,
            sigma_within=None,
        )
        assert result.ppm_within_expected is None


# ---------------------------------------------------------------------------
# One-sided specs
# ---------------------------------------------------------------------------

class TestOneSidedSpecs:
    """One-sided specs: set missing side to 0 PPM."""

    def test_usl_only_zbench(self):
        """USL-only: PPM from upper tail only, lower = 0."""
        data = _normal_data(200, mean=10.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=13.0,
            lsl=None,
            sigma_within=1.0,
        )
        assert result.z_bench_within is not None
        assert result.z_bench_overall is not None
        assert result.ppm_within_expected is not None
        # For USL-only, PPM should just be upper tail
        # With mean~10, sigma=1, USL=13: PPM ~1350
        assert result.ppm_within_expected < 5000

    def test_lsl_only_zbench(self):
        """LSL-only: PPM from lower tail only, upper = 0."""
        data = _normal_data(200, mean=10.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=None,
            lsl=7.0,
            sigma_within=1.0,
        )
        assert result.z_bench_within is not None
        assert result.z_bench_overall is not None
        assert result.ppm_within_expected is not None
        assert result.ppm_within_expected < 5000

    def test_usl_only_ppm_is_upper_tail_only(self):
        """USL-only PPM should equal just the upper tail defect rate."""
        data = _normal_data(1000, mean=0.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=3.0,
            lsl=None,
            sigma_within=1.0,
        )
        # Expected: norm.sf((USL - sample_mean) / sigma_within) * 1e6
        # Use the actual sample mean (not theoretical 0.0) since the
        # formula uses the sample mean from the data.
        sample_mean = float(np.mean(data))
        expected_ppm = scipy_stats.norm.sf((3.0 - sample_mean) / 1.0) * 1e6
        assert result.ppm_within_expected is not None
        assert abs(result.ppm_within_expected - expected_ppm) < 1.0


# ---------------------------------------------------------------------------
# Z-bench cap at 6.0
# ---------------------------------------------------------------------------

class TestZBenchCap:
    """Z-bench should be capped at 6.0 (practical limit)."""

    def test_zbench_capped_at_6(self):
        """An extremely capable process should cap z_bench at 6.0."""
        # USL/LSL at 10-sigma from mean => PPM ~0 => z_bench would be infinity
        data = _normal_data(500, mean=0.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=10.0,
            lsl=-10.0,
            sigma_within=1.0,
        )
        assert result.z_bench_within is not None
        assert result.z_bench_within <= 6.0, (
            f"Z-bench within={result.z_bench_within:.4f} should be capped at 6.0"
        )

    def test_zbench_overall_capped_at_6(self):
        """z_bench_overall should also be capped at 6.0."""
        data = _normal_data(500, mean=0.0, std=0.1)
        result = calculate_capability(
            values=data,
            usl=10.0,
            lsl=-10.0,
        )
        assert result.z_bench_overall is not None
        assert result.z_bench_overall <= 6.0


# ---------------------------------------------------------------------------
# Stability warning fields
# ---------------------------------------------------------------------------

class TestStabilityWarningFields:
    """CapabilityResult should carry stability warning fields."""

    def test_stability_warning_defaults_to_none(self):
        """Default stability_warning should be None."""
        data = _normal_data(50, mean=10.0, std=1.0)
        result = calculate_capability(
            values=data,
            usl=13.0,
            lsl=7.0,
            sigma_within=1.0,
        )
        assert result.stability_warning is None
        assert result.recent_violation_count == 0

    def test_stability_warning_fields_exist(self):
        """CapabilityResult should have stability_warning and recent_violation_count."""
        data = _normal_data(50)
        result = calculate_capability(
            values=data,
            usl=13.0,
            lsl=7.0,
        )
        assert hasattr(result, "stability_warning")
        assert hasattr(result, "recent_violation_count")


# ---------------------------------------------------------------------------
# Show Your Work integration
# ---------------------------------------------------------------------------

class TestZBenchShowYourWork:
    """Z-bench/PPM computations should integrate with ExplanationCollector."""

    def test_collector_step_added(self):
        """When collector is provided, Z-bench step should be added."""
        from cassini.core.explain import ExplanationCollector

        data = _normal_data(200, mean=10.0, std=1.0)
        collector = ExplanationCollector()
        calculate_capability(
            values=data,
            usl=13.0,
            lsl=7.0,
            sigma_within=1.0,
            collector=collector,
        )
        zbench_steps = [s for s in collector.steps if "Z.Bench" in s.label]
        assert len(zbench_steps) >= 1, "Expected at least one Z.Bench step in collector"
        # Verify ISO citation
        zbench_step = zbench_steps[0]
        assert zbench_step.note is not None and "ISO 22514" in zbench_step.note, (
            "Z.Bench step should cite ISO 22514"
        )
