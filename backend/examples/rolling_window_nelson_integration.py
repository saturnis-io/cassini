"""Integration example: Rolling Window + Nelson Rules.

This example demonstrates how the RollingWindow and Nelson Rules work together
for SPC violation detection.
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from openspc.core.engine.rolling_window import (
    RollingWindow,
    WindowSample,
    Zone,
    ZoneBoundaries,
)
from openspc.core.engine.nelson_rules import (
    NelsonRuleLibrary,
    Rule1Outlier,
    Rule2Shift,
    Rule3Trend,
)


def create_sample(sample_id: int, value: float, timestamp: datetime, boundaries: ZoneBoundaries) -> WindowSample:
    """Helper to create a WindowSample with zone classification."""
    window = RollingWindow()
    window.set_boundaries(boundaries)
    zone, is_above, sigma_dist = window.classify_value(value)

    return WindowSample(
        sample_id=sample_id,
        timestamp=timestamp,
        value=value,
        range_value=None,
        zone=zone,
        is_above_center=is_above,
        sigma_distance=sigma_dist
    )


def demo_rule1_outlier():
    """Demonstrate Rule 1: Outlier detection."""
    print("=" * 70)
    print("DEMO: Rule 1 - Outlier Detection")
    print("=" * 70)

    # Setup
    boundaries = ZoneBoundaries(
        center_line=100.0,
        plus_1_sigma=102.0,
        plus_2_sigma=104.0,
        plus_3_sigma=106.0,
        minus_1_sigma=98.0,
        minus_2_sigma=96.0,
        minus_3_sigma=94.0,
        sigma=2.0
    )

    window = RollingWindow(max_size=25)
    window.set_boundaries(boundaries)

    # Add normal samples
    base_time = datetime(2025, 1, 1, 12, 0, 0)
    normal_values = [100.5, 101.2, 99.8, 100.3, 101.1]

    print("\nAdding normal samples (within control limits):")
    for i, value in enumerate(normal_values):
        sample = create_sample(i + 1, value, base_time + timedelta(minutes=i), boundaries)
        window.append(sample)
        print(f"  Sample {i+1}: value={value:6.2f}, zone={sample.zone.value}")

    # Check Rule 1
    rule1 = Rule1Outlier()
    result = rule1.check(window)
    print(f"\nRule 1 check: {'VIOLATED' if result and result.triggered else 'OK'}")

    # Add outlier
    print("\nAdding outlier (beyond UCL):")
    outlier_sample = create_sample(6, 110.0, base_time + timedelta(minutes=5), boundaries)
    window.append(outlier_sample)
    print(f"  Sample 6: value=110.00, zone={outlier_sample.zone.value}")

    # Check Rule 1 again
    result = rule1.check(window)
    if result and result.triggered:
        print(f"\n[VIOLATION DETECTED]")
        print(f"  Rule: {result.rule_name}")
        print(f"  Severity: {result.severity.value}")
        print(f"  Message: {result.message}")
        print(f"  Involved samples: {result.involved_sample_ids}")

    print()


def demo_rule2_shift():
    """Demonstrate Rule 2: Process shift detection."""
    print("=" * 70)
    print("DEMO: Rule 2 - Process Shift Detection")
    print("=" * 70)

    boundaries = ZoneBoundaries(
        center_line=100.0,
        plus_1_sigma=102.0,
        plus_2_sigma=104.0,
        plus_3_sigma=106.0,
        minus_1_sigma=98.0,
        minus_2_sigma=96.0,
        minus_3_sigma=94.0,
        sigma=2.0
    )

    window = RollingWindow(max_size=25)
    window.set_boundaries(boundaries)

    # Add samples showing a shift
    base_time = datetime(2025, 1, 1, 12, 0, 0)

    print("\nAdding 9 consecutive samples above center line:")
    shifted_values = [100.5, 101.2, 100.8, 101.5, 100.9, 101.3, 100.7, 101.4, 101.0]

    for i, value in enumerate(shifted_values):
        sample = create_sample(i + 1, value, base_time + timedelta(minutes=i), boundaries)
        window.append(sample)
        print(f"  Sample {i+1}: value={value:6.2f}, zone={sample.zone.value}, above_center={sample.is_above_center}")

    # Check Rule 2
    rule2 = Rule2Shift()
    result = rule2.check(window)

    if result and result.triggered:
        print(f"\n[VIOLATION DETECTED]")
        print(f"  Rule: {result.rule_name}")
        print(f"  Severity: {result.severity.value}")
        print(f"  Message: {result.message}")
        print(f"  Involved samples: {result.involved_sample_ids}")
    else:
        print(f"\nRule 2 check: OK")

    print()


def demo_rule3_trend():
    """Demonstrate Rule 3: Trend detection."""
    print("=" * 70)
    print("DEMO: Rule 3 - Trend Detection")
    print("=" * 70)

    boundaries = ZoneBoundaries(
        center_line=100.0,
        plus_1_sigma=102.0,
        plus_2_sigma=104.0,
        plus_3_sigma=106.0,
        minus_1_sigma=98.0,
        minus_2_sigma=96.0,
        minus_3_sigma=94.0,
        sigma=2.0
    )

    window = RollingWindow(max_size=25)
    window.set_boundaries(boundaries)

    # Add samples showing an upward trend
    base_time = datetime(2025, 1, 1, 12, 0, 0)

    print("\nAdding 6 consecutive samples showing upward trend:")
    trending_values = [98.0, 98.5, 99.0, 99.5, 100.0, 100.5]

    for i, value in enumerate(trending_values):
        sample = create_sample(i + 1, value, base_time + timedelta(minutes=i), boundaries)
        window.append(sample)
        print(f"  Sample {i+1}: value={value:6.2f}, zone={sample.zone.value}")

    # Check Rule 3
    rule3 = Rule3Trend()
    result = rule3.check(window)

    if result and result.triggered:
        print(f"\n[VIOLATION DETECTED]")
        print(f"  Rule: {result.rule_name}")
        print(f"  Severity: {result.severity.value}")
        print(f"  Message: {result.message}")
        print(f"  Involved samples: {result.involved_sample_ids}")
    else:
        print(f"\nRule 3 check: OK")

    print()


def demo_rule_library():
    """Demonstrate using the NelsonRuleLibrary."""
    print("=" * 70)
    print("DEMO: Nelson Rule Library - Check All Rules")
    print("=" * 70)

    boundaries = ZoneBoundaries(
        center_line=100.0,
        plus_1_sigma=102.0,
        plus_2_sigma=104.0,
        plus_3_sigma=106.0,
        minus_1_sigma=98.0,
        minus_2_sigma=96.0,
        minus_3_sigma=94.0,
        sigma=2.0
    )

    window = RollingWindow(max_size=25)
    window.set_boundaries(boundaries)

    # Add samples with an outlier
    base_time = datetime(2025, 1, 1, 12, 0, 0)
    values = [100.5, 101.2, 99.8, 100.3, 108.0]  # Last value is an outlier

    print("\nAdding samples (last one is outlier):")
    for i, value in enumerate(values):
        sample = create_sample(i + 1, value, base_time + timedelta(minutes=i), boundaries)
        window.append(sample)
        print(f"  Sample {i+1}: value={value:6.2f}, zone={sample.zone.value}")

    # Check all rules
    library = NelsonRuleLibrary()
    violations = library.check_all(window)

    print(f"\nChecking all Nelson Rules...")
    print(f"Violations detected: {len(violations)}")

    if violations:
        print("\n[VIOLATIONS DETECTED]")
        for violation in violations:
            print(f"\n  Rule {violation.rule_id}: {violation.rule_name}")
            print(f"    Severity: {violation.severity.value}")
            print(f"    Message: {violation.message}")
            print(f"    Samples: {violation.involved_sample_ids}")
    else:
        print("\nAll rules passed - process is in control")

    print()


def main():
    """Run all integration demos."""
    print("\n")
    print("*" * 70)
    print("ROLLING WINDOW + NELSON RULES INTEGRATION")
    print("*" * 70)
    print()

    demo_rule1_outlier()
    demo_rule2_shift()
    demo_rule3_trend()
    demo_rule_library()

    print("=" * 70)
    print("ALL INTEGRATION DEMOS COMPLETED")
    print("=" * 70)
    print()


if __name__ == "__main__":
    main()
