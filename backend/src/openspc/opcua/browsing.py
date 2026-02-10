"""OPC-UA Node Browsing Service for address space discovery.

This module provides NodeBrowsingService for lazy-loaded browsing of
OPC-UA server address spaces with caching and flat search capabilities.
"""

import asyncio
import structlog
from dataclasses import dataclass, field

from asyncua import ua

from openspc.opcua.client import OPCUAClient

logger = structlog.get_logger(__name__)


@dataclass
class BrowsedNode:
    """A discovered OPC-UA node with metadata.

    Attributes:
        node_id: OPC-UA NodeId string (e.g. "ns=2;i=1234")
        browse_name: QualifiedName as string
        display_name: LocalizedText as string
        node_class: Node class name ("Object", "Variable", "Method", etc.)
        data_type: Data type name (only for Variable nodes)
        is_readable: True if Variable with read access
        children_count: Number of child nodes (populated on browse)
    """

    node_id: str
    browse_name: str
    display_name: str
    node_class: str
    data_type: str | None = None
    is_readable: bool = False
    children_count: int | None = None


@dataclass
class NodeTreeEntry:
    """A node in the browseable address space tree.

    Attributes:
        node_id: OPC-UA NodeId string
        browse_name: QualifiedName as string
        display_name: LocalizedText as string
        node_class: Node class name
        data_type: Data type name (only for Variable nodes)
        is_readable: True if Variable with read access
        children: Child NodeTreeEntry objects
        has_children: Lazy-loading indicator for UI tree controls
    """

    node_id: str
    browse_name: str
    display_name: str
    node_class: str
    data_type: str | None = None
    is_readable: bool = False
    children: list["NodeTreeEntry"] = field(default_factory=list)
    has_children: bool = False


class NodeBrowsingService:
    """Service for browsing OPC-UA server address space.

    Provides lazy-loaded tree browsing (fetch children on expand)
    with caching and flat search by display name.

    Features:
    - Lazy browse: fetch children on demand, not full tree
    - Per-parent cache with 60-second TTL
    - Max nodes per level to prevent memory issues
    - Browse by path for direct node access
    - Read current value for any node
    """

    def __init__(self, max_nodes_per_level: int = 1000):
        self._max_nodes_per_level = max_nodes_per_level
        self._cache: dict[str, list[BrowsedNode]] = {}  # parent_node_id -> children
        self._cache_ttl = 60  # seconds
        self._cache_timestamps: dict[str, float] = {}

    async def browse_children(
        self,
        client: OPCUAClient,
        parent_node_id: str | None = None,
    ) -> list[BrowsedNode]:
        """Browse immediate children of a node.

        Args:
            client: Connected OPCUAClient
            parent_node_id: Node ID string, or None for root Objects folder

        Returns:
            List of BrowsedNode for each child

        Raises:
            RuntimeError: If client is not connected
        """
        if not client.is_connected or client.native_client is None:
            raise RuntimeError("OPC-UA client not connected")

        native = client.native_client

        # Determine parent node
        if parent_node_id is None:
            parent = native.nodes.objects  # Start from Objects folder
            cache_key = "__objects__"
        else:
            parent = native.get_node(parent_node_id)
            cache_key = parent_node_id

        # Check cache
        if self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        # Browse children
        children_nodes = await parent.get_children(
            refs=ua.ObjectIds.HierarchicalReferences,
        )

        # Limit results
        if len(children_nodes) > self._max_nodes_per_level:
            children_nodes = children_nodes[: self._max_nodes_per_level]
            logger.warning(
                "opcua_browse_truncated",
                parent=cache_key,
                max=self._max_nodes_per_level,
            )

        # Read attributes for all children
        result = await self._read_node_attributes(native, children_nodes)

        # Cache
        self._cache[cache_key] = result
        self._cache_timestamps[cache_key] = asyncio.get_event_loop().time()

        return result

    async def browse_path(
        self,
        client: OPCUAClient,
        path: str,
    ) -> BrowsedNode | None:
        """Browse to a specific node by browse path.

        Args:
            client: Connected OPCUAClient
            path: Browse path like "0:Objects/2:MyFolder/2:MyVariable"

        Returns:
            BrowsedNode if found, None otherwise

        Raises:
            RuntimeError: If client is not connected
        """
        if not client.is_connected or client.native_client is None:
            raise RuntimeError("OPC-UA client not connected")

        native = client.native_client

        try:
            node = await native.nodes.root.get_child(path)
            return await self._read_single_node_attributes(native, node)
        except ua.UaStatusCodeError:
            return None

    async def read_node_value(
        self,
        client: OPCUAClient,
        node_id: str,
    ) -> dict:
        """Read current value and metadata for a single node.

        Args:
            client: Connected OPCUAClient
            node_id: OPC-UA NodeId string

        Returns:
            Dict with: node_id, value, data_type, source_timestamp,
            server_timestamp, status_code

        Raises:
            RuntimeError: If client is not connected
        """
        if not client.is_connected or client.native_client is None:
            raise RuntimeError("OPC-UA client not connected")

        native = client.native_client
        node = native.get_node(node_id)
        data_value = await node.read_data_value()

        return {
            "node_id": node_id,
            "value": data_value.Value.Value if data_value.Value else None,
            "data_type": str(data_value.Value.VariantType) if data_value.Value else None,
            "source_timestamp": data_value.SourceTimestamp,
            "server_timestamp": data_value.ServerTimestamp,
            "status_code": str(data_value.StatusCode),
        }

    def clear_cache(self) -> None:
        """Clear all cached browse results."""
        self._cache.clear()
        self._cache_timestamps.clear()

    def invalidate(self, node_id: str) -> None:
        """Invalidate cache for a specific parent."""
        self._cache.pop(node_id, None)
        self._cache_timestamps.pop(node_id, None)

    # --- Internal ---

    async def _read_node_attributes(
        self, native_client, nodes: list
    ) -> list[BrowsedNode]:
        """Read attributes for a batch of nodes.

        Skips nodes that can't be read (security restrictions, etc.).
        """
        result = []
        for node in nodes:
            try:
                attrs = await self._read_single_node_attributes(native_client, node)
                result.append(attrs)
            except Exception as e:
                logger.debug(
                    "opcua_node_read_error",
                    node_id=str(node.nodeid),
                    error=str(e),
                )
        return result

    async def _read_single_node_attributes(
        self, native_client, node
    ) -> BrowsedNode:
        """Read all relevant attributes for a single node."""
        browse_name = await node.read_browse_name()
        display_name = await node.read_display_name()
        node_class = await node.read_node_class()

        data_type = None
        is_readable = False

        if node_class == ua.NodeClass.Variable:
            is_readable = True
            try:
                vtype = await node.read_data_type_as_variant_type()
                data_type = str(vtype)
            except Exception:
                data_type = "Unknown"

        # Check if node has children (for lazy-load indicator)
        try:
            children = await node.get_children()
            children_count = len(children)
        except Exception:
            children_count = 0

        return BrowsedNode(
            node_id=node.nodeid.to_string(),
            browse_name=str(browse_name),
            display_name=str(display_name),
            node_class=str(node_class).split(".")[-1],  # "NodeClass.Variable" -> "Variable"
            data_type=data_type,
            is_readable=is_readable,
            children_count=children_count,
        )

    def _is_cache_valid(self, key: str) -> bool:
        """Check if cached browse result is still valid."""
        if key not in self._cache:
            return False
        ts = self._cache_timestamps.get(key, 0)
        return (asyncio.get_event_loop().time() - ts) < self._cache_ttl
