# Cassini Testing

This folder hosts test infrastructure that lives outside the source tree.

## Layout

| Path | Purpose |
|------|---------|
| `harness/` | Local broker/sim stacks (MQTT compose, OPC-UA simulator) |

## Canonical Test Suites

- **End-to-end (Playwright)**: `apps/cassini/frontend/e2e/`
  - Run with `cd apps/cassini/frontend && npx playwright test`
  - Specs are organized by feature area (e.g. `dashboard.spec.ts`,
    `audit-log.spec.ts`, `doe.spec.ts`, `msa.spec.ts`, `reports.spec.ts`).
- **Backend unit tests**: `apps/cassini/backend/tests/unit/`
  - Run with `cd apps/cassini/backend && python -m pytest tests/ -x`
- **Backend integration tests**: `apps/cassini/backend/tests/integration/`
- **Containerized tier** (Docker): `pytest -m containerized` against the
  `docker-compose.full.yml` harness — Postgres + MySQL + MSSQL + Valkey +
  Mosquitto + OPC-UA simulator.

## Seed Scripts

All seed scripts live in `apps/cassini/backend/scripts/`. The most relevant:

| Script | Purpose |
|--------|---------|
| `seed_e2e_unified.py` | Dialect-agnostic seed for E2E test runs (preferred) |
| `seed_e2e.py` | Legacy E2E seed (kept for compatibility) |
| `seed_test_nelson.py` | Generates Nelson rule violation patterns for SPC verification |
| `seed_chart_showcase.py` | Realistic chart showcase data |
| `seed_showcase.py` | Full demo dataset |
| `seed_nist_reference.py` | NIST reference datasets for statistical validation |

Industry-flavored datasets are also available for demos:
`seed_aerospace.py`, `seed_pharma.py`, `seed_semiconductor.py`,
`seed_steel_mill.py`, `seed_distillery.py`, `seed_data_center.py`.
