"""Tests for MCD (Minimum Covariance Determinant) covariance estimation
in the Hotelling T-squared engine.

Tests cover:
  - MCD with clean data produces similar results to classical
  - MCD with seeded outliers produces tighter covariance than classical
  - Phase I freeze stores outlier_count
  - covariance_method flows through correctly
  - Edge case: fewer observations than 2*p
  - Invalid covariance_method raises ValueError
"""

import numpy as np
import pytest
from scipy import stats

from cassini.core.multivariate.hotelling import HotellingT2Engine, PhaseIResult


@pytest.fixture
def engine() -> HotellingT2Engine:
    return HotellingT2Engine()


@pytest.fixture
def clean_data() -> np.ndarray:
    """Generate clean bivariate normal data (n=100, p=2)."""
    rng = np.random.default_rng(42)
    mean = [10.0, 20.0]
    cov = [[1.0, 0.5], [0.5, 2.0]]
    return rng.multivariate_normal(mean, cov, size=100)


@pytest.fixture
def contaminated_data(clean_data: np.ndarray) -> np.ndarray:
    """Clean data with 10% gross outliers injected."""
    data = clean_data.copy()
    rng = np.random.default_rng(123)
    n_outliers = 10
    # Inject outliers far from the mean
    data[:n_outliers] = rng.multivariate_normal([30.0, 50.0], [[1.0, 0.0], [0.0, 1.0]], size=n_outliers)
    return data


class TestMCDCleanData:
    """MCD on clean data should produce results similar to classical."""

    def test_mcd_returns_phase_i_result(self, engine: HotellingT2Engine, clean_data: np.ndarray) -> None:
        result = engine.compute_phase_i(clean_data, covariance_method="mcd")
        assert isinstance(result, PhaseIResult)
        assert result.covariance_method == "mcd"
        assert result.n == 100
        assert result.p == 2

    def test_mcd_mean_close_to_classical(self, engine: HotellingT2Engine, clean_data: np.ndarray) -> None:
        classical = engine.compute_phase_i(clean_data, covariance_method="classical")
        mcd = engine.compute_phase_i(clean_data, covariance_method="mcd")

        # With clean data, means should be very close
        np.testing.assert_allclose(mcd.mean, classical.mean, atol=1.0)

    def test_mcd_covariance_close_to_classical(self, engine: HotellingT2Engine, clean_data: np.ndarray) -> None:
        classical = engine.compute_phase_i(clean_data, covariance_method="classical")
        mcd = engine.compute_phase_i(clean_data, covariance_method="mcd")

        # With clean data, covariances should be similar (within a factor of ~2)
        ratio = np.abs(mcd.covariance / classical.covariance)
        assert np.all(ratio > 0.3), f"Covariance ratio too small: {ratio}"
        assert np.all(ratio < 3.0), f"Covariance ratio too large: {ratio}"

    def test_mcd_few_outliers_on_clean(self, engine: HotellingT2Engine, clean_data: np.ndarray) -> None:
        result = engine.compute_phase_i(clean_data, covariance_method="mcd")
        # With clean data, outlier count should be low (< 10%)
        assert result.outlier_count < 15, f"Too many outliers on clean data: {result.outlier_count}"

    def test_classical_outlier_count_zero(self, engine: HotellingT2Engine, clean_data: np.ndarray) -> None:
        result = engine.compute_phase_i(clean_data, covariance_method="classical")
        assert result.outlier_count == 0
        assert result.covariance_method == "classical"


class TestMCDContaminatedData:
    """MCD on contaminated data should produce tighter covariance."""

    def test_mcd_detects_outliers(self, engine: HotellingT2Engine, contaminated_data: np.ndarray) -> None:
        result = engine.compute_phase_i(contaminated_data, covariance_method="mcd")
        # Should detect at least some of the 10 injected outliers
        assert result.outlier_count >= 5, f"Expected >= 5 outliers, got {result.outlier_count}"

    def test_mcd_tighter_covariance(self, engine: HotellingT2Engine, contaminated_data: np.ndarray) -> None:
        classical = engine.compute_phase_i(contaminated_data, covariance_method="classical")
        mcd = engine.compute_phase_i(contaminated_data, covariance_method="mcd")

        # MCD covariance determinant should be smaller (tighter ellipse)
        det_classical = np.linalg.det(classical.covariance)
        det_mcd = np.linalg.det(mcd.covariance)
        assert det_mcd < det_classical, (
            f"MCD det ({det_mcd:.4f}) should be < classical det ({det_classical:.4f})"
        )

    def test_mcd_mean_closer_to_true(self, engine: HotellingT2Engine, contaminated_data: np.ndarray) -> None:
        """MCD mean should be closer to the true mean [10, 20] than classical."""
        true_mean = np.array([10.0, 20.0])

        classical = engine.compute_phase_i(contaminated_data, covariance_method="classical")
        mcd = engine.compute_phase_i(contaminated_data, covariance_method="mcd")

        dist_classical = np.linalg.norm(classical.mean - true_mean)
        dist_mcd = np.linalg.norm(mcd.mean - true_mean)

        assert dist_mcd < dist_classical, (
            f"MCD mean dist ({dist_mcd:.4f}) should be < classical ({dist_classical:.4f})"
        )

    def test_mcd_more_ooc_detections(self, engine: HotellingT2Engine, contaminated_data: np.ndarray) -> None:
        """MCD should flag more observations as OOC because the tighter
        covariance makes outliers stick out more."""
        classical = engine.compute_phase_i(contaminated_data, covariance_method="classical")
        mcd = engine.compute_phase_i(contaminated_data, covariance_method="mcd")

        ooc_classical = sum(1 for t2 in classical.t_squared if t2 > classical.ucl)
        ooc_mcd = sum(1 for t2 in mcd.t_squared if t2 > mcd.ucl)

        assert ooc_mcd >= ooc_classical, (
            f"MCD OOC count ({ooc_mcd}) should be >= classical ({ooc_classical})"
        )


