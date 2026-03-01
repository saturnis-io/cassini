# Feature: Settings & Administration

## What It Does

The settings and administration pages control system-wide configuration, user management, and operational preferences. These pages are the back-office of Cassini -- where administrators configure the system to match their organization's security policies, notification preferences, data retention rules, and integration needs.

From a regulatory perspective, proper settings configuration is foundational to compliance:

- **21 CFR Part 11**: Password policies, electronic signature configuration, audit log access, and user management controls all feed into FDA electronic records compliance.
- **ISO 13485 / ISO 9001**: Access control, role assignment, and system configuration are documented quality system requirements.
- **IATF 16949**: Controlled access to quality records, notification of out-of-control conditions, and data retention policies align with automotive quality management.
- **AS9100**: Separation of duties (role-based access), signature workflows, and audit trails are aerospace quality requirements.

The settings page uses a sidebar navigation pattern with grouped tabs. Each tab has a minimum role requirement -- operators can only access personal settings (Account, Appearance, Notifications), while admin users can access all tabs including system-wide configuration.

---

## Where To Find It

| Page / Feature | URL | Min Role | Description |
|---------------|-----|----------|-------------|
| Settings page | `/settings` | operator | Sidebar-navigated settings with role-gated tabs |
| Account | `/settings/account` | operator | Personal profile -- display name, email, password change |
| Appearance | `/settings/appearance` | operator | Theme (light/dark), visual style (Retro/Glass) |
| Notifications | `/settings/notifications` | operator | Notification preferences per event type |
| Sites | `/settings/sites` | admin | Plant/site CRUD |
| Branding | `/settings/branding` | admin | Custom logo, colors, header text |
| Localization | `/settings/localization` | admin | Timezone, date format, number format |
| Email & Webhooks | `/settings/email-webhooks` | admin | SMTP and outbound webhook configuration |
| SSO | `/settings/sso` | admin | OIDC provider configuration |
| Signatures | `/settings/signatures` | engineer | Electronic signature workflow config, password policies |
| API Keys | `/settings/api-keys` | engineer | Create/revoke API keys for integrations |
| Audit Log | `/settings/audit-log` | admin | View all system events with filters and CSV export |
| Database | `/settings/database` | engineer | DB connection, backup, vacuum, migration status |
| Retention | `/settings/retention` | engineer | Data retention policies with inheritance chain |
| Reports | `/settings/reports` | engineer | Scheduled report configuration |
| AI | `/settings/ai` | admin | ML anomaly detection algorithm config |
| User management | `/admin/users` | admin | User CRUD, role assignment, deactivation |

---

## Key Concepts (Six Sigma Context)

### Role-Based Access Control (RBAC)

RBAC enforces the **principle of least privilege** -- users can only access the functionality they need for their job. In a Six Sigma context:

- **Operators**: Collect data, view charts, review violations. Cannot change configurations.
- **Supervisors**: Everything operators can do, plus approve annotations and review reports.
- **Engineers**: Full SPC configuration (chart setup, control limits, rules), DOE, MSA, FAI, analytics, retention policies, API keys, database management, and signature configuration.
- **Admins**: Everything, plus user management, system settings (SMTP, SSO, branding, localization, AI config), and audit log access.

Roles are assigned **per plant** via the `user_plant_role` join table. A user can be an operator at Plant A and an engineer at Plant B. This supports multi-site organizations where expertise and responsibility differ by location.

### Settings Tab Groups

The settings sidebar organizes tabs into logical groups:

1. **Personal** (operator+): Account, Appearance, Notifications
2. **Organization** (admin): Sites, Branding, Localization, Email & Webhooks
3. **Security** (mixed): SSO (admin), Signatures (engineer+), API Keys (engineer+), Audit Log (admin)
4. **Data** (engineer+): Database, Retention, Reports
5. **Integrations** (admin): AI

### SMTP Email Configuration

Cassini sends email notifications for violations, threshold alerts, and password reset flows. SMTP configuration includes:

