"""Tests for the MEWMA engine UCL table, interpolation, and fallback."""

from __future__ import annotations

import warnings

import numpy as np
import pytest
from scipy import stats

from cassini.core.multivariate.mewma import (
    MEWMAEngine,
    _UCL_TABLE,
    _compute_mewma_ucl,
    _interpolate_ucl,
    resolve_ucl,
)


# ---------------------------------------------------------------------------
# Table integrity
# ---------------------------------------------------------------------------

class TestUCLTable:
    """Verify the tabulated UCL values are self-consistent."""

    def test_table_has_entries_for_p2_through_p10(self) -> None:
        for p in range(2, 11):
            for lam in [0.05, 0.10, 0.20]:
                assert (p, lam) in _UCL_TABLE, f"Missing ({p}, {lam})"

    def test_ucl_increases_with_p(self) -> None:
        """For fixed lambda, UCL must increase with p."""
        for lam in [0.05, 0.10, 0.20]:
            for p in range(2, 10):
                assert _UCL_TABLE[(p, lam)] < _UCL_TABLE[(p + 1, lam)], (
                    f"UCL did not increase: ({p},{lam})={_UCL_TABLE[(p, lam)]} "
                    f">= ({p+1},{lam})={_UCL_TABLE[(p + 1, lam)]}"
                )

    def test_ucl_decreases_with_lambda(self) -> None:
        """For fixed p, UCL must decrease as lambda increases."""
        for p in range(2, 11):
            assert _UCL_TABLE[(p, 0.05)] > _UCL_TABLE[(p, 0.10)] > _UCL_TABLE[(p, 0.20)], (
                f"UCL not monotonically decreasing with lambda for p={p}"
            )

    def test_known_p2_lambda010(self) -> None:
        """Verify a known value from Lowry et al. Table 3."""
        assert _UCL_TABLE[(2, 0.10)] == pytest.approx(10.55, abs=0.01)

    def test_known_p5_lambda005(self) -> None:
        assert _UCL_TABLE[(5, 0.05)] == pytest.approx(16.55, abs=0.01)


# ---------------------------------------------------------------------------
# Interpolation
# ---------------------------------------------------------------------------

class TestInterpolation:
    def test_lambda_015_interpolates_between_010_and_020(self) -> None:
        """Lambda=0.15 should be the midpoint of lambda=0.10 and 0.20."""
        for p in range(2, 11):
            ucl_lo = _UCL_TABLE[(p, 0.10)]
            ucl_hi = _UCL_TABLE[(p, 0.20)]
            expected = (ucl_lo + ucl_hi) / 2
            result = _interpolate_ucl(p, 0.15)
            assert result is not None
            assert result == pytest.approx(expected, abs=1e-10), (
                f"Interpolation failed for p={p}, lambda=0.15"
            )

    def test_exact_match_returns_table_value(self) -> None:
        result = _interpolate_ucl(4, 0.10)
        assert result == 14.45

    def test_outside_range_returns_none(self) -> None:
        # lambda=0.01 is below the minimum tabulated lambda (0.05)
        result = _interpolate_ucl(3, 0.01)
        assert result is None

    def test_unknown_p_returns_none(self) -> None:
        result = _interpolate_ucl(15, 0.10)
        assert result is None


# ---------------------------------------------------------------------------
# Dynamic fallback
# ---------------------------------------------------------------------------

class TestDynamicFallback:
    def test_p8_lambda010_reasonable_range(self) -> None:
        """p=8, lambda=0.10 should be near the chi-squared value for p=8."""
        ucl = _compute_mewma_ucl(8, 0.10)
        chi2_val = stats.chi2.ppf(0.9973, 8)
        # MEWMA UCL is typically 85-95% of the chi-squared 3-sigma value
        assert 0.80 * chi2_val < ucl < chi2_val, (
            f"UCL {ucl} not in expected range relative to chi2={chi2_val}"
        )

    def test_p15_returns_value(self) -> None:
        """Fallback should work for p=15 (outside the table)."""
        ucl = resolve_ucl(15, 0.10)
        assert ucl > 0
        # Should be less than chi2(0.9973, 15)
        chi2_val = stats.chi2.ppf(0.9973, 15)
        assert ucl < chi2_val

    def test_p15_ucl_increases_from_p10(self) -> None:
        ucl_10 = resolve_ucl(10, 0.10)
        ucl_15 = resolve_ucl(15, 0.10)
        assert ucl_15 > ucl_10

    def test_p25_emits_warning(self) -> None:
        """p > 20 should emit a warning about reliability."""
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            resolve_ucl(25, 0.10)
            assert len(w) == 1
            assert "unreliable" in str(w[0].message).lower()

    def test_fallback_matches_table_for_known_values(self) -> None:
        """The dynamic approximation should closely match the table."""
        for p in range(2, 6):
            for lam in [0.05, 0.10, 0.20]:
                approx_ucl = _compute_mewma_ucl(p, lam)
                table_ucl = _UCL_TABLE[(p, lam)]
                assert approx_ucl == pytest.approx(table_ucl, abs=0.15), (
                    f"Approximation {approx_ucl:.2f} too far from table "
                    f"{table_ucl} for (p={p}, lam={lam})"
                )

    def test_lambda_030_via_fallback(self) -> None:
        """Lambda=0.30 is outside the table — should use extrapolation."""
        ucl = resolve_ucl(4, 0.30)
        # Should be less than lambda=0.20 value (higher lambda = lower UCL)
        assert ucl < _UCL_TABLE[(4, 0.20)]
        assert ucl > 0


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

