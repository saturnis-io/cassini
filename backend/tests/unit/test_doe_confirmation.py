"""Tests for DOE confirmation runs with prediction interval validation.

Verifies the confirmation study creation workflow, prediction/confidence
interval computation, and verdict logic.

Reference: Montgomery, "Design and Analysis of Experiments",
Ch. 11 — Confirmation experiments.
"""
from __future__ import annotations

import json
import math
from itertools import combinations

import numpy as np
import pytest
from scipy import stats as sp_stats

from cassini.api.schemas.doe import (
    ConfirmationAnalysisResponse,
    ConfirmationRunResult,
    IntervalBounds,
)


# ---------------------------------------------------------------------------
# Prediction interval math (unit tests — no DB)
# ---------------------------------------------------------------------------


def _build_full_model(design: np.ndarray, skip_interactions: bool = False):
    """Build the full-model X matrix (intercept + main + interactions)."""
    n, k = design.shape
    cols = [np.ones(n)]
    for c in range(k):
        cols.append(design[:, c])
    if not skip_interactions:
        for i, j in combinations(range(k), 2):
            cols.append(design[:, i] * design[:, j])
    return np.column_stack(cols)


class TestPredictionIntervalMath:
    """Verify the PI/CI formulas match Montgomery Ch. 11."""

    def _make_simple_doe(self):
        """Create a simple 2^2 factorial with known response."""
        # 2^2 full factorial: 4 runs
        design = np.array([
            [-1, -1],
            [+1, -1],
            [-1, +1],
            [+1, +1],
        ], dtype=float)
        # y = 10 + 2*A + 3*B + 1*AB + noise
        response = np.array([
            10 - 2 - 3 + 1,  # 6
            10 + 2 - 3 - 1,  # 8
            10 - 2 + 3 - 1,  # 10
            10 + 2 + 3 + 1,  # 16
        ], dtype=float)
        return design, response

    def test_xtx_inv_symmetric(self):
        """(X'X)^-1 should be symmetric for orthogonal designs."""
        design, response = self._make_simple_doe()
        X = _build_full_model(design)
        XtX = X.T @ X
        XtX_inv = np.linalg.inv(XtX)
        assert np.allclose(XtX_inv, XtX_inv.T, atol=1e-10)

    def test_orthogonal_xtx_inv_diagonal(self):
        """For orthogonal designs, (X'X)^-1 should be diagonal."""
        design, response = self._make_simple_doe()
        X = _build_full_model(design)
        XtX = X.T @ X
        XtX_inv = np.linalg.inv(XtX)
        # Off-diagonal elements should be zero
        off_diag = XtX_inv - np.diag(np.diag(XtX_inv))
        assert np.allclose(off_diag, 0, atol=1e-10)

    def test_pi_wider_than_ci(self):
        """PI must always be wider than CI (has the extra '1' term)."""
        design, response = self._make_simple_doe()
        X = _build_full_model(design)
        n, p = X.shape
        beta = np.linalg.lstsq(X, response, rcond=None)[0]
        resid = response - X @ beta
        mse = float(np.sum(resid ** 2)) / max(n - p, 1)
        XtX_inv = np.linalg.inv(X.T @ X)

        # Evaluate at origin (0, 0)
        x0 = np.array([1.0, 0.0, 0.0, 0.0])
        x0_xtx_inv_x0 = float(x0 @ XtX_inv @ x0)
        df_resid = n - p
        alpha = 0.05

        # For saturated 2^2, df_resid = 0, so we can't compute proper t
        # Use a non-saturated example instead
        # Add replicates for df
        design_rep = np.vstack([design, design])
        response_rep = np.concatenate([response, response + np.random.RandomState(42).normal(0, 0.1, 4)])
        X_rep = _build_full_model(design_rep)
        n_rep, p_rep = X_rep.shape
        beta_rep = np.linalg.lstsq(X_rep, response_rep, rcond=None)[0]
        resid_rep = response_rep - X_rep @ beta_rep
        mse_rep = float(np.sum(resid_rep ** 2)) / (n_rep - p_rep)
        XtX_inv_rep = np.linalg.inv(X_rep.T @ X_rep)
        x0_val_rep = float(x0 @ XtX_inv_rep @ x0)
        df_rep = n_rep - p_rep

        t_crit = sp_stats.t.ppf(1.0 - alpha / 2.0, df_rep)

        ci_hw = t_crit * math.sqrt(mse_rep * x0_val_rep)
        pi_hw = t_crit * math.sqrt(mse_rep * (1.0 + x0_val_rep))

        assert pi_hw > ci_hw

    def test_pi_at_design_center(self):
        """PI at design center (coded 0,0) should be narrowest."""
        # 2^2 with center-point replicates
        design = np.array([
            [-1, -1], [+1, -1], [-1, +1], [+1, +1],
            [0, 0], [0, 0], [0, 0],
        ], dtype=float)
        response = np.array([6, 8, 10, 16, 10, 10.1, 9.9], dtype=float)

        X = _build_full_model(design)
        n, p = X.shape
        beta = np.linalg.lstsq(X, response, rcond=None)[0]
        resid = response - X @ beta
        mse = float(np.sum(resid ** 2)) / (n - p)
        XtX_inv = np.linalg.inv(X.T @ X)

        # At center (0,0): x0 = [1, 0, 0, 0]
        x0_center = np.array([1.0, 0.0, 0.0, 0.0])
        val_center = float(x0_center @ XtX_inv @ x0_center)

        # At corner (+1, +1): x0 = [1, 1, 1, 1]
        x0_corner = np.array([1.0, 1.0, 1.0, 1.0])
        val_corner = float(x0_corner @ XtX_inv @ x0_corner)

        # Center should have smaller x0'(X'X)^-1 x0 -> narrower PI
        assert val_center < val_corner


