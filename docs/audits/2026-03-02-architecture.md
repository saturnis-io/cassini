# Architecture Audit -- Skeptic Review

Date: 2026-03-02
Auditor: Senior Architect (Skeptic Role)
Scope: Full monorepo -- backend, frontend, bridge

## Executive Summary

The Cassini codebase has a sound high-level architecture (event bus, multi-dialect DB, license-gated feature tiers), but rapid sprint-driven development has eroded the internal boundaries. The most critical structural problem is that the **repository layer has been widely bypassed** -- 25 of 44 routers have no dedicated repository and perform raw SQL directly, making the "repository pattern" more of an aspiration than an enforcement. The **Characteristic model is a god object** with 37 columns spanning SPC config, CUSUM params, EWMA params, distribution fitting, Laney corrections, and short-run mode, creating a modification hotspot that affects every feature. There are verified **layer violations** where core business logic imports from the API layer, creating upward dependency arrows that will block any future attempt to extract services.

---

## Findings

### [STRUCTURAL] F-01: Repository Layer is Largely Bypassed

**Severity**: HIGH
**Scope**: Backend API layer (`api/v1/`), Repository layer (`db/repositories/`)

**Description**: The repository pattern is only partially implemented. Of 44 router files, **25 have no dedicated repository** and perform raw SQLAlchemy queries directly in endpoint handlers. Even routers that do have repositories frequently bypass them for complex queries. The worst offenders by direct SQL statement count:

| Router | `session.execute()` | `select()` | `session.add()` |
|--------|---------------------|------------|------------------|
| `predictions.py` | 22 | 21 | 4 |
| `characteristics.py` | 15 | 24 | 2 |
| `database_admin.py` | 15 | 0 | 0 |
| `multivariate.py` | 9 | 9 | 4 |
| `gage_bridges.py` | 9 | 9 | 3 |
| `auth.py` | 8 | 8 | 2 |
| `doe.py` | 8 | 8 | 2 |
| `erp_connectors.py` | 8 | 8 | 4 |

**Evidence**:
- `backend/src/cassini/api/v1/predictions.py` -- 47 combined SQL operations, zero repository usage. All CRUD for PredictionConfig, PredictionModel, and Forecast is inline.
- `backend/src/cassini/api/v1/multivariate.py` -- 22 combined SQL operations for MultivariateGroup, members, samples, and correlations.
- `backend/src/cassini/api/v1/characteristics.py` -- 1960 lines, the largest router, with 24 `select()` calls directly building SQLAlchemy queries.

Routers without any dedicated repository:
`ai_analysis`, `annotations`, `api_keys`, `audit`, `auth`, `data_entry`, `database_admin`, `distributions`, `explain`, `fai`, `gage_bridges`, `import_router`, `ishikawa`, `license`, `msa`, `notifications`, `providers`, `push`, `rule_presets`, `scheduled_reports`, `system_settings`, `tags`

**Knock-on Effects if Addressed**: Extracting repositories would require moving ~500+ SQL queries out of routers. Query patterns in routers often depend on request-specific filtering logic, making naive extraction non-trivial.

**Migration Path**:
1. Freeze new feature routers from using inline SQL (enforce in code review).
2. Start with the Sprint 9 modules (predictions, multivariate, DOE) which are isolated and self-contained -- extract repositories for these first.
3. Gradually extract the core routers (characteristics, samples, violations) where the repository already exists but is bypassed for complex queries.
4. The `BaseRepository` could be extended with a query builder pattern to make filtered/joined queries expressible through the repository API.

**Recommendation**: HIGH priority. This is the single biggest maintainability debt. The repository layer should either be enforced or abandoned in favor of a different pattern (e.g., service layer with explicit query builders). The current half-in-half-out state is the worst of both worlds.

---

### [STRUCTURAL] F-02: Layer Violations -- Core and DB Import from API Layer

**Severity**: HIGH
**Scope**: `core/`, `db/repositories/`, `api/`

**Description**: The intended dependency direction is `api -> core -> db`. Four verified violations exist where lower layers import from the API layer, creating upward dependency arrows:

1. **`core/signature_engine.py`** imports `cassini.api.deps` (for `ROLE_HIERARCHY` and `get_user_role_level_for_plant`)
2. **`core/auth/api_key.py`** imports `cassini.api.deps`
3. **`core/broadcast.py`** imports `cassini.api.v1.websocket` (TYPE_CHECKING only, but still a structural dependency)
4. **`db/repositories/characteristic_config.py`** imports `cassini.api.schemas.characteristic_config` (Pydantic schemas used as data transfer objects in the repository layer)

**Evidence**:
- `backend/src/cassini/core/signature_engine.py` line 18: `from cassini.api.deps import ROLE_HIERARCHY, get_user_role_level_for_plant`
- `backend/src/cassini/db/repositories/characteristic_config.py` line 9-13: `from cassini.api.schemas.characteristic_config import (CharacteristicConfig as ConfigSchema, ManualConfig, TagConfig,)`

**Knock-on Effects if Addressed**: Moving `ROLE_HIERARCHY` to a shared location (e.g., `core/auth/roles.py`) is trivial. The schema import in the repository is more concerning -- it means the repository layer depends on Pydantic API contracts.

**Migration Path**:
1. Extract `ROLE_HIERARCHY` and role-checking functions from `api/deps.py` into `core/auth/roles.py`. Update `api/deps.py` to re-export from there.
2. For `characteristic_config.py` repository, create domain-level dataclasses in `core/` or `db/` to replace the Pydantic schema dependency.
3. For `broadcast.py`, the TYPE_CHECKING guard is acceptable but document the architectural contract that core must not runtime-import from api.

**Recommendation**: HIGH priority. These violations will block any attempt to extract `core/` as a standalone library or run it in a worker process without the API layer.

---

### [DATA MODEL] F-03: Characteristic Model is a God Object

**Severity**: HIGH
**Scope**: `db/models/characteristic.py`, all routers and engines that touch characteristics

**Description**: The `Characteristic` model has **37 mapped columns** spanning at least 7 distinct concerns:

1. **Core SPC config**: name, description, subgroup_size, target_value, USL, LSL, UCL, LCL, decimal_precision
2. **Subgroup mode**: subgroup_mode, min_measurements, warn_below_count, stored_sigma, stored_center_line, limits_calc_params
3. **Attribute charts**: data_type, attribute_chart_type, default_sample_size
4. **CUSUM**: chart_type, cusum_target, cusum_k, cusum_h, cusum_reset_after_sample_id
5. **EWMA**: ewma_lambda, ewma_l
6. **Distribution fitting**: distribution_method, box_cox_lambda, distribution_params
7. **Laney/Short-run**: use_laney_correction, short_run_mode

Plus 5 relationships (hierarchy, rules, samples, config, data_source).

**Evidence**: `backend/src/cassini/db/models/characteristic.py` -- every sprint has added columns to this table. Migration 032 added distribution/Laney fields. Migration 033 added short_run_mode. The `limits_calc_params` column was added later as a JSON text blob.

**Knock-on Effects if Addressed**: This is the central table in the system. Every router, engine, and provider touches it. Splitting it requires careful migration planning and would affect 15+ files.

**Migration Path**:
1. Use a "satellite table" pattern: create `characteristic_cusum_config`, `characteristic_ewma_config`, `characteristic_distribution_config` tables with 1:1 FK to characteristic.
2. Keep the core columns (name, subgroup_size, spec limits, control limits) on the main table.
3. Use `selectinload` on the satellite relationships where needed.
4. This can be done incrementally -- add satellite tables, populate from existing columns, add dual-write, then drop old columns.

**Recommendation**: MEDIUM priority (high impact but manageable risk). The god object is stable and well-understood, but every new SPC feature adds more columns. The satellite table approach would cap the growth.

---

### [STRUCTURAL] F-04: Event Bus Wiring is Scattered Between main.py and Component Constructors

**Severity**: MEDIUM
**Scope**: `main.py`, `core/notifications.py`, `core/broadcast.py`, `core/anomaly/detector.py`, `core/publish.py`, `core/erp/`

**Description**: Event bus subscriptions happen in two different places with two different patterns:

1. **In `main.py` lifespan**: 6 audit event subscriptions are defined as inline closures and wired directly in the lifespan function (lines 257-331). The audit service is also monkey-patched onto services via `notification_dispatcher._audit_service = audit_service`.
2. **In component constructors**: `NotificationDispatcher.__init__()`, `WebSocketBroadcaster.__init__()`, `AnomalyDetector.__init__()`, `MQTTPublisher.__init__()` each subscribe themselves to the event bus during construction.

Additionally, event publishing happens from routers (`api/v1/samples.py`, `api/v1/violations.py`, `api/v1/characteristics.py`) rather than from the core engine layer, which means the event bus contract leaks into the API layer.

**Evidence**:
- `backend/src/cassini/main.py` lines 254-331: 6 inline audit subscription closures
- `backend/src/cassini/api/v1/samples.py` line 939: `await event_bus.publish(SampleProcessedEvent(...))`
- `backend/src/cassini/api/v1/characteristics.py` line 1528: `await event_bus.publish(event)`
- `backend/src/cassini/core/engine/spc_engine.py` lines 592, 699: publishes from the core engine (correct pattern)

**Knock-on Effects if Addressed**: Consolidating subscriptions would require a registry or auto-discovery pattern. Moving event publishing out of routers into the core layer is straightforward but touches many files.

**Migration Path**:
1. Create an `EventWiring` class or module that registers all subscriptions in one place, called from lifespan.
2. Move event publishing from routers (`samples.py`, `violations.py`, `characteristics.py`) into the core service/engine layer where the business logic actually happens. The router should just call the service method; the service publishes events.
3. Replace `_audit_service` monkey-patching with constructor injection.

**Recommendation**: MEDIUM priority. The current approach works but makes it hard to reason about event flow. A newcomer would need to grep the entire codebase to understand what subscribes to what.

---

### [STRUCTURAL] F-05: Duplicate LicenseService Instantiation in main.py

**Severity**: MEDIUM
**Scope**: `main.py`

**Description**: `LicenseService` is instantiated **twice** in `main.py`:
1. Line 91-95: In the lifespan function, stored in `app.state.license_service`
2. Lines 443-448: At module scope for router registration (`_license_svc = LicenseService(...)`)

The module-scope instantiation runs at import time (before the lifespan), creating a second license check that reads the license file and public key again. If the license file state changes between import and startup, these two instances could disagree.

**Evidence**: `backend/src/cassini/main.py` lines 91 and 443.

**Knock-on Effects if Addressed**: Minimal -- straightforward fix.

**Migration Path**: Use a deferred router registration approach. Either:
1. Move commercial router registration into the lifespan function (after the license service is created), or
2. Use `app.state.license_service` for the router check (requires restructuring since `app` is defined after lifespan).
3. Simplest: make `_license_svc` reference the same singleton pattern or extract to a shared function.

**Recommendation**: LOW priority but easy fix. The two instances will typically agree but the pattern is incorrect.

---

### [DATA MODEL] F-06: 53 Migrations with Sprint-Level Granularity Creates Operational Risk

**Severity**: MEDIUM
**Scope**: `backend/alembic/versions/`

**Description**: There are 53 migration files accumulated over 8 sprints plus incremental additions. The chain is linear (single head, no branches -- which is good), but the naming convention shifted over time:
- Early migrations: `20260202_0000_initial_schema.py` (date-prefixed)
- Sprint migrations: `20260221_sprint5_statistical_credibility.py` (sprint-named)
- Later additions: `028_add_cusum_ewma_support.py` (numeric prefix)
- Auto-generated: `20260226_0241_2f7abf1ce2dc_add_system_settings_table.py` (Alembic hash)

Four different naming conventions in one migration chain. While functionally harmless (Alembic uses revision hashes), it makes manual inspection and troubleshooting harder.

More concerning: sprint-level migrations like `20260222_sprint6_compliance_gate.py` bundle many table creations into single migrations, making partial rollback impossible if any one table has issues.

**Evidence**: `backend/alembic/versions/` -- 53 files, 4 naming patterns, bundled sprint migrations.

**Knock-on Effects if Addressed**: Cannot retroactively split existing migrations. Only affects future migrations.

