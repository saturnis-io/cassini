#!/usr/bin/env python3
"""Quick verification script for statistical utilities.

This script demonstrates the statistical utilities in action and verifies
key calculations match the specification requirements.
"""

import sys
sys.path.insert(0, 'src')

from openspc.utils import (
    get_d2, get_c4, get_A2, get_D3, get_D4,
    estimate_sigma_rbar, estimate_sigma_sbar, estimate_sigma_moving_range,
    calculate_xbar_r_limits, calculate_imr_limits, calculate_zones,
)


def verify_constants():
    """Verify statistical constants match ASTM E2587."""
    print("=" * 70)
    print("VERIFYING STATISTICAL CONSTANTS (ASTM E2587)")
    print("=" * 70)

    tests = [
        ("d2(5)", get_d2(5), 2.326),
        ("c4(10)", get_c4(10), 0.9727),
        ("A2(5)", get_A2(5), 0.577),
        ("D3(7)", get_D3(7), 0.076),
        ("D4(5)", get_D4(5), 2.114),
    ]

    all_passed = True
    for name, actual, expected in tests:
        passed = abs(actual - expected) < 0.0001
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status} | {name:12} = {actual:8.4f} (expected {expected})")
        if not passed:
            all_passed = False

    return all_passed


def verify_moving_range():
    """Verify moving range calculation from specification."""
    print("\n" + "=" * 70)
    print("VERIFYING MOVING RANGE METHOD (Spec Example)")
    print("=" * 70)

    values = [10, 12, 11, 13, 10]
    print(f"Values: {values}")

    # Manual calculation
    print(f"Moving Ranges: [|12-10|, |11-12|, |13-11|, |10-13|] = [2, 1, 2, 3]")
    print(f"Average MR: (2+1+2+3)/4 = 2.0")
    print(f"d2(2): {get_d2(2)}")
    expected = 2.0 / 1.128
    print(f"Expected sigma: 2.0 / 1.128 = {expected:.3f}")

    # Actual calculation
    result = estimate_sigma_moving_range(values)
    print(f"Calculated sigma: {result:.3f}")

    passed = abs(result - expected) < 0.001
    status = "✓ PASS" if passed else "✗ FAIL"
    print(f"\n{status} | Moving Range sigma estimation")

    return passed


def verify_xbar_r_limits():
    """Verify X-bar R chart calculations."""
    print("\n" + "=" * 70)
    print("VERIFYING X-BAR R CHART CALCULATIONS")
    print("=" * 70)

    means = [10.0, 10.2, 9.8, 10.1]
    ranges = [1.2, 1.5, 1.0, 1.3]
    subgroup_size = 5

    print(f"Subgroup Means: {means}")
    print(f"Subgroup Ranges: {ranges}")
    print(f"Subgroup Size: {subgroup_size}")

    limits = calculate_xbar_r_limits(means, ranges, subgroup_size)

    print(f"\nX-bar Chart:")
    print(f"  Center Line: {limits.xbar_limits.center_line:.4f}")
    print(f"  UCL: {limits.xbar_limits.ucl:.4f}")
    print(f"  LCL: {limits.xbar_limits.lcl:.4f}")
    print(f"  Sigma: {limits.xbar_limits.sigma:.4f}")

    print(f"\nR Chart:")
    print(f"  Center Line: {limits.r_limits.center_line:.4f}")
    print(f"  UCL: {limits.r_limits.ucl:.4f}")
    print(f"  LCL: {limits.r_limits.lcl:.4f}")

    # Manual verification
    xbar = sum(means) / len(means)
    rbar = sum(ranges) / len(ranges)
    expected_xbar = 10.025
    expected_rbar = 1.25

    passed = (abs(limits.xbar_limits.center_line - expected_xbar) < 0.001 and
              abs(limits.r_limits.center_line - expected_rbar) < 0.001)

    status = "✓ PASS" if passed else "✗ FAIL"
    print(f"\n{status} | X-bar R chart calculations")

    return passed


