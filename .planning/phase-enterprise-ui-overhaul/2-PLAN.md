---
phase: enterprise-ui-overhaul
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/components/Sidebar.tsx
  - frontend/src/components/Header.tsx
  - frontend/src/components/PlantSelector.tsx
autonomous: true
must_haves:
  truths:
    - "Sidebar shows navigation items with icons"
    - "Sidebar can be collapsed to icon-only mode"
    - "Header shows plant selector dropdown"
  artifacts:
    - "frontend/src/components/Sidebar.tsx renders collapsible nav"
    - "frontend/src/components/Header.tsx renders minimal header"
    - "frontend/src/components/PlantSelector.tsx renders dropdown"
  key_links:
    - "Sidebar uses uiStore for state"
    - "PlantSelector uses PlantProvider context"
---

# Phase Enterprise UI Overhaul - Plan 2: Sidebar and Header Components

## Objective
Create the collapsible sidebar and minimal header components as standalone building blocks.

## Tasks

<task type="auto">
  <name>Task 1: Create Collapsible Sidebar Component</name>
  <files>frontend/src/components/Sidebar.tsx</files>
  <action>
    Create vertical collapsible sidebar navigation:
    1. Use lucide-react icons for navigation items
    2. Support three states: expanded (with labels), collapsed (icons only), hidden
    3. Add collapse/expand toggle button at bottom
    4. Show violation badge count on Violations item
    5. Highlight active route using NavLink

    Navigation structure:
    ```
    [Logo/Brand]
    ───────────
    Dashboard (LayoutDashboard icon)
    Data Entry (ClipboardList icon)
    Violations (AlertTriangle icon) [badge]
    Reports (FileText icon)
    ───────────
    Configuration (Settings icon)
    Settings (Sliders icon)
    ───────────
    [Collapse Toggle] (ChevronsLeft/ChevronsRight icon)
    ```

    Props interface:
    ```typescript
    interface SidebarProps {
      className?: string
    }
    ```

    Constraints:
    - Use NavLink from react-router-dom for navigation
    - Use cn() utility for className merging
    - Width: 240px expanded, 60px collapsed
    - Smooth transition animation (150ms)
    - Do NOT connect to uiStore yet (Plan 3 will integrate)
    - Accept sidebarState as prop for now: 'expanded' | 'collapsed'
    - Accept onToggle callback prop
  </action>
  <verify>
    ```bash
    # File exists with expected component
    grep -q "export function Sidebar" frontend/src/components/Sidebar.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - File exists at frontend/src/components/Sidebar.tsx
    - Exports Sidebar component
    - Renders all navigation items with icons
    - Supports expanded/collapsed states via props
    - Shows violation badge count
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Minimal Header Component</name>
  <files>frontend/src/components/Header.tsx</files>
  <action>
    Create minimal header for use with sidebar layout:
    1. Left: Logo and app name
    2. Center: (empty, reserved for breadcrumbs later)
    3. Right: Plant selector slot, theme toggle, user menu placeholder

    Props interface:
    ```typescript
    interface HeaderProps {
      className?: string
      plantSelector?: React.ReactNode  // Slot for PlantSelector
    }
    ```

    Structure:
    ```
    [Activity icon] OpenSPC    |    [Plant Selector]  [Theme]  [User]
    ```

    Constraints:
    - Height: 56px (h-14)
    - Use existing theme toggle logic from Layout.tsx
    - User menu is placeholder button for now
    - Border-bottom for separation
    - Do NOT import PlantSelector directly
  </action>
  <verify>
    ```bash
    # File exists with expected component
    grep -q "export function Header" frontend/src/components/Header.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - File exists at frontend/src/components/Header.tsx
    - Exports Header component
    - Renders logo, theme toggle, user placeholder
    - Accepts plantSelector prop for composition
  </done>
</task>

<task type="auto">
  <name>Task 3: Create Plant Selector Dropdown</name>
  <files>frontend/src/components/PlantSelector.tsx</files>
  <action>
    Create dropdown component for plant selection:
    1. Show current plant name with Building2 icon
    2. Dropdown menu with available plants
    3. Highlight currently selected plant
    4. Trigger plant change via PlantProvider

    Props interface:
    ```typescript
    interface PlantSelectorProps {
      className?: string
    }
    ```

    UI:
    ```
    [Building2 icon] Demo Plant [ChevronDown]
    ─────────────────────────────
    | Demo Plant         [check] |
    | Plant A                    |
    | Plant B                    |
    ─────────────────────────────
    ```

    Constraints:
    - Use usePlant hook from PlantProvider
    - Custom dropdown (no external library)
    - Close dropdown on outside click
    - Close dropdown on Escape key
    - Keyboard navigable (arrow keys)
  </action>
  <verify>
    ```bash
    # File exists with expected component
    grep -q "export function PlantSelector" frontend/src/components/PlantSelector.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - File exists at frontend/src/components/PlantSelector.tsx
    - Exports PlantSelector component
    - Uses usePlant hook for context
    - Renders dropdown with plant options
    - Keyboard accessible
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Atomic commit created
- [ ] Components render correctly in isolation
