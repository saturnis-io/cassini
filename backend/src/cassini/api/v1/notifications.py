"""Notification REST API endpoints.

Provides SMTP configuration, webhook management, and user preference endpoints.
SMTP and webhook endpoints are admin-only. Preference endpoints are for any
authenticated user.
"""

import json
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_admin, get_current_user, get_db_session
from cassini.api.schemas.notification import (
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    SmtpConfigResponse,
    SmtpConfigUpdate,
    WebhookConfigCreate,
    WebhookConfigResponse,
    WebhookConfigUpdate,
)
from cassini.db.dialects import decrypt_password, encrypt_password, get_encryption_key
from cassini.db.models.notification import (
    NotificationPreference,
    SmtpConfig,
    WebhookConfig,
)
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


# ---------------------------------------------------------------------------
# SMTP endpoints (admin-only)
# ---------------------------------------------------------------------------


@router.get("/smtp", response_model=SmtpConfigResponse | None)
async def get_smtp_config(
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
):
    """Get current SMTP configuration (password masked)."""
    result = await session.execute(select(SmtpConfig))
    config = result.scalar_one_or_none()
    if config is None:
        return None
    return SmtpConfigResponse(
        id=config.id,
        server=config.server,
        port=config.port,
        username_set=config.username is not None and config.username != "",
        password_set=config.password is not None and config.password != "",
        use_tls=config.use_tls,
        from_address=config.from_address,
        is_active=config.is_active,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@router.put("/smtp", response_model=SmtpConfigResponse)
async def update_smtp_config(
    data: SmtpConfigUpdate,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
):
    """Create or update SMTP configuration (singleton upsert)."""
    result = await session.execute(select(SmtpConfig))
    config = result.scalar_one_or_none()

    enc_key = get_encryption_key()

    if config is None:
        config = SmtpConfig(
            server=data.server,
            port=data.port,
            username=encrypt_password(data.username, enc_key) if data.username else None,
            password=encrypt_password(data.password, enc_key) if data.password else None,
            use_tls=data.use_tls,
            from_address=data.from_address,
            is_active=data.is_active,
        )
        session.add(config)
    else:
        config.server = data.server
        config.port = data.port
        if data.username is not None:
            config.username = encrypt_password(data.username, enc_key) if data.username else None
        if data.password is not None:
            config.password = encrypt_password(data.password, enc_key) if data.password else None
        config.use_tls = data.use_tls
        config.from_address = data.from_address
        config.is_active = data.is_active

    await session.commit()
    await session.refresh(config)

    return SmtpConfigResponse(
        id=config.id,
        server=config.server,
        port=config.port,
        username_set=config.username is not None and config.username != "",
        password_set=config.password is not None and config.password != "",
        use_tls=config.use_tls,
        from_address=config.from_address,
        is_active=config.is_active,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@router.post("/smtp/test")
async def test_smtp(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_admin),
):
    """Send a test email to the requesting user's email address."""
    if not user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account has no email address configured",
        )

    result = await session.execute(select(SmtpConfig))
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No SMTP configuration found. Save a configuration first.",
        )

    # Decrypt credentials
    enc_key = get_encryption_key()
    username = None
    password = None
    if config.username:
        try:
            username = decrypt_password(config.username, enc_key)
        except Exception:
            username = config.username
    if config.password:
        try:
            password = decrypt_password(config.password, enc_key)
        except Exception:
            password = config.password

    from cassini.core.notifications import NotificationDispatcher

    result_msg = await NotificationDispatcher.send_test_email(
        smtp_server=config.server,
        smtp_port=config.port,
        smtp_username=username,
        smtp_password=password,
        smtp_use_tls=config.use_tls,
        smtp_from=config.from_address,
        recipient=user.email,
    )

    if result_msg == "ok":
        return {"message": f"Test email sent to {user.email}"}
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"SMTP test failed: {result_msg}",
    )


# ---------------------------------------------------------------------------
# Webhook endpoints (admin-only)
# ---------------------------------------------------------------------------


def _webhook_to_response(wh: WebhookConfig) -> WebhookConfigResponse:
    """Convert WebhookConfig model to response schema."""
    events = None
    if wh.events_filter:
        try:
            events = json.loads(wh.events_filter)
        except (json.JSONDecodeError, TypeError):
            events = None

    return WebhookConfigResponse(
        id=wh.id,
        name=wh.name,
        url=wh.url,
        has_secret=wh.secret is not None and wh.secret != "",
        is_active=wh.is_active,
        retry_count=wh.retry_count,
        events_filter=events,
        created_at=wh.created_at,
        updated_at=wh.updated_at,
    )


