---
phase: user-management
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/openspc/db/models/user.py
  - backend/src/openspc/db/models/__init__.py
  - backend/src/openspc/db/repositories/user.py
  - backend/src/openspc/db/repositories/__init__.py
  - backend/src/openspc/api/schemas/user.py
  - backend/alembic/versions/20260208_add_user_tables.py
autonomous: true
must_haves:
  truths:
    - "Database has user table with id, username, email, hashed_password, is_active, timestamps"
    - "Database has user_plant_role join table with user_id, plant_id, role enum"
    - "Migration creates tables and runs successfully"
  artifacts:
    - "backend/src/openspc/db/models/user.py exists with User and UserPlantRole models"
    - "backend/src/openspc/db/repositories/user.py exists with UserRepository"
    - "backend/src/openspc/api/schemas/user.py exists with Pydantic schemas"
    - "backend/alembic/versions/20260208_add_user_tables.py migration runs"
  key_links:
    - "UserPlantRole.user_id references User.id"
    - "UserPlantRole.plant_id references Plant.id"
    - "Role enum matches frontend roles.ts: operator, supervisor, engineer, admin"
---

# Phase user-management - Plan 1: Database Foundation

## Objective
Create User and UserPlantRole database models, repository, Pydantic schemas, and Alembic migration for the user management data layer.

## Tasks

<task type="auto">
  <name>Task 1: Create User and UserPlantRole Models</name>
  <files>backend/src/openspc/db/models/user.py, backend/src/openspc/db/models/__init__.py</files>
  <action>
    Create `backend/src/openspc/db/models/user.py`:

    1. Import Base from hierarchy.py (existing pattern)
    2. Define `UserRole` enum (Python enum.Enum + SQLAlchemy):
       - Values: `operator`, `supervisor`, `engineer`, `admin`
    3. Define `User` model:
       - id: Mapped[int] primary key, autoincrement
       - username: Mapped[str] String(50), unique, not null
       - email: Mapped[Optional[str]] String(255), unique, nullable
       - hashed_password: Mapped[str] String(255), not null
       - is_active: Mapped[bool] default True
       - created_at: Mapped[datetime] server_default=func.now()
       - updated_at: Mapped[datetime] server_default=func.now(), onupdate=func.now()
       - Relationship: plant_roles -> list[UserPlantRole]
    4. Define `UserPlantRole` model:
       - id: Mapped[int] primary key, autoincrement
       - user_id: Mapped[int] ForeignKey("user.id", ondelete="CASCADE"), not null
       - plant_id: Mapped[int] ForeignKey("plant.id", ondelete="CASCADE"), not null
       - role: Mapped[UserRole] Enum(UserRole), not null, default=UserRole.operator
       - Unique constraint on (user_id, plant_id) to prevent duplicate assignments
       - Relationships: user -> User, plant -> Plant

    Update `backend/src/openspc/db/models/__init__.py`:
    - Import and export User, UserPlantRole, UserRole

    Follow existing model patterns in `plant.py` and `broker.py`.

    Constraints:
    - Use SQLAlchemy 2.0 Mapped[] column style (not legacy Column())
    - Use `from __future__ import annotations` for forward refs
    - Keep role enum values lowercase to match frontend `roles.ts`
  </action>
  <verify>
    ```bash
    grep -q "class User" backend/src/openspc/db/models/user.py
    grep -q "class UserPlantRole" backend/src/openspc/db/models/user.py
    grep -q "class UserRole" backend/src/openspc/db/models/user.py
    grep -q "User" backend/src/openspc/db/models/__init__.py
    cd backend && python -c "from openspc.db.models.user import User, UserPlantRole, UserRole; print('OK')"
    ```
  </verify>
  <done>
    - User model with username, email, hashed_password, is_active, timestamps
    - UserPlantRole join model with user_id, plant_id, role
    - UserRole enum with operator, supervisor, engineer, admin
    - Models exported from __init__.py
  </done>
</task>

