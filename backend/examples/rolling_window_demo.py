"""Demonstration of Rolling Window Manager functionality.

This example shows how to use the RollingWindow and RollingWindowManager
classes for SPC control chart operations.
"""

import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

# Add src to path for demo purposes
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from openspc.core.engine.rolling_window import (
    RollingWindow,
    RollingWindowManager,
    WindowSample,
    Zone,
    ZoneBoundaries,
)


def demo_basic_rolling_window():
    """Demonstrate basic RollingWindow usage."""
    print("=" * 70)
    print("DEMO 1: Basic Rolling Window")
    print("=" * 70)

    # Create a rolling window with max size of 25 samples
    window = RollingWindow(max_size=25)
    print(f"Created rolling window with max_size={window.max_size}")

    # Define zone boundaries (center=100, sigma=2)
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
    window.set_boundaries(boundaries)
    print(f"Set boundaries: CL={boundaries.center_line}, UCL={boundaries.plus_3_sigma}, LCL={boundaries.minus_3_sigma}")

    # Add some samples
    base_time = datetime(2025, 1, 1, 12, 0, 0)
    values = [100.5, 98.2, 103.1, 99.8, 105.2, 97.5, 101.3, 107.5]

    print(f"\nAdding {len(values)} samples:")
    for i, value in enumerate(values):
        zone, is_above, sigma_dist = window.classify_value(value)
        sample = WindowSample(
            sample_id=i + 1,
            timestamp=base_time + timedelta(minutes=i * 5),
            value=value,
            range_value=None,
            zone=zone,
            is_above_center=is_above,
            sigma_distance=sigma_dist
        )
        window.append(sample)
        print(f"  Sample {i+1}: value={value:6.2f} -> {zone.value:20s} ({sigma_dist:.2f}sigma)")

    print(f"\nWindow size: {window.size}")
    print(f"Recent 3 samples (newest first):")
    for sample in window.get_recent(3):
        print(f"  ID={sample.sample_id}, value={sample.value:.2f}, zone={sample.zone.value}")

    print()


def demo_fifo_eviction():
    """Demonstrate FIFO eviction when window is full."""
    print("=" * 70)
    print("DEMO 2: FIFO Eviction")
    print("=" * 70)

    window = RollingWindow(max_size=5)
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
    window.set_boundaries(boundaries)

    base_time = datetime(2025, 1, 1, 12, 0, 0)

    # Fill window to capacity
    print("Filling window to capacity (max_size=5):")
    for i in range(5):
        zone, is_above, sigma_dist = window.classify_value(100.0 + i)
        sample = WindowSample(
            sample_id=i + 1,
            timestamp=base_time + timedelta(minutes=i),
            value=100.0 + i,
            range_value=None,
            zone=zone,
            is_above_center=is_above,
            sigma_distance=sigma_dist
        )
        evicted = window.append(sample)
        print(f"  Added sample {i+1} (value={100.0+i:.1f}), evicted: {evicted}")

    print(f"\nWindow is now full (size={window.size})")
    print("Sample IDs in window:", [s.sample_id for s in window.get_samples()])

    # Add more samples - should evict oldest
    print("\nAdding 3 more samples (should evict oldest):")
    for i in range(5, 8):
        zone, is_above, sigma_dist = window.classify_value(100.0 + i)
        sample = WindowSample(
            sample_id=i + 1,
            timestamp=base_time + timedelta(minutes=i),
            value=100.0 + i,
            range_value=None,
            zone=zone,
            is_above_center=is_above,
            sigma_distance=sigma_dist
        )
        evicted = window.append(sample)
        print(f"  Added sample {i+1} (value={100.0+i:.1f}), evicted: sample {evicted.sample_id if evicted else None}")

    print(f"\nFinal window (size={window.size}):")
    print("Sample IDs in window:", [s.sample_id for s in window.get_samples()])

    print()


def demo_zone_classification():
    """Demonstrate zone classification for different values."""
    print("=" * 70)
    print("DEMO 3: Zone Classification")
    print("=" * 70)

    window = RollingWindow()
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
    window.set_boundaries(boundaries)

    print(f"Zone boundaries (center={boundaries.center_line}, sigma={boundaries.sigma}):")
    print(f"  Beyond UCL: > {boundaries.plus_3_sigma}")
    print(f"  Zone A Upper: {boundaries.plus_2_sigma} - {boundaries.plus_3_sigma}")
    print(f"  Zone B Upper: {boundaries.plus_1_sigma} - {boundaries.plus_2_sigma}")
    print(f"  Zone C Upper: {boundaries.center_line} - {boundaries.plus_1_sigma}")
    print(f"  Zone C Lower: {boundaries.minus_1_sigma} - {boundaries.center_line}")
    print(f"  Zone B Lower: {boundaries.minus_2_sigma} - {boundaries.minus_1_sigma}")
    print(f"  Zone A Lower: {boundaries.minus_3_sigma} - {boundaries.minus_2_sigma}")
    print(f"  Beyond LCL: < {boundaries.minus_3_sigma}")

    print("\nClassifying various values:")
    test_values = [
        110.0,  # Far above UCL
        106.5,  # Just above UCL
        105.0,  # Zone A upper
        103.0,  # Zone B upper
        101.0,  # Zone C upper
        100.0,  # Center line
        99.0,   # Zone C lower
        97.0,   # Zone B lower
        95.0,   # Zone A lower
        93.5,   # Just below LCL
        90.0,   # Far below LCL
    ]

    for value in test_values:
        zone, is_above, sigma_dist = window.classify_value(value)
        direction = "above" if is_above else "below"
        print(f"  Value {value:6.1f}: {zone.value:20s} ({sigma_dist:.2f}sigma {direction} center)")

    print()


