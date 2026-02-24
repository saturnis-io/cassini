# OpenSPC Knowledge Graph

Generated: 2026-02-24

## Purpose

This directory provides a full-stack knowledge graph of the OpenSPC codebase. Each feature file documents the complete data flow from frontend component through API endpoint to backend service, model, and migration. Use these files for:

- **Understanding a feature** before modifying it
- **Finding all files** involved in a feature (model, router, repository, service, component, hook)
- **Tracing data flow** from UI action to database operation
- **Reverse lookup** via DEPENDENCIES.md (model/hook/endpoint -> feature)

## Statistics

| Metric | Count |
|--------|-------|
| Feature files | 13 |
| Backend models | 46 |
| API routers | 25 |
| API endpoints | ~215+ |
| Backend services | 20+ |
| Backend repositories | 15+ |
| Alembic migrations | 35 |
| Frontend components | ~135 |
| Frontend hooks | ~107 |
| Frontend pages | 14 |
| Zustand stores | 4 |
| API namespaces | 23 |

## Feature Files

| Feature | File | Scope |
|---------|------|-------|
| SPC Engine | [features/spc-engine.md](features/spc-engine.md) | Core SPC pipeline: characteristics, samples, control limits, Nelson rules, violations, annotations, chart data, short-run modes, attribute charts, CUSUM/EWMA |
| Capability | [features/capability.md](features/capability.md) | Process capability (Cp/Cpk/Pp/Ppk/Cpm), non-normal distributions (6 families), Shapiro-Wilk normality, Box-Cox transform, capability snapshots |
| Connectivity | [features/connectivity.md](features/connectivity.md) | Industrial protocols: MQTT/SparkplugB brokers, OPC-UA servers/subscriptions/node browsing, RS-232/USB gage bridge, tag mapping, protocol registry |
| MSA | [features/msa.md](features/msa.md) | Measurement System Analysis: Gage R&R (crossed ANOVA, range, nested), attribute MSA (Cohen's/Fleiss' Kappa), AIAG MSA 4th Ed d2* tables |
| FAI | [features/fai.md](features/fai.md) | First Article Inspection: AS9102 Rev C Forms 1/2/3, draft/submitted/approved workflow, separation of duties |
| Data Entry | [features/data-entry.md](features/data-entry.md) | Manual variable/attribute entry, CSV/Excel import wizard (upload/map/validate/confirm), sample edit with history, batch import |
| Notifications | [features/notifications.md](features/notifications.md) | Event-driven notifications: SMTP email, HMAC-SHA256 webhooks, per-user preferences, Event Bus subscriber |
| Signatures | [features/signatures.md](features/signatures.md) | 21 CFR Part 11 electronic signatures: sign/reject/verify, SHA-256 hash, workflow engine with steps/roles, meanings, password policy |
| Anomaly | [features/anomaly.md](features/anomaly.md) | AI/ML anomaly detection: PELT change-point, Isolation Forest outlier scoring, K-S distribution shift, ECharts overlay, dashboard |
| Retention | [features/retention.md](features/retention.md) | Data retention policies with inheritance (characteristic->hierarchy->global), background purge engine, batch deletion, purge history |
| Auth | [features/auth.md](features/auth.md) | JWT auth (access+refresh), 4-tier RBAC (operator/supervisor/engineer/admin), per-plant roles, user management, password change |
| Admin | [features/admin.md](features/admin.md) | Database admin (multi-dialect config, backup, vacuum, migrations), audit trail (middleware, CSV export, stats), settings page |
| Reporting | [features/reporting.md](features/reporting.md) | Scheduled report generation: CRUD schedules, template+scope+frequency config, manual trigger, run history, PDF/email delivery |

## Cross-References

- **DEPENDENCIES.md** — Reverse-lookup index: model/hook/endpoint/store -> feature file
- **features/*.md** — Individual feature documentation with Data Flow, Backend (Models/Endpoints/Services/Repositories), Frontend (Components/Hooks/Pages), Migrations, Known Issues

## Usage

### Finding what feature a model belongs to
```
Open DEPENDENCIES.md → Models table → find the model → follow the feature link
```

### Understanding a frontend hook's backend
```
Open the feature file → Hooks/API table → find the hook → see the endpoint → check Endpoints table for params/auth
```

### Tracing a full data flow
```
Open the feature file → Data Flow section (ASCII chain from component to database)
```

### Finding all files for a feature
```
Open the feature file → check all tables:
  - Models: db/models/*.py
  - Endpoints: api/v1/*.py
  - Services: core/*.py
  - Repositories: db/repositories/*.py
  - Components: components/*.tsx
  - Hooks: api/hooks.ts
  - Pages: pages/*.tsx
```
