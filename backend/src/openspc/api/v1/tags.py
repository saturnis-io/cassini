"""Tag mapping REST endpoints for OpenSPC.

Provides endpoints for mapping MQTT topics to SPC characteristics,
previewing live topic values, and managing tag-to-characteristic mappings.
"""

import asyncio
import structlog
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from openspc.api.deps import get_current_engineer, get_db_session
from openspc.api.schemas.tag import (
    TagMappingCreate,
    TagMappingResponse,
    TagPreviewRequest,
    TagPreviewResponse,
    TagPreviewValue,
)
from openspc.db.models.broker import MQTTBroker
from openspc.db.models.characteristic import Characteristic
from openspc.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/tags", tags=["tags"])


@router.get("/mappings", response_model=list[TagMappingResponse])
async def list_mappings(
    plant_id: int | None = Query(None, description="Filter by plant ID"),
    broker_id: int | None = Query(None, description="Filter by broker ID"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> list[TagMappingResponse]:
    """List all tag-to-characteristic mappings.

    Returns characteristics that have an mqtt_topic configured, joined
    with broker information.
    """
    # Get all characteristics with mqtt_topic set, join hierarchy for plant filtering
    from openspc.db.models.hierarchy import Hierarchy

    stmt = select(Characteristic).where(Characteristic.mqtt_topic.isnot(None))

    if plant_id is not None:
        stmt = stmt.join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id).where(
            Hierarchy.plant_id == plant_id
        )

    result = await session.execute(stmt)
    chars = list(result.scalars().all())

    mappings = []
    for char in chars:
        if not char.mqtt_topic:
            continue

        # Determine trigger strategy
        trigger_strategy = "on_change"
        if char.trigger_tag:
            trigger_strategy = "on_trigger"

        # Look up broker by trying to match (simplified: use first active broker
        # or the one specified by broker_id filter)
        broker_name = "Unknown"
        b_id = 0

        if broker_id:
            broker_result = await session.execute(
                select(MQTTBroker).where(MQTTBroker.id == broker_id)
            )
            broker = broker_result.scalar_one_or_none()
            if broker:
                broker_name = broker.name
                b_id = broker.id
        else:
            # Get first active broker
            broker_result = await session.execute(
                select(MQTTBroker).where(MQTTBroker.is_active == True).limit(1)
            )
            broker = broker_result.scalar_one_or_none()
            if broker:
                broker_name = broker.name
                b_id = broker.id

        mappings.append(
            TagMappingResponse(
                characteristic_id=char.id,
                characteristic_name=char.name,
                mqtt_topic=char.mqtt_topic,
                trigger_strategy=trigger_strategy,
                trigger_tag=char.trigger_tag,
                broker_id=b_id,
                broker_name=broker_name,
                metric_name=char.metric_name,
            )
        )

    return mappings


@router.post("/map", response_model=TagMappingResponse)
async def create_mapping(
    data: TagMappingCreate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> TagMappingResponse:
    """Create or update a tag-to-characteristic mapping.

    Sets the mqtt_topic and trigger fields on the characteristic.
    After mapping, refreshes the TagProvider subscriptions.
    """
    # Validate characteristic exists
    char_result = await session.execute(
        select(Characteristic).where(Characteristic.id == data.characteristic_id)
    )
    char = char_result.scalar_one_or_none()
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {data.characteristic_id} not found"
        )

    # Validate broker exists
    broker_result = await session.execute(
        select(MQTTBroker).where(MQTTBroker.id == data.broker_id)
    )
    broker = broker_result.scalar_one_or_none()
    if broker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Broker {data.broker_id} not found"
        )

    # Update the characteristic
    char.mqtt_topic = data.mqtt_topic
    char.trigger_tag = data.trigger_tag
    char.metric_name = data.metric_name
    char.provider_type = "TAG"

    await session.commit()
    await session.refresh(char)

    # Refresh TagProvider subscriptions
    try:
        from openspc.core.providers import tag_provider_manager
        async with session.begin_nested():
            await tag_provider_manager.refresh_subscriptions(session)
    except Exception as e:
        logger.warning("tag_subscription_refresh_failed", error=str(e))

    return TagMappingResponse(
        characteristic_id=char.id,
        characteristic_name=char.name,
        mqtt_topic=char.mqtt_topic,
        trigger_strategy=data.trigger_strategy,
        trigger_tag=char.trigger_tag,
        broker_id=broker.id,
        broker_name=broker.name,
        metric_name=char.metric_name,
    )


