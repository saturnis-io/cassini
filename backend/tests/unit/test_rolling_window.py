"""Unit tests for rolling window manager."""

import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from openspc.core.engine.rolling_window import (
    RollingWindow,
    RollingWindowManager,
    WindowSample,
    Zone,
    ZoneBoundaries,
)


# Test fixtures

@pytest.fixture
def boundaries():
    """Standard zone boundaries for testing."""
    return ZoneBoundaries(
        center_line=100.0,
        sigma=2.0,
        plus_1_sigma=102.0,
        plus_2_sigma=104.0,
        plus_3_sigma=106.0,
        minus_1_sigma=98.0,
        minus_2_sigma=96.0,
        minus_3_sigma=94.0
    )


@pytest.fixture
def sample_timestamp():
    """Base timestamp for testing."""
    return datetime(2025, 1, 1, 12, 0, 0)


def create_window_sample(
    sample_id: int,
    value: float,
    timestamp: datetime,
    zone: Zone = Zone.ZONE_C_UPPER,
    range_value: float | None = None
) -> WindowSample:
    """Helper to create WindowSample for testing."""
    return WindowSample(
        sample_id=sample_id,
        timestamp=timestamp,
        value=value,
        range_value=range_value,
        zone=zone,
        is_above_center=value >= 100.0,
        sigma_distance=abs(value - 100.0) / 2.0
    )


# RollingWindow Tests

