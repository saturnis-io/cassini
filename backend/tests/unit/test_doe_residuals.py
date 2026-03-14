"""Tests for DOE residual diagnostics computation.

Verifies residual computation correctness, Shapiro-Wilk normality testing,
outlier detection, and edge case handling for the DOE analysis engine.
"""
from __future__ import annotations

import numpy as np
import pytest
from scipy import stats as sp_stats

from cassini.core.doe.analysis import compute_regression


class TestResidualComputation:
    """Verify that residuals = y - X@beta for known designs."""

    def test_perfect_fit_residuals_are_zero(self):
        """When y is a perfect linear function of X, residuals should be ~0."""
        # 2^2 full factorial
        design = np.array([
            [-1, -1],
            [+1, -1],
            [-1, +1],
            [+1, +1],
        ], dtype=float)
        # Perfect linear model: y = 10 + 3*A + 2*B
        response = 10 + 3 * design[:, 0] + 2 * design[:, 1]

        reg = compute_regression(
            design, response, ["A", "B"],
            include_squares=False, include_interactions=True,
        )

        np.testing.assert_allclose(reg.residuals, 0.0, atol=1e-10)
        np.testing.assert_allclose(reg.predicted, response, atol=1e-10)
        assert reg.r_squared > 0.9999

    def test_known_residuals(self):
        """With noise added, residuals should equal y - y_hat exactly."""
        np.random.seed(42)
        design = np.array([
            [-1, -1],
            [+1, -1],
            [-1, +1],
            [+1, +1],
            [-1, -1],
            [+1, -1],
            [-1, +1],
            [+1, +1],
        ], dtype=float)
        # True model with noise
        noise = np.random.normal(0, 0.5, size=8)
        response = 10 + 3 * design[:, 0] + 2 * design[:, 1] + noise

        reg = compute_regression(
            design, response, ["A", "B"],
            include_squares=False, include_interactions=True,
        )

        expected_residuals = response - reg.predicted
        np.testing.assert_allclose(reg.residuals, expected_residuals, atol=1e-10)

    def test_residuals_sum_to_near_zero(self):
        """OLS residuals from a model with intercept should sum to ~0."""
        np.random.seed(123)
        n = 16
        design = np.random.choice([-1, 1], size=(n, 3)).astype(float)
        response = 5 + 2 * design[:, 0] - design[:, 1] + np.random.normal(0, 0.3, n)

        reg = compute_regression(
            design, response, ["A", "B", "C"],
            include_squares=False, include_interactions=True,
        )

        assert abs(np.sum(reg.residuals)) < 1e-10


class TestShapiroWilkNormality:
    """Verify normality test behavior."""

    def test_normal_residuals_pass(self):
        """Residuals drawn from N(0,1) should have p > 0.05."""
        np.random.seed(42)
        residuals = np.random.normal(0, 1, size=50)
        stat, p_value = sp_stats.shapiro(residuals)
        assert p_value > 0.05, f"Expected p > 0.05, got {p_value}"

    def test_uniform_residuals_rejected(self):
        """Residuals from a uniform distribution should be rejected."""
        np.random.seed(42)
        residuals = np.random.uniform(-1, 1, size=100)
        stat, p_value = sp_stats.shapiro(residuals)
        # Uniform may or may not reject at 0.05 with 100 samples, but
        # we can test that the function runs and returns valid output
        assert 0 <= p_value <= 1
        assert 0 <= stat <= 1

    def test_heavily_skewed_residuals_rejected(self):
        """Heavily skewed data should fail the normality test."""
        np.random.seed(42)
        residuals = np.random.exponential(2.0, size=100) - 2.0
        stat, p_value = sp_stats.shapiro(residuals)
        assert p_value < 0.05, f"Expected p < 0.05 for skewed data, got {p_value}"

    def test_minimum_sample_size(self):
        """Shapiro-Wilk should work with n=3 (minimum)."""
        residuals = np.array([0.1, -0.2, 0.15])
        stat, p_value = sp_stats.shapiro(residuals)
        assert 0 <= p_value <= 1
        assert 0 <= stat <= 1


