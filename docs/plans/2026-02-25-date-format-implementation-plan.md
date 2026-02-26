# Date/DateTime Format Localization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add plant-scoped date/datetime format configuration with system defaults, a centralized formatting utility, and reorganize the settings sidebar into categorical groups.

**Architecture:** System defaults stored in a single-row `system_settings` table. Plant overrides stored in existing `plant.settings` JSON column. A lightweight CLDR token formatter in `lib/date-format.ts` replaces all 50+ ad-hoc `toLocaleString()` calls. Settings sidebar restructured from 2 flat groups into 5 categorical sections.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React 19 + TypeScript + TanStack Query + Zustand (frontend), Alembic migration 039, ECharts tooltip formatting.

---

### Task 1: Backend — System Settings Model + Migration

**Files:**
- Create: `backend/src/cassini/db/models/system_settings.py`
- Modify: `backend/src/cassini/db/models/__init__.py`
- Create: `backend/alembic/versions/20260225_system_settings.py`

**Step 1: Create the SystemSettings model**

Create `backend/src/cassini/db/models/system_settings.py`:

```python
"""System-wide settings (single-row table)."""

from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from cassini.db.base import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SystemSettings(Base):
    __tablename__ = "system_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_system_settings_singleton"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    date_format: Mapped[str] = mapped_column(
        String(50), nullable=False, default="YYYY-MM-DD"
    )
    datetime_format: Mapped[str] = mapped_column(
        String(50), nullable=False, default="YYYY-MM-DD HH:mm:ss"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=func.now(),
        onupdate=_utc_now,
        nullable=False,
    )
```

**Step 2: Register in model __init__**

Add to `backend/src/cassini/db/models/__init__.py`:
- Import: `from cassini.db.models.system_settings import SystemSettings`
- Add `"SystemSettings"` to `__all__`

**Step 3: Create Alembic migration 039**

Run: `cd backend && alembic revision --autogenerate -m "add system_settings table"`

Verify the generated migration creates `system_settings` table with:
- `id` INTEGER PK with CHECK constraint
- `date_format` VARCHAR(50) NOT NULL DEFAULT 'YYYY-MM-DD'
- `datetime_format` VARCHAR(50) NOT NULL DEFAULT 'YYYY-MM-DD HH:mm:ss'
- `updated_at` DATETIME(timezone=True)

Then add a seed insert after the `create_table`:
```python
op.execute(
    "INSERT INTO system_settings (id, date_format, datetime_format) "
    "VALUES (1, 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss')"
)
```

**Step 4: Run migration**

Run: `cd backend && alembic upgrade head`
Expected: Migration 039 applied, `system_settings` table created with 1 row.

**Step 5: Commit**

```bash
git add backend/src/cassini/db/models/system_settings.py backend/src/cassini/db/models/__init__.py backend/alembic/versions/20260225_system_settings.py
git commit -m "feat: add system_settings model and migration 039"
```

---

### Task 2: Backend — System Settings API Endpoints

**Files:**
- Create: `backend/src/cassini/api/schemas/system_settings.py`
- Create: `backend/src/cassini/api/v1/system_settings.py`
- Modify: `backend/src/cassini/main.py` (router registration)
- Modify: `backend/src/cassini/core/audit.py` (resource pattern)

**Step 1: Create Pydantic schemas**

Create `backend/src/cassini/api/schemas/system_settings.py`:

```python
"""Schemas for system settings API."""

from datetime import datetime

from pydantic import BaseModel, Field


class SystemSettingsResponse(BaseModel):
    """Response schema for system settings."""
    model_config = {"from_attributes": True}

    date_format: str
    datetime_format: str
    updated_at: datetime


class SystemSettingsUpdate(BaseModel):
    """Update schema for system settings."""

    date_format: str | None = Field(None, max_length=50)
    datetime_format: str | None = Field(None, max_length=50)
```

**Step 2: Create router**

Create `backend/src/cassini/api/v1/system_settings.py`:

