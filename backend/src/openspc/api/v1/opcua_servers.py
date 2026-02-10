"""OPC-UA Server REST endpoints for OpenSPC.

Provides CRUD operations for OPC-UA server configuration, connection management,
and node browsing of OPC-UA address spaces.
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import get_current_admin, get_current_engineer, get_current_user, get_db_session
from openspc.api.schemas.common import PaginatedResponse
from openspc.api.schemas.opcua_server import (
    BrowsedNodeResponse,
    NodeValueResponse,
    OPCUAAllStatesResponse,
    OPCUAServerConnectionStatus,
    OPCUAServerCreate,
    OPCUAServerResponse,
    OPCUAServerTestRequest,
    OPCUAServerTestResponse,
    OPCUAServerUpdate,
)
from openspc.db.dialects import encrypt_password, get_encryption_key
from openspc.db.models.opcua_server import OPCUAServer
from openspc.db.models.user import User
from openspc.db.repositories.opcua_server import OPCUAServerRepository

router = APIRouter(prefix="/api/v1/opcua-servers", tags=["opcua-servers"])


# Dependency for OPCUAServerRepository
async def get_opcua_server_repository(
    session: AsyncSession = Depends(get_db_session),
) -> OPCUAServerRepository:
    """Dependency to get OPCUAServerRepository instance."""
    return OPCUAServerRepository(session)


@router.get("/", response_model=PaginatedResponse[OPCUAServerResponse])
async def list_opcua_servers(
    active_only: bool = Query(False, description="Only return active servers"),
    plant_id: int | None = Query(None, description="Filter by plant ID"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of items to return"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> PaginatedResponse[OPCUAServerResponse]:
    """List OPC-UA server configurations with optional filtering.

    Returns paginated list of server configurations.
    Passwords are never returned in responses.
    """
    stmt = select(OPCUAServer)

    if plant_id is not None:
        stmt = stmt.where(OPCUAServer.plant_id == plant_id)

    if active_only:
        stmt = stmt.where(OPCUAServer.is_active == True)

    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await session.execute(count_stmt)
    total = total_result.scalar_one()

    # Apply pagination
    stmt = stmt.offset(offset).limit(limit).order_by(OPCUAServer.id)
    result = await session.execute(stmt)
    servers = list(result.scalars().all())

    items = [OPCUAServerResponse.model_validate(server) for server in servers]

    return PaginatedResponse(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("/", response_model=OPCUAServerResponse, status_code=status.HTTP_201_CREATED)
async def create_opcua_server(
    data: OPCUAServerCreate,
    repo: OPCUAServerRepository = Depends(get_opcua_server_repository),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> OPCUAServerResponse:
    """Create a new OPC-UA server configuration.

    Validates that the server name is unique.
    Encrypts credentials before storage.
    """
    # Check for duplicate name
    existing = await repo.get_by_name(data.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"OPC-UA server with name '{data.name}' already exists",
        )

    # Encrypt credentials if provided
    create_data = data.model_dump()
    if data.auth_mode == "username_password":
        key = get_encryption_key()
        if data.username:
            create_data["username"] = encrypt_password(data.username, key)
        if data.password:
            create_data["password"] = encrypt_password(data.password, key)
    else:
        # Anonymous mode — clear any credentials
        create_data["username"] = None
        create_data["password"] = None

    server = await repo.create(**create_data)
    await session.commit()

    return OPCUAServerResponse.model_validate(server)


# -----------------------------------------------------------------------
# Static routes MUST come before /{server_id} to avoid path conflicts
# -----------------------------------------------------------------------


@router.post("/test", response_model=OPCUAServerTestResponse)
async def test_opcua_connection(
    data: OPCUAServerTestRequest,
    _user: User = Depends(get_current_engineer),
) -> OPCUAServerTestResponse:
    """Test connection to an OPC-UA server.

    Attempts to connect with provided settings and returns success/failure.
    Does not persist any configuration.
    """
    try:
        from asyncua import Client, ua

        start_time = asyncio.get_event_loop().time()

        client = Client(url=data.endpoint_url, timeout=data.timeout)
        if data.auth_mode == "username_password":
            client.set_user(data.username)
            client.set_password(data.password)

        await client.connect()
        latency = (asyncio.get_event_loop().time() - start_time) * 1000

        # Try to read server display name
        server_name = None
        try:
            app_desc = await client.nodes.server.read_attribute(
                ua.AttributeIds.DisplayName
            )
            server_name = str(app_desc.Value.Value)
        except Exception:
            pass

        await client.disconnect()

        return OPCUAServerTestResponse(
            success=True,
            message=f"Successfully connected to {data.endpoint_url}",
            latency_ms=round(latency, 2),
            server_name=server_name,
        )

    except ImportError:
        return OPCUAServerTestResponse(
            success=False,
            message="asyncua library not installed",
        )
    except asyncio.TimeoutError:
        return OPCUAServerTestResponse(
            success=False,
            message=f"Connection timeout connecting to {data.endpoint_url}",
        )
    except Exception as e:
        return OPCUAServerTestResponse(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


@router.get("/all/status", response_model=OPCUAAllStatesResponse)
async def get_all_opcua_status(
    plant_id: int | None = Query(None, description="Filter by plant ID"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> OPCUAAllStatesResponse:
    """Get connection status of all configured OPC-UA servers.

    Returns status for every server in the database, including those
    that are not currently connected. Optionally filter by plant.
    """
    from openspc.opcua.manager import opcua_manager

    # Get servers from DB, optionally filtered by plant
    stmt = select(OPCUAServer)
    if plant_id is not None:
        stmt = stmt.where(OPCUAServer.plant_id == plant_id)
    stmt = stmt.order_by(OPCUAServer.id)
    result = await session.execute(stmt)
    servers = list(result.scalars().all())

    states = []
    all_states = opcua_manager.get_all_states()

    for server in servers:
        state = all_states.get(server.id)
        if state:
            states.append(OPCUAServerConnectionStatus(
                server_id=server.id,
                server_name=server.name,
                endpoint_url=server.endpoint_url,
                is_connected=state.is_connected,
                last_connected=state.last_connected,
                error_message=state.error_message,
                monitored_nodes=state.monitored_nodes,
            ))
        else:
            states.append(OPCUAServerConnectionStatus(
                server_id=server.id,
                server_name=server.name,
                endpoint_url=server.endpoint_url,
                is_connected=False,
                last_connected=None,
                error_message="Not connected",
                monitored_nodes=[],
            ))

    return OPCUAAllStatesResponse(states=states)


# -----------------------------------------------------------------------
# Parameterized /{server_id} routes
# -----------------------------------------------------------------------


@router.get("/{server_id}", response_model=OPCUAServerResponse)
async def get_opcua_server(
    server_id: int,
    repo: OPCUAServerRepository = Depends(get_opcua_server_repository),
    _user: User = Depends(get_current_user),
) -> OPCUAServerResponse:
    """Get OPC-UA server configuration by ID.

    Password is never returned in response.
    """
    server = await repo.get_by_id(server_id)
    if server is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPC-UA server {server_id} not found",
        )

    return OPCUAServerResponse.model_validate(server)


@router.patch("/{server_id}", response_model=OPCUAServerResponse)
async def update_opcua_server(
    server_id: int,
    data: OPCUAServerUpdate,
    repo: OPCUAServerRepository = Depends(get_opcua_server_repository),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> OPCUAServerResponse:
    """Update OPC-UA server configuration.

    Supports partial updates — only provided fields will be updated.
    Encrypts credentials if provided.
    """
    server = await repo.get_by_id(server_id)
    if server is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPC-UA server {server_id} not found",
        )

    # Check for duplicate name if name is being changed
    if data.name and data.name != server.name:
        existing = await repo.get_by_name(data.name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"OPC-UA server with name '{data.name}' already exists",
            )

    update_data = data.model_dump(exclude_unset=True)

    # Encrypt credentials if provided
    key = get_encryption_key()
    if "username" in update_data and update_data["username"] is not None:
        update_data["username"] = encrypt_password(update_data["username"], key)
    if "password" in update_data and update_data["password"] is not None:
        update_data["password"] = encrypt_password(update_data["password"], key)

    for field, value in update_data.items():
        setattr(server, field, value)

    await session.commit()
    await session.refresh(server)

    return OPCUAServerResponse.model_validate(server)


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_opcua_server(
    server_id: int,
    repo: OPCUAServerRepository = Depends(get_opcua_server_repository),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_admin),
) -> None:
    """Delete OPC-UA server configuration.

    Also disconnects the server if currently connected.
    """
    from openspc.opcua.manager import opcua_manager

    server = await repo.get_by_id(server_id)
    if server is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPC-UA server {server_id} not found",
        )

    # Disconnect if connected
    await opcua_manager.disconnect_server(server_id)

    await session.delete(server)
    await session.commit()


@router.post("/{server_id}/connect", response_model=OPCUAServerConnectionStatus)
async def connect_opcua_server(
    server_id: int,
    repo: OPCUAServerRepository = Depends(get_opcua_server_repository),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> OPCUAServerConnectionStatus:
    """Connect to a specific OPC-UA server."""
    from openspc.opcua.manager import opcua_manager

    server = await repo.get_by_id(server_id)
    if server is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPC-UA server {server_id} not found",
        )

    success = await opcua_manager.connect_server(server_id, session)

    state = opcua_manager.get_state(server_id)
    return OPCUAServerConnectionStatus(
        server_id=server.id,
        server_name=server.name,
        endpoint_url=server.endpoint_url,
        is_connected=state.is_connected if state else False,
        last_connected=state.last_connected if state else None,
        error_message=state.error_message if state and not success else None,
        monitored_nodes=state.monitored_nodes if state else [],
    )


@router.post("/{server_id}/disconnect", response_model=OPCUAServerConnectionStatus)
async def disconnect_opcua_server(
    server_id: int,
    repo: OPCUAServerRepository = Depends(get_opcua_server_repository),
    _user: User = Depends(get_current_engineer),
) -> OPCUAServerConnectionStatus:
    """Disconnect from a specific OPC-UA server."""
    from openspc.opcua.manager import opcua_manager

    server = await repo.get_by_id(server_id)
    if server is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPC-UA server {server_id} not found",
        )

    await opcua_manager.disconnect_server(server_id)

    state = opcua_manager.get_state(server_id)
    return OPCUAServerConnectionStatus(
        server_id=server.id,
        server_name=server.name,
        endpoint_url=server.endpoint_url,
        is_connected=False,
        last_connected=state.last_connected if state else None,
        error_message="Disconnected",
        monitored_nodes=[],
    )


@router.get("/{server_id}/status", response_model=OPCUAServerConnectionStatus)
async def get_opcua_server_status(
    server_id: int,
    repo: OPCUAServerRepository = Depends(get_opcua_server_repository),
    _user: User = Depends(get_current_user),
) -> OPCUAServerConnectionStatus:
    """Get connection status for an OPC-UA server."""
    from openspc.opcua.manager import opcua_manager

    server = await repo.get_by_id(server_id)
    if server is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPC-UA server {server_id} not found",
        )

    state = opcua_manager.get_state(server_id)

    if state:
        return OPCUAServerConnectionStatus(
            server_id=server.id,
            server_name=server.name,
            endpoint_url=server.endpoint_url,
            is_connected=state.is_connected,
            last_connected=state.last_connected,
            error_message=state.error_message,
            monitored_nodes=state.monitored_nodes,
        )
    else:
        return OPCUAServerConnectionStatus(
            server_id=server.id,
            server_name=server.name,
            endpoint_url=server.endpoint_url,
            is_connected=False,
            last_connected=None,
            error_message="Server is not connected",
            monitored_nodes=[],
        )


@router.get("/{server_id}/browse", response_model=list[BrowsedNodeResponse])
async def browse_opcua_nodes(
    server_id: int,
    parent_node_id: str | None = Query(None, description="Parent node ID to browse children of. Omit for root Objects folder."),
    repo: OPCUAServerRepository = Depends(get_opcua_server_repository),
    _user: User = Depends(get_current_engineer),
) -> list[BrowsedNodeResponse]:
    """Browse OPC-UA server address space.

    Returns immediate children of the specified parent node.
    Omit parent_node_id to browse from the root Objects folder.
    """
    from openspc.opcua.browsing import NodeBrowsingService
    from openspc.opcua.manager import opcua_manager

    server = await repo.get_by_id(server_id)
    if server is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPC-UA server {server_id} not found",
        )

    client = opcua_manager.get_client(server_id)
    if client is None or not client.is_connected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OPC-UA server {server_id} is not connected",
        )

    # Get or create browsing service for this server
    browsing = opcua_manager.get_browsing_service(server_id)
    if browsing is None:
        browsing = NodeBrowsingService()
        opcua_manager.set_browsing_service(server_id, browsing)

    try:
        nodes = await browsing.browse_children(client, parent_node_id)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to browse OPC-UA server: {str(e)}",
        )

    return [
        BrowsedNodeResponse(
            node_id=node.node_id,
            browse_name=node.browse_name,
            display_name=node.display_name,
            node_class=node.node_class,
            data_type=node.data_type,
            is_readable=node.is_readable,
            children_count=node.children_count,
        )
        for node in nodes
    ]


@router.get("/{server_id}/browse/value", response_model=NodeValueResponse)
async def read_opcua_node_value(
    server_id: int,
    node_id: str = Query(..., description="OPC-UA Node ID string (e.g. 'ns=2;i=1234')"),
    repo: OPCUAServerRepository = Depends(get_opcua_server_repository),
    _user: User = Depends(get_current_engineer),
) -> NodeValueResponse:
    """Read current value of an OPC-UA node.

    Returns the current value, data type, timestamps, and status code.
    """
    from openspc.opcua.browsing import NodeBrowsingService
    from openspc.opcua.manager import opcua_manager

    server = await repo.get_by_id(server_id)
    if server is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OPC-UA server {server_id} not found",
        )

    client = opcua_manager.get_client(server_id)
    if client is None or not client.is_connected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OPC-UA server {server_id} is not connected",
        )

    # Get or create browsing service for this server
    browsing = opcua_manager.get_browsing_service(server_id)
    if browsing is None:
        browsing = NodeBrowsingService()
        opcua_manager.set_browsing_service(server_id, browsing)

    try:
        result = await browsing.read_node_value(client, node_id)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to read node value: {str(e)}",
        )

    # Serialize value to JSON-safe type
    value = result["value"]
    if value is not None and not isinstance(value, (str, int, float, bool)):
        value = str(value)

    return NodeValueResponse(
        node_id=result["node_id"],
        value=value,
        data_type=result["data_type"],
        source_timestamp=result["source_timestamp"],
        server_timestamp=result["server_timestamp"],
        status_code=result["status_code"],
    )
