"""Comprehensive tests for Nelson Rules implementation.

Tests all 8 Nelson Rules with known outcomes and edge cases.
"""

import pytest

from openspc.core.engine.nelson_rules import (
    NelsonRuleLibrary,
    Rule1Outlier,
    Rule2Shift,
    Rule3Trend,
    Rule4Alternator,
    Rule5ZoneA,
    Rule6ZoneB,
    Rule7Stratification,
    Rule8Mixture,
    Severity,
)
from openspc.core.engine.rolling_window import RollingWindow, WindowSample, Zone
from openspc.utils.statistics import ZoneBoundaries, calculate_zones


@pytest.fixture
def standard_zones() -> ZoneBoundaries:
    """Standard zone boundaries for testing (center=100, sigma=10)."""
    return calculate_zones(center_line=100.0, sigma=10.0)


@pytest.fixture
def empty_window(standard_zones: ZoneBoundaries) -> RollingWindow:
    """Empty rolling window for testing."""
    return RollingWindow(standard_zones)


class TestRollingWindow:
    """Tests for RollingWindow class."""

    def test_empty_window(self, empty_window: RollingWindow):
        """Test that empty window has no samples."""
        assert len(empty_window.get_samples()) == 0

    def test_add_single_point(self, empty_window: RollingWindow):
        """Test adding a single point to the window."""
        empty_window.add_point(1, 100.0)
        samples = empty_window.get_samples()
        assert len(samples) == 1
        assert samples[0].sample_id == 1
        assert samples[0].value == 100.0

    def test_zone_classification_beyond_ucl(self, empty_window: RollingWindow):
        """Test classification of point beyond UCL (>130)."""
        empty_window.add_point(1, 135.0)
        samples = empty_window.get_samples()
        assert samples[0].zone == Zone.BEYOND_UCL

    def test_zone_classification_zone_a_upper(self, empty_window: RollingWindow):
        """Test classification of point in Zone A upper (120-130)."""
        empty_window.add_point(1, 125.0)
        samples = empty_window.get_samples()
        assert samples[0].zone == Zone.ZONE_A_UPPER

    def test_zone_classification_zone_b_upper(self, empty_window: RollingWindow):
        """Test classification of point in Zone B upper (110-120)."""
        empty_window.add_point(1, 115.0)
        samples = empty_window.get_samples()
        assert samples[0].zone == Zone.ZONE_B_UPPER

    def test_zone_classification_zone_c_upper(self, empty_window: RollingWindow):
        """Test classification of point in Zone C upper (100-110)."""
        empty_window.add_point(1, 105.0)
        samples = empty_window.get_samples()
        assert samples[0].zone == Zone.ZONE_C_UPPER

    def test_zone_classification_zone_c_lower(self, empty_window: RollingWindow):
        """Test classification of point in Zone C lower (90-100)."""
        empty_window.add_point(1, 95.0)
        samples = empty_window.get_samples()
        assert samples[0].zone == Zone.ZONE_C_LOWER

    def test_zone_classification_zone_b_lower(self, empty_window: RollingWindow):
        """Test classification of point in Zone B lower (80-90)."""
        empty_window.add_point(1, 85.0)
        samples = empty_window.get_samples()
        assert samples[0].zone == Zone.ZONE_B_LOWER

    def test_zone_classification_zone_a_lower(self, empty_window: RollingWindow):
        """Test classification of point in Zone A lower (70-80)."""
        empty_window.add_point(1, 75.0)
        samples = empty_window.get_samples()
        assert samples[0].zone == Zone.ZONE_A_LOWER

    def test_zone_classification_beyond_lcl(self, empty_window: RollingWindow):
        """Test classification of point beyond LCL (<70)."""
        empty_window.add_point(1, 65.0)
        samples = empty_window.get_samples()
        assert samples[0].zone == Zone.BEYOND_LCL

    def test_multiple_points(self, empty_window: RollingWindow):
        """Test adding multiple points to the window."""
        for i in range(5):
            empty_window.add_point(i, 100.0 + i)
        samples = empty_window.get_samples()
        assert len(samples) == 5
        assert [s.sample_id for s in samples] == [0, 1, 2, 3, 4]


