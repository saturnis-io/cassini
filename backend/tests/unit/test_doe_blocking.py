"""Tests for DOE blocking support.

Verifies block assignment for factorial and fractional factorial designs,
validation (no main-effect confounding, power-of-2 constraint), and
block sum-of-squares computation for ANOVA.
"""
from __future__ import annotations

import numpy as np
import pytest

from cassini.core.doe.analysis import compute_block_ss
from cassini.core.doe.designs import (
    DesignResult,
    _assign_blocks_factorial,
    _is_power_of_two,
    _validate_blocking,
    fractional_factorial,
    full_factorial,
)


# ---------------------------------------------------------------------------
# Power-of-two helper
# ---------------------------------------------------------------------------


class TestIsPowerOfTwo:
    def test_powers_of_two(self):
        for n in [1, 2, 4, 8, 16, 32, 64]:
            assert _is_power_of_two(n), f"{n} should be power of 2"

    def test_non_powers_of_two(self):
        for n in [3, 5, 6, 7, 9, 10, 12, 15]:
            assert not _is_power_of_two(n), f"{n} should not be power of 2"

    def test_zero(self):
        assert not _is_power_of_two(0)

    def test_negative(self):
        assert not _is_power_of_two(-4)


# ---------------------------------------------------------------------------
# Full factorial blocking
# ---------------------------------------------------------------------------


class TestFullFactorialBlocking:
    """Test blocking of 2^k full factorial designs."""

    def test_2_factor_2_blocks(self):
        """2^2 design with 2 blocks should produce 4 runs in 2 blocks."""
        result = full_factorial(2, n_blocks=2)
        assert result.block_assignments is not None
        assert len(result.block_assignments) == 4
        unique_blocks = set(result.block_assignments)
        assert len(unique_blocks) == 2

    def test_3_factor_2_blocks(self):
        """2^3 design with 2 blocks: confounds ABC interaction."""
        result = full_factorial(3, n_blocks=2)
        assert result.block_assignments is not None
        assert len(result.block_assignments) == 8
        unique_blocks = set(result.block_assignments)
        assert len(unique_blocks) == 2
        # Each block should have 4 runs
        blocks = result.block_assignments
        assert blocks.count(1) == 4
        assert blocks.count(2) == 4

    def test_4_factor_2_blocks(self):
        """2^4 design with 2 blocks."""
        result = full_factorial(4, n_blocks=2)
        assert result.block_assignments is not None
        blocks = result.block_assignments
        assert blocks.count(1) == 8
        assert blocks.count(2) == 8

    def test_4_factor_4_blocks(self):
        """2^4 design with 4 blocks."""
        result = full_factorial(4, n_blocks=4)
        assert result.block_assignments is not None
        blocks = result.block_assignments
        unique = set(blocks)
        assert len(unique) == 4
        # Each block should have 4 runs
        for blk in unique:
            assert blocks.count(blk) == 4

    def test_blocking_preserves_matrix(self):
        """Blocking should not modify the coded design matrix."""
        result_no_block = full_factorial(3, seed=42)
        result_blocked = full_factorial(3, n_blocks=2, seed=42)
        np.testing.assert_array_equal(
            result_no_block.coded_matrix,
            result_blocked.coded_matrix,
        )

    def test_no_blocking_returns_none(self):
        """Without n_blocks, block_assignments should be None."""
        result = full_factorial(3)
        assert result.block_assignments is None

    def test_blocking_with_center_points(self):
        """Center points should get block 0."""
        result = full_factorial(3, center_points=3, n_blocks=2)
        assert result.block_assignments is not None
        blocks = result.block_assignments
        # Last 3 entries should be 0 (center points)
        assert blocks[-3:] == [0, 0, 0]
        # First 8 should be blocks 1 or 2
        for blk in blocks[:8]:
            assert blk in (1, 2)

    def test_design_result_has_block_field(self):
        """DesignResult should have block_assignments attribute."""
        result = full_factorial(3, n_blocks=2)
        assert hasattr(result, "block_assignments")
        assert isinstance(result.block_assignments, list)


# ---------------------------------------------------------------------------
# Fractional factorial blocking
# ---------------------------------------------------------------------------


class TestFractionalFactorialBlocking:
    """Test blocking of fractional factorial designs."""

    def test_4_factor_res4_2_blocks(self):
        """2^(4-1) Res IV with 2 blocks."""
        result = fractional_factorial(4, resolution=4, n_blocks=2)
        assert result.block_assignments is not None
        assert len(result.block_assignments) == 8  # 2^3 = 8 runs
        unique = set(result.block_assignments)
        assert len(unique) == 2

    def test_5_factor_res5_2_blocks(self):
        """2^(5-1) Res V with 2 blocks."""
        result = fractional_factorial(5, resolution=5, n_blocks=2)
        assert result.block_assignments is not None
        assert len(result.block_assignments) == 16
        unique = set(result.block_assignments)
        assert len(unique) == 2


# ---------------------------------------------------------------------------
# Block validation
# ---------------------------------------------------------------------------


