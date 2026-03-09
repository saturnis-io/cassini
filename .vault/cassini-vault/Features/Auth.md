---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/Sprint 8 - SSO PWA ERP]]"
tags:
  - feature
  - active
aliases:
  - SSO
  - SSO OIDC
  - SSO/OIDC
---

# Auth

Authentication and authorization system with JWT access tokens (15-minute), httpOnly refresh cookies (7-day, path-scoped to `/api/v1/auth`), and a 4-tier role hierarchy (operator < supervisor < engineer < admin) scoped per-plant. Supports local password auth, SSO/OIDC (DB-backed state store, claim mapping, account linking, RP-initiated logout), and API key auth for bridge agents.

## Key Backend Components

- **JWT**: `core/auth/jwt.py` -- `create_access_token()`, `create_refresh_token()`, `verify_token()`
- **Passwords**: `core/auth/passwords.py` -- bcrypt hashing
- **API Key**: `core/auth/api_key.py` -- SHA-256 key verification for gage bridges
- **Bootstrap**: `core/auth/bootstrap.py` -- `create_default_admin()` on first startup
- **OIDC**: `core/oidc_service.py` -- `initiate_login()`, `handle_callback()`, claim mapping, account linking
- **Models**: `User`, `UserPlantRole` in `db/models/user.py`; `APIKey` in `db/models/api_key.py`; `OIDCConfig`, `OIDCState` in `db/models/oidc_*.py`
- **Routers**: `api/v1/auth.py`, `api/v1/users.py`, `api/v1/api_keys.py`, `api/v1/oidc.py`
- **Migrations**: 001 (user, user_plant_role), 031 (Part 11 user columns), 036 (OIDC hardening)

## Key Frontend Components

- `AuthProvider.tsx` -- token state management, auto-refresh
- `LoginPage.tsx` -- login form with SSO option
- `UserTable.tsx`, `UserFormDialog.tsx` -- user management (admin)
- `SSOSettings.tsx` -- OIDC provider configuration
- `AccountLinkingPanel.tsx` -- link local account to OIDC identity
- `ApiKeysSettings.tsx` -- API key management
- Token refresh: shared Promise queue in `api/client.ts` (never use boolean flag)

## Connections

- Guards all protected routes -- used by every other feature
- [[Electronic Signatures]] extends user model with password policy fields
- [[Connectivity]] gage bridges authenticate via API key
- Admin users auto-assigned to all plants on plant creation
- Frontend providers: PlantProvider, WebSocketProvider must be inside RequireAuth

## Known Limitations

- Token refresh uses shared Promise queue -- never use a boolean flag for concurrent 401 handling
- Refresh cookie path is `/api/v1/auth` -- other paths will not include it
- Admin bootstrap: admin users need ALL plants, auto-assigned on new plant creation
- OIDC state stored in DB (replaces in-memory dict) to prevent race conditions
- `localStorage` keys use `cassini-` prefix (migrated from `openspc-`)

See also: [[Lessons/Lessons Learned]]
