# Authentication & Accounts -- OQ Knowledge Base

## Category: AUTH
## Config Reference: `{ prefix: "AUTH", name: "Authentication & Accounts", kb: "01-auth-accounts.md" }`

---

## What It Does

The authentication and account management system controls who can access Cassini and what they are authorized to do once inside. This is the foundational security layer that every other feature depends on.

From a compliance perspective, this system is critical for:

- **21 CFR Part 11** (FDA) -- Electronic records and electronic signatures. Requires unique user identification, password controls, audit trail of access, and session management. The authentication system provides the identity foundation that electronic signatures build upon.
- **ISO 13485** (Medical Devices) -- Requires documented procedures for access control, user competency verification through role assignment, and traceability of who performed what action.
- **IATF 16949** (Automotive) -- Requires controlled access to quality records, role-appropriate permissions for SPC configuration vs. data entry, and audit trail of changes.
- **AS9100 / AS9102** (Aerospace) -- Requires separation of duties (enforced via roles), controlled access to FAI records, and traceability of approvals.

The system enforces the principle of least privilege through plant-scoped role assignments. An operator cannot configure control limits. A supervisor cannot create users. An engineer cannot view the audit log. Only admins have full access.

---

## Where To Find It

| Page / Feature              | URL                      | Min Role  | Description                                    |
|----------------------------|--------------------------|-----------|------------------------------------------------|
| Login page                  | `/login`                   | Public    | Username/password form + SSO provider buttons  |
| Forgot password             | `/forgot-password`         | Public    | Enter username or email to request reset link  |
| Reset password              | `/reset-password?token=X`  | Public    | Enter new password using emailed token         |
| Forced password change      | `/change-password`         | Auth*     | Shown when `must_change_password` flag is set  |
| Account settings            | `/settings/account`        | Any role  | Display name, email, password change           |
| User management             | `/admin/users`             | Admin     | Create/edit/deactivate users, assign roles     |
| SSO configuration           | `/settings/sso`            | Admin     | OIDC provider setup, claim mapping             |
| Password policy             | `/settings/signatures`     | Engineer+ | Password complexity, expiry, lockout settings  |
| Audit log                   | `/settings/audit-log`      | Admin     | Login/logout and all action audit records      |

*Forced password change: The user has a valid access token (they authenticated successfully), but the `must_change_password` flag on their account forces a redirect to `/change-password` before they can access any other authenticated route.

---

## Role Hierarchy Detail

Roles are assigned per plant via the `user_plant_role` join table. The hierarchy is strictly ordered:

```
operator (1) < supervisor (2) < engineer (3) < admin (4)
```

Each role inherits all permissions of the roles below it. An engineer can do everything a supervisor and operator can do, plus engineer-specific actions.

### Sidebar Visibility by Role

| Sidebar Item    | Operator | Supervisor | Engineer | Admin |
|----------------|----------|-----------|----------|-------|
| Dashboard       | Yes      | Yes        | Yes      | Yes   |
| Data Entry      | Yes      | Yes        | Yes      | Yes   |
| Violations      | Yes      | Yes        | Yes      | Yes   |
| Reports         | No       | Yes        | Yes      | Yes   |
| MSA             | No       | No         | Yes      | Yes   |
| FAI             | No       | No         | Yes      | Yes   |
| DOE             | No       | No         | Yes      | Yes   |
| Analytics       | No       | No         | Yes      | Yes   |
| Connectivity    | No       | No         | Yes      | Yes   |
| Configuration   | No       | No         | Yes      | Yes   |
| Settings        | Yes      | Yes        | Yes      | Yes   |
| Users (Admin)   | No       | No         | No       | Yes   |

### Settings Tab Visibility by Role

