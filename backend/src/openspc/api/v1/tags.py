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
from sqlalchemy.orm import selectinload

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
from openspc.db.models.data_source import DataSource, MQTTDataSource
from openspc.db.models.user import User
from openspc.db.repositories.data_source import DataSourceRepository

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/tags", tags=["tags"])


@router.get("/mappings", response_model=list[TagMappingResponse])
async def list_mappings(
    plant_id: int | None = Query(None, description="Filter by plant ID"),
    broker_id: int | None = Query(None, description="Filter by broker ID"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> list[TagMappingResponse]:
    """List all MQTT tag-to-characteristic mappings."""
    from openspc.db.models.hierarchy import Hierarchy

    stmt = (
        select(MQTTDataSource)
        .join(DataSource, MQTTDataSource.id == DataSource.id)
        .join(Characteristic, DataSource.characteristic_id == Characteristic.id)
        .options(
            selectinload(MQTTDataSource.broker),
            selectinload(MQTTDataSource.characteristic),
        )
    )

    if plant_id is not None:
        stmt = stmt.join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id).where(
            Hierarchy.plant_id == plant_id
        )

    if broker_id is not None:
        stmt = stmt.where(MQTTDataSource.broker_id == broker_id)

    result = await session.execute(stmt)
    sources = list(result.scalars().all())

    mappings = []
    for src in sources:
        char = src.characteristic
        broker = src.broker
        mappings.append(
            TagMappingResponse(
                data_source_id=src.id,
                characteristic_id=char.id if char else 0,
                characteristic_name=char.name if char else "Unknown",
                mqtt_topic=src.topic,
                trigger_strategy=src.trigger_strategy,
                trigger_tag=src.trigger_tag,
                broker_id=src.broker_id,
                broker_name=broker.name if broker else None,
                metric_name=src.metric_name,
                is_active=src.is_active,
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

    Creates a DataSource + MQTTDataSource for the characteristic.
    If one already exists, it is replaced.
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

    # Delete existing data source if present
    ds_repo = DataSourceRepository(session)
    await ds_repo.delete_for_characteristic(data.characteristic_id)

    # Create new MQTT data source
    source = await ds_repo.create_mqtt_source(
        characteristic_id=data.characteristic_id,
        topic=data.mqtt_topic,
        broker_id=data.broker_id,
        metric_name=data.metric_name,
        trigger_tag=data.trigger_tag,
        trigger_strategy=data.trigger_strategy,
    )

    await session.commit()

    # Refresh TagProvider subscriptions
    try:
        from openspc.core.providers import tag_provider_manager
        async with session.begin_nested():
            await tag_provider_manager.refresh_subscriptions(session)
    except Exception as e:
        logger.warning("tag_subscription_refresh_failed", error=str(e))

    return TagMappingResponse(
        data_source_id=source.id,
        characteristic_id=char.id,
        characteristic_name=char.name,
        mqtt_topic=source.topic,
        trigger_strategy=source.trigger_strategy,
        trigger_tag=source.trigger_tag,
        broker_id=broker.id,
        broker_name=broker.name,
        metric_name=source.metric_name,
        is_active=source.is_active,
    )


@router.delete("/map/{characteristic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mapping(
    characteristic_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> None:
    """Remove a tag mapping from a characteristic.

    Deletes the DataSource row, which cascades to the MQTTDataSource.
    """
    ds_repo = DataSourceRepository(session)
    deleted = await ds_repo.delete_for_characteristic(characteristic_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No data source mapping for characteristic {characteristic_id}"
        )

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