**Migration Path**:
1. Standardize naming convention going forward (e.g., `YYYYMMDD_HHMM_<hash>_<description>.py`).
2. For new sprints, create one migration per table/concern rather than bundling.
3. Consider a migration squash for deployment (create a single "baseline" migration that represents the full schema at a known good state, for new installations only).

**Recommendation**: LOW priority for existing migrations. Enforce convention for new ones.

---

### [STRUCTURAL] F-07: Frontend Type Definitions are Fragmented Across 3+ Locations

**Severity**: MEDIUM
**Scope**: Frontend `types/`, `api/client.ts`, `api/*.api.ts`

**Description**: TypeScript interface definitions are scattered across at least three locations:

| Location | Interface Count | Purpose |
|----------|----------------|---------|
| `types/index.ts` | 90 | Core domain types |
| `api/client.ts` | 53 | API request/response types (mixed with HTTP client code) |
| `api/*.api.ts` files | 33 | More API types (doe, erp, predictions, etc.) |
| **Total** | **176** | |

The `api/client.ts` file is 759 lines -- roughly half HTTP client infrastructure and half type definitions. Types that logically belong together (e.g., FAI types in `client.ts` vs FAI API functions in `fai.api.ts`) are split across files.

**Evidence**:
- `frontend/src/api/client.ts` -- 53 exported interfaces including FAI, MSA, Gage Bridge, Signature, Import, OIDC, Notification types
- `frontend/src/types/index.ts` -- 90 exported interfaces for core domain objects
- `frontend/src/api/doe.api.ts` -- 10 inline type definitions
- `frontend/src/api/predictions.api.ts` -- 9 inline type definitions

**Knock-on Effects if Addressed**: Moving types requires updating all import paths. With the `@/` alias this is manageable.

**Migration Path**:
1. Extract all types from `api/client.ts` into domain-specific files under `types/` (e.g., `types/fai.ts`, `types/msa.ts`, `types/signatures.ts`).
2. Move inline types from `api/*.api.ts` files into the same domain-specific type files.
3. Keep `api/client.ts` as pure HTTP infrastructure (fetchApi, token management, re-exports).
4. `types/index.ts` remains the barrel export.

**Recommendation**: MEDIUM priority. The fragmentation makes it hard to find the canonical type for any given entity.

---

### [STRUCTURAL] F-08: Inconsistent Inline Pydantic Models in Router Files

**Severity**: MEDIUM
**Scope**: Backend `api/v1/` routers

**Description**: Seven router files define Pydantic `BaseModel` classes inline rather than placing them in the `api/schemas/` directory:

| Router | Inline Models | Has Schema File? |
|--------|--------------|------------------|
| `api_keys.py` | 4 | No |
| `audit.py` | 3 | No |
| `capability.py` | 3 | No |
| `rule_presets.py` | 4 | No |
| `samples.py` | 4 | Yes (also uses schemas) |
| `providers.py` | 3 | No |
| `devtools.py` | 2 | No |

This is despite the project having a well-organized `api/schemas/` directory with 38 dedicated schema files.

**Evidence**: The schema directory exists at `backend/src/cassini/api/schemas/` with files for most domains, but the above routers define their request/response models inline, creating inconsistency about where to look for API contracts.

**Knock-on Effects if Addressed**: Minimal -- standard refactoring.

**Migration Path**: Move inline models to corresponding schema files. For `samples.py` which uses both patterns, consolidate all models into `schemas/sample.py`.

**Recommendation**: LOW priority but easy wins for consistency.

---

### [CROSS-CUTTING] F-09: Audit Trail Has Gaps for Non-HTTP Operations

**Severity**: MEDIUM
**Scope**: `core/audit.py`, `main.py`, event-driven operations

**Description**: The audit system has two tiers:
1. **HTTP Middleware** (automatic): Captures all mutating HTTP requests via `AuditMiddleware`
2. **Event Bus subscribers** (manual): 6 event types subscribed in `main.py` for background operations