class TestRollingWindow:
    """Tests for RollingWindow class."""

    def test_initialization(self):
        """Test window initialization with default and custom sizes."""
        window = RollingWindow()
        assert window.max_size == 25
        assert window.size == 0
        assert not window.is_ready

        window = RollingWindow(max_size=50)
        assert window.max_size == 50
        assert window.size == 0

    def test_initialization_invalid_size(self):
        """Test window initialization with invalid size."""
        with pytest.raises(ValueError, match="max_size must be at least 1"):
            RollingWindow(max_size=0)

        with pytest.raises(ValueError, match="max_size must be at least 1"):
            RollingWindow(max_size=-1)

    def test_append_to_non_full_window(self, sample_timestamp):
        """Test appending samples to non-full window."""
        window = RollingWindow(max_size=5)
        samples = []

        for i in range(3):
            sample = create_window_sample(
                sample_id=i,
                value=100.0 + i,
                timestamp=sample_timestamp + timedelta(minutes=i)
            )
            evicted = window.append(sample)
            samples.append(sample)

            assert evicted is None
            assert window.size == i + 1

    def test_append_to_full_window_evicts_oldest(self, sample_timestamp):
        """Test that appending to full window evicts oldest sample (FIFO)."""
        window = RollingWindow(max_size=3)
        samples = []

        # Fill window
        for i in range(3):
            sample = create_window_sample(
                sample_id=i,
                value=100.0 + i,
                timestamp=sample_timestamp + timedelta(minutes=i)
            )
            window.append(sample)
            samples.append(sample)

        # Window should be full
        assert window.size == 3

        # Add one more - should evict first sample
        new_sample = create_window_sample(
            sample_id=3,
            value=103.0,
            timestamp=sample_timestamp + timedelta(minutes=3)
        )
        evicted = window.append(new_sample)

        assert evicted == samples[0]  # Oldest sample evicted
        assert window.size == 3
        assert samples[0] not in window.get_samples()
        assert new_sample in window.get_samples()

    def test_get_samples_chronological_order(self, sample_timestamp):
        """Test get_samples returns samples in chronological order (oldest first)."""
        window = RollingWindow(max_size=5)
        samples = []

        for i in range(5):
            sample = create_window_sample(
                sample_id=i,
                value=100.0 + i,
                timestamp=sample_timestamp + timedelta(minutes=i)
            )
            window.append(sample)
            samples.append(sample)

        result = window.get_samples()
        assert result == samples
        assert result[0].sample_id == 0
        assert result[-1].sample_id == 4

    def test_get_recent_samples(self, sample_timestamp):
        """Test get_recent returns most recent samples in reverse order."""
        window = RollingWindow(max_size=5)
        samples = []

        for i in range(5):
            sample = create_window_sample(
                sample_id=i,
                value=100.0 + i,
                timestamp=sample_timestamp + timedelta(minutes=i)
            )
            window.append(sample)
            samples.append(sample)

        # Get last 3 samples
        recent = window.get_recent(3)
        assert len(recent) == 3
        assert recent[0] == samples[4]  # Most recent first
        assert recent[1] == samples[3]
        assert recent[2] == samples[2]

    def test_get_recent_more_than_available(self, sample_timestamp):
        """Test get_recent when requesting more samples than available."""
        window = RollingWindow(max_size=5)

        for i in range(3):
            sample = create_window_sample(
                sample_id=i,
                value=100.0 + i,
                timestamp=sample_timestamp + timedelta(minutes=i)
            )
            window.append(sample)

        recent = window.get_recent(10)
        assert len(recent) == 3  # Only returns available samples

    def test_set_boundaries_enables_classification(self, boundaries):
        """Test setting boundaries makes window ready for classification."""
        window = RollingWindow()
        assert not window.is_ready

        window.set_boundaries(boundaries)
        assert window.is_ready

    def test_classify_value_zone_c_upper(self, boundaries):
        """Test classification of values in Zone C upper."""
        window = RollingWindow()
        window.set_boundaries(boundaries)

        # Values between center line and +1 sigma
        zone, is_above, sigma_dist = window.classify_value(100.5)
        assert zone == Zone.ZONE_C_UPPER
        assert is_above is True
        assert abs(sigma_dist - 0.25) < 0.001

        zone, is_above, sigma_dist = window.classify_value(101.9)
        assert zone == Zone.ZONE_C_UPPER
        assert is_above is True
        assert abs(sigma_dist - 0.95) < 0.001

    def test_classify_value_zone_c_lower(self, boundaries):
        """Test classification of values in Zone C lower."""
        window = RollingWindow()
        window.set_boundaries(boundaries)

        # Values between center line and -1 sigma
        zone, is_above, sigma_dist = window.classify_value(99.5)
        assert zone == Zone.ZONE_C_LOWER
        assert is_above is False
        assert abs(sigma_dist - 0.25) < 0.001

        zone, is_above, sigma_dist = window.classify_value(98.1)
        assert zone == Zone.ZONE_C_LOWER
        assert is_above is False
        assert abs(sigma_dist - 0.95) < 0.001

    def test_classify_value_zone_b_upper(self, boundaries):
        """Test classification of values in Zone B upper."""
        window = RollingWindow()
        window.set_boundaries(boundaries)

        # Values between +1 sigma and +2 sigma
        zone, is_above, sigma_dist = window.classify_value(102.5)
        assert zone == Zone.ZONE_B_UPPER
        assert is_above is True
        assert abs(sigma_dist - 1.25) < 0.001

        zone, is_above, sigma_dist = window.classify_value(103.9)
        assert zone == Zone.ZONE_B_UPPER
        assert is_above is True
        assert abs(sigma_dist - 1.95) < 0.001

    def test_classify_value_zone_b_lower(self, boundaries):
        """Test classification of values in Zone B lower."""
        window = RollingWindow()
        window.set_boundaries(boundaries)

        # Values between -1 sigma and -2 sigma
        zone, is_above, sigma_dist = window.classify_value(97.5)
        assert zone == Zone.ZONE_B_LOWER
        assert is_above is False
        assert abs(sigma_dist - 1.25) < 0.001

        zone, is_above, sigma_dist = window.classify_value(96.1)
        assert zone == Zone.ZONE_B_LOWER
        assert is_above is False
        assert abs(sigma_dist - 1.95) < 0.001

    def test_classify_value_zone_a_upper(self, boundaries):
        """Test classification of values in Zone A upper."""
        window = RollingWindow()
        window.set_boundaries(boundaries)

        # Values between +2 sigma and +3 sigma
        zone, is_above, sigma_dist = window.classify_value(104.5)
        assert zone == Zone.ZONE_A_UPPER
        assert is_above is True
        assert abs(sigma_dist - 2.25) < 0.001

        zone, is_above, sigma_dist = window.classify_value(105.9)
        assert zone == Zone.ZONE_A_UPPER
        assert is_above is True
        assert abs(sigma_dist - 2.95) < 0.001

    def test_classify_value_zone_a_lower(self, boundaries):
        """Test classification of values in Zone A lower."""
        window = RollingWindow()
        window.set_boundaries(boundaries)

        # Values between -2 sigma and -3 sigma
        zone, is_above, sigma_dist = window.classify_value(95.5)
        assert zone == Zone.ZONE_A_LOWER
        assert is_above is False
        assert abs(sigma_dist - 2.25) < 0.001

        zone, is_above, sigma_dist = window.classify_value(94.1)
        assert zone == Zone.ZONE_A_LOWER
        assert is_above is False
        assert abs(sigma_dist - 2.95) < 0.001

    def test_classify_value_beyond_ucl(self, boundaries):
        """Test classification of values beyond UCL."""
        window = RollingWindow()
        window.set_boundaries(boundaries)

        zone, is_above, sigma_dist = window.classify_value(106.0)
        assert zone == Zone.BEYOND_UCL
        assert is_above is True
        assert abs(sigma_dist - 3.0) < 0.001

        zone, is_above, sigma_dist = window.classify_value(110.0)
        assert zone == Zone.BEYOND_UCL
        assert is_above is True
        assert abs(sigma_dist - 5.0) < 0.001

    def test_classify_value_beyond_lcl(self, boundaries):
        """Test classification of values beyond LCL."""
        window = RollingWindow()
        window.set_boundaries(boundaries)

        zone, is_above, sigma_dist = window.classify_value(94.0)
        assert zone == Zone.BEYOND_LCL
        assert is_above is False
        assert abs(sigma_dist - 3.0) < 0.001

        zone, is_above, sigma_dist = window.classify_value(90.0)
        assert zone == Zone.BEYOND_LCL
        assert is_above is False
        assert abs(sigma_dist - 5.0) < 0.001

    def test_classify_value_at_center_line(self, boundaries):
        """Test classification of value exactly at center line."""
        window = RollingWindow()
        window.set_boundaries(boundaries)

        zone, is_above, sigma_dist = window.classify_value(100.0)
        assert zone == Zone.ZONE_C_UPPER  # At center counts as upper
        assert is_above is True
        assert sigma_dist == 0.0

    def test_classify_value_without_boundaries(self):
        """Test that classifying without boundaries raises error."""
        window = RollingWindow()

        with pytest.raises(ValueError, match="Boundaries must be set"):
            window.classify_value(100.0)

    def test_set_boundaries_reclassifies_samples(self, boundaries, sample_timestamp):
        """Test that setting boundaries reclassifies existing samples."""
        window = RollingWindow(max_size=5)

        # Add samples without boundaries (with placeholder zones)
        samples = []
        for i, value in enumerate([98.0, 100.0, 103.0, 105.0, 107.0]):
            sample = WindowSample(
                sample_id=i,
                timestamp=sample_timestamp + timedelta(minutes=i),
                value=value,
                range_value=None,
                zone=Zone.ZONE_C_UPPER,  # Placeholder
                is_above_center=True,
                sigma_distance=0.0
            )
            window.append(sample)
            samples.append(sample)

        # Set boundaries - should reclassify all samples
        window.set_boundaries(boundaries)

        result = window.get_samples()
        assert result[0].zone == Zone.ZONE_C_LOWER  # 98.0
        assert result[1].zone == Zone.ZONE_C_UPPER  # 100.0
        assert result[2].zone == Zone.ZONE_B_UPPER  # 103.0
        assert result[3].zone == Zone.ZONE_A_UPPER  # 105.0
        assert result[4].zone == Zone.BEYOND_UCL    # 107.0

    def test_clear_removes_all_samples(self, sample_timestamp):
        """Test that clear removes all samples from window."""
        window = RollingWindow(max_size=5)

        # Add samples
        for i in range(5):
            sample = create_window_sample(
                sample_id=i,
                value=100.0 + i,
                timestamp=sample_timestamp + timedelta(minutes=i)
            )
            window.append(sample)

        assert window.size == 5

        window.clear()

        assert window.size == 0
        assert len(window.get_samples()) == 0