```python
"""System settings API endpoints."""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_admin, get_current_user, get_db_session
from cassini.api.schemas.system_settings import (
    SystemSettingsResponse,
    SystemSettingsUpdate,
)
from cassini.db.models.system_settings import SystemSettings
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/system-settings", tags=["system-settings"])


@router.get("/", response_model=SystemSettingsResponse)
async def get_system_settings(
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> SystemSettingsResponse:
    """Get system-wide settings. Any authenticated user can read."""
    result = await session.execute(select(SystemSettings).where(SystemSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        # Return defaults if row doesn't exist yet
        return SystemSettingsResponse(
            date_format="YYYY-MM-DD",
            datetime_format="YYYY-MM-DD HH:mm:ss",
            updated_at=SystemSettings._utc_now() if hasattr(SystemSettings, '_utc_now') else __import__('datetime').datetime.now(__import__('datetime').timezone.utc),
        )
    return SystemSettingsResponse.model_validate(settings)


@router.put("/", response_model=SystemSettingsResponse)
async def update_system_settings(
    data: SystemSettingsUpdate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_admin),
) -> SystemSettingsResponse:
    """Update system-wide settings. Admin only."""
    result = await session.execute(select(SystemSettings).where(SystemSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = SystemSettings(id=1)
        session.add(settings)

    if data.date_format is not None:
        settings.date_format = data.date_format
    if data.datetime_format is not None:
        settings.datetime_format = data.datetime_format

    await session.commit()
    await session.refresh(settings)
    logger.info("system_settings_updated", date_format=settings.date_format, datetime_format=settings.datetime_format)
    return SystemSettingsResponse.model_validate(settings)
```

**Step 3: Register router in main.py**

In `backend/src/cassini/main.py`:
- Add import: `from cassini.api.v1.system_settings import router as system_settings_router`
- Add registration: `app.include_router(system_settings_router)` in the router block

**Step 4: Add audit pattern**

In `backend/src/cassini/core/audit.py`, add to `_RESOURCE_PATTERNS` list:
```python
(re.compile(r"/system-settings"), "system_settings"),
```

**Step 5: Verify endpoints work**

Run: `cd backend && uvicorn cassini.main:app --reload`
Test: `GET /api/v1/system-settings/` (should return defaults)
Test: `PUT /api/v1/system-settings/` with `{"date_format": "MM/DD/YYYY"}` (admin only)

**Step 6: Commit**

```bash
git add backend/src/cassini/api/schemas/system_settings.py backend/src/cassini/api/v1/system_settings.py backend/src/cassini/main.py backend/src/cassini/core/audit.py
git commit -m "feat: system settings API endpoints (GET/PUT)"
```

---

### Task 3: Frontend — Date Format Token Formatter Library

**Files:**
- Create: `frontend/src/lib/date-format.ts`

**Step 1: Create the formatter library**

Create `frontend/src/lib/date-format.ts` with:

1. **Month name arrays** — `MONTHS_FULL` and `MONTHS_ABBR` (English, zero-indexed)

2. **`applyFormat(date: Date, format: string): string`** — Core formatter:
   - Token replacement order (longest first to avoid partial matches): `YYYY`, `YY`, `MMMM`, `MMM`, `MM`, `DD`, `HH`, `hh`, `mm`, `ss`, `a`
   - Use regex replacement with a token map to avoid double-replacement issues
   - `hh` = 12-hour (01-12), `HH` = 24-hour (00-23), `a` = AM/PM

3. **Preset registries:**
```typescript
export const DATE_PRESETS = [
  { key: 'iso', label: 'ISO 8601', format: 'YYYY-MM-DD' },
  { key: 'us', label: 'US', format: 'MM/DD/YYYY' },
  { key: 'eu', label: 'EU', format: 'DD/MM/YYYY' },
  { key: 'uk', label: 'UK', format: 'DD MMM YYYY' },
  { key: 'east-asian', label: 'East Asian', format: 'YYYY/MM/DD' },
] as const

export const DATETIME_PRESETS = [
  { key: 'iso', label: 'ISO 8601', format: 'YYYY-MM-DD HH:mm:ss' },
  { key: 'us', label: 'US (12h)', format: 'MM/DD/YYYY hh:mm a' },
  { key: 'eu', label: 'EU (24h)', format: 'DD/MM/YYYY HH:mm' },
  { key: 'uk', label: 'UK (12h)', format: 'DD MMM YYYY hh:mm a' },
  { key: 'east-asian', label: 'East Asian (24h)', format: 'YYYY/MM/DD HH:mm' },
] as const
```

4. **`validateFormatString(format: string): boolean`** — Returns true if the format string contains at least one recognized token and no invalid sequences.

5. **`FORMAT_TOKENS`** — Exported array of `{ token, description, example }` for the reference panel.

