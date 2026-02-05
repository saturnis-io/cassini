---
phase: enterprise-ui-overhaul
plan: 3
type: execute
wave: 2
depends_on: [1, 2]
files_modified:
  - frontend/src/components/Layout.tsx
  - frontend/src/App.tsx
autonomous: true
must_haves:
  truths:
    - "User sees vertical sidebar instead of horizontal navbar"
    - "Sidebar state persists across page refreshes"
    - "Plant selector shows in header and persists selection"
  artifacts:
    - "frontend/src/components/Layout.tsx uses Sidebar and Header"
    - "frontend/src/App.tsx wraps with PlantProvider"
  key_links:
    - "Layout.tsx imports Sidebar, Header, PlantSelector"
    - "App.tsx includes PlantProvider in provider hierarchy"
    - "Sidebar connects to uiStore for persistence"
---

# Phase Enterprise UI Overhaul - Plan 3: Layout Integration

## Objective
Integrate the new Sidebar and Header components into the main Layout, replacing the horizontal navbar.

## Tasks

<task type="auto">
  <name>Task 1: Refactor Layout to Sidebar Pattern</name>
  <files>frontend/src/components/Layout.tsx</files>
  <action>
    Replace horizontal navbar with sidebar layout:
    1. Import Sidebar, Header, PlantSelector components
    2. Import and use uiStore for sidebar state
    3. Create new layout structure: sidebar left, content right
    4. Move footer/status bar to bottom of content area

    New layout structure:
    ```
    ┌─────────────────────────────────────────────┐
    │ Header (full width)                         │
    ├──────────┬──────────────────────────────────┤
    │          │                                  │
    │ Sidebar  │  Main Content (Outlet)           │
    │          │                                  │
    │          ├──────────────────────────────────┤
    │          │  Footer/Status Bar               │
    └──────────┴──────────────────────────────────┘
    ```

    Constraints:
    - Preserve existing footer/status bar functionality
    - Preserve WebSocket connection indicator
    - Preserve violation count in footer
    - Sidebar should overlay on mobile (responsive)
    - Main content should have flex-1 to fill space
    - Remove all horizontal nav code
  </action>
  <verify>
    ```bash
    # Sidebar import exists
    grep -q "import.*Sidebar" frontend/src/components/Layout.tsx

    # Old nav removed
    ! grep -q "<nav className=\"flex items-center gap-1\">" frontend/src/components/Layout.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - Layout.tsx refactored to sidebar pattern
    - Sidebar component integrated
    - Header component integrated
    - PlantSelector rendered in Header
    - Footer preserved
    - No horizontal nav remaining
  </done>
</task>

<task type="auto">
  <name>Task 2: Update App.tsx with Providers</name>
  <files>frontend/src/App.tsx</files>
  <action>
    Add PlantProvider to the provider hierarchy:
    1. Import PlantProvider from providers
    2. Wrap BrowserRouter with PlantProvider
    3. Provider order: ThemeProvider > PlantProvider > QueryClient > ChartHover > WebSocket

    Updated hierarchy:
    ```tsx
    <ThemeProvider>
      <PlantProvider>
        <QueryClientProvider>
          <ChartHoverProvider>
            <WebSocketProvider>
              <BrowserRouter>
                ...
              </BrowserRouter>
            </WebSocketProvider>
          </ChartHoverProvider>
        </QueryClientProvider>
      </PlantProvider>
    </ThemeProvider>
    ```

    Constraints:
    - Do NOT change existing route definitions yet
    - Do NOT add AuthProvider yet (Plan 4)
    - Preserve all existing functionality
  </action>
  <verify>
    ```bash
    # PlantProvider import exists
    grep -q "import.*PlantProvider" frontend/src/App.tsx

    # PlantProvider is used
    grep -q "<PlantProvider>" frontend/src/App.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - PlantProvider imported and used in App.tsx
    - Provider hierarchy correct
    - Existing routes unchanged
    - App runs without errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Connect Sidebar to uiStore</name>
  <files>frontend/src/components/Sidebar.tsx</files>
  <action>
    Update Sidebar to use uiStore for persistence:
    1. Import useUIStore
    2. Replace prop-based state with store state
    3. Call store actions on toggle
    4. Remove props that are now from store

    Changes:
    - Remove sidebarState prop
    - Remove onToggle prop
    - Add: const { sidebarState, toggleSidebar } = useUIStore()
    - Keep className prop for external styling

    Constraints:
    - Component should still render correctly
    - Toggle should persist state
    - Hidden state should not render sidebar
  </action>
  <verify>
    ```bash
    # Uses uiStore
    grep -q "useUIStore" frontend/src/components/Sidebar.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - Sidebar uses uiStore for state
    - No prop drilling for state
    - State persists via Zustand
    - Toggle works correctly
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Atomic commit created
- [ ] Application renders with new layout
- [ ] Sidebar state persists on refresh
- [ ] Plant selection persists on refresh