- **Host**: SMTP server hostname (e.g., smtp.gmail.com)
- **Port**: Typically 587 (STARTTLS) or 465 (SSL)
- **TLS enabled**: Whether to use transport-layer encryption
- **Username/Password**: SMTP authentication credentials
- **From address**: The sender email address for outbound messages

The password is stored encrypted (Fernet) in the database and masked on the UI after saving. A "Test Email" button sends a test message to verify the configuration.

### Outbound Webhooks

Webhooks enable real-time integration with external systems. When configured events occur (violations, new samples, control limit changes), Cassini sends an HTTP POST to the configured URL with a JSON payload.

- **HMAC signing**: Each webhook includes an `X-Webhook-Signature` header with an HMAC-SHA256 signature of the payload using the configured secret. The receiving system can verify the signature to confirm the message came from Cassini.
- **Event types**: Configurable per webhook -- violation, sample, annotation, etc.
- **Retry**: Failed deliveries may be retried depending on the response code.

### API Keys

API keys enable external systems (ERP, LIMS, custom scripts) to authenticate with Cassini without user credentials. Key management:

- Keys are generated with a descriptive name
- The raw key value is shown **exactly once** at creation time -- it cannot be retrieved later
- Keys are stored as SHA-256 hashes in the database
- Keys can be revoked (deleted) at any time
- Rate limiting can be applied per key

### Data Retention

Retention policies control how long measurement data, samples, and associated records are kept. In regulated industries, retention requirements vary:

- **FDA (21 CFR Part 820)**: Quality records must be retained for the lifetime of the device
- **ISO 13485**: Minimum retention period as defined by regulatory requirements
- **Automotive (PPAP/APQP)**: Typically one year after the part is active plus one calendar year

Cassini supports a **hierarchical inheritance chain** for retention policies:
1. **Global default**: Applies to all data unless overridden
2. **Per-plant**: Overrides global for a specific plant
3. **Per-hierarchy node**: Overrides plant for a specific department/line/station
4. **Per-characteristic**: Most specific override

The retention settings UI includes a tree browser showing the inheritance chain and where overrides are applied.

### SSO / OIDC Configuration

Single Sign-On configuration includes:
- **Client ID / Client Secret**: OAuth 2.0 credentials from the identity provider
- **Discovery URL**: The OIDC discovery endpoint (e.g., `https://accounts.google.com/.well-known/openid-configuration`)
- **Claim mapping**: Maps IdP claims to Cassini user fields (e.g., `preferred_username` -> username)
- **Plant role mapping**: Auto-assigns Cassini roles based on IdP group claims
- **Account linking**: Connects OIDC identities to existing local accounts

### Electronic Signatures

The signatures settings tab controls:
- **Workflow configuration**: Which actions require electronic signatures (e.g., FAI approval, data purge)
- **Signature meanings**: The semantic meanings available for signatures (e.g., "Approved", "Reviewed", "Rejected")
- **Password policy**: Complexity requirements, expiry, lockout settings

### Database Administration

Database settings provide:
- **Connection info**: Current database type (SQLite, PostgreSQL, MySQL, MSSQL) and connection status
- **Backup**: Create database backups (download for SQLite, trigger for server databases)
- **Vacuum/Optimize**: Reclaim disk space and optimize query performance
- **Migration status**: View applied Alembic migrations and current schema version

### AI / Anomaly Detection

The AI settings tab configures the ML anomaly detection engine:
- **Algorithm selection**: PELT (changepoint), K-S (distribution shift), Isolation Forest (multivariate outlier)
- **Sensitivity**: Adjusts detection thresholds

---

## How To Configure (Step-by-Step)

### Configuring SMTP Email

1. Log in as admin
2. Navigate to `/settings/email-webhooks`
3. In the SMTP section, fill in:
   - Host: your SMTP server (e.g., `smtp.office365.com`)
   - Port: 587
   - TLS: enabled
   - Username: your SMTP username
   - Password: your SMTP password
4. Click Save
5. Click "Test Email", enter a recipient address, click Send
6. Verify the test email arrives

### Creating an Outbound Webhook

