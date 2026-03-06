# Cassini — CLAUDE.md

## Project Overview
Statistical Process Control (SPC) platform by Saturnis. Monorepo with three packages:
- **Backend**: `backend/` — FastAPI, SQLAlchemy async, Alembic, Python 3.11+
- **Frontend**: `frontend/` — React 19, TypeScript 5.9, Vite 7, TanStack Query v5, Zustand v5, ECharts 6
- **Bridge**: `bridge/` — `cassini-bridge` pip package, serial gage → MQTT translator

## Commands
```bash
# Frontend
cd frontend && npm run dev          # Dev server (Vite)
cd frontend && npm run build        # Production build (tsc -b && vite build)
cd frontend && npx tsc --noEmit     # Type check only (faster, no project refs)
cd frontend && npx tsc -b           # Full build check (strict, noUnusedLocals)

# Backend
cd backend && uvicorn cassini.main:app --reload   # Dev server
cd backend && python -m pytest tests/ -x          # Run tests
cd backend && alembic upgrade head                 # Run migrations
cd backend && alembic revision --autogenerate -m "description"  # New migration

# Bridge
cd bridge && pip install -e .       # Dev install
cassini-bridge run                  # Run bridge agent
```

---

## Cross-Cutting Requirements (ALL New Features)

**These are checklists, not prose. Run them for every feature.**

### Audit Trail Checklist
**Trigger**: Any new URL prefix, new resource type, or background operation.

- [ ] Add `_RESOURCE_PATTERNS` regex entry in `core/audit.py` for each new URL prefix
- [ ] Add domain-specific action keywords to `_method_to_action()` (e.g., "submit", "approve", "analyze")
- [ ] Add `RESOURCE_LABELS` and `ACTION_LABELS` entries in `frontend/src/components/AuditLogViewer.tsx`
- [ ] For background/event-bus-driven operations: add explicit `audit_service.log()` calls (HTTP middleware only captures HTTP requests)

### Electronic Signatures Checklist
**Trigger**: Any approval/sign-off workflow.

- [ ] Regulatory-required workflows (FAI approval, MSA sign-off, data purge): call `initiate_workflow()` + `sign()` — MUST block if `check_workflow_required()` returns True
- [ ] Optional workflows (DOE analysis, ERP config, capability snapshots): call `sign_standalone()` — configurable per plant
- [ ] On resource modification after signing: call `invalidate_signatures_for_resource()`
- [ ] Frontend: embed `<SignatureDialog>` component in approval buttons
- [ ] Resource hashes MUST include actual content, not just type+id

### API Contract Checklist
**Trigger**: Any new or modified API endpoint.

- [ ] `fetchApi` paths NEVER include `/api/v1/` prefix — `fetchApi` prepends it automatically
- [ ] TypeScript types match Pydantic schemas field-for-field (run `npx tsc --noEmit`)
- [ ] Error responses NEVER pass `str(e)` to API clients — log server-side, return generic messages

### Obsidian Vault Checklist
**Trigger**: Any completed sprint, design, decision, audit, or lesson learned.

> **RULE**: Update the Obsidian vault after completing any sprint, design, decision, audit, or lesson.
> CLI: `"/c/Users/djbra/AppData/Local/Programs/Obsidian/Obsidian.com"` with `vault=cassini-vault`.
> Create or update the relevant note with YAML properties, tags, and `[[wikilinks]]` to related notes.
> The vault is the source of truth for project planning and history. Flat `.planning/` files are legacy.
> At session start, read the `Session Start` dashboard note. For significant work, append to the daily note.

---

## Pitfalls — Will Crash or Corrupt Data

These have caused production bugs before. Violating any of them WILL break something.

### Backend

> **RULE**: NEVER access SQLAlchemy relationships in async context without `selectinload`. Use direct `select()` queries for cross-relationship column access.

> **RULE**: NEVER explicitly `.join(DataSource)` when querying JTI subclasses (MQTTDataSource, OPCUADataSource). SQLAlchemy auto-joins the parent table. Explicit join causes "ambiguous column" on SQLite.

> **RULE**: Never modify executed Alembic migrations. Always create new ones.

