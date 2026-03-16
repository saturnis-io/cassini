"""Tests for Plackett-Burman screening designs and extended fractional factorial.

Verifies PB design construction (cyclic shift, projection), matrix properties,
extended fractional factorial generator table, and interaction disabling.
"""
from __future__ import annotations

import numpy as np
import pytest

from cassini.core.doe.designs import (
    DesignResult,
    fractional_factorial,
    plackett_burman,
    _PB_GENERATORS,
    _FRAC_GENERATORS,
)


# ---------------------------------------------------------------------------
# Plackett-Burman construction
# ---------------------------------------------------------------------------


class TestPlackettBurmanConstruction:
    """Verify PB design matrix construction via cyclic left-shift."""

    def test_pb_n3_produces_4_runs(self):
        """N=3 PB should produce 4 runs (N+1)."""
        result = plackett_burman(3)
        assert result.n_runs == 4
        assert result.n_factors == 3
        assert result.design_type == "plackett_burman"

    def test_pb_n7_produces_8_runs(self):
        """N=7 PB should produce 8 runs."""
        result = plackett_burman(7)
        assert result.n_runs == 8
        assert result.n_factors == 7

    def test_pb_n11_produces_12_runs(self):
        """N=11 PB should produce 12 runs."""
        result = plackett_burman(11)
        assert result.n_runs == 12
        assert result.n_factors == 11

    def test_pb_n15_produces_16_runs(self):
        """N=15 PB should produce 16 runs."""
        result = plackett_burman(15)
        assert result.n_runs == 16
        assert result.n_factors == 15

    def test_pb_n19_produces_20_runs(self):
        """N=19 PB should produce 20 runs."""
        result = plackett_burman(19)
        assert result.n_runs == 20
        assert result.n_factors == 19

    def test_pb_n23_produces_24_runs(self):
        """N=23 PB should produce 24 runs."""
        result = plackett_burman(23)
        assert result.n_runs == 24
        assert result.n_factors == 23

    def test_pb_values_are_plus_minus_one(self):
        """All PB matrix entries should be +1 or -1 (no center points)."""
        for n in [3, 7, 11, 15, 19, 23]:
            result = plackett_burman(n)
            unique_vals = set(np.unique(result.coded_matrix))
            assert unique_vals == {-1.0, 1.0}, (
                f"N={n}: expected {{-1, 1}}, got {unique_vals}"
            )

    def test_pb_last_row_is_all_minus_one(self):
        """The final row of a PB design should be all -1s."""
        for n in [3, 7, 11, 15, 19, 23]:
            result = plackett_burman(n)
            last_row = result.coded_matrix[-1, :]
            np.testing.assert_array_equal(
                last_row, np.full(n, -1.0),
                err_msg=f"N={n}: last row should be all -1s",
            )

    def test_pb_cyclic_shift_structure(self):
        """Rows 1..N-1 should each be a cyclic left-shift of the previous."""
        result = plackett_burman(7)
        matrix = result.coded_matrix
        # Check rows 0 through N-2 (before the final all-minus row)
        for i in range(1, 7):  # rows 1-6
            prev = matrix[i - 1].tolist()
            curr = matrix[i].tolist()
            expected = prev[1:] + [prev[0]]
            assert curr == expected, (
                f"Row {i} should be left-shift of row {i-1}"
            )

    def test_pb_no_center_points(self):
        """PB designs should have no center points."""
        result = plackett_burman(7)
        assert all(not cp for cp in result.is_center_point)


# ---------------------------------------------------------------------------
# Plackett-Burman projection (non-standard factor counts)
# ---------------------------------------------------------------------------


class TestPlackettBurmanProjection:
    """Verify projection for non-standard factor counts."""

    def test_5_factors_uses_n7_pb(self):
        """5 factors should use the N=7 PB (8 runs), dropping 2 columns."""
        result = plackett_burman(5)
        assert result.n_runs == 8  # N=7 -> 8 runs
        assert result.n_factors == 5
        assert result.coded_matrix.shape == (8, 5)

    def test_2_factors_uses_n3_pb(self):
        """2 factors should use the N=3 PB (4 runs), dropping 1 column."""
        result = plackett_burman(2)
        assert result.n_runs == 4
        assert result.n_factors == 2
        assert result.coded_matrix.shape == (4, 2)

    def test_4_factors_uses_n7_pb(self):
        """4 factors should use N=7 PB (8 runs)."""
        result = plackett_burman(4)
        assert result.n_runs == 8
        assert result.n_factors == 4

    def test_10_factors_uses_n11_pb(self):
        """10 factors should use N=11 PB (12 runs)."""
        result = plackett_burman(10)
        assert result.n_runs == 12
        assert result.n_factors == 10

    def test_projection_preserves_balance(self):
        """Projected columns should still have roughly equal +1 and -1 counts."""
        result = plackett_burman(5)
        for col in range(5):
            n_plus = np.sum(result.coded_matrix[:, col] > 0)
            n_minus = np.sum(result.coded_matrix[:, col] < 0)
            assert abs(n_plus - n_minus) <= 2, (
                f"Column {col}: {n_plus} plus, {n_minus} minus — not balanced"
            )


