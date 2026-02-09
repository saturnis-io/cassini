"""Authentication REST API endpoints.

Provides login, token refresh, logout, and current user endpoints.
Uses JWT access tokens (in response body) and refresh tokens (in httpOnly cookies).
"""

from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.core.rate_limit import limiter

from openspc.api.deps import get_current_user, get_db_session, get_user_repo
from openspc.api.schemas.user import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    PlantRoleResponse,
    TokenResponse,
    UserWithRolesResponse,
)
from openspc.core.auth.jwt import create_access_token, create_refresh_token, verify_refresh_token
from openspc.core.auth.passwords import verify_password
from openspc.core.config import get_settings
from openspc.db.models.user import User
from openspc.db.repositories.user import UserRepository

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# Cookie configuration
COOKIE_SECURE = get_settings().cookie_secure
REFRESH_COOKIE_PATH = "/api/v1/auth"
REFRESH_COOKIE_KEY = "refresh_token"


def _build_user_response(user: User) -> UserWithRolesResponse:
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


@router.post("/login", response_model=LoginResponse)
@limiter.limit(get_settings().rate_limit_login)
async def login(
    request: Request,
    data: LoginRequest,
    response: Response,
    repo: UserRepository = Depends(get_user_repo),
) -> LoginResponse:
    """Authenticate with username and password.

    Returns a JWT access token in the response body and sets a
    refresh token as an httpOnly cookie.
    """
    user = await repo.get_by_username(data.username)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Create tokens
    access_token = create_access_token(user.id, user.username)
    refresh_token = create_refresh_token(user.id)

    # Set refresh token cookie
    max_age = 30 * 24 * 60 * 60 if data.remember_me else 7 * 24 * 60 * 60  # 30d or 7d
    response.set_cookie(
        key=REFRESH_COOKIE_KEY,
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=max_age,
        path=REFRESH_COOKIE_PATH,
    )

    user_response = _build_user_response(user)

    # In dev mode, suppress forced password change for convenience
    cfg = get_settings()
    must_change = user.must_change_password if not cfg.dev_mode else False

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response,
        must_change_password=must_change,
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    """Get a new access token using the refresh token cookie.

    Also rotates the refresh token for security.
    """
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
        )

    payload = verify_refresh_token(refresh_token)
    if payload is None:
        # Clear invalid cookie
        response.delete_cookie(
            key=REFRESH_COOKIE_KEY,
            path=REFRESH_COOKIE_PATH,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_id = int(payload["sub"])
    repo = UserRepository(session)
    user = await repo.get_by_id(user_id)

    if user is None or not user.is_active:
        response.delete_cookie(
            key=REFRESH_COOKIE_KEY,
            path=REFRESH_COOKIE_PATH,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Create new tokens (rotate refresh)
    new_access_token = create_access_token(user.id, user.username)
    new_refresh_token = create_refresh_token(user.id)

    response.set_cookie(
        key=REFRESH_COOKIE_KEY,
        value=new_refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path=REFRESH_COOKIE_PATH,
    )

    return TokenResponse(
        access_token=new_access_token,
        token_type="bearer",
    )


@router.post("/logout")
async def logout(response: Response) -> dict:
    """Clear the refresh token cookie."""
    response.delete_cookie(
        key=REFRESH_COOKIE_KEY,
        path=REFRESH_COOKIE_PATH,
    )
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserWithRolesResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserWithRolesResponse:
    """Get the current authenticated user with all plant roles."""
    return _build_user_response(current_user)


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Change the current user's password.

    Verifies the current password, then updates to the new password
    and clears the must_change_password flag.
    """
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if data.current_password == data.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    from openspc.core.auth.passwords import hash_password
    current_user.hashed_password = hash_password(data.new_password)
    current_user.must_change_password = False
    await session.commit()

    return {"message": "Password changed successfully"}
