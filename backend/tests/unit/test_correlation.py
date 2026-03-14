"""Unit tests for the standalone Correlation Analysis engine.

Tests verify:
- Pearson and Spearman correlation on known data
- Partial correlation cancels out confounders
- PCA on 2D data with known principal axes
- Variable importance ranking
- Edge cases and error handling
"""

import math

import numpy as np
import pytest

from cassini.core.correlation import (
    compute_correlation_matrix,
    compute_partial_correlation,
    compute_pca,
    rank_variable_importance,
)


class TestCorrelationMatrix:
    """Test compute_correlation_matrix."""

    def test_perfect_positive_correlation(self):
        """Perfectly correlated variables should yield r=1."""
        data = {
            "x": [1.0, 2.0, 3.0, 4.0, 5.0],
            "y": [2.0, 4.0, 6.0, 8.0, 10.0],
        }
        result = compute_correlation_matrix(data, method="pearson")
        assert result.method == "pearson"
        assert result.sample_count == 5
        assert len(result.variable_names) == 2
        assert result.matrix[0][0] == pytest.approx(1.0)
        assert result.matrix[1][1] == pytest.approx(1.0)
        assert result.matrix[0][1] == pytest.approx(1.0)
        assert result.matrix[1][0] == pytest.approx(1.0)
        # Perfect correlation => p-value ~0
        assert result.p_values[0][1] < 0.01

    def test_perfect_negative_correlation(self):
        """Perfectly anti-correlated variables should yield r=-1."""
        data = {
            "x": [1.0, 2.0, 3.0, 4.0, 5.0],
            "y": [10.0, 8.0, 6.0, 4.0, 2.0],
        }
        result = compute_correlation_matrix(data, method="pearson")
        assert result.matrix[0][1] == pytest.approx(-1.0)

    def test_zero_correlation(self):
        """Uncorrelated variables should yield r~0."""
        # Construct data where x and y are orthogonal
        data = {
            "x": [1.0, -1.0, 1.0, -1.0],
            "y": [1.0, 1.0, -1.0, -1.0],
        }
        result = compute_correlation_matrix(data, method="pearson")
        assert abs(result.matrix[0][1]) < 0.01

    def test_spearman_on_monotonic(self):
        """Spearman should yield r=1 for any monotonic relationship."""
        # Exponential is monotonic but not linear
        data = {
            "x": [1.0, 2.0, 3.0, 4.0, 5.0],
            "y": [2.7, 7.4, 20.1, 54.6, 148.4],  # ~exp(x)
        }
        result = compute_correlation_matrix(data, method="spearman")
        assert result.method == "spearman"
        assert result.matrix[0][1] == pytest.approx(1.0)

    def test_three_variables(self):
        """Matrix should be 3x3 for three variables."""
        data = {
            "a": [1.0, 2.0, 3.0, 4.0, 5.0],
            "b": [2.0, 4.0, 6.0, 8.0, 10.0],
            "c": [5.0, 4.0, 3.0, 2.0, 1.0],
        }
        result = compute_correlation_matrix(data)
        assert len(result.matrix) == 3
        assert len(result.matrix[0]) == 3
        # a-b: r=1, a-c: r=-1, b-c: r=-1
        assert result.matrix[0][1] == pytest.approx(1.0)
        assert result.matrix[0][2] == pytest.approx(-1.0)
        assert result.matrix[1][2] == pytest.approx(-1.0)

    def test_diagonal_is_one(self):
        """Diagonal elements should always be 1.0."""
        np.random.seed(42)
        data = {
            "x": np.random.randn(20).tolist(),
            "y": np.random.randn(20).tolist(),
            "z": np.random.randn(20).tolist(),
        }
        result = compute_correlation_matrix(data)
        for i in range(3):
            assert result.matrix[i][i] == pytest.approx(1.0)
            assert result.p_values[i][i] == pytest.approx(0.0)

    def test_symmetry(self):
        """Matrix should be symmetric."""
        np.random.seed(42)
        data = {
            "x": np.random.randn(30).tolist(),
            "y": np.random.randn(30).tolist(),
            "z": np.random.randn(30).tolist(),
        }
        result = compute_correlation_matrix(data)
        for i in range(3):
            for j in range(3):
                assert result.matrix[i][j] == pytest.approx(result.matrix[j][i])
                assert result.p_values[i][j] == pytest.approx(result.p_values[j][i])

    def test_too_few_variables_raises(self):
        """Should raise ValueError for < 2 variables."""
        with pytest.raises(ValueError, match="at least 2 variables"):
            compute_correlation_matrix({"x": [1.0, 2.0, 3.0]})

    def test_too_few_observations_raises(self):
        """Should raise ValueError for < 3 observations."""
        with pytest.raises(ValueError, match="at least 3 observations"):
            compute_correlation_matrix({"x": [1.0, 2.0], "y": [3.0, 4.0]})

    def test_unknown_method_raises(self):
        """Should raise ValueError for unknown method."""
        data = {"x": [1.0, 2.0, 3.0], "y": [4.0, 5.0, 6.0]}
        with pytest.raises(ValueError, match="Unknown correlation method"):
            compute_correlation_matrix(data, method="kendall")