class TestValidation:
    def test_lambda_zero_raises(self) -> None:
        with pytest.raises(ValueError, match="lambda_param must be in"):
            resolve_ucl(3, 0.0)

    def test_lambda_negative_raises(self) -> None:
        with pytest.raises(ValueError, match="lambda_param must be in"):
            resolve_ucl(3, -0.1)

    def test_lambda_above_one_raises(self) -> None:
        with pytest.raises(ValueError, match="lambda_param must be in"):
            resolve_ucl(3, 1.5)

    def test_lambda_one_allowed(self) -> None:
        # lambda=1.0 is valid (no smoothing — equivalent to Hotelling T²)
        ucl = resolve_ucl(3, 1.0)
        assert ucl > 0

    def test_p_zero_raises(self) -> None:
        with pytest.raises(ValueError, match="p must be >= 1"):
            resolve_ucl(0, 0.10)


# ---------------------------------------------------------------------------
# resolve_ucl integration
# ---------------------------------------------------------------------------

class TestResolveUCL:
    def test_exact_table_lookup(self) -> None:
        assert resolve_ucl(3, 0.10) == 12.55

    def test_interpolation_path(self) -> None:
        # Lambda=0.15 is between 0.10 and 0.20 — should interpolate
        ucl = resolve_ucl(5, 0.15)
        expected = (_UCL_TABLE[(5, 0.10)] + _UCL_TABLE[(5, 0.20)]) / 2
        assert ucl == pytest.approx(expected, abs=1e-10)

    def test_fallback_path(self) -> None:
        # p=12 is outside the table — should use dynamic approximation
        ucl = resolve_ucl(12, 0.10)
        assert ucl > resolve_ucl(10, 0.10)


# ---------------------------------------------------------------------------
# Engine integration
# ---------------------------------------------------------------------------

class TestMEWMAEngine:
    def test_engine_uses_resolve_ucl(self) -> None:
        """Engine should use resolve_ucl when ucl is not provided."""
        engine = MEWMAEngine()
        rng = np.random.default_rng(42)
        X = rng.standard_normal((20, 3))
        cov = np.eye(3)

        points = engine.compute_chart_data(X, cov, lambda_param=0.10)
        assert len(points) == 20
        # UCL should match the table value for p=3, lambda=0.10
        assert points[0].ucl == pytest.approx(12.55, abs=0.01)

    def test_engine_with_explicit_ucl(self) -> None:
        engine = MEWMAEngine()
        rng = np.random.default_rng(42)
        X = rng.standard_normal((10, 2))
        cov = np.eye(2)

        points = engine.compute_chart_data(X, cov, lambda_param=0.10, ucl=15.0)
        assert all(pt.ucl == 15.0 for pt in points)

    def test_engine_with_interpolated_lambda(self) -> None:
        engine = MEWMAEngine()
        rng = np.random.default_rng(42)
        X = rng.standard_normal((10, 4))
        cov = np.eye(4)

        points = engine.compute_chart_data(X, cov, lambda_param=0.15)
        expected_ucl = (_UCL_TABLE[(4, 0.10)] + _UCL_TABLE[(4, 0.20)]) / 2
        assert points[0].ucl == pytest.approx(expected_ucl, abs=0.01)

    def test_engine_with_large_p_fallback(self) -> None:
        engine = MEWMAEngine()
        rng = np.random.default_rng(42)
        X = rng.standard_normal((10, 15))
        cov = np.eye(15)

        points = engine.compute_chart_data(X, cov, lambda_param=0.10)
        assert len(points) == 10
        # UCL should be positive and less than chi2(0.9973, 15)
        chi2_val = stats.chi2.ppf(0.9973, 15)
        assert 0 < points[0].ucl < chi2_val

    def test_engine_rejects_invalid_lambda(self) -> None:
        engine = MEWMAEngine()
        X = np.zeros((5, 2))
        cov = np.eye(2)

        with pytest.raises(ValueError):
            engine.compute_chart_data(X, cov, lambda_param=0.0)
        with pytest.raises(ValueError):
            engine.compute_chart_data(X, cov, lambda_param=-0.5)

    def test_backward_compat_default_ucl_attribute(self) -> None:
        """DEFAULT_UCL class attribute should still be accessible."""
        assert MEWMAEngine.DEFAULT_UCL is _UCL_TABLE
        assert (2, 0.10) in MEWMAEngine.DEFAULT_UCL