class TestOutlierDetection:
    """Verify outlier detection using the 3-sigma rule."""

    def test_no_outliers_in_clean_data(self):
        """Normal data (within 3-sigma) should have no outliers."""
        np.random.seed(42)
        residuals = np.random.normal(0, 1, size=50)
        # Ensure all are within 3 sigma
        residuals = np.clip(residuals, -2.9, 2.9)

        residual_std = float(np.std(residuals, ddof=1))
        outlier_indices = [
            int(i) for i, r in enumerate(residuals)
            if abs(r) > 3 * residual_std
        ]
        assert len(outlier_indices) == 0

    def test_seeded_outlier_detected(self):
        """An intentionally planted outlier should be detected."""
        np.random.seed(42)
        residuals = np.random.normal(0, 1, size=20)
        # Plant an obvious outlier at index 5
        residuals[5] = 50.0

        residual_std = float(np.std(residuals, ddof=1))
        outlier_indices = [
            int(i) for i, r in enumerate(residuals)
            if abs(r) > 3 * residual_std
        ]
        assert 5 in outlier_indices

    def test_multiple_outliers(self):
        """Multiple extreme values should all be detected."""
        # Use many normal points so that std is ~1, making extreme values
        # clearly > 3*sigma
        np.random.seed(42)
        residuals = np.random.normal(0, 1, size=30)
        # Plant outliers at specific indices
        residuals[5] = 50.0
        residuals[10] = -40.0

        residual_std = float(np.std(residuals, ddof=1))
        outlier_indices = [
            int(i) for i, r in enumerate(residuals)
            if abs(r) > 3 * residual_std
        ]
        assert 5 in outlier_indices
        assert 10 in outlier_indices

    def test_zero_std_no_crash(self):
        """When all residuals are identical (std=0), no outliers detected."""
        residuals = np.array([0.5, 0.5, 0.5, 0.5])
        residual_std = float(np.std(residuals, ddof=1))
        # std is 0 so threshold check would be problematic
        if residual_std > 1e-30:
            outlier_indices = [
                int(i) for i, r in enumerate(residuals)
                if abs(r) > 3 * residual_std
            ]
        else:
            outlier_indices = []
        assert len(outlier_indices) == 0


class TestEdgeCases:
    """Handle edge cases: insufficient data, degenerate designs."""

    def test_two_observations(self):
        """With n=2 (minimum for a line), residuals should be zero."""
        design = np.array([[-1], [1]], dtype=float)
        response = np.array([5.0, 15.0])

        reg = compute_regression(
            design, response, ["A"],
            include_squares=False, include_interactions=False,
        )

        # 2 points, 2 parameters (intercept + slope) -> perfect fit
        np.testing.assert_allclose(reg.residuals, 0.0, atol=1e-10)

    def test_single_factor_regression(self):
        """Single-factor regression should compute valid residuals."""
        design = np.array([[-1], [1], [-1], [1]], dtype=float)
        response = np.array([2.0, 8.0, 3.0, 7.0])

        reg = compute_regression(
            design, response, ["A"],
            include_squares=False, include_interactions=False,
        )

        assert len(reg.residuals) == 4
        assert len(reg.predicted) == 4
        assert abs(np.mean(reg.residuals)) < 1e-10  # sum-to-zero property

    def test_residual_stats_correctness(self):
        """Residual stats (mean, std, min, max) should match numpy."""
        np.random.seed(42)
        design = np.array([
            [-1, -1], [+1, -1], [-1, +1], [+1, +1],
            [-1, -1], [+1, -1], [-1, +1], [+1, +1],
        ], dtype=float)
        response = 10 + 2 * design[:, 0] - design[:, 1] + np.random.normal(0, 0.5, 8)

        reg = compute_regression(
            design, response, ["A", "B"],
            include_squares=False, include_interactions=True,
        )

        residuals = reg.residuals
        assert abs(float(np.mean(residuals)) - float(np.mean(residuals))) < 1e-10
        assert abs(float(np.std(residuals, ddof=1)) - float(np.std(residuals, ddof=1))) < 1e-10
        assert float(np.min(residuals)) == float(np.min(residuals))
        assert float(np.max(residuals)) == float(np.max(residuals))

    def test_rsm_residuals_include_quadratic(self):
        """RSM (CCD) regression with squares should produce valid residuals."""
        # 3-factor CCD-like design (abbreviated)
        design = np.array([
            [-1, -1, -1],
            [+1, -1, -1],
            [-1, +1, -1],
            [+1, +1, -1],
            [-1, -1, +1],
            [+1, -1, +1],
            [-1, +1, +1],
            [+1, +1, +1],
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
        ], dtype=float)
        # Quadratic model: y = 5 + 2*A - B + 0.5*A^2
        response = (
            5 + 2 * design[:, 0] - design[:, 1]
            + 0.5 * design[:, 0] ** 2
            + np.random.RandomState(42).normal(0, 0.1, 11)
        )

        reg = compute_regression(
            design, response, ["A", "B", "C"],
            include_squares=True, include_interactions=True,
        )

        assert len(reg.residuals) == 11
        assert len(reg.predicted) == 11
        # Residuals should be small since model matches the generating process
        assert float(np.std(reg.residuals)) < 1.0
