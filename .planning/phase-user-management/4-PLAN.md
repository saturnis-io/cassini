---
phase: user-management
plan: 4
type: execute
wave: 2
depends_on: [1, 2]
files_modified:
  - frontend/src/api/client.ts
  - frontend/src/providers/AuthProvider.tsx
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/components/ProtectedRoute.tsx
  - frontend/src/App.tsx
  - frontend/src/stores/uiStore.ts
  - frontend/src/types/index.ts
autonomous: true
must_haves:
  truths:
    - "User sees a login page at /login with username and password fields"
    - "After successful login, user is redirected to /dashboard"
    - "Unauthenticated users are redirected to /login"
    - "Page refresh silently re-authenticates via refresh token cookie"
    - "All API requests include Authorization: Bearer token header"
    - "401 responses trigger automatic token refresh"
  artifacts:
    - "frontend/src/pages/LoginPage.tsx exists with login form"
    - "frontend/src/providers/AuthProvider.tsx replaced with real auth"
    - "frontend/src/api/client.ts has auth interceptor"
  key_links:
    - "AuthProvider calls /api/v1/auth/refresh on mount to restore session"
    - "AuthProvider calls /api/v1/auth/login on form submit"
    - "fetchApi attaches Bearer token from AuthProvider"
    - "401 errors trigger refresh flow before retrying"
    - "User.role derived from plant_roles + selectedPlantId"
---

# Phase user-management - Plan 4: Frontend Auth Infrastructure

## Objective
Replace the mock authentication with real JWT-based auth, create the login page, add auth interceptor to the API client, and update routing for authentication enforcement.

## Tasks

<task type="auto">
  <name>Task 1: Add Auth Types and Update API Client</name>
  <files>frontend/src/api/client.ts, frontend/src/types/index.ts</files>
  <action>
    Update `frontend/src/types/index.ts` (or wherever types are defined):

    1. Add auth-related types:
       ```typescript
       export interface AuthUser {
         id: number
         username: string
         email: string | null
         is_active: boolean
         plant_roles: PlantRole[]
       }

       export interface PlantRole {
         plant_id: number
         plant_name: string
         plant_code: string
         role: 'operator' | 'supervisor' | 'engineer' | 'admin'
       }

       export interface LoginResponse {
         access_token: string
         token_type: string
         user: AuthUser
       }

       export interface RefreshResponse {
         access_token: string
         token_type: string
       }
       ```

    Update `frontend/src/api/client.ts`:

    1. Add a mutable `accessToken` variable at module scope (not exported):
       ```typescript
       let accessToken: string | null = null
       ```
    2. Add `setAccessToken(token: string | null)` and `getAccessToken()` exported functions
    3. Modify `fetchApi` to:
       - Attach `Authorization: Bearer ${accessToken}` header if token exists
       - Add `credentials: 'include'` to all requests (for cookies)
       - On 401 response: attempt refresh via POST /api/v1/auth/refresh (with credentials: 'include')
         - If refresh succeeds: update accessToken, retry original request once
         - If refresh fails: clear accessToken, redirect to /login (dispatch custom event)
       - Do NOT retry for /auth/login or /auth/refresh endpoints (avoid loops)
    4. Add `authApi` object:
       ```typescript
       export const authApi = {
         login: (username: string, password: string, rememberMe?: boolean) => ...
         refresh: () => ...
         logout: () => ...
         me: () => ...
       }
       ```
       - login POSTs to /auth/login with credentials: 'include'
       - refresh POSTs to /auth/refresh with credentials: 'include'
       - logout POSTs to /auth/logout with credentials: 'include'
       - me GETs /auth/me with Bearer token

    Constraints:
    - Token stored in memory only (module variable), not localStorage
    - Use credentials: 'include' for all fetch calls to send cookies
    - Refresh retry logic must avoid infinite loops (max 1 retry)
    - Dispatch 'auth:logout' custom window event on forced logout so AuthProvider can react
  </action>
  <verify>
    ```bash
    grep -q "accessToken" frontend/src/api/client.ts
    grep -q "credentials.*include" frontend/src/api/client.ts
    grep -q "authApi" frontend/src/api/client.ts
    grep -q "AuthUser" frontend/src/types/index.ts
    npx tsc --noEmit --project frontend/tsconfig.app.json 2>&1 | head -20
    ```
  </verify>
  <done>
    - API client attaches Bearer token to all requests
    - Automatic 401 -> refresh -> retry flow
    - authApi for login, refresh, logout, me
    - Auth types defined
    - credentials: 'include' on all requests
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace Mock AuthProvider with Real Auth</name>
  <files>frontend/src/providers/AuthProvider.tsx, frontend/src/stores/uiStore.ts</files>
  <action>
    Rewrite `frontend/src/providers/AuthProvider.tsx`:

    1. Remove MOCK_USER and all mock logic
    2. New AuthContextValue interface:
       ```typescript
       interface AuthContextValue {
         user: AuthUser | null
         role: Role  // Derived from user's role at selected plant
         isAuthenticated: boolean
         isLoading: boolean  // True during initial auth check
         login: (username: string, password: string, rememberMe?: boolean) => Promise<void>
         logout: () => Promise<void>
       }
       ```
    3. AuthProvider component:
       - On mount: call authApi.refresh() to restore session from cookie
         - If succeeds: set accessToken, call authApi.me() to get user
         - If fails: user remains null (not authenticated)
         - Set isLoading=false after check completes
       - `login` function:
         - Call authApi.login()
         - Set accessToken from response
         - Set user from response
       - `logout` function:
         - Call authApi.logout()
         - Clear accessToken
         - Set user to null
       - Listen for 'auth:logout' window event (from API client forced logout):
         - Clear user and token
       - Derive `role` from user's plant_roles and selected plant:
         - Import usePlantContext (or read selectedPlantId from uiStore directly)
         - Find role for selectedPlantId in user.plant_roles
         - Default to 'operator' if no assignment found for current plant
    4. Continue exporting `useAuth()` hook with same API

    Update `frontend/src/stores/uiStore.ts`:
    - Remove `currentRole` and `setCurrentRole` from the store (role now comes from auth)
    - Remove from persist partialize
    - Keep all other state unchanged

    Constraints:
    - isLoading must be true until initial refresh attempt completes (prevents flash of login page)
    - Role derivation depends on selectedPlantId from uiStore
    - The setRole function is removed (role comes from server now)
    - Keep backward compatibility: useAuth() still returns { user, role, isAuthenticated }
  </action>
  <verify>
    ```bash
    grep -q "isLoading" frontend/src/providers/AuthProvider.tsx
    grep -q "authApi" frontend/src/providers/AuthProvider.tsx
    grep -q "login" frontend/src/providers/AuthProvider.tsx
    grep -q "logout" frontend/src/providers/AuthProvider.tsx
    grep -rL "MOCK_USER" frontend/src/providers/AuthProvider.tsx || echo "Mock removed"
    npx tsc --noEmit --project frontend/tsconfig.app.json 2>&1 | head -20
    ```
  </verify>
  <done>
    - Real AuthProvider with JWT-based authentication
    - Session restoration on mount via refresh token
    - Login and logout functions
    - Role derived from user's plant role assignment
    - Loading state for initial auth check
    - Mock auth completely removed
  </done>
