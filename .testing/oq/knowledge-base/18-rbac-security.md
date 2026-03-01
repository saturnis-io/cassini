# Feature: RBAC & Security

## Category: RBAC
## Config Reference: `{ prefix: "RBAC", name: "RBAC & Security", kb: "18-rbac-security.md" }`

---

## What It Does

Role-Based Access Control (RBAC) is the authorization layer that governs what each user can see and do throughout the Cassini application. Combined with plant scoping, it provides fine-grained, context-dependent access control: a user can have different roles at different plants, and their available features change accordingly when they switch plants.

Security features extend beyond RBAC to include JWT token management (short-lived access tokens with httpOnly refresh cookies), password policies (complexity, expiry, lockout, history), API key authentication for programmatic access, OIDC/SSO integration for enterprise identity providers, and comprehensive audit logging of all mutations.

From a compliance perspective:

- **21 CFR Part 11** (FDA) -- Requires system controls that limit access to authorized individuals. Electronic signature controls must ensure the signer is who they claim to be (authentication) and has the authority to sign (authorization). RBAC enforces both.
- **ISO 9001:2015 Section 7.5** -- Documented information must have controlled access. Role-based permissions ensure that only authorized personnel can modify quality records, configuration, and process parameters.
- **IATF 16949** -- Requires defined responsibilities and authorities for quality management. The four-tier role hierarchy maps directly to typical automotive quality org structures: operators run the process, supervisors oversee, engineers configure, administrators manage the system.
- **AS9100/AS9102** -- Separation of duties is critical for first article inspection. Cassini enforces that the FAI submitter cannot be the sole approver through workflow step configuration and role checks.
- **SOC 2** -- Access controls are a Trust Services Criteria requirement. RBAC, audit logging, and password policies support SOC 2 Type II compliance.

---

## Where To Find It

| Function | Location | Min Role | Description |
|---|---|---|---|
| Login | `/login` | None | Username/password authentication |
| User management | `/admin/users` | Admin | Create, edit, deactivate users; assign roles per plant |
| Role assignment | `/admin/users` > Edit User | Admin | Set role for user at each plant |
| Plant switcher | Header bar (plant dropdown) | Operator | Switch active plant context (role changes accordingly) |
| Sidebar navigation | Left sidebar | Varies | Items are filtered by current role -- invisible items indicate insufficient privilege |
| Protected routes | All app routes | Varies | `ProtectedRoute` component enforces role checks with redirect and toast |
| Password policy | `/settings/signatures` > Password Policy | Admin | Configure complexity, expiry, lockout, history |
| API keys | `/settings/api-keys` | Engineer | Create and manage API keys for programmatic access |
| SSO/OIDC | `/settings/sso` | Admin | Configure OIDC identity provider for SSO login |
| Audit log | `/settings/audit-log` | Admin | View all system mutations (who did what when) |

---

## Key Concepts (Six Sigma Context)

### The Four-Tier Role Hierarchy

Cassini implements a strict hierarchical role model where each level inherits all permissions of the levels below it:

```
Admin (Level 4) -- Full system access
  |
  Engineer (Level 3) -- Configuration + technical features
    |
    Supervisor (Level 2) -- Reports + violation management
      |
      Operator (Level 1) -- Dashboard, data entry, violations (view only)
```

#### Operator (Level 1) -- The Process Worker

| Permission | Description |
|---|---|
| `/dashboard` | View control charts and capability data |
| `/data-entry` | Submit measurements (manual data entry) |
| `/violations` | View violations (cannot acknowledge or resolve) |
| `/kiosk` | Use kiosk display mode |
| `/wall-dashboard` | Use wall dashboard display mode |
| `/settings/account` | Change own password, update profile |
| `/settings/appearance` | Change personal theme preferences |
| `/settings/notifications` | Configure personal notification preferences |

The operator role represents the shop floor worker who enters measurements and monitors the process. They cannot change configuration, acknowledge violations, or access any engineering or admin features.

#### Supervisor (Level 2) -- The Line Leader

Includes all operator permissions, plus:

| Permission | Description |
|---|---|
| `/reports` | View and generate reports |
| Violations: acknowledge | Mark violations as acknowledged |
| Violations: resolve | Mark violations as resolved |
| Samples: edit/exclude | Edit or exclude submitted samples |