@router.get("/webhooks", response_model=list[WebhookConfigResponse])
async def list_webhooks(
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
):
    """List all webhook configurations."""
    result = await session.execute(select(WebhookConfig))
    webhooks = result.scalars().all()
    return [_webhook_to_response(wh) for wh in webhooks]


@router.post("/webhooks", response_model=WebhookConfigResponse, status_code=201)
async def create_webhook(
    data: WebhookConfigCreate,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
):
    """Create a new webhook configuration."""
    enc_key = get_encryption_key()

    wh = WebhookConfig(
        name=data.name,
        url=data.url,
        secret=encrypt_password(data.secret, enc_key) if data.secret else None,
        is_active=data.is_active,
        retry_count=data.retry_count,
        events_filter=json.dumps(data.events_filter) if data.events_filter else None,
    )
    session.add(wh)
    await session.commit()
    await session.refresh(wh)
    return _webhook_to_response(wh)


@router.put("/webhooks/{webhook_id}", response_model=WebhookConfigResponse)
async def update_webhook(
    webhook_id: int,
    data: WebhookConfigUpdate,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
):
    """Update a webhook configuration."""
    wh = await session.get(WebhookConfig, webhook_id)
    if wh is None:
        raise HTTPException(status_code=404, detail="Webhook not found")

    enc_key = get_encryption_key()
    update_data = data.model_dump(exclude_unset=True)

    if "secret" in update_data:
        val = update_data.pop("secret")
        wh.secret = encrypt_password(val, enc_key) if val else None

    if "events_filter" in update_data:
        val = update_data.pop("events_filter")
        wh.events_filter = json.dumps(val) if val else None

    for key, value in update_data.items():
        setattr(wh, key, value)

    await session.commit()
    await session.refresh(wh)
    return _webhook_to_response(wh)


@router.delete("/webhooks/{webhook_id}", status_code=204)
async def delete_webhook(
    webhook_id: int,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
):
    """Delete a webhook configuration."""
    wh = await session.get(WebhookConfig, webhook_id)
    if wh is None:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await session.delete(wh)
    await session.commit()


@router.post("/webhooks/{webhook_id}/test")
async def test_webhook(
    webhook_id: int,
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
):
    """Send a test payload to a webhook."""
    wh = await session.get(WebhookConfig, webhook_id)
    if wh is None:
        raise HTTPException(status_code=404, detail="Webhook not found")

    # Decrypt secret if present
    secret = None
    if wh.secret:
        try:
            enc_key = get_encryption_key()
            secret = decrypt_password(wh.secret, enc_key)
        except Exception:
            secret = wh.secret

    from cassini.core.notifications import NotificationDispatcher

    result_msg = await NotificationDispatcher.send_test_webhook(
        url=wh.url, secret=secret
    )

    if result_msg == "ok":
        return {"message": f"Test payload sent to {wh.name}"}
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Webhook test failed: {result_msg}",
    )


# ---------------------------------------------------------------------------
# User preference endpoints (any authenticated user)
# ---------------------------------------------------------------------------


@router.get("/preferences", response_model=list[NotificationPreferenceResponse])
async def get_preferences(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Get current user's notification preferences."""
    result = await session.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user.id
        )
    )
    prefs = result.scalars().all()
    return [NotificationPreferenceResponse.model_validate(p) for p in prefs]


@router.put("/preferences", response_model=list[NotificationPreferenceResponse])
async def update_preferences(
    data: NotificationPreferenceUpdate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Update current user's notification preferences (full replace)."""
    # Delete existing preferences
    await session.execute(
        delete(NotificationPreference).where(
            NotificationPreference.user_id == user.id
        )
    )

    # Create new preferences
    new_prefs = []
    for item in data.preferences:
        pref = NotificationPreference(
            user_id=user.id,
            event_type=item.event_type,
            channel=item.channel,
            is_enabled=item.is_enabled,
            severity_filter=item.severity_filter,
        )
        session.add(pref)
        new_prefs.append(pref)

    await session.commit()

    # Refresh to get IDs
    for pref in new_prefs:
        await session.refresh(pref)

    return [NotificationPreferenceResponse.model_validate(p) for p in new_prefs]
