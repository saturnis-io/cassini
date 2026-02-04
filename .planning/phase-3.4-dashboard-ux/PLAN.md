# Phase 3.4 Execution Plan

## Overview
Enhance the dashboard with time range selection, violation annotations, histogram toggle, and comparison mode.

---

## Wave 1: Time Range Selection

### Task 1.1: Backend - Chart Data with Date Range
**File:** `backend/src/openspc/api/v1/characteristics.py`

Extend the chart-data endpoint to accept date range parameters:
```python
@router.get("/{char_id}/chart-data")
async def get_chart_data(
    char_id: int,
    limit: int | None = Query(50, ge=1, le=1000),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    ...
)
```

- If start_date/end_date provided, filter by timestamp range
- If limit also provided, apply limit after date filtering
- Default behavior unchanged (last 50 points)

### Task 1.2: Frontend - TimeRangeSelector Component
**File:** `frontend/src/components/TimeRangeSelector.tsx`

```typescript
interface TimeRangeOption {
  label: string
  type: 'points' | 'duration' | 'custom'
  value: number | null  // points count or hours
}

const presets: TimeRangeOption[] = [
  { label: 'Last 50', type: 'points', value: 50 },
  { label: 'Last 100', type: 'points', value: 100 },
  { label: 'Last 200', type: 'points', value: 200 },
  { label: 'Last hour', type: 'duration', value: 1 },
  { label: 'Last 8h', type: 'duration', value: 8 },
  { label: 'Last 24h', type: 'duration', value: 24 },
  { label: 'Last 7 days', type: 'duration', value: 168 },
  { label: 'Custom...', type: 'custom', value: null },
]
```

Features:
- Dropdown with preset options
- Custom opens date picker (start/end inputs)
- Stores selection in dashboardStore
- Persists preference to localStorage

### Task 1.3: Frontend - API Client & Hook Updates
**Files:** `frontend/src/api/client.ts`, `frontend/src/api/hooks.ts`

Update characteristicApi.getChartData:
```typescript
getChartData: (id: number, options?: {
  limit?: number
  startDate?: string
  endDate?: string
}) => {
  const params = new URLSearchParams()
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.startDate) params.set('start_date', options.startDate)
  if (options?.endDate) params.set('end_date', options.endDate)
  return fetchApi<ChartData>(`/characteristics/${id}/chart-data?${params}`)
}
```

Update useChartData hook to accept time range from store.

### Task 1.4: Frontend - Dashboard Integration
**File:** `frontend/src/pages/OperatorDashboard.tsx`

- Add TimeRangeSelector to dashboard header area
- Connect to dashboardStore for time range state
- Pass time range to useChartData hook

---

## Wave 2: Violation Annotations

### Task 2.1: Backend - Include Rule Details in Violations
**File:** `backend/src/openspc/api/schemas/characteristic.py`

Ensure ChartDataPoint includes violation rule IDs:
```python
class ChartDataPoint(BaseModel):
    # existing fields...
    violation_ids: list[int] = []
    violation_rules: list[int] = []  # NEW: rule numbers (1-8)
```

Update chart-data endpoint to include rule_id for each violation.

### Task 2.2: Frontend - ViolationLegend Component
**File:** `frontend/src/components/ViolationLegend.tsx`

```typescript
interface ViolationLegendProps {
  violations: { ruleId: number; count: number; sampleIds: number[] }[]
  onRuleClick?: (ruleId: number) => void
}
```

Features:
- Collapsible panel (collapsed by default if no violations)
- Shows only rules that were triggered in current view
- Each rule shows: icon, name, count, help tooltip
- Clicking rule highlights related points on chart

### Task 2.3: Frontend - Chart Violation Markers
**File:** `frontend/src/components/ControlChart.tsx`

Enhance violation point rendering:
- Add small number label (1-8) next to diamond marker
- Use consistent colors per rule (optional)
- Tooltip shows full rule description

### Task 2.4: Frontend - Wire Up Annotations
**File:** `frontend/src/pages/OperatorDashboard.tsx`

- Extract violation rules from chartData
- Pass to ViolationLegend component
- Add legend below chart (above histogram if visible)

---

## Wave 3: Histogram Toggle

