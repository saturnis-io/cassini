# Cassini SPC Platform -- Application Overview

## OQ Knowledge Base: General Platform Orientation

This document provides the foundational context a Six Sigma Black Belt tester needs before executing any Operational Qualification test case against the Cassini SPC platform. Read this before any category-specific knowledge base article.

---

## What Cassini Is

Cassini is a web-based Statistical Process Control (SPC) platform designed for manufacturing quality management. It covers the full lifecycle of statistical quality control:

- **Real-time control charts** -- X-bar/R, X-bar/S, Individual/Moving Range (I-MR), p, np, c, u, CUSUM, EWMA. All 8 Nelson rules supported with configurable parameters.
- **Capability analysis** -- Cp, Cpk, Pp, Ppk, Cpm with normality testing (Shapiro-Wilk), non-normal distribution fitting (lognormal, Weibull, gamma, beta, exponential), and Box-Cox transformation.
- **Measurement System Analysis (MSA)** -- Gage R&R (crossed ANOVA, range, nested methods), attribute MSA (Cohen's/Fleiss' Kappa). AIAG MSA 4th Edition d2* lookup tables.
- **First Article Inspection (FAI)** -- AS9102 Rev C Forms 1/2/3. Draft, submitted, and approved workflow with separation of duties enforcement.
- **AI/ML anomaly detection** -- PELT changepoint detection, Kolmogorov-Smirnov distribution shift, Isolation Forest outlier detection. Event bus driven, configurable per characteristic.
- **Electronic signatures** -- SHA-256 content hashing, multi-step approval workflows, standalone signatures. Designed for 21 CFR Part 11 compliance.
- **Audit trail** -- Automatic HTTP middleware capture for all mutating operations (POST, PUT, PATCH, DELETE). Login/logout, event bus events, CSV export. Immutable records with timestamps, user IDs, IP addresses.
- **Industrial connectivity** -- MQTT/SparkplugB inbound, OPC-UA client (asyncua), RS-232/USB gage bridge (serial-to-MQTT translator), ERP connectors (SAP OData, Oracle REST, generic LIMS, webhook).
- **Notifications** -- Email (SMTP/aiosmtplib), webhooks (HMAC-signed), push notifications (VAPID/WebPush). Configurable per user per event type.
- **Records retention** -- Policy-based data lifecycle with inheritance chains, purge engine with history tracking.

The technology stack is:

| Layer    | Technology                                                    |
|----------|---------------------------------------------------------------|
| Frontend | React 19, TypeScript 5.9, Vite 7, TanStack Query v5, Zustand v5, ECharts 6 |
| Backend  | FastAPI, SQLAlchemy async, Alembic, Python 3.11+              |
| Bridge   | Python pip package (`cassini-bridge`), pyserial, paho-mqtt     |
| Database | SQLite (dev), PostgreSQL, MySQL, MSSQL (multi-dialect)         |

---

## Role Hierarchy

Cassini enforces a four-tier role hierarchy. Each higher role inherits all permissions of the roles below it. Roles are assigned **per plant** -- a user can be an operator at Plant A and an engineer at Plant B.

| Level | Role         | Key Capabilities                                                                                     |
|-------|-------------|------------------------------------------------------------------------------------------------------|
| 1     | **Operator**    | Data entry, view control charts, view violations, view dashboard                                     |
| 2     | **Supervisor**  | + Acknowledge/resolve violations, view and generate reports, edit/delete/exclude samples              |
| 3     | **Engineer**    | + Configure characteristics and control limits, manage connectivity (MQTT, OPC-UA, gages), run MSA studies, manage FAI reports, access analytics/DOE, manage API keys, configure signatures, manage retention policies, manage database settings |
| 4     | **Admin**       | + User management (create/edit/deactivate users, assign roles), SSO/OIDC configuration, site/plant management, branding, localization, email/webhook configuration, audit log viewer, AI configuration |

All authenticated users (any role) can access personal settings: account profile, appearance (theme/visual style), and notification preferences.

---

## Plant Scoping

All operational data in Cassini is scoped to a **plant** (manufacturing site). This includes:

- Hierarchy (departments, lines, characteristics)
- Samples and measurements
- Violations
- Control chart data
- Capability history
- MSA studies
- FAI reports
- Notification preferences
- Retention policies

The **plant switcher** is located in the header bar. When a user switches plants, all data-driven views (dashboard, data entry, violations, reports, configuration, connectivity) reload to show data for the selected plant.

