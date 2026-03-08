# Snapshot Time Travel for SPC — Research & Feasibility Analysis

**Date**: 2026-03-07
**Type**: Research (no code changes)
**Status**: Draft

---

## 1. What "Time Travel" Means for SPC

### 1.1 Definition

Snapshot Time Travel is the ability to reconstruct the **complete process state** for any characteristic as it existed at any historical date. This means not just the measurement data (which is already timestamped), but the **configuration envelope** that surrounded that data: control limits, spec limits, Nelson rule settings, distribution parameters, anomaly detection config, and capability indices.

The fundamental question being answered: **"If I had looked at this chart on February 15th, what would I have seen?"**

### 1.2 Concrete Use Cases

| Use Case | Who Needs It | What They See |
|----------|-------------|---------------|
| **Historical chart view** | Engineer, Auditor | "Show me the control chart for characteristic X as it looked on Feb 15th" — with the UCL/LCL/CL, rules, and data window that existed then |
| **Point-in-time capability** | Engineer, Management | "What was the Cpk on this date?" — using the spec limits, sigma, and distribution method active at that time |
| **Spec limit change impact** | Engineer, Quality Manager | "When did the spec limits change from +/-0.005 to +/-0.003, and how did that affect capability?" — side-by-side comparison |
| **Configuration diff** | Engineer, Auditor | "What changed between Jan 1 and Mar 1?" — list of all config changes with before/after values |
| **Two-date comparison** | Management, Engineer | "Compare the process state between two dates" — split-view showing charts, capability, rules side by side |
| **Chart evolution replay** | Training, Root Cause Analysis | "Replay the evolution of this control chart over the past 6 months" — animated playback showing limit recalculations, rule changes |
| **Incident reconstruction** | CAPA investigator | "What was the process configuration when lot #12345 was produced?" — full state at production timestamp |
| **Audit snapshot** | Auditor (FDA, AS9100) | "Show the process was in control during Q4 2025" — immutable record of the state at that time |

### 1.3 Stakeholders

- **Quality Engineers**: Root cause analysis — "what changed before things went wrong?"
- **Auditors (internal & external)**: Regulatory compliance — "prove the process was in control at time X"
- **CAPA Investigators**: Incident response — reconstruct conditions at time of non-conformance
- **Management**: Trend analysis — "show me how process capability has improved over the past year"
- **Training**: Demonstrate how process improvements (limit tightening, rule changes) affected performance
- **Regulatory Inspectors**: FDA, AS9100, IATF 16949 — require ability to reconstruct historical process state

---

## 2. What Needs Versioning vs. What Doesn't

### 2.1 Versioning Priority Matrix

| Entity | Needs Versioning? | Why | Change Frequency | Current State |
|--------|-------------------|-----|------------------|---------------|
| **Control limits (UCL, LCL, CL)** | **YES — Critical** | Recalculated on demand; old limits define "in control" for historical data | Medium (monthly-ish) | Overwritten in-place on `characteristic` table. `ControlLimitsUpdatedEvent` fires but audit log only captures new values, not old |
| **Stored sigma / center line** | **YES — Critical** | Part of control limit state; needed to recompute per-point limits in VARIABLE_LIMITS mode | Medium | Overwritten in-place |
| **Spec limits (USL, LSL, target)** | **YES — Critical** | Engineering changes affect capability indices retroactively | Low (quarterly) | Overwritten in-place on `characteristic` table |
| **Nelson rule configuration** | **YES — Important** | Rule changes affect which violations fire; auditors need to know which rules were active | Low | `characteristic_rules` rows, updated in-place |
| **Rule parameters** | **YES — Important** | Custom thresholds (e.g., "7 points in a row" vs "9") affect violation sensitivity | Low | JSON in `characteristic_rules.parameters` |
| **Distribution method / params** | **YES — Important** | Box-Cox lambda, distribution family affect capability calculation | Low | Overwritten on `characteristic` |
| **Subgroup size / mode** | **YES — Important** | Affects limit calculation, chart type selection | Very low | Overwritten on `characteristic` |
| **Chart type (CUSUM/EWMA params)** | **YES — Important** | k, h, lambda, L values define chart behavior | Very low | Overwritten on `characteristic` |
| **Product limits** | **YES — Important** | Per-product overrides for limits/specs; `updated_at` exists but no history | Low | `product_limit` table, overwritten |
| **Anomaly detector config** | **Maybe** | PELT/iForest/K-S parameters affect detection sensitivity | Low | `anomaly_detector_config`, overwritten. `updated_at` exists |
| **Anomaly model state** | **No** | ML model blobs are retrained, not "configured"; model state at time T isn't meaningful for chart reconstruction | N/A | `anomaly_model_state` — retrained periodically |
| **Measurement data** | **No — Already temporal** | Samples have timestamps; measurements are immutable (edits tracked via `SampleEditHistory`) | N/A | Already correct |
| **Capability history** | **No — Already temporal** | `CapabilityHistory` already stores point-in-time snapshots with `calculated_at` | N/A | Already correct |
| **Violations** | **No — Already temporal** | Violations have `created_at` and link to samples; they record a historical fact | N/A | Already correct |
| **Signatures** | **No — Already immutable** | Electronic signatures are append-only with invalidation tracking | N/A | Already correct |
| **User/role assignments** | **Probably not** | Low value for chart reconstruction; audit log captures role changes | Very low | Not critical for SPC time travel |
| **Gage assignments** | **Probably not** | Useful for MSA traceability but not for chart reconstruction | Very low | Not critical for SPC time travel |
| **Hierarchy (plant/line/station)** | **No** | Structural changes are extremely rare; audit log is sufficient | Very rare | Not needed |

