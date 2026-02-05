"""Rolling window manager for SPC control charts.

This module provides in-memory caching of recent samples with zone classification,
LRU eviction, and lazy loading from the database.

Key features:
- Fixed-size rolling window with FIFO eviction
- Zone classification (A, B, C, Beyond) for each sample
- LRU cache manager for multiple characteristics
- Thread-safe async operations with per-characteristic locks
- Lazy loading from database on first access
"""

import asyncio
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from openspc.utils.statistics import ZoneBoundaries as BaseZoneBoundaries

if TYPE_CHECKING:
    from openspc.db.models.sample import Sample
    from openspc.db.repositories.sample import SampleRepository


class Zone(Enum):
    """Zone classification for control chart samples.

    Zones are defined relative to the center line using sigma distances:
    - Beyond UCL/LCL: Greater than 3σ from center
    - Zone A: Between 2σ and 3σ from center
    - Zone B: Between 1σ and 2σ from center
    - Zone C: Between 0σ and 1σ from center
    """
    BEYOND_UCL = "beyond_ucl"      # > 3σ above
    ZONE_A_UPPER = "zone_a_upper"  # 2-3σ above
    ZONE_B_UPPER = "zone_b_upper"  # 1-2σ above
    ZONE_C_UPPER = "zone_c_upper"  # 0-1σ above
    ZONE_C_LOWER = "zone_c_lower"  # 0-1σ below
    ZONE_B_LOWER = "zone_b_lower"  # 1-2σ below
    ZONE_A_LOWER = "zone_a_lower"  # 2-3σ below
    BEYOND_LCL = "beyond_lcl"      # > 3σ below


@dataclass
class WindowSample:
    """Sample stored in rolling window with zone classification.

    Attributes:
        sample_id: Database ID of the sample
        timestamp: When the sample was taken
        value: Sample value (mean of measurements for subgroups)
        range_value: Range value for subgroups (n>1), None for individuals
        zone: Zone classification relative to control limits
        is_above_center: True if value is above center line
        sigma_distance: Absolute distance from center in sigma units
        actual_n: Actual number of measurements in this sample
        is_undersized: Whether sample has fewer measurements than expected
        effective_ucl: Per-point UCL for Mode B (variable limits)
        effective_lcl: Per-point LCL for Mode B (variable limits)
        z_score: Z-score for Mode A (standardized)
    """
    sample_id: int
    timestamp: datetime
    value: float
    range_value: float | None
    zone: Zone
    is_above_center: bool
    sigma_distance: float
    actual_n: int = 1
    is_undersized: bool = False
    effective_ucl: float | None = None
    effective_lcl: float | None = None
    z_score: float | None = None


@dataclass
class ZoneBoundaries(BaseZoneBoundaries):
    """Zone boundaries for control chart classification with sigma value.

    Extends the base ZoneBoundaries from openspc.utils.statistics to add
    the sigma field needed for zone classification calculations.

    Attributes:
        center_line: Center line (process mean)
        plus_1_sigma: Center line + 1σ
        plus_2_sigma: Center line + 2σ
        plus_3_sigma: Center line + 3σ (UCL)
        minus_1_sigma: Center line - 1σ
        minus_2_sigma: Center line - 2σ
        minus_3_sigma: Center line - 3σ (LCL)
        sigma: Process standard deviation
    """
    sigma: float


