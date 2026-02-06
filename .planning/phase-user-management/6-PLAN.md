---
phase: user-management
plan: 6
type: execute
wave: 4
depends_on: [3, 5]
files_modified:
  - backend/src/openspc/api/v1/plants.py
  - backend/src/openspc/api/v1/characteristics.py
  - backend/src/openspc/api/v1/brokers.py
  - backend/src/openspc/api/v1/data_entry.py
  - backend/src/openspc/api/v1/violations.py
  - backend/src/openspc/api/v1/samples.py
  - backend/src/openspc/api/v1/hierarchy.py
  - backend/src/openspc/api/v1/characteristic_config.py
  - backend/src/openspc/api/v1/api_keys.py
  - backend/src/openspc/api/v1/providers.py
autonomous: true
must_haves:
  truths:
    - "All API endpoints require JWT authentication (except /health, /docs, /auth/*)"
    - "Write operations require appropriate role level"
    - "Data entry endpoints require at least operator role"
    - "Configuration endpoints require at least engineer role"
    - "Admin endpoints (plants, api-keys, settings) require admin role"
    - "Existing API key auth for data entry still works as alternative"
  artifacts:
    - "All router files in api/v1/ updated with auth dependencies"
    - "Role checks enforced on mutation endpoints"
  key_links:
    - "get_current_user dependency from deps.py used on all protected endpoints"
    - "require_role dependency used for role-gated operations"
    - "API key auth remains as alternative for data_entry (M2M automation)"
---

# Phase user-management - Plan 6: Role Enforcement and Integration

## Objective
Add JWT authentication and role-based authorization to all existing API endpoints, maintaining backward compatibility for API key authentication on data entry.

## Tasks

