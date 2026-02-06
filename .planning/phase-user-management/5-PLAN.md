---
phase: user-management
plan: 5
type: execute
wave: 3
depends_on: [3, 4]
files_modified:
  - frontend/src/pages/UserManagementPage.tsx
  - frontend/src/components/users/UserTable.tsx
  - frontend/src/components/users/UserFormDialog.tsx
  - frontend/src/api/client.ts
  - frontend/src/api/hooks.ts
  - frontend/src/App.tsx
  - frontend/src/components/Sidebar.tsx
  - frontend/src/lib/roles.ts
autonomous: true
must_haves:
  truths:
    - "Admin can navigate to /admin/users from sidebar"
    - "Admin sees a table of all users with username, email, status, and plant roles"
    - "Admin can create a new user with username, password, and plant role assignments"
    - "Admin can edit user details and change plant role assignments"
    - "Admin can deactivate a user"
    - "Non-admin users cannot see or access the user management page"
  artifacts:
    - "frontend/src/pages/UserManagementPage.tsx exists"
    - "frontend/src/components/users/UserTable.tsx exists"
    - "frontend/src/components/users/UserFormDialog.tsx exists"
    - "frontend/src/api/hooks.ts has useUsers, useCreateUser, useUpdateUser hooks"
  key_links:
    - "UserManagementPage calls /api/v1/users endpoints"
    - "Sidebar shows Users link for admin role only"
    - "Route protected with ProtectedRoute requiredRole=admin"
---

# Phase user-management - Plan 5: User Management UI

## Objective
Build the admin-only user management page with user table, create/edit forms, and plant role assignment interface.

## Tasks

<task type="auto">
  <name>Task 1: Add User API Client and React Query Hooks</name>
  <files>frontend/src/api/client.ts, frontend/src/api/hooks.ts</files>
  <action>
    Add to `frontend/src/api/client.ts`:

    1. `userApi` object with methods:
       - `list(params?: { search?: string, active_only?: boolean })` -> GET /users/
       - `get(id: number)` -> GET /users/{id}
       - `create(data: { username, password, email? })` -> POST /users/
       - `update(id: number, data: { username?, email?, password?, is_active? })` -> PATCH /users/{id}
       - `deactivate(id: number)` -> DELETE /users/{id}
       - `assignRole(userId: number, data: { plant_id, role })` -> POST /users/{userId}/roles
       - `removeRole(userId: number, plantId: number)` -> DELETE /users/{userId}/roles/{plantId}

    Add to `frontend/src/api/hooks.ts`:

    1. `useUsers(params?)` - useQuery for user list
    2. `useUser(id)` - useQuery for single user
    3. `useCreateUser()` - useMutation, invalidates users query
    4. `useUpdateUser()` - useMutation, invalidates users query
    5. `useDeactivateUser()` - useMutation, invalidates users query
    6. `useAssignRole()` - useMutation, invalidates users + specific user queries
    7. `useRemoveRole()` - useMutation, invalidates users + specific user queries

    Follow existing hook patterns in hooks.ts (usePlants, etc).

    Constraints:
    - Use @tanstack/react-query patterns already in codebase
    - Query keys: ['users'], ['users', id]
    - Mutations invalidate relevant query keys on success
  </action>
  <verify>
    ```bash
    grep -q "userApi" frontend/src/api/client.ts
    grep -q "useUsers" frontend/src/api/hooks.ts
    grep -q "useCreateUser" frontend/src/api/hooks.ts
    npx tsc --noEmit --project frontend/tsconfig.app.json 2>&1 | head -20
    ```
  </verify>
  <done>
    - userApi client with all CRUD + role operations
    - React Query hooks for users with proper cache invalidation
    - TypeScript types aligned with backend schemas
  </done>
</task>