# RollingWindowManager Tests

class TestRollingWindowManager:
    """Tests for RollingWindowManager class."""

    @pytest.fixture
    def mock_repo(self):
        """Mock sample repository."""
        return AsyncMock()

    @pytest.fixture
    def manager(self, mock_repo):
        """Rolling window manager with mock repository."""
        return RollingWindowManager(
            sample_repository=mock_repo,
            max_cached_windows=5,
            window_size=25
        )

    def test_initialization(self, mock_repo):
        """Test manager initialization."""
        manager = RollingWindowManager(
            sample_repository=mock_repo,
            max_cached_windows=100,
            window_size=50
        )

        assert manager.cache_size == 0
        assert manager.max_cached_windows == 100

    def test_initialization_invalid_params(self, mock_repo):
        """Test manager initialization with invalid parameters."""
        with pytest.raises(ValueError, match="max_cached_windows must be at least 1"):
            RollingWindowManager(
                sample_repository=mock_repo,
                max_cached_windows=0,
                window_size=25
            )

        with pytest.raises(ValueError, match="window_size must be at least 1"):
            RollingWindowManager(
                sample_repository=mock_repo,
                max_cached_windows=100,
                window_size=0
            )

    @pytest.mark.asyncio
    async def test_get_window_loads_from_db(self, manager, mock_repo, sample_timestamp):
        """Test getting window loads from database on first access."""
        # Mock database samples
        mock_samples = []
        for i in range(3):
            mock_sample = MagicMock()
            mock_sample.id = i
            mock_sample.timestamp = sample_timestamp + timedelta(minutes=i)
            mock_measurement = MagicMock()
            mock_measurement.value = 100.0 + i
            mock_sample.measurements = [mock_measurement]
            mock_samples.append(mock_sample)

        mock_repo.get_rolling_window.return_value = mock_samples

        # Get window for characteristic 1
        window = await manager.get_window(char_id=1)

        # Should have loaded from database
        mock_repo.get_rolling_window.assert_called_once_with(
            char_id=1,
            window_size=25,
            exclude_excluded=True
        )

        assert window.size == 3
        assert manager.cache_size == 1

    @pytest.mark.asyncio
    async def test_get_window_returns_cached(self, manager, mock_repo, sample_timestamp):
        """Test getting window returns cached version on subsequent access."""
        # Mock database samples
        mock_samples = []
        mock_sample = MagicMock()
        mock_sample.id = 1
        mock_sample.timestamp = sample_timestamp
        mock_measurement = MagicMock()
        mock_measurement.value = 100.0
        mock_sample.measurements = [mock_measurement]
        mock_samples.append(mock_sample)

        mock_repo.get_rolling_window.return_value = mock_samples

        # First access - loads from DB
        window1 = await manager.get_window(char_id=1)
        assert mock_repo.get_rolling_window.call_count == 1

        # Second access - returns cached
        window2 = await manager.get_window(char_id=1)
        assert mock_repo.get_rolling_window.call_count == 1  # Not called again
        assert window1 is window2  # Same object

    @pytest.mark.asyncio
    async def test_lru_eviction(self, mock_repo, sample_timestamp):
        """Test LRU eviction when cache exceeds max size."""
        manager = RollingWindowManager(
            sample_repository=mock_repo,
            max_cached_windows=3,
            window_size=25
        )

        # Mock database to return empty list
        mock_repo.get_rolling_window.return_value = []

        # Load 3 windows (fill cache)
        await manager.get_window(char_id=1)
        await manager.get_window(char_id=2)
        await manager.get_window(char_id=3)

        assert manager.cache_size == 3

        # Load 4th window - should evict char_id=1 (LRU)
        await manager.get_window(char_id=4)

        assert manager.cache_size == 3
        assert 1 not in manager._cache
        assert 2 in manager._cache
        assert 3 in manager._cache
        assert 4 in manager._cache

    @pytest.mark.asyncio
    async def test_lru_order_updated_on_access(self, mock_repo):
        """Test that accessing a cached window updates LRU order."""
        manager = RollingWindowManager(
            sample_repository=mock_repo,
            max_cached_windows=3,
            window_size=25
        )

        mock_repo.get_rolling_window.return_value = []

        # Load 3 windows
        await manager.get_window(char_id=1)
        await manager.get_window(char_id=2)
        await manager.get_window(char_id=3)

        # Access char_id=1 again (moves it to end of LRU)
        await manager.get_window(char_id=1)

        # Load 4th window - should evict char_id=2 (now LRU)
        await manager.get_window(char_id=4)

        assert 1 in manager._cache  # Not evicted (was accessed)
        assert 2 not in manager._cache  # Evicted (LRU)
        assert 3 in manager._cache
        assert 4 in manager._cache

    @pytest.mark.asyncio
    async def test_add_sample(self, manager, mock_repo, boundaries, sample_timestamp):
        """Test adding a sample to window."""
        # Setup mock
        mock_repo.get_rolling_window.return_value = []

        # Create mock sample
        mock_sample = MagicMock()
        mock_sample.id = 1
        mock_sample.timestamp = sample_timestamp
        mock_measurement = MagicMock()
        mock_measurement.value = 103.0
        mock_sample.measurements = [mock_measurement]

        # Add sample
        window_sample = await manager.add_sample(
            char_id=1,
            sample=mock_sample,
            boundaries=boundaries
        )

        # Check window sample
        assert window_sample.sample_id == 1
        assert window_sample.value == 103.0
        assert window_sample.zone == Zone.ZONE_B_UPPER
        assert window_sample.is_above_center is True

        # Check window is cached
        assert manager.cache_size == 1
        window = await manager.get_window(char_id=1)
        assert window.size == 1

    @pytest.mark.asyncio
    async def test_add_sample_with_range(self, manager, mock_repo, boundaries, sample_timestamp):
        """Test adding a sample with multiple measurements (subgroup)."""
        mock_repo.get_rolling_window.return_value = []

        # Create mock sample with multiple measurements
        mock_sample = MagicMock()
        mock_sample.id = 1
        mock_sample.timestamp = sample_timestamp

        mock_measurements = []
        for value in [101.0, 102.0, 103.0, 104.0, 105.0]:
            mock_measurement = MagicMock()
            mock_measurement.value = value
            mock_measurements.append(mock_measurement)

        mock_sample.measurements = mock_measurements

        # Add sample
        window_sample = await manager.add_sample(
            char_id=1,
            sample=mock_sample,
            boundaries=boundaries
        )

        # Check calculations
        expected_mean = 103.0  # Mean of [101, 102, 103, 104, 105]
        expected_range = 4.0   # 105 - 101

        assert window_sample.value == expected_mean
        assert window_sample.range_value == expected_range

    @pytest.mark.asyncio
    async def test_invalidate_removes_from_cache(self, manager, mock_repo):
        """Test invalidate removes window from cache."""
        mock_repo.get_rolling_window.return_value = []

        # Load window
        await manager.get_window(char_id=1)
        assert manager.cache_size == 1

        # Invalidate
        await manager.invalidate(char_id=1)
        assert manager.cache_size == 0
        assert 1 not in manager._cache

    @pytest.mark.asyncio
    async def test_invalidate_nonexistent_window(self, manager):
        """Test invalidating non-existent window doesn't raise error."""
        await manager.invalidate(char_id=999)
        assert manager.cache_size == 0

    @pytest.mark.asyncio
    async def test_update_boundaries(self, manager, mock_repo, boundaries, sample_timestamp):
        """Test updating boundaries reclassifies samples."""
        # Setup mock with initial samples
        mock_samples = []
        for i, value in enumerate([98.0, 103.0, 107.0]):
            mock_sample = MagicMock()
            mock_sample.id = i
            mock_sample.timestamp = sample_timestamp + timedelta(minutes=i)
            mock_measurement = MagicMock()
            mock_measurement.value = value
            mock_sample.measurements = [mock_measurement]
            mock_samples.append(mock_sample)

        mock_repo.get_rolling_window.return_value = mock_samples

        # Load window and set boundaries
        window = await manager.get_window(char_id=1)
        window.set_boundaries(boundaries)

        # Check initial zones
        samples = window.get_samples()
        assert samples[0].zone == Zone.ZONE_C_LOWER
        assert samples[1].zone == Zone.ZONE_B_UPPER
        assert samples[2].zone == Zone.BEYOND_UCL

        # Update boundaries (wider tolerance)
        new_boundaries = ZoneBoundaries(
            center_line=100.0,
            sigma=4.0,
            plus_1_sigma=104.0,
            plus_2_sigma=108.0,
            plus_3_sigma=112.0,
            minus_1_sigma=96.0,
            minus_2_sigma=92.0,
            minus_3_sigma=88.0
        )

        await manager.update_boundaries(char_id=1, boundaries=new_boundaries)

        # Check reclassified zones
        samples = window.get_samples()
        assert samples[0].zone == Zone.ZONE_C_LOWER  # 98.0
        assert samples[1].zone == Zone.ZONE_C_UPPER  # 103.0
        assert samples[2].zone == Zone.ZONE_B_UPPER  # 107.0 (was beyond, now zone B)

    @pytest.mark.asyncio
    async def test_concurrent_access_same_characteristic(self, manager, mock_repo, sample_timestamp):
        """Test concurrent access to same characteristic is thread-safe."""
        # Mock with delay to simulate concurrent access
        async def delayed_return():
            await asyncio.sleep(0.01)
            return []

        mock_repo.get_rolling_window.side_effect = delayed_return

        # Start multiple concurrent accesses
        tasks = [manager.get_window(char_id=1) for _ in range(5)]
        windows = await asyncio.gather(*tasks)

        # Should only load once from database
        assert mock_repo.get_rolling_window.call_count == 1

        # All should return the same window object
        assert all(w is windows[0] for w in windows)

    @pytest.mark.asyncio
    async def test_concurrent_access_different_characteristics(self, manager, mock_repo):
        """Test concurrent access to different characteristics."""
        mock_repo.get_rolling_window.return_value = []

        # Access different characteristics concurrently
        tasks = [manager.get_window(char_id=i) for i in range(1, 6)]
        await asyncio.gather(*tasks)

        # Should load each characteristic once
        assert mock_repo.get_rolling_window.call_count == 5
        assert manager.cache_size == 5

    @pytest.mark.asyncio
    async def test_empty_measurements_handled(self, manager, mock_repo, boundaries, sample_timestamp):
        """Test handling of samples with no measurements."""
        mock_repo.get_rolling_window.return_value = []

        # Create mock sample with no measurements
        mock_sample = MagicMock()
        mock_sample.id = 1
        mock_sample.timestamp = sample_timestamp
        mock_sample.measurements = []

        # Add sample - should use 0.0 as value
        window_sample = await manager.add_sample(
            char_id=1,
            sample=mock_sample,
            boundaries=boundaries
        )

        assert window_sample.value == 0.0
        assert window_sample.range_value is None

    @pytest.mark.asyncio
    async def test_single_measurement_no_range(self, manager, mock_repo, boundaries, sample_timestamp):
        """Test that single measurements have no range value."""
        mock_repo.get_rolling_window.return_value = []

        # Create mock sample with single measurement
        mock_sample = MagicMock()
        mock_sample.id = 1
        mock_sample.timestamp = sample_timestamp
        mock_measurement = MagicMock()
        mock_measurement.value = 100.0
        mock_sample.measurements = [mock_measurement]

        # Add sample
        window_sample = await manager.add_sample(
            char_id=1,
            sample=mock_sample,
            boundaries=boundaries
        )

        assert window_sample.value == 100.0
        assert window_sample.range_value is None