| Settings Tab     | Operator | Supervisor | Engineer | Admin |
|-----------------|----------|-----------|----------|-------|
| Account          | Yes      | Yes        | Yes      | Yes   |
| Appearance       | Yes      | Yes        | Yes      | Yes   |
| Notifications    | Yes      | Yes        | Yes      | Yes   |
| Sites            | No       | No         | No       | Yes   |
| Branding         | No       | No         | No       | Yes   |
| Localization     | No       | No         | No       | Yes   |
| Email & Webhooks | No       | No         | No       | Yes   |
| SSO              | No       | No         | No       | Yes   |
| Signatures       | No       | No         | Yes      | Yes   |
| API Keys         | No       | No         | Yes      | Yes   |
| Audit Log        | No       | No         | No       | Yes   |
| Database         | No       | No         | Yes      | Yes   |
| Retention        | No       | No         | Yes      | Yes   |
| Reports (Sched.) | No       | No         | Yes      | Yes   |
| AI               | No       | No         | No       | Yes   |

---

## Key Concepts

### JWT Token Architecture

Cassini uses a dual-token authentication scheme:

1. **Access token** -- Short-lived JWT (15 minutes). Sent in the `Authorization: Bearer <token>` header on every API request. Contains `sub` (user ID) and `username` claims. Stored in JavaScript memory (not localStorage) to reduce XSS risk.

2. **Refresh token** -- Longer-lived JWT (7 days default, 30 days with "Remember Me"). Stored as an `httpOnly` cookie with `path=/api/v1/auth` and `SameSite=lax`. Cannot be accessed by JavaScript. Used only to obtain new access tokens via `POST /auth/refresh`.

Token flow:
- Login returns access token in response body + sets refresh cookie
- Frontend stores access token in memory
- Every API call includes `Authorization: Bearer <access_token>`
- When a 401 is received, the frontend calls `POST /auth/refresh` (cookie sent automatically)
- If refresh succeeds, the original request is retried with the new access token
- If refresh fails, the user is redirected to `/login`
- Concurrent 401s use a **shared promise queue** to avoid multiple simultaneous refresh requests

### Password Policy

Password policies are configured via the Signatures settings page (`/settings/signatures`). Policies include:

- **Minimum length** -- Minimum number of characters required
- **Complexity requirements** -- Uppercase, lowercase, digits, special characters
- **Password expiry** -- Number of days before password must be changed (0 = never expires)
- **Max failed attempts** -- Number of consecutive failed logins before account lockout
- **Lockout duration** -- Minutes the account is locked after max failed attempts

When a password expires (based on `password_changed_at` + `password_expiry_days`), the login response sets `must_change_password: true`, which forces a redirect to `/change-password`.

### Account Lockout

When `max_failed_attempts` is configured in the password policy:
- Each failed login increments `failed_login_count` on the user record
- When the count reaches the threshold, `locked_until` is set to `now + lockout_duration_minutes`
- Locked accounts receive an HTTP 423 response with "Account locked"
- Successful login resets `failed_login_count` to 0 and clears `locked_until`

### SSO / OIDC

Cassini supports external identity providers via OpenID Connect:
- Admin configures providers at `/settings/sso` (client ID, client secret, discovery URL)
- Active providers appear as buttons on the login page
- OIDC flow: redirect to IdP, callback with code+state, exchange for tokens
- Claim mapping maps IdP attributes to Cassini user fields
- Plant-scoped role mapping can auto-assign roles based on IdP group claims
- Account linking allows connecting an OIDC identity to an existing local account
- RP-initiated logout sends the user to the IdP's logout endpoint

### Email Verification

When a user changes their email address:
- The new email is stored in `pending_email` on the user record
- A verification token is generated (SHA-256 hashed, stored in `email_verification_token` table)
- A verification email is sent to the new address with a link containing the raw token
- The token expires after 24 hours
- Clicking the link calls `GET /auth/verify-email?token=X` which updates the email and clears `pending_email`
- Until verified, the old email remains the primary email

### Forgot Password / Reset Password

- User enters username or email at `/forgot-password`
- Backend always returns the same success message regardless of whether the user exists (prevents user enumeration)
- If the user exists and has an email, a reset token is generated (SHA-256 hashed, 1-hour expiry)
- Rate limited to 3 tokens per user per hour
- Reset link contains the raw token: `/reset-password?token=X`
- At `/reset-password`, user enters new password (minimum 8 characters)
- Token is consumed on use (marked with `used_at` timestamp)

---

## How To Configure

### Creating Users (Admin)