class TestPartialCorrelation:
    """Test compute_partial_correlation."""

    def test_confound_removed(self):
        """Partial correlation should reveal true relationship after controlling for confounders.

        Construct: z drives both x and y.
        x = z + small noise
        y = z + small noise
        Raw r(x, y) will be high because both track z.
        Partial r(x, y | z) should be near zero.
        """
        np.random.seed(42)
        n = 100
        z = np.random.randn(n)
        x = z + np.random.randn(n) * 0.1
        y = z + np.random.randn(n) * 0.1

        data = {
            "x": x.tolist(),
            "y": y.tolist(),
            "z": z.tolist(),
        }

        # Raw correlation should be high
        raw = compute_correlation_matrix({"x": x.tolist(), "y": y.tolist()})
        assert abs(raw.matrix[0][1]) > 0.8

        # Partial should be near zero
        result = compute_partial_correlation(data, "x", "y", ["z"])
        assert abs(result.r) < 0.3  # Much reduced
        assert result.var1 == "x"
        assert result.var2 == "y"
        assert result.controlling_for == ["z"]
        assert result.df == n - 1 - 2  # n - k - 2

    def test_no_controls(self):
        """With no control variables, partial = bivariate correlation."""
        data = {
            "x": [1.0, 2.0, 3.0, 4.0, 5.0],
            "y": [2.0, 4.0, 6.0, 8.0, 10.0],
        }
        result = compute_partial_correlation(data, "x", "y", [])
        # Should be ~1.0 (perfect correlation, no confounders)
        assert result.r == pytest.approx(1.0, abs=0.01)

    def test_missing_variable_raises(self):
        """Should raise ValueError for unknown variable names."""
        data = {"x": [1.0, 2.0, 3.0], "y": [4.0, 5.0, 6.0]}
        with pytest.raises(ValueError, match="not found"):
            compute_partial_correlation(data, "x", "missing", [])

    def test_result_bounded(self):
        """Partial r should always be in [-1, 1]."""
        np.random.seed(123)
        data = {
            "a": np.random.randn(50).tolist(),
            "b": np.random.randn(50).tolist(),
            "c": np.random.randn(50).tolist(),
        }
        result = compute_partial_correlation(data, "a", "b", ["c"])
        assert -1.0 <= result.r <= 1.0


