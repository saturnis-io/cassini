---
phase: enterprise-ui-overhaul
plan: 4
type: execute
wave: 2
depends_on: [1, 3]
files_modified:
  - frontend/src/providers/AuthProvider.tsx
  - frontend/src/components/ProtectedRoute.tsx
  - frontend/src/components/Sidebar.tsx
autonomous: true
must_haves:
  truths:
    - "User role can be changed via dev tools or settings"
    - "Navigation items are hidden based on role"
    - "Routes are protected based on role permissions"
  artifacts:
    - "frontend/src/providers/AuthProvider.tsx provides role context"
    - "frontend/src/components/ProtectedRoute.tsx gates route access"
    - "Sidebar conditionally renders nav items by role"
  key_links:
    - "AuthProvider syncs with uiStore for role persistence"
    - "ProtectedRoute uses roles.ts for permission checks"
    - "Sidebar uses AuthProvider for role-based rendering"
---

# Phase Enterprise UI Overhaul - Plan 4: Role-Based Access Control

## Objective
Implement role-based navigation hiding and route protection using mock authentication.

## Tasks

<task type="auto">
  <name>Task 1: Create Auth Provider</name>
  <files>frontend/src/providers/AuthProvider.tsx</files>
  <action>
    Create React context for authentication state (mock):
    1. Define User interface: { id, name, email, role }
    2. Create AuthContext with user and role management
    3. Sync role with uiStore for persistence
    4. Provide mock user for development

    Interface:
    ```typescript
    interface User {
      id: string
      name: string
      email: string
      role: Role
    }

    interface AuthContextValue {
      user: User | null
      role: Role
      setRole: (role: Role) => void  // For dev/testing
      isAuthenticated: boolean
    }
    ```

    Mock user:
    ```typescript
    {
      id: 'dev-user-1',
      name: 'Dev User',
      email: 'dev@openspc.local',
      role: 'operator'  // Default, changeable
    }
    ```

    Constraints:
    - Follow ThemeProvider and PlantProvider patterns
    - Initialize role from uiStore
    - Update uiStore when role changes
    - Export useAuth hook
  </action>
  <verify>
    ```bash
    # File exists with expected exports
    grep -q "export function AuthProvider" frontend/src/providers/AuthProvider.tsx
    grep -q "export function useAuth" frontend/src/providers/AuthProvider.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - AuthProvider created with mock user
    - Exports useAuth hook
    - Syncs role with uiStore
    - Role persists across sessions
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Protected Route Component</name>
  <files>frontend/src/components/ProtectedRoute.tsx</files>
  <action>
    Create route wrapper for role-based access:
    1. Check user role against required role
    2. Redirect to dashboard if insufficient access
    3. Show access denied message briefly before redirect

    Props interface:
    ```typescript
    interface ProtectedRouteProps {
      children: React.ReactNode
      requiredRole: Role
      redirectTo?: string  // Default: '/dashboard'
    }
    ```

    Behavior:
    - If user has access: render children
    - If user lacks access: show toast, redirect

    Constraints:
    - Use useAuth for current role
    - Use hasAccess from roles.ts
    - Use Navigate from react-router-dom
    - Use toast from sonner for access denied message
  </action>
  <verify>
    ```bash
    # File exists with expected exports
    grep -q "export function ProtectedRoute" frontend/src/components/ProtectedRoute.tsx

    # Uses roles helpers
    grep -q "hasAccess" frontend/src/components/ProtectedRoute.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - ProtectedRoute component created
    - Checks role permissions
    - Redirects on insufficient access
    - Shows toast notification
  </done>
</task>

<task type="auto">
  <name>Task 3: Update Sidebar with Role-Based Rendering</name>
  <files>frontend/src/components/Sidebar.tsx</files>
  <action>
    Add role-based navigation item visibility:
    1. Import useAuth hook
    2. Import canAccessView from roles.ts
    3. Filter navigation items based on user role
    4. Add role selector for development (collapsible section)

    Changes:
    - Define NAV_ITEMS array with path and requiredRole
    - Filter items using canAccessView
    - Add dev-only role switcher at bottom of sidebar

    Dev role switcher (only in development):
    ```
    ───────────
    [Bug icon] Dev Tools
      Role: [dropdown: operator/supervisor/engineer/admin]
    ```

    Constraints:
    - Only show dev tools when import.meta.env.DEV
    - Navigation order preserved
    - Smooth transition when items appear/disappear
  </action>
  <verify>
    ```bash
    # Uses auth context
    grep -q "useAuth" frontend/src/components/Sidebar.tsx

    # Uses role helpers
    grep -q "canAccessView" frontend/src/components/Sidebar.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - Sidebar filters nav items by role
    - Dev role switcher available in dev mode
    - Navigation adapts to role changes
    - No unauthorized routes visible
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Atomic commit created
- [ ] Operator role hides Configuration and Settings
- [ ] Supervisor role hides Settings only
- [ ] Admin role shows all items
- [ ] Role persists on refresh