Gaps identified:
- **SampleProcessedEvent** is published from routers but has **no audit subscriber** -- sample creation via automated providers (MQTT/OPC-UA) is not audit-logged.
- **SignatureCreatedEvent**, **SignatureRejectedEvent**, **WorkflowCompletedEvent** are published by the signature engine but have **no audit subscribers** (only the HTTP middleware captures signature API calls). If signatures are created via the event bus pathway (e.g., auto-expiry), they would not be audited.
- The **PurgeEngine** runs on a 24-hour background cycle and deletes data according to retention policies. It logs to its own `purge_history` table but does **not** emit events or create audit log entries.
- **ERP sync** has an audit subscriber for `ERPSyncCompletedEvent` but not for `ERPSyncStartedEvent` (which does not exist as an event type).

**Evidence**:
- `main.py` lines 318-331: Only 6 event types are audit-subscribed: ViolationCreated, ControlLimitsUpdated, CharacteristicCreated, CharacteristicDeleted, AnomalyDetected, ERPSyncCompleted.
- 18 event types are defined in `core/events/events.py` but only 6 have audit subscriptions.
- The `PurgeEngine` in `core/purge_engine.py` operates outside the event bus entirely for its deletion operations.

**Knock-on Effects if Addressed**: Adding audit subscribers is additive -- no breaking changes.

**Migration Path**:
1. Add audit subscriptions for SampleProcessedEvent (covers automated data collection).
2. Add audit subscriptions for signature lifecycle events.
3. Have PurgeEngine emit events and/or call AuditService directly.
4. Create an `_AUDITED_EVENTS` registry so gaps are visible at a glance.

**Recommendation**: HIGH priority for regulated-industry customers. The current gaps mean 21 CFR Part 11 compliance has blind spots for background operations.

---

### [CROSS-CUTTING] F-10: RBAC is Not Plant-Scoped in All Routers That Should Be

**Severity**: MEDIUM
**Scope**: Backend `api/v1/` routers

**Description**: Plant-scoped RBAC (`check_plant_role` / `resolve_plant_id_for_characteristic`) is applied inconsistently. Several routers that operate on plant-scoped data use only global role checks:

| Router | Has Plant-Scoped RBAC | Should Have It? |
|--------|----------------------|-----------------|
| `import_router.py` | No (only `get_current_user`) | Yes -- imports target a characteristic which belongs to a plant |
| `notifications.py` | No (only `get_current_user`/`admin`) | Debatable -- SMTP config is global, but preferences could be plant-scoped |
| `push.py` | No (only `get_current_user`) | Debatable -- push subscriptions are per-user |
| `hierarchy.py` | No (only `get_current_user`/`engineer`) | Yes -- hierarchy nodes belong to plants |
| `characteristic_config.py` | No (only `get_current_user`/`engineer`) | Yes -- configs are per-characteristic which is per-plant |
| `tags.py` | No (only `get_current_engineer`) | Yes -- tag mappings link to characteristics |

**Evidence**: The grep for `check_plant_role` across all routers shows that `import_router.py`, `hierarchy.py`, `characteristic_config.py`, and `tags.py` do not perform plant-scoped authorization despite operating on plant-scoped resources.

**Knock-on Effects if Addressed**: Requires resolving plant_id for each resource and adding authorization checks. Could break existing workflows where engineers manage resources across plants.

**Migration Path**:
1. Add `resolve_plant_id_for_characteristic` calls to `import_router.py`, `characteristic_config.py`, and `tags.py`.
2. Add `resolve_plant_id_for_hierarchy` (new helper) to `hierarchy.py`.
3. Test with multi-plant users to verify no regressions.

**Recommendation**: MEDIUM priority. A supervisor at Plant A should not be able to modify configurations at Plant B.

---

### [SCALING] F-11: main.py Lifespan is a 350-Line God Function

**Severity**: MEDIUM
**Scope**: `main.py`

**Description**: The lifespan function in `main.py` is 305 lines (lines 82-387) handling:
- Database initialization and migration checking
- Admin bootstrap
- WebSocket manager startup
- MQTT initialization and provider wiring
- OPC-UA initialization (commercial)
- Anomaly detector setup (commercial)
- Forecasting engine setup (commercial)
- Signature engine setup (commercial)
- Notification dispatcher setup (commercial)
- Push service setup (commercial)
- ERP sync engine setup (commercial)
- ERP outbound publisher setup (commercial)
- Audit service setup and 6 event subscriptions (commercial)
- Purge engine startup (commercial)
- Report scheduler startup (commercial)
- Shutdown for all of the above (in reverse order)