class TestPCA:
    """Test compute_pca."""

    def test_2d_known_axes(self):
        """For 2D data along a line y=x, PC1 should explain ~100% variance."""
        np.random.seed(42)
        t = np.linspace(0, 10, 50)
        x = t + np.random.randn(50) * 0.01
        y = t + np.random.randn(50) * 0.01

        data = {"x": x.tolist(), "y": y.tolist()}
        result = compute_pca(data)

        # PC1 should explain nearly all variance
        assert result.explained_variance_ratios[0] > 0.99
        assert len(result.eigenvalues) == 2
        assert len(result.loadings) == 2  # 2 PCs
        assert len(result.loadings[0]) == 2  # 2 variables per PC
        assert len(result.scores) == 50  # 50 samples
        assert len(result.scores[0]) == 2  # 2 PC scores per sample

    def test_variance_sums_to_one(self):
        """Explained variance ratios should sum to 1.0."""
        np.random.seed(42)
        data = {
            "a": np.random.randn(30).tolist(),
            "b": np.random.randn(30).tolist(),
            "c": np.random.randn(30).tolist(),
        }
        result = compute_pca(data)
        total = sum(result.explained_variance_ratios)
        assert total == pytest.approx(1.0, abs=0.01)

    def test_cumulative_variance(self):
        """Cumulative variance should be monotonically increasing and end at 1.0."""
        np.random.seed(42)
        data = {
            "x": np.random.randn(20).tolist(),
            "y": np.random.randn(20).tolist(),
            "z": np.random.randn(20).tolist(),
        }
        result = compute_pca(data)

        for i in range(1, len(result.cumulative_variance)):
            assert result.cumulative_variance[i] >= result.cumulative_variance[i - 1]

        assert result.cumulative_variance[-1] == pytest.approx(1.0, abs=0.01)

    def test_eigenvalues_descending(self):
        """Eigenvalues should be in descending order."""
        np.random.seed(42)
        data = {
            "a": np.random.randn(40).tolist(),
            "b": np.random.randn(40).tolist(),
            "c": np.random.randn(40).tolist(),
        }
        result = compute_pca(data)
        for i in range(1, len(result.eigenvalues)):
            assert result.eigenvalues[i] <= result.eigenvalues[i - 1] + 1e-10

    def test_too_few_observations_raises(self):
        """Should raise ValueError for < 3 observations."""
        with pytest.raises(ValueError, match="at least 3 observations"):
            compute_pca({"x": [1.0, 2.0], "y": [3.0, 4.0]})

    def test_too_few_variables_raises(self):
        """Should raise ValueError for < 2 variables."""
        with pytest.raises(ValueError, match="at least 2 variables"):
            compute_pca({"x": [1.0, 2.0, 3.0]})

    def test_zero_variance_column(self):
        """Zero-variance columns should not crash (guarded to 1.0)."""
        data = {
            "x": [1.0, 2.0, 3.0, 4.0, 5.0],
            "constant": [5.0, 5.0, 5.0, 5.0, 5.0],
        }
        result = compute_pca(data)
        assert len(result.eigenvalues) == 2
        # All variance should be in the non-constant column
        assert result.explained_variance_ratios[0] > 0.5


class TestVariableImportance:
    """Test rank_variable_importance."""

    def test_ranking_order(self):
        """More correlated variables should rank higher."""
        np.random.seed(42)
        target = np.linspace(0, 10, 50)
        strong = target * 2 + np.random.randn(50) * 0.1  # Very correlated
        weak = target + np.random.randn(50) * 5  # Weakly correlated
        noise = np.random.randn(50) * 10  # Uncorrelated

        data = {
            "target": target.tolist(),
            "strong": strong.tolist(),
            "weak": weak.tolist(),
            "noise": noise.tolist(),
        }
        result = rank_variable_importance(data, "target")

        assert len(result) == 3
        assert result[0].variable_name == "strong"
        assert result[0].abs_pearson_r > result[1].abs_pearson_r
        assert result[1].abs_pearson_r > result[2].abs_pearson_r

    def test_positive_and_negative(self):
        """Negative correlations should also be detected and ranked."""
        data = {
            "target": [1.0, 2.0, 3.0, 4.0, 5.0],
            "positive": [2.0, 4.0, 6.0, 8.0, 10.0],
            "negative": [10.0, 8.0, 6.0, 4.0, 2.0],
        }
        result = rank_variable_importance(data, "target")

        assert len(result) == 2
        # Both should have abs_r = 1.0
        for item in result:
            assert item.abs_pearson_r == pytest.approx(1.0)
        # One should be positive, one negative
        r_values = {item.variable_name: item.pearson_r for item in result}
        assert r_values["positive"] == pytest.approx(1.0)
        assert r_values["negative"] == pytest.approx(-1.0)

    def test_characteristic_id_default_zero(self):
        """Engine returns characteristic_id=0 (API layer fills in real IDs)."""
        data = {
            "target": [1.0, 2.0, 3.0],
            "other": [4.0, 5.0, 6.0],
        }
        result = rank_variable_importance(data, "target")
        assert result[0].characteristic_id == 0

    def test_target_not_found_raises(self):
        """Should raise ValueError if target is not in data."""
        data = {"x": [1.0, 2.0, 3.0], "y": [4.0, 5.0, 6.0]}
        with pytest.raises(ValueError, match="not found"):
            rank_variable_importance(data, "missing")

    def test_too_few_observations_raises(self):
        """Should raise ValueError for < 3 observations."""
        data = {"target": [1.0, 2.0], "other": [3.0, 4.0]}
        with pytest.raises(ValueError, match="at least 3 observations"):
            rank_variable_importance(data, "target")
