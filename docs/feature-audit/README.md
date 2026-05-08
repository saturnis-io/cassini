# Cassini Feature-Audit

The feature-audit pipeline produces a visual + functional regression
baseline for every distinguishing UI state in Cassini. It has three
components:

1. **`CATALOG.md`** — the spec. 380 UI states across 73 features,
   organized into groups A-O. Each state has a route, seed dependency,
   interaction script, and priority (P0 / P1 / P2).
2. **`SEED_SPEC.md`** — the data contract. Defines the union of
   "Seed needs" lines from the catalog: 3 plants, 7 users, ~17
   characteristics, 90-day sample histories, 20+ violations, MSA / DOE /
   FAI fixtures, CEP rules, SOP-RAG corpus, etc. The implementation
   lives at `apps/cassini/backend/scripts/seed_feature_tour.py`, invoked
   via `seed_e2e_unified.py --profile feature-tour`.
3. **The Playwright skill** — `apps/cassini/frontend/e2e/feature-highlight/`.
   One spec file per group (a-auth.spec.ts, b-core-spc.spec.ts, ...).
   Each test captures one state from the catalog. Output is written to
   this directory's `<group>/<feature>/<NN>-<state>.png`.

## Running the pipeline

From `apps/cassini/frontend/`:

```bash
# Run the full feature-highlight project (P0 only this pass; P1/P2 stubbed)
pnpm test:feature-tour

# Then regenerate MANIFEST.md from the captured screenshots
pnpm feature-tour:manifest
```

The Playwright project (`feature-highlight`) uses its own globalSetup
(`feature-tour-setup.ts`) which:

- Drops and re-creates `apps/cassini/backend/test-feature-tour.db`
- Runs Alembic migrations against the fresh DB
- Invokes `python scripts/seed_e2e_unified.py --profile feature-tour`
- Writes `apps/cassini/backend/feature-tour-manifest.json` with all
  fixture IDs (used by tests to resolve seeded study/report/CEP IDs)

The webserver in `playwright.config.ts` auto-detects the
`feature-highlight` project via process.argv and points uvicorn at
`test-feature-tour.db` instead of `test-e2e.db`.

## Output layout

```
docs/feature-audit/
├── CATALOG.md
├── SEED_SPEC.md
├── README.md           ← this file
├── MANIFEST.md         ← top-level index of every captured state
├── A/
│   ├── MANIFEST.md
│   ├── A1-login-page/
│   │   ├── 01-default.png
│   │   └── 03-submitting.png
│   ├── A2-change-password/
│   ├── A4-plant-switcher/
│   └── ...
├── B/
└── ...
```

Each MANIFEST.md row contains: feature ID, state name, file path,
alt-text suggestion, and marketing slot mapping (e.g. "B2 in-control →
website hero").

## Scope of this pass

P0 only — 143 states. P1 (225 states) and P2 (12 states) are stubbed in
each spec file with `test.skip(true, 'P1 — pending')` so the file
structure is in place for the follow-up pass.

Some P0 states are documented as "best-effort" because the catalog
called for an empty-state plant or a tier downgrade that the seed's
single-shot dataset doesn't reach exactly. These captures still produce
a useful screenshot — review notes in each spec file's comments
identify the gap.

## Cluster Status (M4) and a few seed gaps

Per `SEED_SPEC.md` section 21, the seed deliberately does not produce:

- A multi-node cluster (M4.01-03) → tests skipped with
  `test.skip(true, 'gap: cluster status route requires multi-node setup')`.
- A real ArangoDB / CouchDB / external ERP (E6 ERP/LIMS Integrations) →
  P1 only; P0 is empty-state which is reachable.
- AI insight responses (I4) → captures rely on either the cached
  insight (Aerospace) or `page.route` mocks.

These limitations are documented at the call sites and on the
per-feature MANIFEST rows.
