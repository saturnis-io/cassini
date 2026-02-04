# Phase 3.5: Reporting Framework + Hierarchy Navigation + Nelson Rules Acknowledgement

## Phase Goals
1. Replace flat TodoList with hierarchy-based characteristic selection
2. Add "require acknowledgement" per Nelson rule (default: true)
3. Display rules that don't require acknowledgement differently on violations page and footer
4. Implement canned reports with extensible architecture
5. Export to PDF, Excel, CSV formats

---

## Decisions

### 1. TodoList Enhancement Approach
**Decision: B) Hierarchy + Status Filtering**

Replace the flat list with a hierarchy tree. Add filter tabs (All/OOC/Due/OK) that highlight/filter tree nodes.

**Rationale:** Single unified view that shows organizational structure while preserving status-based workflow.

### 2. Status Indicators in Hierarchy View
**Decision: D) Combined**

- Badge bubbles on characteristic nodes (red=OOC, yellow=Due, green=OK)
- Roll-up counts on parent nodes (e.g., "3 OOC" badge)
- Subtle background color coding

**Rationale:** Maximum visibility without requiring drill-down to see status.

### 3. Selection Scope for Reporting
**Decision: D) Combined**

Support all selection modes:
- Single characteristic selection
- Multi-select with checkboxes
- Node selection to include all children

**Rationale:** Flexibility for different reporting use cases.

### 4. Reporting Access Points
**Decision: D) All of the Above**

- Dashboard action button in ChartToolbar
- Dedicated `/reports` page with templates
- Context menu on characteristic(s)

**Rationale:** Multiple access points for different workflows.

### 5. Default View Preference
**Decision: B) Hierarchy Tree**

Default to hierarchy view with status filter as secondary control.

**Rationale:** Hierarchy reflects organizational structure; status filtering enhances rather than replaces it.

### 6. Nelson Rules Acknowledgement Configuration
**Decision: Per-rule "require acknowledgement" checkbox**

- Each Nelson rule has a "require acknowledgement" setting (per characteristic)
- Default value: `true` (all rules require acknowledgement)
- Rules that don't require acknowledgement:
  - Still trigger violations (recorded in database)
  - Still appear in violation history
  - But do NOT increment "unacknowledged" count
  - Display differently on violations page and footer

**UI Treatment for Non-Required Acknowledgement:**
- Need SPC/UI expert consultation for optimal display
- Initial proposal:
  - Violations page: Show in separate "Info" section or with muted styling
  - Footer: Exclude from "Pending Alerts" count, show separate "Informational" count if any

---

## Scope Breakdown

### Wave 1: Nelson Rules Acknowledgement Config
- Add `require_acknowledgement` column to `characteristic_rules` table (default: true)
- Update NelsonRulesConfigPanel with "Require Ack" checkbox per rule
- Update API schemas and endpoints
- Update violation creation logic to set `requires_ack` flag on Violation model

### Wave 2: Violations Display Update
- Add `requires_acknowledgement` to Violation model/response
- Update ViolationsView to visually distinguish non-required ack violations
- Update footer stats to separate "required" vs "informational" counts
- Update violation stats API to return both counts

### Wave 3: Hierarchy-Based TodoList
- Replace flat TodoList with HierarchyTree component
- Add status filter tabs (All/OOC/Due/OK)
- Implement badge bubbles on characteristic nodes
- Implement roll-up status counts on parent nodes
- Add subtle background color coding for status
- Default to hierarchy view

### Wave 4: Multi-Selection Infrastructure
- Add checkbox multi-select to hierarchy tree
- Implement node-level selection (select all children)
- Selection state management for reporting

### Wave 5: Report Templates & Generation
- Canned report templates:
  - Single Characteristic Report (control chart, stats, violations)
  - Capability Report (Cp, Cpk, Pp, Ppk analysis)
  - Violation Summary Report (all OOC across selection)
  - Trend Report (time-series analysis)
- Report preview UI

### Wave 6: Export Functionality
- PDF export (using react-pdf or similar)
- Excel export (using xlsx library)
- CSV export (simple download)
- Export from ChartToolbar, Reports page, and context menu

---

## Files to Modify

### Backend (Wave 1-2)
- `backend/src/openspc/db/models/characteristic.py` → Add `require_acknowledgement` to CharacteristicRule
- `backend/src/openspc/db/models/violation.py` → Add `requires_acknowledgement` field
- `backend/src/openspc/api/schemas/characteristic.py` → Update NelsonRuleConfig schema
- `backend/src/openspc/api/schemas/violation.py` → Add requires_ack to response
- `backend/src/openspc/api/v1/characteristics.py` → Update nelson rules endpoints
- `backend/src/openspc/api/v1/violations.py` → Update stats endpoint
- `backend/src/openspc/core/engine/spc_engine.py` → Set requires_ack on violation creation
- New migration for `require_acknowledgement` column

### Frontend (Wave 1-2)
- `frontend/src/components/NelsonRulesConfigPanel.tsx` → Add "Require Ack" toggle
- `frontend/src/pages/ViolationsView.tsx` → Differentiate non-required ack violations
- `frontend/src/components/Layout.tsx` → Update footer stats display
- `frontend/src/api/hooks.ts` → Update hooks for new fields
- `frontend/src/types/index.ts` → Update types

### Frontend (Wave 3-4)
- `frontend/src/components/TodoList.tsx` → Major refactor to hierarchy-based
- `frontend/src/components/HierarchyTree.tsx` → Add status badges, roll-up, multi-select
- `frontend/src/components/ChartToolbar.tsx` → Add report button

### Frontend (Wave 5-6)
- `frontend/src/pages/ReportsView.tsx` → New page
- `frontend/src/App.tsx` → Add /reports route

---

## Dependencies
- PDF library: `@react-pdf/renderer` or `jspdf`
- Excel library: `xlsx` or `exceljs`
- Possible: `html2canvas` for chart snapshots

---

## Verification Criteria
- [ ] Nelson rules have per-rule "require acknowledgement" checkbox
- [ ] Non-required ack violations display differently on violations page
- [ ] Footer excludes non-required ack from "Pending Alerts" count
- [ ] Hierarchy tree replaces flat list as default
- [ ] Status filter tabs work correctly
- [ ] Badges and roll-up counts display accurately
- [ ] Multi-select works for reporting
- [ ] At least 2 canned reports functional
- [ ] Export to PDF, Excel, CSV all working
- [ ] TypeScript compiles without errors
