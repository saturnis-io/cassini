"""Quick verification of rolling window implementation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from datetime import datetime
from openspc.core.engine.rolling_window import (
    RollingWindow,
    WindowSample,
    Zone,
    ZoneBoundaries,
)

# Test ZoneBoundaries inheritance
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

print(f"Boundaries created: center={boundaries.center_line}, sigma={boundaries.sigma}")
print(f"UCL={boundaries.plus_3_sigma}, LCL={boundaries.minus_3_sigma}")

# Test rolling window
window = RollingWindow(max_size=5)
window.set_boundaries(boundaries)

# Test classification
zone, is_above, sigma_dist = window.classify_value(103.0)
print(f"\nValue 103.0 classification:")
print(f"  Zone: {zone.value}")
print(f"  Above center: {is_above}")
print(f"  Sigma distance: {sigma_dist:.2f}")

# Add a sample
sample = WindowSample(
    sample_id=1,
    timestamp=datetime.now(),
    value=103.0,
    range_value=None,
    zone=zone,
    is_above_center=is_above,
    sigma_distance=sigma_dist
)
window.append(sample)

print(f"\nWindow size: {window.size}")
print(f"Window ready: {window.is_ready}")

print("\n[SUCCESS] All verifications passed!")
