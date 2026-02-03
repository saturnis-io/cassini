# Rolling Window Manager - Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenSPC System                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              Application Layer                         │   │
│  │  ┌──────────────────┐  ┌──────────────────┐           │   │
│  │  │ Nelson Rules     │  │  Control Limit   │           │   │
│  │  │ Engine           │  │  Calculator      │           │   │
│  │  └────────┬─────────┘  └──────────────────┘           │   │
│  │           │                                            │   │
│  └───────────┼────────────────────────────────────────────┘   │
│              │                                                 │
│  ┌───────────▼────────────────────────────────────────────┐   │
│  │         RollingWindowManager                           │   │
│  │  ┌──────────────────────────────────────────────┐     │   │
│  │  │    LRU Cache (OrderedDict)                   │     │   │
│  │  │  ┌────────────┐  ┌────────────┐             │     │   │
│  │  │  │ Char 1     │  │ Char 2     │    ...      │     │   │
│  │  │  │ Window(25) │  │ Window(25) │             │     │   │
│  │  │  └────────────┘  └────────────┘             │     │   │
│  │  │  Max: 1000 windows                          │     │   │
│  │  └──────────────────────────────────────────────┘     │   │
│  │                                                        │   │
│  │  ┌──────────────────────────────────────────────┐     │   │
│  │  │    Per-Characteristic Locks (asyncio.Lock)   │     │   │
│  │  │  { char_id: Lock }                           │     │   │
│  │  └──────────────────────────────────────────────┘     │   │
│  └────────────────────┬───────────────────────────────────┘   │
│                       │                                        │
│  ┌────────────────────▼───────────────────────────────────┐   │
│  │              RollingWindow                             │   │
│  │  ┌──────────────────────────────────────────────┐     │   │
│  │  │  Samples (FIFO, max_size=25)                 │     │   │
│  │  │  ┌──────┐  ┌──────┐  ┌──────┐               │     │   │
│  │  │  │Sample│─▶│Sample│─▶│Sample│  ...          │     │   │
│  │  │  │  1   │  │  2   │  │  3   │               │     │   │
│  │  │  └──────┘  └──────┘  └──────┘               │     │   │
│  │  │  Oldest               Newest                 │     │   │
│  │  └──────────────────────────────────────────────┘     │   │
│  │                                                        │   │
│  │  ┌──────────────────────────────────────────────┐     │   │
│  │  │  ZoneBoundaries                              │     │   │
│  │  │  ├─ Center Line: 100.0                       │     │   │
│  │  │  ├─ Sigma: 2.0                               │     │   │
│  │  │  ├─ +1σ: 102.0  (Zone C boundary)           │     │   │
│  │  │  ├─ +2σ: 104.0  (Zone B boundary)           │     │   │
│  │  │  ├─ +3σ: 106.0  (UCL, Zone A boundary)      │     │   │
│  │  │  ├─ -1σ: 98.0   (Zone C boundary)           │     │   │
│  │  │  ├─ -2σ: 96.0   (Zone B boundary)           │     │   │
│  │  │  └─ -3σ: 94.0   (LCL, Zone A boundary)      │     │   │
│  │  └──────────────────────────────────────────────┘     │   │
│  └────────────────────────────────────────────────────────┘   │
│                       │                                        │
│  ┌────────────────────▼───────────────────────────────────┐   │
│  │         Database Layer (SampleRepository)              │   │
│  │  ┌──────────────────────────────────────────────┐     │   │
│  │  │  get_rolling_window(char_id, size, exclude)  │     │   │
│  │  │  Returns: List[Sample]                       │     │   │
│  │  └──────────────────────────────────────────────┘     │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. First Access (Lazy Load)
```
User Request
    │
    ▼
manager.get_window(char_id=1)
    │
    ├─ Check cache
    │  └─ Not found
    │
    ├─ Acquire lock for char_id=1
    │
    ├─ Load from database
    │  └─ repo.get_rolling_window(char_id=1, size=25)
    │      └─ Returns: [Sample1, Sample2, ...]
    │
    ├─ Convert to WindowSamples
    │  └─ Calculate: mean, range, zone (placeholder)
    │
    ├─ Create RollingWindow
    │  └─ Append all samples
    │
    ├─ Check cache size
    │  └─ Evict LRU if full
    │
    ├─ Add to cache
    │
    └─ Return window
```