class TestBlockValidation:
    """Verify that blocking validation catches confounded main effects."""

    def test_validates_main_effects_vary_within_blocks(self):
        """Each main effect should have both levels in each block."""
        result = full_factorial(3, n_blocks=2)
        assert result.block_assignments is not None
        blocks = np.array(result.block_assignments)
        matrix = result.coded_matrix

        for blk in [1, 2]:
            mask = blocks == blk
            for col in range(3):
                vals = np.unique(matrix[mask, col])
                assert len(vals) >= 2, (
                    f"Block {blk}, factor {col}: only level(s) {vals}"
                )

    def test_rejects_non_power_of_two(self):
        """n_blocks must be power of 2."""
        with pytest.raises(ValueError, match="power of 2"):
            full_factorial(3, n_blocks=3)

    def test_rejects_1_block(self):
        """n_blocks=1 makes no sense."""
        # n_blocks=1 is < 2, so full_factorial won't activate blocking
        result = full_factorial(3, n_blocks=1)
        assert result.block_assignments is None

    def test_validate_blocking_raises_on_confounded_main(self):
        """Direct call to _validate_blocking should catch confounding."""
        # Contrived: all runs in one block have same level for factor 0
        matrix = np.array([
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
        ], dtype=float)
        blocks = [1, 1, 2, 2]  # Factor 0 confounded with blocks

        with pytest.raises(ValueError, match="confounds main effect"):
            _validate_blocking(matrix, blocks, 2)


# ---------------------------------------------------------------------------
# Block sum of squares
# ---------------------------------------------------------------------------


class TestBlockSumOfSquares:
    """Verify block SS computation for ANOVA."""

    def test_basic_block_ss(self):
        """Block SS should capture between-block variation."""
        # 2 blocks, different means
        response = np.array([10.0, 12.0, 20.0, 22.0])
        blocks = np.array([1, 1, 2, 2])

        ss_block, df_block = compute_block_ss(response, blocks)

        # Block 1 mean = 11, Block 2 mean = 21, Grand mean = 16
        # SS_block = 2*(11-16)^2 + 2*(21-16)^2 = 2*25 + 2*25 = 100
        assert abs(ss_block - 100.0) < 1e-10
        assert df_block == 1

    def test_three_blocks(self):
        """SS with 3 blocks."""
        response = np.array([10.0, 12.0, 20.0, 22.0, 30.0, 32.0])
        blocks = np.array([1, 1, 2, 2, 3, 3])

        ss_block, df_block = compute_block_ss(response, blocks)

        # Block means: 11, 21, 31. Grand mean: 21
        # SS = 2*(11-21)^2 + 2*(21-21)^2 + 2*(31-21)^2 = 200 + 0 + 200 = 400
        assert abs(ss_block - 400.0) < 1e-10
        assert df_block == 2

    def test_zero_block_excluded(self):
        """Block 0 (center points) should be excluded from SS calculation."""
        response = np.array([10.0, 12.0, 20.0, 22.0, 15.0])
        blocks = np.array([1, 1, 2, 2, 0])

        ss_block, df_block = compute_block_ss(response, blocks)

        # Only blocks 1 and 2 contribute
        # Block 1 mean = 11, Block 2 mean = 21
        # Grand mean (all 5 values) = 15.8
        grand_mean = float(np.mean(response))
        expected = 2 * (11.0 - grand_mean) ** 2 + 2 * (21.0 - grand_mean) ** 2
        assert abs(ss_block - expected) < 1e-10
        assert df_block == 1

    def test_no_blocks_returns_zero(self):
        """If all blocks are 0, SS should be 0."""
        response = np.array([10.0, 20.0, 30.0])
        blocks = np.array([0, 0, 0])

        ss_block, df_block = compute_block_ss(response, blocks)
        assert ss_block == 0.0
        assert df_block == 0

    def test_single_block_returns_zero(self):
        """If there's only one real block, df = 0."""
        response = np.array([10.0, 20.0, 30.0])
        blocks = np.array([1, 1, 1])

        ss_block, df_block = compute_block_ss(response, blocks)
        assert df_block == 0


# ---------------------------------------------------------------------------
# Integration: blocking in ANOVA table
# ---------------------------------------------------------------------------


class TestBlockingANOVAIntegration:
    """Verify blocks appear in ANOVA-style analysis."""

    def test_blocked_design_has_balanced_blocks(self):
        """A blocked full factorial should produce equal-sized blocks."""
        result = full_factorial(3, n_blocks=2)
        assert result.block_assignments is not None

        block_counts: dict[int, int] = {}
        for blk in result.block_assignments:
            block_counts[blk] = block_counts.get(blk, 0) + 1

        # Each block should have exactly 4 runs (8 runs / 2 blocks)
        assert block_counts[1] == 4
        assert block_counts[2] == 4

    def test_block_ss_is_non_negative(self):
        """Block SS should always be >= 0."""
        result = full_factorial(3, n_blocks=2)
        assert result.block_assignments is not None

        # Simulate response values
        rng = np.random.default_rng(42)
        response = rng.normal(50, 5, size=result.n_runs)

        # Add block effect
        for i, blk in enumerate(result.block_assignments):
            if blk == 2:
                response[i] += 10.0

        blocks = np.array(result.block_assignments)
        ss_block, df_block = compute_block_ss(response, blocks)

        assert ss_block >= 0.0
        assert df_block == 1
