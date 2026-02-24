# Authentication & Authorization

## Data Flow
```
Login:
  LoginForm.tsx → POST /api/v1/auth/login { username, password, remember_me }
    → auth.py → verify_password() → create JWT access + refresh tokens
    → access_token in response body (15min), refresh_token in httpOnly cookie (7d or 30d)
    → AuditService.log_login() (fire-and-forget)

Token Refresh:
  client.ts → 401 response interceptor → shared promise queue
    → POST /api/v1/auth/refresh (reads refresh_token cookie)
    → verify_refresh_token() → create new access + refresh tokens (rotation)
    → cookie rotated, new access_token returned

User Management (admin-only):
  UserManagement.tsx → useUsers()
    → GET /api/v1/users/ (list all)
    → POST /api/v1/users/ (create)
    → PATCH /api/v1/users/{id} (update)
    → DELETE /api/v1/users/{id} (deactivate)
    → DELETE /api/v1/users/{id}/permanent (hard delete)
    → POST /api/v1/users/{id}/roles { plant_id, role } (assign plant role)
    → DELETE /api/v1/users/{id}/roles/{plant_id} (remove plant role)
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| User | db/models/user.py | id, username(unique), email(unique nullable), hashed_password, is_active, must_change_password, created_at, updated_at, full_name, password_changed_at, failed_login_count, locked_until, password_history, last_signature_auth_at; rels: plant_roles | 001+031 |
| UserPlantRole | db/models/user.py | id, user_id(FK CASCADE), plant_id(FK CASCADE), role(Enum: operator/supervisor/engineer/admin), created_at; UNIQUE: (user_id, plant_id) | 001 |
| UserRole | db/models/user.py | Enum: operator, supervisor, engineer, admin | - |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| POST | /api/v1/auth/login | body: LoginRequest | LoginResponse (access_token + user + must_change_password) | rate-limited |
| POST | /api/v1/auth/refresh | refresh_token cookie | TokenResponse | rate-limited (10/min) |
| POST | /api/v1/auth/logout | - | {message} | none (clears cookie) |
| GET | /api/v1/auth/me | - | UserWithRolesResponse | get_current_user |
| POST | /api/v1/auth/change-password | body: ChangePasswordRequest | {message} | get_current_user |
| GET | /api/v1/users/ | search, active_only | list[UserWithRolesResponse] | get_current_admin |
| POST | /api/v1/users/ | body: UserCreate | UserResponse (201) | get_current_admin |
| GET | /api/v1/users/{user_id} | - | UserWithRolesResponse | get_current_admin |
| PATCH | /api/v1/users/{user_id} | body: UserUpdate | UserResponse | get_current_admin |
| DELETE | /api/v1/users/{user_id} | - | 204 (deactivate) | get_current_admin |
| DELETE | /api/v1/users/{user_id}/permanent | - | 204 (hard delete) | get_current_admin |
| POST | /api/v1/users/{user_id}/roles | body: PlantRoleAssign | UserWithRolesResponse | get_current_admin |
| DELETE | /api/v1/users/{user_id}/roles/{plant_id} | - | 204 | get_current_admin |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| JWT | core/auth/jwt.py | create_access_token(), create_refresh_token(), verify_refresh_token() |
| Passwords | core/auth/passwords.py | hash_password(), verify_password() |
| Auth Dependencies | api/deps.py | get_current_user, get_current_engineer, get_current_admin, check_plant_role, resolve_plant_id_for_characteristic |

### Repositories
| Class | File | Key Methods |
|-------|------|-------------|
| UserRepository | db/repositories/user.py | get_by_id, get_by_username, get_all, create, update, deactivate, hard_delete, assign_plant_role, remove_plant_role, get_user_role_for_plant |

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| LoginForm | components/LoginForm.tsx | - | useLogin |
| UserManagement | components/UserManagement.tsx | - | useUsers, useCreateUser, useUpdateUser, useDeactivateUser, useAssignRole, useRemoveRole |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useLogin | authApi.login | POST /auth/login | - |
| useRefreshToken | authApi.refresh | POST /auth/refresh | - |
| useLogout | authApi.logout | POST /auth/logout | clears all queries |
| useCurrentUser | authApi.getMe | GET /auth/me | ['auth', 'me'] |
| useChangePassword | authApi.changePassword | POST /auth/change-password | - |
| useUsers | userApi.list | GET /users/ | ['users', 'list', params] |
| useCreateUser | userApi.create | POST /users/ | invalidates users.all |
| useUpdateUser | userApi.update | PATCH /users/{id} | invalidates users.all |
| useDeactivateUser | userApi.deactivate | DELETE /users/{id} | invalidates users.all |
| useDeleteUserPermanent | userApi.hardDelete | DELETE /users/{id}/permanent | invalidates users.all |
| useAssignRole | userApi.assignRole | POST /users/{id}/roles | invalidates users.all |
| useRemoveRole | userApi.removeRole | DELETE /users/{id}/roles/{plantId} | invalidates users.all |

### Stores (Zustand)
| Store | File | Key State |
|-------|------|-----------|
| useAuthStore | stores/authStore.ts | user, accessToken, isAuthenticated, login(), logout(), setToken() |
| useActivePlantId | stores/plantStore.ts | activePlantId — all plant-scoped queries read from this |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /login | LoginPage.tsx | LoginForm |
| /settings | SettingsView.tsx | UserManagement (admin tab) |

## Migrations
- 001 (initial): user, user_plant_role tables
- 031 (electronic_signatures): full_name, password_changed_at, failed_login_count, locked_until, password_history, last_signature_auth_at on user

## Known Issues / Gotchas
- Token refresh uses shared promise queue in client.ts to prevent concurrent 401 race conditions (never use a boolean flag)
- Refresh token cookie path is `/api/v1/auth` — must match exactly for cookie to be sent
- Login rate-limited by slowapi: configurable via OPENSPC_RATE_LIMIT_LOGIN setting
- Admin bootstrap: admin users need access to ALL plants; auto-assign admin role on new plant creation
- dev_mode setting suppresses must_change_password for convenience
- Cannot deactivate/delete your own admin account (self-protection guard)
- Hard delete requires user to be deactivated first (two-step deletion)
- 4-tier role hierarchy: operator < supervisor < engineer < admin, scoped per-plant via user_plant_role join table
