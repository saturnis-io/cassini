"""Gage Bridge REST endpoints -- RS-232/USB serial gage integration.

Provides CRUD for gage bridges and ports, bridge agent authentication
via API key, heartbeat, config pull, and auto-mapping of gage ports
to SPC characteristics via MQTTDataSource.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
    require_role,
)
from cassini.api.schemas.gage import (
    BridgeHeartbeat,
    GageBridgeCreate,
    GageBridgeDetailResponse,
    GageBridgeRegistered,
    GageBridgeResponse,
    GageBridgeUpdate,
    GagePortCreate,
    GagePortResponse,
    GagePortUpdate,
    GageProfileResponse,
)
from cassini.db.models.broker import MQTTBroker
from cassini.db.models.data_source import DataSource, MQTTDataSource
from cassini.db.models.gage import GageBridge, GagePort
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/gage-bridges", tags=["gage-bridges"])


# ---------------------------------------------------------------------------
# Static protocol profiles
# ---------------------------------------------------------------------------

_PROFILES = [
    GageProfileResponse(
        id="mitutoyo_digimatic",
        name="Mitutoyo Digimatic",
        description="Mitutoyo SPC output via Digimatic protocol (9600 8N1)",
        default_baud_rate=9600,
        default_data_bits=8,
        default_parity="none",
        default_stop_bits=1.0,
        parse_pattern=r"^\d{2}[A-Z]([+-]\d+\.\d+)",
    ),
    GageProfileResponse(
        id="generic",
        name="Generic Serial",
        description="Generic RS-232 serial gage with user-defined parse pattern",
        default_baud_rate=9600,
        default_data_bits=8,
        default_parity="none",
        default_stop_bits=1.0,
        parse_pattern=None,
    ),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hash_api_key(key: str) -> str:
    """SHA-256 hash of a plaintext API key."""
    return hashlib.sha256(key.encode()).hexdigest()


async def _get_bridge_or_404(
    session: AsyncSession,
    bridge_id: int,
    *,
    load_ports: bool = False,
) -> GageBridge:
    """Fetch a gage bridge by ID, optionally eager-loading ports."""
    stmt = select(GageBridge).where(GageBridge.id == bridge_id)
    if load_ports:
        stmt = stmt.options(selectinload(GageBridge.ports))
    result = await session.execute(stmt)
    bridge = result.scalar_one_or_none()
    if bridge is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Gage bridge {bridge_id} not found",
        )
    return bridge


async def get_bridge_by_api_key(
    authorization: str | None = Header(None),
    session: AsyncSession = Depends(get_db_session),
) -> GageBridge:
    """Authenticate a bridge agent via ``Authorization: Bearer <api_key>``.

    Hashes the incoming key and looks up by ``api_key_hash``.
    Returns the GageBridge with ports eager-loaded.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    raw_key = authorization.split(" ", 1)[1]
    key_hash = _hash_api_key(raw_key)

    stmt = (
        select(GageBridge)
        .where(GageBridge.api_key_hash == key_hash)
        .options(selectinload(GageBridge.ports))
    )
    result = await session.execute(stmt)
    bridge = result.scalar_one_or_none()
    if bridge is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return bridge