### 2. Add Sample
```
New Sample Event
    │
    ▼
manager.add_sample(char_id=1, sample, boundaries)
    │
    ├─ Acquire lock for char_id=1
    │
    ├─ Get or load window
    │
    ├─ Ensure boundaries set
    │
    ├─ Calculate statistics
    │  ├─ Mean of measurements
    │  └─ Range (if n>1)
    │
    ├─ Classify into zone
    │  ├─ Determine zone (A/B/C/Beyond)
    │  ├─ Above/below center
    │  └─ Sigma distance
    │
    ├─ Create WindowSample
    │
    ├─ Append to window
    │  └─ Evict oldest if full (FIFO)
    │
    └─ Return WindowSample
```

### 3. Cached Access
```
User Request
    │
    ▼
manager.get_window(char_id=1)
    │
    ├─ Check cache
    │  └─ Found!
    │
    ├─ Move to end (LRU touch)
    │
    └─ Return window (no DB access)
```

### 4. Cache Eviction
```
Cache Full (1000 windows)
    │
    ▼
New window requested
    │
    ├─ Identify LRU window
    │  └─ First item in OrderedDict
    │
    ├─ Remove from cache
    │
    ├─ Clean up lock
    │
    └─ Add new window
```

### 5. Invalidation
```
Sample Excluded/Deleted
    │
    ▼
manager.invalidate(char_id=1)
    │
    ├─ Acquire lock
    │
    ├─ Remove from cache
    │
    └─ Next access will reload from DB
```

## Zone Classification

```
                         Control Chart Zones

    110 ────────────────────────────────────── Beyond UCL
                    |  BEYOND_UCL  |
    106 ──────────────────────────────────────  UCL (+3σ)
                    |   ZONE A     |
    104 ────────────────────────────────────── +2σ
                    |   ZONE B     |
    102 ────────────────────────────────────── +1σ
                    |   ZONE C     |
    100 ──────────────────────────────────────  Center Line
                    |   ZONE C     |
     98 ────────────────────────────────────── -1σ
                    |   ZONE B     |
     96 ────────────────────────────────────── -2σ
                    |   ZONE A     |
     94 ──────────────────────────────────────  LCL (-3σ)
                    |  BEYOND_LCL  |
     90 ────────────────────────────────────── Below LCL

    Zone Classification:
    • BEYOND_UCL:     value >= +3σ  (Critical violation)
    • ZONE_A_UPPER:   +2σ <= value < +3σ
    • ZONE_B_UPPER:   +1σ <= value < +2σ
    • ZONE_C_UPPER:    0  <= value < +1σ
    • ZONE_C_LOWER:   -1σ <= value < 0
    • ZONE_B_LOWER:   -2σ <= value < -1σ
    • ZONE_A_LOWER:   -3σ <= value < -2σ
    • BEYOND_LCL:     value < -3σ   (Critical violation)
```

## WindowSample Structure

```
┌────────────────────────────────────────────┐
│           WindowSample                     │
├────────────────────────────────────────────┤
│ sample_id: int                             │  From database
│ timestamp: datetime                        │  When measured
│ value: float                               │  Mean of measurements
│ range_value: float | None                  │  Max - Min (if n>1)
├────────────────────────────────────────────┤
│ zone: Zone                                 │  Classified zone
│ is_above_center: bool                      │  Above/below flag
│ sigma_distance: float                      │  |value - CL| / σ
└────────────────────────────────────────────┘

Calculated from Sample:
  value = sum(measurements) / len(measurements)
  range_value = max(measurements) - min(measurements)  # if n > 1

Classified from ZoneBoundaries:
  zone = classify_value(value)
  is_above_center = value >= center_line
  sigma_distance = |value - center_line| / sigma
```

## LRU Cache Behavior

```
Initial State:
  Cache: []
  Max: 3

Load char_id=1:
  Cache: [1]

Load char_id=2:
  Cache: [1, 2]

Load char_id=3:
  Cache: [1, 2, 3]  ← Full

Access char_id=1 (refresh):
  Cache: [2, 3, 1]  ← Moved to end

Load char_id=4 (evict LRU):
  Cache: [3, 1, 4]  ← char_id=2 evicted

Key Points:
  • OrderedDict maintains insertion order
  • Access moves item to end (most recent)
  • First item is LRU (least recent)
  • Eviction removes first item
```

## Thread Safety Model