### 2.2 The Core Versioning Set

The minimum viable set that must be versioned to achieve meaningful time travel:

1. **Characteristic configuration snapshot**: UCL, LCL, USL, LSL, target, stored_sigma, stored_center_line, subgroup_size, subgroup_mode, data_type, chart_type, distribution_method, box_cox_lambda, distribution_params, sigma_method, short_run_mode, CUSUM/EWMA params
2. **Rule configuration snapshot**: All 8 rules' enabled/disabled state + custom parameters
3. **Product limit snapshots**: Per-product overrides active at that time

Everything else is either already temporal (measurements, capability history, violations, signatures) or low-value for chart reconstruction.

---

## 3. Implementation Approaches

### 3.1 Approach A: SCD Type 2 (Slowly Changing Dimensions)

**Concept**: Add `valid_from` / `valid_to` columns to configuration tables. Every update creates a new row with the new values and sets `valid_to` on the old row. "Current" rows have `valid_to = NULL` or `9999-12-31`.

**Schema change example**:
```
characteristic_config_history:
  id, characteristic_id, valid_from, valid_to,
  ucl, lcl, usl, lsl, target_value,
  stored_sigma, stored_center_line,
  subgroup_size, subgroup_mode,
  distribution_method, box_cox_lambda,
  chart_type, cusum_k, cusum_h, ewma_lambda, ewma_l,
  changed_by, change_reason
```

**Query for state at date X**:
```sql
SELECT * FROM characteristic_config_history
WHERE characteristic_id = ?
  AND valid_from <= ?
  AND (valid_to IS NULL OR valid_to > ?)
```

**Pros**:
- Simple, well-understood pattern
- Works on all 4 supported dialects (SQLite, PostgreSQL, MySQL, MSSQL)
- Efficient point-in-time queries with proper indexing
- Easy to understand for developers and auditors
- Can add `changed_by` and `change_reason` fields for audit enrichment
- Works naturally with SQLAlchemy — no ORM magic needed

**Cons**:
- Every UPDATE must be intercepted to create the historical row (application-level concern)
- Risk of forgetting to version a new field added later
- Slightly more complex queries for "current state" (WHERE valid_to IS NULL)
- Two places to update when adding new configuration fields

**Effort**: Medium. New migration, new repository methods, modify all config-mutating endpoints.

### 3.2 Approach B: Event Sourcing (Light)

**Concept**: Append-only change log table. Each row records a field-level change (field_name, old_value, new_value, changed_at). Reconstruct state by replaying events up to the target date.

**Schema**:
```
config_change_event:
  id, characteristic_id, timestamp,
  field_name, old_value (text), new_value (text),
  changed_by, change_reason
```

**Reconstruction**:
```python
# Start with earliest known state, apply changes up to target date
events = await get_events(char_id, before=target_date)
state = {}
for event in events:
    state[event.field_name] = event.new_value
```

**Pros**:
- Complete audit trail of every individual change
- Minimal storage for infrequent changes
- Can reconstruct state at any arbitrary timestamp
- Natural fit for "what changed between date A and date B" queries

**Cons**:
- Reconstruction requires reading and replaying all events (O(n) per query)
- Type information is lost (everything stored as text) — need schema for casting
- No efficient "give me the full state at date X" query without materialization
- Complex to implement correctly (initial state seeding, field additions, deletions)
- Performance degrades with history depth — years of changes compound
- Harder to reason about for developers unfamiliar with event sourcing

**Effort**: Medium-high. More complex reconstruction logic, serialization/deserialization layer.

### 3.3 Approach C: Temporal Tables (Database-Native)

**Concept**: Use database-native system-versioned temporal tables. The database automatically manages history rows on every UPDATE/DELETE.

