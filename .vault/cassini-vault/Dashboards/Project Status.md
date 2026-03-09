---
type: dashboard
status: active
created: 2026-03-06
updated: 2026-03-08
tags:
  - active
  - dashboard
---

# Project Status

## Current Codebase Stats (Post Sprint 8 + Audit)

| Category | Count |
|----------|-------|
| Backend Models | ~45 |
| Backend Routers | ~29 |
| API Endpoints | ~263 |
| Repositories | ~17 |
| Alembic Migrations | 41 (including audit migrations 040--041) |
| Frontend Files | ~195 |
| React Components | ~145 |
| Pages | 14 |
| React Query Hooks | ~120 |
| Frontend API Namespaces | 26 |
| Bridge Package Modules | 7 |

### Notable Modules

| Module | Backend | Frontend |
|--------|---------|----------|
| SPC Engine | `core/spc_engine.py`, `core/attribute_spc_engine.py` | ControlChart, AttributeChart |
| MSA / Gage R&R | `core/msa/` (4 files), 12 endpoints | 5 components in `components/msa/` |
| FAI | `db/models/fai.py`, 12 endpoints | 5 components in `components/fai/` |
| Anomaly Detection | `core/anomaly/` (7 files), 12 endpoints | AnomalyOverlay, AnomalyConfigPanel, AnomalyEventList |
| Electronic Signatures | `core/signature_engine.py`, 20 endpoints | SignatureDialog, PendingApprovalsDashboard |
| ERP/LIMS | `core/erp/` (7 files), 16 endpoints | 7 components in `components/erp/` |
| Gage Bridge | `bridge/` (standalone package), 12 endpoints | 5 components (Gages tab) |
| Push/PWA | `core/push_service.py`, 4 endpoints | `sw-push.ts`, offline queue |

### Key Dependencies

| Package | Purpose |
|---------|---------|
| ruptures >= 1.1.9 | Change point detection (anomaly) |
| scikit-learn >= 1.4.0 | Isolation forest (optional ml extra) |
| pywebpush >= 2.0.0 | Push notifications |
| jsonpath-ng >= 1.6.0 | ERP field mapping |
| croniter >= 1.4.0 | ERP sync scheduling |

## Milestone Timeline

| Version | Theme | Date | Key Deliverables |
|---------|-------|------|-----------------|
| v0.1.0 | Core SPC | -- | Charts, Nelson rules, hierarchy, reports, kiosk, theming |
| v0.2.0 | Plant Scoping | -- | Plant model, CRUD, data isolation |
| v0.3.0 | Connectivity | -- | User management, MQTT/SparkplugB, ECharts migration, reporting |
| v0.4.0 WS-1 | Multi-Database | 2026-02 | Dialect abstraction, encrypted creds, admin API+UI |
| v0.4.0 WS-2 | OPC-UA | 2026-02 | JTI data model, asyncua client, Connectivity Hub (24 components) |
| v0.4.0 WS-4 | Architecture | 2026-02 | Security review, code quality, structured logging |
| v0.4.0 WS-5 | Schema Hardening | 2026-02 | CASCADE FKs, timezone datetimes, composite indexes |
| v0.4.0 WS-6 | Records Retention | 2026-02 | Retention policies, purge engine, settings UI |
| Sprint 1 | Visual Impact | 2026-02-12 | Attribute charts, Docker, CSV import |
| Sprint 2 | Production Polish | 2026-02-12 | Notifications, capability engine, audit trail |
| Sprint 4 | Wave 4 | 2026-02-14 | Electronic signatures, AI/ML anomaly detection |
| [[Sprint 5 - Statistical Credibility]] | Stats | 2026-02-22 | Non-normal capability, custom run rules, Laney p'/u' |
| [[Sprint 6 - Compliance Gate]] | Compliance | 2026-02-22 | Gage R&R/MSA, short-run charts, FAI (AS9102) |
| [[Sprint 7 - Shop Floor Connectivity]] | Gages | 2026-02-23 | RS-232/USB bridge agent, gage management |
| [[Sprint 8 - Enterprise Integration]] | Enterprise | 2026-02-24 | SSO/OIDC, PWA, ERP/LIMS connectors |
| [[Sprint 9 - Advanced Analytics]] | Analytics | 2026-02-25 | Multivariate SPC, predictive, gen AI, correlation, DOE |
| Skeptic Audit | Quality | 2026-02-25 | 8 parallel agents, 19 BLOCKERs fixed, migrations 040--041 |
| Material Mgmt | Feature | 2026-03-08 | Material hierarchy, class overrides, SPC integration (all chart types) |
| D-003 Licensing | Decision | 2026-03-08 | Signed JWT (v1), offline activation exchange (v1.x) |

## Competitive Position

- **Tier 1 Score**: 8/8 -- competitive parity with commercial SPC leaders
- **7 Unique Features**: Native MQTT, Docker, HMAC webhooks, REST API, WebSocket, open source, ML anomaly detection
- **Verticals Unlocked**: Pharma, automotive (IATF 16949), aerospace (AS9100), food, general ISO 9001
- **Pricing Ladder**: Community ($0) / Professional ($5K) / Enterprise ($25K) / Enterprise Plus ($50--150K)

See [[Competitive Analysis]] and [[Pricing Strategy]] for details.

## Related

- [[Architecture/System Overview]]
- [[Session Start]] -- session checklist
- [[Roadmap]] -- feature scope