1. In `/settings/email-webhooks`, scroll to the Webhooks section
2. Click "Add Webhook"
3. Enter the target URL (e.g., `https://your-system.com/webhook`)
4. Enter a secret for HMAC signing
5. Select event types to trigger the webhook (e.g., violation, sample_created)
6. Click Save
7. The webhook appears in the list with status indicator

### Configuring Notification Preferences

1. Navigate to `/settings/notifications` (any authenticated user)
2. For each event type (violations, samples, annotations, etc.):
   - Toggle email notifications on/off
   - Toggle webhook notifications on/off
   - Toggle push notifications on/off
3. Click Save
4. Preferences are stored per user and persist across sessions

### Creating API Keys

1. Navigate to `/settings/api-keys` (engineer+ role)
2. Click "Create API Key"
3. Enter a descriptive name (e.g., "ERP Integration Key")
4. Click Create
5. **IMPORTANT**: Copy the displayed key immediately -- it will NOT be shown again
6. The key appears in the list showing name, created date, and last used date
7. The raw key value is NOT visible after initial creation

### Configuring Data Retention

1. Navigate to `/settings/retention` (engineer+ role)
2. Set the global default retention period (e.g., 365 days, or "indefinite")
3. Use the tree browser to navigate the hierarchy
4. Click a node (plant, department, line, characteristic) to set an override
5. The UI shows the effective retention period and which level it inherits from

### Managing Users

1. Log in as admin
2. Navigate to `/admin/users`
3. **Create user**: Click "Add User", fill username/password/email, submit
4. **Assign role**: Click the user row, select a plant and role, click Assign
5. **Deactivate**: Click the user row, click Deactivate, confirm
6. **Delete permanently**: Only available for inactive users -- click permanent delete

### Configuring SSO

1. Navigate to `/settings/sso` (admin)
2. Click "Add Provider"
3. Enter provider name (e.g., "Company Okta")
4. Enter Client ID and Client Secret from the IdP
5. Enter the Discovery URL
6. Optionally configure claim mapping and role mapping
7. Toggle the provider active
8. Save -- the provider button appears on the login page

---

## How To Use (Typical Workflow)

### Initial System Setup

A typical deployment follows this sequence:

1. **Create plants**: `/settings/sites` -- add manufacturing sites
2. **Configure branding**: `/settings/branding` -- add company logo and colors
3. **Set up email**: `/settings/email-webhooks` -- configure SMTP for notifications
4. **Create users**: `/admin/users` -- add users and assign plant roles
5. **Set retention policies**: `/settings/retention` -- configure data retention
6. **Configure signatures**: `/settings/signatures` -- set up password policy and signature workflows
7. **Optional SSO**: `/settings/sso` -- connect external identity provider

### Day-to-Day Administration

- **New hire**: Admin creates user at `/admin/users`, assigns operator role at their plant
- **Role change**: Admin edits user's plant role (e.g., operator -> engineer after training)
- **Investigate incident**: Admin reviews `/settings/audit-log`, filters by date range and action type
- **Integration setup**: Engineer creates API key at `/settings/api-keys`, provides to ERP team
- **Backup**: Engineer triggers database backup at `/settings/database` before major changes

### Theme and Appearance

Users can customize their experience:
1. Navigate to `/settings/appearance`
2. Select **Theme**: Light or Dark mode
3. Select **Visual Style**:
   - **Retro** (default): Sharp corners, monospace fonts, technical aesthetic
   - **Glass**: Frosted glass effects, rounded corners, modern aesthetic