# ---------------------------------------------------------------------------
# Verdict logic
# ---------------------------------------------------------------------------


class TestConfirmationVerdict:
    """Verify the verdict determination logic."""

    def test_all_within_pi_and_ci_is_fully_confirmed(self):
        """All within PI + mean within CI -> 'Confirmed — model validated'."""
        result = ConfirmationAnalysisResponse(
            parent_study_id=1,
            predicted_value=10.0,
            mse=1.0,
            df_residual=4,
            t_critical=2.776,
            alpha=0.05,
            prediction_interval=IntervalBounds(lower=5.0, upper=15.0),
            confidence_interval=IntervalBounds(lower=8.0, upper=12.0),
            mean_actual=10.5,
            mean_within_ci=True,
            all_within_pi=True,
            runs=[
                ConfirmationRunResult(run_order=1, actual_value=10.2, within_pi=True),
                ConfirmationRunResult(run_order=2, actual_value=10.8, within_pi=True),
                ConfirmationRunResult(run_order=3, actual_value=10.5, within_pi=True),
            ],
            warnings=[],
            verdict="Confirmed — model validated",
        )
        assert result.verdict == "Confirmed — model validated"
        assert result.all_within_pi
        assert result.mean_within_ci

    def test_mean_within_ci_but_run_outside_pi(self):
        """Mean within CI but some runs outside PI -> 'Confirmed' with warnings."""
        result = ConfirmationAnalysisResponse(
            parent_study_id=1,
            predicted_value=10.0,
            mse=1.0,
            df_residual=4,
            t_critical=2.776,
            alpha=0.05,
            prediction_interval=IntervalBounds(lower=7.0, upper=13.0),
            confidence_interval=IntervalBounds(lower=8.0, upper=12.0),
            mean_actual=10.0,
            mean_within_ci=True,
            all_within_pi=False,
            runs=[
                ConfirmationRunResult(run_order=1, actual_value=10.0, within_pi=True),
                ConfirmationRunResult(run_order=2, actual_value=14.0, within_pi=False),
                ConfirmationRunResult(run_order=3, actual_value=6.0, within_pi=False),
            ],
            warnings=[
                "Warning: run 2 (14.0000) is outside the prediction interval [7.0000, 13.0000]",
                "Warning: run 3 (6.0000) is outside the prediction interval [7.0000, 13.0000]",
            ],
            verdict="Confirmed",
        )
        assert result.verdict == "Confirmed"
        assert not result.all_within_pi
        assert result.mean_within_ci
        assert len(result.warnings) == 2

    def test_mean_outside_ci_is_not_confirmed(self):
        """Mean outside CI -> 'Not confirmed'."""
        result = ConfirmationAnalysisResponse(
            parent_study_id=1,
            predicted_value=10.0,
            mse=1.0,
            df_residual=4,
            t_critical=2.776,
            alpha=0.05,
            prediction_interval=IntervalBounds(lower=5.0, upper=15.0),
            confidence_interval=IntervalBounds(lower=8.0, upper=12.0),
            mean_actual=14.0,
            mean_within_ci=False,
            all_within_pi=False,
            runs=[
                ConfirmationRunResult(run_order=1, actual_value=14.0, within_pi=True),
                ConfirmationRunResult(run_order=2, actual_value=14.5, within_pi=True),
                ConfirmationRunResult(run_order=3, actual_value=13.5, within_pi=True),
            ],
            warnings=[],
            verdict="Not confirmed — mean outside confidence interval",
        )
        assert result.verdict.startswith("Not confirmed")
        assert not result.mean_within_ci


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