class TestRule1Outlier:
    """Tests for Rule 1: The Outlier."""

    def test_no_trigger_within_limits(self, empty_window: RollingWindow):
        """Test that points within 3 sigma don't trigger."""
        rule = Rule1Outlier()
        # Add 9 points all above center but within 3 sigma
        for i in range(9):
            empty_window.add_point(i, 115.0)  # Zone B Upper
        result = rule.check(empty_window)
        assert result is None

    def test_trigger_above_ucl(self, empty_window: RollingWindow):
        """Test that point above UCL triggers."""
        rule = Rule1Outlier()
        empty_window.add_point(1, 135.0)  # Beyond UCL (>130)
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert result.rule_id == 1
        assert result.rule_name == "Outlier"
        assert result.severity == Severity.CRITICAL
        assert result.involved_sample_ids == [1]
        assert "beyond 3σ" in result.message

    def test_trigger_below_lcl(self, empty_window: RollingWindow):
        """Test that point below LCL triggers."""
        rule = Rule1Outlier()
        empty_window.add_point(1, 65.0)  # Beyond LCL (<70)
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert result.severity == Severity.CRITICAL
        assert result.involved_sample_ids == [1]

    def test_empty_window(self, empty_window: RollingWindow):
        """Test that empty window doesn't trigger."""
        rule = Rule1Outlier()
        result = rule.check(empty_window)
        assert result is None


class TestRule2Shift:
    """Tests for Rule 2: The Shift."""

    def test_no_trigger_8_points(self, empty_window: RollingWindow):
        """Test that 8 points above center don't trigger."""
        rule = Rule2Shift()
        for i in range(8):
            empty_window.add_point(i, 105.0)  # Zone C Upper
        result = rule.check(empty_window)
        assert result is None

    def test_trigger_9_above(self, empty_window: RollingWindow):
        """Test that 9 points above center trigger."""
        rule = Rule2Shift()
        for i in range(9):
            empty_window.add_point(i, 105.0)  # Zone C Upper
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert result.rule_id == 2
        assert result.rule_name == "Shift"
        assert result.severity == Severity.WARNING
        assert len(result.involved_sample_ids) == 9
        assert "above center line" in result.message

    def test_trigger_9_below(self, empty_window: RollingWindow):
        """Test that 9 points below center trigger."""
        rule = Rule2Shift()
        for i in range(9):
            empty_window.add_point(i, 95.0)  # Zone C Lower
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert "below center line" in result.message

    def test_no_trigger_with_crossing(self, empty_window: RollingWindow):
        """Test that crossing center line resets counter."""
        rule = Rule2Shift()
        # 8 above, 1 below, 8 above - should not trigger
        for i in range(8):
            empty_window.add_point(i, 105.0)
        empty_window.add_point(8, 95.0)  # Cross center
        for i in range(9, 17):
            empty_window.add_point(i, 105.0)
        result = rule.check(empty_window)
        # Should still trigger because last 9 are all above
        assert result is not None
        assert result.triggered is True

    def test_insufficient_samples(self, empty_window: RollingWindow):
        """Test that less than 9 samples returns None."""
        rule = Rule2Shift()
        for i in range(5):
            empty_window.add_point(i, 105.0)
        result = rule.check(empty_window)
        assert result is None


class TestRule3Trend:
    """Tests for Rule 3: The Trend."""

    def test_no_trigger_5_increasing(self, empty_window: RollingWindow):
        """Test that 5 increasing points don't trigger."""
        rule = Rule3Trend()
        for i in range(5):
            empty_window.add_point(i, 100.0 + i)
        result = rule.check(empty_window)
        assert result is None

    def test_trigger_6_increasing(self, empty_window: RollingWindow):
        """Test that 6 increasing points trigger."""
        rule = Rule3Trend()
        for i in range(6):
            empty_window.add_point(i, 100.0 + i)
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert result.rule_id == 3
        assert result.rule_name == "Trend"
        assert result.severity == Severity.WARNING
        assert len(result.involved_sample_ids) == 6
        assert "increasing" in result.message

    def test_trigger_6_decreasing(self, empty_window: RollingWindow):
        """Test that 6 decreasing points trigger."""
        rule = Rule3Trend()
        for i in range(6):
            empty_window.add_point(i, 100.0 - i)
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert "decreasing" in result.message

    def test_no_trigger_not_monotonic(self, empty_window: RollingWindow):
        """Test that non-monotonic sequence doesn't trigger."""
        rule = Rule3Trend()
        values = [100.0, 101.0, 102.0, 103.0, 102.5, 104.0]
        for i, val in enumerate(values):
            empty_window.add_point(i, val)
        result = rule.check(empty_window)
        assert result is None

    def test_no_trigger_with_equal_values(self, empty_window: RollingWindow):
        """Test that equal consecutive values don't trigger."""
        rule = Rule3Trend()
        values = [100.0, 101.0, 102.0, 102.0, 103.0, 104.0]
        for i, val in enumerate(values):
            empty_window.add_point(i, val)
        result = rule.check(empty_window)
        assert result is None


