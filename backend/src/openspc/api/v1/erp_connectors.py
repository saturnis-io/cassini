"""ERP/LIMS connector REST endpoints.

Provides CRUD for ERP connectors, field mappings, sync schedules,
sync logs, manual sync trigger, test connection, and inbound webhook receiver.
Engineers+ can read; admins can write.

16 endpoints:
  Connectors: list, create, get, update, delete, test_connection, status
  Mappings: list, create, update, delete
  Schedules: upsert, delete
  Logs: list
  Sync: trigger manual sync
  Webhook: inbound webhook receiver
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.api.deps import (
    check_plant_role,
    get_current_admin,
    get_current_user,
    get_db_session,
    require_role,
)
from openspc.api.schemas.erp import (
    ERPConnectorCreate,
    ERPConnectorResponse,
    ERPConnectorStatusResponse,
    ERPConnectorUpdate,
    ERPFieldMappingCreate,
    ERPFieldMappingResponse,
    ERPFieldMappingUpdate,
    ERPManualSyncResponse,
    ERPSyncLogResponse,
    ERPSyncScheduleResponse,
    ERPSyncScheduleUpdate,
    ERPTestConnectionResponse,
)
from openspc.db.dialects import encrypt_password, get_encryption_key
from openspc.db.models.erp_connector import (
    ERPConnector,
    ERPFieldMapping,
    ERPSyncLog,
    ERPSyncSchedule,
)
from openspc.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/erp", tags=["erp-connectors"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_json_field(value: str | dict | None, default: dict | None = None) -> dict:
    """Parse a JSON string field, returning a dict."""
    if value is None:
        return default or {}
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return default or {}


def _connector_to_response(connector: ERPConnector) -> ERPConnectorResponse:
    """Convert an ERPConnector model to a response schema, parsing JSON fields."""
    return ERPConnectorResponse(
        id=connector.id,
        plant_id=connector.plant_id,
        name=connector.name,
        connector_type=connector.connector_type,
        base_url=connector.base_url,
        auth_type=connector.auth_type,
        headers=_parse_json_field(connector.headers, {}),
        is_active=connector.is_active,
        status=connector.status,
        last_sync_at=connector.last_sync_at,
        last_error=connector.last_error,
        created_at=connector.created_at,
        updated_at=connector.updated_at,
    )


def _mapping_to_response(mapping: ERPFieldMapping) -> ERPFieldMappingResponse:
    """Convert an ERPFieldMapping model to a response schema, parsing transform JSON."""
    return ERPFieldMappingResponse(
        id=mapping.id,
        connector_id=mapping.connector_id,
        name=mapping.name,
        direction=mapping.direction,
        erp_entity=mapping.erp_entity,
        erp_field_path=mapping.erp_field_path,
        openspc_entity=mapping.openspc_entity,
        openspc_field=mapping.openspc_field,
        transform=_parse_json_field(mapping.transform),
        is_active=mapping.is_active,
    )


def _sync_log_to_response(log: ERPSyncLog) -> ERPSyncLogResponse:
    """Convert an ERPSyncLog model to a response schema, parsing detail JSON."""
    return ERPSyncLogResponse(
        id=log.id,
        connector_id=log.connector_id,
        direction=log.direction,
        status=log.status,
        records_processed=log.records_processed,
        records_failed=log.records_failed,
        started_at=log.started_at,
        completed_at=log.completed_at,
        error_message=log.error_message,
        detail=_parse_json_field(log.detail),
    )


async def _get_connector_or_404(
    session: AsyncSession,
    connector_id: int,
    *,
    load_mappings: bool = False,
    load_schedules: bool = False,
) -> ERPConnector:
    """Fetch a connector by ID, optionally eager-loading relationships."""
    stmt = select(ERPConnector).where(ERPConnector.id == connector_id)
    if load_mappings:
        stmt = stmt.options(selectinload(ERPConnector.field_mappings))
    if load_schedules:
        stmt = stmt.options(selectinload(ERPConnector.schedules))
    result = await session.execute(stmt)
    connector = result.scalar_one_or_none()
    if connector is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ERP connector {connector_id} not found",
        )
    return connector


# ===========================================================================
# CONNECTOR CRUD
# ===========================================================================


@router.get("/connectors", response_model=list[ERPConnectorResponse])
async def list_connectors(
    plant_id: int = Query(..., description="Plant ID (required)"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[ERPConnectorResponse]:
    """List ERP connectors for a plant.

    Requires engineer+ role for the plant.
    """
    check_plant_role(user, plant_id, "engineer")

    stmt = (
        select(ERPConnector)
        .where(ERPConnector.plant_id == plant_id)
        .order_by(ERPConnector.created_at.desc())
    )
    result = await session.execute(stmt)
    connectors = result.scalars().all()
    return [_connector_to_response(c) for c in connectors]


@router.post(
    "/connectors",
    response_model=ERPConnectorResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_connector(
    data: ERPConnectorCreate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_admin),
) -> ERPConnectorResponse:
    """Create a new ERP connector. Admin only.

    Auth credentials are encrypted before storage.
    """
    check_plant_role(user, data.plant_id, "admin")

    # Encrypt auth_config
    enc_key = get_encryption_key()
    encrypted_auth = encrypt_password(json.dumps(data.auth_config), enc_key) if data.auth_config else "{}"

    connector = ERPConnector(
        plant_id=data.plant_id,
        name=data.name,
        connector_type=data.connector_type,
        base_url=data.base_url,
        auth_type=data.auth_type,
        auth_config=encrypted_auth,
        headers=json.dumps(data.headers) if data.headers else "{}",
        is_active=data.is_active,
        status="disconnected",
    )
    session.add(connector)
    await session.commit()
    await session.refresh(connector)

    logger.info(
        "erp_connector_created",
        connector_id=connector.id,
        name=connector.name,
        type=connector.connector_type,
        user=user.username,
    )
    return _connector_to_response(connector)


@router.get("/connectors/{connector_id}", response_model=ERPConnectorResponse)
async def get_connector(
    connector_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> ERPConnectorResponse:
    """Get a single ERP connector.

    Requires engineer+ role for the connector's plant.
    """
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "engineer")

    return _connector_to_response(connector)


@router.put("/connectors/{connector_id}", response_model=ERPConnectorResponse)
async def update_connector(
    connector_id: int,
    data: ERPConnectorUpdate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_admin),
) -> ERPConnectorResponse:
    """Update an ERP connector. Admin only.

    If auth_config is provided, it is re-encrypted.
    """
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "admin")

    update_data = data.model_dump(exclude_unset=True)

    # Encrypt auth_config if provided
    if "auth_config" in update_data and update_data["auth_config"] is not None:
        enc_key = get_encryption_key()
        update_data["auth_config"] = encrypt_password(
            json.dumps(update_data["auth_config"]), enc_key
        )

    # Serialize headers to JSON string if provided
    if "headers" in update_data and update_data["headers"] is not None:
        update_data["headers"] = json.dumps(update_data["headers"])

    for field, value in update_data.items():
        setattr(connector, field, value)

    connector.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(connector)

    logger.info(
        "erp_connector_updated",
        connector_id=connector_id,
        user=user.username,
        fields=list(update_data.keys()),
    )
    return _connector_to_response(connector)


@router.delete("/connectors/{connector_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_connector(
    connector_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_admin),
) -> None:
    """Delete an ERP connector and all related mappings, schedules, and logs. Admin only."""
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "admin")

    await session.delete(connector)
    await session.commit()

    logger.info(
        "erp_connector_deleted",
        connector_id=connector_id,
        name=connector.name,
        user=user.username,
    )


@router.post("/connectors/{connector_id}/test", response_model=ERPTestConnectionResponse)
async def test_connection(
    connector_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> ERPTestConnectionResponse:
    """Test connectivity to an ERP system.

    Creates the appropriate adapter and calls test_connection().
    Requires engineer+ role for the connector's plant.
    """
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "engineer")

    try:
        from openspc.core.erp.sync_engine import create_adapter

        adapter = create_adapter(connector)
        result = await adapter.test_connection()

        # Update connector status based on test result
        connector.status = "connected" if result.get("success") else "error"
        connector.last_error = None if result.get("success") else result.get("message", "Unknown error")
        connector.updated_at = datetime.now(timezone.utc)
        await session.commit()

        return ERPTestConnectionResponse(
            success=result.get("success", False),
            message=result.get("message", ""),
            details=result.get("details"),
        )
    except Exception as e:
        logger.error("erp_test_connection_failed", connector_id=connector_id, error=str(e))
        connector.status = "error"
        connector.last_error = str(e)[:500]
        connector.updated_at = datetime.now(timezone.utc)
        await session.commit()

        return ERPTestConnectionResponse(
            success=False,
            message="Connection test failed. Check server logs for details.",
        )


@router.get("/connectors/{connector_id}/status", response_model=ERPConnectorStatusResponse)
async def get_connector_status(
    connector_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> ERPConnectorStatusResponse:
    """Get the status of an ERP connector.

    Requires engineer+ role for the connector's plant.
    """
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "engineer")

    return ERPConnectorStatusResponse(
        id=connector.id,
        name=connector.name,
        status=connector.status,
        last_sync_at=connector.last_sync_at,
        last_error=connector.last_error,
    )


# ===========================================================================
# FIELD MAPPING CRUD
# ===========================================================================


@router.get(
    "/connectors/{connector_id}/mappings",
    response_model=list[ERPFieldMappingResponse],
)
async def list_mappings(
    connector_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[ERPFieldMappingResponse]:
    """List field mappings for a connector.

    Requires engineer+ role for the connector's plant.
    """
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "engineer")

    stmt = (
        select(ERPFieldMapping)
        .where(ERPFieldMapping.connector_id == connector_id)
        .order_by(ERPFieldMapping.id)
    )
    result = await session.execute(stmt)
    mappings = result.scalars().all()
    return [_mapping_to_response(m) for m in mappings]


@router.post(
    "/connectors/{connector_id}/mappings",
    response_model=ERPFieldMappingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_mapping(
    connector_id: int,
    data: ERPFieldMappingCreate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_admin),
) -> ERPFieldMappingResponse:
    """Create a field mapping for a connector. Admin only."""
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "admin")

    mapping = ERPFieldMapping(
        connector_id=connector_id,
        name=data.name,
        direction=data.direction,
        erp_entity=data.erp_entity,
        erp_field_path=data.erp_field_path,
        openspc_entity=data.openspc_entity,
        openspc_field=data.openspc_field,
        transform=json.dumps(data.transform) if data.transform else None,
        is_active=data.is_active,
    )
    session.add(mapping)
    await session.commit()
    await session.refresh(mapping)

    logger.info(
        "erp_mapping_created",
        mapping_id=mapping.id,
        connector_id=connector_id,
        name=mapping.name,
        user=user.username,
    )
    return _mapping_to_response(mapping)


@router.put(
    "/connectors/{connector_id}/mappings/{mapping_id}",
    response_model=ERPFieldMappingResponse,
)
async def update_mapping(
    connector_id: int,
    mapping_id: int,
    data: ERPFieldMappingUpdate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_admin),
) -> ERPFieldMappingResponse:
    """Update a field mapping. Admin only."""
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "admin")

    stmt = select(ERPFieldMapping).where(
        ERPFieldMapping.id == mapping_id,
        ERPFieldMapping.connector_id == connector_id,
    )
    result = await session.execute(stmt)
    mapping = result.scalar_one_or_none()
    if mapping is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Field mapping {mapping_id} not found on connector {connector_id}",
        )

    update_data = data.model_dump(exclude_unset=True)

    # Serialize transform to JSON string if provided
    if "transform" in update_data:
        val = update_data["transform"]
        update_data["transform"] = json.dumps(val) if val is not None else None

    for field, value in update_data.items():
        setattr(mapping, field, value)

    await session.commit()
    await session.refresh(mapping)

    logger.info(
        "erp_mapping_updated",
        mapping_id=mapping_id,
        connector_id=connector_id,
        user=user.username,
        fields=list(update_data.keys()),
    )
    return _mapping_to_response(mapping)


@router.delete(
    "/connectors/{connector_id}/mappings/{mapping_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_mapping(
    connector_id: int,
    mapping_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_admin),
) -> None:
    """Delete a field mapping. Admin only."""
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "admin")

    stmt = select(ERPFieldMapping).where(
        ERPFieldMapping.id == mapping_id,
        ERPFieldMapping.connector_id == connector_id,
    )
    result = await session.execute(stmt)
    mapping = result.scalar_one_or_none()
    if mapping is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Field mapping {mapping_id} not found on connector {connector_id}",
        )

    await session.delete(mapping)
    await session.commit()

    logger.info(
        "erp_mapping_deleted",
        mapping_id=mapping_id,
        connector_id=connector_id,
        user=user.username,
    )


# ===========================================================================
# SYNC SCHEDULE
# ===========================================================================


@router.put(
    "/connectors/{connector_id}/schedule",
    response_model=ERPSyncScheduleResponse,
)
async def upsert_schedule(
    connector_id: int,
    data: ERPSyncScheduleUpdate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_admin),
) -> ERPSyncScheduleResponse:
    """Create or update a sync schedule for a connector. Admin only.

    Each connector supports at most one schedule per direction,
    enforced by a UNIQUE(connector_id, direction) constraint.
    """
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "admin")

    # Validate cron expression
    try:
        from croniter import croniter

        if not croniter.is_valid(data.cron_expression):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid cron expression: {data.cron_expression}",
            )
        # Compute next_run_at
        cron = croniter(data.cron_expression, datetime.now(timezone.utc))
        next_run = cron.get_next(datetime)
    except ImportError:
        # croniter not installed — accept expression, no pre-validation
        next_run = None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid cron expression: {e}",
        )

    # Upsert: find existing schedule for this connector+direction
    stmt = select(ERPSyncSchedule).where(
        ERPSyncSchedule.connector_id == connector_id,
        ERPSyncSchedule.direction == data.direction,
    )
    result = await session.execute(stmt)
    schedule = result.scalar_one_or_none()

    if schedule is None:
        schedule = ERPSyncSchedule(
            connector_id=connector_id,
            direction=data.direction,
            cron_expression=data.cron_expression,
            is_active=data.is_active,
            next_run_at=next_run,
        )
        session.add(schedule)
    else:
        schedule.cron_expression = data.cron_expression
        schedule.is_active = data.is_active
        schedule.next_run_at = next_run

    await session.commit()
    await session.refresh(schedule)

    logger.info(
        "erp_schedule_upserted",
        schedule_id=schedule.id,
        connector_id=connector_id,
        direction=data.direction,
        cron=data.cron_expression,
        user=user.username,
    )
    return ERPSyncScheduleResponse.model_validate(schedule)


@router.delete(
    "/connectors/{connector_id}/schedule/{direction}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_schedule(
    connector_id: int,
    direction: str,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_admin),
) -> None:
    """Delete a sync schedule. Admin only."""
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "admin")

    if direction not in ("inbound", "outbound"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Direction must be 'inbound' or 'outbound'",
        )

    stmt = select(ERPSyncSchedule).where(
        ERPSyncSchedule.connector_id == connector_id,
        ERPSyncSchedule.direction == direction,
    )
    result = await session.execute(stmt)
    schedule = result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No {direction} schedule found for connector {connector_id}",
        )

    await session.delete(schedule)
    await session.commit()

    logger.info(
        "erp_schedule_deleted",
        connector_id=connector_id,
        direction=direction,
        user=user.username,
    )


# ===========================================================================
# SYNC LOGS
# ===========================================================================


@router.get(
    "/connectors/{connector_id}/logs",
    response_model=list[ERPSyncLogResponse],
)
async def list_sync_logs(
    connector_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[ERPSyncLogResponse]:
    """List sync logs for a connector, paginated.

    Requires engineer+ role for the connector's plant.
    """
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "engineer")

    stmt = (
        select(ERPSyncLog)
        .where(ERPSyncLog.connector_id == connector_id)
        .order_by(ERPSyncLog.started_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.execute(stmt)
    logs = result.scalars().all()
    return [_sync_log_to_response(log) for log in logs]


# ===========================================================================
# MANUAL SYNC
# ===========================================================================


@router.post(
    "/connectors/{connector_id}/sync",
    response_model=ERPManualSyncResponse,
)
async def trigger_manual_sync(
    connector_id: int,
    direction: str = Query("inbound", pattern="^(inbound|outbound)$"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_admin),
    request: Request = None,  # type: ignore[assignment]
) -> ERPManualSyncResponse:
    """Trigger a manual sync for a connector. Admin only.

    Uses the ERPSyncEngine to execute the sync operation.
    """
    connector = await _get_connector_or_404(session, connector_id)
    check_plant_role(user, connector.plant_id, "admin")

    if not connector.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot sync an inactive connector",
        )

    try:
        # Get the sync engine from app state (set up by integration agent in main.py)
        erp_sync_engine = getattr(request.app.state, "erp_sync_engine", None)
        if erp_sync_engine is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="ERP sync engine not available",
            )

        sync_log = await erp_sync_engine.execute_manual_sync(connector_id, direction)
        return ERPManualSyncResponse(
            status=sync_log.status,
            records_processed=sync_log.records_processed,
            records_failed=sync_log.records_failed,
            message=f"Sync completed with status: {sync_log.status}",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("manual_sync_failed", connector_id=connector_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sync operation failed. Check server logs for details.",
        )


# ===========================================================================
# INBOUND WEBHOOK
# ===========================================================================


@router.post("/connectors/{connector_id}/webhook")
async def receive_webhook(
    connector_id: int,
    request: Request,
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Receive an inbound webhook from an ERP system.

    Validates HMAC-SHA256 signature, parses payload, and applies
    field mappings to create SPC data. No JWT auth required — uses
    HMAC signature from the connector's auth_config.
    """
    connector = await _get_connector_or_404(session, connector_id, load_mappings=True)

    if not connector.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Connector is inactive",
        )

    if connector.connector_type != "generic_webhook":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Connector is not a webhook type",
        )

    # Read raw body
    raw_body = await request.body()

    # Validate HMAC signature
    from openspc.core.erp.webhook_receiver import WebhookReceiver
    from openspc.db.dialects import decrypt_password

    try:
        enc_key = get_encryption_key()
        auth_config_json = (
            decrypt_password(connector.auth_config, enc_key)
            if connector.auth_config and connector.auth_config != "{}"
            else "{}"
        )
        auth_config = json.loads(auth_config_json)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt connector credentials",
        )

    hmac_secret = auth_config.get("hmac_secret", "")
    if not hmac_secret:
        # Reject webhooks without HMAC secret configured — unauthenticated endpoint
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Webhook HMAC secret not configured on this connector",
        )
    if not x_hub_signature_256:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Hub-Signature-256 header",
        )
    receiver = WebhookReceiver(hmac_secret)
    if not receiver.validate_signature(raw_body, x_hub_signature_256):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid HMAC signature",
        )

    # Parse payload
    try:
        receiver = WebhookReceiver(hmac_secret or "unused")
        payload = receiver.parse_payload(raw_body)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Apply field mappings
    inbound_mappings = [
        {
            "erp_field_path": m.erp_field_path,
            "openspc_entity": m.openspc_entity,
            "openspc_field": m.openspc_field,
            "transform": m.transform,
        }
        for m in connector.field_mappings
        if m.is_active and m.direction in ("inbound", "bidirectional")
    ]

    mapped_data = receiver.apply_field_mappings(payload, inbound_mappings)

    # Log the webhook
    sync_log = ERPSyncLog(
        connector_id=connector_id,
        direction="inbound",
        status="success",
        records_processed=len(mapped_data),
        records_failed=0,
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
        detail=json.dumps({"webhook": True, "entities": list(mapped_data.keys())}),
    )
    session.add(sync_log)

    connector.last_sync_at = datetime.now(timezone.utc)
    connector.status = "connected"
    connector.last_error = None

    await session.commit()

    logger.info(
        "erp_webhook_received",
        connector_id=connector_id,
        entities=list(mapped_data.keys()),
    )

    return {
        "status": "accepted",
        "entities_mapped": list(mapped_data.keys()),
        "records": len(mapped_data),
    }