<task type="auto">
  <name>Task 2: Create User Management Page and Components</name>
  <files>frontend/src/pages/UserManagementPage.tsx, frontend/src/components/users/UserTable.tsx, frontend/src/components/users/UserFormDialog.tsx</files>
  <action>
    Create `frontend/src/components/users/UserTable.tsx`:

    1. Table displaying users with columns:
       - Username
       - Email
       - Status (Active/Inactive badge)
       - Plant Roles (comma-separated: "Plant A: Engineer, Plant B: Operator")
       - Actions (Edit, Deactivate)
    2. Search input at top for filtering by username/email
    3. Toggle for "Show inactive users"
    4. Empty state when no users found
    5. Use existing table styling patterns from the codebase

    Create `frontend/src/components/users/UserFormDialog.tsx`:

    1. Dialog/modal for creating and editing users
    2. Mode: "create" or "edit" (prop-driven)
    3. Fields:
       - Username (text input, required for create, readonly for edit)
       - Email (text input, optional)
       - Password (password input, required for create, optional for edit)
       - Confirm Password (must match password)
       - Is Active toggle (edit mode only)
    4. Plant Role Assignment section:
       - List of plants with role dropdown for each
       - "Add Plant Assignment" button to assign to additional plants
       - Remove assignment button (X) for each
       - Role dropdown: Operator, Supervisor, Engineer, Admin
    5. Save and Cancel buttons
    6. Form validation with error messages
    7. Loading state on submit

    Create `frontend/src/pages/UserManagementPage.tsx`:

    1. Page header: "User Management"
    2. "Create User" button in header (opens UserFormDialog in create mode)
    3. UserTable component
    4. Edit action opens UserFormDialog in edit mode with user data pre-filled
    5. Deactivate action shows confirmation dialog, then calls deactivate
    6. Toast notifications for success/error on all operations
    7. Loading skeleton while data fetches

    Constraints:
    - Follow existing page patterns (see SettingsView.tsx, ConfigurationView.tsx)
    - Use shadcn/ui components if available (Dialog, Table, Input, Button, Select, Badge)
    - Otherwise use plain Tailwind CSS matching existing styles
    - Plant list comes from usePlants hook (already exists)
    - Responsive layout (works on smaller screens)
  </action>
  <verify>
    ```bash
    test -f frontend/src/pages/UserManagementPage.tsx && echo "Page exists"
    test -f frontend/src/components/users/UserTable.tsx && echo "Table exists"
    test -f frontend/src/components/users/UserFormDialog.tsx && echo "Dialog exists"
    grep -q "useUsers" frontend/src/pages/UserManagementPage.tsx
    grep -q "UserTable" frontend/src/pages/UserManagementPage.tsx
    npx tsc --noEmit --project frontend/tsconfig.app.json 2>&1 | head -20
    ```
  </verify>
  <done>
    - User management page with table, search, and filtering
    - Create/edit dialog with plant role assignment
    - Deactivate with confirmation
    - All CRUD operations wired to API
    - Toast notifications for feedback
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Route and Sidebar Navigation</name>
  <files>frontend/src/App.tsx, frontend/src/components/Sidebar.tsx, frontend/src/lib/roles.ts</files>
  <action>
    Update `frontend/src/App.tsx`:

    1. Import UserManagementPage
    2. Add route inside Layout:
       ```tsx
       <Route
         path="admin/users"
         element={
           <ProtectedRoute requiredRole="admin">
             <UserManagementPage />
           </ProtectedRoute>
         }
       />
       ```

    Update `frontend/src/components/Sidebar.tsx`:

    1. Add "Users" navigation item in the admin section:
       - Icon: Users/UserCog icon (from lucide-react)
       - Label: "Users"
       - Path: /admin/users
       - Requires: admin role
    2. Place it near "Settings" in the sidebar navigation
    3. Follow existing sidebar item pattern for role-based visibility

    Update `frontend/src/lib/roles.ts`:

    1. Add to VIEW_PERMISSIONS:
       ```typescript
       '/admin/users': 'admin',
       ```
    2. Add to ACTION_PERMISSIONS:
       ```typescript
       'users:create': 'admin',
       'users:edit': 'admin',
       'users:deactivate': 'admin',
       'users:assign-roles': 'admin',
       ```

    Constraints:
    - Sidebar item only visible to admin role users
    - Route uses ProtectedRoute with requiredRole="admin"
    - Non-admin users attempting direct URL access are redirected
  </action>
  <verify>
    ```bash
    grep -q "admin/users" frontend/src/App.tsx
    grep -q "UserManagementPage" frontend/src/App.tsx
    grep -q "users" frontend/src/components/Sidebar.tsx
    grep -q "admin/users" frontend/src/lib/roles.ts
    npx tsc --noEmit --project frontend/tsconfig.app.json 2>&1 | head -20
    ```
  </verify>
  <done>
    - /admin/users route added with admin protection
    - Sidebar shows Users link for admin users
    - VIEW_PERMISSIONS updated for /admin/users
    - ACTION_PERMISSIONS updated for user management actions
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] Admin can navigate to /admin/users
- [ ] User table shows all users with roles
- [ ] Create user form works with plant role assignment
- [ ] Edit user form works with role modification
- [ ] Deactivate user works with confirmation
- [ ] Non-admin users cannot access the page
- [ ] TypeScript compiles without errors
- [ ] Atomic commit created