**Implementation note for `applyFormat`:** Use a single regex pass to avoid the problem where replacing `MM` could interfere with `mm`. Strategy: build a regex that matches all tokens `/(YYYY|YY|MMMM|MMM|MM|DD|HH|hh|mm|ss|a)/g` and replace in one `.replace()` call with a callback that maps each match to its value.

**Step 2: Commit**

```bash
git add frontend/src/lib/date-format.ts
git commit -m "feat: date format token formatter library with presets"
```

---

### Task 4: Frontend — System Settings API + Hook + useDateFormat

**Files:**
- Create: `frontend/src/api/system-settings.api.ts`
- Create: `frontend/src/api/hooks/systemSettings.ts`
- Modify: `frontend/src/api/hooks/index.ts` (add barrel export)
- Modify: `frontend/src/api/hooks/queryKeys.ts` (add key)
- Modify: `frontend/src/types/index.ts` (add types)
- Create: `frontend/src/hooks/useDateFormat.ts`

**Step 1: Add TypeScript types**

Add to `frontend/src/types/index.ts`:

```typescript
// System settings
export interface SystemSettings {
  date_format: string
  datetime_format: string
  updated_at: string
}

export interface SystemSettingsUpdate {
  date_format?: string
  datetime_format?: string
}
```

**Step 2: Create API namespace**

Create `frontend/src/api/system-settings.api.ts`:

```typescript
import type { SystemSettings, SystemSettingsUpdate } from '@/types'
import { fetchApi } from './client'

export const systemSettingsApi = {
  get: () => fetchApi<SystemSettings>('/system-settings/'),

  update: (data: SystemSettingsUpdate) =>
    fetchApi<SystemSettings>('/system-settings/', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}
```

**Step 3: Add query keys**

In `frontend/src/api/hooks/queryKeys.ts`, add:

```typescript
systemSettings: {
  all: ['systemSettings'] as const,
  current: () => ['systemSettings', 'current'] as const,
},
```

**Step 4: Create hooks**

Create `frontend/src/api/hooks/systemSettings.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { systemSettingsApi } from '../system-settings.api'
import { queryKeys } from './queryKeys'
import type { SystemSettingsUpdate } from '@/types'

export function useSystemSettings() {
  return useQuery({
    queryKey: queryKeys.systemSettings.current(),
    queryFn: () => systemSettingsApi.get(),
    staleTime: 5 * 60 * 1000, // 5 minutes — rarely changes
  })
}

export function useUpdateSystemSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SystemSettingsUpdate) => systemSettingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings.all })
      toast.success('System settings updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update system settings: ${error.message}`)
    },
  })
}
```

**Step 5: Add barrel export**

In `frontend/src/api/hooks/index.ts`, add:
```typescript
export * from './systemSettings'
```

**Step 6: Create useDateFormat hook**

Create `frontend/src/hooks/useDateFormat.ts`:

```typescript
import { useCallback, useMemo } from 'react'
import { usePlantContext } from '@/providers/PlantProvider'
import { useSystemSettings } from '@/api/hooks'
import { applyFormat } from '@/lib/date-format'

const DEFAULT_DATE = 'YYYY-MM-DD'
const DEFAULT_DATETIME = 'YYYY-MM-DD HH:mm:ss'

export function useDateFormat() {
  const { selectedPlant } = usePlantContext()
  const { data: systemSettings } = useSystemSettings()

  const dateFormat = useMemo(
    () =>
      (selectedPlant?.settings as Record<string, unknown> | null)?.date_format as string | undefined
      ?? systemSettings?.date_format
      ?? DEFAULT_DATE,
    [selectedPlant?.settings, systemSettings?.date_format],
  )

  const datetimeFormat = useMemo(
    () =>
      (selectedPlant?.settings as Record<string, unknown> | null)?.datetime_format as string | undefined
      ?? systemSettings?.datetime_format
      ?? DEFAULT_DATETIME,
    [selectedPlant?.settings, systemSettings?.datetime_format],
  )

  const formatDate = useCallback(
    (d: string | Date) => {
      const date = typeof d === 'string' ? new Date(d) : d
      return applyFormat(date, dateFormat)
    },
    [dateFormat],
  )

  const formatDateTime = useCallback(
    (d: string | Date) => {
      const date = typeof d === 'string' ? new Date(d) : d
      return applyFormat(date, datetimeFormat)
    },
    [datetimeFormat],
  )

  return { formatDate, formatDateTime, dateFormat, datetimeFormat }
}
```

**Step 7: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/system-settings.api.ts frontend/src/api/hooks/systemSettings.ts frontend/src/api/hooks/index.ts frontend/src/api/hooks/queryKeys.ts frontend/src/hooks/useDateFormat.ts
git commit -m "feat: useDateFormat hook with system settings API integration"
```

