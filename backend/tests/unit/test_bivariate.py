"""Unit tests for the bivariate confidence ellipse computation.

Tests verify:
- Ellipse boundary for identity covariance (circle)
- Ellipse rotation with off-diagonal covariance
- OOC classification (points outside ellipse have T² > UCL)
- Input validation (dimension checks, non-positive UCL)
- Numerical edge cases
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from scipy import stats

from cassini.core.multivariate.hotelling import (
    HotellingT2Engine,
    compute_confidence_ellipse,
)


class TestComputeConfidenceEllipse:
    """Test the parametric ellipse boundary computation."""

    def test_identity_covariance_produces_circle(self) -> None:
        """Identity covariance with UCL=1 should produce a unit circle
        centered at the mean."""
        mean = np.array([0.0, 0.0])
        cov = np.eye(2)
        ucl = 1.0

        points = compute_confidence_ellipse(mean, cov, ucl, n_points=360)

        assert len(points) == 360

        # All points should be at distance sqrt(UCL) = 1.0 from origin
        for x, y in points:
            radius = math.sqrt(x**2 + y**2)
            assert radius == pytest.approx(1.0, abs=1e-10), (
                f"Point ({x:.6f}, {y:.6f}) has radius {radius:.6f}, expected 1.0"
            )

    def test_identity_covariance_with_ucl_4(self) -> None:
        """Identity covariance with UCL=4 should produce a circle of radius 2."""
        mean = np.array([5.0, 3.0])
        cov = np.eye(2)
        ucl = 4.0

        points = compute_confidence_ellipse(mean, cov, ucl, n_points=100)

        for x, y in points:
            dist = math.sqrt((x - 5.0) ** 2 + (y - 3.0) ** 2)
            assert dist == pytest.approx(2.0, abs=1e-10)

    def test_diagonal_covariance_produces_axis_aligned_ellipse(self) -> None:
        """Diagonal covariance with unequal variances should produce an
        axis-aligned ellipse with semi-axes proportional to sqrt(var * UCL)."""
        mean = np.array([0.0, 0.0])
        cov = np.array([[4.0, 0.0], [0.0, 1.0]])
        ucl = 1.0

        points = compute_confidence_ellipse(mean, cov, ucl, n_points=1000)

        # Semi-axis along x: sqrt(UCL * 4) = 2.0
        # Semi-axis along y: sqrt(UCL * 1) = 1.0
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        assert max(abs(x) for x in xs) == pytest.approx(2.0, abs=1e-4)
        assert max(abs(y) for y in ys) == pytest.approx(1.0, abs=1e-4)

    def test_off_diagonal_covariance_rotates_ellipse(self) -> None:
        """Covariance with positive off-diagonal elements should rotate
        the ellipse. The principal axes should align with eigenvectors."""
        mean = np.array([0.0, 0.0])
        # Strongly correlated
        cov = np.array([[2.0, 1.5], [1.5, 2.0]])
        ucl = 1.0

        points = compute_confidence_ellipse(mean, cov, ucl, n_points=500)

        # Eigenvalues: 3.5 and 0.5
        # Eigenvectors: 45° and -45° rotated
        eigenvalues = np.linalg.eigvalsh(cov)
        assert eigenvalues[0] == pytest.approx(0.5, abs=1e-10)
        assert eigenvalues[1] == pytest.approx(3.5, abs=1e-10)

        # Semi-axes: sqrt(UCL * eigenvalue)
        a = math.sqrt(ucl * eigenvalues[0])  # ~0.707
        b = math.sqrt(ucl * eigenvalues[1])  # ~1.871

        # Maximum distance from center should be the larger semi-axis
        max_dist = max(math.sqrt(x**2 + y**2) for x, y in points)
        assert max_dist == pytest.approx(b, abs=1e-4)

    def test_translated_mean(self) -> None:
        """Ellipse should be centered at the given mean."""
        mean = np.array([10.0, -5.0])
        cov = np.eye(2)
        ucl = 1.0

        points = compute_confidence_ellipse(mean, cov, ucl, n_points=100)

        # Center of mass of uniformly spaced points on a circle
        avg_x = sum(p[0] for p in points) / len(points)
        avg_y = sum(p[1] for p in points) / len(points)
        assert avg_x == pytest.approx(10.0, abs=0.01)
        assert avg_y == pytest.approx(-5.0, abs=0.01)

    def test_ellipse_boundary_satisfies_t_squared_equation(self) -> None:
        """Every point on the ellipse boundary should satisfy
        (x - mu)^T Sigma^{-1} (x - mu) = UCL."""
        mean = np.array([1.0, 2.0])
        cov = np.array([[3.0, 1.0], [1.0, 2.0]])
        ucl = 5.0

        points = compute_confidence_ellipse(mean, cov, ucl, n_points=200)
        cov_inv = np.linalg.inv(cov)

        for x, y in points:
            diff = np.array([x, y]) - mean
            t2 = float(diff @ cov_inv @ diff)
            assert t2 == pytest.approx(ucl, abs=1e-8), (
                f"Point ({x:.4f}, {y:.4f}) has T²={t2:.6f}, expected {ucl}"
            )

    def test_n_points_controls_output_size(self) -> None:
        """Output should have exactly n_points elements."""
        mean = np.array([0.0, 0.0])
        cov = np.eye(2)

        for n in [10, 50, 200]:
            points = compute_confidence_ellipse(mean, cov, ucl=1.0, n_points=n)
            assert len(points) == n


class TestComputeConfidenceEllipseValidation:
    """Test input validation for compute_confidence_ellipse."""

    def test_rejects_non_2d_mean(self) -> None:
        """Mean must be shape (2,)."""
        with pytest.raises(ValueError, match="Mean must be"):
            compute_confidence_ellipse(
                np.array([1.0, 2.0, 3.0]),
                np.eye(2),
                ucl=1.0,
            )

    def test_rejects_non_2x2_covariance(self) -> None:
        """Covariance must be shape (2, 2)."""
        with pytest.raises(ValueError, match="Covariance must be"):
            compute_confidence_ellipse(
                np.array([1.0, 2.0]),
                np.eye(3),
                ucl=1.0,
            )

    def test_rejects_non_positive_ucl(self) -> None:
        """UCL must be positive."""
        with pytest.raises(ValueError, match="UCL must be positive"):
            compute_confidence_ellipse(
                np.array([0.0, 0.0]),
                np.eye(2),
                ucl=0.0,
            )

        with pytest.raises(ValueError, match="UCL must be positive"):
            compute_confidence_ellipse(
                np.array([0.0, 0.0]),
                np.eye(2),
                ucl=-1.0,
            )


class TestOOCClassification:
    """Test that points outside the ellipse have T² > UCL."""

    def test_points_inside_ellipse_are_in_control(self) -> None:
        """Points near the center should have T² < UCL."""
        mean = np.array([0.0, 0.0])
        cov = np.eye(2)
        ucl = 5.0  # generous UCL

        cov_inv = np.linalg.inv(cov)

        # Point at origin — T² = 0
        diff = np.array([0.0, 0.0]) - mean
        t2 = float(diff @ cov_inv @ diff)
        assert t2 < ucl

        # Point at (1, 1) — T² = 2
        diff = np.array([1.0, 1.0]) - mean
        t2 = float(diff @ cov_inv @ diff)
        assert t2 < ucl

    def test_points_outside_ellipse_are_ooc(self) -> None:
        """Points far from the center should have T² > UCL."""
        mean = np.array([0.0, 0.0])
        cov = np.eye(2)
        ucl = 1.0

        cov_inv = np.linalg.inv(cov)

        # Point at (2, 0) — T² = 4 > 1
        diff = np.array([2.0, 0.0]) - mean
        t2 = float(diff @ cov_inv @ diff)
        assert t2 > ucl

        # Point at (1, 1) — T² = 2 > 1
        diff = np.array([1.0, 1.0]) - mean
        t2 = float(diff @ cov_inv @ diff)
        assert t2 > ucl

    def test_ooc_with_phase_i_engine(self) -> None:
        """End-to-end: generate data, compute Phase I, verify OOC
        classification matches the ellipse boundary."""
        rng = np.random.default_rng(42)
        n = 50
        # Correlated 2D data
        mean_true = np.array([10.0, 20.0])
        cov_true = np.array([[4.0, 2.0], [2.0, 3.0]])
        L = np.linalg.cholesky(cov_true)
        X = rng.standard_normal((n, 2)) @ L.T + mean_true

        engine = HotellingT2Engine()
        result = engine.compute_phase_i(X, alpha=0.0027)

        # Every observation classified OOC by Phase I should also be
        # outside the ellipse (T² > UCL)
        cov_inv = result.cov_inv
        for i in range(n):
            diff = X[i] - result.mean
            t2 = float(diff @ cov_inv @ diff)
            is_ooc = t2 > result.ucl
            assert is_ooc == (result.t_squared[i] > result.ucl)

        # The ellipse boundary points should all satisfy T² = UCL
        ellipse = compute_confidence_ellipse(
            result.mean, result.covariance, result.ucl
        )
        for x, y in ellipse:
            diff = np.array([x, y]) - result.mean
            t2 = float(diff @ cov_inv @ diff)
            assert t2 == pytest.approx(result.ucl, abs=1e-6)
