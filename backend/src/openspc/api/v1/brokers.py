"""MQTT Broker REST endpoints for OpenSPC.

Provides CRUD operations for MQTT broker configuration and connection management.
"""

import asyncio
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import get_current_user, get_current_admin, get_current_engineer, get_db_session
from openspc.api.schemas.broker import (
    BrokerAllStatesResponse,
    BrokerConnectionStatus,
    BrokerCreate,
    BrokerResponse,
    BrokerTestRequest,
    BrokerTestResponse,
    BrokerUpdate,
    DiscoveredTopicResponse,
    TopicTreeNodeResponse,
)
from openspc.api.schemas.common import PaginatedResponse
from openspc.db.models.broker import MQTTBroker
from openspc.db.models.user import User
from openspc.db.repositories import BrokerRepository

router = APIRouter(prefix="/api/v1/brokers", tags=["brokers"])


# Dependency for BrokerRepository
async def get_broker_repository(
    session: AsyncSession = Depends(get_db_session),
) -> BrokerRepository:
    """Dependency to get BrokerRepository instance."""
    return BrokerRepository(session)


@router.get("/", response_model=PaginatedResponse[BrokerResponse])
async def list_brokers(
    active_only: bool = Query(False, description="Only return active brokers"),
    plant_id: int | None = Query(None, description="Filter by plant ID"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of items to return"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> PaginatedResponse[BrokerResponse]:
    """List MQTT broker configurations with optional filtering.

    Returns paginated list of broker configurations.
    Passwords are never returned in responses.
    """
    # Build query
    stmt = select(MQTTBroker)

    if plant_id is not None:
        stmt = stmt.where(MQTTBroker.plant_id == plant_id)

    if active_only:
        stmt = stmt.where(MQTTBroker.is_active == True)

    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    # Apply pagination
    stmt = stmt.offset(offset).limit(limit).order_by(MQTTBroker.id)
    result = await session.execute(stmt)
    brokers = list(result.scalars().all())

    # Convert to response models
    items = [BrokerResponse.model_validate(broker) for broker in brokers]

    return PaginatedResponse(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("/", response_model=BrokerResponse, status_code=status.HTTP_201_CREATED)
async def create_broker(
    data: BrokerCreate,
    repo: BrokerRepository = Depends(get_broker_repository),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> BrokerResponse:
    """Create a new MQTT broker configuration.

    Validates that the broker name is unique.
    """
    # Check for duplicate name
    existing = await repo.get_by_name(data.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Broker with name '{data.name}' already exists"
        )

    # Create broker
    broker = await repo.create(**data.model_dump())
    await session.commit()

    return BrokerResponse.model_validate(broker)


# -----------------------------------------------------------------------
# Static routes MUST come before /{broker_id} to avoid path conflicts
# -----------------------------------------------------------------------


@router.get("/all/status", response_model=BrokerAllStatesResponse)
async def get_all_broker_status(
    plant_id: int | None = Query(None, description="Filter by plant ID"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> BrokerAllStatesResponse:
    """Get connection status of all configured brokers.

    Returns status for every broker in the database, including those
    that are not currently connected. Optionally filter by plant.
    """
    from openspc.mqtt import mqtt_manager

    repo = BrokerRepository(session)

    # Get brokers from DB, optionally filtered by plant
    stmt = select(MQTTBroker)
    if plant_id is not None:
        stmt = stmt.where(MQTTBroker.plant_id == plant_id)
    stmt = stmt.order_by(MQTTBroker.id)
    result = await session.execute(stmt)
    brokers = list(result.scalars().all())

    states = []
    all_states = mqtt_manager.get_all_states()

    for broker in brokers:
        state = all_states.get(broker.id)
        if state:
            states.append(BrokerConnectionStatus(
                broker_id=broker.id,
                broker_name=broker.name,
                is_connected=state.is_connected,
                last_connected=state.last_connected,
                error_message=state.error_message,
                subscribed_topics=state.subscribed_topics,
            ))
        else:
            states.append(BrokerConnectionStatus(
                broker_id=broker.id,
                broker_name=broker.name,
                is_connected=False,
                last_connected=None,
                error_message="Not connected",
                subscribed_topics=[],
            ))

    return BrokerAllStatesResponse(states=states)


@router.get("/current/status", response_model=BrokerConnectionStatus)
async def get_current_connection_status(
    _user: User = Depends(get_current_user),
) -> BrokerConnectionStatus:
    """Get status of the currently connected broker.

    Returns connection state without needing to know the broker ID.
    """
    from openspc.mqtt import mqtt_manager

    state = mqtt_manager.state

    if state.broker_id is None:
        return BrokerConnectionStatus(
            broker_id=0,
            broker_name="None",
            is_connected=False,
            last_connected=None,
            error_message=state.error_message or "No broker configured",
            subscribed_topics=[],
        )

    return BrokerConnectionStatus(
        broker_id=state.broker_id,
        broker_name=state.broker_name or "Unknown",
        is_connected=state.is_connected,
        last_connected=state.last_connected,
        error_message=state.error_message,
        subscribed_topics=state.subscribed_topics,
    )


@router.post("/disconnect", response_model=dict)
async def disconnect_broker(
    _user: User = Depends(get_current_engineer),
) -> dict:
    """Disconnect from the current MQTT broker.

    Gracefully disconnects without changing the active broker configuration.
    """
    from openspc.mqtt import mqtt_manager

    await mqtt_manager.shutdown()

    return {"message": "Disconnected from MQTT broker"}


@router.post("/test", response_model=BrokerTestResponse)
async def test_broker_connection(
    data: BrokerTestRequest,
    _user: User = Depends(get_current_engineer),
) -> BrokerTestResponse:
    """Test connection to an MQTT broker.

    Attempts to connect with provided settings and returns success/failure.
    Does not persist any configuration.
    """
    try:
        import aiomqtt

        # Create config for test connection
        start_time = asyncio.get_event_loop().time()

        async with aiomqtt.Client(
            hostname=data.host,
            port=data.port,
            username=data.username,
            password=data.password,
            identifier="openspc-test-client",
            timeout=5.0,
        ) as client:
            # Connection successful
            latency = (asyncio.get_event_loop().time() - start_time) * 1000

            return BrokerTestResponse(
                success=True,
                message=f"Successfully connected to {data.host}:{data.port}",
                latency_ms=round(latency, 2),
            )

    except ImportError:
        return BrokerTestResponse(
            success=False,
            message="aiomqtt library not installed",
        )
    except asyncio.TimeoutError:
        return BrokerTestResponse(
            success=False,
            message=f"Connection timeout connecting to {data.host}:{data.port}",
        )
    except Exception as e:
        return BrokerTestResponse(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


# -----------------------------------------------------------------------
# Parameterized /{broker_id} routes
# -----------------------------------------------------------------------


@router.get("/{broker_id}", response_model=BrokerResponse)
async def get_broker(
    broker_id: int,
    repo: BrokerRepository = Depends(get_broker_repository),
    _user: User = Depends(get_current_user),
) -> BrokerResponse:
    """Get MQTT broker configuration by ID.

    Password is never returned in response.
    """
    broker = await repo.get_by_id(broker_id)
    if broker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Broker {broker_id} not found"
        )

    return BrokerResponse.model_validate(broker)


@router.patch("/{broker_id}", response_model=BrokerResponse)
async def update_broker(
    broker_id: int,
    data: BrokerUpdate,
    repo: BrokerRepository = Depends(get_broker_repository),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> BrokerResponse:
    """Update MQTT broker configuration.

    Supports partial updates - only provided fields will be updated.
    """
    # Get existing broker
    broker = await repo.get_by_id(broker_id)
    if broker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Broker {broker_id} not found"
        )

    # Check for duplicate name if name is being changed
    if data.name and data.name != broker.name:
        existing = await repo.get_by_name(data.name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Broker with name '{data.name}' already exists"
            )

    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(broker, key, value)

    await session.commit()
    await session.refresh(broker)

    return BrokerResponse.model_validate(broker)


@router.delete("/{broker_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_broker(
    broker_id: int,
    repo: BrokerRepository = Depends(get_broker_repository),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_admin),
) -> None:
    """Delete MQTT broker configuration.

    Returns 404 if broker not found.
    """
    broker = await repo.get_by_id(broker_id)
    if broker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Broker {broker_id} not found"
        )

    await session.delete(broker)
    await session.commit()


@router.post("/{broker_id}/activate", response_model=BrokerResponse)
async def activate_broker(
    broker_id: int,
    repo: BrokerRepository = Depends(get_broker_repository),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> BrokerResponse:
    """Set a broker as the active connection.

    Deactivates any other active brokers.
    """
    broker = await repo.set_active(broker_id)
    if broker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Broker {broker_id} not found"
        )

    await session.commit()
    return BrokerResponse.model_validate(broker)


@router.get("/{broker_id}/status", response_model=BrokerConnectionStatus)
async def get_broker_status(
    broker_id: int,
    repo: BrokerRepository = Depends(get_broker_repository),
    _user: User = Depends(get_current_user),
) -> BrokerConnectionStatus:
    """Get connection status for a broker.

    Returns current connection state, subscribed topics, and any errors.
    """
    from openspc.mqtt import mqtt_manager

    broker = await repo.get_by_id(broker_id)
    if broker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Broker {broker_id} not found"
        )

    # Get per-broker state from multi-broker manager
    state = mqtt_manager.get_state(broker_id)

    if state:
        return BrokerConnectionStatus(
            broker_id=broker.id,
            broker_name=broker.name,
            is_connected=state.is_connected,
            last_connected=state.last_connected,
            error_message=state.error_message,
            subscribed_topics=state.subscribed_topics,
        )
    else:
        # This broker is not connected
        return BrokerConnectionStatus(
            broker_id=broker.id,
            broker_name=broker.name,
            is_connected=False,
            last_connected=None,
            error_message="Broker is not connected",
            subscribed_topics=[],
        )


@router.post("/{broker_id}/connect", response_model=BrokerConnectionStatus)
async def connect_to_broker(
    broker_id: int,
    repo: BrokerRepository = Depends(get_broker_repository),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> BrokerConnectionStatus:
    """Connect to a specific broker.

    Disconnects from current broker (if any) and connects to the specified broker.
    Also sets the broker as active.
    """
    from openspc.mqtt import mqtt_manager

    # Get broker
    broker = await repo.get_by_id(broker_id)
    if broker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Broker {broker_id} not found"
        )

    # Set as active and connect
    await repo.set_active(broker_id)
    await session.commit()

    # Connect via MQTT manager
    success = await mqtt_manager.switch_broker(broker_id, session)

    state = mqtt_manager.state
    return BrokerConnectionStatus(
        broker_id=broker.id,
        broker_name=broker.name,
        is_connected=state.is_connected,
        last_connected=state.last_connected,
        error_message=state.error_message if not success else None,
        subscribed_topics=state.subscribed_topics,
    )


# -----------------------------------------------------------------------
# Topic discovery
# -----------------------------------------------------------------------


@router.post("/{broker_id}/discover", status_code=status.HTTP_202_ACCEPTED)
async def start_discovery(
    broker_id: int,
    repo: BrokerRepository = Depends(get_broker_repository),
    _user: User = Depends(get_current_engineer),
) -> dict:
    """Start topic discovery on a broker.

    Subscribes to wildcard topics to discover available MQTT topics.
    Requires the broker to be connected.
    """
    from openspc.mqtt import mqtt_manager
    from openspc.mqtt.discovery import TopicDiscoveryService

    broker = await repo.get_by_id(broker_id)
    if broker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Broker {broker_id} not found"
        )

    client = mqtt_manager.get_client(broker_id)
    if client is None or not client.is_connected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Broker {broker_id} is not connected"
        )

    # Check if discovery already active
    existing = mqtt_manager.get_discovery_service(broker_id)
    if existing and existing.is_active:
        return {"message": f"Discovery already active on broker {broker.name}"}

    # Create and start discovery service
    discovery = TopicDiscoveryService(max_topics=10000, ttl_seconds=300)
    await discovery.start_discovery(client)
    mqtt_manager.set_discovery_service(broker_id, discovery)

    return {"message": f"Discovery started on broker {broker.name}"}


@router.delete("/{broker_id}/discover")
async def stop_discovery(
    broker_id: int,
    repo: BrokerRepository = Depends(get_broker_repository),
    _user: User = Depends(get_current_engineer),
) -> dict:
    """Stop topic discovery on a broker."""
    from openspc.mqtt import mqtt_manager

    broker = await repo.get_by_id(broker_id)
    if broker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Broker {broker_id} not found"
        )

    discovery = mqtt_manager.get_discovery_service(broker_id)
    if discovery is None:
        return {"message": "Discovery was not active"}

    client = mqtt_manager.get_client(broker_id)
    if client:
        await discovery.stop_discovery(client)

    mqtt_manager.remove_discovery_service(broker_id)

    return {"message": f"Discovery stopped on broker {broker.name}"}