A user's role is evaluated against their role assignment for the **currently selected plant**. If a user has no role at a plant, they cannot access that plant's data.

Admin users are automatically assigned to all plants when a new plant is created.

---

## Navigation Structure

The left sidebar contains the primary navigation. Items are filtered based on the user's role at the current plant.

### Main Section (all authenticated users)
| Sidebar Item   | Route          | Min Role   | Description                          |
|---------------|----------------|-----------|--------------------------------------|
| Dashboard      | `/dashboard`     | operator  | Control charts, quick stats, KPIs    |
| Data Entry     | `/data-entry`    | operator  | Manual measurement entry             |
| Violations     | `/violations`    | operator  | Nelson rule violations, badge count  |

### Supervisor+
| Sidebar Item   | Route          | Min Role     | Description                        |
|---------------|----------------|--------------|------------------------------------|
| Reports        | `/reports`       | supervisor   | Report generation and export       |

### Studies Section (engineer+)
| Sidebar Item   | Route          | Min Role   | Description                          |
|---------------|----------------|-----------|--------------------------------------|
| MSA            | `/msa`           | engineer  | Measurement System Analysis studies  |
| FAI            | `/fai`           | engineer  | First Article Inspection reports     |
| DOE            | `/doe`           | engineer  | Design of Experiments               |

### System Section (engineer+)
| Sidebar Item   | Route          | Min Role   | Description                          |
|---------------|----------------|-----------|--------------------------------------|
| Analytics      | `/analytics`     | engineer  | AI anomaly detection, insights       |
| Connectivity   | `/connectivity`  | engineer  | MQTT, OPC-UA, gages, ERP            |
| Configuration  | `/configuration` | engineer  | Hierarchy and characteristic setup   |
| Settings       | `/settings`      | operator* | System settings (sub-tabs role-gated)|

*Settings is accessible to all roles, but most sub-tabs require engineer or admin. Personal tabs (account, appearance, notifications) are available to all.

### Admin Section
| Sidebar Item   | Route            | Min Role   | Description                        |
|---------------|------------------|-----------|-------------------------------------|
| Users          | `/admin/users`     | admin     | User CRUD and role assignment       |

### Display Modes (no sidebar)
| Route              | Min Role   | Description                              |
|-------------------|-----------|------------------------------------------|
| `/kiosk`            | operator  | Full-screen chart display for shop floor |
| `/wall-dashboard`   | operator  | Multi-chart wall display, no status bar  |

---

## UI Patterns

### Visual Structure
- **Cards** -- Used for KPI summaries (capability card, quick stats), list items (MSA studies, FAI reports), and configuration panels.
- **Modals / Dialogs** -- Used for create/edit forms (user creation, characteristic configuration, MSA wizard), confirmation prompts (delete, deactivate), and signature workflows.
- **Tabbed layouts** -- Settings page uses a sidebar tab layout with grouped sections. Connectivity page uses top tabs (Monitor, Servers, Browse, Mapping, Gages, Integrations). Characteristic detail uses tabs (Limits, Rules, Distribution).
- **Hierarchy tree** -- The sidebar includes a collapsible characteristics tree on dashboard, data-entry, and reports pages. Shows department > line > characteristic structure.
- **ECharts** -- All control charts, capability histograms, trend charts, and Q-Q plots use ECharts 6 (canvas renderer). Charts are lifecycle-managed via the `useECharts` hook.
- **Toast notifications** -- Success/error messages appear as toast popups in the top-right corner (Sonner library).

### Themes and Visual Styles
Cassini has two independent visual dimensions:

1. **Color mode** -- Light or Dark. Toggleable via the header (sun/moon icon).
2. **Visual style** -- Retro (default) or Glass. Configurable in Settings > Appearance.
   - **Retro**: Sharp corners, monospace fonts, technical/industrial aesthetic.
   - **Glass**: Frosted blur backgrounds, rounded corners, modern aesthetic.

These are fully independent -- you can use Retro Dark, Retro Light, Glass Dark, or Glass Light.

---

## Settings Page Structure

The Settings page (`/settings`) has a sidebar with grouped tabs. Access varies by role:

### Personal (all roles)
- **Account** (`/settings/account`) -- Display name, email, password change
- **Appearance** (`/settings/appearance`) -- Theme, visual style
- **Notifications** (`/settings/notifications`) -- Email/push/webhook preferences

