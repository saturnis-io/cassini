---
phase: user-management
plan: 3
type: execute
wave: 2
depends_on: [1, 2]
files_modified:
  - backend/src/openspc/api/v1/auth.py
  - backend/src/openspc/api/v1/users.py
  - backend/src/openspc/api/v1/__init__.py
  - backend/src/openspc/api/deps.py
  - backend/src/openspc/main.py
autonomous: true
must_haves:
  truths:
    - "POST /api/v1/auth/login accepts username+password, returns access token, sets refresh cookie"
    - "POST /api/v1/auth/refresh returns new access token from refresh cookie"
    - "POST /api/v1/auth/logout clears refresh cookie"
    - "GET /api/v1/auth/me returns current user with roles for all plants"
    - "GET/POST/PATCH/DELETE /api/v1/users provides full user CRUD (admin only)"
    - "POST /api/v1/users/{id}/roles assigns plant roles"
    - "Admin bootstrap runs on application startup"
  artifacts:
    - "backend/src/openspc/api/v1/auth.py exists with login, refresh, logout, me endpoints"
    - "backend/src/openspc/api/v1/users.py exists with CRUD + role assignment endpoints"
    - "backend/src/openspc/api/deps.py has get_current_user and require_role dependencies"
  key_links:
    - "Auth endpoints use jwt.py for token creation/verification"
    - "Auth endpoints use passwords.py for credential verification"
    - "get_current_user dependency extracts user from Bearer token"
    - "require_role dependency checks user's role for a given plant"
    - "Bootstrap runs in main.py lifespan"
---

# Phase user-management - Plan 3: Backend API Endpoints

## Objective
Create authentication and user management API endpoints, JWT middleware for route protection, and wire bootstrap into application startup.

## Tasks

<task type="auto">
  <name>Task 1: Create Auth Endpoints and JWT Middleware</name>
  <files>backend/src/openspc/api/v1/auth.py, backend/src/openspc/api/deps.py</files>
  <action>
    Add to `backend/src/openspc/api/deps.py`:

    1. `async def get_current_user(authorization: str = Header(None), session = Depends(get_db_session)) -> User`:
       - Extract Bearer token from Authorization header
       - Verify with verify_access_token()
       - Load User from DB by user_id in token payload
       - Raise 401 if token invalid, user not found, or user inactive
       - Return User object (with plant_roles eagerly loaded)
    2. `def require_role(min_role: str, plant_id_param: str = "plant_id")`:
       - Factory that returns a FastAPI dependency
       - Dependency checks if current user has >= min_role for the given plant
       - Use ROLE_HIERARCHY dict: {"operator": 1, "supervisor": 2, "engineer": 3, "admin": 4}
       - Raise 403 if insufficient role
    3. `async def get_current_admin(user = Depends(get_current_user)) -> User`:
       - Convenience dependency: checks if user has admin role on ANY plant
       - Raise 403 if not admin anywhere

    Create `backend/src/openspc/api/v1/auth.py`:

    1. Router with prefix="/api/v1/auth", tags=["auth"]
    2. `POST /login`:
       - Accept JSON body: {"username": str, "password": str, "remember_me": bool = False}
       - Look up user by username via UserRepository
       - Verify password with verify_password()
       - If invalid: return 401
       - Create access token and refresh token
       - Set refresh token as httpOnly cookie:
         - key: "refresh_token"
         - httponly=True, secure=False (dev), samesite="lax"
         - max_age: 30 days if remember_me, else 7 days
       - Return JSON: {"access_token": token, "token_type": "bearer", "user": UserResponse}
    3. `POST /refresh`:
       - Read refresh_token from cookies
       - Verify with verify_refresh_token()
       - Load user, check is_active
       - Create new access token
       - Optionally rotate refresh token (create new one, set new cookie)
       - Return JSON: {"access_token": token, "token_type": "bearer"}
    4. `POST /logout`:
       - Clear refresh_token cookie (set max_age=0)
       - Return JSON: {"message": "Logged out successfully"}
    5. `GET /me` (requires get_current_user):
       - Return current user with all plant roles
       - Use UserWithRolesResponse schema

    Constraints:
    - Use FastAPI Response object to set cookies
    - Refresh cookie path should be "/api/v1/auth" to limit cookie scope
    - For development: secure=False on cookies (no HTTPS locally)
    - Use environment variable OPENSPC_COOKIE_SECURE (default: "false") to control cookie secure flag
  </action>
  <verify>
    ```bash
    grep -q "def get_current_user" backend/src/openspc/api/deps.py
    grep -q "def require_role" backend/src/openspc/api/deps.py
    grep -q "/login" backend/src/openspc/api/v1/auth.py
    grep -q "/refresh" backend/src/openspc/api/v1/auth.py
    grep -q "/logout" backend/src/openspc/api/v1/auth.py
    grep -q "/me" backend/src/openspc/api/v1/auth.py
    cd backend && python -c "from openspc.api.v1.auth import router; print(f'Routes: {len(router.routes)}')"
    ```
  </verify>
  <done>
    - Auth router with login, refresh, logout, me endpoints
    - get_current_user dependency extracts and validates JWT
    - require_role factory for per-plant role checking
    - get_current_admin convenience dependency
    - Refresh token in httpOnly cookie
  </done>
