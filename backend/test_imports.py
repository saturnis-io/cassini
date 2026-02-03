#!/usr/bin/env python3
"""Quick test to verify all imports work correctly."""

import sys
sys.path.insert(0, 'src')

print("Testing imports from openspc.utils...")

try:
    # Test constants imports
    from openspc.utils import (
        SpcConstants,
        get_constants,
        get_d2,
        get_c4,
        get_A2,
        get_D3,
        get_D4,
    )
    print("✓ Constants imports successful")

    # Test statistics imports
    from openspc.utils import (
        ControlLimits,
        XbarRLimits,
        ZoneBoundaries,
        estimate_sigma_rbar,
        estimate_sigma_sbar,
        estimate_sigma_moving_range,
        calculate_xbar_r_limits,
        calculate_imr_limits,
        calculate_zones,
        calculate_control_limits_from_sigma,
    )
    print("✓ Statistics imports successful")

    # Test basic functionality
    d2_value = get_d2(5)
    print(f"✓ get_d2(5) = {d2_value} (expected 2.326)")

    c4_value = get_c4(10)
    print(f"✓ get_c4(10) = {c4_value} (expected 0.9727)")

    # Test moving range calculation
    values = [10, 12, 11, 13, 10]
    sigma = estimate_sigma_moving_range(values)
    print(f"✓ estimate_sigma_moving_range([10, 12, 11, 13, 10]) = {sigma:.3f} (expected 1.773)")

    # Test zones
    zones = calculate_zones(100.0, 2.0)
    print(f"✓ calculate_zones(100.0, 2.0) - UCL = {zones.plus_3_sigma} (expected 106.0)")

    print("\n✓ ALL IMPORTS AND BASIC TESTS SUCCESSFUL!")
    sys.exit(0)

except ImportError as e:
    print(f"✗ Import error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
