# Phase user-management: Research

## Codebase Analysis

### Backend Architecture
- **Framework**: FastAPI with async SQLAlchemy (aiosqlite for SQLite)
- **ORM**: SQLAlchemy 2.0 with Mapped columns, declarative base
- **Migrations**: Alembic with sequential numbering (001-008). Latest: `20260207_add_plant.py` (revision 008, revises 007)
- **Auth today**: API key auth only (`core/auth/api_key.py`) using bcrypt for key hashing. No user model, no JWT.
- **Dependencies**: `bcrypt>=4.0.0` already present. Need to add `PyJWT` and `argon2-cffi`.
- **Repository pattern**: `BaseRepository` generic class + model-specific repos (e.g., `PlantRepository`). Repos take `AsyncSession` in constructor.
- **Dependency injection**: `api/deps.py` provides `get_db_session()`, `get_*_repo()` factory functions used as FastAPI `Depends`.
- **Router pattern**: Each domain has a router in `api/v1/`, registered in `main.py` with prefix.
- **Schema pattern**: Pydantic v2 models in `api/schemas/` (Create, Update, Response pattern).
- **Lifespan**: `main.py` lifespan handler initializes DB, WebSocket, MQTT, event bus.

### Frontend Architecture
- **Framework**: React + TypeScript + Vite
- **State**: Zustand (`uiStore.ts`) with `persist` middleware for localStorage
- **API client**: `api/client.ts` with `fetchApi<T>()` wrapper around fetch. No auth headers currently.
- **Auth today**: Mock `AuthProvider` with hardcoded `MOCK_USER`, role from `uiStore.currentRole`
- **Roles**: `lib/roles.ts` defines `Role` type (`operator|supervisor|engineer|admin`), hierarchy, view/action permissions
- **Protected routes**: `ProtectedRoute` component checks `hasAccess(role, requiredRole)` and redirects
- **Plant context**: `PlantProvider` fetches plants from API, stores selected in `uiStore.selectedPlantId`
- **Routing**: React Router v6 with `Layout` wrapper. Routes: dashboard, data-entry, violations, reports, configuration, settings, kiosk, wall-dashboard
- **Provider order**: ThemeProvider > QueryClientProvider > PlantProvider > AuthProvider > ChartHoverProvider > WebSocketProvider > BrowserRouter

### Existing Models (Backend)
- `Plant`: id, name, code, is_active, settings, timestamps. Relationships: hierarchies, brokers
- `Hierarchy`: has plant_id FK
- `MQTTBroker`: has plant_id FK
- `APIKey`: key_hash, is_active, expires_at, last_used_at
- `Characteristic`, `Sample`, `Measurement`, `Violation`, `CharacteristicRule`

### Key Patterns to Follow
1. **Model**: Define in `db/models/`, import in `__init__.py`
2. **Repository**: Class in `db/repositories/`, takes AsyncSession
3. **Schema**: Pydantic models in `api/schemas/` (Create, Update, Response)
4. **Router**: In `api/v1/`, register in `main.py`
5. **Migration**: Alembic file in `alembic/versions/`
6. **Frontend API**: Add to `api/client.ts`, add hooks in `api/hooks.ts`
7. **Provider**: Context + Provider component + useX hook

### CORS Configuration
- `allow_credentials=True` already set (needed for httpOnly cookies)
- Origins: localhost:5173, 5174, 5175, 3000

### What Needs to Change

#### Backend
1. New models: `User`, `UserPlantRole` (join table)
2. New auth module: JWT token creation/verification, password hashing (argon2)
3. New endpoints: `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`, `/api/v1/users` CRUD
4. New middleware: JWT verification dependency (like `verify_api_key` but for JWT)
5. Role enforcement: Dependency that checks user role for current plant
6. Bootstrap: Create admin user on startup if no users exist
7. Dependencies: Add `PyJWT`, `argon2-cffi` to pyproject.toml

#### Frontend
1. Replace mock AuthProvider with real one (access token in memory, refresh via cookie)
2. Add auth interceptor to fetchApi (Bearer token, 401 -> refresh flow)
3. New Login page component
4. New /admin/users page
5. Update ProtectedRoute to redirect to /login when unauthenticated
6. Role derived from user's assignment for selected plant
7. Update provider order: Auth must wrap Plant (need to be authenticated to fetch plants)
