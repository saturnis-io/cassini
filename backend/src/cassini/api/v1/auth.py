"""Authentication REST API endpoints.

Provides login, token refresh, logout, and current user endpoints.
Uses JWT access tokens (in response body) and refresh tokens (in httpOnly cookies).
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import structlog
from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.rate_limit import limiter

from cassini.api.deps import get_current_user, get_db_session, get_user_repo, invalidate_user_cache
from cassini.api.schemas.auth import (
    ForgotPasswordRequest,
    ResetPasswordRequest,
    UpdateProfileRequest,
    UpdateProfileResponse,
)
from cassini.api.schemas.user import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    PlantRoleResponse,
    TokenResponse,
    UserWithRolesResponse,
)
from cassini.core.auth.jwt import create_access_token, create_refresh_token, verify_refresh_token
from cassini.core.auth.passwords import verify_password
from cassini.core.config import get_settings
from cassini.db.models.auth_token import EmailVerificationToken, PasswordResetToken
from cassini.db.models.notification import SmtpConfig
from cassini.db.models.signature import PasswordPolicy
from cassini.db.models.user import User
from cassini.db.repositories.user import UserRepository

logger = structlog.get_logger(__name__)

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
        full_name=user.full_name,
        pending_email=user.pending_email,
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
    session: AsyncSession = Depends(get_db_session),
) -> LoginResponse:
    """Authenticate with username and password.

    Returns a JWT access token in the response body and sets a
    refresh token as an httpOnly cookie.
    """
    # Helper to get audit service (if initialized)
    audit_service = getattr(request.app.state, "audit_service", None)
    ip = _get_client_ip(request)
    ua = (request.headers.get("user-agent") or "")[:512]

    user = await repo.get_by_username(data.username)
    if user is None or not user.is_active:
        if audit_service:
            await audit_service.log_login(data.username, success=False, ip_address=ip, user_agent=ua)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Load password policy (at most one per plant, pick first match via any plant)
    policy_stmt = select(PasswordPolicy).limit(1)
    policy_result = await session.execute(policy_stmt)
    policy = policy_result.scalar_one_or_none()

    # Check account lockout
    now = datetime.now(timezone.utc)
    if user.locked_until and user.locked_until > now:
        raise HTTPException(
            status_code=423,
            detail="Account locked",
        )

    if not verify_password(data.password, user.hashed_password):
        # Increment failed login count and potentially lock
        user.failed_login_count = (user.failed_login_count or 0) + 1
        if (
            policy
            and policy.max_failed_attempts > 0
            and user.failed_login_count >= policy.max_failed_attempts
        ):
            user.locked_until = now + timedelta(minutes=policy.lockout_duration_minutes)
        await session.flush()

        if audit_service:
            await audit_service.log_login(data.username, success=False, ip_address=ip, user_agent=ua)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Successful login — reset failed count
    user.failed_login_count = 0
    if user.locked_until:
        user.locked_until = None
    await session.flush()

    # Log successful login
    if audit_service:
        await audit_service.log_login(
            data.username, success=True, ip_address=ip, user_agent=ua, user_id=user.id
        )

    # Create tokens (embed password_changed_at for revocation)
    access_token = create_access_token(user.id, user.username, user.password_changed_at)
    refresh_token = create_refresh_token(user.id, user.password_changed_at)

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
    if cfg.dev_mode and cfg.cookie_secure:
        logger.critical("dev_mode_with_cookie_secure", msg="dev_mode enabled with cookie_secure=True — this is unsafe for production")
    must_change = user.must_change_password if not cfg.dev_mode else False

    # Check password expiry
    if (
        not cfg.dev_mode
        and policy
        and policy.password_expiry_days > 0
        and user.password_changed_at
    ):
        expiry_date = user.password_changed_at + timedelta(days=policy.password_expiry_days)
        if now > expiry_date:
            must_change = True

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

    # JWT revocation: reject refresh tokens issued before last password change
    pwd_changed_claim = payload.get("pwd_changed")
    if user.password_changed_at and pwd_changed_claim is not None:
        user_pwd_epoch = int(user.password_changed_at.timestamp())
        if pwd_changed_claim < user_pwd_epoch:
            response.delete_cookie(
                key=REFRESH_COOKIE_KEY,
                path=REFRESH_COOKIE_PATH,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalidated by password change",
            )

    # Create new tokens (rotate refresh)
    new_access_token = create_access_token(user.id, user.username, user.password_changed_at)
    new_refresh_token = create_refresh_token(user.id, user.password_changed_at)

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
async def logout(
    request: Request,
    response: Response,
    oidc_provider_id: Optional[int] = Query(None, description="OIDC provider ID for RP-initiated logout"),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Clear the refresh token cookie. Optionally return OIDC logout URL."""
    response.delete_cookie(
        key=REFRESH_COOKIE_KEY,
        path=REFRESH_COOKIE_PATH,
    )
    # Audit log the logout
    audit_service = getattr(request.app.state, "audit_service", None)
    if audit_service:
        from cassini.core.audit import _extract_user_from_request
        user_id, username = _extract_user_from_request(request)
        await audit_service.log(
            action="logout",
            user_id=user_id,
            username=username,
            ip_address=_get_client_ip(request),
        )

    result = {"message": "Logged out successfully"}

    # If OIDC provider specified, get IdP logout URL
    if oidc_provider_id is not None:
        from cassini.core.oidc_service import OIDCService
        service = OIDCService(session)
        logout_url = await service.initiate_logout(oidc_provider_id)
        if logout_url:
            result["oidc_logout_url"] = logout_url

    return result


