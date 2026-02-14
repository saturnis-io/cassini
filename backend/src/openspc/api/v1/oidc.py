"""OIDC SSO authentication and configuration endpoints.

Public endpoints (no auth):
- GET /providers — list active OIDC providers for login page
- GET /authorize/{provider_id} — initiate OIDC flow
- GET /callback — handle OIDC provider callback

Admin-only endpoints:
- GET /config — list all OIDC configs
- POST /config — create provider config
- PUT /config/{id} — update config
- DELETE /config/{id} — delete config
"""

import json
import structlog

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import get_current_admin, get_db_session
from openspc.api.schemas.oidc import (
    OIDCAuthorizationResponse,
    OIDCCallbackResponse,
    OIDCConfigCreate,
    OIDCConfigResponse,
    OIDCConfigUpdate,
    OIDCProviderPublic,
)
from openspc.core.config import get_settings
from openspc.core.oidc_service import OIDCService
from openspc.db.dialects import encrypt_password, get_encryption_key
from openspc.db.models.oidc_config import OIDCConfig
from openspc.db.models.user import User
from openspc.db.repositories.oidc_config_repo import OIDCConfigRepository

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/auth/oidc", tags=["oidc"])

# Cookie configuration (reuse from auth module)
COOKIE_SECURE = get_settings().cookie_secure
REFRESH_COOKIE_PATH = "/api/v1/auth"
REFRESH_COOKIE_KEY = "refresh_token"


def _mask_secret(encrypted_secret: str) -> str:
    """Mask a client secret for display, showing only last 4 chars."""
    if len(encrypted_secret) <= 4:
        return "****"
    return "****" + encrypted_secret[-4:]