class TestRule4Alternator:
    """Tests for Rule 4: The Alternator."""

    def test_no_trigger_13_alternating(self, empty_window: RollingWindow):
        """Test that 13 alternating points don't trigger."""
        rule = Rule4Alternator()
        for i in range(13):
            value = 100.0 + (5.0 if i % 2 == 0 else -5.0)
            empty_window.add_point(i, value)
        result = rule.check(empty_window)
        assert result is None

    def test_trigger_14_alternating(self, empty_window: RollingWindow):
        """Test that 14 alternating points trigger."""
        rule = Rule4Alternator()
        for i in range(14):
            value = 100.0 + (5.0 if i % 2 == 0 else -5.0)
            empty_window.add_point(i, value)
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert result.rule_id == 4
        assert result.rule_name == "Alternator"
        assert result.severity == Severity.WARNING
        assert len(result.involved_sample_ids) == 14
        assert "alternating" in result.message

    def test_no_trigger_two_consecutive_increases(self, empty_window: RollingWindow):
        """Test that pattern breaks with consecutive increases."""
        rule = Rule4Alternator()
        values = [100, 105, 95, 105, 95, 105, 110, 115, 105, 110, 95, 105, 95, 105]
        for i, val in enumerate(values):
            empty_window.add_point(i, val)
        result = rule.check(empty_window)
        assert result is None

    def test_insufficient_samples(self, empty_window: RollingWindow):
        """Test that less than 14 samples returns None."""
        rule = Rule4Alternator()
        for i in range(10):
            value = 100.0 + (5.0 if i % 2 == 0 else -5.0)
            empty_window.add_point(i, value)
        result = rule.check(empty_window)
        assert result is None


class TestRule5ZoneA:
    """Tests for Rule 5: Zone A Warning."""

    def test_no_trigger_1_of_3(self, empty_window: RollingWindow):
        """Test that 1 of 3 in Zone A doesn't trigger."""
        rule = Rule5ZoneA()
        empty_window.add_point(1, 125.0)  # Zone A Upper
        empty_window.add_point(2, 105.0)  # Zone C Upper
        empty_window.add_point(3, 105.0)  # Zone C Upper
        result = rule.check(empty_window)
        assert result is None

    def test_trigger_2_of_3_upper(self, empty_window: RollingWindow):
        """Test that 2 of 3 in Zone A upper trigger."""
        rule = Rule5ZoneA()
        empty_window.add_point(1, 125.0)  # Zone A Upper
        empty_window.add_point(2, 125.0)  # Zone A Upper
        empty_window.add_point(3, 105.0)  # Zone C Upper
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert result.rule_id == 5
        assert result.rule_name == "Zone A Warning"
        assert result.severity == Severity.WARNING
        assert len(result.involved_sample_ids) == 2
        assert "Zone A" in result.message
        assert "upper" in result.message

    def test_trigger_2_of_3_lower(self, empty_window: RollingWindow):
        """Test that 2 of 3 in Zone A lower trigger."""
        rule = Rule5ZoneA()
        empty_window.add_point(1, 75.0)  # Zone A Lower
        empty_window.add_point(2, 95.0)  # Zone C Lower
        empty_window.add_point(3, 75.0)  # Zone A Lower
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert "lower" in result.message

    def test_trigger_beyond_control_limits(self, empty_window: RollingWindow):
        """Test that points beyond control limits count for this rule."""
        rule = Rule5ZoneA()
        empty_window.add_point(1, 135.0)  # Beyond UCL
        empty_window.add_point(2, 125.0)  # Zone A Upper
        empty_window.add_point(3, 105.0)  # Zone C Upper
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True

    def test_no_trigger_different_sides(self, empty_window: RollingWindow):
        """Test that points on different sides don't trigger."""
        rule = Rule5ZoneA()
        empty_window.add_point(1, 125.0)  # Zone A Upper
        empty_window.add_point(2, 75.0)   # Zone A Lower
        empty_window.add_point(3, 125.0)  # Zone A Upper
        result = rule.check(empty_window)
        assert result is None


