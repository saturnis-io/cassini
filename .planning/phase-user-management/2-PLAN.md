---
phase: user-management
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/openspc/core/auth/jwt.py
  - backend/src/openspc/core/auth/passwords.py
  - backend/src/openspc/core/auth/__init__.py
  - backend/src/openspc/core/auth/bootstrap.py
  - backend/pyproject.toml
autonomous: true
must_haves:
  truths:
    - "JWT access tokens can be created and verified with user_id and username claims"
    - "Passwords are hashed with argon2 and can be verified"
    - "Refresh tokens are generated as opaque random strings"
    - "Admin user is auto-created on startup if no users exist in database"
  artifacts:
    - "backend/src/openspc/core/auth/jwt.py exists with create/verify token functions"
    - "backend/src/openspc/core/auth/passwords.py exists with hash/verify password functions"
    - "backend/src/openspc/core/auth/bootstrap.py exists with bootstrap_admin_user function"
    - "PyJWT and argon2-cffi added to pyproject.toml dependencies"
  key_links:
    - "jwt.py creates tokens with user_id claim used by auth middleware in Plan 3"
    - "passwords.py used by auth endpoints and user CRUD in Plan 3"
    - "bootstrap.py called from main.py lifespan in Plan 3"
---

# Phase user-management - Plan 2: Auth Service Layer

## Objective
Implement JWT token management, argon2 password hashing, and admin bootstrap logic as reusable service functions, independent of API endpoints.

## Tasks

<task type="auto">
  <name>Task 1: Add Dependencies and Create Password Hashing Module</name>
  <files>backend/pyproject.toml, backend/src/openspc/core/auth/passwords.py</files>
  <action>
    Update `backend/pyproject.toml` dependencies list:
    - Add `"PyJWT>=2.8.0"` to dependencies
    - Add `"argon2-cffi>=23.1.0"` to dependencies

    Create `backend/src/openspc/core/auth/passwords.py`:

    1. Import argon2 from argon2-cffi
    2. Create module-level `PasswordHasher` instance (argon2.PasswordHasher with defaults)
    3. Functions:
       - `hash_password(plain: str) -> str`: Hash with argon2
       - `verify_password(plain: str, hashed: str) -> bool`: Verify, return False on any error
       - `needs_rehash(hashed: str) -> bool`: Check if hash needs updating (argon2 built-in)

    Constraints:
    - Use argon2-cffi's PasswordHasher class (not raw argon2)
    - Catch argon2.exceptions.VerifyMismatchError in verify
    - Keep functions stateless and synchronous (argon2 is CPU-bound but fast)
  </action>
  <verify>
    ```bash
    grep -q "PyJWT" backend/pyproject.toml
    grep -q "argon2-cffi" backend/pyproject.toml
    grep -q "def hash_password" backend/src/openspc/core/auth/passwords.py
    grep -q "def verify_password" backend/src/openspc/core/auth/passwords.py
    cd backend && pip install -e ".[dev]" && python -c "from openspc.core.auth.passwords import hash_password, verify_password; h = hash_password('test'); assert verify_password('test', h); print('OK')"
    ```
  </verify>
  <done>
    - PyJWT and argon2-cffi in pyproject.toml
    - Password hashing module with hash_password, verify_password, needs_rehash
    - Argon2 hashing verified working
  </done>
</task>

