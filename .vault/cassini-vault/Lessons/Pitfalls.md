---
type: lesson
status: active
severity: critical
tags: [lesson, active, pitfall]
---

# Pitfalls

Quick-reference catalog of known pitfalls from development. These have caused real bugs.

> **Authoritative source**: `CLAUDE.md` (project root) contains the canonical pitfall list that is loaded into every session's context. This vault note exists for Obsidian cross-referencing and browsability.

---

## Frontend Pitfalls

### Token Refresh Race Condition
Never use a boolean flag for concurrent 401 handling; use a shared Promise. See `fetchApi` in `frontend/src/api/client.ts`.

**Relates to**: [[Architecture/System Overview]]

### React Router navigate in render
Always wrap `navigate()` in `useEffect`. Never call during render phase.

### useECharts Container Must Be in DOM
Container div MUST always be in DOM. Use `visibility: hidden` for loading states, NOT conditional rendering. Unmounting the div destroys the chart instance.

**Relates to**: [[Features/Charts]]

### ECharts 6 Instance Access
Use `getInstanceByDom()` from `echarts/core`, not `__ec_instance__`.

### Custom renderItem Data Format
Data must include actual coordinates `[xVal, yVal, arrayIndex]` with `encode: { x: 0, y: 1 }`.

### Provider Init Race
PlantProvider, WebSocketProvider must be inside RequireAuth. Initialization order matters.

### useUpdateCharacteristic Must Invalidate chartData
Invalidating detail/list keys is NOT enough -- chartData uses `['characteristics', 'chartData', id]` prefix which doesn't match `['characteristics', 'detail', id]`.

### CharacteristicForm onChange Type
Must be `(field: string, value: string | boolean)` -- checkbox fields (use_laney_correction) pass booleans, not strings.

### ExplanationPanel z-index
Uses `z-[60]` to render above modals (z-50). Do not lower this.

**Relates to**: [[Features/Show Your Work]]

---

## Backend Pitfalls

### Async Lazy-Loading Trap
NEVER access SQLAlchemy relationships in async context without `selectinload`. `BaseRepository.get_by_id` uses `session.get()` which doesn't eager-load. Use direct `select()` queries for cross-relationship column access.

**Relates to**: [[Architecture/System Overview]]

### JTI Query Pattern
NEVER explicitly `.join(DataSource)` when querying subclasses (MQTTDataSource, OPCUADataSource). SQLAlchemy JTI auto-joins the parent table. Explicit join causes "ambiguous column name" on SQLite. Access parent columns directly on the subclass.

**Relates to**: [[Features/OPC-UA Integration]], [[Features/MQTT Connectivity]]

### FastAPI Route Ordering
Static paths MUST come before `/{param}` -- top-to-bottom matching. `/my-config` must precede `/{bridge_id}`.

**Relates to**: [[Features/Gage Bridge]]

### Characteristic Model Import
`Characteristic` is in `cassini.db.models.characteristic`, NOT `hierarchy`.

### Admin Bootstrap
Admin users need access to ALL plants. Auto-assign admin role on new plant creation.

### Cookie Path
Refresh token cookie uses `path="/api/v1/auth"`.

### DB Encryption Key Separation
`.db_encryption_key` MUST be separate from `.jwt_secret`. JWT rotation would brick stored database credentials otherwise.

**Relates to**: [[Features/Multi-Database]]

### Protobuf Version
protobuf>=5.29.0 (runtime v6). Generated pb2 must match.

**Relates to**: [[Features/MQTT Connectivity]]

---

## Migration Pitfalls

### Existing Migrations Are Immutable
Never modify already-executed migrations. Always create NEW migrations for schema changes.

### Dialect-Safe Migrations
Never use `lastrowid` -- it silently returns 0 on PostgreSQL. Insert rows, SELECT back by unique column, then insert children.

**Relates to**: [[Features/Multi-Database]]

### SQLite batch_alter_table FK Recreation
MUST use naming convention dict so Alembic can identify unnamed SQLite FKs/UQs. Always `drop_constraint` before `create_foreign_key` -- never skip the drop, or you get duplicate FKs in the recreated table.

### No provider_type Column
Removed in migration 017. Use `char.data_source is None` (manual) or `char.data_source.type` (protocol). Do NOT add @property for this -- lazy-loading trap in async.

### Violation.char_id Denormalized
Set by SPC engine on creation; backfilled in migration 020. Use `Violation.char_id` directly instead of joining Sample for characteristic filtering.

---

## SPC Engine Pitfalls

### Capability GET Must Dispatch Non-Normal
When `characteristic.distribution_method` is set (and not "normal"), dispatch to `calculate_capability_nonnormal()`. Same applies to `save_capability_snapshot`.

**Relates to**: [[Features/Non-Normal Capability]]

### Short-Run Spec Limits Must Use sigma_xbar
Spec limit Z-transform MUST use `sigma / sqrt(n)` to match display_value transform. Raw sigma creates scale mismatch for subgroups > 1.

**Relates to**: [[Features/Short-Run Charts]]

### Backend Config Validation
`short_run_mode` incompatible with attribute data or CUSUM/EWMA. `use_laney_correction` only for p/u charts. Always check both directions (setting short_run AND setting chart_type).

**Relates to**: [[Features/Short-Run Charts]], [[Features/Laney Charts]]

### Attribute Nelson Rules
Backend intersects with {1,2,3,4} -- rules 5-8 silently ignored. RulesTab must filter display by dataType.

**Relates to**: [[Features/Attribute Charts]], [[Features/Custom Run Rules]]

---

## Test Environment Pitfalls

### Test Envs
Phase-specific start.bat files go in `backend/test-envs/{phase}/` (gitignored). Use separate DB files for test isolation.

### DataSource JTI
Base table `data_source` + sub-tables `mqtt_data_source`, `opcua_data_source`. Polymorphic on `type` column. No `polymorphic_identity` on base class.