# Integration Tests

class TestRollingWindowIntegration:
    """Integration tests for rolling window with realistic scenarios."""

    @pytest.mark.asyncio
    async def test_full_workflow(self, sample_timestamp):
        """Test complete workflow: load, add samples, evict, invalidate."""
        # Setup
        mock_repo = AsyncMock()
        manager = RollingWindowManager(
            sample_repository=mock_repo,
            max_cached_windows=2,
            window_size=5
        )

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

        # Mock initial database samples
        mock_samples = []
        for i in range(3):
            mock_sample = MagicMock()
            mock_sample.id = i
            mock_sample.timestamp = sample_timestamp + timedelta(minutes=i)
            mock_measurement = MagicMock()
            mock_measurement.value = 100.0 + i
            mock_sample.measurements = [mock_measurement]
            mock_samples.append(mock_sample)

        mock_repo.get_rolling_window.return_value = mock_samples

        # 1. Load window
        window = await manager.get_window(char_id=1)
        window.set_boundaries(boundaries)
        assert window.size == 3

        # 2. Add new samples
        for i in range(3, 6):
            mock_sample = MagicMock()
            mock_sample.id = i
            mock_sample.timestamp = sample_timestamp + timedelta(minutes=i)
            mock_measurement = MagicMock()
            mock_measurement.value = 100.0 + i
            mock_sample.measurements = [mock_measurement]

            await manager.add_sample(
                char_id=1,
                sample=mock_sample,
                boundaries=boundaries
            )

        # Window should be at max size
        window = await manager.get_window(char_id=1)
        assert window.size == 5

        # 3. Add one more - should evict oldest
        mock_sample = MagicMock()
        mock_sample.id = 6
        mock_sample.timestamp = sample_timestamp + timedelta(minutes=6)
        mock_measurement = MagicMock()
        mock_measurement.value = 106.0
        mock_sample.measurements = [mock_measurement]

        await manager.add_sample(
            char_id=1,
            sample=mock_sample,
            boundaries=boundaries
        )

        window = await manager.get_window(char_id=1)
        assert window.size == 5
        samples = window.get_samples()
        assert samples[0].sample_id == 2  # First sample (id=0,1) evicted

        # 4. Invalidate and reload
        await manager.invalidate(char_id=1)
        assert manager.cache_size == 0

        # Reload - should fetch from DB again
        window = await manager.get_window(char_id=1)
        assert window.size == 3  # Original 3 samples from DB

    @pytest.mark.asyncio
    async def test_zone_boundaries_edge_cases(self):
        """Test zone classification at exact boundary values."""
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

        # Test exact boundary values
        test_cases = [
            (100.0, Zone.ZONE_C_UPPER),  # At center
            (102.0, Zone.ZONE_B_UPPER),  # At +1σ boundary
            (104.0, Zone.ZONE_A_UPPER),  # At +2σ boundary
            (106.0, Zone.BEYOND_UCL),    # At +3σ boundary (UCL)
            (98.0, Zone.ZONE_C_LOWER),   # At -1σ boundary
            (96.0, Zone.ZONE_B_LOWER),   # At -2σ boundary
            (94.0, Zone.BEYOND_LCL),     # At -3σ boundary (LCL)
        ]

        for value, expected_zone in test_cases:
            zone, _, _ = window.classify_value(value)
            assert zone == expected_zone, f"Failed for value {value}"