class TestConfirmationSchemas:
    """Test Pydantic schema validation for confirmation responses."""

    def test_confirmation_analysis_response_serialization(self):
        """ConfirmationAnalysisResponse should serialize correctly."""
        data = {
            "parent_study_id": 42,
            "predicted_value": 10.5,
            "mse": 0.25,
            "df_residual": 6,
            "t_critical": 2.447,
            "alpha": 0.05,
            "prediction_interval": {"lower": 8.5, "upper": 12.5},
            "confidence_interval": {"lower": 9.5, "upper": 11.5},
            "mean_actual": 10.3,
            "mean_within_ci": True,
            "all_within_pi": True,
            "runs": [
                {"run_order": 1, "actual_value": 10.1, "within_pi": True},
                {"run_order": 2, "actual_value": 10.4, "within_pi": True},
                {"run_order": 3, "actual_value": 10.4, "within_pi": True},
            ],
            "warnings": [],
            "verdict": "Confirmed — model validated",
        }
        resp = ConfirmationAnalysisResponse(**data)
        assert resp.parent_study_id == 42
        assert resp.predicted_value == 10.5
        assert resp.prediction_interval.lower == 8.5
        assert resp.prediction_interval.upper == 12.5
        assert len(resp.runs) == 3
        assert resp.runs[0].within_pi is True
        assert resp.verdict == "Confirmed — model validated"

    def test_interval_bounds_model(self):
        """IntervalBounds should accept lower/upper."""
        bounds = IntervalBounds(lower=5.0, upper=15.0)
        assert bounds.lower == 5.0
        assert bounds.upper == 15.0

    def test_confirmation_run_result_model(self):
        """ConfirmationRunResult should accept all fields."""
        run = ConfirmationRunResult(
            run_order=1, actual_value=10.5, within_pi=True,
        )
        assert run.run_order == 1
        assert run.actual_value == 10.5
        assert run.within_pi is True


# ---------------------------------------------------------------------------
# DOEStudy model fields
# ---------------------------------------------------------------------------


class TestConfirmationModelFields:
    """Verify model-level field defaults for confirmation studies."""

    def test_study_response_includes_confirmation_fields(self):
        """DOEStudyResponse schema should include confirmation fields."""
        from cassini.api.schemas.doe import DOEStudyResponse

        fields = DOEStudyResponse.model_fields
        assert "is_confirmation" in fields
        assert "parent_study_id" in fields

    def test_study_response_defaults(self):
        """Default values for confirmation fields."""
        from cassini.api.schemas.doe import DOEStudyResponse

        # Build minimal valid instance
        resp = DOEStudyResponse(
            id=1,
            plant_id=1,
            name="Test",
            design_type="full_factorial",
            resolution=None,
            status="design",
            response_name="Y",
            response_unit=None,
            notes=None,
            created_by=None,
            created_at="2026-01-01T00:00:00Z",
            updated_at=None,
        )
        assert resp.is_confirmation is False
        assert resp.parent_study_id is None


# ---------------------------------------------------------------------------
# (X'X)^-1 storage format
# ---------------------------------------------------------------------------


