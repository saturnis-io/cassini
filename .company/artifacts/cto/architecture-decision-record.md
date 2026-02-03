# OpenSPC Architecture Decision Records

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** CTO, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Approved

---

## ADR-001: Event-Driven Architecture

### Context
OpenSPC must handle two fundamentally different data sources:
1. **Automated Tags:** High-frequency machine data (potentially 100+ readings/second per tag)
2. **Manual Entry:** Sporadic operator data entry (1-10 entries/hour)

Both sources must trigger the same SPC analysis pipeline while maintaining low latency for real-time violation detection.

### Decision
Adopt an **event-driven architecture** with a unified sample event pipeline.

### Architecture Pattern
```
[Data Sources] --> [Normalized Sample Event] --> [SPC Engine] --> [Violation Events]
     |                      |                          |                |
   MQTT Tag            Pydantic Model            Nelson Rules       Alert Manager
   Manual POST          (immutable)             (stateless*)         (workflow)
```
*Stateless per invocation; rolling window state managed externally

### Rationale

1. **Decoupling:** Data ingestion is completely separated from analysis logic. Adding a new provider (e.g., OPC-UA, REST webhook) requires no changes to the SPC engine.

2. **Scalability:** Events can be queued and processed asynchronously. Under high load, the MQTT subscriber can buffer messages while the engine catches up.

3. **Auditability:** Every sample becomes an immutable event with a timestamp, enabling replay and forensic analysis.

4. **Real-Time Response:** Event-driven naturally supports push notifications to the UI via WebSocket when violations occur.

5. **Testability:** The SPC engine can be tested in isolation by injecting synthetic sample events.

### Consequences
- **Positive:** Clean separation of concerns, easier horizontal scaling
- **Negative:** Additional complexity in event ordering and idempotency
- **Mitigation:** Use sample timestamps for ordering; database constraints prevent duplicate samples

### Status
**Accepted**

---

## ADR-002: Provider Abstraction Design

### Context
The specification defines two provider types (Tag and Manual), but the system should be extensible for future data sources (OPC-UA, file import, REST webhooks).

### Decision
Implement a **Provider Protocol** (Python Protocol/ABC) that all data sources must implement.

### Design
```python
from typing import Protocol
from datetime import datetime

class SampleEvent(BaseModel):
    """Normalized sample event - the universal currency of the system"""
    characteristic_id: int
    timestamp: datetime
    measurements: list[float]  # Length = subgroup_size
    context: SampleContext  # batch_number, operator_id, etc.

class DataProvider(Protocol):
    """All providers must implement this interface"""

    async def start(self) -> None:
        """Begin listening/polling for data"""
        ...

    async def stop(self) -> None:
        """Gracefully shutdown"""
        ...

    def on_sample(self, callback: Callable[[SampleEvent], Awaitable[None]]) -> None:
        """Register callback for when a sample is ready"""
        ...
```

### Provider Implementations

#### Tag Provider
- Subscribes to MQTT topic from characteristic configuration
- **Trigger Strategies:**
  - `ON_CHANGE`: Emit sample when value changes beyond deadband
  - `ON_TRIGGER`: Emit sample when separate trigger tag transitions
  - `ON_TIMER`: Emit sample at fixed intervals (for averaging)
- **Buffering:** Accumulates readings until `subgroup_size` is reached
- **Timeout:** Configurable timeout to flush partial buffers

#### Manual Provider
- Exposes REST endpoint: `POST /api/characteristics/{id}/samples`
- Validates measurements against spec limits (USL/LSL) with warnings
- Single sample per submission (subgroup collected in one entry)

### Rationale

1. **Single Responsibility:** Each provider handles only its specific data acquisition logic.

2. **Dependency Inversion:** The SPC engine depends on the abstract `SampleEvent`, not concrete providers.

3. **Configuration-Driven:** Provider type is stored in the `characteristic` table, enabling runtime provider selection.

4. **Future Extensibility:** New providers (OPC-UA, Modbus, CSV import) can be added without modifying core engine.

### Consequences
- **Positive:** Clean extension point, testable in isolation
- **Negative:** Requires careful lifecycle management for provider start/stop
- **Mitigation:** Use FastAPI lifespan events for coordinated startup/shutdown

