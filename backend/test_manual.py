"""Manual test script for rolling window functionality."""

import sys
import os
from pathlib import Path

# Force UTF-8 encoding for Windows console
if sys.platform == "win32":
    os.system("chcp 65001 > nul")
    sys.stdout.reconfigure(encoding='utf-8')

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from datetime import datetime, timedelta
from openspc.core.engine.rolling_window import (
    RollingWindow,
    WindowSample,
    Zone,
    ZoneBoundaries,
)


def test_rolling_window_basic():
    """Test basic rolling window functionality."""
    print("Testing RollingWindow basic functionality...")

    # Create window
    window = RollingWindow(max_size=5)
    assert window.size == 0, "Initial size should be 0"
    assert window.max_size == 5, "Max size should be 5"
    print("[PASS] Window initialized correctly")

    # Create boundaries
    boundaries = ZoneBoundaries(
        center_line=100.0,
        sigma=2.0,
        plus_1_sigma=102.0,
        plus_2_sigma=104.0,
        plus_3_sigma=106.0,
        minus_1_sigma=98.0,
        minus_2_sigma=96.0,
        minus_3_sigma=94.0
    )
    window.set_boundaries(boundaries)
    assert window.is_ready, "Window should be ready after setting boundaries"
    print("[PASS] Boundaries set correctly")

    # Test classification
    zone, is_above, sigma_dist = window.classify_value(103.0)
    assert zone == Zone.ZONE_B_UPPER, f"Expected ZONE_B_UPPER, got {zone}"
    assert is_above is True, "Value should be above center"
    assert abs(sigma_dist - 1.5) < 0.001, f"Expected sigma_dist 1.5, got {sigma_dist}"
    print("[PASS] Zone classification works correctly")

    # Add samples
    base_time = datetime(2025, 1, 1, 12, 0, 0)
    for i in range(7):
        sample = WindowSample(
            sample_id=i,
            timestamp=base_time + timedelta(minutes=i),
            value=100.0 + i,
            range_value=None,
            zone=Zone.ZONE_C_UPPER,
            is_above_center=True,
            sigma_distance=0.0
        )
        evicted = window.append(sample)

        if i < 5:
            assert evicted is None, f"Sample {i}: Should not evict when not full"
        else:
            assert evicted is not None, f"Sample {i}: Should evict when full"
            assert evicted.sample_id == i - 5, f"Should evict oldest sample"

    assert window.size == 5, "Window size should be at max"
    print("[PASS] FIFO eviction works correctly")

    # Test get_samples (chronological order)
    samples = window.get_samples()
    assert len(samples) == 5, "Should have 5 samples"
    assert samples[0].sample_id == 2, "Oldest should be sample 2"
    assert samples[-1].sample_id == 6, "Newest should be sample 6"
    print("[PASS] get_samples returns chronological order")

    # Test get_recent (reverse chronological)
    recent = window.get_recent(3)
    assert len(recent) == 3, "Should get 3 recent samples"
    assert recent[0].sample_id == 6, "Most recent should be first"
    assert recent[2].sample_id == 4, "Third most recent should be last"
    print("[PASS] get_recent returns reverse chronological order")

    # Test clear
    window.clear()
    assert window.size == 0, "Window should be empty after clear"
    print("[PASS] clear() works correctly")

    print("\n[PASS][PASS][PASS] All basic tests passed! [PASS][PASS][PASS]\n")


def test_zone_classification():
    """Test all zone classifications."""
    print("Testing zone classification...")

    window = RollingWindow()
    boundaries = ZoneBoundaries(
        center_line=100.0,
        sigma=2.0,
        plus_1_sigma=102.0,
        plus_2_sigma=104.0,
        plus_3_sigma=106.0,
        minus_1_sigma=98.0,
        minus_2_sigma=96.0,
        minus_3_sigma=94.0
    )
    window.set_boundaries(boundaries)

    test_cases = [
        (100.0, Zone.ZONE_C_UPPER, "At center line"),
        (101.0, Zone.ZONE_C_UPPER, "Zone C upper"),
        (99.0, Zone.ZONE_C_LOWER, "Zone C lower"),
        (103.0, Zone.ZONE_B_UPPER, "Zone B upper"),
        (97.0, Zone.ZONE_B_LOWER, "Zone B lower"),
        (105.0, Zone.ZONE_A_UPPER, "Zone A upper"),
        (95.0, Zone.ZONE_A_LOWER, "Zone A lower"),
        (107.0, Zone.BEYOND_UCL, "Beyond UCL"),
        (93.0, Zone.BEYOND_LCL, "Beyond LCL"),
    ]

    for value, expected_zone, description in test_cases:
        zone, is_above, sigma_dist = window.classify_value(value)
        assert zone == expected_zone, f"{description}: Expected {expected_zone}, got {zone}"
        print(f"[PASS] {description}: {value} → {zone.value}")

    print("\n[PASS][PASS][PASS] All zone classification tests passed! [PASS][PASS][PASS]\n")


def test_boundary_reclassification():
    """Test that changing boundaries reclassifies samples."""
    print("Testing boundary reclassification...")

    window = RollingWindow(max_size=10)
    base_time = datetime(2025, 1, 1, 12, 0, 0)

    # Add samples with placeholder zones
    for i, value in enumerate([98.0, 100.0, 103.0, 105.0, 107.0]):
        sample = WindowSample(
            sample_id=i,
            timestamp=base_time + timedelta(minutes=i),
            value=value,
            range_value=None,
            zone=Zone.ZONE_C_UPPER,  # Placeholder
            is_above_center=True,
            sigma_distance=0.0
        )
        window.append(sample)

    # Set boundaries - should reclassify
    boundaries = ZoneBoundaries(
        center_line=100.0,
        sigma=2.0,
        plus_1_sigma=102.0,
        plus_2_sigma=104.0,
        plus_3_sigma=106.0,
        minus_1_sigma=98.0,
        minus_2_sigma=96.0,
        minus_3_sigma=94.0
    )
    window.set_boundaries(boundaries)

    samples = window.get_samples()
    expected_zones = [
        Zone.ZONE_C_LOWER,  # 98.0
        Zone.ZONE_C_UPPER,  # 100.0
        Zone.ZONE_B_UPPER,  # 103.0
        Zone.ZONE_A_UPPER,  # 105.0
        Zone.BEYOND_UCL,    # 107.0
    ]

    for i, (sample, expected_zone) in enumerate(zip(samples, expected_zones)):
        assert sample.zone == expected_zone, f"Sample {i}: Expected {expected_zone}, got {sample.zone}"
        print(f"[PASS] Sample {i} (value={sample.value}): {sample.zone.value}")

    print("\n[PASS][PASS][PASS] Boundary reclassification test passed! [PASS][PASS][PASS]\n")


if __name__ == "__main__":
    try:
        test_rolling_window_basic()
        test_zone_classification()
        test_boundary_reclassification()
        print("=" * 60)
        print("ALL MANUAL TESTS PASSED!")
        print("=" * 60)
    except AssertionError as e:
        print(f"\n[FAIL] TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[FAIL] ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
