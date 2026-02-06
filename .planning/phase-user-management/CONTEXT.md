# Phase: User Management

## Goal
Replace the mock AuthProvider with real JWT-based authentication, implement User CRUD with role and plant assignment, and enforce permissions across all API endpoints.

## Current State
- **Frontend**: Mock `AuthProvider` with hardcoded dev user, role switching via Zustand/localStorage, `roles.ts` with 4-tier hierarchy (operator/supervisor/engineer/admin) and view/action permissions
- **Backend**: API key auth only (for data entry), no user model, no JWT, `bcrypt` already in dependencies
- **No login page**, no registration flow, no token infrastructure
- **Plant model** exists with CRUD API; user-plant scoping needs a join table

## Decisions

### 1. Authentication Token Strategy
**Decision**: JWT access + refresh tokens (httpOnly cookies)
- Access token: short-lived (15min), held in React state/memory only
- Refresh token: long-lived (7d), stored in httpOnly secure cookie
- Server-side refresh token rotation for security
- Prevents XSS token theft (no tokens in localStorage)
- Access token re-obtained via `/api/v1/auth/refresh` on page load

### 2. User-Plant Relationship
**Decision**: Many-to-many with per-plant roles
- `user_plant_role` join table: `user_id`, `plant_id`, `role` (enum)
- A user can have different roles at different plants (e.g., admin at Plant A, operator at Plant B)
- Most granular and flexible for manufacturing orgs
- PlantSelector filters the active plant; role determined by user's assignment for that plant

### 3. Permission Model
**Decision**: Keep simple 4-role hierarchy as-is
- Retain the existing 4 roles: operator < supervisor < engineer < admin
- Hierarchical: each role inherits all permissions of roles below it
- Enforce server-side via middleware/dependency injection on API routes
- Frontend continues using existing `roles.ts` permission checks
- No custom role creation needed for now

### 4. AD/LDAP Integration
**Decision**: Skip LDAP entirely for now
- Build only local auth (username/password in database)
- No interface abstraction or pluggable provider
- LDAP/SSO can be added in a future phase if needed
- Keeps scope manageable

### 5. Login UI Design
**Decision**: Dedicated login page (/login route)
- Full-page login with username/password form
- App branding (OpenSPC logo/name)
- "Remember me" checkbox (extends refresh token duration)
- Redirects to dashboard after successful auth
- Unauthenticated routes redirect to /login

### 6. User Management UI Location
**Decision**: Standalone /admin/users page
- Dedicated route with full-page user management
- User table with search, filter by role/plant
- Create/edit user forms with role assignment per plant
- Deactivate users (soft delete)
- Only accessible to admin role

### 7. First-User Bootstrap Flow
**Decision**: Environment variable bootstrap with defaults
- `OPENSPC_ADMIN_USERNAME` (default: `admin`)
- `OPENSPC_ADMIN_PASSWORD` (default: `password`)
- On startup, if no users exist in the database, auto-create admin from env vars
- Log a warning if using default credentials: "Default admin credentials in use - change immediately"
- Works naturally with Docker/container deployments

### 8. Token/Session Storage on Frontend
**Decision**: Access token in React state/context, refresh via httpOnly cookie
- Access token lives in memory only (React context), lost on page refresh
- On page load/refresh, call `/api/v1/auth/refresh` to get a new access token from the httpOnly refresh cookie
- All API requests include the access token as `Authorization: Bearer <token>`
- Refresh cookie set by backend with `httpOnly`, `secure`, `SameSite=Lax`

### 9. Password Hashing
**Decision**: Use argon2 (via argon2-cffi)
- Modern winner of the Password Hashing Competition
- Better resistance to GPU attacks than bcrypt
- New dependency: `argon2-cffi`
- Existing bcrypt usage for API keys remains unchanged

## Scope Summary

### Backend
- User model (id, username, email, hashed_password, is_active, created_at, updated_at)
- UserPlantRole join model (user_id, plant_id, role enum)
- Auth endpoints: POST /login, POST /refresh, POST /logout
- User CRUD endpoints: GET/POST/PATCH/DELETE /users
- User-plant-role assignment endpoints
- JWT middleware for route protection
- Role-based permission enforcement on all existing endpoints
- Auto-bootstrap admin user on startup
- Dependencies: `PyJWT`, `argon2-cffi`

### Frontend
- Login page component (/login route)
- Real AuthProvider replacing mock (stores access token in context)
- Auth interceptor on API client (attach Bearer token, handle 401 → refresh)
- /admin/users page with user table, create/edit forms
- Protected route enforcement (redirect to /login if unauthenticated)
- Role derived from user's assignment for the currently selected plant

### Not In Scope
- AD/LDAP integration
- Custom role creation
- Two-factor authentication
- Password reset via email
- User self-registration
