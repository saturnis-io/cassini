# Phase 3 Feature Proposal: Enhanced Dashboard, Reporting & System Configuration

**Proposal ID:** 1738700000
**Submitted:** 2026-02-04
**Type:** scope_change (Major Feature Expansion)
**Requires CEO Approval:** Yes

---

## Executive Summary

This proposal breaks the CEO's comprehensive feature request into **5 logical phases** that can be executed incrementally. Each phase delivers standalone value while building toward the complete vision of a robust SPC monitoring and reporting platform.

---

## Phase 3.1: Bug Fixes & UX Foundation
**Priority:** Critical (Blockers)
**Estimated Complexity:** Low-Medium

### 3.1.1 Toast Notification System Enhancement
**Status:** Partially exists (Sonner)
- Ensure all CRUD operations show success/error toasts
- Add loading states with spinners
- Implement consistent messaging patterns
- Files: `frontend/src/api/client.ts`, component files

### 3.1.2 Mode Change Bug Fix
**Issue:** Cannot change modes when no samples exist; "Recalculate" requires samples but shouldn't be required for mode switching
- Allow mode switching without recalculation when sample_count = 0
- Only require recalculation confirmation when samples exist and limits would change
- Files: `frontend/src/components/CharacteristicForm.tsx`, `backend/src/openspc/api/v1/characteristics.py`

### 3.1.3 Configuration Page Selection Sync
**Issue:** Selecting characteristic doesn't highlight in hierarchy
- Sync tree selection state when characteristic is selected
- Add visual highlight to tree node when viewing its characteristic
- Files: `frontend/src/stores/configStore.ts`, `frontend/src/components/HierarchyTree.tsx`

### 3.1.4 Delete Operations
**Missing:** Cannot delete hierarchy nodes or characteristics
- Add delete endpoints with cascade rules
- Add confirmation dialogs
- Prevent deletion of nodes with children (or offer cascade option)
- Files: `backend/src/openspc/api/v1/hierarchy.py`, `backend/src/openspc/api/v1/characteristics.py`, frontend components

### 3.1.5 Enhanced Mode Tooltips
**Issue:** Z-score and mode-specific concepts need better explanation
- Add help tooltips for subgroup modes
- Add Z-score explanation in standardized mode
- Add tooltip for UCL/LCL interpretation per mode
- Files: `frontend/src/lib/help-content.ts`, form components

---

## Phase 3.2: System Configuration Hub
**Priority:** High
**Estimated Complexity:** Medium

### 3.2.1 External Systems Configuration
**New Page:** `/settings/connections` (or expanded Settings page)
- MQTT broker management (already exists in Settings)
- Sparkplug B protocol configuration
- OPC-UA connection settings (placeholder/future)
- Connection status monitoring dashboard
- Files: `frontend/src/pages/SettingsView.tsx`, new connection components

### 3.2.2 Theme & Appearance Configuration
**Robust Customization System:**
- Light/Dark/System toggle (exists, expand)
- Chart color palette configuration:
  - Data line colors (gradient start/end)
  - Control limit line colors (UCL, LCL, center)
  - Zone fill colors (A, B, C zones)
  - Violation indicator colors
  - Out-of-control region colors
- Save preferences to localStorage or backend
- Preview panel showing chart with current settings
- Preset themes (Classic, High Contrast, Colorblind-safe)

**Implementation:**
- Create `ThemeCustomizer` component
- Store color configuration in database or localStorage
- Apply CSS variables dynamically
- Export/import theme configurations
- Files: New `frontend/src/pages/AppearanceSettings.tsx`, `frontend/src/lib/theme-config.ts`

### 3.2.3 Settings Tab Completion
- Complete API Keys tab (exists in backend, wire up frontend)
- Complete Notifications tab (webhook configuration)
- Complete Database tab (backup/restore, statistics)

---

## Phase 3.3: Separate Data Entry Section
**Priority:** High
**Estimated Complexity:** Medium

### 3.3.1 Dedicated Data Entry Page
**New Page:** `/data-entry`
- Clear separation from Dashboard (viewing) vs Data Entry (input)
- Hierarchical characteristic browser (tree-based selection)
- Batch data entry mode
- Quick entry mode with characteristic search
- Sample history view with edit/delete capability
- Files: New `frontend/src/pages/DataEntryView.tsx`

### 3.3.2 Measurement Scheduling Framework
**Proposal for CEO review:**

**Option A: Simple Scheduling**
- Define sampling frequency per characteristic (every N minutes/hours)
- Display "overdue" status in UI
- Email/toast notifications when samples are due
- No enforcement, informational only

**Option B: Schedule-Driven Workflows**
- Define measurement schedules (cron-like)
- Generate "measurement tasks" automatically
- Operator queue showing pending measurements
- Completion tracking and SLA metrics

**Option C: Integration-Ready Hooks**
- Webhook endpoints for external schedulers (MES, CMMS)
- Event emission when samples are due/overdue
- Status endpoint for external systems to query

**Recommendation:** Start with Option A, architect for future expansion to B/C

### 3.3.3 Sample Management
- Edit existing samples (with audit trail)
- Delete samples (with confirmation and audit)
- Exclude/include samples from control limit calculations
- Bulk operations

---

## Phase 3.4: Enhanced Dashboard & Hierarchy UX
**Priority:** High
**Estimated Complexity:** Medium-High