4. Changes apply immediately (no page refresh needed)
5. Preferences are persisted in localStorage and survive page refreshes and sessions

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Pass Condition |
|---|---|---|
| 1 | Settings page role gating | Admin sees all tabs. Operator sees only Account, Appearance, Notifications. |
| 2 | Account profile update | Display name and email can be edited and saved. Changes persist on reload. |
| 3 | Password change | Current password verified, new password saved. Subsequent login requires new password. |
| 4 | Theme persistence | Dark/light theme change applies immediately and persists across page refresh. |
| 5 | Visual style toggle | Retro/Glass style change is visible (corner radius, font changes). |
| 6 | SMTP configuration | Host, port, TLS, credentials saved. Password masked on reload. |
| 7 | SMTP test email | Test email function sends (or reports clear error for unreachable SMTP). |
| 8 | Webhook creation | Webhook created with URL, secret, event types. Appears in list. |
| 9 | Notification preferences | Per-event toggles save and persist. |
| 10 | API key creation | Key created with name. Raw key shown once. Not visible on reload. |
| 11 | API key revocation | Revoked key removed from list. |
| 12 | SSO configuration | OIDC provider form accepts client ID, secret, discovery URL. |
| 13 | Database info | Current database type and connection info displayed. |
| 14 | Database backup | Backup action triggers and completes (or shows progress). |
| 15 | User creation | Admin creates user with unique username. User appears in table. |
| 16 | Role assignment | Plant-specific role assigned. User sees role-appropriate navigation. |
| 17 | User deactivation | Deactivated user marked inactive. Cannot log in. |
| 18 | Audit log access | Admin can view, filter, and export audit log entries. |
| 19 | Retention configuration | Global and per-node retention policies saved with inheritance display. |
| 20 | Signatures/password policy | Password policy settings (length, complexity, expiry, lockout) saved. |

---

## Edge Cases & Constraints

- **Admin self-demotion**: An admin cannot remove their own admin role if they are the last admin user. The system prevents orphaning the admin role.
- **Admin auto-assignment on new plant**: When a new plant is created at `/settings/sites`, all existing admin users are automatically assigned the admin role at that plant.
- **SMTP password masking**: The SMTP password is stored encrypted (Fernet) and displayed as masked characters on the UI. It can be changed but not viewed after initial entry.
- **API key one-time display**: The raw API key value is generated server-side and returned in the creation response. It is hashed (SHA-256) before storage. There is no way to retrieve the original key after the initial display.
- **Webhook HMAC verification**: The webhook secret is used to compute HMAC-SHA256 signatures. If the secret is changed, all previously configured receiving systems need the new secret.
- **SSO state race**: The OIDC state store uses database-backed persistence (not in-memory) to handle race conditions in multi-process deployments. State tokens expire after 10 minutes.
- **Audit log volume**: In high-throughput environments, the audit log can grow large. CSV export handles pagination. The log viewer uses server-side pagination.
- **Theme/style independence**: Light/dark theme and Retro/Glass visual style are independent settings. All four combinations (light+retro, light+glass, dark+retro, dark+glass) are supported.
- **localStorage prefix**: Theme and settings preferences use the `cassini-` prefix in localStorage (migrated from the legacy `openspc-` prefix).
- **Database backup for SQLite**: Backup creates a file copy. For PostgreSQL/MySQL/MSSQL, backup triggers the appropriate server-side backup mechanism.
- **Retention policy deletion**: Deleting a retention override at a specific level causes that node to inherit from its parent. Data is not immediately purged when a shorter policy is set -- purge runs on a scheduled basis.
- **Notification preferences require dispatcher**: Email notifications require SMTP to be configured. Webhook notifications require at least one active webhook. Push notifications require VAPID keys and browser permission.
- **Password policy enforcement**: When password expiry is enabled, users whose password has expired are forced to change it on next login. The `must_change_password` flag is suppressed in dev mode.
- **Deactivated users vs. deleted users**: Deactivation is a soft delete -- the user record remains but `is_active=false`. Permanent deletion removes the record entirely but is only available for already-deactivated users.
- **Settings persistence**: All settings are stored server-side (database) except theme/appearance which use localStorage for instant application. Server-side settings persist across devices; localStorage settings are device-specific.

---

## API Reference (for seeding)

### System Settings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/system-settings` | JWT (admin) | Get all system settings |
| `PUT` | `/system-settings` | JWT (admin) | Update system settings |