def _build_config_response(config: OIDCConfig) -> OIDCConfigResponse:
    """Build an OIDCConfigResponse from a model instance."""
    return OIDCConfigResponse(
        id=config.id,
        name=config.name,
        issuer_url=config.issuer_url,
        client_id=config.client_id,
        client_secret_masked=_mask_secret(config.client_secret_encrypted),
        scopes=config.scopes_list,
        role_mapping=config.role_mapping_dict,
        auto_provision=config.auto_provision,
        default_role=config.default_role,
        is_active=config.is_active,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


# -------------------------------------------------------------------------
# Public endpoints (no auth required)
# -------------------------------------------------------------------------

@router.get("/providers", response_model=list[OIDCProviderPublic])
async def list_providers(
    session: AsyncSession = Depends(get_db_session),
) -> list[OIDCProviderPublic]:
    """List active OIDC providers for the login page.

    Returns only id and name — no sensitive configuration data.
    """
    repo = OIDCConfigRepository(session)
    providers = await repo.get_active_providers()
    return [OIDCProviderPublic(id=p.id, name=p.name) for p in providers]


@router.get("/authorize/{provider_id}", response_model=OIDCAuthorizationResponse)
async def authorize(
    provider_id: int,
    redirect_uri: str = Query(..., description="Frontend callback URL"),
    session: AsyncSession = Depends(get_db_session),
) -> OIDCAuthorizationResponse:
    """Initiate OIDC authorization flow for a provider.

    Returns the authorization URL that the frontend should redirect the user to.
    """
    try:
        service = OIDCService(session)
        url = await service.get_authorization_url(provider_id, redirect_uri)
        return OIDCAuthorizationResponse(authorization_url=url)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        logger.error("oidc_authorize_failed", provider_id=provider_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to contact OIDC provider",
        )


@router.get("/callback")
async def callback(
    request: Request,
    response: Response,
    code: str = Query(..., description="Authorization code from provider"),
    state: str = Query(..., description="State parameter for CSRF validation"),
    session: AsyncSession = Depends(get_db_session),
) -> OIDCCallbackResponse:
    """Handle OIDC provider callback.

    Exchanges the authorization code for tokens, provisions the user if needed,
    and returns OpenSPC JWTs. Also sets the refresh token cookie.
    """
    try:
        service = OIDCService(session)
        result = await service.handle_callback(code, state)

        # Set refresh token cookie (same pattern as standard login)
        response.set_cookie(
            key=REFRESH_COOKIE_KEY,
            value=result["refresh_token"],
            httponly=True,
            secure=COOKIE_SECURE,
            samesite="lax",
            max_age=7 * 24 * 60 * 60,
            path=REFRESH_COOKIE_PATH,
        )

        # Audit log the SSO login
        audit_service = getattr(request.app.state, "audit_service", None)
        if audit_service:
            ip = _get_client_ip(request)
            ua = (request.headers.get("user-agent") or "")[:512]
            await audit_service.log_login(
                result["username"],
                success=True,
                ip_address=ip,
                user_agent=ua,
                user_id=result["user_id"],
            )

        await session.commit()

        return OIDCCallbackResponse(
            access_token=result["access_token"],
            token_type="bearer",
            user_id=result["user_id"],
            username=result["username"],
        )

    except ValueError as e:
        logger.warning("oidc_callback_value_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error("oidc_callback_failed", error=str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OIDC callback processing failed",
        )


# -------------------------------------------------------------------------
# Admin-only endpoints
# -------------------------------------------------------------------------

@router.get("/config", response_model=list[OIDCConfigResponse])
async def list_configs(
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> list[OIDCConfigResponse]:
    """List all OIDC provider configurations (admin only)."""
    repo = OIDCConfigRepository(session)
    configs = await repo.get_all()
    return [_build_config_response(c) for c in configs]


@router.post("/config", response_model=OIDCConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_config(
    data: OIDCConfigCreate,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> OIDCConfigResponse:
    """Create a new OIDC provider configuration (admin only)."""
    # Encrypt the client secret
    enc_key = get_encryption_key()
    encrypted_secret = encrypt_password(data.client_secret, enc_key)

    repo = OIDCConfigRepository(session)
    config = await repo.create(
        name=data.name,
        issuer_url=data.issuer_url,
        client_id=data.client_id,
        client_secret_encrypted=encrypted_secret,
        scopes=json.dumps(data.scopes),
        role_mapping=json.dumps(data.role_mapping),
        auto_provision=data.auto_provision,
        default_role=data.default_role,
    )
    await session.commit()

    logger.info("oidc_config_created", config_id=config.id, name=config.name)
    return _build_config_response(config)


@router.put("/config/{config_id}", response_model=OIDCConfigResponse)
async def update_config(
    config_id: int,
    data: OIDCConfigUpdate,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> OIDCConfigResponse:
    """Update an OIDC provider configuration (admin only)."""
    repo = OIDCConfigRepository(session)
    config = await repo.get_by_id(config_id)
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OIDC config {config_id} not found",
        )

    # Build update dict
    update_data = data.model_dump(exclude_unset=True)

    # Handle client secret encryption
    if "client_secret" in update_data:
        enc_key = get_encryption_key()
        update_data["client_secret_encrypted"] = encrypt_password(
            update_data.pop("client_secret"), enc_key
        )

    # Serialize JSON fields
    if "scopes" in update_data:
        update_data["scopes"] = json.dumps(update_data["scopes"])
    if "role_mapping" in update_data:
        update_data["role_mapping"] = json.dumps(update_data["role_mapping"])

    updated = await repo.update(config_id, **update_data)
    await session.commit()

    logger.info("oidc_config_updated", config_id=config_id)
    return _build_config_response(updated)


@router.delete("/config/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_config(
    config_id: int,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> None:
    """Delete an OIDC provider configuration (admin only)."""
    repo = OIDCConfigRepository(session)
    deleted = await repo.delete(config_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OIDC config {config_id} not found",
        )

    await session.commit()
    logger.info("oidc_config_deleted", config_id=config_id)


def _get_client_ip(request: Request) -> str:
    """Get client IP, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
