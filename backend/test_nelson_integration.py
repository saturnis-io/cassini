"""Integration test for Nelson Rules with existing RollingWindow.

This test verifies that the Nelson Rules work correctly with the existing
RollingWindow implementation from openspc.core.engine.rolling_window.
"""

import sys
sys.path.insert(0, 'src')

from datetime import datetime

from openspc.core.engine import (
    NelsonRuleLibrary,
    RollingWindow,
    WindowSample,
    Zone,
    ZoneBoundaries,
)


def test_rule_1_with_rolling_window():
    """Test Rule 1 with the production RollingWindow implementation."""
    print("\nTest: Rule 1 with RollingWindow")
    print("-" * 50)

    # Create zone boundaries
    boundaries = ZoneBoundaries(
        center_line=100.0,
        plus_1_sigma=110.0,
        plus_2_sigma=120.0,
        plus_3_sigma=130.0,
        minus_1_sigma=90.0,
        minus_2_sigma=80.0,
        minus_3_sigma=70.0,
        sigma=10.0
    )

    # Create rolling window and set boundaries
    window = RollingWindow(max_size=25)
    window.set_boundaries(boundaries)

    # Add a point within limits
    sample1 = WindowSample(
        sample_id=1,
        timestamp=datetime.utcnow(),
        value=115.0,
        range_value=None,
        zone=Zone.ZONE_B_UPPER,
        is_above_center=True,
        sigma_distance=1.5
    )
    window.append(sample1)

    # Check Rule 1
    library = NelsonRuleLibrary()
    result = library.check_single(window, 1)
    print(f"Point at 115.0 (Zone B) -> Triggered: {result is not None}")
    assert result is None, "Should not trigger for point in Zone B"

    # Add a point beyond UCL
    # Let the window classify it
    zone, is_above, sigma_dist = window.classify_value(135.0)
    sample2 = WindowSample(
        sample_id=2,
        timestamp=datetime.utcnow(),
        value=135.0,
        range_value=None,
        zone=zone,
        is_above_center=is_above,
        sigma_distance=sigma_dist
    )
    window.append(sample2)

    result = library.check_single(window, 2)  # Should not trigger Rule 2 (only 2 points)
    print(f"2 points above center -> Rule 2 Triggered: {result is not None}")

    result = library.check_single(window, 1)
    print(f"Point at 135.0 (Beyond UCL) -> Rule 1 Triggered: {result is not None}")
    assert result is not None, "Should trigger for point beyond UCL"
    assert result.rule_id == 1
    assert result.involved_sample_ids == [2]

    print("[PASS] Rule 1 integration test")


def test_rule_2_with_rolling_window():
    """Test Rule 2 (shift) with RollingWindow."""
    print("\nTest: Rule 2 with RollingWindow")
    print("-" * 50)

    boundaries = ZoneBoundaries(
        center_line=100.0,
        plus_1_sigma=110.0,
        plus_2_sigma=120.0,
        plus_3_sigma=130.0,
        minus_1_sigma=90.0,
        minus_2_sigma=80.0,
        minus_3_sigma=70.0,
        sigma=10.0
    )

    window = RollingWindow(max_size=25)
    window.set_boundaries(boundaries)

    # Add 9 points above center line
    for i in range(9):
        zone, is_above, sigma_dist = window.classify_value(105.0)
        sample = WindowSample(
            sample_id=i + 1,
            timestamp=datetime.utcnow(),
            value=105.0,
            range_value=None,
            zone=zone,
            is_above_center=is_above,
            sigma_distance=sigma_dist
        )
        window.append(sample)

    library = NelsonRuleLibrary()
    result = library.check_single(window, 2)
    print(f"9 points above center -> Triggered: {result is not None}")
    assert result is not None, "Should trigger Rule 2"
    assert result.rule_id == 2
    assert len(result.involved_sample_ids) == 9

    print("[PASS] Rule 2 integration test")