The supervisor role represents the production lead or shift supervisor who oversees operators and manages day-to-day quality issues.

#### Engineer (Level 3) -- The Quality Professional

Includes all supervisor permissions, plus:

| Permission | Description |
|---|---|
| `/configuration` | Full characteristic configuration (create, edit, delete, limits, rules) |
| `/connectivity` | Connectivity Hub (MQTT brokers, OPC-UA servers, gage bridges, ERP integrations) |
| `/msa` | Gage R&R / Measurement System Analysis studies |
| `/fai` | First Article Inspection reports |
| `/analytics` | AI/ML anomaly detection and advanced analytics |
| `/doe` | Design of Experiments |
| `/settings/api-keys` | Create and manage API keys |
| `/settings/retention` | Configure data retention policies |
| `/settings/database` | Database configuration and management |
| `/settings/signatures` | Signature workflow configuration |
| `/settings/reports` | Scheduled report configuration |

The engineer role represents the quality engineer or SPC analyst who configures the system, designs studies, and manages technical settings.

#### Admin (Level 4) -- The System Administrator

Includes all engineer permissions, plus:

| Permission | Description |
|---|---|
| `/admin/users` | User management (create, edit, deactivate, role assignment) |
| `/settings/branding` | Application branding (logo, name, colors) |
| `/settings/sites` | Plant/site management (create, edit, delete plants) |
| `/settings/localization` | Localization settings (language, date format, number format) |
| `/settings/email-webhooks` | Email/SMTP and webhook configuration |
| `/settings/sso` | OIDC/SSO identity provider configuration |
| `/settings/audit-log` | Audit log viewer and export |
| `/settings/ai` | AI/ML configuration (model settings, anomaly thresholds) |
| `/dev-tools` | Developer tools (sandbox mode, only when active) |
| Purge trigger | Manual data purge (via retention settings) |

The admin role represents the IT administrator or quality director who manages the system itself.

### Plant-Scoped Roles

A critical feature of Cassini's RBAC is that roles are **per-plant**. A single user can have different roles at different plants:

| User | Plant A | Plant B | Plant C |
|---|---|---|---|
| Alice | Admin | -- | Operator |
| Bob | Engineer | Engineer | -- |
| Carol | Operator | Supervisor | Engineer |

When a user switches plants via the header plant switcher:
- Their effective role changes to the role assigned at that plant
- The sidebar navigation updates to show/hide items based on the new role
- API requests are scoped to the new plant
- Protected routes re-evaluate access

If a user has no role at a plant, they cannot access that plant at all.

**Admin bootstrap**: Admin users are automatically assigned admin role at all plants. When a new plant is created, all existing admin users are automatically granted admin role at the new plant.

### Frontend Enforcement

#### ProtectedRoute Component

The `ProtectedRoute` component wraps routes that require a minimum role:

```tsx
<ProtectedRoute requiredRole="engineer">
  <ConfigurationView />
</ProtectedRoute>
```

Behavior:
1. If not authenticated: redirect to `/login` with return URL
2. If authenticated but insufficient role: redirect to `/dashboard` with a toast notification: "This page requires [Role] or higher privileges."
3. If authenticated with sufficient role: render the child component

#### Sidebar Filtering

The sidebar defines navigation items with `requiredRole` properties. Items are filtered based on the current user's role using `canAccessView()`:

- **Main nav** (all roles): Dashboard, Data Entry, Violations
- **Reports** (supervisor+): Reports
- **Studies** (engineer+): MSA, FAI, DOE
- **System** (engineer+): Analytics, Connectivity, Configuration, Settings
- **Admin** (admin only): Users

Note: The Settings route (`/settings`) appears in the sidebar with an `engineer` required role in the navigation definition, but the route itself is accessible to operators (for personal sub-tabs like Account, Appearance, Notifications). This means operators can access `/settings/account` via direct URL but will not see the Settings link in the sidebar.

#### hasAccess Function

The core role comparison function:

```typescript
function hasAccess(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}
```

This implements the hierarchical model: `hasAccess('engineer', 'operator')` returns `true` because engineer (3) >= operator (1).

