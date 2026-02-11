# OpenSPC: Feature Gaps and Roadmap

> Living document tracking known gaps, planned features, and future work.
> Last updated: 2026-02-10 | Current version: 0.4.0

---

## Current Status

| Milestone | Status | Key Deliverables |
|-----------|--------|------------------|
| v0.1.0 | Complete | Core SPC engine, control charts, Nelson rules, hierarchy, reports, kiosk mode, theming |
| v0.2.0 | Complete | Plant model, plant-scoped data isolation, plant CRUD, plant selector |
| v0.3.0 | Complete | User management, Industrial Connectivity Phase 1 (MQTT/SparkplugB), charting enhancements (annotations, time-axis, ECharts migration), reporting, UI polish |
| v0.4.0 | Complete | Enterprise features (see below) |

**Completed workstreams in v0.4.0:**

- **WS-4: Architecture Review** -- Security hardening, code quality improvements, rate limiting enforcement, structured logging (structlog with console/JSON output)
- **WS-1: Multi-Database** -- Dialect abstraction layer (SQLite/PostgreSQL/MySQL/MSSQL), encrypted database credentials (Fernet), Database Admin API + UI (config, test, status, backup, vacuum, migrations)
- **WS-2: OPC-UA Integration** -- 4 phases completed:
  - Phase 1: JTI data model (polymorphic DataSource with MQTTDataSource/OPCUADataSource)
  - Phase 2: asyncua client, OPCUAServer model, manager, node browsing, 12 API endpoints
  - Phase 3: OPCUAProvider, subscription-to-SPC engine bridge, P1 trigger validation
  - Phase 4: Unified Connectivity Hub UI (28 components, 4 tabs: Monitor/Servers/Browse/Mapping), protocol registry
- **WS-3: MQTT Outbound Publishing** -- Schema, publisher foundation, SPC event publishing (violations, stats, Nelson events), rate control, frontend outbound configuration UI

---

## Known Feature Gaps

### Critical -- Production Blockers

