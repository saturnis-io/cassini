---
phase: enterprise-ui-overhaul
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/stores/uiStore.ts
  - frontend/src/lib/roles.ts
  - frontend/src/providers/PlantProvider.tsx
autonomous: true
must_haves:
  truths:
    - "User's plant selection persists across sessions"
    - "Role definitions are available throughout the app"
  artifacts:
    - "frontend/src/stores/uiStore.ts exists with sidebar state"
    - "frontend/src/lib/roles.ts exports ROLES and permission helpers"
    - "frontend/src/providers/PlantProvider.tsx provides plant context"
  key_links:
    - "uiStore integrates with Zustand persist middleware"
    - "PlantProvider wraps App component"
---

# Phase Enterprise UI Overhaul - Plan 1: Core Infrastructure

## Objective
Create foundational stores, types, and providers for plant context and role-based access.

## Tasks

<task type="auto">
  <name>Task 1: Create UI Store with Sidebar State</name>
  <files>frontend/src/stores/uiStore.ts</files>
  <action>
    Create Zustand store for UI state:
    1. Define SidebarState: 'expanded' | 'collapsed' | 'hidden'
    2. Add plant selection state: selectedPlantId, availablePlants
    3. Add mock user role state: currentRole
    4. Use persist middleware for sidebar and plant state

    Interface:
    ```typescript
    interface UIState {
      // Sidebar
      sidebarState: 'expanded' | 'collapsed' | 'hidden'
      setSidebarState: (state: SidebarState) => void
      toggleSidebar: () => void

      // Plant context
      selectedPlantId: string | null
      setSelectedPlantId: (id: string) => void

      // Role (mock)
      currentRole: Role
      setCurrentRole: (role: Role) => void
    }
    ```

    Constraints:
    - Follow existing store pattern from dashboardStore.ts
    - Use 'openspc-ui' as storage key
    - Default sidebar to 'expanded'
    - Default role to 'operator'
  </action>
  <verify>
    ```bash
    # File exists with expected exports
    grep -q "export const useUIStore" frontend/src/stores/uiStore.ts

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - File exists at frontend/src/stores/uiStore.ts
    - Exports useUIStore hook
    - Includes sidebar, plant, and role state
    - Uses persist middleware
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Role Definitions and Permissions</name>
  <files>frontend/src/lib/roles.ts</files>
  <action>
    Create role system with permissions:
    1. Define Role type: 'operator' | 'supervisor' | 'engineer' | 'admin'
    2. Define ROLE_HIERARCHY with numeric levels
    3. Define VIEW_PERMISSIONS mapping roles to allowed routes
    4. Create helper functions: hasAccess, canAccessView

    Structure:
    ```typescript
    export type Role = 'operator' | 'supervisor' | 'engineer' | 'admin'

    export const ROLE_HIERARCHY: Record<Role, number>
    export const VIEW_PERMISSIONS: Record<string, Role>

    export function hasAccess(userRole: Role, requiredRole: Role): boolean
    export function canAccessView(userRole: Role, viewPath: string): boolean
    ```

    View permissions per CONTEXT.md:
    - /dashboard: operator
    - /data-entry: operator
    - /violations: operator (view), supervisor (ack)
    - /reports: supervisor
    - /configuration: engineer
    - /settings: admin

    Constraints:
    - Pure functions, no side effects
    - Comprehensive JSDoc comments
  </action>
  <verify>
    ```bash
    # File exists with expected exports
    grep -q "export type Role" frontend/src/lib/roles.ts
    grep -q "export function hasAccess" frontend/src/lib/roles.ts

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - File exists at frontend/src/lib/roles.ts
    - Exports Role type, ROLE_HIERARCHY, VIEW_PERMISSIONS
    - Exports hasAccess and canAccessView helpers
    - Follows role matrix from CONTEXT.md
  </done>
</task>

<task type="auto">
  <name>Task 3: Create Plant Provider</name>
  <files>frontend/src/providers/PlantProvider.tsx</files>
  <action>
    Create React context provider for plant selection:
    1. Define Plant interface: { id: string, name: string, code: string }
    2. Create PlantContext with current plant and setter
    3. Mock plant list: Demo Plant, Plant A, Plant B
    4. Sync with uiStore for persistence

    Interface:
    ```typescript
    interface Plant {
      id: string
      name: string
      code: string
    }

    interface PlantContextValue {
      plants: Plant[]
      selectedPlant: Plant | null
      setSelectedPlant: (plant: Plant) => void
    }
    ```

    Constraints:
    - Follow ThemeProvider pattern
    - Initialize from uiStore on mount
    - Update uiStore on plant change
    - Export usePlant hook
  </action>
  <verify>
    ```bash
    # File exists with expected exports
    grep -q "export function PlantProvider" frontend/src/providers/PlantProvider.tsx
    grep -q "export function usePlant" frontend/src/providers/PlantProvider.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - File exists at frontend/src/providers/PlantProvider.tsx
    - Exports PlantProvider component
    - Exports usePlant hook
    - Syncs with uiStore for persistence
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Atomic commit created
- [ ] No TypeScript errors
