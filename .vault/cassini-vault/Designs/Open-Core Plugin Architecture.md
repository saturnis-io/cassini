---
title: Open-Core Plugin Architecture
type: design
status: approved
date: 2026-03-06
tags:
  - architecture
  - business-model
  - open-core
  - licensing
related:
  - "[[System Overview]]"
  - "[[Competitive Analysis]]"
  - "[[Pricing Strategy]]"
---

# Open-Core Plugin Architecture

## Summary

Split Cassini into an open-source core and a closed-source commercial extension package (`@saturnis/cassini-enterprise`) to protect revenue-generating features while enabling community adoption.

## Business Model

| | Open-Source Core | Commercial Package |
|---|---|---|
| **Repo** | `SPC-client` (public GitHub) | `cassini-enterprise` (private repo) |
| **Backend** | `cassini` pip package | `cassini-enterprise` pip package |
| **Frontend** | `@saturnis/cassini` | `@saturnis/cassini-enterprise` |
| **DB schema** | All tables (including MSA, FAI, etc.) | No migrations — uses core tables |
| **License** | None required | Ed25519 JWT (existing `LicenseService`) |

## Feature Split

### Core (open-source)
- Full SPC engine (control charts, capability, Nelson rules, short-run)
- Single plant with ISA-95 hierarchy
- Manual data entry + single MQTT/OPC-UA connection
- Dashboard, violations, annotations
- Show Your Work (explain API)
- Basic user management, audit trail
- SQLite support

### Commercial (closed-source)
- Multi-plant (2+ plants)
- Cross-plant dashboards (future)
- MSA / Gage R&R
- FAI (First Article Inspection)
- Anomaly detection (ML)
- Scheduled reporting
- Electronic signatures (21 CFR Part 11)
- Data retention policies
- Multiple data source connections
- Enterprise DBs (PostgreSQL, MSSQL, MySQL)
- SSO / LDAP (future)

## Architecture Decisions

### Backend: Conditional Import
Core tries `from cassini_enterprise import initialize` at startup. If absent, runs as Community. If present, mounts commercial routers and services. Commercial imports core models directly — no schema duplication.

### Frontend: Registry Pattern
Core defines an `extensionRegistry` (routes, sidebar items, dashboard widgets, settings panels). Commercial package calls `registerExtension()` at init. Core components consume the registry — if empty, core renders as-is.

### Database: Shared Schema
All models and migrations stay in core. Commercial tables (MSA, FAI, etc.) exist in the open-source schema but are inert without the commercial logic. Value is in the **logic**, not the schema.

### License Enforcement
Existing `LicenseService` (Ed25519-signed JWT). Backend: routers only mount if `is_commercial`. Frontend: checks `/api/v1/license` before registering extensions. Multi-plant cap enforced in core's `POST /plants`.

## Migration Plan

1. **Phase 1** — Add extension points to core (~1 day)
2. **Phase 2** — Scaffold commercial repo (~1 day)
3. **Phase 3** — Extract features one at a time (MSA → FAI → Anomaly → Reports → Retention → Signatures)
4. **Phase 4** — Enforce boundary, CI tests both configs (~1 day)

## Detailed Design

Full implementation details, repo structure, local dev setup, and step-by-step extraction instructions:
`docs/plans/2026-03-06-open-core-plugin-architecture-design.md`

## Risks

- **Core updates breaking commercial**: CI tests both configs. Pin version ranges.
- **Reverse engineering**: License is cryptographic (Ed25519), not obscurity-based.
- **Import cycles**: Commercial imports core. Core never imports commercial (except startup hook).