### Status
**Accepted**

---

## ADR-003: Rolling Window Implementation Strategy

### Context
Nelson Rules require analyzing patterns across consecutive samples (e.g., "9 points same side," "6 points trending"). This requires maintaining a "rolling window" of recent samples per characteristic.

### Decision
Implement a **hybrid in-memory + database rolling window** with lazy loading.

### Strategy

```
                    ┌─────────────────────────────────┐
                    │     In-Memory Rolling Window    │
                    │   (per characteristic, LRU)     │
                    │                                 │
   New Sample ──────►  [s15][s14][s13]...[s2][s1]    │
                    │        ▲                        │
                    │        │ Eviction to DB         │
                    └────────┼────────────────────────┘
                             │
                    ┌────────▼────────────────────────┐
                    │        SQLite Database          │
                    │   (persistent, queryable)       │
                    └─────────────────────────────────┘
```

### Implementation Details

1. **Window Size:** Configurable per characteristic, default 25 samples
   - Rule 7 (Stratification) requires 15 consecutive points
   - Rule 4 (Alternator) requires 14 consecutive points
   - Buffer of 10 provides margin for exclusions

2. **Data Structure:** `collections.deque` with `maxlen` for O(1) append/evict

3. **Lazy Loading:** On application restart or characteristic activation:
   ```python
   async def load_window(char_id: int, window_size: int = 25):
       return await db.execute(
           select(Sample)
           .where(Sample.char_id == char_id)
           .where(Sample.is_excluded == False)
           .order_by(Sample.timestamp.desc())
           .limit(window_size)
       )
   ```

4. **Memory Management:**
   - LRU cache of rolling windows (max 1000 characteristics in memory)
   - Inactive characteristics evicted after configurable timeout
   - Memory footprint: ~50 bytes/sample * 25 samples * 1000 chars = ~1.25 MB

5. **Exclusion Handling:**
   - When `is_excluded` is set on a sample, recalculate window
   - Fetch additional samples from DB to maintain window size

### Rationale

1. **Performance:** In-memory window provides sub-millisecond rule evaluation (critical for high-frequency tags).

2. **Durability:** All samples persisted to SQLite; window is reconstructable.

3. **Scalability:** LRU eviction prevents unbounded memory growth.

4. **Consistency:** Window always reflects non-excluded samples in timestamp order.

### Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| Pure DB queries | Simple, always consistent | 25x DB roundtrips per sample, latency |
| Redis sorted sets | Distributed, fast | Additional infrastructure, complexity |
| **Hybrid (chosen)** | Fast reads, durable writes | Restart delay, memory bounded |

### Consequences
- **Positive:** Fast rule evaluation, bounded memory
- **Negative:** Cold start requires DB queries; exclusion requires window rebuild
- **Mitigation:** Background window warm-up on startup; async exclusion handling

### Status
**Accepted**

---

## ADR-004: Real-Time UI Updates Strategy

### Context
The operator dashboard must display:
1. New samples as they arrive (chart updates)
2. Violation alerts (toast notifications)
3. Acknowledgment status changes (from other operators)

### Decision
Use **WebSocket push** for real-time updates with **REST fallback** for initial load and resilience.

### Architecture

```
┌──────────────┐     WebSocket      ┌──────────────┐
│   Browser    │◄──────────────────►│   FastAPI    │
│   (React)    │                    │   Server     │
└──────┬───────┘                    └──────┬───────┘
       │                                   │
       │  REST (initial load,              │ MQTT
       │  mutations, reconnect)            │ (tag data)
       │                                   │
       ▼                                   ▼
┌──────────────┐                    ┌──────────────┐
│   TanStack   │                    │     SPC      │
│    Query     │                    │    Engine    │
│   (cache)    │                    │              │
└──────────────┘                    └──────────────┘
```

### WebSocket Protocol

```typescript
// Server -> Client messages
type ServerMessage =
  | { type: 'sample', payload: Sample }
  | { type: 'violation', payload: Violation }
  | { type: 'ack_update', payload: AckUpdate }
  | { type: 'control_limits', payload: LimitUpdate }

// Client -> Server messages
type ClientMessage =
  | { type: 'subscribe', characteristicIds: number[] }
  | { type: 'unsubscribe', characteristicIds: number[] }
```