**Database support**:
| Database | Temporal Support | Maturity |
|----------|-----------------|----------|
| **SQL Server** | System-versioned temporal tables (SQL Server 2016+) | Production-ready, full `FOR SYSTEM_TIME AS OF` syntax |
| **PostgreSQL** | No native system-versioned tables. Extension `temporal_tables` available. PG 17/18 added `WITHOUT OVERLAPS` for application-time periods | Partial — requires extension or triggers |
| **MySQL** | System-versioned tables in MariaDB 10.3+. Standard MySQL: no native support | MariaDB only |
| **SQLite** | No support | None |

**Pros**:
- Zero application code for history capture — database handles it automatically
- Efficient `AS OF` queries with database-optimized access paths
- Immutable history (application cannot tamper with history table)
- Standard SQL:2011 compliance

**Cons**:
- **Fatal flaw for Cassini**: SQLite has no temporal table support. PostgreSQL requires extensions or PL/pgSQL triggers. MySQL doesn't support it natively (only MariaDB). Only MSSQL has full native support.
- Multi-dialect support becomes a nightmare — different DDL, different query syntax per database
- Alembic migrations for temporal tables are non-trivial and dialect-specific
- SQLAlchemy has no built-in temporal table support — requires raw SQL per dialect
- Cannot add `changed_by` or `change_reason` without additional application-level work

**Effort**: Very high. Dialect-specific implementations, custom Alembic operations, limited ORM support.

**Verdict**: **Not viable** for Cassini's multi-dialect requirement. Would work if Cassini were PostgreSQL-only or MSSQL-only.

### 3.4 Approach D: Periodic Snapshots

**Concept**: Take full configuration snapshots at regular intervals (daily, weekly) or on every change. Store as JSON blobs.

**Schema**:
```
config_snapshot:
  id, characteristic_id, snapshot_at,
  trigger (scheduled | manual | on_change),
  config_json (full serialized state),
  rules_json (full serialized rule config),
  product_limits_json
```

**Pros**:
- Simplest implementation — serialize and store
- O(1) lookup for "state at date X" (find nearest snapshot)
- Schema-independent — adding new fields doesn't require migration of history table
- Easy to export/archive

**Cons**:
- If time-based: gaps between snapshots mean imprecise reconstruction
- If change-triggered: essentially becomes SCD Type 2 but less queryable
- JSON blobs are hard to query/filter/aggregate in SQL
- Large storage if snapshots are frequent with many characteristics
- No efficient "what changed between A and B" query without diff logic

**Effort**: Low-medium. Simple to implement but limited query flexibility.

### 3.5 Approach E: Audit Log Reconstruction

**Concept**: Use the existing `audit_log` table to reconstruct state. The audit middleware already captures request bodies for POST/PUT/PATCH operations.

**Current audit log capabilities**:
- Captures `detail` JSON with sanitized request body for mutating operations
- Records `timestamp`, `user_id`, `username`, `action`, `resource_type`, `resource_id`
- `ControlLimitsUpdatedEvent` audit entries include `ucl`, `lcl`, `center_line`

**Feasibility analysis**:
- **Incomplete**: Audit log captures the new values in the request body, but not always the old values. Cannot reconstruct a full config snapshot from partial updates (PATCH).
- **Inconsistent structure**: Different endpoints log different detail shapes. No guaranteed schema for reconstruction.
- **Missing initial state**: If a characteristic was created before audit logging was implemented, there's no baseline to reconstruct from.
- **No rule config tracking**: Rule changes are captured as HTTP request audits, but the detail format varies and isn't designed for reconstruction.

**Verdict**: **Not viable as primary approach**. The audit log is designed for compliance auditing ("who did what when"), not for state reconstruction. However, it can **supplement** another approach by providing the `changed_by` and `change_reason` metadata.

### 3.6 Recommended Approach: SCD Type 2 + Change-Triggered Snapshots (Hybrid)

**The recommended approach combines Approach A (SCD Type 2) with elements of Approach D (snapshots):**

1. **New table: `characteristic_config_version`** — SCD Type 2 with `valid_from`/`valid_to` for all configuration fields that affect chart rendering and capability computation.

2. **New table: `characteristic_rules_version`** — SCD Type 2 for the rule configuration set (serialized as JSON for the full 8-rule set, since individual rule rows are always updated as a set).

3. **New table: `product_limit_version`** — SCD Type 2 for per-product limit overrides.

4. **Change capture**: Every endpoint that modifies characteristic config, rules, or product limits creates a new version row before applying the change. The new row captures `changed_by_user_id`, `change_reason` (optional), and `valid_from = now()`.

5. **"Current" optimization**: The existing `characteristic`, `characteristic_rules`, and `product_limit` tables remain the source of truth for current state. The version tables are append-only history. This avoids any performance impact on current-state queries.

