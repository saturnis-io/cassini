# Rolling Window Manager Implementation - BE-004

## Overview

This implementation provides an in-memory rolling window manager for SPC (Statistical Process Control) control charts with zone classification, LRU caching, and database lazy loading.

## Files Created

### 1. Core Implementation
**File:** `backend/src/openspc/core/engine/rolling_window.py`

Contains:
- `Zone` enum - 8 zone classifications (Beyond UCL/LCL, Zones A/B/C upper/lower)
- `WindowSample` dataclass - Cached sample with zone classification
- `ZoneBoundaries` dataclass - Zone boundaries with sigma value (extends base class)
- `RollingWindow` class - Fixed-size FIFO window with zone classification
- `RollingWindowManager` class - LRU cache manager for multiple characteristics

### 2. Unit Tests
**File:** `backend/tests/unit/test_rolling_window.py`

Comprehensive test coverage including:
- Window initialization and validation
- FIFO eviction behavior
- All zone classifications
- Boundary reclassification
- LRU cache eviction
- Thread safety with async locks
- Integration tests

### 3. Demonstrations
**File:** `backend/examples/rolling_window_demo.py`

Five comprehensive demos showing:
1. Basic rolling window usage
2. FIFO eviction when full
3. Zone classification for all zones
4. Async rolling window manager operations
5. LRU cache eviction behavior

## Features Implemented

### RollingWindow Class

#### Core Functionality
- **Fixed-size window** with configurable `max_size` (default: 25)
- **FIFO eviction** - oldest sample removed when window is full
- **Chronological ordering** - samples stored oldest-first
- **Zone classification** - automatic classification on add/update

#### Methods
- `append(sample)` - Add sample, returns evicted sample if full
- `get_samples()` - Get all samples (oldest first)
- `get_recent(n)` - Get last n samples (newest first)
- `set_boundaries(boundaries)` - Set/update boundaries, reclassify all
- `classify_value(value)` - Classify a value into zone
- `clear()` - Remove all samples
- `is_ready` - Property indicating if boundaries are set

### Zone Classification

Eight zones based on sigma distance from center:
- **BEYOND_UCL** - > 3σ above center
- **ZONE_A_UPPER** - 2-3σ above center
- **ZONE_B_UPPER** - 1-2σ above center
- **ZONE_C_UPPER** - 0-1σ above center
- **ZONE_C_LOWER** - 0-1σ below center
- **ZONE_B_LOWER** - 1-2σ below center
- **ZONE_A_LOWER** - 2-3σ below center
- **BEYOND_LCL** - > 3σ below center

### RollingWindowManager Class

#### Core Functionality
- **LRU caching** - Maintains up to `max_cached_windows` (default: 1000)
- **Lazy loading** - Loads from database on first access
- **Thread-safe** - Uses asyncio.Lock per characteristic
- **Automatic eviction** - Removes LRU window when cache full

#### Methods
- `get_window(char_id)` - Get or load window (async)
- `add_sample(char_id, sample, boundaries)` - Add new sample (async)
- `invalidate(char_id)` - Clear window from cache (async)
- `update_boundaries(char_id, boundaries)` - Update and reclassify (async)

## Usage Examples

### Basic Window Usage

```python
from openspc.core.engine.rolling_window import (
    RollingWindow,
    WindowSample,
    Zone,
    ZoneBoundaries,
)
from datetime import datetime

# Create window
window = RollingWindow(max_size=25)

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

# Classify a value
zone, is_above, sigma_dist = window.classify_value(103.5)
print(f"Value 103.5: {zone.value} ({sigma_dist:.2f}σ from center)")

# Add sample
sample = WindowSample(
    sample_id=1,
    timestamp=datetime.now(),
    value=103.5,
    range_value=None,
    zone=zone,
    is_above_center=is_above,
    sigma_distance=sigma_dist
)
evicted = window.append(sample)

# Get recent samples
recent = window.get_recent(5)  # Last 5 samples, newest first
```

### Manager Usage

```python
from openspc.core.engine.rolling_window import (
    RollingWindowManager,
    ZoneBoundaries,
)

# Create manager (needs sample repository)
manager = RollingWindowManager(
    sample_repository=repo,
    max_cached_windows=1000,
    window_size=25
)

# Get window for characteristic (lazy loads from DB)
window = await manager.get_window(char_id=1)

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

# Add new sample
window_sample = await manager.add_sample(
    char_id=1,
    sample=new_sample,
    boundaries=boundaries
)

# Invalidate after sample exclusion
await manager.invalidate(char_id=1)

# Update boundaries and reclassify
await manager.update_boundaries(char_id=1, new_boundaries)
```

## Data Flow

1. **First Access**: `get_window(char_id)` → loads from DB via `SampleRepository.get_rolling_window()`
2. **Add Sample**: `add_sample()` → calculates mean/range → classifies → appends to window
3. **Full Window**: Oldest sample automatically evicted (FIFO)
4. **Cache Full**: LRU window evicted from cache
5. **Invalidation**: Window removed from cache, next access reloads from DB

## Integration Points

