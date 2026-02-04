"""Data provider REST endpoints for OpenSPC.

Provides status and control endpoints for data providers (TAG, MQTT).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.database import get_session

router = APIRouter(prefix="/api/v1/providers", tags=["providers"])


class TagProviderStatusResponse(BaseModel):
    """Response schema for TAG provider status."""

    is_running: bool
    subscribed_topics: list[str]
    characteristics_count: int
    samples_processed: int
    last_sample_time: datetime | None
    error_message: str | None


class MQTTStatusResponse(BaseModel):
    """Response schema for MQTT connection status."""

    is_connected: bool
    broker_id: int | None
    broker_name: str | None
    last_connected: datetime | None
    error_message: str | None
    subscribed_topics: list[str]


class ProviderStatusResponse(BaseModel):
    """Combined provider status response."""

    mqtt: MQTTStatusResponse
    tag_provider: TagProviderStatusResponse


@router.get("/status", response_model=ProviderStatusResponse)
async def get_provider_status() -> ProviderStatusResponse:
    """Get status of all data providers.

    Returns combined status of MQTT connection and TAG provider.
    """
    from openspc.core.providers import tag_provider_manager
    from openspc.mqtt import mqtt_manager

    mqtt_state = mqtt_manager.state
    tag_state = tag_provider_manager.state

    return ProviderStatusResponse(
        mqtt=MQTTStatusResponse(
            is_connected=mqtt_state.is_connected,
            broker_id=mqtt_state.broker_id,
            broker_name=mqtt_state.broker_name,
            last_connected=mqtt_state.last_connected,
            error_message=mqtt_state.error_message,
            subscribed_topics=mqtt_state.subscribed_topics,
        ),
        tag_provider=TagProviderStatusResponse(
            is_running=tag_state.is_running,
            subscribed_topics=tag_state.subscribed_topics,
            characteristics_count=tag_state.characteristics_count,
            samples_processed=tag_state.samples_processed,
            last_sample_time=tag_state.last_sample_time,
            error_message=tag_state.error_message,
        ),
    )


@router.post("/tag/restart", response_model=TagProviderStatusResponse)
async def restart_tag_provider(
    session: AsyncSession = Depends(get_session),
) -> TagProviderStatusResponse:
    """Restart the TAG provider.

    Stops the current provider and reinitializes with fresh configuration.
    Useful when TAG characteristics are added or modified.
    """
    from openspc.core.providers import tag_provider_manager
    from openspc.mqtt import mqtt_manager

    if not mqtt_manager.is_connected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cannot restart TAG provider: MQTT not connected"
        )

    success = await tag_provider_manager.restart(session)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to restart TAG provider: {tag_provider_manager.state.error_message}"
        )

    state = tag_provider_manager.state
    return TagProviderStatusResponse(
        is_running=state.is_running,
        subscribed_topics=state.subscribed_topics,
        characteristics_count=state.characteristics_count,
        samples_processed=state.samples_processed,
        last_sample_time=state.last_sample_time,
        error_message=state.error_message,
    )


@router.post("/tag/refresh", response_model=dict)
async def refresh_tag_subscriptions(
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Refresh TAG provider subscriptions.

    Reloads topic subscriptions based on current TAG characteristics.
    Use this when adding or removing TAG characteristics.
    """
    from openspc.core.providers import tag_provider_manager

    if not tag_provider_manager.is_running:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TAG provider is not running"
        )

    count = await tag_provider_manager.refresh_subscriptions(session)

    return {
        "message": f"Refreshed subscriptions for {count} characteristics",
        "characteristics_count": count,
    }