### Organization (admin only)
- **Sites** (`/settings/sites`) -- Plant CRUD
- **Branding** (`/settings/branding`) -- Logo, colors, app name
- **Localization** (`/settings/localization`) -- Language, date/number formats
- **Email & Webhooks** (`/settings/email-webhooks`) -- SMTP and webhook configuration

### Security
- **SSO** (`/settings/sso`) -- OIDC provider configuration (admin)
- **Signatures** (`/settings/signatures`) -- Electronic signature workflows, password policy (engineer+)
- **API Keys** (`/settings/api-keys`) -- API key management (engineer+)
- **Audit Log** (`/settings/audit-log`) -- Immutable audit trail viewer (admin)

### Data
- **Database** (`/settings/database`) -- DB config, backup, migrations (engineer+)
- **Retention** (`/settings/retention`) -- Data retention policies (engineer+)
- **Reports** (`/settings/reports`) -- Scheduled report configuration (engineer+)

### Integrations
- **AI** (`/settings/ai`) -- Anomaly detection model configuration (admin)

---

## Key URLs Reference

| URL                        | Auth Required | Description                       |
|---------------------------|--------------|-----------------------------------|
| `/login`                    | No           | Login page (username/password + SSO) |
| `/forgot-password`         | No           | Forgot password form              |
| `/reset-password`          | No           | Reset password (requires token)   |
| `/change-password`         | Yes*         | Forced password change            |
| `/dashboard`               | Yes          | Main SPC dashboard                |
| `/data-entry`              | Yes          | Manual data entry                 |
| `/violations`              | Yes          | Violation list and management     |
| `/reports`                 | Yes          | Report generation                 |
| `/configuration`           | Yes          | Hierarchy and characteristic config |
| `/connectivity`            | Yes          | MQTT, OPC-UA, gages, ERP         |
| `/connectivity/monitor`    | Yes          | Data source monitoring            |
| `/connectivity/servers`    | Yes          | OPC-UA server management          |
| `/connectivity/browse`     | Yes          | OPC-UA node browser               |
| `/connectivity/mapping`    | Yes          | Data source to characteristic mapping |
| `/connectivity/gages`      | Yes          | RS-232/USB gage bridge management |
| `/connectivity/integrations`| Yes         | ERP/LIMS connectors               |
| `/msa`                     | Yes          | MSA study list                    |
| `/msa/:studyId`            | Yes          | MSA study editor                  |
| `/fai`                     | Yes          | FAI report list                   |
| `/fai/:reportId`           | Yes          | FAI report editor                 |
| `/analytics`               | Yes          | AI anomaly detection              |
| `/doe`                     | Yes          | Design of Experiments             |
| `/doe/new`                 | Yes          | New DOE study                     |
| `/doe/:studyId`            | Yes          | DOE study editor                  |
| `/settings`                | Yes          | Settings (redirects to /settings/account) |
| `/settings/account`        | Yes          | Personal account settings         |
| `/admin/users`             | Yes          | User management (admin only)      |
| `/kiosk`                   | Yes          | Full-screen kiosk display         |
| `/wall-dashboard`          | Yes          | Wall-mounted dashboard display    |

*`/change-password` is shown when the `must_change_password` flag is set on the user. The user has a valid token but is redirected here before accessing any other authenticated route.

---

## Show Your Work

"Show Your Work" is a trust and transparency feature designed for regulated industries. It allows users to see exactly how every statistical value was computed.

### How It Works
1. **Toggle** -- A button in the header enables "Show Your Work" mode. This is a client-side toggle stored in a Zustand store.
2. **Visual indicator** -- When enabled, all statistical values (Cpk, Ppk, UCL, LCL, etc.) rendered with the `<Explainable>` wrapper component display a dotted underline.
3. **Click to explain** -- Clicking any underlined value opens a slide-out `ExplanationPanel` on the right side of the screen. The panel shows:
   - The formula (rendered with KaTeX)
   - Step-by-step computation with intermediate values
   - Input data used
   - AIAG citation for the method
4. **Value matching** -- The explanation API returns a computed value that must exactly match what is displayed on screen. The API has two computation modes depending on whether chart options (date range, limit) are passed.

### Regulatory Relevance
This feature directly supports audit requirements in:
- **21 CFR Part 11** (electronic records): Provides computation traceability
- **IATF 16949** (automotive): Demonstrates SPC method validity
- **ISO 13485** (medical devices): Supports validation of statistical methods
- **AS9100** (aerospace): Supports measurement uncertainty documentation