async def demo_rolling_window_manager():
    """Demonstrate RollingWindowManager with async operations."""
    print("=" * 70)
    print("DEMO 4: Rolling Window Manager (Async)")
    print("=" * 70)

    # Create mock repository
    mock_repo = AsyncMock()

    # Setup mock to return some initial samples
    base_time = datetime(2025, 1, 1, 12, 0, 0)
    mock_samples = []
    for i in range(3):
        mock_sample = MagicMock()
        mock_sample.id = i + 1
        mock_sample.timestamp = base_time + timedelta(minutes=i * 5)
        mock_measurement = MagicMock()
        mock_measurement.value = 100.0 + i
        mock_sample.measurements = [mock_measurement]
        mock_samples.append(mock_sample)

    mock_repo.get_rolling_window.return_value = mock_samples

    # Create manager
    manager = RollingWindowManager(
        sample_repository=mock_repo,
        max_cached_windows=1000,
        window_size=25
    )
    print(f"Created RollingWindowManager (max_cached={manager.max_cached_windows})")

    # Get window for characteristic 1 (lazy load from DB)
    print("\nLoading window for characteristic 1 (from database)...")
    window = await manager.get_window(char_id=1)
    print(f"Loaded window with {window.size} samples from database")
    print(f"Cache size: {manager.cache_size}")

    # Set boundaries
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
    window.set_boundaries(boundaries)

    # Add a new sample
    print("\nAdding new sample...")
    mock_sample = MagicMock()
    mock_sample.id = 4
    mock_sample.timestamp = base_time + timedelta(minutes=15)
    mock_measurement = MagicMock()
    mock_measurement.value = 103.5
    mock_sample.measurements = [mock_measurement]

    window_sample = await manager.add_sample(
        char_id=1,
        sample=mock_sample,
        boundaries=boundaries
    )
    print(f"Added sample: value={window_sample.value:.2f}, zone={window_sample.zone.value}")

    # Get window again (should be cached)
    print("\nAccessing window again (from cache)...")
    window2 = await manager.get_window(char_id=1)
    print(f"Window size: {window2.size}")
    print(f"Same object from cache: {window is window2}")

    # Invalidate window
    print("\nInvalidating window for characteristic 1...")
    await manager.invalidate(char_id=1)
    print(f"Cache size after invalidation: {manager.cache_size}")

    print()


async def demo_lru_eviction():
    """Demonstrate LRU cache eviction."""
    print("=" * 70)
    print("DEMO 5: LRU Cache Eviction")
    print("=" * 70)

    # Create manager with small cache
    mock_repo = AsyncMock()
    mock_repo.get_rolling_window.return_value = []

    manager = RollingWindowManager(
        sample_repository=mock_repo,
        max_cached_windows=3,  # Small cache for demo
        window_size=25
    )
    print(f"Created RollingWindowManager with max_cached_windows=3")

    # Load 3 windows (fill cache)
    print("\nLoading 3 characteristics (fill cache):")
    for char_id in range(1, 4):
        await manager.get_window(char_id=char_id)
        print(f"  Loaded char_id={char_id}, cache_size={manager.cache_size}")

    # Access char_id=1 again (moves to end of LRU)
    print("\nAccessing char_id=1 again (refresh in LRU)...")
    await manager.get_window(char_id=1)
    print(f"  Cache state: {list(manager._cache.keys())}")

    # Load char_id=4 (should evict char_id=2, the LRU)
    print("\nLoading char_id=4 (should evict LRU)...")
    await manager.get_window(char_id=4)
    print(f"  Cache state: {list(manager._cache.keys())}")
    print(f"  char_id=2 was evicted (was LRU)")
    print(f"  char_id=1 remains (was accessed recently)")

    print()


async def main():
    """Run all demos."""
    print("\n")
    print("*" * 70)
    print("ROLLING WINDOW MANAGER DEMONSTRATIONS")
    print("*" * 70)
    print()

    # Synchronous demos
    demo_basic_rolling_window()
    demo_fifo_eviction()
    demo_zone_classification()

    # Asynchronous demos
    await demo_rolling_window_manager()
    await demo_lru_eviction()

    print("=" * 70)
    print("ALL DEMONSTRATIONS COMPLETED")
    print("=" * 70)
    print()


if __name__ == "__main__":
    asyncio.run(main())