> **RULE**: Never use `lastrowid` in migrations (returns 0 on PostgreSQL). Insert, SELECT back by unique column, then insert children.

> **RULE**: SQLite FK recreation in `batch_alter_table`: use naming convention dict. Always `drop_constraint` before `create_foreign_key` — never skip the drop.

> **RULE**: FastAPI route ordering: static paths MUST come before `/{param}` — top-to-bottom matching.

### Frontend

> **RULE**: ECharts container div MUST always be in DOM. Use `visibility: hidden` for loading states, NOT conditional rendering.

> **RULE**: Token refresh uses shared promise queue. NEVER use a boolean flag for concurrent 401 handling.

> **RULE**: Always wrap `navigate()` in `useEffect`. NEVER call during render.

> **RULE**: Show Your Work value matching: the explain API's returned value MUST exactly match what the caller displays. Dashboard quickStats uses subgroup means + sigma of means; CapabilityCard uses individual measurements + stored_sigma. Pass `chartOptions` through `<Explainable>` to select the correct mode.

---

## Pitfalls — Will Cause Subtle Bugs

These won't crash immediately but produce wrong behavior that's hard to trace.

### Backend
- **DB encryption key**: `.db_encryption_key` is separate from `.jwt_secret` — JWT rotation must not brick stored credentials
- **Config validation**: `short_run_mode` incompatible with attribute data or CUSUM/EWMA. `use_laney_correction` only for p/u charts
- **Legacy shim**: `backend/src/openspc/__init__.py` redirects `openspc.*` imports to `cassini.*` for old Alembic migrations

### Frontend
- **Provider ordering**: PlantProvider, WebSocketProvider must be inside RequireAuth
- **Query invalidation**: `useUpdateCharacteristic` must invalidate `['characteristics', 'chartData', id]` — doesn't match `['characteristics', 'detail', id]`
- **CharacteristicForm onChange**: Type is `(field: string, value: string | boolean)` — checkboxes pass booleans
- **ExplanationPanel z-index**: Uses `z-[60]` to render above modals (z-50). Do not lower this

---

## Style & Convention

- **Prettier**: No semicolons, single quotes, trailing commas, 100 char width
- **TypeScript**: Strict mode, `noUnusedLocals`, `noUnusedParameters`
- **Imports**: Use `@/` alias, never relative paths crossing directories
- **Components**: Function components, named exports, one component per file
- **Hooks**: Custom hooks in `hooks/`, React Query hooks in `api/hooks/`
- **localStorage keys**: Use `cassini-` prefix (migration from `openspc-` in main.tsx)
- **Characteristic display**: Names are NOT unique — ALWAYS show hierarchy breadcrumb path (e.g., "Plant > Line > Station"). On detail views use `useHierarchyPath()` hook; on list/card views include `hierarchy_path` from the API response. Backend endpoints that return characteristics should include the path string.

---

## Architecture

### Backend
- **API**: FastAPI routers in `src/cassini/api/v1/`, Pydantic schemas in `api/schemas/`
- **DB**: SQLAlchemy async models in `db/models/`, repositories in `db/repositories/`
- **Multi-dialect**: SQLite (dev), PostgreSQL, MySQL, MSSQL via `db/dialects.py`
- **Auth**: JWT access (15min) + refresh cookie (7d httpOnly, path `/api/v1/auth`)
- **Roles**: operator < supervisor < engineer < admin, per-plant via `user_plant_role`

### Frontend
- **Path alias**: `@/` → `src/` (configured in tsconfig)
- **API client**: `fetchApi` in `api/client.ts` — handles auth, 401 refresh, error parsing
- **API namespaces**: Split across `api/*.api.ts` files, hooks in `api/hooks/`
- **State**: Zustand for client state (`stores/`), React Query for server state
- **Charts**: ECharts 6 via tree-shaken `lib/echarts.ts`, lifecycle via `useECharts` hook
- **Validation**: Zod v4 schemas in `schemas/`, hook in `hooks/useFormValidation.ts`
- **Styling**: Tailwind CSS v4, Prettier with `prettier-plugin-tailwindcss`
- **Visual styles**: Retro (default, sharp corners, monospace) or Glass (frosted, rounded) — independent of light/dark

