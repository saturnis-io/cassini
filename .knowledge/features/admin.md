# Admin (DB Admin, Audit Trail, Settings)

## Data Flow
```
Database Admin:
  DatabaseSettings.tsx → useDatabaseConfig()
    → GET /api/v1/database/config (read current, password excluded)
    → PUT /api/v1/database/config (update, encrypts password with Fernet)
    → POST /api/v1/database/test (test connection with 5s timeout, SSRF-protected)
    → GET /api/v1/database/status (dialect, version, table count, size, migration info)
    → POST /api/v1/database/backup (SQLite: copy file; others: return CLI command)
    → POST /api/v1/database/vacuum (VACUUM/ANALYZE/OPTIMIZE per dialect)
    → GET /api/v1/database/migrations (current/head revision, pending count)

Audit Trail:
  AuditMiddleware → intercepts POST/PUT/PATCH/DELETE → fire-and-forget audit log
  AuditService → log(), log_login(), log_event() → AuditLog table
  AuditLogViewer.tsx → useAuditLogs()
    → GET /api/v1/audit/logs (paginated, filtered)
    → GET /api/v1/audit/logs/export (CSV download)
    → GET /api/v1/audit/stats (summary by action/resource)

Settings Page:
  SettingsView.tsx → tabbed interface:
    - NotificationsSettings (SMTP, Webhooks, Preferences)
    - SignatureSettingsPage (Workflows, Meanings, Password Policy)
    - RetentionSettings (Policies, Purge History)
    - DatabaseSettings (Config, Status, Backup, Maintenance)
    - AuditLogViewer (Log Explorer, Stats, Export)
    - UserManagement (User CRUD, Plant Roles)
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| AuditLog | db/models/audit_log.py | id, user_id(FK SET NULL nullable), username, action, resource_type, resource_id, detail(JSON), ip_address, user_agent, timestamp; indexes: (timestamp DESC), (user_id, timestamp), (resource_type, resource_id), (action) | 026 |

### Endpoints — Audit
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| GET | /api/v1/audit/logs | user_id, action, resource_type, start_date, end_date, limit, offset | AuditLogListResponse | get_current_admin |
| GET | /api/v1/audit/logs/export | user_id, action, resource_type, start_date, end_date | StreamingResponse (CSV) | get_current_admin |
| GET | /api/v1/audit/stats | - | AuditStats | get_current_admin |

### Endpoints — Database
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| GET | /api/v1/database/config | - | DatabaseConfigResponse | get_current_admin |
| PUT | /api/v1/database/config | body: DatabaseConfigRequest | DatabaseConfigResponse | get_current_admin |
| POST | /api/v1/database/test | body: ConnectionTestRequest | ConnectionTestResult | get_current_admin |
| GET | /api/v1/database/status | - | DatabaseStatusResponse | get_current_admin |
| POST | /api/v1/database/backup | backup_dir | {message, path, size_mb} | get_current_admin |
| POST | /api/v1/database/vacuum | - | {message} | get_current_admin |
| GET | /api/v1/database/migrations | - | MigrationStatusResponse | get_current_admin |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| AuditService | core/audit.py | log(), log_login(), log_event() — all fire-and-forget safe |
| AuditMiddleware | core/audit.py | dispatch() — intercepts mutating requests, fire-and-forget audit log |
| DatabaseDialects | db/dialects.py | load_db_config(), save_db_config(), encrypt_password(), get_encryption_key(), validate_connection_options() |

### Repositories
No dedicated repositories; direct session queries in audit.py and database_admin.py routers.

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| AuditLogViewer | components/AuditLogViewer.tsx | - | useAuditLogs, useAuditStats, CSV export via GET /audit/logs/export |
| DatabaseSettings | components/DatabaseSettings.tsx | - | useDatabaseConfig, useUpdateDatabaseConfig, useTestDatabaseConnection |
| DatabaseConnectionForm | components/DatabaseConnectionForm.tsx | - | useTestDatabaseConnection |
| DatabaseMaintenancePanel | components/DatabaseMaintenancePanel.tsx | - | useDatabaseBackup, useDatabaseVacuum |
| DatabaseMigrationStatus | components/DatabaseMigrationStatus.tsx | - | useMigrationStatus |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useAuditLogs | auditApi.getLogs | GET /audit/logs | ['audit', 'logs', params] |
| useAuditStats | auditApi.getStats | GET /audit/stats | ['audit', 'stats'] |
| useDatabaseConfig | databaseApi.getConfig | GET /database/config | ['database', 'config'] |
| useUpdateDatabaseConfig | databaseApi.updateConfig | PUT /database/config | invalidates config |
| useTestDatabaseConnection | databaseApi.testConnection | POST /database/test | - |
| useDatabaseStatus | databaseApi.getStatus | GET /database/status | ['database', 'status'] |
| useDatabaseBackup | databaseApi.backup | POST /database/backup | - |
| useDatabaseVacuum | databaseApi.vacuum | POST /database/vacuum | - |
| useMigrationStatus | databaseApi.getMigrations | GET /database/migrations | ['database', 'migrations'] |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /settings | SettingsView.tsx | AuditLogViewer, DatabaseSettings, DatabaseConnectionForm, DatabaseMaintenancePanel, DatabaseMigrationStatus (admin tabs), NotificationsSettings, SignatureSettingsPage, RetentionSettings, UserManagement |

## Migrations
- 026 (audit_log): audit_log table with 4 indexes

## Known Issues / Gotchas
- DB encryption key (`.db_encryption_key`) MUST be separate from JWT secret (`.jwt_secret`) — JWT rotation would brick encrypted credentials
- AuditMiddleware uses fire-and-forget pattern (asyncio.create_task) — never blocks the response
- AuditMiddleware skips auth endpoints (login/logout handled separately with success/failure detail)
- Database test connection has strict 5-second timeout and SSRF protections (port whitelist: 3306, 5432, 1433)
- Generic error messages on connection test failure — never expose raw exception details
- All database admin endpoints are admin-only and rate-limited
- VACUUM on SQLite runs outside transaction; PostgreSQL ANALYZE only (VACUUM requires superuser/CLI)
- Audit log CSV export limited to 10,000 rows
- _extract_user_from_request in middleware does best-effort JWT decode (not full validation)