### SMTP Configuration

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/smtp-config` | JWT (admin) | Get SMTP configuration (password masked) |
| `PUT` | `/smtp-config` | JWT (admin) | Save SMTP configuration |
| `POST` | `/smtp-config/test` | JWT (admin) | Send test email |

### SMTP Config Schema
```json
{
  "host": "smtp.example.com",
  "port": 587,
  "use_tls": true,
  "username": "notifications@example.com",
  "password": "secret",
  "from_address": "cassini@example.com"
}
```

### Webhook Configuration

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/webhooks` | JWT (admin) | List configured webhooks |
| `POST` | `/webhooks` | JWT (admin) | Create a new webhook |
| `PUT` | `/webhooks/{id}` | JWT (admin) | Update webhook |
| `DELETE` | `/webhooks/{id}` | JWT (admin) | Delete webhook |
| `POST` | `/webhooks/{id}/test` | JWT (admin) | Send test webhook |

### Webhook Schema
```json
{
  "url": "https://httpbin.org/post",
  "secret": "hmac-signing-secret",
  "event_types": ["violation", "sample_created"],
  "is_active": true,
  "description": "Integration webhook"
}
```

### Notification Preferences

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/notifications/preferences` | JWT | Get current user's notification preferences |
| `PUT` | `/notifications/preferences` | JWT | Update notification preferences |

### API Keys

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api-keys` | JWT (engineer+) | List API keys (no raw values) |
| `POST` | `/api-keys` | JWT (engineer+) | Create API key (raw value in response) |
| `DELETE` | `/api-keys/{id}` | JWT (engineer+) | Revoke/delete API key |

### API Key Create Schema
```json
{
  "name": "OQ-Test-Key",
  "description": "Test key for OQ validation"
}
```

### API Key Create Response
```json
{
  "id": 1,
  "name": "OQ-Test-Key",
  "key": "ck_a1b2c3d4e5f6...",
  "created_at": "2026-02-26T10:00:00Z"
}
```

### User Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/users/` | JWT (admin) | List all users with plant roles |
| `POST` | `/users/` | JWT (admin) | Create a new user |
| `GET` | `/users/{user_id}` | JWT (admin) | Get user by ID |
| `PATCH` | `/users/{user_id}` | JWT (admin) | Update user fields |
| `DELETE` | `/users/{user_id}` | JWT (admin) | Deactivate user (soft delete) |
| `DELETE` | `/users/{user_id}/permanent` | JWT (admin) | Permanently delete deactivated user |
| `POST` | `/users/{user_id}/roles` | JWT (admin) | Assign or update plant role |
| `DELETE` | `/users/{user_id}/roles/{plant_id}` | JWT (admin) | Remove plant role |

### User Create Schema
```json
{
  "username": "oq-newuser",
  "password": "OqNew123!",
  "email": "oq-newuser@example.com"
}
```

### Plant Role Assignment Schema
```json
{
  "plant_id": 1,
  "role": "engineer"
}
```

### SSO / OIDC

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/oidc/providers` | JWT (admin) | List OIDC providers |
| `POST` | `/oidc/providers` | JWT (admin) | Add OIDC provider |
| `PUT` | `/oidc/providers/{id}` | JWT (admin) | Update OIDC provider |
| `DELETE` | `/oidc/providers/{id}` | JWT (admin) | Remove OIDC provider |

### Database Administration

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/database/status` | JWT (engineer+) | Get current database status and type |
| `POST` | `/database/backup` | JWT (engineer+) | Trigger database backup |
| `GET` | `/database/backups` | JWT (engineer+) | List available backups |
| `POST` | `/database/vacuum` | JWT (admin) | Run vacuum/optimize |
| `GET` | `/database/migrations` | JWT (engineer+) | List applied migrations |

### Retention Policies

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/retention/policies` | JWT (engineer+) | List retention policies |
| `POST` | `/retention/policies` | JWT (engineer+) | Create retention policy |
| `PUT` | `/retention/policies/{id}` | JWT (engineer+) | Update retention policy |
| `DELETE` | `/retention/policies/{id}` | JWT (engineer+) | Delete retention policy override |
| `GET` | `/retention/effective/{scope_type}/{scope_id}` | JWT (engineer+) | Get effective retention for a scope |

### Audit Log

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/audit-log` | JWT (admin) | Query audit log with filters (action, user, resource, date range) |
| `GET` | `/audit-log/export` | JWT (admin) | Export audit log as CSV |
| `GET` | `/audit-log/actions` | JWT (admin) | List distinct action types for filter dropdown |