1. Log in as admin
2. Navigate to `/admin/users`
3. Click the "Add User" button
4. Fill in: username (required, unique), password (required), email (optional)
5. Submit -- user is created
6. To assign a plant role: click on the user row, use the role assignment form to select a plant and role
7. Click assign -- the role is saved immediately

### Configuring Password Policy (Engineer+)

1. Navigate to `/settings/signatures`
2. Go to the "Password Policy" tab
3. Configure: minimum length, complexity, expiry days, max failed attempts, lockout duration
4. Save changes

### Configuring SSO (Admin)

1. Navigate to `/settings/sso`
2. Click "Add Provider"
3. Enter: name, client ID, client secret, discovery URL (or manual endpoints)
4. Configure claim mapping (optional)
5. Configure plant role mapping (optional)
6. Toggle provider active/inactive
7. Save -- the provider button appears on the login page

---

## How To Use

### Standard Login Flow

1. Navigate to `/login` (or any protected URL, which redirects to `/login`)
2. Enter username in the "Username" field
3. Enter password in the "Password" field
4. Optionally check "Remember Me" (extends refresh token to 30 days)
5. Click "Log In"
6. On success: redirected to `/dashboard` (or the originally requested URL)
7. On failure: error message displayed in red below the form heading

### SSO Login Flow

1. Navigate to `/login`
2. Click the SSO provider button (e.g., "Sign in with Okta")
3. Redirected to the identity provider's login page
4. Authenticate with the IdP
5. Redirected back to `/login?code=X&state=Y`
6. Cassini exchanges the code for tokens and logs the user in
7. Redirected to `/dashboard`

### Logout

1. Click the user avatar/name in the top-right header
2. Click "Sign Out" in the dropdown menu
3. Refresh token cookie is cleared
4. Redirected to `/login`

### Change Password

1. Navigate to `/settings/account`
2. Scroll to "Change Password" section
3. Enter current password
4. Enter new password (minimum 8 characters, must differ from current)
5. Confirm new password
6. Click "Change Password"
7. On success: toast notification, fields cleared

### Update Profile

1. Navigate to `/settings/account`
2. In the "Profile" section:
   - Edit "Display Name" field
   - Edit "Email" field (triggers verification flow)
3. Click "Save Changes"
4. If email was changed: a warning banner shows "Pending verification: new@email.com"

---

## Acceptance Criteria

For OQ testing, the following must be verified:

1. **Login with valid credentials** -- User is authenticated, access token returned, refresh cookie set, redirected to dashboard.
2. **Login with invalid credentials** -- Error message displayed, no token issued, no redirect.
3. **Login with non-existent user** -- Same error message as invalid password (prevents user enumeration).
4. **Logout** -- Refresh cookie cleared, user redirected to login, protected routes inaccessible.
5. **Unauthenticated access** -- Accessing any protected URL without a token redirects to `/login`.
6. **Session persistence** -- Page refresh after login does not log the user out (refresh token works).
7. **Password change** -- Current password verified, new password saved, `must_change_password` cleared.
8. **Forced password change** -- Users with `must_change_password=true` are redirected to `/change-password` before any other route.
9. **Forgot password** -- Always shows success message. If user exists with email, reset token generated.
10. **Reset password** -- Valid token allows password change. Invalid/expired token shows error.
11. **Profile update** -- Display name saved immediately. Email change triggers verification flow.
12. **User creation** -- Admin can create users with unique usernames.
13. **Role assignment** -- Admin can assign plant-scoped roles. Role determines sidebar visibility and route access.
14. **RBAC enforcement** -- Each role level sees only the sidebar items and settings tabs appropriate to their permission level. Direct URL access to unauthorized routes is blocked.
15. **Audit trail** -- Login, logout, password changes, profile updates, and user management actions are recorded in the audit log.

---

## Edge Cases and Technical Details