Additionally, `main.py` imports 58 router modules at the top level, making it a 506-line file that is the single point of change for every new feature.

**Evidence**: `backend/src/cassini/main.py` -- 506 lines, 58 imports, lifespan function covering 305 lines.

**Knock-on Effects if Addressed**: Extracting startup into dedicated modules would require careful ordering (dependencies between services).

**Migration Path**:
1. Extract a `startup.py` module with functions like `init_mqtt()`, `init_commercial_services()`, `init_audit_wiring()`.
2. Extract a `routers.py` module that registers all routers (community and commercial).
3. The lifespan becomes a thin orchestrator: `await init_database()`, `await init_messaging()`, `if commercial: await init_commercial()`, `yield`, `await shutdown()`.

**Recommendation**: MEDIUM priority. Every new feature requires touching this file. Splitting it would reduce merge conflicts in parallel development.

---

### [STRUCTURAL] F-12: Frontend Has 82 Flat-Structured Components in Root Directory

**Severity**: LOW
**Scope**: `frontend/src/components/`

**Description**: Of 209 total `.tsx` component files, 82 (39%) live directly in `components/` without subdirectory organization. The remaining 127 are organized into 19 subdirectories (`analytics/`, `anomaly/`, `capability/`, etc.). This creates a flat namespace of 82 files at the root component level, making navigation difficult.

The largest flat components by line count:
- `ControlChart.tsx` (1767 lines)
- `ReportPreview.tsx` (1130 lines)
- `DistributionHistogram.tsx` (930 lines)
- `ImportWizard.tsx` (750 lines)

**Evidence**: `frontend/src/components/` directory listing shows 82 `.tsx` files at root level vs 127 in subdirectories.

**Knock-on Effects if Addressed**: Requires updating all import paths (mitigated by `@/` alias).

**Migration Path**: Group related components into subdirectories:
- `components/charts/` -- ControlChart, AttributeChart, CUSUMChart, EWMAChart, ParetoChart, HistogramPositionSelector
- `components/forms/` -- CharacteristicForm, ManualEntryPanel, AttributeEntryForm, NumberInput, DateTimePicker
- `components/layout/` -- Layout, Sidebar, Header, KioskLayout, MobileNav, BottomDrawer
- `components/settings/` (already exists -- move AppearanceSettings, LocalizationSettings, etc. into it)

**Recommendation**: LOW priority. Functional but makes the codebase harder to navigate as component count grows.

---

### [SCALING] F-13: No Service Layer -- Routers Call Engines and Repositories Directly

**Severity**: MEDIUM
**Scope**: Entire backend

**Description**: The backend has three layers: API routers, Core engines, and DB repositories. There is no explicit "service" layer that encapsulates business operations. Routers directly orchestrate:
- Repository CRUD
- Engine calculations
- Event publishing
- Audit context setting
- Transaction management

This means that the same business operation (e.g., "submit a sample") has different implementations depending on the entry point:
- `api/v1/samples.py` line 939: Publishes `SampleProcessedEvent` after commit
- `api/v1/data_entry.py` line 219: Does NOT publish `SampleProcessedEvent` for standard Shewhart samples
- `core/providers/` pathway: Publishes events via the SPC engine

**Evidence**:
- `api/v1/data_entry.py` -- submits samples through `SPCEngine.process_sample()` which publishes events, but the CUSUM/EWMA code paths (lines 133-197) build their own response without going through the SPC engine's event publishing
- `api/v1/samples.py` -- has its own event publishing code (lines 939-961) that duplicates what the SPC engine does
- No `core/services/` directory exists

**Knock-on Effects if Addressed**: Introducing a service layer requires careful migration -- all router code that does "business logic" needs to be extracted.

**Migration Path**:
1. Start with a `SampleService` that encapsulates: create sample, process through engine, publish events, return result.
2. Both `samples.py` and `data_entry.py` routers call `SampleService.submit()`.
3. Gradually extract services for other domains (capability, FAI approval, MSA completion).

**Recommendation**: MEDIUM priority. The lack of a service layer is why event publishing is inconsistent and why the same operation has multiple implementations.

