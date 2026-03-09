---
type: feature
status: active
tags:
  - architecture
  - active
---

# System Overview

Cassini is a Statistical Process Control (SPC) platform by Saturnis, organized as a monorepo with three packages.

## Backend — `backend/`

- **Framework**: FastAPI with async SQLAlchemy ORM and Alembic migrations
- **Runtime**: Python 3.11+
- **Database**: Multi-dialect support via `db/dialects.py` — SQLite (dev), PostgreSQL, MySQL, MSSQL
- **Structure**: Routers in `api/v1/`, Pydantic schemas in `api/schemas/`, repositories in `db/repositories/`, models in `db/models/`
- **Stats**: ~45 models, ~29 routers (~263 endpoints), ~17 repositories, 38 migrations

## Frontend — `frontend/`

- **Stack**: React 19, TypeScript 5.9, Vite 7
- **Server state**: TanStack Query v5 (hooks in `api/hooks/`)
- **Client state**: Zustand v5 (stores in `stores/`)
- **Charts**: ECharts 6 via tree-shaken `lib/echarts.ts`, lifecycle managed by `useECharts` hook
- **Styling**: Tailwind CSS v4 with `prettier-plugin-tailwindcss`
- **Validation**: Zod v4 schemas in `schemas/`
- **Stats**: ~195 files, ~145 components, 14 pages, ~120 React Query hooks, 26 API namespaces

## Bridge — `bridge/`

- **Purpose**: `cassini-bridge` pip package — serial gage to MQTT translator for shop floor PCs
- **Parsers**: Mitutoyo Digimatic protocol + generic regex
- **Transport**: pyserial (RS-232/USB) to paho-mqtt
- **CLI**: `cassini-bridge list-ports | test-port | run`
- **Auth**: API key (SHA-256, shown once at registration)

## Authentication & Authorization

- **JWT**: Access token (15 min) + refresh cookie (7 day, httpOnly, path `/api/v1/auth`)
- **Token refresh**: Shared promise queue in `api/client.ts` — never a boolean flag for concurrent 401 handling
- **RBAC**: 4-tier hierarchy — operator < supervisor < engineer < admin, per-plant via `user_plant_role` join table
- **SSO/OIDC**: DB-backed state store, claim mapping, plant-scoped role mapping, account linking, RP-initiated logout

## Key Architectural Patterns

### Event Bus

Internal pub/sub in `core/events/bus.py`. Publishers (SPCEngine, AttributeEngine, DataEntry API, ERPSyncEngine) emit events consumed by subscribers (NotificationDispatcher, AnomalyDetector, AuditService, PushService, ERPOutboundPublisher).

Key events: `SampleProcessedEvent`, `ViolationCreatedEvent`, `ControlLimitsUpdatedEvent`, `ERPSyncEvent`.

### Polymorphic Joined Table Inheritance (JTI)

`DataSource` (base) with `MQTTDataSource` and `OPCUADataSource` subtables. Polymorphic on `type` column. No explicit `.join(DataSource)` when querying subclasses — SQLAlchemy auto-joins.

### Repository Pattern

Async repositories in `db/repositories/` wrap SQLAlchemy queries. Must use `selectinload` for relationship access in async context.

### API Client (`fetchApi`)

Central client in `frontend/src/api/client.ts` handles auth headers, 401 refresh (shared promise queue), and error parsing. Paths never include `/api/v1/` prefix — `fetchApi` prepends it.

### WebSocket

Real-time sample/violation streams at `/ws/samples` and `/ws/alerts`. `WebSocketProvider` must be inside `RequireAuth`.

## Feature Dependency Graph

The SPC engine is the central processing hub. Most features depend on it:

- **Core**: spc-engine, capability, data-entry, connectivity
- **Compliance**: signatures (21 CFR Part 11), msa (Gage R&R), fai (AS9102)
- **Intelligence**: anomaly (PELT/K-S/IsolationForest), analytics (multivariate, predictions, DOE)
- **Operations**: notifications, retention, reporting, admin/audit

## Related Notes

- [[Data Model]] — Entity relationships and schema details
- [[API Contracts]] — Endpoint catalog and patterns
- [[Design System]] — Visual tokens and component conventions
- [[Features/]] — Per-feature deep dives
