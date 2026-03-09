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

Account linking endpoints (authenticated users):
- GET /links — list OIDC account links for current user
- DELETE /links/{link_id} — unlink an OIDC account

Logout endpoints (authenticated users):
- GET /logout/{provider_id} — get IdP logout URL for RP-initiated logout
"""

import json
import structlog

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_admin, get_current_user, get_db_session
from cassini.api.schemas.oidc import (
    AccountLinkResponse,
    OIDCAuthorizationResponse,
    OIDCCallbackResponse,
    OIDCConfigCreate,
    OIDCConfigResponse,
    OIDCConfigUpdate,
    OIDCLogoutResponse,
    OIDCProviderPublic,
)
from cassini.core.config import get_settings
from cassini.core.oidc_service import OIDCService
from cassini.db.dialects import encrypt_password, get_encryption_key
from cassini.db.models.oidc_config import OIDCConfig
from cassini.db.models.user import User
from cassini.db.repositories.oidc_config_repo import OIDCConfigRepository

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/auth/oidc", tags=["oidc"])

# Cookie configuration (reuse from auth module)
COOKIE_SECURE = get_settings().cookie_secure
REFRESH_COOKIE_PATH = "/api/v1/auth"
REFRESH_COOKIE_KEY = "refresh_token"


def _mask_secret(encrypted_secret: str) -> str:
    """Return a fixed mask indicating a client secret is configured.

    Never exposes any part of the encrypted ciphertext — the previous
    implementation leaked the last 4 chars of the Fernet token, which
    is both non-informative and a minor information disclosure risk.
    """
    if not encrypted_secret:
        return "(not set)"
    return "********"


def _build_config_response(config: OIDCConfig) -> OIDCConfigResponse:
    """Build an OIDCConfigResponse from a model instance."""
    claim_mapping = {}
    if config.claim_mapping:
        try:
            claim_mapping = json.loads(config.claim_mapping) if isinstance(config.claim_mapping, str) else config.claim_mapping
        except (json.JSONDecodeError, TypeError):
            pass
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
        claim_mapping=claim_mapping,
        end_session_endpoint=config.end_session_endpoint,
        post_logout_redirect_uri=config.post_logout_redirect_uri,
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
        error_msg = str(e)
        if "not found or inactive" in error_msg:
            logger.warning("oidc_authorize_not_found", provider_id=provider_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Provider not found or inactive",
            )
        # redirect_uri validation failures
        logger.warning(
            "oidc_authorize_redirect_rejected",
            provider_id=provider_id,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or disallowed redirect URI",
        )
    except Exception:
        logger.error("oidc_authorize_failed", provider_id=provider_id, exc_info=True)
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
    and returns Cassini JWTs. Also sets the refresh token cookie.
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
            detail="OIDC authentication failed",
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
    request: Request,
    data: OIDCConfigCreate,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> OIDCConfigResponse:
    """Create a new OIDC provider configuration (admin only)."""
    # Encrypt the client secret
    enc_key = get_encryption_key()
    encrypted_secret = encrypt_password(data.client_secret, enc_key)

    repo = OIDCConfigRepository(session)
    create_kwargs = dict(
        name=data.name,
        issuer_url=data.issuer_url,
        client_id=data.client_id,
        client_secret_encrypted=encrypted_secret,
        scopes=json.dumps(data.scopes),
        role_mapping=json.dumps(data.role_mapping),
        auto_provision=data.auto_provision,
        default_role=data.default_role,
    )
    # Handle optional new fields
    if hasattr(data, "claim_mapping") and data.claim_mapping is not None:
        create_kwargs["claim_mapping"] = json.dumps(data.claim_mapping)
    if hasattr(data, "end_session_endpoint") and data.end_session_endpoint is not None:
        create_kwargs["end_session_endpoint"] = data.end_session_endpoint
    if hasattr(data, "post_logout_redirect_uri") and data.post_logout_redirect_uri is not None:
        create_kwargs["post_logout_redirect_uri"] = data.post_logout_redirect_uri

    config = await repo.create(**create_kwargs)
    await session.commit()

    logger.info("oidc_config_created", config_id=config.id, name=config.name)

    request.state.audit_context = {
        "resource_type": "oidc_config",
        "resource_id": config.id,
        "action": "create",
        "summary": f"OIDC provider '{data.name}' created",
        "fields": {
            "name": data.name,
            "issuer_url": data.issuer_url,
            "client_id": data.client_id,
            "auto_provision": data.auto_provision,
            "default_role": data.default_role,
        },
    }

    return _build_config_response(config)


@router.put("/config/{config_id}", response_model=OIDCConfigResponse)
async def update_config(
    request: Request,
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
    if "claim_mapping" in update_data:
        update_data["claim_mapping"] = json.dumps(update_data["claim_mapping"])

    updated = await repo.update(config_id, **update_data)
    await session.commit()

    logger.info("oidc_config_updated", config_id=config_id)

    request.state.audit_context = {
        "resource_type": "oidc_config",
        "resource_id": config_id,
        "action": "update",
        "summary": f"OIDC provider '{updated.name}' updated",
        "fields": {
            "updated_fields": [k for k in data.model_dump(exclude_unset=True).keys() if k != "client_secret"],
            "name": updated.name,
        },
    }

    return _build_config_response(updated)


@router.delete("/config/{config_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_config(
    request: Request,
    config_id: int,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> None:
    """Delete an OIDC provider configuration (admin only)."""
    repo = OIDCConfigRepository(session)

    # Capture name before deletion for audit
    config = await repo.get_by_id(config_id)
    config_name = config.name if config else str(config_id)

    deleted = await repo.delete(config_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OIDC config {config_id} not found",
        )

    await session.commit()
    logger.info("oidc_config_deleted", config_id=config_id)

    request.state.audit_context = {
        "resource_type": "oidc_config",
        "resource_id": config_id,
        "action": "delete",
        "summary": f"OIDC provider '{config_name}' deleted",
        "fields": {"name": config_name},
    }


# -------------------------------------------------------------------------
# Account linking endpoints (authenticated users)
# -------------------------------------------------------------------------

@router.get("/links", response_model=list[AccountLinkResponse])
async def get_account_links(
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[AccountLinkResponse]:
    """List all OIDC account links for the current user."""
    from cassini.db.repositories.oidc_state_repo import OIDCStateRepository
    from cassini.db.repositories.oidc_config_repo import OIDCConfigRepository
    repo = OIDCStateRepository(session)
    config_repo = OIDCConfigRepository(session)
    links = await repo.get_account_links(current_user.id)
    result = []
    for link in links:
        config = await config_repo.get_by_id(link.provider_id)
        provider_name = config.name if config else "Unknown"
        result.append(AccountLinkResponse(
            id=link.id, user_id=link.user_id, provider_id=link.provider_id,
            provider_name=provider_name, oidc_subject=link.oidc_subject,
            linked_at=link.linked_at,
        ))
    return result


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_account_link(
    request: Request,
    link_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    """Unlink an OIDC account from the current user."""
    from cassini.db.repositories.oidc_state_repo import OIDCStateRepository
    repo = OIDCStateRepository(session)
    # Verify link belongs to current user
    links = await repo.get_account_links(current_user.id)
    link = next((l for l in links if l.id == link_id), None)
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account link not found")
    await repo.delete_account_link(link_id)
    await session.commit()

    request.state.audit_context = {
        "resource_type": "oidc_config",
        "resource_id": link_id,
        "action": "delete",
        "summary": f"OIDC account link removed for user '{current_user.username}'",
        "fields": {
            "provider_id": link.provider_id,
            "oidc_subject": link.oidc_subject,
        },
    }


@router.get("/logout/{provider_id}", response_model=OIDCLogoutResponse)
async def oidc_logout(
    provider_id: int,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> OIDCLogoutResponse:
    """Get the IdP logout URL for RP-initiated logout."""
    service = OIDCService(session)
    logout_url = await service.initiate_logout(provider_id)
    if logout_url:
        return OIDCLogoutResponse(logout_url=logout_url, message="Redirect to IdP for logout")
    return OIDCLogoutResponse(logout_url=None, message="Provider does not support RP-initiated logout")


def _get_client_ip(request: Request) -> str:
    """Get client IP, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