---

### Task 5: Frontend — Settings Sidebar Reorganization

**Files:**
- Modify: `frontend/src/pages/SettingsView.tsx`
- Modify: `frontend/src/i18n/locales/en/settings.json`

**Step 1: Update i18n translations**

Replace `frontend/src/i18n/locales/en/settings.json` with new group keys:

```json
{
  "title": "Settings",
  "subtitle": "Configure system settings and integrations",
  "groups": {
    "personal": "Personal",
    "organization": "Organization",
    "security": "Security & Compliance",
    "data": "Data & Infrastructure",
    "integrations": "Integrations"
  },
  "tabs": {
    "appearance": "Appearance",
    "notifications": "Notifications",
    "sites": "Sites",
    "branding": "Branding",
    "localization": "Localization",
    "sso": "SSO",
    "signatures": "Signatures",
    "apiKeys": "API Keys",
    "auditLog": "Audit Log",
    "database": "Database",
    "retention": "Retention",
    "reports": "Reports",
    "ai": "AI Config"
  }
}
```

**Step 2: Restructure SIDEBAR_GROUPS in SettingsView.tsx**

Replace the `SIDEBAR_GROUPS` array (lines 33-55) with 5 groups:

```typescript
import {
  Key,
  Bell,
  Database,
  Palette,
  Building2,
  Factory,
  Archive,
  Shield,
  Fingerprint,
  FileText,
  PenLine,
  Globe,
  Brain,
} from 'lucide-react'

const SIDEBAR_GROUPS: SidebarGroupDef[] = [
  {
    labelKey: 'groups.personal',
    tabs: [
      { to: 'appearance', labelKey: 'tabs.appearance', icon: Palette },
      { to: 'notifications', labelKey: 'tabs.notifications', icon: Bell },
    ],
  },
  {
    labelKey: 'groups.organization',
    tabs: [
      { to: 'sites', labelKey: 'tabs.sites', icon: Factory, minRole: 'admin' },
      { to: 'branding', labelKey: 'tabs.branding', icon: Building2, minRole: 'admin' },
      { to: 'localization', labelKey: 'tabs.localization', icon: Globe, minRole: 'admin' },
    ],
  },
  {
    labelKey: 'groups.security',
    tabs: [
      { to: 'sso', labelKey: 'tabs.sso', icon: Fingerprint, minRole: 'admin' },
      { to: 'signatures', labelKey: 'tabs.signatures', icon: PenLine, minRole: 'engineer' },
      { to: 'api-keys', labelKey: 'tabs.apiKeys', icon: Key, minRole: 'engineer' },
      { to: 'audit-log', labelKey: 'tabs.auditLog', icon: Shield, minRole: 'admin' },
    ],
  },
  {
    labelKey: 'groups.data',
    tabs: [
      { to: 'database', labelKey: 'tabs.database', icon: Database, minRole: 'engineer' },
      { to: 'retention', labelKey: 'tabs.retention', icon: Archive, minRole: 'engineer' },
      { to: 'reports', labelKey: 'tabs.reports', icon: FileText, minRole: 'engineer' },
    ],
  },
  {
    labelKey: 'groups.integrations',
    tabs: [
      { to: 'ai', labelKey: 'tabs.ai', icon: Brain, minRole: 'admin' },
    ],
  },
]
```

**Step 3: Commit**

```bash
git add frontend/src/pages/SettingsView.tsx frontend/src/i18n/locales/en/settings.json
git commit -m "feat: reorganize settings sidebar into 5 categorical groups"
```

---

### Task 6: Frontend — Localization Settings Page

**Files:**
- Create: `frontend/src/components/LocalizationSettings.tsx`
- Modify: `frontend/src/App.tsx` (add route)

**Step 1: Create the component**

Create `frontend/src/components/LocalizationSettings.tsx`:

The component has two sections:

**System Defaults section** (top):
- "Date Format" label + dropdown of `DATE_PRESETS` + "Custom" option
- "DateTime Format" label + dropdown of `DATETIME_PRESETS` + "Custom" option
- When Custom is selected: text input field + live preview
- Collapsible "Format Reference" panel showing `FORMAT_TOKENS` table
- Save button calls `useUpdateSystemSettings()`