### Database Integration
- Uses `SampleRepository.get_rolling_window()` for lazy loading
- Respects `exclude_excluded` flag (filters out excluded samples)
- Converts `Sample` model to `WindowSample` with zone classification

### Statistics Integration
- Extends `ZoneBoundaries` from `openspc.utils.statistics`
- Compatible with control limit calculations
- Uses sigma distance for zone classification

### Future Integration (Nelson Rules Engine)
- `WindowSample.zone` provides classification for rule testing
- `get_recent(n)` supports sliding window patterns
- `is_above_center` simplifies trend detection

## Performance Characteristics

### Memory Usage
- O(W) per window, where W = window_size (default 25)
- O(C * W) total, where C = number of cached characteristics
- Max memory: `max_cached_windows * window_size * sizeof(WindowSample)`
- Example: 1000 windows * 25 samples ≈ 25,000 samples in memory

### Time Complexity
- Window access: O(1) average (hash map lookup)
- Add sample: O(1) (append to list)
- Get samples: O(W) (copy list)
- Classify value: O(1) (simple comparisons)
- LRU eviction: O(1) (OrderedDict)

### Thread Safety
- Per-characteristic async locks prevent race conditions
- Lock granularity allows concurrent access to different characteristics
- Lazy loading only happens once per characteristic

## Testing

### Run Unit Tests
```bash
cd backend
python -m pytest tests/unit/test_rolling_window.py -v
```

### Run Demonstrations
```bash
cd backend
python examples/rolling_window_demo.py
```

### Manual Verification
```bash
cd backend
python verify_rolling_window.py
```

## Test Coverage

The test suite covers:
- ✓ Window initialization with valid/invalid sizes
- ✓ FIFO eviction (oldest removed when full)
- ✓ All 8 zone classifications
- ✓ Boundary values (exact sigma boundaries)
- ✓ Reclassification on boundary changes
- ✓ LRU cache eviction
- ✓ Lazy loading from database
- ✓ Thread safety (concurrent access)
- ✓ Empty window handling
- ✓ Single vs multi-measurement samples
- ✓ Invalidation and reload

## Design Decisions

### 1. FIFO vs Priority Eviction
**Choice:** FIFO (First-In-First-Out)
**Rationale:** SPC charts naturally work with time-ordered data. Oldest samples become less relevant for recent process state.

### 2. In-Memory vs Database Storage
**Choice:** In-memory with lazy loading
**Rationale:** Fast access for real-time monitoring, database as source of truth. Cache invalidation on data changes.

### 3. Per-Characteristic vs Global Lock
**Choice:** Per-characteristic locks
**Rationale:** Better concurrency - different characteristics can be accessed simultaneously.

### 4. Zone Classification Strategy
**Choice:** Calculate on boundaries change, store in WindowSample
**Rationale:** Pre-calculated zones speed up Nelson Rules testing. Boundary changes are rare compared to reads.

### 5. ZoneBoundaries Inheritance
**Choice:** Extend existing ZoneBoundaries from statistics module
**Rationale:** Maintains compatibility, adds sigma field needed for classification, follows DRY principle.

### 6. Window Size Default
**Choice:** 25 samples
**Rationale:** Standard size for SPC charts, sufficient for Nelson Rules patterns, balances memory and statistical power.

## Acceptance Criteria Status

- ✓ Rolling window maintains FIFO order (oldest first)
- ✓ Zone boundaries calculated correctly (1, 2, 3 sigma)
- ✓ Window loads from database on first access
- ✓ LRU eviction triggers when cache exceeds max_cached
- ✓ Sample exclusion can invalidate and rebuild window
- ✓ Thread-safe with asyncio.Lock per characteristic
- ✓ classify_value() returns correct Zone enum

## Future Enhancements

1. **Metrics/Monitoring**
   - Cache hit/miss rates
   - Eviction frequency
   - Memory usage tracking

2. **Adaptive Window Sizing**
   - Adjust window size based on process stability
   - Support for variable-size windows per characteristic

3. **Persistence Strategy**
   - Configurable cache persistence
   - Warm cache on startup

4. **Advanced Eviction**
   - Time-based eviction (TTL)
   - Weighted LRU (by access frequency)

5. **Batch Operations**
   - Bulk sample addition
   - Batch boundary updates

## Dependencies

### Required
- Python 3.11+
- asyncio (standard library)
- dataclasses (standard library)
- collections.OrderedDict (standard library)

### Optional (for testing)
- pytest
- pytest-asyncio
- hypothesis (property-based testing)

## Related Files

- `backend/src/openspc/db/repositories/sample.py` - Sample repository with `get_rolling_window()`
- `backend/src/openspc/utils/statistics.py` - Base `ZoneBoundaries` class, statistical functions
- `backend/src/openspc/utils/constants.py` - SPC constants (d2, c4, etc.)
- `backend/src/openspc/db/models/sample.py` - Sample and Measurement models

## Notes

- The implementation is production-ready and fully tested
- All code follows type hints and Python 3.11+ best practices
- Comprehensive docstrings for all public APIs
- Examples demonstrate all major features
- Thread-safe for async/concurrent usage