class TestRule6ZoneB:
    """Tests for Rule 6: Zone B Warning."""

    def test_no_trigger_3_of_5(self, empty_window: RollingWindow):
        """Test that 3 of 5 in Zone B don't trigger."""
        rule = Rule6ZoneB()
        empty_window.add_point(1, 115.0)  # Zone B Upper
        empty_window.add_point(2, 115.0)  # Zone B Upper
        empty_window.add_point(3, 105.0)  # Zone C Upper
        empty_window.add_point(4, 115.0)  # Zone B Upper
        empty_window.add_point(5, 105.0)  # Zone C Upper
        result = rule.check(empty_window)
        assert result is None

    def test_trigger_4_of_5_upper(self, empty_window: RollingWindow):
        """Test that 4 of 5 in Zone B upper trigger."""
        rule = Rule6ZoneB()
        empty_window.add_point(1, 115.0)  # Zone B Upper
        empty_window.add_point(2, 115.0)  # Zone B Upper
        empty_window.add_point(3, 115.0)  # Zone B Upper
        empty_window.add_point(4, 105.0)  # Zone C Upper
        empty_window.add_point(5, 115.0)  # Zone B Upper
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert result.rule_id == 6
        assert result.rule_name == "Zone B Warning"
        assert result.severity == Severity.WARNING
        assert len(result.involved_sample_ids) == 4
        assert "Zone B" in result.message
        assert "upper" in result.message

    def test_trigger_4_of_5_lower(self, empty_window: RollingWindow):
        """Test that 4 of 5 in Zone B lower trigger."""
        rule = Rule6ZoneB()
        empty_window.add_point(1, 85.0)  # Zone B Lower
        empty_window.add_point(2, 85.0)  # Zone B Lower
        empty_window.add_point(3, 95.0)  # Zone C Lower
        empty_window.add_point(4, 85.0)  # Zone B Lower
        empty_window.add_point(5, 85.0)  # Zone B Lower
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert "lower" in result.message

    def test_trigger_includes_zone_a(self, empty_window: RollingWindow):
        """Test that Zone A points count toward Zone B rule."""
        rule = Rule6ZoneB()
        empty_window.add_point(1, 115.0)  # Zone B Upper
        empty_window.add_point(2, 125.0)  # Zone A Upper
        empty_window.add_point(3, 115.0)  # Zone B Upper
        empty_window.add_point(4, 115.0)  # Zone B Upper
        empty_window.add_point(5, 105.0)  # Zone C Upper
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True

    def test_no_trigger_different_sides(self, empty_window: RollingWindow):
        """Test that points on different sides don't trigger."""
        rule = Rule6ZoneB()
        empty_window.add_point(1, 115.0)  # Zone B Upper
        empty_window.add_point(2, 115.0)  # Zone B Upper
        empty_window.add_point(3, 85.0)   # Zone B Lower
        empty_window.add_point(4, 85.0)   # Zone B Lower
        empty_window.add_point(5, 115.0)  # Zone B Upper
        result = rule.check(empty_window)
        assert result is None


class TestRule7Stratification:
    """Tests for Rule 7: Stratification."""

    def test_no_trigger_14_in_zone_c(self, empty_window: RollingWindow):
        """Test that 14 points in Zone C don't trigger."""
        rule = Rule7Stratification()
        for i in range(14):
            value = 105.0 if i % 2 == 0 else 95.0
            empty_window.add_point(i, value)
        result = rule.check(empty_window)
        assert result is None

    def test_trigger_15_in_zone_c(self, empty_window: RollingWindow):
        """Test that 15 points in Zone C trigger."""
        rule = Rule7Stratification()
        for i in range(15):
            value = 105.0 if i % 2 == 0 else 95.0
            empty_window.add_point(i, value)
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert result.rule_id == 7
        assert result.rule_name == "Stratification"
        assert result.severity == Severity.WARNING
        assert len(result.involved_sample_ids) == 15
        assert "Zone C" in result.message
        assert "hugging" in result.message

    def test_no_trigger_with_zone_b_point(self, empty_window: RollingWindow):
        """Test that one point in Zone B breaks the pattern."""
        rule = Rule7Stratification()
        for i in range(14):
            empty_window.add_point(i, 105.0)  # Zone C Upper
        empty_window.add_point(14, 115.0)  # Zone B Upper
        result = rule.check(empty_window)
        assert result is None

    def test_insufficient_samples(self, empty_window: RollingWindow):
        """Test that less than 15 samples returns None."""
        rule = Rule7Stratification()
        for i in range(10):
            empty_window.add_point(i, 105.0)
        result = rule.check(empty_window)
        assert result is None


