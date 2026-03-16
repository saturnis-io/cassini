"""Tag mapping REST endpoints for Cassini.

Provides endpoints for mapping MQTT topics to SPC characteristics,
previewing live topic values, and managing tag-to-characteristic mappings.
"""

import asyncio
import structlog
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.api.deps import (
    check_plant_role,
    get_current_engineer,
    get_db_session,
    resolve_plant_id_for_characteristic,
)
from cassini.api.schemas.tag import (
    TagMappingCreate,
    TagMappingResponse,
    TagPreviewRequest,
    TagPreviewResponse,
    TagPreviewValue,
)
from cassini.db.models.broker import MQTTBroker
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.data_source import DataSource, MQTTDataSource
from cassini.db.models.user import User
from cassini.db.repositories.data_source import DataSourceRepository

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
    # Plant-scoped authorization when filtering by plant
    if plant_id is not None:
        check_plant_role(_user, plant_id, "engineer")

    from cassini.db.models.hierarchy import Hierarchy

    stmt = (
        select(MQTTDataSource)
        .join(Characteristic, MQTTDataSource.characteristic_id == Characteristic.id)
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
                json_path=src.json_path,
                is_active=src.is_active,
            )
        )

    return mappings


@router.post("/map", response_model=TagMappingResponse)
async def create_mapping(
    request: Request,
    data: TagMappingCreate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> TagMappingResponse:
    """Create or update a tag-to-characteristic mapping.

    Creates a DataSource + MQTTDataSource for the characteristic.
    If one already exists, it is replaced.
    """
    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(data.characteristic_id, session)
    check_plant_role(_user, plant_id, "engineer")

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

    # Validate json_path syntax if provided
    if data.json_path:
        try:
            from jsonpath_ng import parse as jsonpath_parse
            jsonpath_parse(data.json_path)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid JSONPath expression: {data.json_path}"
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
        json_path=data.json_path,
    )

    # Auto-set manual entry policy if currently "open"
    if char.manual_entry_policy == "open":
        char.manual_entry_policy = "supplemental"

    await session.commit()

    # Refresh TagProvider subscriptions
    try:
        from cassini.core.providers import tag_provider_manager
        async with session.begin_nested():
            await tag_provider_manager.refresh_subscriptions(session)
    except Exception as e:
        logger.warning("tag_subscription_refresh_failed", error=str(e))

    request.state.audit_context = {
        "resource_type": "tag_mapping",
        "resource_id": source.id,
        "action": "create",
        "summary": f"Tag mapping created: topic '{data.mqtt_topic}' -> characteristic '{char.name}'",
        "fields": {
            "characteristic_id": data.characteristic_id,
            "characteristic_name": char.name,
            "mqtt_topic": data.mqtt_topic,
            "broker_id": data.broker_id,
            "broker_name": broker.name,
            "trigger_strategy": data.trigger_strategy,
        },
    }

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
        json_path=source.json_path,
        is_active=source.is_active,
    )


@router.delete("/map/{characteristic_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_mapping(
    request: Request,
    characteristic_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> None:
    """Remove a tag mapping from a characteristic.

    Deletes the DataSource row, which cascades to the MQTTDataSource.
    """
    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(characteristic_id, session)
    check_plant_role(_user, plant_id, "engineer")

    ds_repo = DataSourceRepository(session)
    deleted = await ds_repo.delete_for_characteristic(characteristic_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No data source mapping for characteristic {characteristic_id}"
        )

    # Reset manual entry policy to "open" since no data source remains
    char_result = await session.execute(
        select(Characteristic).where(Characteristic.id == characteristic_id)
    )
    char = char_result.scalar_one_or_none()
    if char is not None:
        char.manual_entry_policy = "open"

    await session.commit()

    request.state.audit_context = {
        "resource_type": "tag_mapping",
        "resource_id": characteristic_id,
        "action": "delete",
        "summary": f"Tag mapping deleted for characteristic #{characteristic_id}",
        "fields": {"characteristic_id": characteristic_id},
    }

    # Refresh TagProvider subscriptions
    try:
        from cassini.core.providers import tag_provider_manager
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
    from cassini.mqtt import mqtt_manager

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
                from cassini.mqtt.sparkplug import SparkplugDecoder
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

            # If json_path provided, extract from JSON
            if data.json_path:
                try:
                    import json
                    from jsonpath_ng import parse as jsonpath_parse
                    parsed = json.loads(raw)
                    expr = jsonpath_parse(data.json_path)
                    matches = expr.find(parsed)
                    if matches:
                        extracted = matches[0].value
                        try:
                            value: float | str | bool = float(extracted)
                        except (TypeError, ValueError):
                            value = str(extracted)
                    else:
                        value = f"[no match for {data.json_path}]"
                except json.JSONDecodeError:
                    value = f"[not valid JSON: {raw[:50]}]"
            else:
                # Original behavior — try float, then bool, then string
                try:
                    value = float(raw.strip())
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