### Show Your Work (Explain API)
A trust feature for regulated industries — lets users see exactly how every statistical value was computed.
- **Toggle**: Header button enables "Show Your Work" mode. When on, all statistical values get dotted underlines via `<Explainable>` wrapper
- **Click**: Clicking any underlined value opens a slide-out `<ExplanationPanel>` showing the formula (KaTeX-rendered), step-by-step computation, inputs, and AIAG citation
- **Backend**: `api/v1/explain.py` router, `core/explain.py` (ExplanationCollector pattern), `api/schemas/explain.py`
- **Frontend**: `stores/showYourWorkStore.ts` (Zustand toggle + active metric), `components/Explainable.tsx` (wrapper), `components/ExplanationPanel.tsx` (slide-out), `api/explain.api.ts` + `api/hooks/useExplanation.ts`
- **ExplanationCollector**: Optional `collector` param on `calculate_capability()`. When provided, captures computation steps inline via `if collector:` guards. Zero overhead when None.
- **Two data modes** in the explain API (CRITICAL — values must match what the caller displays):
  1. **With chart options** (`start_date`/`end_date`/`limit`): Uses subgroup means + sigma from means — matches dashboard `quickStats`
  2. **Without chart options**: Flattens individual measurements + uses `stored_sigma` (R-bar/d2) — matches capability GET endpoint / CapabilityCard
- **Step filtering**: `METRIC_STEP_PREFIXES` dict filters the collector's full step list to only the computation chain for the requested metric (e.g. Cpk only shows Cpu/Cpl/Cpk steps, not Ppk)
- **Wrapping new values**: Use `<Explainable metric="cpk" resourceId={charId} chartOptions={...}>` around any value that should be explainable. Pass `chartOptions` matching the data window so the explanation value matches the display

## Data Model Notes
- **DataSource**: Polymorphic JTI — base `data_source` + `mqtt_data_source`, `opcua_data_source`. No `provider_type` column. Check `char.data_source is None` for manual
- **Violation.char_id**: Denormalized from `sample.char_id`. Use directly instead of joining Sample
- **Admin bootstrap**: Admin users need ALL plants. Auto-assign admin role on new plant creation

## Knowledge Graph
`.knowledge/` contains an auto-generated codebase knowledge graph with full-stack traces, API contracts, Mermaid diagrams, and a dependency index. Regenerate with `/knowledge-graph`.

- `INDEX.md` — Entry point: stats, feature list, file index
- `ARCHITECTURE.md` — System-level architecture overview
- `DEPENDENCIES.md` — Package and inter-module dependency map
- `features/` — 13 feature-oriented deep dives (spc-engine, capability, connectivity, msa, fai, data-entry, notifications, signatures, anomaly, retention, auth, admin, reporting)

**Note**: The knowledge graph may be stale after recent changes. Check the "Last generated" date in `INDEX.md`. If it's out of date, run `/knowledge-graph diff` for a fast differential update before relying on it for architectural decisions.

## Planning & Docs
- `.planning/gap-closure/STATE.md` — Current sprint progress (read first each session)
- `.planning/gap-closure/ROADMAP.md` — Feature roadmap (source of truth for scope)
- `.planning/gap-closure/DECISIONS.md` — Architecture Decision Records (append-only)
- `.planning/CURRENT-STATE.md` — Codebase baseline assessment

<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **SPC-client** (7217 symbols, 21573 relationships, 300 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/refactoring/SKILL.md` |

## Tools Reference

| Tool | What it gives you |
|------|-------------------|
| `query` | Process-grouped code intelligence — execution flows related to a concept |
| `context` | 360-degree symbol view — categorized refs, processes it participates in |
| `impact` | Symbol blast radius — what breaks at depth 1/2/3 with confidence |
| `detect_changes` | Git-diff impact — what do your current changes affect |
| `rename` | Multi-file coordinated rename with confidence-tagged edits |
| `cypher` | Raw graph queries (read `gitnexus://repo/{name}/schema` first) |
| `list_repos` | Discover indexed repos |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource | Content |
|----------|---------|
| `gitnexus://repo/{name}/context` | Stats, staleness check |
| `gitnexus://repo/{name}/clusters` | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->