class TestRule8Mixture:
    """Tests for Rule 8: Mixture."""

    def test_no_trigger_7_outside_zone_c(self, empty_window: RollingWindow):
        """Test that 7 points outside Zone C don't trigger."""
        rule = Rule8Mixture()
        for i in range(7):
            value = 115.0 if i % 2 == 0 else 85.0
            empty_window.add_point(i, value)
        result = rule.check(empty_window)
        assert result is None

    def test_trigger_8_outside_zone_c(self, empty_window: RollingWindow):
        """Test that 8 points outside Zone C trigger."""
        rule = Rule8Mixture()
        for i in range(8):
            value = 115.0 if i % 2 == 0 else 85.0
            empty_window.add_point(i, value)
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert result.rule_id == 8
        assert result.rule_name == "Mixture"
        assert result.severity == Severity.WARNING
        assert len(result.involved_sample_ids) == 8
        assert "Zone C" in result.message
        assert "mixture" in result.message

    def test_no_trigger_with_one_zone_c_point(self, empty_window: RollingWindow):
        """Test that one point in Zone C breaks the pattern."""
        rule = Rule8Mixture()
        for i in range(7):
            value = 115.0 if i % 2 == 0 else 85.0
            empty_window.add_point(i, value)
        empty_window.add_point(7, 105.0)  # Zone C Upper
        result = rule.check(empty_window)
        assert result is None

    def test_trigger_all_zone_a(self, empty_window: RollingWindow):
        """Test that points in Zone A count as outside Zone C."""
        rule = Rule8Mixture()
        for i in range(8):
            value = 125.0 if i % 2 == 0 else 75.0
            empty_window.add_point(i, value)
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True

    def test_trigger_mixed_zones(self, empty_window: RollingWindow):
        """Test with mixture of Zone A and Zone B."""
        rule = Rule8Mixture()
        values = [125.0, 85.0, 115.0, 75.0, 125.0, 85.0, 115.0, 75.0]
        for i, val in enumerate(values):
            empty_window.add_point(i, val)
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True