class RollingWindow:
    """Maintains a fixed-size window of recent samples with zone classification.

    The window maintains samples in chronological order (oldest first) and
    automatically evicts the oldest sample when full. All samples are
    classified into zones based on their distance from the center line.

    Args:
        max_size: Maximum number of samples to retain (default: 25)

    Example:
        >>> boundaries = ZoneBoundaries(
        ...     center_line=100.0,
        ...     sigma=2.0,
        ...     plus_1_sigma=102.0,
        ...     plus_2_sigma=104.0,
        ...     plus_3_sigma=106.0,
        ...     minus_1_sigma=98.0,
        ...     minus_2_sigma=96.0,
        ...     minus_3_sigma=94.0
        ... )
        >>> window = RollingWindow(max_size=25)
        >>> window.set_boundaries(boundaries)
        >>> sample = WindowSample(
        ...     sample_id=1,
        ...     timestamp=datetime.utcnow(),
        ...     value=103.0,
        ...     range_value=None,
        ...     zone=Zone.ZONE_B_UPPER,
        ...     is_above_center=True,
        ...     sigma_distance=1.5
        ... )
        >>> evicted = window.append(sample)
    """

    def __init__(self, max_size: int = 25):
        """Initialize rolling window.

        Args:
            max_size: Maximum number of samples to retain

        Raises:
            ValueError: If max_size is less than 1
        """
        if max_size < 1:
            raise ValueError(f"max_size must be at least 1, got {max_size}")

        self._samples: list[WindowSample] = []
        self._max_size = max_size
        self._boundaries: ZoneBoundaries | None = None

    def append(self, sample: WindowSample) -> WindowSample | None:
        """Add sample to window, evicting oldest if full.

        Args:
            sample: WindowSample to add

        Returns:
            Evicted sample if window was full, None otherwise
        """
        evicted = None

        if len(self._samples) >= self._max_size:
            evicted = self._samples.pop(0)  # Remove oldest (FIFO)

        self._samples.append(sample)
        return evicted

    def get_samples(self) -> list[WindowSample]:
        """Return all samples in chronological order (oldest first).

        Returns:
            List of WindowSample objects ordered by timestamp
        """
        return self._samples.copy()

    def get_recent(self, n: int) -> list[WindowSample]:
        """Return last n samples in reverse chronological order (most recent first).

        Args:
            n: Number of recent samples to return

        Returns:
            List of up to n most recent samples (newest first)
        """
        return list(reversed(self._samples[-n:]))

    def set_boundaries(self, boundaries: ZoneBoundaries) -> None:
        """Set zone boundaries and reclassify all samples.

        Args:
            boundaries: Zone boundaries for classification
        """
        self._boundaries = boundaries

        # Reclassify all existing samples
        for sample in self._samples:
            zone, is_above, sigma_dist = self.classify_value(sample.value)
            sample.zone = zone
            sample.is_above_center = is_above
            sample.sigma_distance = sigma_dist

    def classify_value(self, value: float) -> tuple[Zone, bool, float]:
        """Classify a value into zone, above/below center, and sigma distance.

        Args:
            value: Value to classify

        Returns:
            Tuple of (Zone, is_above_center, sigma_distance)

        Raises:
            ValueError: If boundaries have not been set
        """
        if self._boundaries is None:
            raise ValueError("Boundaries must be set before classifying values")

        b = self._boundaries
        is_above = value >= b.center_line
        sigma_distance = abs(value - b.center_line) / b.sigma

        # Classify into zones based on value position
        if value >= b.plus_3_sigma:
            zone = Zone.BEYOND_UCL
        elif value >= b.plus_2_sigma:
            zone = Zone.ZONE_A_UPPER
        elif value >= b.plus_1_sigma:
            zone = Zone.ZONE_B_UPPER
        elif value >= b.center_line:
            zone = Zone.ZONE_C_UPPER
        elif value >= b.minus_1_sigma:
            zone = Zone.ZONE_C_LOWER
        elif value >= b.minus_2_sigma:
            zone = Zone.ZONE_B_LOWER
        elif value >= b.minus_3_sigma:
            zone = Zone.ZONE_A_LOWER
        else:
            zone = Zone.BEYOND_LCL

        return zone, is_above, sigma_distance

    def classify_value_for_mode(
        self,
        value: float,
        mode: str,
        actual_n: int,
        stored_sigma: float | None = None,
        stored_center_line: float | None = None,
        effective_ucl: float | None = None,
        effective_lcl: float | None = None,
    ) -> tuple[Zone, bool, float]:
        """Classify a value into zone based on subgroup mode.

        For STANDARDIZED mode: value IS the z_score, classify into fixed zones.
        For VARIABLE_LIMITS mode: Use effective_ucl/lcl for zone boundaries.
        For NOMINAL_TOLERANCE mode: Use standard classify_value().

        Args:
            value: Value to classify (mean for Mode B/C, z_score for Mode A)
            mode: Subgroup mode (STANDARDIZED, VARIABLE_LIMITS, NOMINAL_TOLERANCE)
            actual_n: Actual number of measurements
            stored_sigma: Stored sigma for the characteristic
            stored_center_line: Stored center line for the characteristic
            effective_ucl: Per-point UCL for Mode B
            effective_lcl: Per-point LCL for Mode B

        Returns:
            Tuple of (Zone, is_above_center, sigma_distance)
        """
        if mode == "STANDARDIZED":
            # Mode A: value is the z_score, classify into fixed zones at +/-1, +/-2, +/-3
            z = value
            is_above = z >= 0
            sigma_distance = abs(z)

            if z >= 3.0:
                zone = Zone.BEYOND_UCL
            elif z >= 2.0:
                zone = Zone.ZONE_A_UPPER
            elif z >= 1.0:
                zone = Zone.ZONE_B_UPPER
            elif z >= 0:
                zone = Zone.ZONE_C_UPPER
            elif z >= -1.0:
                zone = Zone.ZONE_C_LOWER
            elif z >= -2.0:
                zone = Zone.ZONE_B_LOWER
            elif z >= -3.0:
                zone = Zone.ZONE_A_LOWER
            else:
                zone = Zone.BEYOND_LCL

            return zone, is_above, sigma_distance

        elif mode == "VARIABLE_LIMITS" and effective_ucl is not None and effective_lcl is not None:
            # Mode B: Use effective limits and stored center/sigma
            if stored_center_line is None or stored_sigma is None:
                # Fallback to standard classification
                return self.classify_value(value)

            import math
            sigma_xbar = stored_sigma / math.sqrt(actual_n)
            is_above = value >= stored_center_line
            sigma_distance = abs(value - stored_center_line) / sigma_xbar

            # Calculate zone boundaries based on effective limits
            zone_1_upper = stored_center_line + 1 * sigma_xbar
            zone_2_upper = stored_center_line + 2 * sigma_xbar
            zone_1_lower = stored_center_line - 1 * sigma_xbar
            zone_2_lower = stored_center_line - 2 * sigma_xbar

            if value >= effective_ucl:
                zone = Zone.BEYOND_UCL
            elif value >= zone_2_upper:
                zone = Zone.ZONE_A_UPPER
            elif value >= zone_1_upper:
                zone = Zone.ZONE_B_UPPER
            elif value >= stored_center_line:
                zone = Zone.ZONE_C_UPPER
            elif value >= zone_1_lower:
                zone = Zone.ZONE_C_LOWER
            elif value >= zone_2_lower:
                zone = Zone.ZONE_B_LOWER
            elif value >= effective_lcl:
                zone = Zone.ZONE_A_LOWER
            else:
                zone = Zone.BEYOND_LCL

            return zone, is_above, sigma_distance

        else:
            # Mode C (NOMINAL_TOLERANCE) or fallback: Use standard classification
            return self.classify_value(value)

    def clear(self) -> None:
        """Clear all samples (for invalidation)."""
        self._samples.clear()

    @property
    def is_ready(self) -> bool:
        """True if window has boundaries set and can classify samples."""
        return self._boundaries is not None

    @property
    def size(self) -> int:
        """Current number of samples in window."""
        return len(self._samples)

    @property
    def max_size(self) -> int:
        """Maximum capacity of window."""
        return self._max_size