### Task 3.1: Frontend - DashboardStore Extension
**File:** `frontend/src/stores/dashboardStore.ts`

Add histogram visibility state:
```typescript
interface DashboardStore {
  // existing...
  showHistogram: boolean
  setShowHistogram: (show: boolean) => void
}
```

Persist to localStorage.

### Task 3.2: Frontend - ChartToolbar Component
**File:** `frontend/src/components/ChartToolbar.tsx`

Toolbar with action buttons:
- Histogram toggle (BarChart3 icon)
- Future: Comparison mode toggle
- Future: Export button

### Task 3.3: Frontend - Conditional Histogram Render
**File:** `frontend/src/pages/OperatorDashboard.tsx`

- Add ChartToolbar above chart area
- Conditionally render DistributionHistogram based on store state
- Smooth collapse/expand animation (optional)

---

## Wave 4: Comparison Mode

### Task 4.1: Frontend - DashboardStore Comparison State
**File:** `frontend/src/stores/dashboardStore.ts`

```typescript
interface DashboardStore {
  // existing...
  comparisonMode: boolean
  secondaryCharacteristicId: number | null
  setComparisonMode: (enabled: boolean) => void
  setSecondaryCharacteristic: (id: number | null) => void
}
```

### Task 4.2: Frontend - ComparisonSelector Component
**File:** `frontend/src/components/ComparisonSelector.tsx`

When comparison mode active:
- Shows secondary characteristic dropdown
- Uses HierarchyCharacteristicSelector pattern
- Clear button to remove secondary

### Task 4.3: Frontend - Split Chart Layout
**File:** `frontend/src/pages/OperatorDashboard.tsx`

When comparisonMode=true:
- Render two ControlChart components stacked
- Each with its own useChartData hook
- Share time range settings
- Labels to distinguish primary/secondary

### Task 4.4: Frontend - Synchronized Time Axis
**File:** `frontend/src/components/ControlChart.tsx`

- Accept optional `syncDomain` prop
- When provided, use shared X-axis domain
- Allows visual alignment of time periods

---

## File Summary

| Wave | File | Action |
|------|------|--------|
| 1 | backend/.../characteristics.py | Add date range params |
| 1 | frontend/src/components/TimeRangeSelector.tsx | NEW |
| 1 | frontend/src/api/client.ts | Update getChartData |
| 1 | frontend/src/api/hooks.ts | Update useChartData |
| 1 | frontend/src/stores/dashboardStore.ts | Add timeRange state |
| 1 | frontend/src/pages/OperatorDashboard.tsx | Integrate selector |
| 2 | backend/.../characteristic.py (schemas) | Add violation_rules |
| 2 | frontend/src/components/ViolationLegend.tsx | NEW |
| 2 | frontend/src/components/ControlChart.tsx | Rule markers |
| 2 | frontend/src/pages/OperatorDashboard.tsx | Wire legend |
| 3 | frontend/src/stores/dashboardStore.ts | showHistogram |
| 3 | frontend/src/components/ChartToolbar.tsx | NEW |
| 3 | frontend/src/pages/OperatorDashboard.tsx | Toggle histogram |
| 4 | frontend/src/stores/dashboardStore.ts | Comparison state |
| 4 | frontend/src/components/ComparisonSelector.tsx | NEW |
| 4 | frontend/src/pages/OperatorDashboard.tsx | Split layout |
| 4 | frontend/src/components/ControlChart.tsx | syncDomain prop |

---

## Verification

### Wave 1 (Time Range)
- [ ] Preset buttons change data displayed
- [ ] Custom date range fetches correct period
- [ ] Preference persists across page reloads
- [ ] Large date ranges don't crash browser

### Wave 2 (Violations)
- [ ] Rule numbers appear on violation points
- [ ] Legend shows only triggered rules
- [ ] Help tooltips work on legend items
- [ ] Empty state when no violations

### Wave 3 (Histogram)
- [ ] Toggle button shows/hides histogram
- [ ] State persists to localStorage
- [ ] Smooth visual transition

### Wave 4 (Comparison)
- [ ] Can select secondary characteristic
- [ ] Two charts render stacked
- [ ] Time range applies to both
- [ ] Can exit comparison mode cleanly