**Plant Overrides section** (below):
- Plant selector dropdown (from `usePlantContext().plants`)
- Same date/datetime dropdowns but with "System Default" as first option (value `""`)
- Selecting "System Default" removes the key from `plant.settings`
- Save button calls `useUpdatePlant()` with updated `settings` JSON
- Live preview for each format

**Live preview**: Shows the current date/time formatted with the selected format string. Use `applyFormat(new Date(), format)` and update on each change. Display in a monospace badge.

**Token Reference panel**: Collapsible `<details>` or disclosure with the token table from `FORMAT_TOKENS`. Always visible when Custom is selected, collapsible otherwise.

Pattern notes:
- Use `useSystemSettings()` + `useUpdateSystemSettings()` for system section
- Use `usePlantContext()` + `useUpdatePlant()` for plant section
- Import `DATE_PRESETS`, `DATETIME_PRESETS`, `FORMAT_TOKENS`, `applyFormat` from `@/lib/date-format`
- Follow existing settings component patterns (card layout, section headers)

**Step 2: Add route in App.tsx**

In `frontend/src/App.tsx`:
- Add import: `import { LocalizationSettings } from '@/components/LocalizationSettings'`
- Add route inside the settings block (after the `sites` route): `<Route path="localization" element={<ProtectedRoute minRole="admin"><LocalizationSettings /></ProtectedRoute>} />`

**Step 3: Commit**

```bash
git add frontend/src/components/LocalizationSettings.tsx frontend/src/App.tsx
git commit -m "feat: localization settings page with system defaults and plant overrides"
```

---

### Task 7: Frontend — Migrate All Date Formatting Calls

**Files:**
- Modify: ~50 component files (listed below)

This is the largest task. Every `toLocaleString()`, `toLocaleDateString()`, and `toLocaleTimeString()` call on Date objects needs to be replaced with `formatDate()` or `formatDateTime()` from the `useDateFormat()` hook.

**Migration pattern:**

Before:
```typescript
export function SomeComponent() {
  // ...
  return <span>{new Date(item.timestamp).toLocaleString()}</span>
}
```

After:
```typescript
import { useDateFormat } from '@/hooks/useDateFormat'

export function SomeComponent() {
  const { formatDateTime } = useDateFormat()
  // ...
  return <span>{formatDateTime(item.timestamp)}</span>
}
```

**Decision rules:**
- `toLocaleString()` on timestamps → `formatDateTime()`
- `toLocaleDateString()` (date only) → `formatDate()`
- `toLocaleTimeString()` (time only) → keep as-is (time-only formatting is not in scope)
- Date formatting in ECharts tooltip formatters → use `applyFormat()` directly (not the hook, since these are plain functions, not components). Import format string from a module-level constant or pass it through chart options.
- Date formatting in utility functions (`export-utils.ts`, `retention/utils.ts`) → accept format string as parameter, use `applyFormat()` directly

**Files to migrate** (grouped by priority):

**Audit & compliance (highest priority):**
- `AuditLogViewer.tsx` — line ~155, timestamp column
- `SignatureHistory.tsx` — signature timestamps
- `SignatureManifest.tsx` — manifest dates
- `SignatureVerifyBadge.tsx` — verification dates
- `FAIPrintView.tsx` — FAI report dates
- `WorkflowProgress.tsx` — workflow timestamps

**Dashboard & charts:**
- `AttributeChart.tsx` — tooltip timestamps
- `CUSUMChart.tsx` — tooltip timestamps
- `EWMAChart.tsx` — tooltip timestamps
- `RangeChart.tsx` — adaptive date formatting
- `BoxWhiskerChart.tsx` — timestamps
- `T2Chart.tsx` — timestamps
- `ChartRangeSlider.tsx` — range labels

**Data views:**
- `ViolationsView.tsx` — 4+ date locations
- `SampleInspectorModal.tsx` — sample dates
- `SampleEditModal.tsx` — edit dates
- `SampleHistoryPanel.tsx` — history dates
- `EditHistoryTooltip.tsx` — edit timestamps

**Annotations:**
- `AnnotationDetailPopover.tsx` — 3 locations
- `AnnotationDialog.tsx` — date display
- `AnnotationListPanel.tsx` — entry history

**Analytics:**
- `AIInsightPanel.tsx` — insight dates
- `AIInsightsTab.tsx` — tab dates
- `AnomalyEventList.tsx` — event dates
- `AnomalyEventDetail.tsx` — detail dates
- `AnomalySummaryCard.tsx` — summary dates
- `CorrelationTab.tsx` — result timestamps
- `PredictionsTab.tsx` — forecast dates
- `PredictionConfig.tsx` — config dates

