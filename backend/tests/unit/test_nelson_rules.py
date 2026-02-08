"""Comprehensive tests for Nelson Rules implementation.

Tests all 8 Nelson Rules with known outcomes, edge cases, and boundary
conditions against the current RollingWindow API.

Zone layout for standard test boundaries (center=100, sigma=10):
  BEYOND_LCL:   value < 70
  ZONE_A_LOWER: 70 <= value < 80
  ZONE_B_LOWER: 80 <= value < 90
  ZONE_C_LOWER: 90 <= value < 100
  ZONE_C_UPPER: 100 <= value < 110
  ZONE_B_UPPER: 110 <= value < 120
  ZONE_A_UPPER: 120 <= value < 130
  BEYOND_UCL:   value >= 130
"""

from datetime import datetime, timedelta

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
from openspc.core.engine.rolling_window import (
    RollingWindow,
    WindowSample,
    Zone,
    ZoneBoundaries,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _boundaries(center: float = 100.0, sigma: float = 10.0) -> ZoneBoundaries:
    """Build standard zone boundaries."""
    return ZoneBoundaries(
        center_line=center,
        sigma=sigma,
        plus_1_sigma=center + sigma,
        plus_2_sigma=center + 2 * sigma,
        plus_3_sigma=center + 3 * sigma,
        minus_1_sigma=center - sigma,
        minus_2_sigma=center - 2 * sigma,
        minus_3_sigma=center - 3 * sigma,
    )


def _make_window(values: list[float], center: float = 100.0, sigma: float = 10.0) -> RollingWindow:
    """Create a RollingWindow pre-populated with classified samples."""
    bounds = _boundaries(center, sigma)
    window = RollingWindow(max_size=max(len(values), 25))
    window.set_boundaries(bounds)
    t = datetime(2025, 1, 1)
    for i, v in enumerate(values):
        zone, is_above, sigma_dist = window.classify_value(v)
        window.append(WindowSample(
            sample_id=i + 1,
            timestamp=t + timedelta(minutes=i),
            value=v,
            range_value=None,
            zone=zone,
            is_above_center=is_above,
            sigma_distance=sigma_dist,
        ))
    return window


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def bounds() -> ZoneBoundaries:
    return _boundaries()


@pytest.fixture
def empty_window(bounds: ZoneBoundaries) -> RollingWindow:
    window = RollingWindow(max_size=50)
    window.set_boundaries(bounds)
    return window


def _add(window: RollingWindow, sid: int, value: float) -> None:
    """Append a classified sample to *window*."""
    zone, is_above, sigma_dist = window.classify_value(value)
    window.append(WindowSample(
        sample_id=sid,
        timestamp=datetime(2025, 1, 1) + timedelta(minutes=sid),
        value=value,
        range_value=None,
        zone=zone,
        is_above_center=is_above,
        sigma_distance=sigma_dist,
    ))


# ===================================================================
# Zone Classification
# ===================================================================

class TestZoneClassification:
    """Verify that classify_value places values in the correct zone."""

    @pytest.mark.parametrize("value, expected_zone", [
        (135.0, Zone.BEYOND_UCL),
        (130.0, Zone.BEYOND_UCL),      # at +3σ boundary → BEYOND_UCL
        (125.0, Zone.ZONE_A_UPPER),
        (120.0, Zone.ZONE_A_UPPER),     # at +2σ boundary
        (115.0, Zone.ZONE_B_UPPER),
        (110.0, Zone.ZONE_B_UPPER),     # at +1σ boundary
        (105.0, Zone.ZONE_C_UPPER),
        (100.0, Zone.ZONE_C_UPPER),     # at center line
        (99.99, Zone.ZONE_C_LOWER),
        (95.0,  Zone.ZONE_C_LOWER),
        (90.0,  Zone.ZONE_C_LOWER),     # at -1σ boundary
        (85.0,  Zone.ZONE_B_LOWER),
        (80.0,  Zone.ZONE_B_LOWER),     # at -2σ boundary
        (75.0,  Zone.ZONE_A_LOWER),
        (70.0,  Zone.ZONE_A_LOWER),     # at -3σ boundary
        (65.0,  Zone.BEYOND_LCL),
    ])
    def test_zone_boundaries(self, empty_window: RollingWindow, value: float, expected_zone: Zone):
        zone, _, _ = empty_window.classify_value(value)
        assert zone == expected_zone, f"value={value} expected {expected_zone}, got {zone}"


# ===================================================================
# Rule 1 — Outlier (1 point beyond 3σ)
# ===================================================================

class TestRule1Outlier:
    def test_trigger_above_ucl(self, empty_window):
        rule = Rule1Outlier()
        _add(empty_window, 1, 135.0)
        result = rule.check(empty_window)
        assert result is not None
        assert result.triggered is True
        assert result.rule_id == 1
        assert result.severity == Severity.CRITICAL
        assert result.involved_sample_ids == [1]

    def test_trigger_below_lcl(self, empty_window):
        rule = Rule1Outlier()
        _add(empty_window, 1, 65.0)
        result = rule.check(empty_window)
        assert result is not None and result.triggered

    def test_no_trigger_in_zone_a(self, empty_window):
        rule = Rule1Outlier()
        _add(empty_window, 1, 125.0)  # Zone A upper, not beyond
        assert rule.check(empty_window) is None

    def test_no_trigger_at_center(self, empty_window):
        rule = Rule1Outlier()
        _add(empty_window, 1, 100.0)
        assert rule.check(empty_window) is None

    def test_empty_window(self, empty_window):
        assert Rule1Outlier().check(empty_window) is None

    def test_only_latest_matters(self, empty_window):
        """Earlier beyond-limit points shouldn't trigger if latest is in control."""
        rule = Rule1Outlier()
        _add(empty_window, 1, 135.0)  # beyond UCL
        _add(empty_window, 2, 100.0)  # back in control
        assert rule.check(empty_window) is None


# ===================================================================
# Rule 2 — Shift (9 consecutive points on same side of center)
# ===================================================================

class TestRule2Shift:
    def test_trigger_9_above(self, empty_window):
        rule = Rule2Shift()
        for i in range(9):
            _add(empty_window, i, 105.0)
        result = rule.check(empty_window)
        assert result is not None and result.triggered
        assert result.rule_id == 2
        assert result.severity == Severity.WARNING
        assert len(result.involved_sample_ids) == 9

    def test_trigger_9_below(self, empty_window):
        rule = Rule2Shift()
        for i in range(9):
            _add(empty_window, i, 95.0)
        result = rule.check(empty_window)
        assert result is not None and result.triggered

    def test_no_trigger_8_above(self, empty_window):
        rule = Rule2Shift()
        for i in range(8):
            _add(empty_window, i, 105.0)
        assert rule.check(empty_window) is None

    def test_crossing_resets_but_new_run_of_9_triggers(self, empty_window):
        """8 above, 1 below, then 9 above → last 9 are all above → triggers."""
        rule = Rule2Shift()
        for i in range(8):
            _add(empty_window, i, 105.0)
        _add(empty_window, 8, 95.0)
        for i in range(9, 18):
            _add(empty_window, i, 105.0)
        result = rule.check(empty_window)
        assert result is not None and result.triggered

    def test_no_trigger_alternating(self, empty_window):
        """Points alternating above/below center should never trigger."""
        rule = Rule2Shift()
        for i in range(20):
            _add(empty_window, i, 105.0 if i % 2 == 0 else 95.0)
        assert rule.check(empty_window) is None

    def test_trigger_mixed_upper_zones(self, empty_window):
        """9 points above center across different upper zones still triggers."""
        rule = Rule2Shift()
        vals = [105, 115, 125, 135, 105, 115, 125, 105, 115]  # all above center
        for i, v in enumerate(vals):
            _add(empty_window, i, float(v))
        result = rule.check(empty_window)
        assert result is not None and result.triggered

    def test_insufficient_samples(self, empty_window):
        for i in range(5):
            _add(empty_window, i, 105.0)
        assert Rule2Shift().check(empty_window) is None


# ===================================================================
# Rule 3 — Trend (6 points monotonically increasing or decreasing)
# ===================================================================

class TestRule3Trend:
    def test_trigger_6_increasing(self, empty_window):
        rule = Rule3Trend()
        for i in range(6):
            _add(empty_window, i, 100.0 + i)
        result = rule.check(empty_window)
        assert result is not None and result.triggered
        assert result.rule_id == 3
        assert len(result.involved_sample_ids) == 6
        assert "increasing" in result.message

    def test_trigger_6_decreasing(self, empty_window):
        rule = Rule3Trend()
        for i in range(6):
            _add(empty_window, i, 110.0 - i)
        result = rule.check(empty_window)
        assert result is not None and result.triggered
        assert "decreasing" in result.message

    def test_no_trigger_5_increasing(self, empty_window):
        rule = Rule3Trend()
        for i in range(5):
            _add(empty_window, i, 100.0 + i)
        assert rule.check(empty_window) is None

    def test_no_trigger_plateau_breaks_trend(self, empty_window):
        """Equal consecutive values are NOT strictly increasing."""
        rule = Rule3Trend()
        vals = [100, 101, 102, 102, 103, 104]
        for i, v in enumerate(vals):
            _add(empty_window, i, float(v))
        assert rule.check(empty_window) is None

    def test_no_trigger_reversal(self, empty_window):
        rule = Rule3Trend()
        vals = [100, 101, 102, 103, 102.5, 104]
        for i, v in enumerate(vals):
            _add(empty_window, i, v)
        assert rule.check(empty_window) is None

    def test_only_last_6_matter(self, empty_window):
        """Older points don't affect the check."""
        rule = Rule3Trend()
        # noise then 6 increasing
        for i in range(5):
            _add(empty_window, i, 100.0)
        for i in range(6):
            _add(empty_window, 10 + i, 100.0 + i)
        assert rule.check(empty_window) is not None


# ===================================================================
# Rule 4 — Alternator (14 consecutive points alternating up/down)
# ===================================================================

class TestRule4Alternator:
    def test_trigger_14_alternating(self, empty_window):
        rule = Rule4Alternator()
        for i in range(14):
            _add(empty_window, i, 100.0 + (5 if i % 2 == 0 else -5))
        result = rule.check(empty_window)
        assert result is not None and result.triggered
        assert result.rule_id == 4
        assert len(result.involved_sample_ids) == 14

    def test_no_trigger_13_alternating(self, empty_window):
        rule = Rule4Alternator()
        for i in range(13):
            _add(empty_window, i, 100.0 + (5 if i % 2 == 0 else -5))
        assert rule.check(empty_window) is None

    def test_no_trigger_two_consecutive_same_direction(self, empty_window):
        rule = Rule4Alternator()
        vals = [100, 105, 95, 105, 95, 105, 110, 115, 105, 110, 95, 105, 95, 105]
        for i, v in enumerate(vals):
            _add(empty_window, i, float(v))
        assert rule.check(empty_window) is None

    def test_no_trigger_equal_values_break_alternation(self, empty_window):
        """Two equal consecutive values produce dir=0, failing dir1*dir2 < 0."""
        rule = Rule4Alternator()
        vals = [100, 105, 95, 105, 95, 105, 105, 95, 105, 95, 105, 95, 105, 95]
        for i, v in enumerate(vals):
            _add(empty_window, i, float(v))
        assert rule.check(empty_window) is None


# ===================================================================
# Rule 5 — Zone A (2 of 3 in Zone A or beyond, same side)
# ===================================================================

class TestRule5ZoneA:
    def test_trigger_2_of_3_upper(self, empty_window):
        rule = Rule5ZoneA()
        _add(empty_window, 1, 125.0)  # A upper
        _add(empty_window, 2, 125.0)  # A upper
        _add(empty_window, 3, 105.0)  # C upper
        result = rule.check(empty_window)
        assert result is not None and result.triggered
        assert result.rule_id == 5
        assert len(result.involved_sample_ids) == 2

    def test_trigger_2_of_3_lower(self, empty_window):
        rule = Rule5ZoneA()
        _add(empty_window, 1, 75.0)   # A lower
        _add(empty_window, 2, 95.0)   # C lower
        _add(empty_window, 3, 75.0)   # A lower
        result = rule.check(empty_window)
        assert result is not None and result.triggered

    def test_trigger_beyond_counts_as_zone_a(self, empty_window):
        """Points beyond UCL count toward Zone A rule."""
        rule = Rule5ZoneA()
        _add(empty_window, 1, 135.0)  # Beyond UCL
        _add(empty_window, 2, 125.0)  # A upper
        _add(empty_window, 3, 105.0)  # C upper
        assert rule.check(empty_window) is not None

    def test_no_trigger_1_of_3(self, empty_window):
        rule = Rule5ZoneA()
        _add(empty_window, 1, 125.0)
        _add(empty_window, 2, 105.0)
        _add(empty_window, 3, 105.0)
        assert rule.check(empty_window) is None

    def test_no_trigger_different_sides(self, empty_window):
        """1 Zone A upper + 1 Zone A lower + 1 Zone C → only 1 per side → no trigger."""
        rule = Rule5ZoneA()
        _add(empty_window, 1, 125.0)  # A upper
        _add(empty_window, 2, 75.0)   # A lower
        _add(empty_window, 3, 105.0)  # C upper
        assert rule.check(empty_window) is None

    def test_trigger_3_of_3(self, empty_window):
        rule = Rule5ZoneA()
        _add(empty_window, 1, 125.0)
        _add(empty_window, 2, 125.0)
        _add(empty_window, 3, 125.0)
        result = rule.check(empty_window)
        assert result is not None and result.triggered


# ===================================================================
# Rule 6 — Zone B (4 of 5 in Zone B or beyond, same side)
# ===================================================================

class TestRule6ZoneB:
    def test_trigger_4_of_5_upper(self, empty_window):
        rule = Rule6ZoneB()
        vals = [115, 115, 115, 105, 115]  # 4 Zone B upper + 1 Zone C
        for i, v in enumerate(vals):
            _add(empty_window, i, float(v))
        result = rule.check(empty_window)
        assert result is not None and result.triggered
        assert result.rule_id == 6
        assert len(result.involved_sample_ids) == 4

    def test_trigger_4_of_5_lower(self, empty_window):
        rule = Rule6ZoneB()
        vals = [85, 85, 95, 85, 85]
        for i, v in enumerate(vals):
            _add(empty_window, i, float(v))
        assert rule.check(empty_window) is not None

    def test_trigger_zone_a_counts(self, empty_window):
        """Zone A and Beyond-UCL are ≥ Zone B, so they count."""
        rule = Rule6ZoneB()
        vals = [115, 125, 135, 115, 105]  # B, A, Beyond, B, C → 4/5 upper
        for i, v in enumerate(vals):
            _add(empty_window, i, float(v))
        assert rule.check(empty_window) is not None

    def test_no_trigger_3_of_5(self, empty_window):
        rule = Rule6ZoneB()
        vals = [115, 115, 105, 115, 105]
        for i, v in enumerate(vals):
            _add(empty_window, i, float(v))
        assert rule.check(empty_window) is None

    def test_no_trigger_different_sides(self, empty_window):
        rule = Rule6ZoneB()
        vals = [115, 115, 85, 85, 115]
        for i, v in enumerate(vals):
            _add(empty_window, i, float(v))
        assert rule.check(empty_window) is None


# ===================================================================
# Rule 7 — Stratification (15 points in Zone C)
# ===================================================================

class TestRule7Stratification:
    def test_trigger_15_in_zone_c(self, empty_window):
        rule = Rule7Stratification()
        for i in range(15):
            _add(empty_window, i, 105.0 if i % 2 == 0 else 95.0)
        result = rule.check(empty_window)
        assert result is not None and result.triggered
        assert result.rule_id == 7
        assert len(result.involved_sample_ids) == 15

    def test_no_trigger_14_in_zone_c(self, empty_window):
        rule = Rule7Stratification()
        for i in range(14):
            _add(empty_window, i, 105.0 if i % 2 == 0 else 95.0)
        assert rule.check(empty_window) is None

    def test_no_trigger_zone_b_breaks(self, empty_window):
        rule = Rule7Stratification()
        for i in range(14):
            _add(empty_window, i, 105.0)
        _add(empty_window, 14, 115.0)  # Zone B breaks it
        assert rule.check(empty_window) is None

    def test_all_at_center_triggers(self, empty_window):
        """100.0 classifies as ZONE_C_UPPER, so 15 of them should trigger."""
        rule = Rule7Stratification()
        for i in range(15):
            _add(empty_window, i, 100.0)
        assert rule.check(empty_window) is not None


# ===================================================================
# Rule 8 — Mixture (8 points with none in Zone C)
# ===================================================================

class TestRule8Mixture:
    def test_trigger_8_outside_zone_c(self, empty_window):
        rule = Rule8Mixture()
        for i in range(8):
            _add(empty_window, i, 115.0 if i % 2 == 0 else 85.0)
        result = rule.check(empty_window)
        assert result is not None and result.triggered
        assert result.rule_id == 8
        assert len(result.involved_sample_ids) == 8

    def test_no_trigger_7_outside(self, empty_window):
        rule = Rule8Mixture()
        for i in range(7):
            _add(empty_window, i, 115.0 if i % 2 == 0 else 85.0)
        assert rule.check(empty_window) is None

    def test_one_zone_c_breaks(self, empty_window):
        rule = Rule8Mixture()
        for i in range(7):
            _add(empty_window, i, 115.0 if i % 2 == 0 else 85.0)
        _add(empty_window, 7, 105.0)  # Zone C breaks it
        assert rule.check(empty_window) is None

    def test_trigger_all_zone_a(self, empty_window):
        rule = Rule8Mixture()
        for i in range(8):
            _add(empty_window, i, 125.0 if i % 2 == 0 else 75.0)
        assert rule.check(empty_window) is not None

    def test_trigger_mixed_b_and_a(self, empty_window):
        rule = Rule8Mixture()
        vals = [125, 85, 115, 75, 125, 85, 115, 75]
        for i, v in enumerate(vals):
            _add(empty_window, i, float(v))
        assert rule.check(empty_window) is not None

    def test_trigger_all_beyond(self, empty_window):
        """All points beyond control limits → no Zone C → triggers."""
        rule = Rule8Mixture()
        for i in range(8):
            _add(empty_window, i, 135.0 if i % 2 == 0 else 65.0)
        assert rule.check(empty_window) is not None


# ===================================================================
# NelsonRuleLibrary
# ===================================================================

class TestNelsonRuleLibrary:
    def test_library_has_all_8_rules(self):
        lib = NelsonRuleLibrary()
        for rid in range(1, 9):
            assert lib.get_rule(rid) is not None

    def test_get_nonexistent_rule(self):
        assert NelsonRuleLibrary().get_rule(99) is None

    def test_check_single(self, empty_window):
        lib = NelsonRuleLibrary()
        _add(empty_window, 1, 135.0)
        result = lib.check_single(empty_window, 1)
        assert result is not None and result.triggered

    def test_check_all_no_violations(self, empty_window):
        lib = NelsonRuleLibrary()
        for i in range(5):
            _add(empty_window, i, 100.0 + (i % 3))  # mild variation near center
        assert len(lib.check_all(empty_window)) == 0

    def test_check_all_with_outlier(self, empty_window):
        lib = NelsonRuleLibrary()
        for i in range(8):
            _add(empty_window, i, 105.0)
        _add(empty_window, 8, 135.0)
        violations = lib.check_all(empty_window)
        rule_ids = {v.rule_id for v in violations}
        assert 1 in rule_ids  # outlier

    def test_enabled_rules_filter(self, empty_window):
        lib = NelsonRuleLibrary()
        _add(empty_window, 1, 135.0)
        assert len(lib.check_all(empty_window, enabled_rules={1})) == 1
        assert len(lib.check_all(empty_window, enabled_rules={2})) == 0

    def test_empty_enabled_rules(self, empty_window):
        lib = NelsonRuleLibrary()
        _add(empty_window, 1, 135.0)
        assert len(lib.check_all(empty_window, enabled_rules=set())) == 0

    def test_rule_severity_values(self):
        lib = NelsonRuleLibrary()
        assert lib.get_rule(1).severity == Severity.CRITICAL
        for rid in range(2, 9):
            assert lib.get_rule(rid).severity == Severity.WARNING

    def test_min_samples_requirements(self):
        lib = NelsonRuleLibrary()
        expected = {1: 1, 2: 9, 3: 6, 4: 14, 5: 3, 6: 5, 7: 15, 8: 8}
        for rid, expected_min in expected.items():
            assert lib.get_rule(rid).min_samples_required == expected_min


# ===================================================================
# Multi-rule interactions & edge cases
# ===================================================================

class TestMultiRuleAndEdgeCases:
    def test_simultaneous_rule2_and_rule7(self, empty_window):
        """15 points in Zone C upper → Rule 2 (9 same side) AND Rule 7 (15 in C)."""
        lib = NelsonRuleLibrary()
        for i in range(15):
            _add(empty_window, i, 105.0)
        rule_ids = {v.rule_id for v in lib.check_all(empty_window)}
        assert 2 in rule_ids
        assert 7 in rule_ids

    def test_insufficient_data_no_false_positives(self, empty_window):
        """With only 2 normal points, no rules should fire."""
        lib = NelsonRuleLibrary()
        _add(empty_window, 1, 100.0)
        _add(empty_window, 2, 100.0)
        assert len(lib.check_all(empty_window)) == 0

    def test_window_get_samples_returns_copy(self, empty_window):
        _add(empty_window, 1, 100.0)
        s1 = empty_window.get_samples()
        s2 = empty_window.get_samples()
        assert s1 == s2
        assert s1 is not s2

    def test_exact_boundary_classification(self, bounds):
        """Values exactly at sigma boundaries classify deterministically."""
        window = RollingWindow(max_size=25)
        window.set_boundaries(bounds)

        cases = [
            (130.0, Zone.BEYOND_UCL),       # exactly +3σ
            (120.0, Zone.ZONE_A_UPPER),      # exactly +2σ
            (110.0, Zone.ZONE_B_UPPER),      # exactly +1σ
            (100.0, Zone.ZONE_C_UPPER),      # exactly center
            (90.0,  Zone.ZONE_C_LOWER),      # exactly -1σ
            (80.0,  Zone.ZONE_B_LOWER),      # exactly -2σ
            (70.0,  Zone.ZONE_A_LOWER),      # exactly -3σ
        ]
        for value, expected in cases:
            zone, _, _ = window.classify_value(value)
            assert zone == expected, f"value={value} expected {expected}, got {zone}"

    def test_rule2_does_not_false_trigger_on_mixed_sides(self):
        """Specifically test that alternating upper/lower never triggers Rule 2."""
        window = _make_window([105, 95] * 10)  # 20 points, alternating
        assert Rule2Shift().check(window) is None

    def test_rule3_large_window_only_last_6(self):
        """Trend rule only looks at last 6, earlier noise is irrelevant."""
        vals = [100.0] * 20 + [90, 91, 92, 93, 94, 95]  # last 6 increasing
        window = _make_window(vals)
        assert Rule3Trend().check(window) is not None

    def test_rule5_with_exactly_2_lower_zone_a(self):
        """Explicit test: 2 of 3 in Zone A lower, non-adjacent."""
        window = _make_window([75.0, 95.0, 75.0])
        result = Rule5ZoneA().check(window)
        assert result is not None and result.triggered
        assert len(result.involved_sample_ids) == 2

    def test_rule6_5_of_5(self):
        """All 5 in Zone B → 5/5 ≥ 4 → triggers."""
        window = _make_window([115.0] * 5)
        assert Rule6ZoneB().check(window) is not None

    def test_rule8_exactly_on_zone_c_boundary(self):
        """110.0 classifies as Zone B upper (≥1σ), not Zone C. 8 such → triggers."""
        window = _make_window([110.0] * 8)
        assert Rule8Mixture().check(window) is not None


# ===================================================================
# _make_window helper self-tests
# ===================================================================

class TestHelpers:
    def test_make_window_populates_correctly(self):
        w = _make_window([100.0, 105.0, 95.0])
        samples = w.get_samples()
        assert len(samples) == 3
        assert samples[0].value == 100.0
        assert samples[1].value == 105.0
        assert samples[2].value == 95.0

    def test_make_window_zones_correct(self):
        w = _make_window([135.0])
        assert w.get_samples()[0].zone == Zone.BEYOND_UCL
