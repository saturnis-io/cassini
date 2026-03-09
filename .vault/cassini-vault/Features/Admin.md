---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/Sprint 2 - Production Polish]]"
tags:
  - feature
  - active
aliases:
  - Audit Trail
  - Database Admin
  - Settings
  - Plant Management
---

# Admin

Platform administration including audit trail (automatic HTTP middleware + explicit Event Bus logging), database management (multi-dialect config, backup, vacuum, migrations), plant CRUD, appearance/theme settings, and the unified settings page that hosts tabs for all feature configurations.

## Key Backend Components

- **Audit Middleware**: `core/audit.py` -- `AuditMiddleware` intercepts POST/PUT/PATCH/DELETE, `_RESOURCE_PATTERNS` regex, `_method_to_action()` mapping
- **Audit Service**: `core/audit.py` -- `log()` for explicit background operation logging
- **Config**: `core/config.py` -- Pydantic `Settings` model
- **Rate Limiter**: `core/rate_limit.py` -- rate limiting for admin endpoints
- **Logging**: `core/logging.py` -- structlog configuration
- **Models**: `AuditLog` in `db/models/audit_log.py`; `Plant` in `db/models/plant.py`
- **Routers**: `api/v1/audit.py` (3 endpoints), `api/v1/database_admin.py` (7 endpoints), `api/v1/plants.py` (5 endpoints), `api/v1/health.py`
- **Migrations**: 001 (plant), 026 (audit_log with 4 indexes)

## Key Frontend Components

- `AuditLogViewer.tsx` -- filterable log viewer with CSV export, `RESOURCE_LABELS`, `ACTION_LABELS`
- `DatabaseSettings.tsx`, `DatabaseConnectionForm.tsx`, `DatabaseMaintenancePanel.tsx`, `DatabaseMigrationStatus.tsx`
- `AppearanceSettings.tsx`, `ThemeCustomizer.tsx` -- visual style (Retro/Glass) and light/dark mode
- `SettingsView.tsx` -- unified settings page hosting all feature tabs
- Hooks: `useAuditLogs`, `useDatabaseStatus`, `useTestConnection`, `usePlants`

## Connections

- Audit middleware automatically logs mutations from all features
- Database admin manages the multi-dialect backend ([[Architecture/System Overview]])
- Settings page hosts [[Notifications]], [[Records Retention]], [[Electronic Signatures]] tabs
- Plant model is foundational -- used by [[Auth]], [[SPC Engine]], and all plant-scoped features
- `.db_encryption_key` is SEPARATE from `.jwt_secret` -- see [[Lessons/Lessons Learned]]

## Known Limitations

- Audit middleware is fire-and-forget -- failures do not block the original request
- Admin endpoints (database, backup, vacuum) are rate-limited
- Never pass `str(e)` to API clients -- log server-side, return generic messages
- New URL prefixes require `_RESOURCE_PATTERNS` regex entry and frontend `RESOURCE_LABELS`/`ACTION_LABELS`