class TestModeAwareClassification:
    """Test mode-aware zone classification for variable subgroup sizes."""

    @pytest.fixture
    def window_with_boundaries(self, boundaries):
        """Window with boundaries set."""
        window = RollingWindow()
        window.set_boundaries(boundaries)
        return window

    def test_mode_a_zone_c_upper(self, window_with_boundaries):
        """Test Mode A classification: z=0.5 -> ZONE_C_UPPER."""
        zone, is_above, sigma_dist = window_with_boundaries.classify_value_for_mode(
            value=0.5,  # z-score
            mode="STANDARDIZED",
            actual_n=4,
        )
        assert zone == Zone.ZONE_C_UPPER
        assert is_above is True
        assert sigma_dist == pytest.approx(0.5)

    def test_mode_a_zone_b_upper(self, window_with_boundaries):
        """Test Mode A classification: z=1.5 -> ZONE_B_UPPER."""
        zone, is_above, sigma_dist = window_with_boundaries.classify_value_for_mode(
            value=1.5,
            mode="STANDARDIZED",
            actual_n=4,
        )
        assert zone == Zone.ZONE_B_UPPER
        assert is_above is True
        assert sigma_dist == pytest.approx(1.5)

    def test_mode_a_zone_a_upper(self, window_with_boundaries):
        """Test Mode A classification: z=2.5 -> ZONE_A_UPPER."""
        zone, is_above, sigma_dist = window_with_boundaries.classify_value_for_mode(
            value=2.5,
            mode="STANDARDIZED",
            actual_n=4,
        )
        assert zone == Zone.ZONE_A_UPPER
        assert is_above is True
        assert sigma_dist == pytest.approx(2.5)

    def test_mode_a_beyond_ucl(self, window_with_boundaries):
        """Test Mode A classification: z=3.5 -> BEYOND_UCL."""
        zone, is_above, sigma_dist = window_with_boundaries.classify_value_for_mode(
            value=3.5,
            mode="STANDARDIZED",
            actual_n=4,
        )
        assert zone == Zone.BEYOND_UCL
        assert is_above is True
        assert sigma_dist == pytest.approx(3.5)

    def test_mode_a_zone_c_lower(self, window_with_boundaries):
        """Test Mode A classification: z=-0.5 -> ZONE_C_LOWER."""
        zone, is_above, sigma_dist = window_with_boundaries.classify_value_for_mode(
            value=-0.5,
            mode="STANDARDIZED",
            actual_n=4,
        )
        assert zone == Zone.ZONE_C_LOWER
        assert is_above is False
        assert sigma_dist == pytest.approx(0.5)

    def test_mode_a_beyond_lcl(self, window_with_boundaries):
        """Test Mode A classification: z=-3.5 -> BEYOND_LCL."""
        zone, is_above, sigma_dist = window_with_boundaries.classify_value_for_mode(
            value=-3.5,
            mode="STANDARDIZED",
            actual_n=4,
        )
        assert zone == Zone.BEYOND_LCL
        assert is_above is False
        assert sigma_dist == pytest.approx(3.5)

    def test_mode_b_zone_with_variable_limits(self, window_with_boundaries):
        """Test Mode B classification with variable limits.

        Given: value=112, effective_ucl=115, effective_lcl=85, center=100, sigma=10, n=4
        sigma_xbar = 10/2 = 5
        Zone boundaries: C(100-105), B(105-110), A(110-115)
        112 is in Zone A upper (between 110 and 115)
        """
        zone, is_above, sigma_dist = window_with_boundaries.classify_value_for_mode(
            value=112.0,
            mode="VARIABLE_LIMITS",
            actual_n=4,
            stored_sigma=10.0,
            stored_center_line=100.0,
            effective_ucl=115.0,
            effective_lcl=85.0,
        )
        assert zone == Zone.ZONE_A_UPPER
        assert is_above is True
        # sigma_dist should be (112-100) / 5 = 2.4
        assert sigma_dist == pytest.approx(2.4)

    def test_mode_c_uses_stored_boundaries(self, window_with_boundaries):
        """Test Mode C uses standard classify_value behavior."""
        # Test that NOMINAL_TOLERANCE mode falls back to standard classification
        zone, is_above, sigma_dist = window_with_boundaries.classify_value_for_mode(
            value=103.0,
            mode="NOMINAL_TOLERANCE",
            actual_n=5,
        )
        assert zone == Zone.ZONE_B_UPPER
        assert is_above is True
        # sigma_dist based on boundaries: (103-100) / 2 = 1.5
        assert sigma_dist == pytest.approx(1.5)