class RollingWindowManager:
    """Manages rolling windows for multiple characteristics with LRU caching.

    This manager maintains an in-memory cache of rolling windows for different
    characteristics, with LRU eviction when the cache grows too large. Windows
    are lazily loaded from the database on first access.

    Thread-safety is ensured through per-characteristic async locks.

    Args:
        sample_repository: Repository for loading samples from database
        max_cached_windows: Maximum number of windows to cache (default: 1000)
        window_size: Size of each rolling window (default: 25)

    Example:
        >>> manager = RollingWindowManager(
        ...     sample_repository=repo,
        ...     max_cached_windows=1000,
        ...     window_size=25
        ... )
        >>> window = await manager.get_window(char_id=1)
        >>> await manager.add_sample(char_id=1, sample=new_sample, boundaries=bounds)
    """

    def __init__(
        self,
        sample_repository: "SampleRepository",
        max_cached_windows: int = 1000,
        window_size: int = 25
    ):
        """Initialize rolling window manager.

        Args:
            sample_repository: Repository for database operations
            max_cached_windows: Maximum number of windows to cache
            window_size: Size of each rolling window

        Raises:
            ValueError: If max_cached_windows or window_size is less than 1
        """
        if max_cached_windows < 1:
            raise ValueError(f"max_cached_windows must be at least 1, got {max_cached_windows}")
        if window_size < 1:
            raise ValueError(f"window_size must be at least 1, got {window_size}")

        self._repo = sample_repository
        self._cache: OrderedDict[int, RollingWindow] = OrderedDict()
        self._max_cached = max_cached_windows
        self._window_size = window_size
        self._locks: dict[int, asyncio.Lock] = {}

    def _get_lock(self, char_id: int) -> asyncio.Lock:
        """Get or create lock for a characteristic.

        Args:
            char_id: Characteristic ID

        Returns:
            Async lock for the characteristic
        """
        if char_id not in self._locks:
            self._locks[char_id] = asyncio.Lock()
        return self._locks[char_id]

    def _evict_lru(self) -> None:
        """Evict least recently used window if cache is full.

        Uses OrderedDict to maintain LRU order. The first item is the
        least recently used.
        """
        if len(self._cache) >= self._max_cached:
            # Remove the first (oldest) item
            evicted_char_id, _ = self._cache.popitem(last=False)

            # Clean up the lock if it exists
            if evicted_char_id in self._locks:
                del self._locks[evicted_char_id]

    def _touch_window(self, char_id: int) -> None:
        """Mark window as recently used (move to end of LRU order).

        Args:
            char_id: Characteristic ID
        """
        if char_id in self._cache:
            # Move to end (most recently used position)
            self._cache.move_to_end(char_id)

    async def _load_window_from_db(self, char_id: int) -> RollingWindow:
        """Load rolling window from database.

        Args:
            char_id: Characteristic ID

        Returns:
            RollingWindow populated with samples from database
        """
        window = RollingWindow(max_size=self._window_size)

        # Load sample data with measurement values pre-extracted
        # (avoids lazy loading issues in async contexts)
        sample_data = await self._repo.get_rolling_window_data(
            char_id=char_id,
            window_size=self._window_size,
            exclude_excluded=True
        )

        # Convert to WindowSample objects
        # Note: Boundaries will need to be set separately by the caller
        for data in sample_data:
            values = data["values"]
            value = sum(values) / len(values) if values else 0.0

            # Calculate range for subgroups (n > 1)
            range_value = None
            if len(values) > 1:
                range_value = max(values) - min(values)

            # Create WindowSample with placeholder zone info
            # (will be reclassified when boundaries are set)
            window_sample = WindowSample(
                sample_id=data["sample_id"],
                timestamp=data["timestamp"],
                value=value,
                range_value=range_value,
                zone=Zone.ZONE_C_UPPER,  # Placeholder
                is_above_center=True,     # Placeholder
                sigma_distance=0.0        # Placeholder
            )

            window.append(window_sample)

        return window

    async def get_window(self, char_id: int) -> RollingWindow:
        """Get or load rolling window for characteristic.

        This method is thread-safe and uses LRU caching. If the window
        is not in cache, it will be loaded from the database.

        Args:
            char_id: Characteristic ID

        Returns:
            RollingWindow for the characteristic
        """
        async with self._get_lock(char_id):
            # Check if window is in cache
            if char_id in self._cache:
                self._touch_window(char_id)
                return self._cache[char_id]

            # Load from database
            window = await self._load_window_from_db(char_id)

            # Evict LRU if necessary
            self._evict_lru()

            # Add to cache
            self._cache[char_id] = window

            return window

    async def add_sample(
        self,
        char_id: int,
        sample: "Sample",
        boundaries: ZoneBoundaries,
        measurement_values: list[float] | None = None,
        subgroup_mode: str | None = None,
        actual_n: int | None = None,
        is_undersized: bool = False,
        z_score: float | None = None,
        effective_ucl: float | None = None,
        effective_lcl: float | None = None,
        stored_sigma: float | None = None,
        stored_center_line: float | None = None,
    ) -> WindowSample:
        """Add a new sample to the window.

        Args:
            char_id: Characteristic ID
            sample: Database Sample object
            boundaries: Zone boundaries for classification
            measurement_values: Optional pre-loaded measurement values to avoid
                lazy loading. If not provided, will access sample.measurements.
            subgroup_mode: Subgroup handling mode (STANDARDIZED, VARIABLE_LIMITS, NOMINAL_TOLERANCE)
            actual_n: Actual number of measurements
            is_undersized: Whether sample has fewer measurements than expected
            z_score: Z-score for Mode A (standardized)
            effective_ucl: Per-point UCL for Mode B (variable limits)
            effective_lcl: Per-point LCL for Mode B (variable limits)
            stored_sigma: Stored sigma for the characteristic
            stored_center_line: Stored center line for the characteristic

        Returns:
            WindowSample that was added
        """
        async with self._get_lock(char_id):
            # Get or create window
            if char_id not in self._cache:
                window = await self._load_window_from_db(char_id)
                self._evict_lru()
                self._cache[char_id] = window
            else:
                window = self._cache[char_id]
                self._touch_window(char_id)

            # Ensure boundaries are set
            if not window.is_ready:
                window.set_boundaries(boundaries)

            # Use provided values or extract from sample (may cause lazy loading)
            if measurement_values is not None:
                values = measurement_values
            else:
                values = [m.value for m in sample.measurements]

            # Calculate sample value (mean of measurements)
            value = sum(values) / len(values) if values else 0.0

            # Calculate range for subgroups (n > 1)
            range_value = None
            if len(values) > 1:
                range_value = max(values) - min(values)

            # Set actual_n if not provided
            if actual_n is None:
                actual_n = len(values)

            # Classify the value based on mode
            if subgroup_mode and subgroup_mode != "NOMINAL_TOLERANCE":
                # For Mode A: classify the z_score, for Mode B: use effective limits
                classify_value = z_score if subgroup_mode == "STANDARDIZED" else value
                zone, is_above, sigma_dist = window.classify_value_for_mode(
                    value=classify_value if classify_value is not None else value,
                    mode=subgroup_mode,
                    actual_n=actual_n,
                    stored_sigma=stored_sigma,
                    stored_center_line=stored_center_line,
                    effective_ucl=effective_ucl,
                    effective_lcl=effective_lcl,
                )
            else:
                # Mode C or default: Use standard classification
                zone, is_above, sigma_dist = window.classify_value(value)

            # Create WindowSample with mode-specific fields
            window_sample = WindowSample(
                sample_id=sample.id,
                timestamp=sample.timestamp,
                value=value,
                range_value=range_value,
                zone=zone,
                is_above_center=is_above,
                sigma_distance=sigma_dist,
                actual_n=actual_n,
                is_undersized=is_undersized,
                effective_ucl=effective_ucl,
                effective_lcl=effective_lcl,
                z_score=z_score,
            )

            # Add to window
            window.append(window_sample)

            return window_sample

    async def invalidate(self, char_id: int) -> None:
        """Invalidate window (e.g., after sample exclusion).

        This clears the window from cache, forcing a reload on next access.

        Args:
            char_id: Characteristic ID
        """
        async with self._get_lock(char_id):
            if char_id in self._cache:
                del self._cache[char_id]

    async def update_boundaries(
        self,
        char_id: int,
        boundaries: ZoneBoundaries
    ) -> None:
        """Update zone boundaries and reclassify all samples.

        Args:
            char_id: Characteristic ID
            boundaries: New zone boundaries
        """
        async with self._get_lock(char_id):
            if char_id in self._cache:
                window = self._cache[char_id]
                window.set_boundaries(boundaries)
                self._touch_window(char_id)

    @property
    def cache_size(self) -> int:
        """Current number of cached windows."""
        return len(self._cache)

    @property
    def max_cached_windows(self) -> int:
        """Maximum number of windows that can be cached."""
        return self._max_cached
