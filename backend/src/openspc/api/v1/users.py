"""User management REST API endpoints.

Admin-only endpoints for user CRUD operations and plant role assignment.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError

from openspc.api.deps import get_current_admin, get_user_repo
from openspc.api.schemas.user import (
    PlantRoleAssign,
    PlantRoleResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
    UserWithRolesResponse,
)
from openspc.core.auth.passwords import hash_password
from openspc.db.models.user import User, UserRole
from openspc.db.repositories.user import UserRepository

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
    data: UserCreate,
    current_user: User = Depends(get_current_admin),
    repo: UserRepository = Depends(get_user_repo),
) -> UserResponse:
    """Create a new user. Admin only."""
    hashed = hash_password(data.password)
    try:
        user = await repo.create(
            username=data.username,
            email=data.email,
            hashed_password=hashed,
        )
        return UserResponse.model_validate(user)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this username or email already exists",
        )


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
    user_id: int,
    data: UserUpdate,
    current_user: User = Depends(get_current_admin),
    repo: UserRepository = Depends(get_user_repo),
) -> UserResponse:
    """Update a user. Admin only."""
    update_data = data.model_dump(exclude_unset=True)

    # Hash password if provided
    if "password" in update_data and update_data["password"] is not None:
        update_data["hashed_password"] = hash_password(update_data.pop("password"))
    else:
        update_data.pop("password", None)

    if not update_data:
        user = await repo.get_by_id(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {user_id} not found",
            )
        return UserResponse.model_validate(user)

    try:
        user = await repo.update(user_id, **update_data)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {user_id} not found",
            )
        return UserResponse.model_validate(user)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this username or email already exists",
        )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
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


@router.post("/{user_id}/roles", response_model=UserWithRolesResponse)
async def assign_plant_role(
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

    await repo.assign_plant_role(user_id, data.plant_id, role)

    # Reload user with updated roles
    user = await repo.get_by_id(user_id)
    return _build_user_with_roles(user)  # type: ignore[arg-type]


@router.delete("/{user_id}/roles/{plant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_plant_role(
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

    success = await repo.remove_plant_role(user_id, plant_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No role assignment found for user {user_id} at plant {plant_id}",
        )
