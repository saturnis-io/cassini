# Phase 3.4: Enhanced Dashboard & Hierarchy UX

## Current State Analysis

### Dashboard Architecture
- **OperatorDashboard.tsx** - Main container with two-pane layout
  - Left sidebar (TodoList) - sorted by status (OOC → Due → OK)
  - Right panel - ControlChart + DistributionHistogram (fixed height)
- **State**: Zustand stores (dashboardStore, configStore)
- **Data**: React Query with 30-second polling + WebSocket real-time

### ControlChart Implementation
- Recharts ComposedChart with extensive customization
- Violations: Diamond shapes with glow effect
- Undersized samples: Triangle shapes with dashed borders
- Zone boundaries with gradient fills
- Fixed Y-axis modes based on subgroup_mode
- **Current limit**: 50 data points (no time range selection)

### Hierarchy Selection
- HierarchyCharacteristicSelector exists with tree view
- Lazy-loads characteristics per node
- Shows in-control status, subgroup sizes
- Provider filtering (MANUAL/TAG)

### Violation Display
- Diamond markers with glow filter
- OOC zones with striped pattern fill
- TodoList shows unacknowledged count badge
- No annotation of **which Nelson rule** was violated

---

## Phase 3.4 Scope

### 1. Time Range Selection with Presets
**Goal**: Allow users to view historical data beyond the last 50 points

**Options**:
- A) **Point-based**: "Last 50", "Last 100", "Last 200", "All"
- B) **Time-based**: "Last hour", "Last shift", "Last 24h", "Last week", custom date picker
- C) **Hybrid**: Point presets + custom date range option

**Considerations**:
- Backend already supports date ranges in sample API
- Chart performance with large datasets (>500 points)
- Memory usage with "All" option

### 2. Nelson Rule Violation Annotations
**Goal**: Show which specific rule was violated at each point

**Options**:
- A) **Tooltip enhancement**: Show rule number and name in hover tooltip
- B) **Highlighted regions**: Shade the span of consecutive samples that triggered the rule
- C) **Legend annotations**: Numbered markers on violations referencing legend below chart
- D) **Combined**: Tooltip + region highlighting for multi-point rules (rules 2-8)

**Considerations**:
- Rules 1 (beyond 3σ) - single point
- Rules 2-8 involve patterns across multiple points
- Need to visualize the "window" of points that triggered the rule

### 3. Comparison Mode (Side-by-Side Charts)
**Goal**: Compare two or more characteristics simultaneously

**Options**:
- A) **Split view**: Two charts stacked vertically
- B) **Overlay**: Single chart with multiple data series (different colors)
- C) **Synchronized pan/zoom**: Side-by-side with linked time axes
- D) **Flexible grid**: 2x2 or customizable layout

**Considerations**:
- Different characteristics may have different scales
- Overlay only works for same-unit characteristics
- Synchronized time axis is valuable for root cause analysis

### 4. Integrated Histogram
**Goal**: Show distribution alongside control chart

**Current**: DistributionHistogram is separate, fixed height below chart

**Options**:
- A) **Rotated histogram**: Vertical histogram aligned with Y-axis (right side of chart)
- B) **Collapsible panel**: Toggle histogram visibility
- C) **Mini histogram**: Small inline preview, expandable on click
- D) **Combined view**: Histogram shares Y-axis scale with control chart

**Considerations**:
- Rotated histogram provides direct visual correlation
- Screen real estate constraints
- Print/export considerations

### 5. Hierarchy Tree View Improvements
**Goal**: Better navigation in large hierarchies

**Options**:
- A) **Breadcrumb navigation**: Show path to current selection
- B) **Search/filter**: Quick filter by name
- C) **Favorites**: Star frequently used characteristics
- D) **Recent selections**: Quick access to recently viewed

**Considerations**:
- Current HierarchyCharacteristicSelector is functional
- May need keyboard navigation support
- Mobile responsiveness

---

## Technical Patterns to Follow

### State Management
- Zustand for UI state (selections, panel states)
- React Query for server data
- LocalStorage for preferences (like time range presets)

### API Extensions Needed
```typescript
// Chart data with date range
GET /api/v1/characteristics/{id}/chart-data?start_date=...&end_date=...&limit=...

// Violation annotations need rule details
// Already available in ChartData.data_points[].violation_ids
// May need: GET /api/v1/violations/{id} for rule details
```

### Component Structure
```
OperatorDashboard
├── DashboardHeader (new)
│   ├── TimeRangeSelector
│   └── ComparisonToggle
├── Left Sidebar
│   └── TodoList (existing)
└── Right Panel
    ├── ChartToolbar (new - comparison, export)
    ├── ChartContainer (grid layout for comparison)
    │   ├── ControlChart (enhanced with annotations)
    │   └── RotatedHistogram (optional)
    └── ViolationLegend (new - rule explanations)
```

---

## Dependencies
- Recharts (existing) - chart library
- date-fns or dayjs - date manipulation
- Zustand (existing) - state management

---

## Questions for Discussion

1. **Time Range**: Point-based, time-based, or hybrid?
2. **Violation Annotations**: How to visualize multi-point rule patterns?
3. **Comparison Mode**: How many characteristics to compare (2? 4? unlimited)?
4. **Histogram Position**: Rotated (right side) or keep below?
5. **Priority Order**: Which features are most valuable first?

---

## Proposed Priority Order

1. **Time Range Selection** - Most impactful for daily use
2. **Violation Annotations** - Directly aids troubleshooting
3. **Rotated Histogram** - Visual enhancement, moderate effort
4. **Comparison Mode** - Advanced feature, higher complexity
5. **Tree Improvements** - Polish, lower priority
