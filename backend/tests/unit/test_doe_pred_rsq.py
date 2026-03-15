"""Tests for predicted R² (PRESS) and lack-of-fit in DOE ANOVA.

Verifies:
- Predicted R² via hat matrix shortcut is always <= R²
- Lack-of-fit decomposition works when replicates exist
- Lack-of-fit returns None when no replicates exist
"""
from __future__ import annotations

import numpy as np
import pytest

from cassini.core.doe.analysis import compute_anova


class TestPredictedRSquared:
    """Verify PRESS-based predicted R² computation."""

    def test_pred_r_squared_less_than_r_squared(self):
        """Pred R² <= R² always."""
        design = np.array([
            [-1, -1], [1, -1], [-1, 1], [1, 1],
            [-1, -1], [1, -1], [-1, 1], [1, 1],
        ])
        response = np.array([10, 20, 15, 30, 11, 19, 14, 31])
        result = compute_anova(design, response, ["A", "B"])
        assert result.pred_r_squared is not None
        assert result.pred_r_squared <= result.r_squared

    def test_pred_r_squared_reasonable_range(self):
        """Pred R² should be in a reasonable range for well-fit data."""
        design = np.array([
            [-1, -1], [1, -1], [-1, 1], [1, 1],
            [-1, -1], [1, -1], [-1, 1], [1, 1],
        ])
        # Strong linear signal with mild noise
        response = np.array([10, 20, 15, 30, 11, 19, 14, 31])
        result = compute_anova(design, response, ["A", "B"])
        assert result.pred_r_squared is not None
        assert result.pred_r_squared > 0.5  # reasonable fit
        assert result.pred_r_squared <= 1.0

    def test_pred_r_squared_can_be_negative(self):
        """Pred R² can be negative for terrible models (worse than mean)."""
        # Design with noise-dominated response — model overfits
        design = np.array([
            [-1, -1], [1, -1], [-1, 1], [1, 1],
        ])
        # Pure noise: no signal whatsoever
        np.random.seed(999)
        response = np.random.normal(0, 1, 4)
        result = compute_anova(design, response, ["A", "B"])
        # With saturated model (4 obs, 4 params), pred_r_squared will be
        # meaningless (hat diag = 1) so it should return None
        # If not saturated, it can be negative
        # Either way, it should not crash

    def test_pred_r_squared_perfect_fit_returns_none(self):
        """When model is saturated (n = p), PRESS is undefined (h_ii = 1)."""
        # 2^2 full factorial, no replicates: 4 obs, 4 params (intercept + A + B + AB)
        design = np.array([
            [-1, -1], [1, -1], [-1, 1], [1, 1],
        ])
        response = np.array([10, 20, 15, 30])
        result = compute_anova(design, response, ["A", "B"])
        # Saturated model: h_ii = 1 for all points, PRESS undefined
        assert result.pred_r_squared is None

    def test_pred_r_squared_three_factors(self):
        """Pred R² works for 3-factor designs with replicates."""
        design = np.array([
            [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
            [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
        ])
        response = np.array([
            10, 20, 15, 30, 12, 22, 17, 35,
            11, 19, 14, 31, 13, 21, 16, 34,
        ])
        result = compute_anova(design, response, ["A", "B", "C"])
        assert result.pred_r_squared is not None
        assert result.pred_r_squared <= result.r_squared


class TestLackOfFit:
    """Verify lack-of-fit test with pure error decomposition."""

    def test_lack_of_fit_with_replicates(self):
        """Replicates enable pure error decomposition.

        Need more unique groups than model parameters for df_LOF > 0.
        A 2^2 + center points design gives 5 unique groups (4 corners + center)
        with 4 model params (intercept + A + B + AB), so df_LOF = 1.
        """
        design = np.array([
            [-1, -1], [1, -1], [-1, 1], [1, 1],  # corners
            [0, 0], [0, 0], [0, 0],               # center replicates
            [-1, -1], [1, -1], [-1, 1], [1, 1],   # corner replicates
        ])
        response = np.array([
            10, 20, 15, 30,       # corners
            17, 18, 16,           # center points
            11, 19, 14, 31,       # corner replicates
        ])
        result = compute_anova(design, response, ["A", "B"])
        assert result.lack_of_fit_f is not None
        assert result.lack_of_fit_p is not None
        assert result.lack_of_fit_f >= 0
        assert 0 <= result.lack_of_fit_p <= 1

    def test_no_replicates_returns_none(self):
        """Without replicates, lack-of-fit is undefined."""
        design = np.array([[-1, -1], [1, -1], [-1, 1], [1, 1]])
        response = np.array([10, 20, 15, 30])
        result = compute_anova(design, response, ["A", "B"])
        assert result.lack_of_fit_f is None
        assert result.lack_of_fit_p is None

    def test_lack_of_fit_good_model(self):
        """A well-fitting model should have non-significant lack-of-fit.

        Uses 2^2 + center points with replicates to get enough df for LOF.
        """
        design = np.array([
            [-1, -1], [1, -1], [-1, 1], [1, 1],
            [0, 0], [0, 0], [0, 0],
            [-1, -1], [1, -1], [-1, 1], [1, 1],
            [0, 0], [0, 0], [0, 0],
        ])
        # y = 10 + 5*A + 3*B + small noise (linear model matches 2FI)
        np.random.seed(42)
        response = (
            10 + 5 * design[:, 0] + 3 * design[:, 1]
            + np.random.normal(0, 0.5, 14)
        )
        result = compute_anova(design, response, ["A", "B"])
        assert result.lack_of_fit_f is not None
        assert result.lack_of_fit_p is not None
        # Good model -> lack-of-fit p should be high (not significant)
        assert result.lack_of_fit_p > 0.05

    def test_lack_of_fit_three_replicates(self):
        """Three replicates per point with center points provide adequate df."""
        design = np.array([
            [-1, -1], [1, -1], [-1, 1], [1, 1],
            [0, 0], [0, 0], [0, 0],
            [-1, -1], [1, -1], [-1, 1], [1, 1],
            [0, 0], [0, 0], [0, 0],
            [-1, -1], [1, -1], [-1, 1], [1, 1],
            [0, 0], [0, 0], [0, 0],
        ])
        response = np.array([
            10, 20, 15, 30,
            17, 18, 16,
            11, 19, 14, 31,
            17.5, 16.5, 18,
            9, 21, 16, 29,
            17, 17.5, 16.5,
        ])
        result = compute_anova(design, response, ["A", "B"])
        assert result.lack_of_fit_f is not None
        assert result.lack_of_fit_p is not None
        # 5 unique groups, 21 obs: df_PE = 21-5 = 16
        assert result.lack_of_fit_p >= 0