---

### [API DESIGN] F-14: Pagination is Not Uniformly Applied

**Severity**: LOW
**Scope**: Backend `api/v1/` routers

**Description**: Core endpoints (characteristics, samples, violations) use the shared `PaginatedResponse[T]` pattern with consistent offset/limit parameters. However, many commercial endpoints return unbounded lists:

- `anomaly.py` -- has ad-hoc offset/limit parameters but no `PaginatedResponse` wrapper
- `predictions.py` -- no pagination on list endpoints
- `multivariate.py` -- no pagination on group listings
- `doe.py` -- no pagination on study listings
- `fai.py` -- no pagination on report listings
- `msa.py` -- no pagination on study listings

**Evidence**: Only `characteristics.py`, `samples.py`, and `violations.py` import and use `PaginatedResponse` from `api/schemas/common.py`.

**Knock-on Effects if Addressed**: Adding pagination to existing endpoints is a breaking API change unless the response envelope is made backward-compatible.

**Migration Path**:
1. Add pagination to commercial list endpoints using the existing `PaginatedResponse` pattern.
2. Default limit of 100 prevents unbounded queries.
3. Frontend hooks may need updating to handle the new envelope format.

**Recommendation**: LOW priority for now (data volumes in commercial features are typically small), but becomes HIGH at scale with many MSA studies, DOE experiments, or prediction models.

---

### [CROSS-CUTTING] F-15: Signature System is Not Integrated Into Most Approval Workflows

**Severity**: LOW
**Scope**: FAI, MSA, capability snapshots, ERP config changes

**Description**: Per the project's own CLAUDE.md cross-cutting requirements:
> "Every approval/sign-off workflow SHOULD integrate with the signature system"

The signature engine (`core/signature_engine.py`) is well-built with SHA-256 hashing, workflow steps, and role-based signing. However, only the Signatures Settings UI exercises it. The FAI approval workflow (draft -> submitted -> approved) uses a simple status field change without requiring electronic signatures. The MSA study completion has no sign-off workflow. Capability snapshots have no signature validation.

**Evidence**:
- `api/v1/fai.py` -- approve endpoint changes `status` to "approved" without calling `signature_engine.sign()` or `check_workflow_required()`
- `api/v1/msa.py` -- no signature imports
- `api/v1/capability.py` -- no signature imports
- The `CLAUDE.md` explicitly documents this as a requirement: "Regulatory-required workflows (FAI approval, MSA sign-off, data purge): call `initiate_workflow()` + `sign()` -- MUST block the action if `check_workflow_required()` returns True"

**Knock-on Effects if Addressed**: Each workflow needs: check if signature required -> if yes, initiate workflow -> block action until signed. Frontend needs `<SignatureDialog>` embedded in each approval button.

**Migration Path**: Follow the documented pattern:
1. FAI approve endpoint: call `check_workflow_required("fai_report", report_id)` before allowing status change
2. MSA complete endpoint: same pattern
3. Add `<SignatureDialog>` to FAI and MSA frontend components
4. Make configurable per-plant (some plants may not need electronic signatures)

**Recommendation**: LOW priority for non-regulated deployments, but CRITICAL for any customer claiming 21 CFR Part 11 compliance.

---

### [SCALING] F-16: Heavy Dependencies Unconditionally Required

**Severity**: LOW
**Scope**: `backend/pyproject.toml`

**Description**: The `pyproject.toml` lists 31 mandatory dependencies including several heavy packages that not all deployments need:
- `asyncua>=1.1.0` -- OPC-UA client (commercial-only feature)
- `protobuf>=5.29.0` -- SparkplugB (only needed with MQTT SparkplugB)
- `aiosmtplib>=3.0.0` -- Email (commercial-only)
- `pywebpush>=2.0.0` -- Push notifications (commercial-only)
- `statsmodels>=0.14.0` -- Forecasting (commercial-only)
- `xhtml2pdf>=0.2.16` -- PDF report generation
- `ruptures>=1.1.9` -- Anomaly detection (commercial-only)
- `croniter>=1.4.0` -- ERP scheduling (commercial-only)
- `authlib>=1.3.0` -- OIDC (commercial-only)

