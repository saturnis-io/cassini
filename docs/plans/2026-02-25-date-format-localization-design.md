# Date/DateTime Format Localization + Settings Reorganization

**Date**: 2026-02-25
**Status**: Approved
**Scope**: Plant-scoped date formatting, system defaults, settings sidebar reorg

## Problem

50+ frontend components format dates independently using `toLocaleString()` with no
centralized control. Regulated industries require standardized date formats across a
plant. The settings sidebar has grown to 12 flat tabs with no categorical grouping.

## Design Decisions

- **Approach A**: Plant settings JSON + formatting hook + lightweight token parser
- System defaults in a new `system_settings` table (single-row)
- Plant overrides in existing `plant.settings` JSON column
- Resolution: plant → system → ISO 8601 hardcoded fallback
- CLDR token syntax for custom formats (YYYY, MM, DD, HH, mm, ss, etc.)
- No external date library — custom token formatter (~60 lines)

## Data Model

### System Settings Table (new)

```sql
CREATE TABLE system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    date_format VARCHAR(50) NOT NULL DEFAULT 'YYYY-MM-DD',
    datetime_format VARCHAR(50) NOT NULL DEFAULT 'YYYY-MM-DD HH:mm:ss',
    updated_at DATETIME(timezone=True) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Single-row table enforced by `CHECK (id = 1)`. Stores system-wide defaults.

### Plant Settings JSON (existing column, new keys)

```json
{
  "timezone": "America/Chicago",
  "date_format": "MM/DD/YYYY",
  "datetime_format": "MM/DD/YYYY hh:mm a"
}
```

Null/absent keys mean "use system default."

### Resolution Order

```
plant.settings.date_format
  ?? system_settings.date_format
    ?? "YYYY-MM-DD"
```

Same chain for `datetime_format`.

## Backend API

### New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/system-settings` | any authenticated | Get system settings |
| PUT | `/system-settings` | admin | Update system settings |

Plant date format is read/written via existing `GET/PUT /plants/{id}` (settings JSON).

### Audit Coverage

- System settings changes logged by audit middleware (PUT /system-settings)
- Plant settings changes already audited via plant endpoints
- `_RESOURCE_PATTERNS` entry for `system-settings`
- `RESOURCE_LABELS` and `ACTION_LABELS` in AuditLogViewer

## Frontend

### Token Formatter (`lib/date-format.ts`)

Lightweight token parser, zero dependencies:

**Supported tokens** (matched longest-first):

| Token | Output | Example |
|-------|--------|---------|
| YYYY | 4-digit year | 2026 |
| YY | 2-digit year | 26 |
| MMMM | Full month | February |
| MMM | Abbreviated month | Feb |
| MM | Zero-padded month | 02 |
| DD | Zero-padded day | 25 |
| HH | 24-hour hour | 14 |
| hh | 12-hour hour | 02 |
| mm | Minute | 30 |
| ss | Second | 45 |
| a | AM/PM | PM |

**Functions**:
- `applyFormat(date: Date, format: string): string` — core formatter
- `DATE_PRESETS` / `DATETIME_PRESETS` — preset registries
- `validateFormatString(format: string): boolean` — validates custom input

### `useDateFormat()` Hook

```typescript
function useDateFormat(): {
  formatDate: (d: string | Date) => string
  formatDateTime: (d: string | Date) => string
  dateFormat: string
  datetimeFormat: string
}
```

Reads active plant settings from Zustand store, falls back to system settings
(React Query), falls back to ISO 8601.

### Migration of 50+ Components

Every `new Date(x).toLocaleString()` and `toLocaleDateString()` call replaced with
`formatDate()` or `formatDateTime()` from the hook.

## Localization Settings Page (`/settings/localization`)

### System Defaults Section (admin only)

- Date Format dropdown: ISO 8601, US, EU, UK, East Asian, Custom
- DateTime Format dropdown: matching presets with time suffixes
- Live preview with current date/time
- Custom mode: text input + collapsible token reference table on page

### Plant Overrides Section (admin only)

- Plant selector dropdown
- Same format dropdowns with "Use system default" as first option
- Per-plant live preview

### Token Reference Panel

Inline collapsible panel showing the token table. Visible when Custom is selected.
Updates live preview as user types.

## Settings Sidebar Reorganization

### Current (flat, 12 tabs)

```
Appearance, Notifications, Branding, Sites, API Keys,
Retention, Reports, SSO, Signatures, Audit Log, AI, Database
```

### Proposed (5 grouped sections)

```
PERSONAL
  Appearance
  Notifications

ORGANIZATION
  Sites
  Branding
  Localization          (NEW)

SECURITY & COMPLIANCE
  SSO
  Signatures
  API Keys
  Audit Log

DATA & INFRASTRUCTURE
  Database
  Retention
  Reports

INTEGRATIONS
  AI Config
```

Section headers are non-clickable styled labels. Routes remain flat
(`/settings/localization`). Role-gating stays per-tab. Default route
unchanged (`/settings` → `/settings/appearance`).

## Preset Definitions

### Date Presets

| Key | Label | Format | Example |
|-----|-------|--------|---------|
| iso | ISO 8601 | YYYY-MM-DD | 2026-02-25 |
| us | US | MM/DD/YYYY | 02/25/2026 |
| eu | EU | DD/MM/YYYY | 25/02/2026 |
| uk | UK | DD MMM YYYY | 25 Feb 2026 |
| east-asian | East Asian | YYYY/MM/DD | 2026/02/25 |

### DateTime Presets

| Key | Label | Format | Example |
|-----|-------|--------|---------|
| iso | ISO 8601 | YYYY-MM-DD HH:mm:ss | 2026-02-25 14:30:45 |
| us | US (12h) | MM/DD/YYYY hh:mm a | 02/25/2026 02:30 PM |
| eu | EU (24h) | DD/MM/YYYY HH:mm | 25/02/2026 14:30 |
| uk | UK (12h) | DD MMM YYYY hh:mm a | 25 Feb 2026 02:30 PM |
| east-asian | East Asian (24h) | YYYY/MM/DD HH:mm | 2026/02/25 14:30 |

## Scope Boundaries

**In scope**: System settings table, plant settings keys, token formatter, useDateFormat
hook, localization settings page, settings sidebar reorg, migration of all date
formatting calls, audit log integration.

**Out of scope**: Timezone conversion (plant.settings.timezone exists but rendering in
plant TZ is a separate feature), number formatting, currency, i18n/l10n of UI strings.