- [ ] **No automated test suite** -- No unit or integration tests exist in either backend or frontend. This blocks confident deployments and refactoring. See [Testing Gaps](#testing-gaps) below.
- [x] ~~**MQTT broker passwords stored in plaintext**~~ -- Fixed in WS-1: database credentials are now encrypted at rest using Fernet (`.db_encryption_key`).
- [ ] **Default admin credentials are insecure** -- Bootstrap creates `admin`/`admin` if `OPENSPC_ADMIN_USERNAME` / `OPENSPC_ADMIN_PASSWORD` are not overridden. Needs a forced password change on first login or a setup wizard.
- [x] ~~**No database migration version check at startup**~~ -- Fixed in WS-4: application checks Alembic head revision at startup and logs a warning if behind.
- [x] ~~**No structured logging**~~ -- Fixed in WS-4: structlog with console/JSON output formats (`OPENSPC_LOG_FORMAT`).

### High Priority -- Important Missing Features

- [x] ~~**OPC-UA provider**~~ -- Completed in WS-2: full OPC-UA integration with asyncua client, node browsing, data subscription, and Connectivity Hub UI.
- [x] ~~**Rate limiting enforcement**~~ -- Fixed in WS-4: slowapi rate limiting with configurable limits (`OPENSPC_RATE_LIMIT_LOGIN`, `OPENSPC_RATE_LIMIT_DEFAULT`).
- [ ] **Batch violation acknowledgement UI** -- Backend supports `POST /violations/batch-acknowledge` but the frontend only offers single-item acknowledge buttons. No checkbox multi-select in ViolationsView.
- [ ] **Violation filtering on backend** -- `requires_acknowledgement` filtering is done client-side in ViolationsView. Needs a backend query parameter (noted as TODO in source).
- [ ] **Attribute chart rendering** -- Chart type registry defines p, np, c, u chart types but the ControlChart component is focused on variable data. Attribute charts likely need dedicated rendering logic.
- [ ] **Pareto chart rendering** -- Defined in chart registry but no dedicated rendering component exists.
- [ ] **Data entry scheduling** -- DataEntryView "Scheduling" tab shows a "Coming Soon" placeholder. `ScheduleConfigSection.tsx` UI exists but the backend due-task scheduling system is not implemented.
- [ ] **Email notifications** -- No email notification system. Alert manager has an abstract `AlertNotifier` protocol but no email implementation. Only in-app WebSocket notifications exist.
- [ ] **Webhook notifications** -- Webhook callbacks were identified as a requirement in phase-2 decisions but have not been implemented.
- [ ] **WebSocket auth via ticket** -- JWT token is passed as a query parameter, visible in server logs and browser history. Should use a short-lived ticket exchange pattern.

### Medium Priority -- UX and Quality

- [ ] **Mobile responsiveness** -- Sidebar has a "hidden" state for mobile but no mobile breakpoint detection or hamburger menu. The app is desktop/tablet-oriented.
- [ ] **Internationalization (i18n)** -- All strings are hardcoded in English. No i18n framework is integrated.
- [ ] **Pagination inconsistency** -- Hierarchy tree, rules, and annotations endpoints return unbounded lists. Most other endpoints use skip/limit pagination.
- [ ] **Wall Dashboard preset dialogs** -- Uses browser `prompt()` and `alert()` for save/load preset interactions instead of proper modal dialogs.
- [ ] **Annotation router prefix collision** -- Annotations share `/api/v1/characteristics` prefix with the characteristics router. Consider a dedicated `/api/v1/annotations` prefix (noted as TODO in `backend/src/openspc/api/v1/annotations.py`).
- [ ] **Unused annotation columns** -- `start_sample_id` and `end_sample_id` columns exist on the Annotation model but appear unused. Period annotations use `start_time`/`end_time` instead.
- [ ] **Error boundaries** -- Only one `RouteErrorBoundary` wraps the main Layout. Individual page components lack error boundaries.
- [ ] **Accessibility improvements** -- ECharts canvas rendering is inherently less accessible than SVG. Broader ARIA roles for charts, skip navigation, and screen reader descriptions for chart data are limited.
- [ ] **ViolationsView pagination controls** -- Uses simple page-based pagination (50 per page) but does not render next/prev page buttons.

### Low Priority -- Polish

- [ ] **Devtools error handling** -- Seed scripts in devtools swallow exception details. Only "Seed script failed" is returned to the client.
- [ ] **CORS configuration** -- Defaults to `localhost:5173` only. Production requires explicit `OPENSPC_CORS_ORIGINS` configuration (documented in deployment guide).
- [ ] **Offline support** -- No service worker or offline caching. The app requires a persistent backend connection.
- [ ] **User self-registration** -- Not implemented. Admins must create all user accounts.
- [ ] **Password reset via email** -- Not implemented. Admins must manually reset passwords.
- [ ] **Two-factor authentication** -- Not implemented. Local username/password only.
- [ ] **AD/LDAP/SSO integration** -- Not implemented. Decision was to skip for now and add later if needed.

---

## Planned Features

### Polymorphic Characteristic Configuration

**Planning:** [`.planning/phase-4-polymorphic-config/CONTEXT.md`](.planning/phase-4-polymorphic-config/CONTEXT.md)

Already partially implemented (CharacteristicConfig model + API exists). Remaining work:

- [ ] Due-task scheduling system (DueTaskManager) for manual data entry workflows
- [ ] Due-task dashboard and notifications (operator reminders)
- [ ] TagConfig trigger evaluation service
- [ ] MQTT subscription management driven by TagConfig

### Notification System Expansion

Per phase-2 decisions, the notification system should support:

- [x] In-app notifications -- done via WebSocket push
- [x] MQTT outbound publishing -- done in WS-3 (violations, stats, Nelson events)
- [ ] Webhook callbacks -- architecture decided, not implemented
- [ ] Email notifications -- not implemented
- [ ] Configurable notification rules per characteristic/severity

### Enterprise UI Overhaul

- [ ] Settings page redesign (tabbed layout)
- [ ] Help tooltips throughout the application
- [ ] Nelson rules configuration UI improvements
- [ ] Variable subgroup handling improvements
- [ ] Attribute chart dedicated rendering

---

## Testing Gaps

No automated test files have been found in either the backend or frontend source trees. The project needs:

### Backend

- [ ] Unit tests for SPC engine (Nelson rules evaluation, control limit calculation)
- [ ] Unit tests for authentication (JWT generation, refresh, API key verification)
- [ ] Unit tests for RBAC (role hierarchy, plant-scoped permissions)
- [ ] Integration tests for API endpoints (CRUD operations, pagination, error cases)
- [ ] Integration tests for WebSocket protocol (subscribe, unsubscribe, message broadcast)
- [ ] Integration tests for MQTT manager (multi-broker lifecycle, topic discovery)
- [ ] Integration tests for SparkplugB protobuf encode/decode
- [ ] Integration tests for OPC-UA client (connection, browsing, subscriptions)
- [ ] Integration tests for multi-dialect database operations
- [ ] Integration tests for MQTT outbound publishing
- [ ] Test fixtures and factories for database models

### Frontend

- [ ] Component tests with React Testing Library or Vitest
- [ ] API hook tests with MSW (Mock Service Worker)
- [ ] E2E tests with Playwright or Cypress (login flow, dashboard interaction, chart rendering)
- [ ] Visual regression tests for chart components
- [ ] Accessibility audit (axe-core integration)

---

## Performance Considerations

These are not bugs but areas that may need optimization at scale:

- [ ] **Rolling window cache tuning** -- 1000 characteristics x 25 samples cached in memory. May need adjustment for large deployments.
- [ ] **Chart data N+1 queries** -- Violations are batch-loaded per page, but each sample loads measurements via ORM relationship. Consider eager loading.
- [ ] **Batch import sequential processing** -- Samples are processed one-at-a-time through the SPC engine. No bulk optimization path.
- [ ] **Control limit recalculation** -- Loads last 100 samples from DB each time. No incremental update mechanism.
- [ ] **Topic discovery wildcard subscription** -- Subscribes to `#` which receives all messages on the broker. May overwhelm on high-traffic brokers.
- [ ] **OPC-UA subscription scaling** -- Many concurrent OPC-UA subscriptions may consume significant memory. Consider subscription pooling for large deployments.

---

## Documentation Gaps

- [ ] Screenshots for all major pages (Dashboard, Configuration, Connectivity, Reports, etc.)
- [ ] Video tutorials for common workflows (creating a characteristic, entering data, acknowledging violations)
- [ ] Interactive API playground or Swagger UI documentation
- [ ] Changelog / release notes for each version
- [ ] Migration guide for upgrading between versions

---

## Community Wishlist

Common feature requests for SPC software that OpenSPC could implement in the future:

### Enterprise Integrations

- [ ] **ERP integration** -- SAP, Oracle, Microsoft Dynamics (batch/lot traceability)
- [ ] **MES integration** -- AVEVA, GE Proficy, Rockwell FactoryTalk (production order context)
- [ ] **LIMS integration** -- LabWare, STARLIMS (laboratory measurement import)
- [ ] **Historian integration** -- OSIsoft PI, Honeywell PHD (time-series data source)

### Advanced SPC Features

- [ ] **Process capability indices** -- Cp, Cpk, Pp, Ppk calculation and trending (partially in reports, not as a dedicated feature)
- [ ] **Gauge R&R studies** -- Measurement system analysis
- [ ] **CUSUM charts** -- Cumulative sum control charts for detecting small shifts
- [ ] **EWMA charts** -- Exponentially weighted moving average charts
- [ ] **Multivariate SPC** -- Hotelling T-squared charts for correlated characteristics
- [ ] **Automatic assignable cause analysis** -- ML-based root cause suggestions

### Collaboration

- [ ] **Audit trail export** -- FDA 21 CFR Part 11 compliance reporting
- [ ] **Shift handover reports** -- Automated summary for shift changes
- [ ] **Comment threads on violations** -- Team discussion on specific out-of-control events
- [ ] **Role-based dashboards** -- Different default views per role (operator vs engineer vs manager)

### Data Management

- [ ] **Data archival** -- Move old samples to archive tables for performance
- [ ] **Data export scheduler** -- Automated report delivery via email on a schedule
- [ ] **Bulk data import wizard** -- CSV/Excel import with column mapping UI
- [ ] **Data retention policies** -- Configurable auto-cleanup of old data