# ---------------------------------------------------------------------------
# Plackett-Burman column balance
# ---------------------------------------------------------------------------


class TestPlackettBurmanBalance:
    """Verify near-orthogonality of PB designs."""

    def test_column_balance(self):
        """Each column should have equal +1 and -1 entries (for standard sizes)."""
        for n in [3, 7, 11, 15, 19, 23]:
            result = plackett_burman(n)
            for col in range(n):
                n_plus = int(np.sum(result.coded_matrix[:, col] > 0))
                n_minus = int(np.sum(result.coded_matrix[:, col] < 0))
                total = n + 1
                assert n_plus == total // 2, (
                    f"N={n}, col={col}: expected {total // 2} plus, got {n_plus}"
                )
                assert n_minus == total // 2, (
                    f"N={n}, col={col}: expected {total // 2} minus, got {n_minus}"
                )

    def test_near_orthogonality(self):
        """X^T X should be approximately proportional to identity."""
        for n in [7, 11, 23]:
            result = plackett_burman(n)
            X = result.coded_matrix
            XtX = X.T @ X
            # Diagonal should be N+1 (each column has N+1 entries, all +/-1)
            expected_diag = n + 1
            for i in range(n):
                assert abs(XtX[i, i] - expected_diag) < 1e-10, (
                    f"N={n}: diagonal ({i},{i}) = {XtX[i,i]}, expected {expected_diag}"
                )
            # Off-diagonal should be small relative to diagonal
            for i in range(n):
                for j in range(i + 1, n):
                    ratio = abs(XtX[i, j]) / expected_diag
                    assert ratio < 0.5, (
                        f"N={n}: off-diagonal ({i},{j}) ratio = {ratio:.3f}"
                    )


# ---------------------------------------------------------------------------
# Plackett-Burman validation
# ---------------------------------------------------------------------------


class TestPlackettBurmanValidation:
    """Verify input validation."""

    def test_rejects_fewer_than_2_factors(self):
        with pytest.raises(ValueError, match="at least 2 factors"):
            plackett_burman(1)

    def test_rejects_zero_factors(self):
        with pytest.raises(ValueError, match="at least 2 factors"):
            plackett_burman(0)

    def test_rejects_more_than_23_factors(self):
        with pytest.raises(ValueError, match="up to 23 factors"):
            plackett_burman(24)

    def test_rejects_negative_factors(self):
        with pytest.raises(ValueError, match="at least 2 factors"):
            plackett_burman(-1)


# ---------------------------------------------------------------------------
# Plackett-Burman randomization
# ---------------------------------------------------------------------------


class TestPlackettBurmanRandomization:
    """Verify seed-based run order randomization."""

    def test_seed_produces_deterministic_order(self):
        r1 = plackett_burman(7, seed=42)
        r2 = plackett_burman(7, seed=42)
        assert r1.run_order == r2.run_order

    def test_different_seeds_produce_different_order(self):
        r1 = plackett_burman(7, seed=42)
        r2 = plackett_burman(7, seed=99)
        # Not guaranteed but overwhelmingly likely for 8 elements
        assert r1.run_order != r2.run_order

    def test_no_seed_keeps_standard_order(self):
        result = plackett_burman(7, seed=None)
        assert result.run_order == result.standard_order

    def test_standard_order_is_sequential(self):
        result = plackett_burman(11)
        assert result.standard_order == list(range(1, result.n_runs + 1))


# ---------------------------------------------------------------------------
# Extended fractional factorial generators
# ---------------------------------------------------------------------------