</task>

<task type="auto">
  <name>Task 2: Create User CRUD Endpoints</name>
  <files>backend/src/openspc/api/v1/users.py</files>
  <action>
    Create `backend/src/openspc/api/v1/users.py`:

    1. Router with prefix="/api/v1/users", tags=["users"]
    2. All endpoints require get_current_admin (admin only)
    3. Dependency: get_user_repo (follow get_plant_repo pattern)
    4. Endpoints:
       - `GET /` - List users with optional filters (active_only, search query)
         - Return list[UserWithRolesResponse]
         - Support ?search= for username/email partial match
         - Support ?active_only=true
       - `POST /` - Create user
         - Accept UserCreate body
         - Hash password with hash_password()
         - Create user via repository
         - Return UserResponse with 201 status
       - `GET /{user_id}` - Get user by ID
         - Return UserWithRolesResponse with plant roles
         - 404 if not found
       - `PATCH /{user_id}` - Update user
         - Accept UserUpdate body
         - If password provided, hash it before saving
         - Return UserResponse
         - 404 if not found
       - `DELETE /{user_id}` - Deactivate user (soft delete)
         - Set is_active=False via repository.deactivate()
         - Prevent deactivating self (check current_user.id != user_id)
         - Return 204
       - `POST /{user_id}/roles` - Assign plant role
         - Accept PlantRoleAssign body (plant_id, role)
         - Use repository.assign_plant_role()
         - Return updated UserWithRolesResponse
       - `DELETE /{user_id}/roles/{plant_id}` - Remove plant role
         - Use repository.remove_plant_role()
         - Return 204

    Constraints:
    - Admin cannot deactivate themselves
    - Admin cannot remove their own admin role
    - Validate role values against UserRole enum
    - Use existing schema patterns
  </action>
  <verify>
    ```bash
    grep -q "router = APIRouter" backend/src/openspc/api/v1/users.py
    grep -q "get_current_admin" backend/src/openspc/api/v1/users.py
    grep -q "async def create_user" backend/src/openspc/api/v1/users.py
    grep -q "async def list_users" backend/src/openspc/api/v1/users.py
    grep -q "assign.*role" backend/src/openspc/api/v1/users.py
    cd backend && python -c "from openspc.api.v1.users import router; print(f'Routes: {len(router.routes)}')"
    ```
  </verify>
  <done>
    - Full user CRUD: list, create, get, update, deactivate
    - Plant role assignment and removal endpoints
    - Admin-only access enforcement
    - Self-protection (can't deactivate self or remove own admin)
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire Routers and Bootstrap into Main App</name>
  <files>backend/src/openspc/main.py</files>
  <action>
    Update `backend/src/openspc/main.py`:

    1. Import auth router and users router:
       ```python
       from openspc.api.v1.auth import router as auth_router
       from openspc.api.v1.users import router as users_router
       ```
    2. Register routers:
       ```python
       app.include_router(auth_router)
       app.include_router(users_router)
       ```
    3. In lifespan startup, after DB initialization, call bootstrap:
       ```python
       from openspc.core.auth.bootstrap import bootstrap_admin_user
       # ... after db = get_database()
       async with db.session() as session:
           await bootstrap_admin_user(session)
       ```
       Place this before the MQTT initialization block.
    4. Update version to "0.3.0" in FastAPI app config

    Constraints:
    - Keep existing router registrations unchanged
    - Bootstrap must run before MQTT init (MQTT session is separate)
    - Don't add JWT auth requirement to existing endpoints yet (that's Plan 6)
  </action>
  <verify>
    ```bash
    grep -q "auth_router" backend/src/openspc/main.py
    grep -q "users_router" backend/src/openspc/main.py
    grep -q "bootstrap_admin_user" backend/src/openspc/main.py
    cd backend && python -c "from openspc.main import app; routes = [r.path for r in app.routes if hasattr(r, 'path')]; assert '/api/v1/auth/login' in routes or any('auth' in r for r in routes); print('OK')"
    ```
  </verify>
  <done>
    - Auth and users routers registered in main app
    - Bootstrap admin user runs on startup
    - Application version updated to 0.3.0
    - Existing endpoints unchanged
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] POST /api/v1/auth/login works with username+password
- [ ] POST /api/v1/auth/refresh issues new access token from cookie
- [ ] POST /api/v1/auth/logout clears cookie
- [ ] GET /api/v1/auth/me returns authenticated user
- [ ] User CRUD endpoints work (admin only)
- [ ] Plant role assignment works
- [ ] Admin user bootstrapped on startup
- [ ] Atomic commit created