@router.get("/me", response_model=UserWithRolesResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserWithRolesResponse:
    """Get the current authenticated user with all plant roles."""
    return _build_user_response(current_user)


@router.post("/change-password")
@limiter.limit("5/minute")
async def change_password(
    request: Request,
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

    from cassini.core.auth.passwords import hash_password
    current_user.hashed_password = hash_password(data.new_password)
    current_user.must_change_password = False
    current_user.password_changed_at = datetime.now(timezone.utc)
    await session.commit()

    invalidate_user_cache(current_user.id)

    request.state.audit_context = {
        "resource_type": "auth",
        "resource_id": current_user.id,
        "action": "update",
        "summary": f"User '{current_user.username}' changed their password",
        "fields": {"action_type": "password_changed"},
    }

    return {"message": "Password changed successfully"}


# ---------------------------------------------------------------------------
# Standalone email helper (used by forgot-password, verify-email flows)
# ---------------------------------------------------------------------------

async def _send_auth_email(
    recipient: str,
    subject: str,
    body: str,
    session: AsyncSession,
) -> bool:
    """Send a transactional email using the active SMTP config.

    Returns True if the email was sent successfully, False otherwise.
    Does NOT raise on failure — auth flows must always return success
    to prevent user enumeration.
    """
    try:
        smtp_result = await session.execute(
            select(SmtpConfig).where(SmtpConfig.is_active == True)  # noqa: E712
        )
        smtp_config = smtp_result.scalar_one_or_none()
        if not smtp_config:
            logger.debug("auth_email_skip_no_smtp", recipient=recipient)
            return False

        import aiosmtplib
        from cassini.db.dialects import decrypt_password, get_encryption_key

        # Decrypt credentials
        decrypted_username = None
        decrypted_password = None
        if smtp_config.username:
            try:
                key = get_encryption_key()
                decrypted_username = decrypt_password(smtp_config.username, key)
            except Exception:
                decrypted_username = smtp_config.username
        if smtp_config.password:
            try:
                key = get_encryption_key()
                decrypted_password = decrypt_password(smtp_config.password, key)
            except Exception:
                decrypted_password = smtp_config.password

        msg = MIMEMultipart()
        msg["From"] = smtp_config.from_address
        msg["To"] = recipient
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        await aiosmtplib.send(
            msg,
            hostname=smtp_config.server,
            port=smtp_config.port,
            username=decrypted_username,
            password=decrypted_password,
            start_tls=smtp_config.use_tls,
        )
        logger.debug("auth_email_sent", recipient=recipient, subject=subject)
        return True

    except Exception:
        logger.warning("auth_email_failed", recipient=recipient, exc_info=True)
        return False


# ---------------------------------------------------------------------------
# Forgot Password / Reset Password
# ---------------------------------------------------------------------------

@router.post("/forgot-password")
async def forgot_password(
    data: ForgotPasswordRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Request a password reset link. Always returns success to prevent user enumeration."""
    # Constant response — never varies based on user existence
    success_msg = "If an account with that identifier exists, a reset link has been sent."

    # Look up user by username OR email
    result = await session.execute(
        select(User).where(
            or_(User.username == data.identifier, User.email == data.identifier)
        )
    )
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        # Return same message — prevent enumeration
        return {"message": success_msg}

    # Rate limit: max 3 tokens per user per hour
    now = datetime.now(timezone.utc)
    one_hour_ago = now - timedelta(hours=1)
    count_result = await session.execute(
        select(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.created_at >= one_hour_ago,
        )
    )
    recent_tokens = count_result.scalars().all()
    if len(recent_tokens) >= 3:
        # Silently skip — still return success
        return {"message": success_msg}

    # Generate token
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=now + timedelta(hours=1),
    )
    session.add(reset_token)
    await session.flush()

    # Send email if user has an email address
    if user.email:
        reset_url = f"/reset-password?token={raw_token}"
        await _send_auth_email(
            recipient=user.email,
            subject="[Cassini] Password Reset Request",
            body=(
                f"You requested a password reset for your Cassini account.\n\n"
                f"Use this link to reset your password:\n{reset_url}\n\n"
                f"This link expires in 1 hour.\n\n"
                f"If you did not request this, you can safely ignore this email."
            ),
            session=session,
        )

    # Audit log (only for found users — no log for not-found to prevent enumeration)
    audit_service = getattr(request.app.state, "audit_service", None)
    if audit_service:
        await audit_service.log(
            action="password_reset_requested",
            resource_type="auth",
            user_id=user.id,
            username=user.username,
            ip_address=_get_client_ip(request),
        )

    await session.commit()
    return {"message": success_msg}


@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Reset password using a valid token."""
    now = datetime.now(timezone.utc)
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()

    # Look up valid, unused, non-expired token
    result = await session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    )
    reset_token = result.scalar_one_or_none()

    if reset_token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Validate password length (baseline)
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters",
        )

    # Enforce password policy if configured
    policy_result = await session.execute(select(PasswordPolicy).limit(1))
    policy = policy_result.scalar_one_or_none()
    if policy:
        if policy.min_length and len(data.new_password) < policy.min_length:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Password must be at least {policy.min_length} characters",
            )
        if policy.require_uppercase and not any(c.isupper() for c in data.new_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must contain at least one uppercase letter",
            )
        if policy.require_lowercase and not any(c.islower() for c in data.new_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must contain at least one lowercase letter",
            )
        if policy.require_digit and not any(c.isdigit() for c in data.new_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must contain at least one digit",
            )
        if policy.require_special and not any(not c.isalnum() for c in data.new_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must contain at least one special character",
            )

    # Load user
    user_result = await session.execute(
        select(User).where(User.id == reset_token.user_id)
    )
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Update password
    from cassini.core.auth.passwords import hash_password
    user.hashed_password = hash_password(data.new_password)
    user.password_changed_at = now
    user.must_change_password = False

    # Consume token
    reset_token.used_at = now

    # Invalidate user cache so next auth check uses fresh data
    invalidate_user_cache(user.id)

    # Note: Refresh tokens are stateless JWTs — we cannot revoke them from the DB.
    # The password_changed_at update ensures the user must re-authenticate.

    # Audit log
    audit_service = getattr(request.app.state, "audit_service", None)
    if audit_service:
        await audit_service.log(
            action="password_reset_completed",
            resource_type="auth",
            user_id=user.id,
            username=user.username,
            ip_address=_get_client_ip(request),
        )

    await session.commit()
    return {"message": "Password has been reset successfully. Please log in with your new password."}