<task type="auto">
  <name>Task 2: Create JWT Token Management Module</name>
  <files>backend/src/openspc/core/auth/jwt.py, backend/src/openspc/core/auth/__init__.py</files>
  <action>
    Create `backend/src/openspc/core/auth/jwt.py`:

    1. Configuration constants (read from env vars with defaults):
       - `JWT_SECRET_KEY`: env var `OPENSPC_JWT_SECRET` or generated default for dev
       - `JWT_ALGORITHM`: "HS256"
       - `ACCESS_TOKEN_EXPIRE_MINUTES`: 15
       - `REFRESH_TOKEN_EXPIRE_DAYS`: 7
    2. Functions:
       - `create_access_token(user_id: int, username: str) -> str`:
         - Payload: {"sub": str(user_id), "username": username, "type": "access", "exp": now + 15min, "iat": now}
         - Encode with PyJWT
       - `create_refresh_token(user_id: int) -> str`:
         - Payload: {"sub": str(user_id), "type": "refresh", "exp": now + 7days, "iat": now}
         - Encode with PyJWT
       - `verify_access_token(token: str) -> dict | None`:
         - Decode and verify, check "type" == "access"
         - Return payload dict or None on any error (expired, invalid, wrong type)
       - `verify_refresh_token(token: str) -> dict | None`:
         - Decode and verify, check "type" == "refresh"
         - Return payload dict or None on any error
    3. For dev mode: generate a random secret on startup if env var not set, log a warning

    Update `backend/src/openspc/core/auth/__init__.py`:
    - Add imports for jwt functions and password functions
    - Keep existing APIKeyAuth exports

    Constraints:
    - Use PyJWT (import jwt), NOT python-jose
    - Use os.environ.get() for config, not pydantic-settings (keep it simple)
    - Log warning when using generated secret: "No JWT secret configured, using random key (sessions won't persist across restarts)"
  </action>
  <verify>
    ```bash
    grep -q "def create_access_token" backend/src/openspc/core/auth/jwt.py
    grep -q "def verify_access_token" backend/src/openspc/core/auth/jwt.py
    grep -q "def create_refresh_token" backend/src/openspc/core/auth/jwt.py
    cd backend && python -c "
    from openspc.core.auth.jwt import create_access_token, verify_access_token
    token = create_access_token(1, 'admin')
    payload = verify_access_token(token)
    assert payload is not None
    assert payload['sub'] == '1'
    assert payload['username'] == 'admin'
    print('OK')
    "
    ```
  </verify>
  <done>
    - JWT module creates and verifies access and refresh tokens
    - Configurable via environment variables
    - Token type validation (access vs refresh)
    - Proper expiration handling
  </done>
</task>

<task type="auto">
  <name>Task 3: Create Admin Bootstrap Module</name>
  <files>backend/src/openspc/core/auth/bootstrap.py</files>
  <action>
    Create `backend/src/openspc/core/auth/bootstrap.py`:

    1. Import UserRepository, password hashing, Plant model, UserPlantRole
    2. Function `async bootstrap_admin_user(session: AsyncSession) -> None`:
       - Query user count. If > 0, return immediately (users exist).
       - Read config from env vars:
         - `OPENSPC_ADMIN_USERNAME` (default: "admin")
         - `OPENSPC_ADMIN_PASSWORD` (default: "password")
       - Hash the password with argon2
       - Create User(username=username, hashed_password=hashed, is_active=True)
       - Get the Default plant (code="DEFAULT")
       - If Default plant exists, create UserPlantRole(user_id, plant_id, role="admin")
       - If default password used, log WARNING: "Default admin credentials in use - change immediately"
       - Log INFO: "Bootstrap admin user '{username}' created"

    Constraints:
    - Function is idempotent (safe to call on every startup)
    - Must handle case where Default plant doesn't exist (skip role assignment, log warning)
    - Use existing session, don't create new one
    - Commit handled by caller (or use session.flush() + session.commit())
  </action>
  <verify>
    ```bash
    grep -q "async def bootstrap_admin_user" backend/src/openspc/core/auth/bootstrap.py
    grep -q "OPENSPC_ADMIN_USERNAME" backend/src/openspc/core/auth/bootstrap.py
    grep -q "OPENSPC_ADMIN_PASSWORD" backend/src/openspc/core/auth/bootstrap.py
    cd backend && python -c "from openspc.core.auth.bootstrap import bootstrap_admin_user; print('OK')"
    ```
  </verify>
  <done>
    - Bootstrap function creates admin user if none exist
    - Configurable via OPENSPC_ADMIN_USERNAME and OPENSPC_ADMIN_PASSWORD env vars
    - Assigns admin role for Default plant
    - Logs warning for default credentials
    - Idempotent (safe on every startup)
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] PyJWT and argon2-cffi installed and importable
- [ ] Password hashing works with argon2
- [ ] JWT tokens created and verified correctly
- [ ] Bootstrap function creates admin when no users exist
- [ ] Atomic commit created
