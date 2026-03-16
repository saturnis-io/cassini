"""User management REST API endpoints.

Admin-only endpoints for user CRUD operations and plant role assignment.
"""

import structlog

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_admin, get_db_session, get_user_repo, invalidate_user_cache
from cassini.api.schemas.user import (
    PlantRoleAssign,
    PlantRoleResponse,
    RolesLockUpdate,
    UserCreate,
    UserResponse,
    UserUpdate,
    UserWithRolesResponse,
)
from cassini.core.auth.passwords import hash_password
from cassini.core.auth.policy import (
    check_password_history,
    enforce_password_complexity,
    load_password_policy,
    update_password_history,
)
from cassini.db.models.user import User, UserRole
from cassini.db.repositories.user import UserRepository

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _build_user_with_roles(user: User) -> UserWithRolesResponse:
    """Build a user response with plant roles."""
    plant_roles = []
    for pr in user.plant_roles:
        plant_roles.append(PlantRoleResponse(
            plant_id=pr.plant_id,
            plant_name=pr.plant.name if pr.plant else "",
            plant_code=pr.plant.code if pr.plant else "",
            role=pr.role.value,
        ))

    return UserWithRolesResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        roles_locked=user.roles_locked,
        created_at=user.created_at,
        updated_at=user.updated_at,
        plant_roles=plant_roles,
    )


@router.get("/", response_model=list[UserWithRolesResponse])
async def list_users(
    search: str = Query(None, description="Search by username or email"),
    active_only: bool = Query(False, description="Only return active users"),
    current_user: User = Depends(get_current_admin),
    repo: UserRepository = Depends(get_user_repo),
) -> list[UserWithRolesResponse]:
    """List all users with optional filters. Admin only."""
    users = await repo.get_all(active_only=active_only, search=search)
    return [_build_user_with_roles(u) for u in users]


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    request: Request,
    data: UserCreate,
    current_user: User = Depends(get_current_admin),
    repo: UserRepository = Depends(get_user_repo),
    session: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    """Create a new user. Admin only."""
    # Username recycling protection — prevent reuse of deactivated usernames
    existing_deactivated = await session.execute(
        select(User).where(User.username == data.username, User.is_active == False)  # noqa: E712
    )
    if existing_deactivated.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A deactivated user with this username exists. "
                   "Choose a different username or reactivate the existing account.",
        )

    # Enforce password policy complexity rules
    policy = await load_password_policy(session)
    enforce_password_complexity(data.password, policy)

    hashed = hash_password(data.password)
    try:
        user = await repo.create(
            username=data.username,
            email=data.email,
            hashed_password=hashed,
        )
        # Seed password history so the initial password is tracked
        update_password_history(hashed, user, policy)

        request.state.audit_context = {
            "resource_type": "user",
            "resource_id": user.id,
            "action": "create",
            "summary": f"User '{data.username}' created",
            "fields": {
                "username": data.username,
                "email": data.email,
            },
        }
        return UserResponse.model_validate(user)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this username or email already exists",
        )


@router.post("/{user_id}/unlock")
async def unlock_user_account(
    request: Request,
    user_id: int,
    session: AsyncSession = Depends(get_db_session),
    admin: User = Depends(get_current_admin),
):
    """Admin unlocks a locked-out user account."""
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    user.locked_until = None
    user.failed_login_count = 0
    await session.commit()

    request.state.audit_context = {
        "resource_type": "user",
        "resource_id": user_id,
        "action": "unlock",
        "summary": f"User '{user.username}' unlocked by '{admin.username}'",
        "fields": {
            "target_username": user.username,
            "unlocked_by": admin.username,
        },
    }

    return {"status": "unlocked", "user_id": user_id}


@router.get("/{user_id}", response_model=UserWithRolesResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(get_current_admin),
    repo: UserRepository = Depends(get_user_repo),
) -> UserWithRolesResponse:
    """Get a user by ID with plant roles. Admin only."""
    user = await repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )
    return _build_user_with_roles(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    request: Request,
    user_id: int,
    data: UserUpdate,
    current_user: User = Depends(get_current_admin),
    repo: UserRepository = Depends(get_user_repo),
    session: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    """Update a user. Admin only."""
    update_data = data.model_dump(exclude_unset=True)

    # Capture old values before mutation for audit trail
    old_user = await repo.get_by_id(user_id)
    if old_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )
    old_values = {
        "username": old_user.username,
        "email": old_user.email,
        "is_active": old_user.is_active,
    }

    # Hash password if provided
    password_changed = "password" in update_data and update_data["password"] is not None
    if password_changed:
        raw_password = update_data.pop("password")

        # Enforce password policy complexity rules
        policy = await load_password_policy(session)
        enforce_password_complexity(raw_password, policy)

        # Check password history for the target user
        check_password_history(raw_password, old_user, policy)

        old_hash = old_user.hashed_password
        update_data["hashed_password"] = hash_password(raw_password)

        # Update password history with the old hash
        update_password_history(old_hash, old_user, policy)
    else:
        update_data.pop("password", None)

    if not update_data:
        return UserResponse.model_validate(old_user)

    try:
        user = await repo.update(user_id, **update_data)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {user_id} not found",
            )

        invalidate_user_cache(user_id)

        # Build audit fields — only include changed fields
        audit_fields: dict = {}
        for field in ("username", "email", "is_active"):
            if field in update_data and update_data[field] != old_values.get(field):
                audit_fields[f"old_{field}"] = old_values[field]
                audit_fields[f"new_{field}"] = update_data[field]
        if password_changed:
            audit_fields["password_changed"] = True

        request.state.audit_context = {
            "resource_type": "user",
            "resource_id": user_id,
            "action": "update",
            "summary": f"User '{user.username}' updated by '{current_user.username}'",
            "fields": audit_fields,
        }

        return UserResponse.model_validate(user)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this username or email already exists",
        )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def deactivate_user(
    request: Request,
    user_id: int,
    current_user: User = Depends(get_current_admin),
    repo: UserRepository = Depends(get_user_repo),
) -> None:
    """Deactivate a user (soft delete). Admin only.

    Cannot deactivate yourself.
    """
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    user = await repo.deactivate(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )

    invalidate_user_cache(user_id)

    request.state.audit_context = {
        "resource_type": "user",
        "resource_id": user_id,
        "action": "delete",
        "summary": f"User '{user.username}' deactivated",
        "fields": {
            "target_username": user.username,
            "deactivated_by": current_user.username,
        },
    }