### Backend Enforcement

#### check_plant_role Dependency

The `check_plant_role()` FastAPI dependency verifies the user's role at a specific plant:

```python
check_plant_role(user, plant_id, "engineer")  # Raises 403 if insufficient
```

This is used on every plant-scoped endpoint to ensure the authenticated user has the required role at the requested plant.

#### Auth Dependencies

| Dependency | Description |
|---|---|
| `get_current_user` | Any authenticated user (operator+) |
| `get_current_admin` | Admin role required (returns 403 otherwise) |
| `get_current_engineer` | Engineer+ role required |

### Security Features

#### JWT Token Management

| Token | Lifetime | Storage | Scope |
|---|---|---|---|
| Access token | 15 minutes | In-memory (JavaScript variable) | Authorization header (`Bearer`) |
| Refresh token | 7 days | httpOnly cookie, path `/api/v1/auth` | Automatic refresh on 401 |

The refresh token is scoped to the auth API path only -- it is not sent with regular API requests. When an access token expires (401 response), the frontend's `fetchApi` client automatically:
1. Queues concurrent requests
2. Sends the refresh token to get a new access token
3. Replays all queued requests with the new token
4. Uses a shared promise (not a boolean flag) to prevent race conditions

#### Password Policies

Configured per plant via `/settings/signatures` > Password Policy:

| Policy | Description | Default |
|---|---|---|
| Min length | Minimum password character count (4-128) | 8 |
| Require uppercase | At least one uppercase letter | false |
| Require lowercase | At least one lowercase letter | false |
| Require digit | At least one number | false |
| Require special | At least one special character | false |
| Password expiry | Days before forced change (0 = never) | 0 |
| Max failed attempts | Consecutive failures before lockout | 5 |
| Lockout duration | Minutes the account is locked | 30 |
| Password history | Previous passwords that cannot be reused | 0 |

When `must_change_password` is true on the user account (due to password expiry or admin force), the user is redirected to `/change-password` before they can access any other route.

#### API Key Authentication

Engineers can create API keys for programmatic access (CI/CD, scripts, bridge agents):
- Keys are generated with a SHA-256 hash stored server-side
- The plaintext key is shown exactly once at creation time
- API keys are rate-limited and scoped to a specific plant
- Gage bridge agents use API keys for authentication

#### OIDC/SSO Integration

Admins can configure OIDC identity providers for SSO login:
- DB-backed state store (not in-memory) for OIDC state management
- Claim mapping for username, email, roles
- Plant-scoped role mapping from IdP claims
- Account linking (associate OIDC identity with existing local account)
- RP-initiated logout
- Nonce validation for security

---

## How To Configure (Step-by-Step)

### Creating a User with a Specific Role (Admin)

1. Log in as an admin.
2. Navigate to `/admin/users`.
3. Click **Create User** (or equivalent button).
4. Fill in: username, full name, email, password.
5. Assign a role at one or more plants:
   - Select a plant from the dropdown
   - Select a role (Operator, Supervisor, Engineer, Admin)
   - Add additional plant/role assignments as needed
6. Click **Save**.

### Changing a User's Role (Admin)

1. Navigate to `/admin/users`.
2. Find the user in the list and click **Edit**.
3. Modify the role assignment for the desired plant.
4. Click **Save**.

### Deactivating a User (Admin)

1. Navigate to `/admin/users`.
2. Find the user and click **Deactivate** (or toggle `is_active`).
3. The user can no longer log in. Their existing sessions are invalidated on token expiry.

### Configuring Password Policy (Admin)

1. Navigate to `/settings/signatures` > **Password Policy** section.
2. Set complexity requirements (uppercase, lowercase, digit, special, min length).
3. Set expiry (e.g., 90 days for regulated environments).
4. Set lockout policy (e.g., 5 attempts, 30-minute lockout).
5. Click **Save**. Changes take effect immediately for new login attempts and password changes.

---

## How To Use (Typical Workflow)

### Operator Day-to-Day