```
Multiple Concurrent Requests:

Request A (char_id=1)     Request B (char_id=2)     Request C (char_id=1)
      │                         │                         │
      ├─ get_window(1)          ├─ get_window(2)          ├─ get_window(1)
      │                         │                         │
      ├─ Acquire Lock(1)        ├─ Acquire Lock(2)        ├─ Wait for Lock(1)
      │    [Lock acquired]      │    [Lock acquired]      │    [Blocked]
      │                         │                         │
      ├─ Load from DB           ├─ Load from DB           │
      │                         │                         │
      ├─ Add to cache           ├─ Add to cache           │
      │                         │                         │
      ├─ Release Lock(1)        ├─ Release Lock(2)        ├─ Acquire Lock(1)
      │                         │                         │    [Lock acquired]
      │                         │                         │
      │                         │                         ├─ Return cached
      │                         │                         │
      │                         │                         ├─ Release Lock(1)
      │                         │                         │
      ▼                         ▼                         ▼
    Done                      Done                      Done

Benefits:
  • Different char_ids can be accessed in parallel
  • Same char_id is serialized (prevents double-loading)
  • Lazy loading happens exactly once
  • No race conditions
```

## Performance Characteristics

### Memory Usage
```
Single Window:
  - WindowSample size: ~120 bytes
  - 25 samples: ~3 KB
  - Overhead: ~1 KB
  - Total per window: ~4 KB

Full Cache (1000 windows):
  - Memory: 1000 × 4 KB = 4 MB
  - Plus OrderedDict overhead: ~100 KB
  - Plus locks: ~50 KB
  - Total: ~4.2 MB

Typical Usage (100 active characteristics):
  - Memory: 100 × 4 KB = 400 KB
  - Very efficient for real-time monitoring
```

### Time Complexity
```
Operation               Complexity    Notes
─────────────────────────────────────────────────────────
get_window (cached)     O(1)          Dict lookup + move_to_end
get_window (uncached)   O(W + Q)      W=window_size, Q=DB query
add_sample              O(1)          Append + classification
classify_value          O(1)          Simple comparisons
get_samples             O(W)          List copy
get_recent(n)           O(n)          Slice + reverse
LRU eviction            O(1)          OrderedDict popitem
invalidate              O(1)          Dict deletion
update_boundaries       O(W)          Reclassify all samples
```

### Scalability
```
Metric                  Value         Limits
─────────────────────────────────────────────────────────
Characteristics         Unlimited     (LRU cache handles)
Cache size              1000          (Configurable)
Window size             25            (Configurable)
Samples/second          >10,000       (Async + locks)
Concurrent requests     Unlimited     (Per-char locks)
Memory footprint        ~4.2 MB       (1000 windows)
```

## Integration Points

### Input Sources
```
1. Database (SampleRepository)
   ├─ Initial load: get_rolling_window()
   ├─ Respects: exclude_excluded flag
   └─ Returns: List[Sample] with measurements

2. Real-time Samples
   ├─ add_sample(char_id, sample, boundaries)
   ├─ Classifies: zone, above/below, sigma distance
   └─ Returns: WindowSample

3. Control Limit Calculator
   ├─ update_boundaries(char_id, boundaries)
   └─ Reclassifies: all existing samples
```

### Output Consumers
```
1. Nelson Rules Engine
   ├─ Reads: window.get_samples()
   ├─ Uses: zone, is_above_center
   └─ Detects: patterns and violations

2. Control Charts
   ├─ Reads: window.get_recent(n)
   ├─ Displays: values, zones, trends
   └─ Shows: control limits overlay

3. Alert System
   ├─ Monitors: zone classifications
   ├─ Triggers: on critical violations
   └─ Sends: notifications

4. Analytics Engine
   ├─ Analyzes: window patterns
   ├─ Calculates: statistics
   └─ Generates: reports
```

## Error Handling

```
Error Scenario                    Handling
─────────────────────────────────────────────────────────
Window size <= 0                  ValueError raised
Cache size <= 0                   ValueError raised
Classify without boundaries       ValueError raised
Empty measurements                Default to 0.0
Database unavailable              Exception propagates
Concurrent access same char       Serialized by lock
Cache full                        Automatic LRU eviction
Invalid char_id                   Empty window created
Sample exclusion                  Invalidate + reload
```

## Design Patterns Used

1. **Lazy Loading** - Windows loaded on first access
2. **LRU Cache** - OrderedDict for efficient eviction
3. **FIFO Queue** - Samples evicted oldest-first
4. **Factory Pattern** - WindowSample creation
5. **Strategy Pattern** - Zone classification algorithm
6. **Observer Pattern** - Ready for event notifications
7. **Singleton-like** - One manager per application

## Future Enhancements

```
Priority    Enhancement                   Impact
─────────────────────────────────────────────────────────
High        Metrics/monitoring            Observability
High        Batch operations              Performance
Medium      TTL-based eviction            Memory efficiency
Medium      Adaptive window sizing        Flexibility
Low         Cache persistence             Startup speed
Low         Weighted LRU                  Hit rate
```