@router.delete("/{user_id}/permanent", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_user_permanent(
    request: Request,
    user_id: int,
    current_user: User = Depends(get_current_admin),
    repo: UserRepository = Depends(get_user_repo),
) -> None:
    """Permanently delete a deactivated user. Admin only.

    The user must be deactivated first. Cannot delete yourself.
    This removes the user record and frees the username for reuse.

    Users with electronic signatures cannot be permanently deleted --
    they must be deactivated instead to preserve signature attribution.
    """
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    # Capture username before permanent deletion
    target_user = await repo.get_by_id(user_id)

    # Check for electronic signatures -- user deletion would destroy
    # signature attribution required for 21 CFR Part 11 compliance
    signature_count = await repo.count_user_signatures(user_id)
    if signature_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot permanently delete user with {signature_count} electronic "
                f"signature(s). Deactivate the user instead (set is_active=False) "
                f"to preserve signature attribution for regulatory compliance."
            ),
        )

    try:
        success = await repo.hard_delete(user_id)
    except ValueError:
        logger.warning("user_deletion_rejected", user_id=user_id, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete this user",
        )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )

    invalidate_user_cache(user_id)

    request.state.audit_context = {
        "resource_type": "user",
        "resource_id": user_id,
        "action": "delete",
        "summary": f"User '{target_user.username if target_user else user_id}' permanently deleted",
        "fields": {
            "target_username": target_user.username if target_user else str(user_id),
            "deleted_by": current_user.username,
            "permanent": True,
        },
    }


@router.patch("/{user_id}/roles-lock", response_model=UserResponse)
async def toggle_roles_lock(
    request: Request,
    user_id: int,
    data: RolesLockUpdate,
    current_user: User = Depends(get_current_admin),
    repo: UserRepository = Depends(get_user_repo),
) -> UserResponse:
    """Toggle the SSO role lock for a user. Admin only.

    When locked, SSO login will not overwrite the user's manually-assigned roles.
    """
    user = await repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )

    old_value = user.roles_locked
    user.roles_locked = data.locked
    await repo.session.flush()
    await repo.session.refresh(user)

    invalidate_user_cache(user_id)

    request.state.audit_context = {
        "resource_type": "user",
        "resource_id": user_id,
        "action": "lock_roles" if data.locked else "unlock_roles",
        "summary": f"SSO role lock {'enabled' if data.locked else 'disabled'} for '{user.username}'",
        "fields": {
            "target_username": user.username,
            "old_roles_locked": old_value,
            "new_roles_locked": data.locked,
            "changed_by": current_user.username,
        },
    }

    return UserResponse.model_validate(user)


@router.post("/{user_id}/roles", response_model=UserWithRolesResponse)
async def assign_plant_role(
    request: Request,
    user_id: int,
    data: PlantRoleAssign,
    current_user: User = Depends(get_current_admin),
    repo: UserRepository = Depends(get_user_repo),
) -> UserWithRolesResponse:
    """Assign or update a user's role at a plant. Admin only."""
    # Validate the user exists
    user = await repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )

    # Validate role value
    try:
        role = UserRole(data.role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {data.role}. Must be one of: operator, supervisor, engineer, admin",
        )

    target_username = user.username
    await repo.assign_plant_role(user_id, data.plant_id, role)

    invalidate_user_cache(user_id)

    request.state.audit_context = {
        "resource_type": "user",
        "resource_id": user_id,
        "action": "update",
        "summary": f"Role '{data.role}' assigned to '{target_username}' at plant #{data.plant_id}",
        "fields": {
            "target_username": target_username,
            "role": data.role,
            "plant_id": data.plant_id,
            "assigned_by": current_user.username,
            "change_reason": data.change_reason,
        },
    }

    # Reload user with updated roles
    user = await repo.get_by_id(user_id)
    return _build_user_with_roles(user)  # type: ignore[arg-type]


@router.delete("/{user_id}/roles/{plant_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_plant_role(
    request: Request,
    user_id: int,
    plant_id: int,
    current_user: User = Depends(get_current_admin),
    repo: UserRepository = Depends(get_user_repo),
) -> None:
    """Remove a user's role at a plant. Admin only.

    Cannot remove your own admin role.
    """
    if current_user.id == user_id:
        # Check if this would remove the current user's admin role
        role = await repo.get_user_role_for_plant(user_id, plant_id)
        if role == UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove your own admin role",
            )

    # Load target user for audit context
    target_user = await repo.get_by_id(user_id)

    success = await repo.remove_plant_role(user_id, plant_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No role assignment found for user {user_id} at plant {plant_id}",
        )

    invalidate_user_cache(user_id)

    request.state.audit_context = {
        "resource_type": "user",
        "resource_id": user_id,
        "action": "delete",
        "summary": f"Role revoked from '{target_user.username}' at plant #{plant_id}" if target_user else f"Role revoked from user #{user_id} at plant #{plant_id}",
        "fields": {
            "target_username": target_user.username if target_user else str(user_id),
            "plant_id": plant_id,
            "revoked_by": current_user.username,
        },
    }