# ---------------------------------------------------------------------------
# Update Profile / Email Verification
# ---------------------------------------------------------------------------

@router.post("/update-profile", response_model=UpdateProfileResponse)
async def update_profile(
    data: UpdateProfileRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> UpdateProfileResponse:
    """Update the current user's profile (display name, email)."""
    email_verification_sent = False

    if data.display_name is not None:
        current_user.full_name = data.display_name

    if data.email is not None and data.email != current_user.email:
        # Generate email verification token
        now = datetime.now(timezone.utc)
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        verification_token = EmailVerificationToken(
            user_id=current_user.id,
            token_hash=token_hash,
            new_email=data.email,
            expires_at=now + timedelta(hours=24),
        )
        session.add(verification_token)

        # Store pending email
        current_user.pending_email = data.email

        # Send verification email to the NEW address
        verify_url = f"/verify-email?token={raw_token}"
        sent = await _send_auth_email(
            recipient=data.email,
            subject="[Cassini] Verify Your Email Address",
            body=(
                f"You requested to change your email address for your Cassini account.\n\n"
                f"Use this link to verify your new email address:\n{verify_url}\n\n"
                f"This link expires in 24 hours.\n\n"
                f"If you did not request this, you can safely ignore this email."
            ),
            session=session,
        )
        email_verification_sent = sent

    # Audit log
    audit_service = getattr(request.app.state, "audit_service", None)
    if audit_service:
        detail = {}
        if data.display_name is not None:
            detail["display_name"] = data.display_name
        if data.email is not None:
            detail["new_email"] = data.email
        await audit_service.log(
            action="profile_updated",
            resource_type="auth",
            user_id=current_user.id,
            username=current_user.username,
            ip_address=_get_client_ip(request),
            detail=detail,
        )

    await session.commit()
    invalidate_user_cache(current_user.id)

    return UpdateProfileResponse(
        message="Profile updated successfully",
        email_verification_sent=email_verification_sent,
    )


@router.get("/verify-email")
async def verify_email(
    token: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Verify a new email address via token from email link.

    Requires authentication to prevent account takeover via intercepted tokens.
    """
    now = datetime.now(timezone.utc)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # Look up valid, unused, non-expired token
    result = await session.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == token_hash,
            EmailVerificationToken.used_at.is_(None),
            EmailVerificationToken.expires_at > now,
        )
    )
    verification = result.scalar_one_or_none()

    if verification is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    # Verify token belongs to authenticated user
    if verification.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verification token does not belong to current user",
        )

    user = current_user

    old_email = user.email

    # Update email
    user.email = verification.new_email
    user.pending_email = None

    # Consume token
    verification.used_at = now

    # Audit log with old and new email
    audit_service = getattr(request.app.state, "audit_service", None)
    if audit_service:
        await audit_service.log(
            action="email_verified",
            resource_type="auth",
            user_id=user.id,
            username=user.username,
            ip_address=_get_client_ip(request),
            detail={"old_email": old_email, "new_email": verification.new_email},
        )

    await session.commit()
    return {"message": "Email address verified successfully"}


def _get_client_ip(request: Request) -> str:
    """Get client IP, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