1. Log in with operator credentials.
2. The sidebar shows: Dashboard, Data Entry, Violations.
3. Navigate to `/data-entry` to submit measurements.
4. Navigate to `/dashboard` to view control charts and capability.
5. Navigate to `/violations` to see active violations.
6. Access `/settings/account` to change password or update profile.

### Supervisor Day-to-Day

1. Log in with supervisor credentials.
2. The sidebar adds: Reports.
3. Navigate to `/reports` to generate and view process reports.
4. Navigate to `/violations` to acknowledge or resolve violations.
5. All operator-level features are also available.

### Engineer Configuration Session

1. Log in with engineer credentials.
2. The sidebar adds: MSA, FAI, DOE, Analytics, Connectivity, Configuration, Settings.
3. Navigate to `/configuration` to create characteristics, set limits, configure rules.
4. Navigate to `/connectivity` to manage data sources (MQTT, OPC-UA, gages).
5. Navigate to `/msa` for measurement system analysis studies.
6. All supervisor and operator features are also available.

### Admin System Management

1. Log in with admin credentials.
2. The sidebar adds: Users.
3. Navigate to `/admin/users` to manage user accounts and role assignments.
4. Navigate to `/settings/branding` to customize the application appearance.
5. Navigate to `/settings/audit-log` to review the audit trail.
6. All engineer, supervisor, and operator features are also available.

### Plant Switching and Role Changes

1. Log in as a user who has different roles at different plants.
2. Click the plant switcher in the header.
3. Select Plant A (e.g., admin role) -- full sidebar visible.
4. Switch to Plant B (e.g., operator role) -- sidebar narrows to operator items only.
5. Attempt to navigate to `/configuration` at Plant B -- redirected to dashboard with "Access Denied" toast.

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Verification |
|---|---|---|
| 1 | Operator can access dashboard, data entry, violations | Login as operator, verify all three pages load |
| 2 | Operator CANNOT access configuration or user management | Navigate to /configuration and /admin/users, verify redirect + toast |
| 3 | Supervisor can access reports | Login as supervisor, verify /reports loads |
| 4 | Engineer can access configuration, connectivity, MSA, FAI, DOE | Login as engineer, verify all pages load |
| 5 | Engineer CANNOT access user management | Navigate to /admin/users, verify redirect + toast |
| 6 | Admin can access all pages | Login as admin, navigate to every route, verify access |
| 7 | Plant switching changes effective role | User with admin@PlantA, operator@PlantB -- switch plants, verify sidebar changes |
| 8 | Sidebar hides items above user's role | Verify operator sidebar has 3 main items, no Configuration/Settings/Users |
| 9 | API returns 403 for unauthorized requests | As operator, POST /characteristics, verify 403 |
| 10 | Deactivated user cannot log in | Deactivate user, attempt login, verify failure |
| 11 | Admin auto-assigned to all plants | Create new plant, verify admin user has admin role at new plant |
| 12 | JWT refresh works transparently | Wait for access token expiry, verify requests succeed via refresh |
| 13 | Password policy enforced on change | Set min length + uppercase, attempt weak password, verify rejection |
| 14 | Account lockout after failed attempts | Configure 3 max attempts, fail 3 times, verify lockout |
| 15 | Personal settings accessible to all roles | As operator, navigate to /settings/account, verify access |

---

## Edge Cases & Constraints

- **Sidebar vs route access**: The sidebar Settings link requires `engineer` role to be visible, but the route `/settings` is accessible to `operator` role (for personal sub-tabs: account, appearance, notifications). Operators can access personal settings via direct URL `/settings/account` even though they do not see the Settings link in the sidebar.
- **Admin bootstrap on plant creation**: When a new plant is created, all existing admin users are automatically assigned the admin role at the new plant. This ensures admins always have full access.
- **Role hierarchy is strict**: There is no concept of custom roles or granular permissions. The four-tier hierarchy is fixed. If a user needs partial engineer access, they must be granted the full engineer role.
- **Token refresh race condition**: The frontend uses a shared promise queue for concurrent 401 handling. Never use a boolean flag -- this causes race conditions where multiple concurrent requests all attempt to refresh the token simultaneously.
- **Deactivated users and existing sessions**: Deactivating a user does not immediately terminate their session. Their access token remains valid until expiry (up to 15 minutes). The refresh token will fail on the next refresh attempt.
- **Plant-scoped role resolution**: If a user has no role at a plant, they cannot access that plant's data at all. The API returns 403 for any request scoped to that plant.
- **Password expiry redirect**: When `must_change_password` is true, the `RequireAuth` component redirects to `/change-password` before any other route. The user cannot access the application until they change their password.
- **Cookie path scoping**: The refresh token cookie uses `path="/api/v1/auth"` so it is only sent with auth-related requests, not with every API call.
- **OIDC state management**: OIDC state is stored in the database (not in-memory) to survive server restarts and support multi-instance deployments.
- **API key vs JWT**: API keys and JWT tokens are separate authentication mechanisms. API keys are used for programmatic access; JWT tokens are used for browser sessions. Both are checked by the auth dependency chain.