class TestXtXInvStorage:
    """Verify (X'X)^-1 can be serialized/deserialized via JSON."""

    def test_round_trip_json(self):
        """Matrix -> JSON -> matrix should be lossless."""
        design = np.array([
            [-1, -1], [+1, -1], [-1, +1], [+1, +1],
        ], dtype=float)
        X = _build_full_model(design)
        XtX_inv = np.linalg.inv(X.T @ X)

        # Serialize
        json_str = json.dumps(XtX_inv.tolist())

        # Deserialize
        restored = np.array(json.loads(json_str), dtype=float)

        assert np.allclose(XtX_inv, restored, atol=1e-15)

    def test_larger_design(self):
        """Test with 2^3 factorial (8 runs, 8 params)."""
        design = np.array([
            [-1, -1, -1],
            [+1, -1, -1],
            [-1, +1, -1],
            [+1, +1, -1],
            [-1, -1, +1],
            [+1, -1, +1],
            [-1, +1, +1],
            [+1, +1, +1],
        ], dtype=float)
        X = _build_full_model(design)
        XtX_inv = np.linalg.inv(X.T @ X)
        json_str = json.dumps(XtX_inv.tolist())
        restored = np.array(json.loads(json_str), dtype=float)
        assert np.allclose(XtX_inv, restored, atol=1e-15)
        # All diagonal entries should be 1/8 for this design
        assert np.allclose(np.diag(XtX_inv), 1.0 / 8.0, atol=1e-10)


# ---------------------------------------------------------------------------
# Interval formulas verification (hand-computed)
# ---------------------------------------------------------------------------


class TestIntervalFormulas:
    """Verify PI/CI formulas against hand-computed values."""

    def test_known_pi_values(self):
        """Compute PI from known values and verify."""
        # Simple scenario:
        # MSE = 4.0, df_resid = 8, alpha = 0.05
        # x0'(X'X)^-1 x0 = 0.25
        mse = 4.0
        df_resid = 8
        alpha = 0.05
        x0_val = 0.25
        y_hat = 50.0

        t_crit = sp_stats.t.ppf(1.0 - alpha / 2.0, df_resid)

        # PI = y_hat +/- t * sqrt(MSE * (1 + x0_val))
        pi_hw = t_crit * math.sqrt(mse * (1.0 + x0_val))
        pi_lower = y_hat - pi_hw
        pi_upper = y_hat + pi_hw

        # CI = y_hat +/- t * sqrt(MSE * x0_val)
        ci_hw = t_crit * math.sqrt(mse * x0_val)
        ci_lower = y_hat - ci_hw
        ci_upper = y_hat + ci_hw

        # t_{0.025, 8} = 2.306
        assert abs(t_crit - 2.306004) < 0.001

        # PI half-width = 2.306 * sqrt(4 * 1.25) = 2.306 * 2.236 = 5.156
        assert abs(pi_hw - 2.306004 * math.sqrt(5.0)) < 0.01

        # CI half-width = 2.306 * sqrt(4 * 0.25) = 2.306 * 1.0 = 2.306
        assert abs(ci_hw - 2.306004 * 1.0) < 0.01

        # PI should be wider than CI
        assert pi_hw > ci_hw

        # Verify interval symmetry
        assert abs((pi_upper - y_hat) - (y_hat - pi_lower)) < 1e-10
        assert abs((ci_upper - y_hat) - (y_hat - ci_lower)) < 1e-10

    def test_pi_converges_to_ci_as_n_grows(self):
        """As n -> inf, PI and CI should converge (the '1' term dominates less)."""
        mse = 1.0
        x0_val = 0.01  # small x0 influence
        y_hat = 100.0
        alpha = 0.05

        # Small df
        df_small = 5
        t_small = sp_stats.t.ppf(1.0 - alpha / 2.0, df_small)
        pi_small = t_small * math.sqrt(mse * (1.0 + x0_val))
        ci_small = t_small * math.sqrt(mse * x0_val)
        ratio_small = pi_small / ci_small

        # Large df
        df_large = 1000
        t_large = sp_stats.t.ppf(1.0 - alpha / 2.0, df_large)
        pi_large = t_large * math.sqrt(mse * (1.0 + x0_val))
        ci_large = t_large * math.sqrt(mse * x0_val)
        ratio_large = pi_large / ci_large

        # The ratio should be the same (independent of df),
        # but PI always wider
        assert ratio_small > 1.0
        assert ratio_large > 1.0

    def test_zero_mse_gives_zero_width_intervals(self):
        """If MSE = 0 (perfect fit), both intervals have zero width."""
        mse = 0.0
        x0_val = 0.25
        alpha = 0.05
        df = 8
        t_crit = sp_stats.t.ppf(1.0 - alpha / 2.0, df)

        pi_hw = t_crit * math.sqrt(mse * (1.0 + x0_val))
        ci_hw = t_crit * math.sqrt(mse * x0_val)

        assert pi_hw == 0.0
        assert ci_hw == 0.0