<task type="auto">
  <name>Task 2: Create User Repository and Pydantic Schemas</name>
  <files>backend/src/openspc/db/repositories/user.py, backend/src/openspc/db/repositories/__init__.py, backend/src/openspc/api/schemas/user.py</files>
  <action>
    Create `backend/src/openspc/db/repositories/user.py`:

    1. UserRepository class with AsyncSession (follow PlantRepository pattern)
    2. Methods:
       - get_by_id(user_id) -> Optional[User] (eager load plant_roles)
       - get_by_username(username) -> Optional[User] (for login lookup)
       - get_all(active_only, offset, limit) -> list[User]
       - create(username, email, hashed_password) -> User
       - update(user_id, **kwargs) -> Optional[User]
       - deactivate(user_id) -> Optional[User] (soft delete: set is_active=False)
       - count() -> int
       - assign_plant_role(user_id, plant_id, role) -> UserPlantRole
       - remove_plant_role(user_id, plant_id) -> bool
       - get_user_role_for_plant(user_id, plant_id) -> Optional[UserRole]
       - get_users_for_plant(plant_id) -> list[User]

    Use selectinload for plant_roles relationship to avoid N+1 queries.

    Update `backend/src/openspc/db/repositories/__init__.py`:
    - Import and export UserRepository

    Create `backend/src/openspc/api/schemas/user.py`:

    1. UserCreate: username (str, 3-50 chars), email (Optional[EmailStr]), password (str, 8+ chars)
    2. UserUpdate: username (Optional), email (Optional), password (Optional), is_active (Optional)
    3. UserResponse: id, username, email, is_active, created_at, updated_at, plant_roles (list)
    4. PlantRoleResponse: plant_id, plant_name, plant_code, role
    5. PlantRoleAssign: plant_id (int), role (str enum: operator/supervisor/engineer/admin)
    6. UserWithRolesResponse: extends UserResponse with plant_roles list

    Follow existing schema patterns in `schemas/plant.py`.

    Constraints:
    - Never return hashed_password in any response schema
    - Use `model_config = {"from_attributes": True}` on response schemas
  </action>
  <verify>
    ```bash
    grep -q "class UserRepository" backend/src/openspc/db/repositories/user.py
    grep -q "class UserCreate" backend/src/openspc/api/schemas/user.py
    grep -q "class UserResponse" backend/src/openspc/api/schemas/user.py
    cd backend && python -c "from openspc.db.repositories.user import UserRepository; print('OK')"
    cd backend && python -c "from openspc.api.schemas.user import UserCreate, UserResponse; print('OK')"
    ```
  </verify>
  <done>
    - UserRepository with full CRUD + plant role management
    - Pydantic schemas for create, update, response, plant role assignment
    - No password leakage in response schemas
  </done>
</task>

<task type="auto">
  <name>Task 3: Create Alembic Migration for User Tables</name>
  <files>backend/alembic/versions/20260208_add_user_tables.py</files>
  <action>
    Create Alembic migration `backend/alembic/versions/20260208_add_user_tables.py`:

    1. Revision ID: 009
    2. Down revision: 008 (20260207_add_plant)
    3. Create `user` table:
       - id INTEGER PRIMARY KEY AUTOINCREMENT
       - username VARCHAR(50) NOT NULL UNIQUE
       - email VARCHAR(255) UNIQUE NULLABLE
       - hashed_password VARCHAR(255) NOT NULL
       - is_active BOOLEAN NOT NULL DEFAULT true
       - created_at DATETIME(timezone=True) DEFAULT now()
       - updated_at DATETIME(timezone=True) DEFAULT now()
    4. Create `user_plant_role` table:
       - id INTEGER PRIMARY KEY AUTOINCREMENT
       - user_id INTEGER NOT NULL FK -> user.id ON DELETE CASCADE
       - plant_id INTEGER NOT NULL FK -> plant.id ON DELETE CASCADE
       - role VARCHAR(20) NOT NULL DEFAULT 'operator'
       - UNIQUE constraint on (user_id, plant_id)
    5. Create index on user_plant_role(user_id) and user_plant_role(plant_id)

    Downgrade: drop user_plant_role then user tables.

    Follow existing migration pattern from `20260207_add_plant.py`.
  </action>
  <verify>
    ```bash
    test -f backend/alembic/versions/20260208_add_user_tables.py && echo "File exists"
    cd backend && alembic upgrade head
    cd backend && python -c "
    import sqlite3
    conn = sqlite3.connect('openspc.db')
    tables = conn.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user', 'user_plant_role')\").fetchall()
    print(f'Tables: {[t[0] for t in tables]}')
    conn.close()
    "
    ```
  </verify>
  <done>
    - Migration file creates user and user_plant_role tables
    - Foreign keys to plant table established
    - Unique constraint on (user_id, plant_id)
    - Migration runs successfully with alembic upgrade head
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] User and UserPlantRole models exist with all fields
- [ ] UserRepository provides full CRUD + plant role operations
- [ ] Pydantic schemas defined (no password in responses)
- [ ] Migration runs successfully
- [ ] Atomic commit created