---

## API Reference (for seeding)

All paths below are relative to the API base (`/api/v1/`). The `fetchApi` client in the frontend prepends this prefix automatically.

### Authentication Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/login` | None | Login with username + password. Returns access token, sets refresh cookie |
| `POST` | `/auth/refresh` | Refresh cookie | Exchange refresh token for new access token |
| `POST` | `/auth/logout` | User | Invalidate refresh token, clear cookie |
| `GET` | `/auth/me` | User | Get current user profile with roles per plant |

### User Management Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/users` | Admin | List all users |
| `POST` | `/users` | Admin | Create user. Body: `UserCreate` |
| `GET` | `/users/{id}` | Admin | Get user details |
| `PUT` | `/users/{id}` | Admin | Update user |
| `PATCH` | `/users/{id}/deactivate` | Admin | Deactivate user |
| `POST` | `/users/{id}/roles` | Admin | Assign role at a plant. Body: `{ plant_id, role }` |
| `DELETE` | `/users/{id}/roles/{plant_id}` | Admin | Remove role at a plant |

### Request/Response Schemas

**LoginRequest**: `{ username: string, password: string }`

**LoginResponse**: `{ access_token: string, token_type: "bearer", user: { id, username, full_name, email, is_active, roles: [{ plant_id, plant_name, role }] } }`

**UserCreate**: `{ username: string, password: string, full_name?: string, email?: string, is_active?: bool }`

**RoleAssign**: `{ plant_id: int, role: "operator" | "supervisor" | "engineer" | "admin" }`

### Seeding Example

```bash
# 1. Login as admin
TOKEN=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}' | jq -r '.access_token')

# 2. Create an operator user
curl -X POST $API/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "oq-operator", "password": "Operator123!", "full_name": "OQ Operator", "email": "operator@test.com"}'

# 3. Assign operator role at plant
curl -X POST "$API/users/$USER_ID/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plant_id": '$PLANT_ID', "role": "operator"}'

# 4. Create a supervisor user
curl -X POST $API/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "oq-supervisor", "password": "Supervisor123!", "full_name": "OQ Supervisor"}'

# 5. Assign supervisor role
curl -X POST "$API/users/$SUP_ID/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plant_id": '$PLANT_ID', "role": "supervisor"}'

# 6. Create an engineer user
curl -X POST $API/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "oq-engineer", "password": "Engineer123!", "full_name": "OQ Engineer"}'

# 7. Assign engineer role
curl -X POST "$API/users/$ENG_ID/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plant_id": '$PLANT_ID', "role": "engineer"}'

# 8. Create a multi-plant user (admin at Plant A, operator at Plant B)
curl -X POST $API/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "oq-multi", "password": "Multi123!", "full_name": "OQ Multi-Plant User"}'

curl -X POST "$API/users/$MULTI_ID/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plant_id": '$PLANT_A_ID', "role": "admin"}'

curl -X POST "$API/users/$MULTI_ID/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plant_id": '$PLANT_B_ID', "role": "operator"}'

# 9. Verify role via /auth/me
curl -X GET $API/auth/me \
  -H "Authorization: Bearer $OPERATOR_TOKEN"
# Returns: { user: { roles: [{ plant_id: 1, role: "operator" }] } }

# 10. Test 403 response
curl -X POST $API/characteristics \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "test", "hierarchy_id": 1}'
# Returns: 403 Forbidden
```