def _convert_tree_node(node) -> TopicTreeNodeResponse:
    """Recursively convert TopicTreeNode to response schema."""
    from openspc.api.schemas.broker import SparkplugMetricInfoResponse

    return TopicTreeNodeResponse(
        name=node.name,
        full_topic=node.full_topic,
        children=[_convert_tree_node(child) for child in node.children.values()],
        message_count=node.message_count,
        is_sparkplug=node.is_sparkplug,
        sparkplug_metrics=[
            SparkplugMetricInfoResponse(name=m.name, data_type=m.data_type)
            for m in node.sparkplug_metrics
        ],
    )


@router.get("/{broker_id}/topics")
async def get_topics(
    broker_id: int,
    format: Literal["flat", "tree"] = Query("flat", description="Response format: flat or tree"),
    search: str | None = Query(None, description="Filter topics by substring"),
    repo: BrokerRepository = Depends(get_broker_repository),
    _user: User = Depends(get_current_engineer),
) -> list[DiscoveredTopicResponse] | TopicTreeNodeResponse:
    """Get discovered topics for a broker.

    Returns topics in either flat list or tree format.
    Requires discovery to have been started on the broker.
    """
    from openspc.mqtt import mqtt_manager

    broker = await repo.get_by_id(broker_id)
    if broker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Broker {broker_id} not found"
        )

    discovery = mqtt_manager.get_discovery_service(broker_id)
    if discovery is None:
        if format == "tree":
            return TopicTreeNodeResponse(name="root")
        return []

    if format == "tree":
        tree = discovery.get_topic_tree()
        return _convert_tree_node(tree)
    else:
        if search:
            topics = discovery.search_topics(search)
        else:
            topics = discovery.get_discovered_topics()

        from openspc.api.schemas.broker import SparkplugMetricInfoResponse

        return [
            DiscoveredTopicResponse(
                topic=t.topic,
                message_count=t.message_count,
                last_seen=t.last_seen,
                last_payload_size=t.last_payload_size,
                is_sparkplug=t.is_sparkplug,
                sparkplug_group=t.sparkplug_group,
                sparkplug_node=t.sparkplug_node,
                sparkplug_device=t.sparkplug_device,
                sparkplug_message_type=t.sparkplug_message_type,
                sparkplug_metrics=[
                    SparkplugMetricInfoResponse(name=m.name, data_type=m.data_type)
                    for m in t.sparkplug_metrics
                ],
            )
            for t in topics
        ]