</task>

<task type="auto">
  <name>Task 3: Create Login Page and Update Routing</name>
  <files>frontend/src/pages/LoginPage.tsx, frontend/src/components/ProtectedRoute.tsx, frontend/src/App.tsx</files>
  <action>
    Create `frontend/src/pages/LoginPage.tsx`:

    1. Full-page login form centered on screen
    2. OpenSPC branding at top (app name, subtitle "Statistical Process Control")
    3. Form fields:
       - Username input (text, required)
       - Password input (password, required)
       - "Remember me" checkbox
       - Submit button "Sign In"
    4. Error display for failed login attempts
    5. Loading state on submit button
    6. On successful login: navigate to /dashboard (or previous attempted URL)
    7. If already authenticated: redirect to /dashboard immediately
    8. Use shadcn/ui components if available (Card, Input, Button, Checkbox), otherwise plain Tailwind
    9. Styled to match existing app theme (dark mode support)

    Update `frontend/src/components/ProtectedRoute.tsx`:

    1. Add authentication check in addition to role check:
       - If not authenticated AND not loading: redirect to /login (not /dashboard)
       - If authenticated but insufficient role: redirect to /dashboard (existing behavior)
       - While isLoading: show nothing or a spinner
    2. Save the attempted URL so login can redirect back

    Update `frontend/src/App.tsx`:

    1. Add LoginPage import
    2. Add `/login` route OUTSIDE the Layout wrapper (no sidebar)
    3. Wrap Layout route with authentication check:
       - If not authenticated, redirect to /login
       - Show loading spinner while isLoading
    4. Reorder providers: AuthProvider must wrap PlantProvider now
       - Auth first (need to be authenticated to fetch plants)
       - QueryClientProvider > AuthProvider > PlantProvider > ...
    5. Remove RoleSwitcher component references if they exist in the Sidebar/Layout

    Constraints:
    - Login page must work WITHOUT being wrapped in Layout (no sidebar)
    - Login page must be accessible without authentication
    - /kiosk and /wall-dashboard routes need auth too (wrap them)
    - Keep the Toaster outside all auth checks (always visible)
  </action>
  <verify>
    ```bash
    test -f frontend/src/pages/LoginPage.tsx && echo "LoginPage exists"
    grep -q "/login" frontend/src/App.tsx
    grep -q "LoginPage" frontend/src/App.tsx
    grep -q "isAuthenticated" frontend/src/components/ProtectedRoute.tsx
    grep -q "AuthProvider" frontend/src/App.tsx
    npx tsc --noEmit --project frontend/tsconfig.app.json 2>&1 | head -20
    ```
  </verify>
  <done>
    - Login page with username/password/remember-me form
    - OpenSPC branding on login page
    - Unauthenticated users redirected to /login
    - ProtectedRoute checks auth + role
    - Provider order updated (Auth before Plant)
    - Login page is outside Layout (no sidebar)
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] Login page renders at /login with form
- [ ] Successful login redirects to /dashboard
- [ ] Page refresh restores session from refresh cookie
- [ ] API requests include Bearer token
- [ ] 401 triggers automatic refresh
- [ ] Unauthenticated users redirected to /login
- [ ] Role derived from user's plant assignment
- [ ] TypeScript compiles without errors
- [ ] Atomic commit created