**Settings & admin:**
- `ApiKeysSettings.tsx` — key dates
- `DatabaseSettings.tsx` — backup/migration dates
- `RetentionSettings.tsx` — purge dates
- `BrokerStatusCards.tsx` — connection dates
- `ConnectorCard.tsx` — ERP sync dates
- `SyncLogViewer.tsx` — sync timestamps

**Pickers & selectors:**
- `DateTimePicker.tsx` — display formatting (keep internal date logic, replace display strings)
- `LocalTimeRangeSelector.tsx` — range display

**Other:**
- `ScheduleConfigSection.tsx` — schedule times
- `ScheduledReports.tsx` — report dates (in `settings/`)
- `RegionActionModal.tsx` — region dates
- `ReportPreview.tsx` — report dates
- `GeneralTab.tsx` — characteristic config dates
- `AccountLinkingPanel.tsx` — linking dates

**Utility files (accept format as parameter):**
- `export-utils.ts` — export date formatting
- `retention/utils.ts` — retention date formatting

**Step approach:** Work through files alphabetically. For each file:
1. Add `import { useDateFormat } from '@/hooks/useDateFormat'` (or `import { applyFormat } from '@/lib/date-format'` for non-component files)
2. Add `const { formatDate, formatDateTime } = useDateFormat()` at top of component
3. Replace all `new Date(x).toLocaleString()` → `formatDateTime(x)`
4. Replace all `new Date(x).toLocaleDateString(...)` → `formatDate(x)`
5. Verify no TypeScript errors: `npx tsc --noEmit`

**Commit in batches** (roughly 10-15 files per commit):

```bash
git commit -m "refactor: migrate audit/compliance components to useDateFormat"
git commit -m "refactor: migrate chart components to useDateFormat"
git commit -m "refactor: migrate data view components to useDateFormat"
git commit -m "refactor: migrate remaining components to useDateFormat"
```

---

### Task 8: Frontend — Audit Log Labels

**Files:**
- Modify: `frontend/src/components/AuditLogViewer.tsx`

**Step 1: Add resource and action labels**

In `AuditLogViewer.tsx`:

Add to `RESOURCE_LABELS` object:
```typescript
system_settings: 'System Settings',
```

(No new action labels needed — existing "update" action covers PUT.)

**Step 2: Commit**

```bash
git add frontend/src/components/AuditLogViewer.tsx
git commit -m "feat: add system_settings audit log labels"
```

---

### Task 9: Type-check + Build Verification

**Step 1: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

**Step 2: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

**Step 3: Manual smoke test**

1. Start backend: `cd backend && uvicorn cassini.main:app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Navigate to Settings → verify 5 sidebar groups render correctly
4. Navigate to Settings → Localization → verify system defaults load
5. Change date format to "US" → verify live preview shows `02/25/2026`
6. Navigate to a dashboard with date columns → verify dates use the new format
7. Check audit log → verify "System Settings" shows for format changes

**Step 4: Final commit if any fixes needed**

```bash
git commit -m "fix: type-check and build fixes for date format feature"
```

---

## Summary

| Task | Description | Estimated Scope |
|------|-------------|-----------------|
| 1 | Backend model + migration | 3 files, ~40 lines |
| 2 | Backend API endpoints | 4 files, ~80 lines |
| 3 | Token formatter library | 1 file, ~100 lines |
| 4 | System settings API + useDateFormat hook | 6 files, ~120 lines |
| 5 | Settings sidebar reorganization | 2 files, ~50 lines changed |
| 6 | Localization settings page | 2 files, ~250 lines |
| 7 | Migrate 50+ components | ~50 files, find-replace pattern |
| 8 | Audit log labels | 1 file, ~2 lines |
| 9 | Type-check + build verification | 0 files, verification only |

**Dependencies:** Tasks 1→2 (API needs model), Tasks 3+4 can run in parallel after 1-2, Task 5 is independent, Task 6 depends on 4+5, Task 7 depends on 3+4, Tasks 8-9 are last.

**Parallel execution opportunities:**
- Wave 1: Tasks 1+3 (backend model + frontend formatter lib)
- Wave 2: Tasks 2+4+5 (backend API + frontend hooks + sidebar reorg)
- Wave 3: Tasks 6+7+8 (localization page + component migration + audit labels)
- Wave 4: Task 9 (verification)
