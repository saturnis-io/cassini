"""Web Push notification subscription endpoints.

Manages browser push notification subscriptions for real-time SPC alerts.
Uses the Web Push protocol with VAPID authentication.
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import get_current_user, get_db_session
from openspc.api.schemas.push import (
    PushSubscriptionCreate,
    PushSubscriptionResponse,
    VAPIDKeyResponse,
)
from openspc.core.config import get_settings
from openspc.db.models.push_subscription import PushSubscription
from openspc.db.models.user import User
from sqlalchemy import select, delete

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/push", tags=["push"])


@router.get("/vapid-key", response_model=VAPIDKeyResponse)
async def get_vapid_key() -> VAPIDKeyResponse:
    """Get the VAPID public key for browser PushManager.subscribe().

    This endpoint is public --- the client needs the key to subscribe.
    """
    settings = get_settings()
    if not settings.vapid_public_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push notifications not configured (VAPID keys missing)",
        )
    return VAPIDKeyResponse(public_key=settings.vapid_public_key)


@router.post("/subscribe", response_model=PushSubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def subscribe(
    data: PushSubscriptionCreate,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> PushSubscriptionResponse:
    """Register a browser push notification subscription."""
    # Check if endpoint already exists (update if so)
    stmt = select(PushSubscription).where(PushSubscription.endpoint == data.endpoint)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.user_id = current_user.id
        existing.p256dh_key = data.p256dh_key
        existing.auth_key = data.auth_key
        await session.flush()
        await session.refresh(existing)
        sub = existing
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=data.endpoint,
            p256dh_key=data.p256dh_key,
            auth_key=data.auth_key,
        )
        session.add(sub)
        await session.flush()
        await session.refresh(sub)

    await session.commit()
    logger.info("push_subscription_created", user_id=current_user.id, endpoint=data.endpoint[:50])

    return PushSubscriptionResponse(
        id=sub.id,
        user_id=sub.user_id,
        endpoint=sub.endpoint,
        created_at=sub.created_at,
    )


@router.delete("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def unsubscribe(
    data: PushSubscriptionCreate,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    """Remove a push subscription by endpoint."""
    stmt = delete(PushSubscription).where(
        PushSubscription.endpoint == data.endpoint,
        PushSubscription.user_id == current_user.id,
    )
    result = await session.execute(stmt)
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    await session.commit()
    logger.info("push_subscription_removed", user_id=current_user.id)


@router.get("/subscriptions", response_model=list[PushSubscriptionResponse])
async def list_subscriptions(
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[PushSubscriptionResponse]:
    """List push subscriptions for the current user."""
    stmt = select(PushSubscription).where(
        PushSubscription.user_id == current_user.id
    ).order_by(PushSubscription.created_at.desc())
    result = await session.execute(stmt)
    subs = result.scalars().all()
    return [
        PushSubscriptionResponse(
            id=s.id, user_id=s.user_id, endpoint=s.endpoint, created_at=s.created_at,
        )
        for s in subs
    ]