Only `scikit-learn` is properly gated as an optional dependency (`[project.optional-dependencies.ml]`).

**Evidence**: `backend/pyproject.toml` lines 8-42 -- all 31 dependencies are unconditionally required.

**Knock-on Effects if Addressed**: Moving dependencies to optional extras requires guarding all imports with try/except or feature flags.

**Migration Path**:
1. Create optional dependency groups: `[project.optional-dependencies.opcua]`, `[project.optional-dependencies.erp]`, etc.
2. Guard imports with try/except (some already do this -- e.g., `ForecastingEngine` import in main.py).
3. Community edition install: `pip install cassini` (core only). Commercial: `pip install cassini[all]`.

**Recommendation**: LOW priority for development. Becomes meaningful for Docker image size and deployment simplicity.

---

## Architecture Diagram Observations

### What Works Well

1. **Event Bus Pattern**: The event bus (`core/events/bus.py`) is well-designed -- type-safe subscriptions, error isolation, async fire-and-forget with graceful shutdown. The pattern itself is sound; the problem is inconsistent adoption.

2. **Open-Core License Gating**: The separation between community and commercial features is clean at the router registration level (main.py lines 420-476) and the lifespan level (line 179). Frontend mirrors this with `<RequireCommercial>` wrapper components.

3. **Multi-Dialect Database**: The `db/dialects.py` abstraction supporting SQLite/PostgreSQL/MySQL/MSSQL with encrypted credential storage is well-architected.

4. **Auth Infrastructure**: JWT + refresh cookie pattern with shared promise queue for concurrent 401 handling is correct. The proactive token refresh before expiry is a nice touch.

5. **Frontend Provider Ordering**: The comment in CLAUDE.md about PlantProvider and WebSocketProvider being inside RequireAuth is correctly enforced in `App.tsx` lines 162-170.

### What Does Not Fit Together

1. **The "Repository" Layer**: Exists for ~15 models but is bypassed by 25+ routers. It provides a false sense of architectural layering. The codebase would be more honest if it either committed to repositories everywhere or adopted a different pattern (e.g., query objects, CQRS).

2. **Sprint 9 Modules Feel Bolted On**: The `predictions.py` (835 lines, 47 SQL operations), `multivariate.py` (899 lines), and `doe.py` (687 lines) routers are essentially standalone mini-applications within the API. They have no repositories, no dedicated service layer, and minimal event bus integration. They interact with the rest of the system only through the Characteristic foreign key.

3. **Two Patterns for Background Processing**: Some operations use the event bus (violations, anomaly detection, notifications) while others use direct background tasks (purge engine with `asyncio.create_task`, report scheduler with its own loop, ERP sync engine with croniter). There is no unified task/job abstraction.

---

## Statistics

- **Total findings**: 16
- **HIGH**: 3 (F-01 Repository bypass, F-02 Layer violations, F-09 Audit gaps)
- **MEDIUM**: 8 (F-03 God object, F-04 Event wiring, F-05 Duplicate license, F-07 Frontend types, F-08 Inline models, F-10 RBAC gaps, F-11 God lifespan, F-13 No service layer)
- **LOW**: 5 (F-06 Migration naming, F-12 Flat components, F-14 Pagination, F-15 Signature gaps, F-16 Dependencies)

### Severity Assessment

The codebase is **functional and ships features rapidly**, which is appropriate for its stage. However, the three HIGH findings (repository bypass, layer violations, audit gaps) represent structural debt that will compound:

- **Repository bypass** makes it impossible to add cross-cutting concerns (caching, multi-tenancy, read replicas) at the data access layer.
- **Layer violations** prevent extracting the core engine as a reusable library or running business logic in worker processes.
- **Audit gaps** are a compliance risk for the regulated-industry customers this product targets.

The recommended priority order for remediation:
1. Fix layer violations (F-02) -- small scope, high leverage
2. Add missing audit subscriptions (F-09) -- additive, no breaking changes
3. Extract service layer for sample submission (F-13 partial) -- eliminates the event publishing inconsistency
4. Begin repository extraction for Sprint 9 modules (F-01 partial) -- isolated, low risk
5. Satellite tables for Characteristic (F-03) -- requires careful migration planning