async def _auto_map_datasource(
    session: AsyncSession,
    port: GagePort,
    bridge: GageBridge,
) -> None:
    """Auto-create MQTTDataSource linking a gage port to a characteristic.

    Called when ``characteristic_id`` is set on a port.  Raises 409 if the
    characteristic already has an existing DataSource.
    """
    if port.characteristic_id is None:
        return

    # Check for existing DataSource on this characteristic
    existing = (
        await session.execute(
            select(DataSource).where(
                DataSource.characteristic_id == port.characteristic_id
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Characteristic {port.characteristic_id} already has a "
                f"data source (id={existing.id}, type={existing.type})"
            ),
        )

    ds = MQTTDataSource(
        characteristic_id=port.characteristic_id,
        broker_id=bridge.mqtt_broker_id,
        topic=port.mqtt_topic,
        trigger_strategy="on_change",
        is_active=True,
    )
    session.add(ds)

    # Auto-set manual entry policy if currently "open"
    from cassini.db.models.characteristic import Characteristic

    char_result = await session.execute(
        select(Characteristic).where(Characteristic.id == port.characteristic_id)
    )
    char = char_result.scalar_one_or_none()
    if char is not None and char.manual_entry_policy == "open":
        char.manual_entry_policy = "supplemental"


async def _remove_auto_datasource(
    session: AsyncSession,
    characteristic_id: int | None,
    mqtt_topic: str,
) -> None:
    """Remove the auto-created MQTTDataSource for a gage port.

    Matches on both ``characteristic_id`` and ``topic`` to avoid deleting
    user-created data sources unrelated to this gage port.
    """
    if characteristic_id is None:
        return

    stmt = (
        select(MQTTDataSource)
        .where(
            MQTTDataSource.characteristic_id == characteristic_id,
            MQTTDataSource.topic == mqtt_topic,
        )
    )
    result = await session.execute(stmt)
    ds = result.scalar_one_or_none()
    if ds is not None:
        await session.delete(ds)

        # Reset manual entry policy since automated data source is removed
        from cassini.db.models.characteristic import Characteristic

        char_result = await session.execute(
            select(Characteristic).where(Characteristic.id == characteristic_id)
        )
        char = char_result.scalar_one_or_none()
        if char is not None:
            char.manual_entry_policy = "open"


# ===========================================================================
# PROFILES  (static route -- MUST come before /{bridge_id} params)
# ===========================================================================


@router.get("/profiles", response_model=list[GageProfileResponse])
async def list_profiles(
    user: User = Depends(require_role("supervisor")),
) -> list[GageProfileResponse]:
    """List available gage protocol profiles.

    Requires supervisor+ role at any plant.
    """
    return _PROFILES


# ===========================================================================
# BRIDGE CRUD
# ===========================================================================


@router.post("", response_model=GageBridgeRegistered, status_code=status.HTTP_201_CREATED)
async def register_bridge(
    body: GageBridgeCreate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> GageBridgeRegistered:
    """Register a new gage bridge. Returns the plaintext API key (shown once).

    Requires engineer+ role for the target plant.
    """
    check_plant_role(user, body.plant_id, "engineer")

    # Generate API key -- store hash, return plaintext once
    raw_key = secrets.token_urlsafe(32)
    key_hash = _hash_api_key(raw_key)

    bridge = GageBridge(
        plant_id=body.plant_id,
        name=body.name,
        api_key_hash=key_hash,
        mqtt_broker_id=body.mqtt_broker_id,
        status="offline",
        registered_by=user.id,
    )
    session.add(bridge)
    await session.commit()
    await session.refresh(bridge)

    logger.info("gage_bridge_registered", bridge_id=bridge.id, user=user.username)

    # Build response with the base bridge data + plaintext api_key
    base = GageBridgeResponse.model_validate(bridge)
    return GageBridgeRegistered(**base.model_dump(), api_key=raw_key)


@router.get("", response_model=list[GageBridgeResponse])
async def list_bridges(
    plant_id: int = Query(..., description="Plant ID (required)"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[GageBridgeResponse]:
    """List gage bridges for a plant.

    Requires supervisor+ role for the plant.
    """
    check_plant_role(user, plant_id, "supervisor")

    stmt = (
        select(GageBridge)
        .where(GageBridge.plant_id == plant_id)
        .order_by(GageBridge.created_at.desc())
    )
    result = await session.execute(stmt)
    bridges = list(result.scalars().all())
    return [GageBridgeResponse.model_validate(b) for b in bridges]


# ===========================================================================
# BRIDGE AGENT ENDPOINTS  (API-key auth, no JWT)
# ===========================================================================


@router.get("/my-config")
async def get_my_config(
    session: AsyncSession = Depends(get_db_session),
    bridge: GageBridge = Depends(get_bridge_by_api_key),
) -> dict:
    """Pull bridge configuration using only API key (no bridge_id needed).

    The bridge agent calls this on startup to discover its own config.
    Authenticated via ``Authorization: Bearer <api_key>``.
    """
    # Delegate to the same logic as /{bridge_id}/config
    # Build MQTT connection info from broker (if configured)
    mqtt_config: dict | None = None
    if bridge.mqtt_broker_id is not None:
        broker_result = await session.execute(
            select(MQTTBroker).where(MQTTBroker.id == bridge.mqtt_broker_id)
        )
        broker = broker_result.scalar_one_or_none()
        if broker is not None:
            username: str | None = None
            password: str | None = None
            key: bytes | None = None
            try:
                from cassini.db.dialects import decrypt_password, get_encryption_key

                key = get_encryption_key()
                if broker.username:
                    username = decrypt_password(broker.username, key)
                if broker.password:
                    password = decrypt_password(broker.password, key)
            except Exception:
                logger.warning(
                    "broker_credential_decrypt_failed",
                    broker_id=broker.id,
                )
                # Don't fall back to raw encrypted values — send None

            mqtt_config = {
                "host": broker.host,
                "port": broker.port,
                "username": username,
                "password": password,
                "use_tls": broker.use_tls,
                "client_id": broker.client_id,
            }

            # Include decrypted certs for TLS-enabled brokers
            if broker.use_tls and key is not None:
                if broker.ca_cert_pem:
                    try:
                        mqtt_config["ca_cert_pem"] = decrypt_password(broker.ca_cert_pem, key)
                    except Exception:
                        logger.warning("broker_ca_cert_decrypt_failed", broker_id=broker.id)
                if broker.client_cert_pem:
                    try:
                        mqtt_config["client_cert_pem"] = decrypt_password(broker.client_cert_pem, key)
                    except Exception:
                        logger.warning("broker_client_cert_decrypt_failed", broker_id=broker.id)
                if broker.client_key_pem:
                    try:
                        mqtt_config["client_key_pem"] = decrypt_password(broker.client_key_pem, key)
                    except Exception:
                        logger.warning("broker_client_key_decrypt_failed", broker_id=broker.id)
                mqtt_config["tls_insecure"] = broker.tls_insecure

    active_ports = [
        {
            "id": p.id,
            "port_name": p.port_name,
            "baud_rate": p.baud_rate,
            "data_bits": p.data_bits,
            "parity": p.parity,
            "stop_bits": p.stop_bits,
            "protocol_profile": p.protocol_profile,
            "parse_pattern": p.parse_pattern,
            "mqtt_topic": p.mqtt_topic,
            "characteristic_id": p.characteristic_id,
        }
        for p in bridge.ports
        if p.is_active
    ]

    return {
        "bridge_id": bridge.id,
        "bridge_name": bridge.name,
        "mqtt": mqtt_config,
        "ports": active_ports,
    }


@router.get("/{bridge_id}", response_model=GageBridgeDetailResponse)
async def get_bridge(
    bridge_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> GageBridgeDetailResponse:
    """Get a single gage bridge with all ports.

    Requires supervisor+ role for the bridge's plant.
    """
    bridge = await _get_bridge_or_404(session, bridge_id, load_ports=True)
    check_plant_role(user, bridge.plant_id, "supervisor")

    return GageBridgeDetailResponse.model_validate(bridge)


@router.put("/{bridge_id}", response_model=GageBridgeResponse)
async def update_bridge(
    bridge_id: int,
    body: GageBridgeUpdate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> GageBridgeResponse:
    """Update a gage bridge.

    Requires engineer+ role for the bridge's plant.
    """
    bridge = await _get_bridge_or_404(session, bridge_id)
    check_plant_role(user, bridge.plant_id, "engineer")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(bridge, field, value)

    await session.commit()
    await session.refresh(bridge)

    logger.info(
        "gage_bridge_updated",
        bridge_id=bridge_id,
        user=user.username,
        fields=list(update_data.keys()),
    )
    return GageBridgeResponse.model_validate(bridge)


@router.delete("/{bridge_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_bridge(
    bridge_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Delete a gage bridge and all its ports.

    Auto-created MQTTDataSources for mapped ports are also removed.
    Requires engineer+ role for the bridge's plant.
    """
    bridge = await _get_bridge_or_404(session, bridge_id, load_ports=True)
    check_plant_role(user, bridge.plant_id, "engineer")

    # Clean up auto-created data sources for all mapped ports
    for port in bridge.ports:
        await _remove_auto_datasource(session, port.characteristic_id, port.mqtt_topic)

    await session.delete(bridge)
    await session.commit()

    logger.info("gage_bridge_deleted", bridge_id=bridge_id, user=user.username)


@router.post("/{bridge_id}/heartbeat", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def bridge_heartbeat(
    bridge_id: int,
    body: BridgeHeartbeat,
    session: AsyncSession = Depends(get_db_session),
    bridge: GageBridge = Depends(get_bridge_by_api_key),
) -> None:
    """Bridge agent heartbeat.  Updates status and last_heartbeat_at.

    Authenticated via ``Authorization: Bearer <api_key>`` (not JWT).
    """
    if bridge.id != bridge_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key does not match this bridge",
        )

    bridge.status = body.status
    bridge.last_heartbeat_at = datetime.now(timezone.utc)
    await session.commit()


@router.get("/{bridge_id}/config")
async def get_bridge_config(
    bridge_id: int,
    session: AsyncSession = Depends(get_db_session),
    bridge: GageBridge = Depends(get_bridge_by_api_key),
) -> dict:
    """Pull bridge configuration for the bridge agent.

    Returns bridge info, MQTT broker connection details, and all active
    port configurations.  Authenticated via API key.
    """
    if bridge.id != bridge_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key does not match this bridge",
        )

    # Build MQTT connection info from broker (if configured)
    mqtt_config: dict | None = None
    if bridge.mqtt_broker_id is not None:
        broker_result = await session.execute(
            select(MQTTBroker).where(MQTTBroker.id == bridge.mqtt_broker_id)
        )
        broker = broker_result.scalar_one_or_none()
        if broker is not None:
            # Decrypt credentials — never send raw encrypted values
            username: str | None = None
            password: str | None = None
            key: bytes | None = None
            try:
                from cassini.db.dialects import decrypt_password, get_encryption_key

                key = get_encryption_key()
                if broker.username:
                    username = decrypt_password(broker.username, key)
                if broker.password:
                    password = decrypt_password(broker.password, key)
            except Exception:
                logger.warning(
                    "broker_credential_decrypt_failed",
                    broker_id=broker.id,
                )
                # Don't fall back to raw encrypted values — send None

            mqtt_config = {
                "host": broker.host,
                "port": broker.port,
                "username": username,
                "password": password,
                "use_tls": broker.use_tls,
                "client_id": broker.client_id,
            }

            # Include decrypted certs for TLS-enabled brokers
            if broker.use_tls and key is not None:
                if broker.ca_cert_pem:
                    try:
                        mqtt_config["ca_cert_pem"] = decrypt_password(broker.ca_cert_pem, key)
                    except Exception:
                        logger.warning("broker_ca_cert_decrypt_failed", broker_id=broker.id)
                if broker.client_cert_pem:
                    try:
                        mqtt_config["client_cert_pem"] = decrypt_password(broker.client_cert_pem, key)
                    except Exception:
                        logger.warning("broker_client_cert_decrypt_failed", broker_id=broker.id)
                if broker.client_key_pem:
                    try:
                        mqtt_config["client_key_pem"] = decrypt_password(broker.client_key_pem, key)
                    except Exception:
                        logger.warning("broker_client_key_decrypt_failed", broker_id=broker.id)
                mqtt_config["tls_insecure"] = broker.tls_insecure

    # Collect active ports
    active_ports = [
        {
            "id": p.id,
            "port_name": p.port_name,
            "baud_rate": p.baud_rate,
            "data_bits": p.data_bits,
            "parity": p.parity,
            "stop_bits": p.stop_bits,
            "protocol_profile": p.protocol_profile,
            "parse_pattern": p.parse_pattern,
            "mqtt_topic": p.mqtt_topic,
            "characteristic_id": p.characteristic_id,
        }
        for p in bridge.ports
        if p.is_active
    ]

    return {
        "bridge_id": bridge.id,
        "bridge_name": bridge.name,
        "mqtt": mqtt_config,
        "ports": active_ports,
    }


# ===========================================================================
# PORT CRUD
# ===========================================================================


@router.post(
    "/{bridge_id}/ports",
    response_model=GagePortResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_port(
    bridge_id: int,
    body: GagePortCreate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> GagePortResponse:
    """Add a serial port to a gage bridge.

    Auto-generates the MQTT topic.  If ``characteristic_id`` is set,
    auto-creates an MQTTDataSource mapping.
    Requires engineer+ role for the bridge's plant.
    """
    bridge = await _get_bridge_or_404(session, bridge_id)
    check_plant_role(user, bridge.plant_id, "engineer")

    mqtt_topic = f"openspc/gage/{bridge_id}/{body.port_name}/value"

    port = GagePort(
        bridge_id=bridge_id,
        port_name=body.port_name,
        baud_rate=body.baud_rate,
        data_bits=body.data_bits,
        parity=body.parity,
        stop_bits=body.stop_bits,
        protocol_profile=body.protocol_profile,
        parse_pattern=body.parse_pattern,
        mqtt_topic=mqtt_topic,
        characteristic_id=body.characteristic_id,
        is_active=body.is_active,
    )
    session.add(port)

    # Auto-map if characteristic_id is provided
    if body.characteristic_id is not None:
        await _auto_map_datasource(session, port, bridge)

    await session.commit()
    await session.refresh(port)

    logger.info(
        "gage_port_added",
        bridge_id=bridge_id,
        port_id=port.id,
        user=user.username,
    )
    return GagePortResponse.model_validate(port)


@router.put("/{bridge_id}/ports/{port_id}", response_model=GagePortResponse)
async def update_port(
    bridge_id: int,
    port_id: int,
    body: GagePortUpdate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> GagePortResponse:
    """Update a serial port configuration.

    Handles auto-mapping changes when ``characteristic_id`` is modified:
    - Old mapping removed if characteristic changes or is cleared
    - New mapping created if a new characteristic is set

    Requires engineer+ role for the bridge's plant.
    """
    bridge = await _get_bridge_or_404(session, bridge_id)
    check_plant_role(user, bridge.plant_id, "engineer")

    stmt = select(GagePort).where(GagePort.id == port_id, GagePort.bridge_id == bridge_id)
    result = await session.execute(stmt)
    port = result.scalar_one_or_none()
    if port is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Gage port {port_id} not found on bridge {bridge_id}",
        )

    update_data = body.model_dump(exclude_unset=True)

    # Compute the final desired state BEFORE making any changes
    old_char_id = port.characteristic_id
    old_topic = port.mqtt_topic

    final_char_id = update_data.get("characteristic_id", port.characteristic_id)
    final_topic = old_topic
    if "port_name" in update_data:
        final_topic = f"openspc/gage/{bridge_id}/{update_data['port_name']}/value"
        update_data["mqtt_topic"] = final_topic

    # Determine if DataSource mapping needs to change
    char_changed = "characteristic_id" in update_data and final_char_id != old_char_id
    topic_changed = final_topic != old_topic

    needs_remove = (char_changed or topic_changed) and old_char_id is not None
    needs_create = (char_changed or topic_changed) and final_char_id is not None

    # Single remove of old mapping
    if needs_remove:
        await _remove_auto_datasource(session, old_char_id, old_topic)

    # Apply all field updates
    for field, value in update_data.items():
        setattr(port, field, value)

    # Single create of new mapping
    if needs_create:
        await _auto_map_datasource(session, port, bridge)

    await session.commit()
    await session.refresh(port)

    logger.info(
        "gage_port_updated",
        bridge_id=bridge_id,
        port_id=port_id,
        user=user.username,
        fields=list(update_data.keys()),
    )
    return GagePortResponse.model_validate(port)


@router.delete(
    "/{bridge_id}/ports/{port_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_port(
    bridge_id: int,
    port_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Delete a serial port from a gage bridge.

    Removes the auto-created MQTTDataSource if the port was mapped.
    Requires engineer+ role for the bridge's plant.
    """
    bridge = await _get_bridge_or_404(session, bridge_id)
    check_plant_role(user, bridge.plant_id, "engineer")

    stmt = select(GagePort).where(GagePort.id == port_id, GagePort.bridge_id == bridge_id)
    result = await session.execute(stmt)
    port = result.scalar_one_or_none()
    if port is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Gage port {port_id} not found on bridge {bridge_id}",
        )

    # Clean up auto-created DataSource
    await _remove_auto_datasource(session, port.characteristic_id, port.mqtt_topic)

    await session.delete(port)
    await session.commit()

    logger.info(
        "gage_port_deleted",
        bridge_id=bridge_id,
        port_id=port_id,
        user=user.username,
    )
