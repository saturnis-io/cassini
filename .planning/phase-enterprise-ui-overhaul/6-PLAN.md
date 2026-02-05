---
phase: enterprise-ui-overhaul
plan: 6
type: execute
wave: 3
depends_on: [3]
files_modified:
  - frontend/src/pages/WallDashboard.tsx
  - frontend/src/components/WallChartCard.tsx
  - frontend/src/App.tsx
autonomous: true
must_haves:
  truths:
    - "User can access wall dashboard at /wall-dashboard"
    - "Multiple charts display in a configurable grid"
    - "User can click a chart to expand it"
  artifacts:
    - "frontend/src/pages/WallDashboard.tsx renders multi-chart grid"
    - "frontend/src/components/WallChartCard.tsx renders individual chart card"
    - "Route /wall-dashboard added to App.tsx"
  key_links:
    - "WallDashboard uses WebSocket for all charts"
    - "WallChartCard uses existing chart components"
    - "Layout configuration stored in localStorage"
---

# Phase Enterprise UI Overhaul - Plan 6: Wall Dashboard Display

## Objective
Create a multi-chart grid display mode for large monitors showing multiple characteristics simultaneously.

## Tasks

<task type="auto">
  <name>Task 1: Create Wall Chart Card Component</name>
  <files>frontend/src/components/WallChartCard.tsx</files>
  <action>
    Create compact chart card for grid display:
    1. Show characteristic name header
    2. Compact control chart (no toolbar)
    3. Current value and status indicator
    4. Click-to-expand functionality
    5. Violation indicator badge

    Props interface:
    ```typescript
    interface WallChartCardProps {
      characteristicId: number
      onExpand: (id: number) => void
      className?: string
    }
    ```

    Layout:
    ```
    ┌──────────────────────────────┐
    │ Diameter [●]        [expand] │
    ├──────────────────────────────┤
    │                              │
    │      Compact Chart           │
    │                              │
    ├──────────────────────────────┤
    │ 45.2 mm   UCL: 48  LCL: 42   │
    └──────────────────────────────┘
    ```

    Constraints:
    - Use existing ControlChart with reduced height
    - Minimal chrome - no histogram, no toolbar
    - Status dot: green (in control), yellow (warning), red (violation)
    - Card aspect ratio ~4:3 for grid layout
    - Responsive within grid cell
  </action>
  <verify>
    ```bash
    # File exists with expected exports
    grep -q "export function WallChartCard" frontend/src/components/WallChartCard.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - WallChartCard created with compact chart display
    - Shows status indicator
    - Click-to-expand callback
    - Responsive within grid cell
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Wall Dashboard Page</name>
  <files>frontend/src/pages/WallDashboard.tsx</files>
  <action>
    Create multi-chart grid display:
    1. Fetch all characteristics or filter by URL params
    2. Display in CSS Grid: 2x2, 3x3, or 4x4 based on count/config
    3. Expanded chart modal when card clicked
    4. Configuration bar at top for grid size
    5. Save/load layout presets to localStorage

    URL params:
    ```
    /wall-dashboard?plant=demo&chars=1,2,3,4&grid=2x2
    ```

    Layout:
    ```
    ┌─────────────────────────────────────────────────┐
    │ Wall Dashboard    Grid: [2x2 ▼]   [Save] [Load] │
    ├──────────┬──────────┬──────────┬────────────────┤
    │          │          │          │                │
    │  Chart1  │  Chart2  │  Chart3  │    Chart4      │
    │          │          │          │                │
    ├──────────┼──────────┼──────────┼────────────────┤
    │          │          │          │                │
    │  Chart5  │  Chart6  │  Chart7  │    Chart8      │
    │          │          │          │                │
    └──────────┴──────────┴──────────┴────────────────┘
    ```

    Grid options: 2x2, 3x3, 4x4, 2x3, 3x2

    Constraints:
    - Use KioskLayout wrapper (no sidebar)
    - Grid gaps: 1rem
    - Expanded modal should show full chart with toolbar
    - Auto-subscribe to WebSocket for all visible characteristics
    - Handle 4K resolution (larger fonts on large screens)
  </action>
  <verify>
    ```bash
    # File exists with expected exports
    grep -q "export function WallDashboard" frontend/src/pages/WallDashboard.tsx

    # Uses CSS Grid
    grep -q "grid" frontend/src/pages/WallDashboard.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - WallDashboard created with grid layout
    - Configurable grid size
    - Expanded chart modal
    - Save/load presets
    - URL param configuration
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Wall Dashboard Route to App</name>
  <files>frontend/src/App.tsx</files>
  <action>
    Add wall-dashboard route alongside kiosk:
    1. Import WallDashboard
    2. Add route at /wall-dashboard with KioskLayout wrapper
    3. Route should NOT use main Layout (no sidebar)

    Updated routes:
    ```tsx
    <Routes>
      {/* Main app with sidebar layout */}
      <Route path="/" element={<Layout />}>
        {/* ... existing routes ... */}
      </Route>

      {/* Display modes - no layout chrome */}
      <Route
        path="/kiosk"
        element={
          <KioskLayout>
            <KioskView />
          </KioskLayout>
        }
      />
      <Route
        path="/wall-dashboard"
        element={
          <KioskLayout showStatusBar={false}>
            <WallDashboard />
          </KioskLayout>
        }
      />
    </Routes>
    ```

    Constraints:
    - Use KioskLayout with showStatusBar={false}
    - WebSocket context must be available
    - Keep route order consistent
  </action>
  <verify>
    ```bash
    # WallDashboard import exists
    grep -q "import.*WallDashboard" frontend/src/App.tsx

    # Route exists
    grep -q "/wall-dashboard" frontend/src/App.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - Wall dashboard route added to App.tsx
    - Route uses KioskLayout wrapper
    - Route is sibling to kiosk route
    - All providers available
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Atomic commit created
- [ ] /wall-dashboard route accessible
- [ ] Multiple charts display in grid
- [ ] Click-to-expand works
- [ ] Grid size configurable
