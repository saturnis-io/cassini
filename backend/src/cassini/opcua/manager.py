"""OPC-UA Manager for multi-server lifecycle management.

This module provides OPCUAManager for managing multiple OPC-UA server
connections within the FastAPI application, including loading server
configurations from the database and tracking connection state.
"""

import asyncio
import os
import structlog
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.opcua_server import OPCUAServer
from cassini.db.dialects import decrypt_password, get_encryption_key
from cassini.opcua.client import OPCUAClient, OPCUAConfig

logger = structlog.get_logger(__name__)


@dataclass
class OPCUAConnectionState:
    """Current state of an OPC-UA server connection.

    Attributes:
        server_id: ID of the OPC-UA server
        server_name: Display name of the server
        endpoint_url: Server endpoint URL
        is_connected: Whether currently connected
        last_connected: Timestamp of last successful connection
        error_message: Current error message if not connected
        monitored_nodes: List of node_id strings being monitored
    """

    server_id: int | None = None
    server_name: str | None = None
    endpoint_url: str | None = None
    is_connected: bool = False
    last_connected: datetime | None = None
    error_message: str | None = None
    monitored_nodes: list[str] = None

    def __post_init__(self):
        if self.monitored_nodes is None:
            self.monitored_nodes = []


class OPCUAManager:
    """Manages multiple OPC-UA server connections.

    Parallel to MQTTManager: loads server configs from DB,
    maintains client instances, tracks connection state,
    provides browsing service access.
    """

    def __init__(self):
        self._clients: dict[int, OPCUAClient] = {}  # server_id -> client
        self._states: dict[int, OPCUAConnectionState] = {}  # server_id -> state
        self._browsing_services: dict[int, object] = {}  # server_id -> NodeBrowsingService
        self._cert_paths: dict[int, tuple[str | None, ...]] = {}  # server_id -> temp cert file paths

    # --- Properties ---

    @property
    def is_connected(self) -> bool:
        """Check if any server is currently connected."""
        return any(c.is_connected for c in self._clients.values())

    def get_client(self, server_id: int) -> OPCUAClient | None:
        """Get the OPCUAClient for a specific server."""
        return self._clients.get(server_id)

    def get_state(self, server_id: int) -> OPCUAConnectionState | None:
        """Get connection state for a specific server."""
        state = self._states.get(server_id)
        if state:
            client = self._clients.get(server_id)
            if client:
                state.is_connected = client.is_connected
                state.monitored_nodes = list(client._monitored_items.keys())
        return state

    def get_all_states(self) -> dict[int, OPCUAConnectionState]:
        """Get connection states for all servers."""
        result = {}
        for server_id, state in self._states.items():
            client = self._clients.get(server_id)
            if client:
                state.is_connected = client.is_connected
                state.monitored_nodes = list(client._monitored_items.keys())
            result[server_id] = state
        return result

    def get_browsing_service(self, server_id: int):
        """Get the NodeBrowsingService for a specific server."""
        return self._browsing_services.get(server_id)

    def set_browsing_service(self, server_id: int, service) -> None:
        """Set the NodeBrowsingService for a specific server."""
        self._browsing_services[server_id] = service

    def remove_browsing_service(self, server_id: int) -> None:
        """Remove the NodeBrowsingService for a specific server."""
        self._browsing_services.pop(server_id, None)

    # --- Lifecycle ---

    async def initialize(self, session: AsyncSession) -> bool:
        """Load all active OPC-UA servers and connect.

        Args:
            session: SQLAlchemy async session for database access

        Returns:
            True if at least one connection was established, False otherwise
        """
        from cassini.db.repositories.opcua_server import OPCUAServerRepository

        logger.info("Initializing OPC-UA manager")

        repo = OPCUAServerRepository(session)
        servers = await repo.get_all_active()

        if not servers:
            logger.info("No active OPC-UA servers configured")
            return False

        results = await asyncio.gather(
            *[self._connect_to_server(server) for server in servers],
            return_exceptions=True,
        )

        connected = sum(1 for r in results if r is True)
        logger.info(
            "opcua_manager_initialized",
            connected=connected,
            total=len(servers),
        )
        return connected > 0

    async def connect_server(self, server_id: int, session: AsyncSession) -> bool:
        """Connect to a specific server by ID.

        Args:
            server_id: ID of OPC-UA server to connect to
            session: SQLAlchemy async session for database access

        Returns:
            True if connection was established, False otherwise
        """
        from cassini.db.repositories.opcua_server import OPCUAServerRepository

        repo = OPCUAServerRepository(session)
        server = await repo.get_by_id(server_id)
        if server is None:
            logger.error("opcua_server_not_found", server_id=server_id)
            return False
        return await self._connect_to_server(server)

    async def disconnect_server(self, server_id: int) -> bool:
        """Disconnect a specific server.

        Args:
            server_id: ID of OPC-UA server to disconnect

        Returns:
            True if disconnected successfully, False if server not found
        """
        client = self._clients.get(server_id)
        if client is None:
            return False

        # Stop browsing service if active
        self._browsing_services.pop(server_id, None)

        await client.disconnect()
        del self._clients[server_id]

        # Clean up temp cert files
        paths = self._cert_paths.pop(server_id, ())
        for p in paths:
            if p:
                try:
                    os.unlink(p)
                except OSError:
                    pass

        if server_id in self._states:
            self._states[server_id].is_connected = False
            self._states[server_id].error_message = "Disconnected"

        return True

    async def _connect_to_server(self, server: OPCUAServer) -> bool:
        """Build config from DB model and connect.

        Args:
            server: OPCUAServer model instance

        Returns:
            True if connection was established, False otherwise
        """
        # Disconnect existing client if any
        if server.id in self._clients:
            await self._clients[server.id].disconnect()

        # Decrypt credentials if needed
        username = None
        password = None
        if server.auth_mode == "username_password" and server.username:
            key = get_encryption_key()
            username = decrypt_password(server.username, key)
            password = decrypt_password(server.password, key) if server.password else None

        # Decrypt cert PEM to temp files if security policy is configured
        cert_paths: tuple[str | None, ...] = (None, None, None)
        if server.security_policy != "None" and (server.ca_cert_pem or server.client_cert_pem):
            from cassini.core.tls_utils import decrypt_and_write_cert_files
            key = get_encryption_key()
            cert_paths = decrypt_and_write_cert_files(
                ca_cert_pem=server.ca_cert_pem,
                client_cert_pem=server.client_cert_pem,
                client_key_pem=server.client_key_pem,
                encryption_key=key,
            )

        config = OPCUAConfig(
            endpoint_url=server.endpoint_url,
            auth_mode=server.auth_mode,
            username=username,
            password=password,
            security_policy=server.security_policy,
            security_mode=server.security_mode,
            session_timeout=server.session_timeout,
            publishing_interval=server.publishing_interval,
            sampling_interval=server.sampling_interval,
            ca_cert_path=cert_paths[0],
            client_cert_path=cert_paths[1],
            client_key_path=cert_paths[2],
            tls_insecure=server.tls_insecure,
        )

        self._states[server.id] = OPCUAConnectionState(
            server_id=server.id,
            server_name=server.name,
            endpoint_url=server.endpoint_url,
        )

        try:
            client = OPCUAClient(config)
            await client.connect()  # Non-blocking
            self._clients[server.id] = client
            self._cert_paths[server.id] = cert_paths
            self._states[server.id].is_connected = client.is_connected

            if client.is_connected:
                self._states[server.id].last_connected = datetime.now()
            else:
                self._states[server.id].error_message = "Connecting in background"

            return client.is_connected

        except Exception as e:
            logger.error(
                "opcua_server_init_failed",
                name=server.name,
                error=str(e),
            )
            self._states[server.id].error_message = str(e)
            return False

    async def shutdown(self) -> None:
        """Disconnect all servers and clean up resources."""
        import asyncio

        logger.info("Shutting down OPC-UA manager")
        self._browsing_services.clear()

        # Disconnect all clients concurrently with an overall timeout
        async def _disconnect_one(server_id: int, client) -> None:
            try:
                await client.disconnect()
            except Exception as e:
                logger.warning(
                    "opcua_shutdown_error",
                    server_id=server_id,
                    error=str(e),
                )

        if self._clients:
            tasks = [
                _disconnect_one(sid, c)
                for sid, c in self._clients.items()
            ]
            try:
                await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True),
                    timeout=15.0,
                )
            except asyncio.TimeoutError:
                logger.warning("opcua_manager_shutdown_timeout")

        # Clean up all temp cert files
        for paths in self._cert_paths.values():
            for p in paths:
                if p:
                    try:
                        os.unlink(p)
                    except OSError:
                        pass
        self._cert_paths.clear()

        self._clients.clear()
        self._states.clear()
        logger.info("OPC-UA manager shutdown complete")


# Global instance
opcua_manager = OPCUAManager()