class TestWindowSampleWithModeFields:
    """Test WindowSample dataclass with mode-specific fields."""

    def test_window_sample_stores_actual_n(self, sample_timestamp):
        """Test WindowSample stores actual_n field."""
        sample = WindowSample(
            sample_id=1,
            timestamp=sample_timestamp,
            value=100.0,
            range_value=None,
            zone=Zone.ZONE_C_UPPER,
            is_above_center=True,
            sigma_distance=0.5,
            actual_n=3,
        )
        assert sample.actual_n == 3

    def test_window_sample_stores_is_undersized(self, sample_timestamp):
        """Test WindowSample stores is_undersized field."""
        sample = WindowSample(
            sample_id=1,
            timestamp=sample_timestamp,
            value=100.0,
            range_value=None,
            zone=Zone.ZONE_C_UPPER,
            is_above_center=True,
            sigma_distance=0.5,
            is_undersized=True,
        )
        assert sample.is_undersized is True

    def test_window_sample_stores_z_score_for_mode_a(self, sample_timestamp):
        """Test WindowSample stores z_score for Mode A."""
        sample = WindowSample(
            sample_id=1,
            timestamp=sample_timestamp,
            value=100.0,
            range_value=None,
            zone=Zone.ZONE_C_UPPER,
            is_above_center=True,
            sigma_distance=0.5,
            z_score=1.5,
        )
        assert sample.z_score == 1.5

    def test_window_sample_stores_effective_limits_for_mode_b(self, sample_timestamp):
        """Test WindowSample stores effective_ucl/lcl for Mode B."""
        sample = WindowSample(
            sample_id=1,
            timestamp=sample_timestamp,
            value=100.0,
            range_value=None,
            zone=Zone.ZONE_C_UPPER,
            is_above_center=True,
            sigma_distance=0.5,
            effective_ucl=115.0,
            effective_lcl=85.0,
        )
        assert sample.effective_ucl == 115.0
        assert sample.effective_lcl == 85.0

    def test_window_sample_default_values(self, sample_timestamp):
        """Test WindowSample has correct default values for new fields."""
        sample = WindowSample(
            sample_id=1,
            timestamp=sample_timestamp,
            value=100.0,
            range_value=None,
            zone=Zone.ZONE_C_UPPER,
            is_above_center=True,
            sigma_distance=0.5,
        )
        assert sample.actual_n == 1
        assert sample.is_undersized is False
        assert sample.effective_ucl is None
        assert sample.effective_lcl is None
        assert sample.z_score is None