class TestPhaseIFreezeOutlierCount:
    """Verify outlier_count is stored in PhaseIResult when freezing."""

    def test_outlier_count_in_result(self, engine: HotellingT2Engine, contaminated_data: np.ndarray) -> None:
        result = engine.compute_phase_i(contaminated_data, covariance_method="mcd")
        assert isinstance(result.outlier_count, int)
        assert result.outlier_count > 0

    def test_outlier_count_serializable(self, engine: HotellingT2Engine, contaminated_data: np.ndarray) -> None:
        """Outlier count should be a plain int (JSON-serializable)."""
        result = engine.compute_phase_i(contaminated_data, covariance_method="mcd")
        import json
        # This should not raise — plain int is JSON-serializable
        json.dumps({"outlier_count": result.outlier_count})

    def test_phase_i_result_fields(self, engine: HotellingT2Engine, clean_data: np.ndarray) -> None:
        result = engine.compute_phase_i(clean_data, covariance_method="mcd")
        assert hasattr(result, "outlier_count")
        assert hasattr(result, "covariance_method")
        assert result.covariance_method == "mcd"


class TestCovarianceMethodValidation:
    """Ensure invalid methods are rejected."""

    def test_invalid_method_raises(self, engine: HotellingT2Engine, clean_data: np.ndarray) -> None:
        with pytest.raises(ValueError, match="Unknown covariance_method"):
            engine.compute_phase_i(clean_data, covariance_method="invalid")

    def test_classical_default(self, engine: HotellingT2Engine, clean_data: np.ndarray) -> None:
        result = engine.compute_phase_i(clean_data)
        assert result.covariance_method == "classical"
        assert result.outlier_count == 0


class TestEdgeCases:
    """Edge cases for MCD covariance estimation."""

    def test_insufficient_observations(self, engine: HotellingT2Engine) -> None:
        """MCD requires n >= 2*p (same as classical)."""
        rng = np.random.default_rng(99)
        X = rng.standard_normal((3, 3))  # n=3, p=3, need n >= 6
        with pytest.raises(ValueError, match="Need at least"):
            engine.compute_phase_i(X, covariance_method="mcd")

    def test_minimum_viable_observations(self, engine: HotellingT2Engine) -> None:
        """MCD should work with exactly 2*p observations."""
        rng = np.random.default_rng(99)
        X = rng.standard_normal((6, 3))  # n=6, p=3, minimum
        result = engine.compute_phase_i(X, covariance_method="mcd")
        assert result.n == 6
        assert result.p == 3

    def test_high_dimensional(self, engine: HotellingT2Engine) -> None:
        """MCD with more variables (p=5)."""
        rng = np.random.default_rng(42)
        X = rng.standard_normal((50, 5))
        result = engine.compute_phase_i(X, covariance_method="mcd")
        assert result.p == 5
        assert result.n == 50
        assert result.covariance.shape == (5, 5)

    def test_t_squared_length_matches_n(self, engine: HotellingT2Engine, clean_data: np.ndarray) -> None:
        result = engine.compute_phase_i(clean_data, covariance_method="mcd")
        assert len(result.t_squared) == result.n

    def test_ucl_positive(self, engine: HotellingT2Engine, clean_data: np.ndarray) -> None:
        result = engine.compute_phase_i(clean_data, covariance_method="mcd")
        assert result.ucl > 0

    def test_cov_inv_is_inverse(self, engine: HotellingT2Engine, clean_data: np.ndarray) -> None:
        result = engine.compute_phase_i(clean_data, covariance_method="mcd")
        identity_approx = result.covariance @ result.cov_inv
        np.testing.assert_allclose(identity_approx, np.eye(result.p), atol=1e-6)
