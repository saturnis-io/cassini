"""Tests for pooled sigma estimation.

Validates:
  - Equal subgroups: Sp matches hand-calculated values
  - Unequal subgroups: correctly weights by (n_i - 1)
  - Single subgroup: degenerates to the subgroup's own std dev
  - Rejects all size-1 subgroups (no variance from a single observation)

References:
  - ISO 22514-2:2017
  - Montgomery (2019), "Introduction to Statistical Quality Control", 8th Ed., Eq. 8.3
"""

import math

import pytest

from cassini.utils.statistics import estimate_sigma_pooled


class TestPooledSigmaEqualSubgroups:
    """Equal subgroup sizes should produce a simple RMS-pooled result."""

    def test_equal_subgroups_known_values(self):
        """Hand-calculated: 3 subgroups of size 5, known std devs."""
        # s1=2.0, s2=3.0, s3=2.5, all n=5
        # Sp = sqrt(((4*4) + (4*9) + (4*6.25)) / (4+4+4))
        #    = sqrt((16 + 36 + 25) / 12)
        #    = sqrt(77 / 12)
        #    = sqrt(6.4167) = 2.5331...
        stddevs = [2.0, 3.0, 2.5]
        sizes = [5, 5, 5]
        result = estimate_sigma_pooled(stddevs, sizes)
        expected = math.sqrt((4 * 4.0 + 4 * 9.0 + 4 * 6.25) / 12)
        assert abs(result - expected) < 1e-10, f"Expected {expected:.6f}, got {result:.6f}"

    def test_equal_subgroups_identical_stddevs(self):
        """When all subgroups have the same std dev, pooled = that std dev."""
        stddevs = [1.5, 1.5, 1.5, 1.5]
        sizes = [10, 10, 10, 10]
        result = estimate_sigma_pooled(stddevs, sizes)
        assert abs(result - 1.5) < 1e-10

    def test_equal_subgroups_two_groups(self):
        """Two subgroups of equal size."""
        stddevs = [1.0, 3.0]
        sizes = [6, 6]
        # Sp = sqrt(((5*1) + (5*9)) / 10) = sqrt(50/10) = sqrt(5) = 2.2360...
        expected = math.sqrt(5.0)
        result = estimate_sigma_pooled(stddevs, sizes)
        assert abs(result - expected) < 1e-10


class TestPooledSigmaUnequalSubgroups:
    """Unequal subgroup sizes should weight by (n_i - 1)."""

    def test_unequal_subgroups(self):
        """Subgroups with different sizes are correctly weighted."""
        # n1=3, s1=2.0 => (2)*4.0 = 8.0
        # n2=5, s2=1.0 => (4)*1.0 = 4.0
        # n3=10, s3=3.0 => (9)*9.0 = 81.0
        # total_df = 2 + 4 + 9 = 15
        # Sp = sqrt(93 / 15) = sqrt(6.2) = 2.489...
        stddevs = [2.0, 1.0, 3.0]
        sizes = [3, 5, 10]
        expected = math.sqrt((2 * 4.0 + 4 * 1.0 + 9 * 9.0) / 15)
        result = estimate_sigma_pooled(stddevs, sizes)
        assert abs(result - expected) < 1e-10, f"Expected {expected:.6f}, got {result:.6f}"

    def test_large_small_mix(self):
        """A very large subgroup should dominate the pooled estimate."""
        # n1=100, s1=1.0 => (99)*1.0 = 99.0
        # n2=2, s2=5.0 => (1)*25.0 = 25.0
        # total_df = 100
        # Sp = sqrt(124 / 100) = sqrt(1.24) = 1.1135...
        stddevs = [1.0, 5.0]
        sizes = [100, 2]
        expected = math.sqrt((99 * 1.0 + 1 * 25.0) / 100)
        result = estimate_sigma_pooled(stddevs, sizes)
        assert abs(result - expected) < 1e-10


class TestPooledSigmaSingleSubgroup:
    """Single subgroup should degenerate to the subgroup's own std dev."""

    def test_single_subgroup(self):
        """Single subgroup: pooled sigma = that subgroup's std dev."""
        # n=5, s=2.5 => Sp = sqrt((4*6.25)/4) = 2.5
        result = estimate_sigma_pooled([2.5], [5])
        assert abs(result - 2.5) < 1e-10

    def test_single_subgroup_large_n(self):
        """Single subgroup with large n."""
        result = estimate_sigma_pooled([3.14], [1000])
        assert abs(result - 3.14) < 1e-10


class TestPooledSigmaRejectsSize1:
    """All size-1 subgroups should be rejected (no within-subgroup variance)."""

    def test_all_size_1_raises(self):
        """All subgroups of size 1 => total_df = 0 => ValueError."""
        with pytest.raises(ValueError, match="size.*(1|zero|degrees)"):
            estimate_sigma_pooled([0.0, 0.0, 0.0], [1, 1, 1])

    def test_single_size_1_raises(self):
        """Single subgroup of size 1 => ValueError."""
        with pytest.raises(ValueError, match="size.*(1|zero|degrees)"):
            estimate_sigma_pooled([0.0], [1])


class TestPooledSigmaEdgeCases:
    """Edge cases and input validation."""

    def test_empty_lists_raises(self):
        """Empty inputs should raise ValueError."""
        with pytest.raises(ValueError):
            estimate_sigma_pooled([], [])

    def test_mismatched_lengths_raises(self):
        """Mismatched list lengths should raise ValueError."""
        with pytest.raises(ValueError):
            estimate_sigma_pooled([1.0, 2.0], [5])

    def test_zero_stddev_subgroups(self):
        """Zero std dev (constant values within subgroup) should work."""
        # n1=5, s1=0.0, n2=5, s2=2.0
        # Sp = sqrt((4*0 + 4*4)/8) = sqrt(2) = 1.4142...
        stddevs = [0.0, 2.0]
        sizes = [5, 5]
        expected = math.sqrt((4 * 0.0 + 4 * 4.0) / 8)
        result = estimate_sigma_pooled(stddevs, sizes)
        assert abs(result - expected) < 1e-10

    def test_negative_stddev_raises(self):
        """Negative std dev should raise ValueError."""
        with pytest.raises(ValueError, match="[Nn]egative"):
            estimate_sigma_pooled([-1.0, 2.0], [5, 5])

    def test_mixed_size_1_and_larger(self):
        """Mix of size-1 and larger subgroups: size-1 contribute 0 df but still work."""
        # n1=1 (df=0), n2=5 (df=4, s=2.0)
        # total_df = 4, sum = 4*4 = 16
        # Sp = sqrt(16/4) = 2.0
        stddevs = [0.0, 2.0]
        sizes = [1, 5]
        result = estimate_sigma_pooled(stddevs, sizes)
        assert abs(result - 2.0) < 1e-10