@router.delete("/map/{characteristic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mapping(
    characteristic_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> None:
    """Remove a tag mapping from a characteristic.

    Clears the mqtt_topic and trigger_tag fields and refreshes subscriptions.
    """
    char_result = await session.execute(
        select(Characteristic).where(Characteristic.id == characteristic_id)
    )
    char = char_result.scalar_one_or_none()
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {characteristic_id} not found"
        )

    char.mqtt_topic = None
    char.trigger_tag = None
    char.metric_name = None

    await session.commit()

    # Refresh TagProvider subscriptions
    try:
        from openspc.core.providers import tag_provider_manager
        async with session.begin_nested():
            await tag_provider_manager.refresh_subscriptions(session)
    except Exception as e:
        logger.warning("tag_subscription_refresh_failed", error=str(e))


@router.post("/preview", response_model=TagPreviewResponse)
async def preview_topic(
    data: TagPreviewRequest,
    _user: User = Depends(get_current_engineer),
) -> TagPreviewResponse:
    """Preview live values on an MQTT topic.

    Temporarily subscribes to the topic, collects values for the
    specified duration, then unsubscribes and returns the collected values.
    Maximum duration is 30 seconds.
    """
    from openspc.mqtt import mqtt_manager

    client = mqtt_manager.get_client(data.broker_id)
    if client is None or not client.is_connected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Broker {data.broker_id} is not connected"
        )

    # Collect values during the preview period
    collected_values: list[TagPreviewValue] = []
    started_at = datetime.now(timezone.utc)

    # Check if this is a SparkplugB topic for protobuf decoding
    is_sparkplug = data.topic.startswith("spBv1.0/")

    async def on_preview_message(topic: str, payload: bytes) -> None:
        try:
            if is_sparkplug:
                # Decode SparkplugB protobuf payload into individual metrics
                from openspc.mqtt.sparkplug import SparkplugDecoder
                try:
                    ts, metrics, _seq = SparkplugDecoder.decode_payload(payload)
                    for metric in metrics:
                        collected_values.append(
                            TagPreviewValue(
                                value=metric.value if isinstance(metric.value, (int, float, bool, str)) else str(metric.value),
                                timestamp=metric.timestamp or ts,
                                raw_payload=f"{metric.name} ({metric.data_type})",
                                metric_name=metric.name,
                            )
                        )
                    return
                except Exception as e:
                    logger.warning("sparkplug_preview_decode_failed", error=str(e))

            # Non-SparkplugB or fallback: decode as UTF-8 text
            raw = payload.decode("utf-8", errors="replace")[:200]
            # Try to parse as float, otherwise keep as string
            try:
                value: float | str | bool = float(raw.strip())
            except ValueError:
                if raw.strip().lower() in ("true", "false"):
                    value = raw.strip().lower() == "true"
                else:
                    value = raw.strip()

            collected_values.append(
                TagPreviewValue(
                    value=value,
                    timestamp=datetime.now(timezone.utc),
                    raw_payload=raw,
                )
            )
        except Exception as e:
            logger.warning("preview_message_error", error=str(e))

    # Subscribe and wait
    await client.subscribe(data.topic, on_preview_message)

    try:
        await asyncio.sleep(data.duration_seconds)
    finally:
        try:
            await client.unsubscribe(data.topic)
        except Exception:
            pass

    elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()

    return TagPreviewResponse(
        topic=data.topic,
        values=collected_values,
        sample_count=len(collected_values),
        started_at=started_at,
        duration_seconds=elapsed,
    )