<task type="auto">
  <name>Task 1: Add Auth to Read Endpoints</name>
  <files>backend/src/openspc/api/v1/hierarchy.py, backend/src/openspc/api/v1/characteristics.py, backend/src/openspc/api/v1/samples.py, backend/src/openspc/api/v1/violations.py, backend/src/openspc/api/v1/providers.py</files>
  <action>
    For each of these routers, add `get_current_user` dependency to all endpoints:

    1. Import `get_current_user` from `openspc.api.deps`
    2. Import `User` model
    3. Add `current_user: User = Depends(get_current_user)` parameter to all endpoint functions

    This makes all read endpoints require authentication but no specific role (any authenticated user can read).

    Specific adjustments:
    - `hierarchy.py`: Both global and plant-scoped hierarchy endpoints need auth
    - `characteristics.py`: All endpoints need auth
    - `samples.py`: All endpoints need auth (GET operations)
    - `violations.py`: All endpoints need auth
    - `providers.py`: All endpoints need auth

    For violation acknowledgement (`POST /violations/{id}/acknowledge`):
    - Add role check: require_role("supervisor") since acknowledgement needs supervisor+

    For provider restart/refresh endpoints:
    - Add role check: require_role("engineer") or admin

    Constraints:
    - Import from deps.py, don't duplicate auth logic
    - Don't change endpoint signatures beyond adding the dependency
    - Don't change response schemas
    - Keep existing parameter names and types
  </action>
  <verify>
    ```bash
    grep -q "get_current_user" backend/src/openspc/api/v1/hierarchy.py
    grep -q "get_current_user" backend/src/openspc/api/v1/characteristics.py
    grep -q "get_current_user" backend/src/openspc/api/v1/samples.py
    grep -q "get_current_user" backend/src/openspc/api/v1/violations.py
    grep -q "get_current_user" backend/src/openspc/api/v1/providers.py
    ```
  </verify>
  <done>
    - All read endpoints require JWT authentication
    - Violation acknowledgement requires supervisor role
    - Provider management requires engineer role
    - No changes to response formats
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Auth to Write/Admin Endpoints</name>
  <files>backend/src/openspc/api/v1/plants.py, backend/src/openspc/api/v1/brokers.py, backend/src/openspc/api/v1/characteristic_config.py, backend/src/openspc/api/v1/api_keys.py</files>
  <action>
    For mutation-heavy routers, add role-based auth:

    `plants.py`:
    - GET / (list): get_current_user (any authenticated)
    - GET /{id}: get_current_user (any authenticated)
    - POST / (create): get_current_admin (admin only)
    - PUT /{id} (update): get_current_admin (admin only)
    - DELETE /{id}: get_current_admin (admin only)

    `brokers.py`:
    - GET / (list): get_current_user (any authenticated)
    - GET /{id}: get_current_user (any authenticated)
    - POST / (create): get_current_admin or engineer role
    - PATCH /{id}: get_current_admin or engineer role
    - DELETE /{id}: get_current_admin (admin only)
    - POST /{id}/activate: get_current_admin or engineer
    - GET /{id}/status: get_current_user (any)
    - POST /{id}/connect: get_current_admin or engineer
    - POST /disconnect: get_current_admin or engineer
    - POST /test: get_current_user (any, testing doesn't mutate)

    `characteristic_config.py`:
    - GET (read): get_current_user (any authenticated)
    - PUT (update): require engineer+ role

    `api_keys.py`:
    - All endpoints: get_current_admin (admin only, engineer for view)
    - GET / (list): engineer+ role
    - POST / (create): engineer+ role
    - PATCH /{id}: engineer+ role
    - DELETE /{id}: admin only
    - POST /{id}/revoke: admin only

    Constraints:
    - Use get_current_admin for admin-only endpoints
    - For engineer+ endpoints, create or reuse a `get_current_engineer` dependency
    - Keep existing endpoint logic unchanged, just add auth guard
  </action>
  <verify>
    ```bash
    grep -q "get_current_user\|get_current_admin" backend/src/openspc/api/v1/plants.py
    grep -q "get_current_user\|get_current_admin" backend/src/openspc/api/v1/brokers.py
    grep -q "get_current_user" backend/src/openspc/api/v1/characteristic_config.py
    grep -q "get_current_user\|get_current_admin" backend/src/openspc/api/v1/api_keys.py
    ```
  </verify>
  <done>
    - Plant CRUD: read=any, write=admin
    - Broker management: read=any, write=engineer+, delete=admin
    - Characteristic config: read=any, write=engineer+
    - API keys: read=engineer+, manage=engineer+, delete/revoke=admin
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Dual Auth to Data Entry and Characteristics Write</name>
  <files>backend/src/openspc/api/v1/data_entry.py, backend/src/openspc/api/v1/characteristics.py, backend/src/openspc/api/deps.py</files>
  <action>
    Add to `backend/src/openspc/api/deps.py`:

    1. Create `get_current_user_or_api_key` dependency:
       - Try JWT auth first (check for Authorization Bearer header)
       - If no Bearer token, fall back to API key auth (X-API-Key header)
       - If neither: raise 401
       - Return a union type or a simple "identity" object with the auth type

    Update `backend/src/openspc/api/v1/data_entry.py`:

    - Replace `verify_api_key` with `get_current_user_or_api_key`
    - This allows both JWT-authenticated users AND API keys to submit data
    - API key auth preserved for machine-to-machine data ingestion

    Update `backend/src/openspc/api/v1/characteristics.py`:

    - Read endpoints (GET): get_current_user (any authenticated)
    - Write endpoints (POST create, PATCH update, DELETE):
      - Require engineer+ role via get_current_user + role check
    - Recalculate limits (POST): require engineer+
    - Update rules (PUT): require engineer+
    - Change mode (POST): require engineer+

    Constraints:
    - Data entry must still work with API keys (backward compatibility critical)
    - JWT auth is the primary method for human users
    - API key auth is the alternative for automation/M2M
    - Don't require role checks for API key auth (API keys have their own permission model)
  </action>
  <verify>
    ```bash
    grep -q "get_current_user_or_api_key" backend/src/openspc/api/deps.py
    grep -q "get_current_user_or_api_key\|get_current_user" backend/src/openspc/api/v1/data_entry.py
    grep -q "get_current_user" backend/src/openspc/api/v1/characteristics.py
    cd backend && python -c "from openspc.api.deps import get_current_user_or_api_key; print('OK')"
    ```
  </verify>
  <done>
    - Data entry accepts both JWT and API key authentication
    - Characteristics write operations require engineer+ role
    - API key backward compatibility maintained
    - Dual auth dependency cleanly implemented
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All API endpoints require authentication
- [ ] Role-based access enforced on write operations
- [ ] Data entry works with both JWT and API key auth
- [ ] /health, /docs, and /auth/* remain public
- [ ] Existing API key auth preserved for data entry
- [ ] No changes to response formats
- [ ] Atomic commit created