- **Concurrent 401 handling** -- When multiple API requests fail with 401 simultaneously (access token expired), the frontend uses a shared promise queue so only one refresh request is sent. All pending requests wait for the single refresh to complete, then retry with the new token.
- **Password reset token expiry** -- Tokens expire after 1 hour. Expired tokens return "Invalid or expired reset token."
- **Rate limiting on reset** -- Maximum 3 password reset tokens per user per hour. Additional requests silently succeed (same response message) but no token is generated.
- **Admin auto-assignment** -- When a new plant is created, all admin users are automatically assigned the admin role at that plant. This ensures admins always have access to all plants.
- **Account lockout** -- Locked accounts return HTTP 423. Lockout is time-based; it clears automatically after `lockout_duration_minutes`.
- **Dev mode** -- In development mode (`dev_mode=true`), the `must_change_password` flag is suppressed to avoid friction during development. OQ tests should be run with dev mode disabled.
- **Cookie path** -- The refresh token cookie uses `path=/api/v1/auth`, so it is only sent on auth-related API calls, not on every request.
- **User enumeration prevention** -- Both the login endpoint and the forgot-password endpoint return generic error messages that do not reveal whether a username or email exists in the system.

---

## API Reference

All paths below are relative to the API base (`/api/v1/`). The `fetchApi` client in the frontend prepends this prefix automatically.

### Authentication Endpoints

| Method | Path                    | Auth Required | Description                                  |
|--------|------------------------|---------------|----------------------------------------------|
| POST   | `/auth/login`            | No            | Authenticate with username/password          |
| POST   | `/auth/refresh`          | Cookie        | Get new access token using refresh cookie    |
| POST   | `/auth/logout`           | Optional      | Clear refresh cookie, optional OIDC logout   |
| GET    | `/auth/me`               | Yes           | Get current user with plant roles            |
| POST   | `/auth/change-password`  | Yes           | Change password (requires current password)  |
| POST   | `/auth/forgot-password`  | No            | Request password reset link                  |
| POST   | `/auth/reset-password`   | No            | Reset password using token                   |
| POST   | `/auth/update-profile`   | Yes           | Update display name and/or email             |
| GET    | `/auth/verify-email`     | No            | Verify new email address via token           |

### User Management Endpoints (Admin Only)

| Method | Path                          | Auth Required | Description                              |
|--------|------------------------------|---------------|------------------------------------------|
| GET    | `/users/`                      | Admin         | List all users with plant roles          |
| POST   | `/users/`                      | Admin         | Create a new user                        |
| GET    | `/users/{user_id}`             | Admin         | Get user by ID with plant roles          |
| PATCH  | `/users/{user_id}`             | Admin         | Update user fields                       |
| DELETE | `/users/{user_id}`             | Admin         | Deactivate user (soft delete)            |
| DELETE | `/users/{user_id}/permanent`   | Admin         | Permanently delete deactivated user      |
| POST   | `/users/{user_id}/roles`       | Admin         | Assign or update plant role              |
| DELETE | `/users/{user_id}/roles/{plant_id}` | Admin    | Remove plant role                        |

### Request/Response Schemas

**LoginRequest**: `{ username: string, password: string, remember_me?: boolean }`

**LoginResponse**: `{ access_token: string, token_type: "bearer", user: UserWithRoles, must_change_password: boolean }`

**UserWithRoles**: `{ id: number, username: string, email?: string, full_name?: string, pending_email?: string, is_active: boolean, created_at: string, updated_at: string, plant_roles: PlantRole[] }`

**PlantRole**: `{ plant_id: number, plant_name: string, plant_code: string, role: "operator"|"supervisor"|"engineer"|"admin" }`

**UserCreate**: `{ username: string, password: string, email?: string }`

**PlantRoleAssign**: `{ plant_id: number, role: "operator"|"supervisor"|"engineer"|"admin" }`

**ChangePasswordRequest**: `{ current_password: string, new_password: string }`

**ForgotPasswordRequest**: `{ identifier: string }` (username or email)

**ResetPasswordRequest**: `{ token: string, new_password: string }`

**UpdateProfileRequest**: `{ display_name?: string, email?: string }`

### Rate Limits

| Endpoint           | Limit                          |
|-------------------|--------------------------------|
| POST /auth/login   | Configurable via `rate_limit_login` setting |
| POST /auth/refresh | 10 per minute                  |
| POST /auth/forgot-password | 3 tokens per user per hour (backend enforced) |