**Why this hybrid works**:
- Current-state queries (99% of traffic) hit existing tables — zero performance impact
- Historical queries hit version tables with indexed `valid_from`/`valid_to` range lookups
- All 4 dialects supported — standard SQL, no extensions needed
- Alembic migration is straightforward — just new tables + indexes
- SQLAlchemy models are simple mapped columns, no ORM magic
- `changed_by` and `change_reason` built in for audit enrichment
- Compatible with existing audit log (supplements, doesn't replace)

---

## 4. Detailed Data Model Design

### 4.1 characteristic_config_version

```
characteristic_config_version:
  id                    INTEGER PRIMARY KEY
  characteristic_id     INTEGER FK -> characteristic.id
  version_number        INTEGER NOT NULL  -- monotonic per characteristic
  valid_from            DATETIME(tz) NOT NULL
  valid_to              DATETIME(tz) NULL  -- NULL = current version

  -- Snapshot of all versioned fields from characteristic table
  ucl                   FLOAT NULL
  lcl                   FLOAT NULL
  usl                   FLOAT NULL
  lsl                   FLOAT NULL
  target_value          FLOAT NULL
  stored_sigma          FLOAT NULL
  stored_center_line    FLOAT NULL
  subgroup_size         INTEGER NOT NULL
  subgroup_mode         VARCHAR(50) NOT NULL
  data_type             VARCHAR(20) NOT NULL
  chart_type            VARCHAR(20) NULL
  distribution_method   VARCHAR(30) NULL
  box_cox_lambda        FLOAT NULL
  distribution_params   TEXT NULL
  use_laney_correction  BOOLEAN NOT NULL
  short_run_mode        VARCHAR(20) NULL
  sigma_method          VARCHAR(20) NULL
  cusum_target          FLOAT NULL
  cusum_k               FLOAT NULL
  cusum_h               FLOAT NULL
  ewma_lambda           FLOAT NULL
  ewma_l                FLOAT NULL
  decimal_precision     INTEGER NOT NULL

  -- Audit metadata
  changed_by_user_id    INTEGER NULL FK -> user.id
  changed_by_username   VARCHAR(255) NULL
  change_reason         VARCHAR(500) NULL
  change_source         VARCHAR(50) NOT NULL  -- 'manual', 'recalculate', 'import', 'api'

  UNIQUE(characteristic_id, version_number)
  INDEX(characteristic_id, valid_from)
  INDEX(characteristic_id, valid_to)  -- for "current version" lookups
```

### 4.2 characteristic_rules_version

```
characteristic_rules_version:
  id                    INTEGER PRIMARY KEY
  characteristic_id     INTEGER FK -> characteristic.id
  version_number        INTEGER NOT NULL
  valid_from            DATETIME(tz) NOT NULL
  valid_to              DATETIME(tz) NULL

  -- Full rule set as JSON (all 8 rules with enabled/params)
  rules_config_json     TEXT NOT NULL

  -- Audit metadata
  changed_by_user_id    INTEGER NULL
  changed_by_username   VARCHAR(255) NULL
  change_reason         VARCHAR(500) NULL

  UNIQUE(characteristic_id, version_number)
  INDEX(characteristic_id, valid_from)
```

### 4.3 product_limit_version

```
product_limit_version:
  id                    INTEGER PRIMARY KEY
  product_limit_id      INTEGER FK -> product_limit.id
  version_number        INTEGER NOT NULL
  valid_from            DATETIME(tz) NOT NULL
  valid_to              DATETIME(tz) NULL

  -- Snapshot of product limit fields
  ucl                   FLOAT NULL
  lcl                   FLOAT NULL
  stored_sigma          FLOAT NULL
  stored_center_line    FLOAT NULL
  target_value          FLOAT NULL
  usl                   FLOAT NULL
  lsl                   FLOAT NULL

  -- Audit metadata
  changed_by_user_id    INTEGER NULL
  changed_by_username   VARCHAR(255) NULL
  change_reason         VARCHAR(500) NULL

  UNIQUE(product_limit_id, version_number)
  INDEX(product_limit_id, valid_from)
```

### 4.4 Key Query Patterns

**Get config at date X**:
```sql
SELECT * FROM characteristic_config_version
WHERE characteristic_id = :char_id
  AND valid_from <= :target_date
  AND (valid_to IS NULL OR valid_to > :target_date)
```

**Get all config changes for a characteristic**:
```sql
SELECT * FROM characteristic_config_version
WHERE characteristic_id = :char_id
ORDER BY version_number ASC
```

**Get config changes between two dates**:
```sql
SELECT * FROM characteristic_config_version
WHERE characteristic_id = :char_id
  AND valid_from >= :start_date
  AND valid_from <= :end_date
ORDER BY version_number ASC
```

**Reconstruct full chart state at date X**:
```sql
-- 1. Config at date X
SELECT ... FROM characteristic_config_version WHERE char_id = ? AND valid_from <= X AND (valid_to IS NULL OR valid_to > X)

-- 2. Rules at date X
SELECT ... FROM characteristic_rules_version WHERE char_id = ? AND valid_from <= X AND (valid_to IS NULL OR valid_to > X)

-- 3. Measurements up to date X
SELECT ... FROM sample JOIN measurement ON ... WHERE char_id = ? AND timestamp <= X ORDER BY timestamp

-- 4. Violations up to date X
SELECT ... FROM violation WHERE char_id = ? AND created_at <= X

-- 5. Capability at date X (nearest snapshot)
SELECT ... FROM capability_history WHERE characteristic_id = ? AND calculated_at <= X ORDER BY calculated_at DESC LIMIT 1
```

---

## 5. UI/UX Design Concepts

### 5.1 Time Travel Entry Points

**Option A: Timeline Scrubber on Control Charts**
- A horizontal timeline bar below the chart showing configuration change markers (diamonds/pins)
- Dragging the scrubber to a past date updates the chart to show data + limits as of that date
- Current date is the rightmost position (default)
- Config change markers are clickable to see what changed

**Option B: "View as of Date" Selector**
- Date picker in the chart toolbar (next to existing filter controls)
- When a historical date is selected, the chart enters "time travel mode" with a visual indicator (sepia tint, clock icon, banner)
- All statistical values (capability indices, control limits) reflect the historical config
- A "Return to Present" button exits time travel mode

**Option C: History Tab / Timeline View** (complementary to A or B)
- New "History" tab on the characteristic detail page
- Vertical timeline showing all configuration changes with diffs
- Each entry shows: date, user, what changed, before/after values
- Click any entry to see the chart as it looked at that point

### 5.2 Two-Date Comparison View

- Split-screen or overlay mode: left = date A, right = date B
- Side-by-side control charts with same Y-axis scale
- Comparison table below showing:
  - Config diff (what changed between the two dates)
  - Capability index comparison (Cpk at A vs Cpk at B)
  - Rule configuration diff
  - Sample count difference

### 5.3 Chart Evolution Animation

- "Play" button that animates the chart from a start date to an end date
- Speed control (1 month/second, 1 week/second, etc.)
- As the animation progresses:
  - New data points appear
  - Control limits shift when recalculation events occur
  - Spec limit changes are highlighted
  - Rule violations flash as they occur
- Pause/resume, frame-by-frame stepping

### 5.4 Visual Design Considerations

- **Time travel mode indicator**: Clear visual signal that the user is not viewing current state (clock icon, amber banner: "Viewing process state as of Feb 15, 2026")
- **Immutability signal**: All values in time travel mode are read-only with a lock icon
- **Config change markers on charts**: Vertical dashed lines at dates where limits or specs changed, with hover tooltips showing the change
- **Color coding for changes**: Green = improvement (tighter limits, better Cpk), red = degradation

### 5.5 Recommended MVP UX

For initial implementation, the **"View as of Date" selector (Option B) + History Tab (Option C)** combination provides the most value with the least complexity:

1. Date picker on chart toolbar — simple, discoverable
2. History tab showing config change timeline — gives auditors what they need
3. Config change markers on the main chart timeline — context without mode switching

The two-date comparison and animation features are Phase 2 enhancements.

---

## 6. Regulatory Value

### 6.1 FDA 21 CFR Part 11

**Section 11.10(e)** requires: "Use of secure, computer-generated, time-stamped audit trails to independently record the date and time of operator entries and actions that create, modify, or delete electronic records."

Time travel directly enables:
- **Audit trail reconstruction**: 11.10(e) requires the ability to reconstruct records. Rolling back audit changes to restore "before change" values is a recognized compliance pattern.
- **Record integrity**: 11.10(a) requires validation to ensure accuracy and reliability. Time travel proves that historical records were maintained accurately by demonstrating reproducible reconstruction.
- **Non-obscurance**: 11.10(e) states "previously recorded information shall not be obscured." Time travel ensures old configurations are preserved, not overwritten.

**Current gap in Cassini**: Control limits, spec limits, and rule configurations are overwritten in-place. If an auditor asks "what were the control limits on Jan 15?", the answer is currently "whatever they are now" — which may be wrong if limits were recalculated since then. This is a compliance risk for FDA-regulated customers.

### 6.2 AS9100 / Aerospace Quality

AS9100D clause 8.5.2 (Identification and traceability) requires that organizations "identify the status of outputs with respect to monitoring and measurement requirements throughout production."

Time travel enables:
- Linking specific lots/serial numbers to the process state that was active during their production
- Demonstrating that the process was in statistical control at the time of manufacture
- Providing evidence for First Article Inspection (FAI) that control charts reflected expected behavior

### 6.3 IATF 16949 / Automotive Quality

IATF 16949 clause 9.1.1.1 requires "statistical studies for each process" and clause 8.5.1.1 requires control plans that are "updated as the product or process changes."

Time travel enables:
- Tracking when control plan parameters (control limits, sample sizes, rules) changed
- Correlating process changes with quality outcomes
- Supporting PPAP re-submission decisions by showing before/after process capability

### 6.4 CAPA / Root Cause Analysis

For any Corrective and Preventive Action investigation:
- "What was the process state when the non-conformance occurred?"
- "What changed in the 2 weeks before the issue started?"
- "Did a control limit recalculation mask an out-of-control condition?"

Time travel transforms CAPA investigations from guesswork ("I think the limits were different then") to evidence-based reconstruction.

### 6.5 Data Integrity (ALCOA+ Principles)

The ALCOA+ framework (Attributable, Legible, Contemporaneous, Original, Accurate + Complete, Consistent, Enduring, Available) is the gold standard for data integrity in regulated industries:

| Principle | How Time Travel Helps |
|-----------|----------------------|
| **Attributable** | Version records include `changed_by` — who made each change |
| **Contemporaneous** | `valid_from` timestamps record when changes occurred |
| **Original** | Historical versions are immutable append-only records |
| **Complete** | Full configuration state preserved, not just partial audit entries |
| **Enduring** | Database-stored, not volatile memory or log files |
| **Available** | Queryable via API, exportable for inspectors |

---

## 7. Competitive Landscape

### 7.1 InfinityQS ProFicient / Enact

InfinityQS is the closest competitor with a form of historical limit tracking:
- **Effective Date model**: Control limits are stored as (Mean, StdDev, Effective Date) tuples, not as absolute UCL/LCL values. Each new calculation creates a new effective date entry.
- **Stepped control limits**: Multiple effective dates on the same chart appear as "stepped" control limit lines — the chart visually shows when limits changed.
- **Limit revision management**: Enact maintains multiple control limit entries per characteristic and allows users to manage revisions.
- **Limitation**: This is limited to control limits only — not a full configuration snapshot. Rule changes, spec limit changes, and distribution parameters are not versioned in the same way.

### 7.2 Minitab Real-Time SPC

- **Process Quality Snapshot**: Provides a view of current control parameters with the ability to trigger recalculation.
- **Lock-after-calculation**: After limits are calculated, they are "set and locked" until a new calculation is initiated.
- **No true time travel**: Historical process parameters are available but there is no "view as of date X" feature. Charts show current limits applied to historical data.

### 7.3 WinSPC / DataNet

- Documentation is limited, but no evidence of historical state reconstruction features.
- Focus is on real-time data collection and charting, not historical analysis.

### 7.4 General Market Assessment

**No major SPC tool offers full "snapshot time travel"** in the sense described here. InfinityQS comes closest with effective-dated control limits, but even they don't version the full configuration envelope (rules, distribution params, chart type, etc.).

This represents a **significant competitive differentiator** for Cassini, particularly for regulated industries where the ability to reconstruct historical process state is a compliance requirement that competitors leave as manual/paper-based processes.

The closest analogy in other domains is **bi-temporal databases** used in financial services (for regulatory reporting) and **Git-like versioning** used in infrastructure-as-code. Bringing this concept to manufacturing SPC would be novel.

---

## 8. Performance Considerations

### 8.1 Storage Impact

**Assumptions** for a medium-sized deployment:
- 500 characteristics
- Average 12 config changes per characteristic per year (monthly limit recalculation)
- 3 years of history

**Config version table**: 500 x 12 x 3 = 18,000 rows. At ~500 bytes per row = **~9 MB**. Negligible.

**Rule version table**: Same frequency assumption = 18,000 rows at ~200 bytes = **~3.6 MB**. Negligible.

**Product limit versions**: Assuming 20% of characteristics have product limits, 4 products each:
500 x 0.2 x 4 x 12 x 3 = 14,400 rows at ~300 bytes = **~4.3 MB**. Negligible.

**Total storage overhead**: Under 20 MB for 3 years of a 500-characteristic deployment. Storage is a non-issue.

### 8.2 Write Performance

Every config-mutating operation adds one INSERT to the version table and one UPDATE to close the previous version's `valid_to`. This is:
- One additional INSERT per config change (negligible — config changes are infrequent)
- One UPDATE on the previous version row (indexed by characteristic_id + valid_to IS NULL)
- Total added latency: <5ms per config change

**Impact on hot path**: Zero. Sample ingestion, charting, and real-time SPC calculations never touch version tables.

### 8.3 Read Performance for Time Travel Queries

**Point-in-time lookup**: One indexed range query per table. With a composite index on `(characteristic_id, valid_from, valid_to)`, this is O(log n) — effectively instant even with millions of version rows.

**Full chart reconstruction at date X**: 5 queries (config version + rules version + samples + violations + capability history). All are indexed. Total expected time: <50ms.

**Config change timeline**: One sorted scan of version rows for a single characteristic. Expected: <10ms.

**Two-date comparison**: Two point-in-time lookups + diff logic. Expected: <100ms including application-level diff.

### 8.4 Indexing Strategy

```
-- Primary lookup: "config at date X"
CREATE INDEX ix_config_version_range
  ON characteristic_config_version (characteristic_id, valid_from DESC);

-- "Current version" fast path
CREATE INDEX ix_config_version_current
  ON characteristic_config_version (characteristic_id)
  WHERE valid_to IS NULL;  -- Partial index (PostgreSQL/SQLite only)

-- For MSSQL/MySQL (no partial indexes): use (characteristic_id, valid_to) and query valid_to IS NULL
```

### 8.5 Snapshot vs. On-Demand Reconstruction

**No periodic snapshots needed**. The SCD Type 2 approach provides exact point-in-time state without approximation. Unlike event sourcing, there is no reconstruction cost — the version row IS the state.

The only scenario where periodic snapshots would add value is for **pre-computed "chart as of date" caches** for the animation feature (Phase 2), where rendering 180 frames of chart evolution would require 180 point-in-time reconstructions. This could be addressed with a background job that pre-renders keyframes.

---

## 9. Migration & Backfill Strategy

### 9.1 Initial Migration

The Alembic migration creates the three version tables and seeds them with an initial version for every existing characteristic:

```python
# For each characteristic, create version_number=1 with valid_from = characteristic.created_at (or earliest sample timestamp)
# This establishes the baseline "original" configuration
```

### 9.2 Backfill from Audit Log

The existing audit log contains `ControlLimitsUpdatedEvent` entries with `detail = {"ucl": ..., "lcl": ..., "center_line": ...}`. These can be used to retroactively create version rows for historical limit changes:

1. Query audit_log for `action = 'recalculate'` and `resource_type = 'characteristic'`
2. For each entry, create a config version row with the limit values from `detail`
3. Fill in non-limit fields from the current characteristic config (best available approximation)

**Caveat**: This backfill is approximate. Fields not captured in audit entries (spec limits, rules, distribution params) will be copied from current values, which may not match their historical state. The backfill should be clearly marked as `change_source = 'backfill_approximate'`.

### 9.3 Forward Compatibility

When new configuration fields are added to the `characteristic` table in future migrations, they must also be added to `characteristic_config_version`. A code review checklist item should enforce this.

---

## 10. API Design Sketch

### 10.1 Endpoints

```
GET /api/v1/characteristics/{id}/history
  → List of config version summaries (version_number, valid_from, changed_by, change_summary)

GET /api/v1/characteristics/{id}/history/{version_number}
  → Full config version detail

GET /api/v1/characteristics/{id}/state?as_of=2026-02-15T00:00:00Z
  → Full reconstructed state at the given date (config + rules + product limits)

GET /api/v1/characteristics/{id}/state/compare?date_a=...&date_b=...
  → Diff between two point-in-time states

GET /api/v1/characteristics/{id}/chart-data?as_of=2026-02-15T00:00:00Z
  → Chart data (samples + limits + violations) as they would have appeared at that date
```

### 10.2 Response Shape for State-at-Date

```json
{
  "as_of": "2026-02-15T00:00:00Z",
  "version": {
    "version_number": 7,
    "valid_from": "2026-02-01T14:30:00Z",
    "changed_by": "jane.engineer",
    "change_reason": "Monthly limit recalculation"
  },
  "config": {
    "ucl": 10.234,
    "lcl": 9.766,
    "usl": 10.5,
    "lsl": 9.5,
    "target_value": 10.0,
    "stored_sigma": 0.078,
    "stored_center_line": 10.001,
    "subgroup_size": 5,
    "distribution_method": "normal",
    ...
  },
  "rules": [
    {"rule_id": 1, "is_enabled": true, "parameters": null},
    {"rule_id": 2, "is_enabled": true, "parameters": {"consecutive_count": 9}},
    ...
  ],
  "product_limits": [
    {"product_code": "ABC-100", "ucl": 10.3, "lcl": 9.7, ...}
  ],
  "capability": {
    "cpk": 1.42,
    "ppk": 1.38,
    "calculated_at": "2026-02-14T08:00:00Z"
  }
}
```

---

## 11. Implementation Phases

### Phase 1: Foundation (MVP)
- New migration: 3 version tables
- Backfill initial versions from current state
- Modify config-mutating endpoints to create version rows
- `GET /characteristics/{id}/history` — list versions
- `GET /characteristics/{id}/state?as_of=` — point-in-time state
- Frontend: History tab on characteristic detail page
- Frontend: "View as of Date" picker on chart toolbar (read-only historical mode)

### Phase 2: Comparison & Visualization
- Two-date comparison API + split-view UI
- Config change markers on main chart timeline
- Diff visualization (before/after tables with highlighting)
- Export historical state as PDF/CSV for audit submission

### Phase 3: Animation & Advanced
- Chart evolution animation (playback with speed control)
- Pre-computed keyframe caching for performance
- Integration with CAPA workflow ("link investigation to historical state")
- Batch time travel ("show all characteristics in this plant as of date X")

---

## 12. Risks & Open Questions

### 12.1 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Forgetting to version new fields | Silent data gap in history | Code review checklist item; integration test that compares characteristic columns to version table columns |
| Backfill inaccuracy for pre-existing data | Historical views before implementation date show approximated state | Clear UI indicator: "Configuration history available from [implementation date]. Earlier dates show estimated state." |
| Performance of chart reconstruction at scale | Slow UI for time travel on characteristics with extensive history | Version tables are small; index properly; cache hot reconstructions |
| Schema drift between characteristic and version table | Version rows missing columns added in later migrations | Automated test comparing column sets; migration template |

### 12.2 Open Questions

1. **Should "change reason" be required or optional?** Required adds friction to recalculate operations but improves audit trail quality. Consider: required for manual changes, optional for automated recalculations.

2. **Should time travel be a commercial-only feature?** Given its primary value is regulatory compliance, this seems like a natural commercial tier feature. Community edition could show current state + basic history, commercial adds full time travel.

3. **How to handle deleted characteristics?** If a characteristic is deleted, should its version history be retained? For regulatory compliance, probably yes — soft delete the characteristic but keep versions.

4. **Should capability history be computed on-demand for historical dates, or only show the nearest pre-computed snapshot?** On-demand recomputation using historical config + historical data is more accurate but requires running the capability engine with a "virtual" config state.

5. **Integration with electronic signatures**: If a control limit change was signed, should the time travel view show the signature status? This would be valuable for audit but adds query complexity.

6. **Granularity of "what changed" tracking**: Should diffs be field-level (ucl changed from 10.2 to 10.3) or version-level (here's version 7, here's version 8)? Field-level diffs are more useful for auditors but require application-level diff logic.

---

## 13. References & Sources

### Regulatory
- [FDA 21 CFR Part 11 Audit Trails — SimplerQMS](https://simplerqms.com/21-cfr-part-11-audit-trail/)
- [Configuring Software for 21 CFR Part 11 Audit Trail Requirements — Pharmaceutical Technology](https://www.pharmtech.com/view/configuring-software-compliance-21-cfr-part-11-audit-trail-requirements)
- [FDA Part 11 Scope and Application Guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/part-11-electronic-records-electronic-signatures-scope-and-application)

### Temporal Databases
- [SQL Server Temporal Table Usage Scenarios — Microsoft Learn](https://learn.microsoft.com/en-us/sql/relational-databases/tables/temporal-table-usage-scenarios?view=sql-server-ver16)
- [Temporal Extensions — PostgreSQL Wiki](https://wiki.postgresql.org/wiki/Temporal_Extensions)
- [Implementing System-Versioned Tables in Postgres — Hypirion](https://hypirion.com/musings/implementing-system-versioned-tables-in-postgres)
- [temporal_tables PL/pgSQL Extension — Nearform/GitHub](https://github.com/nearform/temporal_tables)
- [SQL2011 Temporal — PostgreSQL Wiki](https://wiki.postgresql.org/wiki/SQL2011Temporal)

### Competitive SPC
- [InfinityQS ProFicient: Managing Limits](https://help.infinityqs.com/help/en/ProFicient/Content/DBM/Limits/ManagingLimits.htm)
- [InfinityQS ProFicient: Calculating Control Limits](https://help.infinityqs.com/help/en/ProFicient/Content/RefSheets/CalculatingControlLimits.htm)
- [Minitab Real-Time SPC: Control Limit Calculation Details](https://support.minitab.com/en-us/real-time-spc/quality-analyses/control-limit-calculation-details/)
- [Minitab Real-Time SPC Features](https://www.minitab.com/en-us/products/real-time-spc/features/)

### Audit Trail Patterns
- [System Auditing with SQL Server Temporal Tables — Tarambling](https://tarambling.com/2020/03/11/auditing-using-sql-server-temporal-tables/)
- [Temporal Tables for Data Change Auditing — SSW Rules](https://www.ssw.com.au/rules/use-temporal-tables-to-audit-data-changes/)

### SPC Fundamentals
- [Statistical Process Control — ASQ](https://asq.org/quality-resources/statistical-process-control)
- [Control Chart — Wikipedia](https://en.wikipedia.org/wiki/Control_chart)