def test_all_rules_library():
    """Test NelsonRuleLibrary check_all method."""
    print("\nTest: NelsonRuleLibrary.check_all()")
    print("-" * 50)

    boundaries = ZoneBoundaries(
        center_line=100.0,
        plus_1_sigma=110.0,
        plus_2_sigma=120.0,
        plus_3_sigma=130.0,
        minus_1_sigma=90.0,
        minus_2_sigma=80.0,
        minus_3_sigma=70.0,
        sigma=10.0
    )

    window = RollingWindow(max_size=25)
    window.set_boundaries(boundaries)

    # Add 15 points in Zone C, all above center (should trigger Rule 2 and Rule 7)
    for i in range(15):
        value = 105.0  # All above center
        zone, is_above, sigma_dist = window.classify_value(value)
        sample = WindowSample(
            sample_id=i + 1,
            timestamp=datetime.utcnow(),
            value=value,
            range_value=None,
            zone=zone,
            is_above_center=is_above,
            sigma_distance=sigma_dist
        )
        window.append(sample)

    library = NelsonRuleLibrary()
    violations = library.check_all(window)
    print(f"Found {len(violations)} violations")

    rule_ids = [v.rule_id for v in violations]
    print(f"Violated rules: {rule_ids}")

    assert 2 in rule_ids, "Should trigger Rule 2 (9 on same side)"
    assert 7 in rule_ids, "Should trigger Rule 7 (15 in Zone C)"

    print("[PASS] check_all() integration test")


def test_enabled_rules_filter():
    """Test enabled_rules filter."""
    print("\nTest: enabled_rules filter")
    print("-" * 50)

    boundaries = ZoneBoundaries(
        center_line=100.0,
        plus_1_sigma=110.0,
        plus_2_sigma=120.0,
        plus_3_sigma=130.0,
        minus_1_sigma=90.0,
        minus_2_sigma=80.0,
        minus_3_sigma=70.0,
        sigma=10.0
    )

    window = RollingWindow(max_size=25)
    window.set_boundaries(boundaries)

    # Add point beyond UCL
    zone, is_above, sigma_dist = window.classify_value(135.0)
    sample = WindowSample(
        sample_id=1,
        timestamp=datetime.utcnow(),
        value=135.0,
        range_value=None,
        zone=zone,
        is_above_center=is_above,
        sigma_distance=sigma_dist
    )
    window.append(sample)

    library = NelsonRuleLibrary()

    # Check only Rule 1
    violations = library.check_all(window, enabled_rules={1})
    assert len(violations) == 1
    assert violations[0].rule_id == 1
    print(f"With filter {{1}}: Found Rule {violations[0].rule_id}")

    # Check only Rule 2 (should not trigger)
    violations = library.check_all(window, enabled_rules={2})
    assert len(violations) == 0
    print("With filter {2}: No violations (correct)")

    # Check all rules
    violations = library.check_all(window, enabled_rules=None)
    print(f"With no filter: Found {len(violations)} violation(s)")

    print("[PASS] enabled_rules filter test")


def main():
    """Run all integration tests."""
    print("=" * 70)
    print("  NELSON RULES INTEGRATION TESTS")
    print("  Testing with production RollingWindow implementation")
    print("=" * 70)

    try:
        test_rule_1_with_rolling_window()
        test_rule_2_with_rolling_window()
        test_all_rules_library()
        test_enabled_rules_filter()

        print("\n" + "=" * 70)
        print("  ALL INTEGRATION TESTS PASSED")
        print("=" * 70)
        print("\nKey Features Verified:")
        print("  + Nelson Rules work with production RollingWindow")
        print("  + Zone classification integration correct")
        print("  + WindowSample structure compatible")
        print("  + NelsonRuleLibrary check_all() works")
        print("  + enabled_rules filter works correctly")
        print("\nThe Nelson Rules implementation is ready for production use.")

    except AssertionError as e:
        print(f"\n[FAIL] Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