### 3.4.1 Hierarchical Characteristic Selection
**Issue:** Current list loses hierarchy context
- Replace flat list with collapsible tree view
- Show full path breadcrumb for selected characteristic
- Quick search with hierarchy path in results
- Favorites/pinned characteristics
- Recent selections list
- Files: Refactor `TodoList.tsx` or replace with new `CharacteristicBrowser.tsx`

### 3.4.2 Time Range Selection
**New Feature:**
- Date range picker component
- Preset ranges (Last hour, 8 hours, 24 hours, 7 days, 30 days, Custom)
- Apply to chart data query
- Persist selection per characteristic or globally
- Files: New `frontend/src/components/TimeRangePicker.tsx`, update API queries

### 3.4.3 Nelson Rule Violation Annotations
**Chart Enhancement:**
- Highlight regions where Nelson rules are violated
- Toggle visibility of violation zones
- Color-code by rule type or severity
- Click region to see violation details
- Legend showing active annotations
- Implementation: Add `ReferenceArea` components to ControlChart for violation spans

### 3.4.4 Comparison Mode
**New Feature:** Compare same characteristic across two date ranges
- Split view or overlay mode
- Side-by-side statistics comparison
- Visual diff highlighting
- Export comparison report
- Files: New `frontend/src/components/ComparisonChart.tsx`

---

## Phase 3.5: Reporting Framework
**Priority:** Medium-High
**Estimated Complexity:** High

### 3.5.1 Reporting Architecture
**Extensible Framework:**
```
/reports
├── Canned Reports (pre-built)
│   ├── Control Chart Summary
│   ├── Violation History
│   ├── Capability Analysis (Cp, Cpk)
│   ├── Process Performance (Pp, Ppk)
│   └── Shift/Trend Analysis
├── Ad-Hoc Report Builder (power users)
│   ├── Select characteristics (multi-select)
│   ├── Choose metrics/KPIs
│   ├── Define date range
│   ├── Add filters
│   └── Generate report
└── Scheduled Reports
    ├── Email distribution
    ├── Export (PDF, Excel, CSV)
    └── Archive storage
```

### 3.5.2 Canned Reports
**Initial Set:**
1. **Control Chart Summary** - Single characteristic overview with stats
2. **Violation Report** - All violations in date range with details
3. **Multi-Characteristic Status** - Dashboard view of all characteristics
4. **Shift Performance** - Compare by time-of-day or shift
5. **Capability Study** - Cp, Cpk, Pp, Ppk calculations

### 3.5.3 Ad-Hoc Report Builder
**Power User Feature:**
- Drag-and-drop report designer
- Metric selection panel
- Filter builder
- Chart type selection
- Table/grid configuration
- Save as template
- Share with other users

### 3.5.4 Export & Distribution
- PDF generation (server-side)
- Excel export with formatting
- CSV for data analysis
- Scheduled email distribution
- Report archive with search

---

## Phase Dependency Graph

```
Phase 3.1 (Bug Fixes) ────────────────────────────────┐
                                                      │
Phase 3.2 (System Config) ──────────────────────────┬─┼─→ Can run in parallel
                                                    │ │
Phase 3.3 (Data Entry) ─────────────────────────────┤ │
                                                    │ │
Phase 3.4 (Dashboard UX) ───────────────────────────┴─┘
         │
         ↓
Phase 3.5 (Reporting) ─────────────────────────────────→ Depends on 3.4
```

---

## Recommended Execution Order

### Wave 1: Foundation (Phases 3.1 + 3.2 in parallel)
- Fix all bugs first (3.1) - builds user trust
- System configuration (3.2) - enables customization

### Wave 2: Core UX (Phases 3.3 + 3.4 in parallel)
- Data entry separation (3.3) - cleaner workflow
- Dashboard enhancements (3.4) - better analysis

### Wave 3: Advanced Features (Phase 3.5)
- Reporting framework - builds on all prior work
- Can be released incrementally (canned → ad-hoc → scheduled)

---

## Technical Considerations

### Database Changes
- New tables: `theme_preferences`, `report_templates`, `scheduled_reports`, `measurement_schedules`
- New columns on `characteristic`: `sampling_frequency`, `last_scheduled_at`

### API Additions
- Theme preferences endpoints
- Report generation endpoints
- Schedule management endpoints
- Enhanced query parameters for time ranges

### Frontend Components (New)
- `TimeRangePicker`
- `ThemeCustomizer`
- `ComparisonChart`
- `ReportBuilder`
- `DataEntryView`
- `CharacteristicBrowser` (hierarchical)

### Performance Considerations
- Large date range queries need pagination/aggregation
- Report generation should be async with progress indication
- Consider caching for frequently-accessed reports

---

## CEO Decisions (2026-02-04)

1. **Measurement Scheduling:** Option C - Integration hooks (webhooks for external schedulers like MES, CMMS)

2. **Comparison Mode:** Side-by-side split view

3. **Reporting Priority:** Canned reports first, ad-hoc later

4. **Theme Customization:** Intermediate with option to override with advanced

5. **Data Entry Access:** Open access (may change in future - architect for flexibility)

6. **Additional Requirement - Integrated Histogram:**
   - X-Bar chart with histogram displayed on its side (rotated 90°) to the right
   - Histogram Y-axis aligns perfectly with chart UCL/LCL/USL/LSL
   - Hovering/selecting data point on X-Bar highlights corresponding histogram bucket
   - Shows distribution of points in relation to control/spec limits

---

## Approval Status

- [x] Phase structure and prioritization - **APPROVED**
- [x] Phase 3.1 execution authorized
- [x] Clarifying questions answered

**Execution Started:** 2026-02-04