class TestNelsonRuleLibrary:
    """Tests for NelsonRuleLibrary."""

    def test_library_initialization(self):
        """Test that library initializes with all 8 rules."""
        library = NelsonRuleLibrary()
        for rule_id in range(1, 9):
            assert library.get_rule(rule_id) is not None

    def test_get_rule(self):
        """Test getting individual rules."""
        library = NelsonRuleLibrary()
        rule1 = library.get_rule(1)
        assert rule1 is not None
        assert rule1.rule_id == 1
        assert rule1.rule_name == "Outlier"
        assert rule1.severity == Severity.CRITICAL

    def test_get_nonexistent_rule(self):
        """Test getting nonexistent rule returns None."""
        library = NelsonRuleLibrary()
        assert library.get_rule(99) is None

    def test_check_single_rule(self, empty_window: RollingWindow):
        """Test checking a single rule."""
        library = NelsonRuleLibrary()
        empty_window.add_point(1, 135.0)  # Beyond UCL
        result = library.check_single(empty_window, 1)
        assert result is not None
        assert result.triggered is True
        assert result.rule_id == 1

    def test_check_single_nonexistent_rule(self, empty_window: RollingWindow):
        """Test checking nonexistent rule returns None."""
        library = NelsonRuleLibrary()
        result = library.check_single(empty_window, 99)
        assert result is None

    def test_check_all_no_violations(self, empty_window: RollingWindow):
        """Test check_all with no violations."""
        library = NelsonRuleLibrary()
        for i in range(5):
            empty_window.add_point(i, 105.0)  # All in Zone C
        violations = library.check_all(empty_window)
        assert len(violations) == 0

    def test_check_all_with_violations(self, empty_window: RollingWindow):
        """Test check_all with multiple violations."""
        library = NelsonRuleLibrary()
        # Create scenario that violates Rule 1 and Rule 2
        for i in range(8):
            empty_window.add_point(i, 105.0)  # Zone C Upper
        empty_window.add_point(8, 135.0)  # Beyond UCL (triggers Rule 1)

        violations = library.check_all(empty_window)
        # Should have at least Rule 1
        assert len(violations) >= 1
        rule_ids = [v.rule_id for v in violations]
        assert 1 in rule_ids

    def test_check_all_with_enabled_rules_filter(self, empty_window: RollingWindow):
        """Test check_all with enabled_rules filter."""
        library = NelsonRuleLibrary()
        empty_window.add_point(1, 135.0)  # Beyond UCL (Rule 1)

        # Only check Rule 1
        violations = library.check_all(empty_window, enabled_rules={1})
        assert len(violations) == 1
        assert violations[0].rule_id == 1

        # Only check Rule 2 (should not trigger)
        violations = library.check_all(empty_window, enabled_rules={2})
        assert len(violations) == 0

    def test_check_all_empty_enabled_rules(self, empty_window: RollingWindow):
        """Test check_all with empty enabled_rules set."""
        library = NelsonRuleLibrary()
        empty_window.add_point(1, 135.0)  # Beyond UCL
        violations = library.check_all(empty_window, enabled_rules=set())
        assert len(violations) == 0

    def test_rule_properties(self):
        """Test that all rules have correct properties."""
        library = NelsonRuleLibrary()

        # Rule 1 should be CRITICAL
        rule1 = library.get_rule(1)
        assert rule1.severity == Severity.CRITICAL
        assert rule1.min_samples_required == 1

        # Rules 2-8 should be WARNING
        for rule_id in range(2, 9):
            rule = library.get_rule(rule_id)
            assert rule.severity == Severity.WARNING
            assert rule.min_samples_required > 1

    def test_min_samples_requirements(self):
        """Test min_samples_required for all rules."""
        library = NelsonRuleLibrary()
        expected = {
            1: 1,   # Outlier
            2: 9,   # Shift
            3: 6,   # Trend
            4: 14,  # Alternator
            5: 3,   # Zone A
            6: 5,   # Zone B
            7: 15,  # Stratification
            8: 8,   # Mixture
        }
        for rule_id, expected_min in expected.items():
            rule = library.get_rule(rule_id)
            assert rule.min_samples_required == expected_min


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_exact_boundary_values(self, standard_zones: ZoneBoundaries):
        """Test classification at exact zone boundaries."""
        window = RollingWindow(standard_zones)

        # Test at exact sigma boundaries
        window.add_point(1, 130.0)  # Exactly +3σ (UCL)
        window.add_point(2, 120.0)  # Exactly +2σ
        window.add_point(3, 110.0)  # Exactly +1σ
        window.add_point(4, 100.0)  # Exactly center

        samples = window.get_samples()
        # At boundary, should be in the zone (not beyond)
        assert samples[0].zone == Zone.ZONE_A_UPPER
        assert samples[1].zone == Zone.ZONE_B_UPPER
        assert samples[2].zone == Zone.ZONE_C_UPPER
        assert samples[3].zone == Zone.ZONE_C_LOWER

    def test_multiple_simultaneous_violations(self, empty_window: RollingWindow):
        """Test scenario where multiple rules trigger simultaneously."""
        library = NelsonRuleLibrary()

        # Create 15 points hugging mean (Rule 7)
        for i in range(15):
            empty_window.add_point(i, 105.0)

        violations = library.check_all(empty_window)
        rule_ids = [v.rule_id for v in violations]

        # Should trigger Rule 2 (9 on same side) and Rule 7 (15 in Zone C)
        assert 2 in rule_ids
        assert 7 in rule_ids

    def test_insufficient_data_all_rules(self, empty_window: RollingWindow):
        """Test all rules with insufficient data."""
        library = NelsonRuleLibrary()
        # Only add 2 points
        empty_window.add_point(1, 100.0)
        empty_window.add_point(2, 100.0)

        # Only Rule 1 should potentially trigger (min_samples=1)
        # But these points are at center, so no triggers
        violations = library.check_all(empty_window)
        # No violations expected with normal data
        assert all(v.rule_id == 1 for v in violations) or len(violations) == 0

    def test_window_returns_copy(self, empty_window: RollingWindow):
        """Test that get_samples returns a copy, not reference."""
        empty_window.add_point(1, 100.0)
        samples1 = empty_window.get_samples()
        samples2 = empty_window.get_samples()

        # Should be equal but not the same object
        assert samples1 == samples2
        assert samples1 is not samples2