class TestExtendedFractionalFactorial:
    """Verify the extended _FRAC_GENERATORS lookup table."""

    def test_8_factor_design_exists(self):
        """Should have at least one entry for 8 factors."""
        keys_for_8 = [k for k in _FRAC_GENERATORS if k[0] == 8]
        assert len(keys_for_8) >= 1, "No fractional factorial for 8 factors"

    def test_9_factor_design_exists(self):
        keys_for_9 = [k for k in _FRAC_GENERATORS if k[0] == 9]
        assert len(keys_for_9) >= 1, "No fractional factorial for 9 factors"

    def test_10_factor_design_exists(self):
        keys_for_10 = [k for k in _FRAC_GENERATORS if k[0] == 10]
        assert len(keys_for_10) >= 1, "No fractional factorial for 10 factors"

    def test_15_factor_design_exists(self):
        keys_for_15 = [k for k in _FRAC_GENERATORS if k[0] == 15]
        assert len(keys_for_15) >= 1, "No fractional factorial for 15 factors"

    def test_8_factor_res5_produces_valid_design(self):
        """8 factors at Res V: 2^(8-2) = 64 runs."""
        result = fractional_factorial(8, resolution=5)
        assert result.n_factors == 8
        assert result.n_runs == 64  # 2^(8-2) = 64
        assert result.coded_matrix.shape == (64, 8)

    def test_8_factor_res4_produces_valid_design(self):
        """8 factors at Res IV: 2^(8-4) = 16 runs."""
        result = fractional_factorial(8, resolution=4)
        assert result.n_factors == 8
        assert result.n_runs == 16  # 2^(8-4) = 16

    def test_9_factor_res3_produces_valid_design(self):
        """9 factors at Res III: 2^(9-5) = 16 runs."""
        result = fractional_factorial(9, resolution=3)
        assert result.n_factors == 9
        assert result.n_runs == 16  # 2^(9-5) = 16

    def test_15_factor_res3_produces_valid_design(self):
        """15 factors at Res III: 2^(15-11) = 16 runs."""
        result = fractional_factorial(15, resolution=3)
        assert result.n_factors == 15
        assert result.n_runs == 16  # 2^(15-11) = 16

    def test_fractional_factorial_values_are_plus_minus_one(self):
        """All entries in a fractional factorial should be +/-1."""
        result = fractional_factorial(8, resolution=4)
        unique_vals = set(np.unique(result.coded_matrix))
        assert unique_vals == {-1.0, 1.0}

    def test_original_designs_still_work(self):
        """Existing designs should not be broken by the extension."""
        # These existed before the extension
        for n, res in [(3, 3), (4, 4), (5, 5), (5, 3), (6, 4)]:
            result = fractional_factorial(n, resolution=res)
            assert result.n_factors == n

    def test_error_for_unsupported_combination(self):
        """Should raise ValueError with helpful message for untabled designs."""
        with pytest.raises(ValueError, match="No fractional factorial"):
            fractional_factorial(20, resolution=5)

    def test_error_suggests_pb_for_large_factors(self):
        """Error message for large factor counts should suggest PB."""
        with pytest.raises(ValueError, match="Plackett-Burman"):
            fractional_factorial(20, resolution=4)

    def test_generator_column_independence(self):
        """Generated columns should not be identical to any base column."""
        result = fractional_factorial(8, resolution=5)
        X = result.coded_matrix
        n_independent = 8 - len(_FRAC_GENERATORS[(8, 5)])
        for gen_col in range(n_independent, 8):
            for base_col in range(n_independent):
                # Column should not be identical (would mean trivial alias)
                if np.array_equal(X[:, gen_col], X[:, base_col]):
                    pytest.fail(
                        f"Generated col {gen_col} is identical to base col {base_col}"
                    )
                if np.array_equal(X[:, gen_col], -X[:, base_col]):
                    pytest.fail(
                        f"Generated col {gen_col} is negation of base col {base_col}"
                    )


# ---------------------------------------------------------------------------
# PB design dispatch integration
# ---------------------------------------------------------------------------


class TestPlackettBurmanDispatch:
    """Verify PB integrates with the engine dispatch."""

    def test_design_type_label(self):
        result = plackett_burman(5)
        assert result.design_type == "plackett_burman"

    def test_standard_order_and_run_order_lengths_match(self):
        result = plackett_burman(11)
        assert len(result.standard_order) == result.n_runs
        assert len(result.run_order) == result.n_runs
        assert len(result.is_center_point) == result.n_runs

    def test_coded_matrix_shape(self):
        result = plackett_burman(7)
        assert result.coded_matrix.shape == (result.n_runs, result.n_factors)


# ---------------------------------------------------------------------------
# PB generating vectors verification
# ---------------------------------------------------------------------------


class TestPBGeneratingVectors:
    """Verify the stored generating vectors match published PB designs."""

    def test_generating_vector_lengths(self):
        """Each generating vector should have exactly N elements."""
        for n, gen in _PB_GENERATORS.items():
            assert len(gen) == n, (
                f"Generator for N={n} has {len(gen)} elements, expected {n}"
            )

    def test_generating_vectors_are_plus_minus_one(self):
        """All entries in generating vectors should be +1 or -1."""
        for n, gen in _PB_GENERATORS.items():
            for val in gen:
                assert val in (1, -1), (
                    f"N={n}: generator contains {val}, expected +1 or -1"
                )

    def test_n7_generating_vector(self):
        """Verify N=7 generating vector matches Plackett & Burman (1946)."""
        assert _PB_GENERATORS[7] == [1, 1, 1, -1, 1, -1, -1]

    def test_n11_generating_vector(self):
        """Verify N=11 generating vector matches Plackett & Burman (1946)."""
        assert _PB_GENERATORS[11] == [1, 1, -1, 1, 1, 1, -1, -1, -1, 1, -1]

    def test_n23_generating_vector(self):
        """Verify N=23 generating vector matches Plackett & Burman (1946)."""
        expected = [1, 1, 1, 1, 1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, -1, 1, -1, 1, -1, -1, -1, -1]
        assert _PB_GENERATORS[23] == expected