def verify_imr_limits():
    """Verify I-MR chart calculations."""
    print("\n" + "=" * 70)
    print("VERIFYING I-MR CHART CALCULATIONS")
    print("=" * 70)

    values = [10, 12, 11, 13, 10, 12]
    print(f"Individual Values: {values}")

    limits = calculate_imr_limits(values)

    print(f"\nIndividuals Chart:")
    print(f"  Center Line: {limits.xbar_limits.center_line:.4f}")
    print(f"  UCL: {limits.xbar_limits.ucl:.4f}")
    print(f"  LCL: {limits.xbar_limits.lcl:.4f}")
    print(f"  Sigma: {limits.xbar_limits.sigma:.4f}")

    print(f"\nMoving Range Chart:")
    print(f"  Center Line: {limits.r_limits.center_line:.4f}")
    print(f"  UCL: {limits.r_limits.ucl:.4f}")
    print(f"  LCL: {limits.r_limits.lcl:.4f}")

    # Verify sigma matches moving range calculation
    expected_sigma = estimate_sigma_moving_range(values)
    passed = abs(limits.xbar_limits.sigma - expected_sigma) < 0.001

    status = "✓ PASS" if passed else "✗ FAIL"
    print(f"\n{status} | I-MR chart calculations")

    return passed


def verify_zones():
    """Verify zone boundary calculations."""
    print("\n" + "=" * 70)
    print("VERIFYING ZONE BOUNDARY CALCULATIONS")
    print("=" * 70)

    center = 100.0
    sigma = 2.0

    print(f"Center Line: {center}")
    print(f"Sigma: {sigma}")

    zones = calculate_zones(center, sigma)

    print(f"\nZone Boundaries:")
    print(f"  +3σ (UCL): {zones.plus_3_sigma:.2f}")
    print(f"  +2σ:       {zones.plus_2_sigma:.2f}")
    print(f"  +1σ:       {zones.plus_1_sigma:.2f}")
    print(f"  CL:        {zones.center_line:.2f}")
    print(f"  -1σ:       {zones.minus_1_sigma:.2f}")
    print(f"  -2σ:       {zones.minus_2_sigma:.2f}")
    print(f"  -3σ (LCL): {zones.minus_3_sigma:.2f}")

    # Verify symmetry
    symmetric = (
        abs((zones.plus_1_sigma - center) - (center - zones.minus_1_sigma)) < 0.001 and
        abs((zones.plus_2_sigma - center) - (center - zones.minus_2_sigma)) < 0.001 and
        abs((zones.plus_3_sigma - center) - (center - zones.minus_3_sigma)) < 0.001
    )

    status = "✓ PASS" if symmetric else "✗ FAIL"
    print(f"\n{status} | Zone boundaries are symmetric")

    return symmetric


def main():
    """Run all verification tests."""
    print("\n")
    print("╔" + "═" * 68 + "╗")
    print("║" + " OPENSPC STATISTICAL UTILITIES VERIFICATION ".center(68) + "║")
    print("╚" + "═" * 68 + "╝")

    results = []

    try:
        results.append(("Constants", verify_constants()))
        results.append(("Moving Range", verify_moving_range()))
        results.append(("X-bar R Limits", verify_xbar_r_limits()))
        results.append(("I-MR Limits", verify_imr_limits()))
        results.append(("Zone Boundaries", verify_zones()))

        print("\n" + "=" * 70)
        print("SUMMARY")
        print("=" * 70)

        for name, passed in results:
            status = "✓ PASS" if passed else "✗ FAIL"
            print(f"{status} | {name}")

        all_passed = all(passed for _, passed in results)

        print("\n" + "=" * 70)
        if all_passed:
            print("✓ ALL TESTS PASSED!")
        else:
            print("✗ SOME TESTS FAILED")
        print("=" * 70 + "\n")

        return 0 if all_passed else 1

    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
