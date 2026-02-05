---
phase: enterprise-ui-overhaul
plan: 5
type: execute
wave: 3
depends_on: [3]
files_modified:
  - frontend/src/pages/KioskView.tsx
  - frontend/src/components/KioskLayout.tsx
  - frontend/src/App.tsx
autonomous: true
must_haves:
  truths:
    - "User can access full-screen kiosk mode at /kiosk"
    - "Kiosk auto-rotates through characteristics"
    - "Kiosk shows large, readable charts optimized for distance"
  artifacts:
    - "frontend/src/pages/KioskView.tsx renders kiosk display"
    - "frontend/src/components/KioskLayout.tsx provides chrome-free layout"
    - "Route /kiosk added to App.tsx"
  key_links:
    - "KioskView uses WebSocket for real-time data"
    - "KioskLayout has no sidebar or header"
    - "Route is outside main Layout wrapper"
---

# Phase Enterprise UI Overhaul - Plan 5: Kiosk Display Mode

## Objective
Create a full-screen, auto-rotating display mode optimized for factory floor monitors.

## Tasks

<task type="auto">
  <name>Task 1: Create Kiosk Layout Component</name>
  <files>frontend/src/components/KioskLayout.tsx</files>
  <action>
    Create minimal chrome-free layout wrapper for display modes:
    1. Full viewport height/width
    2. No sidebar, no header
    3. Minimal status bar with connection indicator only
    4. Dark background for better contrast
    5. Larger base font size (1.25rem)

    Props interface:
    ```typescript
    interface KioskLayoutProps {
      children: React.ReactNode
      showStatusBar?: boolean  // Default: true
    }
    ```

    Structure:
    ```
    ┌────────────────────────────────────────────┐
    │                                            │
    │                                            │
    │              Main Content                  │
    │           (children slot)                  │
    │                                            │
    │                                            │
    ├────────────────────────────────────────────┤
    │ [Wifi icon] Connected    OpenSPC Kiosk     │
    └────────────────────────────────────────────┘
    ```

    Constraints:
    - Force dark mode in kiosk layout
    - Use larger text: text-lg base, text-2xl headings
    - High contrast colors
    - No scrollbars (overflow-hidden)
  </action>
  <verify>
    ```bash
    # File exists with expected exports
    grep -q "export function KioskLayout" frontend/src/components/KioskLayout.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - KioskLayout created with minimal chrome
    - Full viewport dimensions
    - Large font sizing
    - Optional status bar
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Kiosk View Page</name>
  <files>frontend/src/pages/KioskView.tsx</files>
  <action>
    Create auto-rotating characteristic display:
    1. Parse URL params: plant, chars (comma-separated IDs), interval (seconds)
    2. Fetch characteristics based on params or show all
    3. Auto-rotate through characteristics at interval
    4. Display large X-bar chart with control limits
    5. Show characteristic name, current value, status prominently

    URL params:
    ```
    /kiosk?plant=demo&chars=1,2,3&interval=30
    ```

    Display layout:
    ```
    ┌────────────────────────────────────────────────┐
    │  [StatusIndicator]        Characteristic Name  │
    │                                                │
    │  ┌──────────────────────────────────────────┐  │
    │  │                                          │  │
    │  │         Large Control Chart              │  │
    │  │                                          │  │
    │  └──────────────────────────────────────────┘  │
    │                                                │
    │  Current: 45.2    UCL: 48.0    LCL: 42.0      │
    │                                                │
    │  ● ● ● ○ ○  (pagination dots)                 │
    └────────────────────────────────────────────────┘
    ```

    Constraints:
    - Use existing chart components with size overrides
    - Default interval: 15 seconds
    - Show pagination dots for multi-characteristic
    - Keyboard controls: left/right arrows, space to pause
    - Status indicator: green/yellow/red based on control status
  </action>
  <verify>
    ```bash
    # File exists with expected exports
    grep -q "export function KioskView" frontend/src/pages/KioskView.tsx

    # Uses URL params
    grep -q "useSearchParams" frontend/src/pages/KioskView.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - KioskView created with auto-rotation
    - URL params for configuration
    - Large, readable display
    - Keyboard navigation
    - Status indicators
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Kiosk Route to App</name>
  <files>frontend/src/App.tsx</files>
  <action>
    Add kiosk route outside main Layout:
    1. Import KioskView and KioskLayout
    2. Add route at /kiosk with KioskLayout wrapper
    3. Route should NOT use main Layout (no sidebar)

    Updated routes structure:
    ```tsx
    <Routes>
      {/* Main app with sidebar layout */}
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<OperatorDashboard />} />
        {/* ... other routes ... */}
      </Route>

      {/* Kiosk mode - no layout chrome */}
      <Route
        path="/kiosk"
        element={
          <KioskLayout>
            <KioskView />
          </KioskLayout>
        }
      />
    </Routes>
    ```

    Constraints:
    - Kiosk route must be sibling to Layout route
    - WebSocket context must still be available
    - Query client must still be available
  </action>
  <verify>
    ```bash
    # KioskView import exists
    grep -q "import.*KioskView" frontend/src/App.tsx

    # Route exists
    grep -q "/kiosk" frontend/src/App.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - Kiosk route added to App.tsx
    - Route uses KioskLayout wrapper
    - Route is outside main Layout
    - Providers still wrap kiosk route
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Atomic commit created
- [ ] /kiosk route accessible
- [ ] Auto-rotation works
- [ ] Keyboard controls work
- [ ] Display is large and readable