### Implementation Details

1. **Subscription Model:**
   - Client subscribes to specific characteristic IDs
   - Server maintains subscription map per connection
   - Broadcasts filtered by subscription

2. **Reconnection Strategy:**
   - Client: Exponential backoff (1s, 2s, 4s, max 30s)
   - On reconnect: Re-subscribe and fetch missed samples via REST

3. **TanStack Query Integration:**
   ```typescript
   // Optimistic update on WebSocket message
   queryClient.setQueryData(['samples', charId], (old) =>
     [...old, newSample].slice(-100)
   );
   ```

4. **Fallback Polling:**
   - If WebSocket fails 3 times, fall back to 5-second polling
   - Visual indicator shows degraded mode

### Rationale

1. **Low Latency:** WebSocket provides ~50ms update latency vs 5000ms polling.

2. **Bandwidth Efficiency:** Push only changed data, not full chart reload.

3. **Scalability:** Server can broadcast to many clients efficiently.

4. **Resilience:** REST fallback ensures functionality during network issues.

### Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| Polling (5s) | Simple, stateless | High latency, wasted bandwidth |
| Server-Sent Events | Simple push, auto-reconnect | Unidirectional, limited browser support |
| **WebSocket (chosen)** | Bidirectional, low latency | Connection management complexity |
| MQTT over WebSocket | Direct broker access | Exposes broker, security concerns |

### Consequences
- **Positive:** Real-time experience, efficient bandwidth
- **Negative:** Connection state management, reconnection logic
- **Mitigation:** Use established WebSocket libraries, implement heartbeat

### Status
**Accepted**

---

## ADR-005: Control Limit Calculation Approach

### Context
Control limits (UCL/LCL) define the process voice and must be calculated using proper statistical methods. The specification requires sigma estimation using R-bar/d2 or S/c4 methods.

### Decision
Support **both R-bar/d2 and S/c4 methods**, with automatic selection based on subgroup size.

### Statistical Background

**Problem:** Using population standard deviation (`numpy.std`) is incorrect for SPC because it includes both common cause and special cause variation. Control charts should reflect only common cause variation.

**Solution:** Estimate sigma from within-subgroup variation:

1. **R-bar/d2 Method** (Range-based)
   - Calculate range (R) within each subgroup
   - Average ranges: R-bar = mean(R)
   - Sigma estimate: σ = R-bar / d2
   - **Best for:** n = 2-10 (small subgroups)

2. **S/c4 Method** (Standard deviation-based)
   - Calculate standard deviation (S) within each subgroup
   - Average: S-bar = mean(S)
   - Sigma estimate: σ = S-bar / c4
   - **Best for:** n > 10 (larger subgroups)

3. **Individual-Moving Range (I-MR)** for n=1
   - Calculate moving range: MR = |x_i - x_{i-1}|
   - Average: MR-bar = mean(MR)
   - Sigma estimate: σ = MR-bar / d2 (where d2 = 1.128 for n=2)

### Implementation

```python
# Statistical constants (from ASTM E2587)
D2_TABLE = {2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, ...}
C4_TABLE = {2: 0.7979, 3: 0.8862, 4: 0.9213, 5: 0.9400, ...}

def estimate_sigma(samples: list[Sample], subgroup_size: int) -> float:
    """Estimate process sigma using appropriate method"""
    if subgroup_size == 1:
        # I-MR chart: use moving range
        values = [s.measurements[0] for s in samples]
        moving_ranges = [abs(values[i] - values[i-1]) for i in range(1, len(values))]
        mr_bar = np.mean(moving_ranges)
        return mr_bar / D2_TABLE[2]

    elif subgroup_size <= 10:
        # X-bar R chart: use range method
        ranges = [max(s.measurements) - min(s.measurements) for s in samples]
        r_bar = np.mean(ranges)
        return r_bar / D2_TABLE[subgroup_size]

    else:
        # X-bar S chart: use standard deviation method
        stdevs = [np.std(s.measurements, ddof=1) for s in samples]
        s_bar = np.mean(stdevs)
        return s_bar / C4_TABLE[subgroup_size]

def calculate_control_limits(samples: list[Sample], subgroup_size: int) -> tuple[float, float]:
    """Calculate UCL and LCL"""
    if subgroup_size == 1:
        x_bar = np.mean([s.measurements[0] for s in samples])
    else:
        x_bar = np.mean([np.mean(s.measurements) for s in samples])

    sigma = estimate_sigma(samples, subgroup_size)

    # A2 factor for X-bar chart (or E2 for individuals)
    A2 = 3 / (D2_TABLE[subgroup_size] * np.sqrt(subgroup_size)) if subgroup_size > 1 else 2.66

    ucl = x_bar + A2 * sigma * np.sqrt(subgroup_size)
    lcl = x_bar - A2 * sigma * np.sqrt(subgroup_size)

    return ucl, lcl
```

### Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `auto_recalculate` | false | Recalculate limits on each sample |
| `min_samples_for_calc` | 25 | Minimum samples before calculation |
| `exclude_violations` | true | Exclude out-of-control points from calculation |
| `method_override` | null | Force R-bar or S method regardless of n |

### Rationale

1. **Statistical Correctness:** Proper sigma estimation prevents artificially wide/narrow limits.

2. **Flexibility:** Support both methods for different manufacturing contexts.

3. **Automation:** Default method selection based on subgroup size reduces configuration burden.

4. **Transparency:** Store calculation method and inputs for audit trail.

### Consequences
- **Positive:** Statistically valid limits, auditable calculations
- **Negative:** More complex than simple standard deviation
- **Mitigation:** Comprehensive test suite with known reference values

### Status
**Accepted**

---

## ADR-006: Database Design for ISA-95 Hierarchy

### Context
The specification requires ISA-95 hierarchy support (Site -> Area -> Line -> Cell -> Unit). This must be queryable, extensible, and performant.

### Decision
Use **adjacency list** pattern with **materialized path** optimization.

### Schema Enhancement
```sql
CREATE TABLE hierarchy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('Site', 'Area', 'Line', 'Cell', 'Unit')),

    -- Materialized path for fast queries
    path TEXT NOT NULL,  -- e.g., "/1/2/5/"
    depth INTEGER NOT NULL,

    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(parent_id) REFERENCES hierarchy(id)
);

-- Index for path queries
CREATE INDEX idx_hierarchy_path ON hierarchy(path);
```

### Query Patterns

```python
# Get all children of a node (recursive)
async def get_descendants(node_id: int):
    node = await get_node(node_id)
    return await db.execute(
        select(Hierarchy)
        .where(Hierarchy.path.like(f"{node.path}%"))
        .where(Hierarchy.id != node_id)
    )

# Get all characteristics for a subtree
async def get_characteristics_for_hierarchy(node_id: int):
    descendants = await get_descendants(node_id)
    ids = [d.id for d in descendants] + [node_id]
    return await db.execute(
        select(Characteristic)
        .where(Characteristic.hierarchy_id.in_(ids))
    )
```

### Rationale

1. **Query Performance:** Materialized path enables LIKE queries for subtree without recursive CTEs.

2. **SQLite Compatibility:** Avoids recursive CTE limitations in older SQLite versions.

3. **Flexibility:** Adjacency list maintains referential integrity; path is denormalized for reads.

4. **Depth Limiting:** ISA-95 has max 5 levels, so path length is bounded.

### Status
**Accepted**

---

## Summary of Decisions

| ADR | Decision | Key Benefit |
|-----|----------|-------------|
| ADR-001 | Event-Driven Architecture | Decoupling, scalability |
| ADR-002 | Provider Protocol Abstraction | Extensibility, testability |
| ADR-003 | Hybrid Rolling Window | Performance + durability |
| ADR-004 | WebSocket + REST Fallback | Real-time + resilience |
| ADR-005 | R-bar/d2 and S/c4 Methods | Statistical correctness |
| ADR-006 | Adjacency List + Materialized Path | Query performance |

---

*All decisions approved for implementation. Review quarterly or when significant changes arise.*
