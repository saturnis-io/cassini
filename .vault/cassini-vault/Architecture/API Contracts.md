---
type: feature
status: active
tags:
  - architecture
  - active
---

# API Contracts

Cassini exposes ~263 endpoints across ~29 routers under `/api/v1`. The frontend communicates through `fetchApi` in `api/client.ts`.

## Key Conventions

### fetchApi Client

- **Never** include `/api/v1/` in paths — `fetchApi` prepends it automatically
- Handles auth headers (Bearer JWT), 401 refresh (shared promise queue), and error parsing
- FormData support for file uploads (CSV import)
- TypeScript types must match Pydantic schemas field-for-field

### Response Format

Successful responses return data directly (no envelope wrapper in practice). Paginated endpoints return `{ items, total, offset, limit, has_more }`.

### Error Handling

- Validation errors: 400 with field-level details
- Auth errors: 401 (triggers token refresh) or 403
- Conflict errors: 409 (has children, has samples, already acknowledged)
- **Never** pass `str(e)` to API clients — log server-side, return generic messages

## Endpoint Namespaces

### Core SPC

| Namespace | Router | Key Endpoints |
|-----------|--------|---------------|
| hierarchy | `hierarchy.py` | CRUD, tree, recursive characteristic listing |
| characteristics | `characteristics.py` | CRUD, chart-data, recalculate-limits, rules |
| samples | `samples.py` | Submit, batch import, exclude/include |
| violations | `violations.py` | List, stats, acknowledge, batch-acknowledge |

### Capability & Statistics

| Namespace | Router | Key Endpoints |
|-----------|--------|---------------|
| capability | `capability.py` | Calculate, snapshot, history |
| explain | `explain.py` | Show Your Work — formula/step explanations per metric |
| rulePresets | `rule_presets.py` | CRUD for Nelson rule preset configurations |

### Data Entry & Import

| Namespace | Router | Key Endpoints |
|-----------|--------|---------------|
| import | `import.py` | Upload CSV/Excel, validate, confirm |
| submitAttribute | `characteristics.py` | Attribute data submission (p/np/c/u) |

### Connectivity

| Namespace | Router | Key Endpoints |
|-----------|--------|---------------|
| mqtt | `mqtt.py` | Broker CRUD, test connection |
| opcua | `opcua.py` | Server CRUD, browse nodes, subscriptions |
| gageBridge | `gage_bridges.py` | Bridge registration, heartbeat, port config, profiles, /my-config |

### Compliance

| Namespace | Router | Key Endpoints |
|-----------|--------|---------------|
| signatures | `signatures.py` | Workflows, instances, sign/reject/verify, meanings, password policy |
| msa | `msa.py` | MSA study CRUD, measurements, calculate (ANOVA/range/nested/attribute) |
| fai | `fai.py` | FAI report CRUD, items, submit, approve (separation of duties) |

### Operations

| Namespace | Router | Key Endpoints |
|-----------|--------|---------------|
| notifications | `notifications.py` | SMTP/webhook config, preferences |
| push | `push.py` | VAPID push subscriptions |
| audit | `audit.py` | Log list, filters, CSV export |
| retention | `retention.py` | Policy CRUD, purge execution, history |
| reports | `reports.py` | Schedule CRUD, runs, generate |

### Integration

| Namespace | Router | Key Endpoints |
|-----------|--------|---------------|
| erp | `erp_connectors.py` | Connector CRUD, sync, test, outbound config |
| oidc | `oidc.py` | SSO config, callback, account linking |

### Admin

| Namespace | Router | Key Endpoints |
|-----------|--------|---------------|
| auth | `auth.py` | Login, logout, refresh, change-password |
| users | `users.py` | User CRUD, role assignment |
| database | `database.py` | Config, test, status, backup, vacuum, migrations |
| plants | `plants.py` | Plant CRUD |
| anomaly | `anomaly.py` | Detector config, events, baseline, train |

### WebSocket

| Endpoint | Purpose |
|----------|---------|
| `/ws/samples` | Real-time sample + violation stream (subscribe per characteristic) |
| `/ws/alerts` | Dedicated alert stream for toast notifications (all characteristics) |

Messages: `sample`, `violation`, `ack_update`, `control_limits`, `critical_alert`, `ping`/`pong`.

## Auth Flow

1. `POST /auth/login` returns access token + sets refresh cookie (httpOnly, path `/api/v1/auth`)
2. All requests include `Authorization: Bearer <token>`
3. On 401, `fetchApi` queues concurrent requests, refreshes via `POST /auth/refresh`, replays queue
4. SSO: `GET /auth/oidc/authorize` redirects to IdP, callback at `/auth/oidc/callback`

## Route Ordering Rule

FastAPI matches top-to-bottom. Static paths (e.g., `/violations/stats`) **must** come before parameterized paths (`/violations/{id}`).

## Related Notes

- [[System Overview]] — Architecture context
- [[Data Model]] — Schema backing these endpoints
- [[Features/]] — Feature-specific endpoint details
