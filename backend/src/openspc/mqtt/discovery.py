"""MQTT Topic Discovery Service for browsing available topics.

This module provides topic discovery capabilities by subscribing to
wildcard patterns and building a browseable tree of available topics.
Supports automatic detection and parsing of SparkplugB topic namespaces.
"""

import structlog
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

from openspc.mqtt.client import MQTTClient

logger = structlog.get_logger(__name__)

# Default configuration for topic discovery
DISCOVERY_MAX_TOPICS = 10000
DISCOVERY_TTL_SECONDS = 300


@dataclass
class SparkplugMetricInfo:
    """Metadata for a single metric discovered in a SparkplugB payload.

    Attributes:
        name: Metric name (e.g., "Temperature")
        data_type: SparkplugB data type (e.g., "Float", "Boolean")
    """

    name: str
    data_type: str


@dataclass
class DiscoveredTopic:
    """A discovered MQTT topic with metadata.

    Attributes:
        topic: Full MQTT topic string
        message_count: Number of messages seen on this topic
        last_seen: Timestamp of last message
        last_payload_size: Size of last payload in bytes
        is_sparkplug: Whether this is a SparkplugB topic
        sparkplug_group: SparkplugB group ID (if applicable)
        sparkplug_node: SparkplugB edge node ID (if applicable)
        sparkplug_device: SparkplugB device ID (if applicable)
        sparkplug_message_type: SparkplugB message type (if applicable)
        sparkplug_metrics: Metric name/type pairs from decoded SparkplugB payload
    """

    topic: str
    message_count: int = 0
    last_seen: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_payload_size: int = 0
    is_sparkplug: bool = False
    sparkplug_group: str | None = None
    sparkplug_node: str | None = None
    sparkplug_device: str | None = None
    sparkplug_message_type: str | None = None
    sparkplug_metrics: list[SparkplugMetricInfo] = field(default_factory=list)


@dataclass
class TopicTreeNode:
    """A node in the topic tree for hierarchical browsing.

    Attributes:
        name: The segment name at this tree level
        full_topic: Full topic string if this is a leaf node (None for intermediate)
        children: Child nodes keyed by segment name
        message_count: Total messages across this node and children
        last_seen: Most recent message timestamp
        is_sparkplug: Whether any child is a SparkplugB topic
        sparkplug_metrics: Metric metadata (only on leaf nodes with SparkplugB data)
    """

    name: str
    full_topic: str | None = None
    children: dict[str, "TopicTreeNode"] = field(default_factory=dict)
    message_count: int = 0
    last_seen: datetime | None = None
    is_sparkplug: bool = False
    sparkplug_metrics: list[SparkplugMetricInfo] = field(default_factory=list)


class TopicDiscoveryService:
    """Service for discovering MQTT topics on a broker.

    Subscribes to wildcard topics and builds a browseable topic tree.
    Supports SparkplugB topic auto-detection and memory-bounded caching.

    Features:
    - Wildcard subscription for topic discovery
    - Automatic SparkplugB topic parsing
    - Rate-limited topic cache updates
    - TTL-based stale topic eviction
    - Thread-safe for concurrent message callbacks
    - Memory bounded by max_topics parameter

    Example:
        >>> svc = TopicDiscoveryService(max_topics=10000)
        >>> await svc.start_discovery(mqtt_client)
        >>> topics = svc.get_discovered_topics()
        >>> tree = svc.get_topic_tree()
        >>> await svc.stop_discovery(mqtt_client)
    """

    def __init__(self, max_topics: int = DISCOVERY_MAX_TOPICS, ttl_seconds: int = DISCOVERY_TTL_SECONDS):
        """Initialize the discovery service.

        Args:
            max_topics: Maximum number of topics to cache (evicts oldest on overflow)
            ttl_seconds: Time-to-live for discovered topics in seconds
        """
        self._max_topics = max_topics
        self._ttl_seconds = ttl_seconds
        self._topics: dict[str, DiscoveredTopic] = {}
        self._lock = threading.Lock()
        self._subscribe_pattern: str | None = None
        self._last_update: dict[str, float] = {}  # topic -> last update timestamp
        self._is_active = False

    @property
    def is_active(self) -> bool:
        """Whether discovery is currently active."""
        return self._is_active

    async def start_discovery(
        self,
        client: MQTTClient,
        subscribe_pattern: str = "#",
    ) -> None:
        """Start topic discovery by subscribing to wildcard.

        Args:
            client: Connected MQTT client
            subscribe_pattern: Wildcard pattern to subscribe to (default: "#")
        """
        logger.info("starting_topic_discovery", pattern=subscribe_pattern)
        self._subscribe_pattern = subscribe_pattern
        self._is_active = True
        await client.subscribe(subscribe_pattern, self._on_discovery_message)
        logger.info("Topic discovery started")

    async def stop_discovery(self, client: MQTTClient) -> None:
        """Stop topic discovery and unsubscribe.

        Args:
            client: Connected MQTT client
        """
        logger.info("Stopping topic discovery")
        self._is_active = False
        if self._subscribe_pattern:
            try:
                await client.unsubscribe(self._subscribe_pattern)
            except Exception as e:
                logger.warning("discovery_unsubscribe_error", error=str(e))
            self._subscribe_pattern = None
        logger.info("Topic discovery stopped")

    def get_discovered_topics(self) -> list[DiscoveredTopic]:
        """Get all discovered topics sorted by last_seen (most recent first).

        Returns:
            List of DiscoveredTopic objects
        """
        self._evict_stale_topics()
        with self._lock:
            topics = list(self._topics.values())
        return sorted(topics, key=lambda t: t.last_seen, reverse=True)

    def get_topic_tree(self) -> TopicTreeNode:
        """Build and return a hierarchical tree of discovered topics.

        Returns:
            Root TopicTreeNode containing the full tree
        """
        self._evict_stale_topics()
        with self._lock:
            topics = dict(self._topics)
        return self._build_tree(topics)

    def search_topics(self, query: str) -> list[DiscoveredTopic]:
        """Filter topics by substring match.

        Args:
            query: Substring to search for in topic names

        Returns:
            List of matching DiscoveredTopic objects
        """
        self._evict_stale_topics()
        query_lower = query.lower()
        with self._lock:
            matching = [
                t for t in self._topics.values()
                if query_lower in t.topic.lower()
            ]
        return sorted(matching, key=lambda t: t.last_seen, reverse=True)

    def clear(self) -> None:
        """Clear all discovered topics."""
        with self._lock:
            self._topics.clear()
            self._last_update.clear()
        logger.info("Discovery cache cleared")

    async def _on_discovery_message(self, topic: str, payload: bytes) -> None:
        """Callback for incoming messages during discovery.

        Rate-limits updates to at most 1 per topic per second.
        For SparkplugB topics, decodes the payload to extract metric metadata.

        Args:
            topic: MQTT topic the message was received on
            payload: Message payload bytes
        """
        now = time.monotonic()

        # Rate limit: at most 1 update per topic per second
        with self._lock:
            last = self._last_update.get(topic, 0.0)
            if now - last < 1.0 and topic in self._topics:
                # Just increment count without full update
                self._topics[topic].message_count += 1
                return
            self._last_update[topic] = now

        # Parse SparkplugB topic if applicable
        sparkplug_info = self._parse_sparkplug_topic(topic)

        # Decode SparkplugB payload to extract metric metadata
        sparkplug_metrics: list[SparkplugMetricInfo] = []
        if sparkplug_info is not None:
            sparkplug_metrics = self._extract_sparkplug_metrics(payload)

        with self._lock:
            if topic in self._topics:
                # Update existing
                existing = self._topics[topic]
                existing.message_count += 1
                existing.last_seen = datetime.now(timezone.utc)
                existing.last_payload_size = len(payload)
                # Update metrics if we got new ones (keeps latest schema)
                if sparkplug_metrics:
                    existing.sparkplug_metrics = sparkplug_metrics
            else:
                # Add new topic
                if len(self._topics) >= self._max_topics:
                    # Evict oldest topic
                    oldest_topic = min(
                        self._topics,
                        key=lambda t: self._topics[t].last_seen,
                    )
                    del self._topics[oldest_topic]
                    self._last_update.pop(oldest_topic, None)

                self._topics[topic] = DiscoveredTopic(
                    topic=topic,
                    message_count=1,
                    last_seen=datetime.now(timezone.utc),
                    last_payload_size=len(payload),
                    is_sparkplug=sparkplug_info is not None,
                    sparkplug_group=sparkplug_info.get("group") if sparkplug_info else None,
                    sparkplug_node=sparkplug_info.get("node") if sparkplug_info else None,
                    sparkplug_device=sparkplug_info.get("device") if sparkplug_info else None,
                    sparkplug_message_type=sparkplug_info.get("message_type") if sparkplug_info else None,
                    sparkplug_metrics=sparkplug_metrics,
                )

    @staticmethod
    def _parse_sparkplug_topic(topic: str) -> dict[str, str] | None:
        """Detect and parse SparkplugB topic structure.

        SparkplugB topics follow the format:
        spBv1.0/{group_id}/{message_type}/{edge_node_id}[/{device_id}]

        Args:
            topic: MQTT topic string

        Returns:
            Dict with group, message_type, node, device keys, or None if not SparkplugB
        """
        parts = topic.split("/")
        if len(parts) < 4 or parts[0] != "spBv1.0":
            return None

        result = {
            "group": parts[1],
            "message_type": parts[2],
            "node": parts[3],
        }
        if len(parts) > 4:
            result["device"] = parts[4]

        return result

    @staticmethod
    def _extract_sparkplug_metrics(payload: bytes) -> list[SparkplugMetricInfo]:
        """Decode a SparkplugB payload and extract metric name/type pairs.

        Args:
            payload: SparkplugB protobuf (or JSON fallback) payload bytes

        Returns:
            List of SparkplugMetricInfo with name and data_type, or empty on failure
        """
        try:
            from openspc.mqtt.sparkplug import SparkplugDecoder

            _ts, metrics, _seq = SparkplugDecoder.decode_payload(payload)
            # Deduplicate by name (keep first occurrence)
            seen: set[str] = set()
            result: list[SparkplugMetricInfo] = []
            for m in metrics:
                if m.name not in seen:
                    seen.add(m.name)
                    result.append(SparkplugMetricInfo(name=m.name, data_type=m.data_type))
            return result
        except Exception as e:
            logger.debug("sparkplug_metrics_extraction_failed", error=str(e))
            return []

    @staticmethod
    def _build_tree(topics: dict[str, DiscoveredTopic]) -> TopicTreeNode:
        """Build hierarchical tree from flat topic list.

        Args:
            topics: Dict mapping topic string to DiscoveredTopic

        Returns:
            Root TopicTreeNode
        """
        root = TopicTreeNode(name="root")

        for topic_str, topic_info in topics.items():
            parts = topic_str.split("/")
            current = root

            for i, part in enumerate(parts):
                if part not in current.children:
                    current.children[part] = TopicTreeNode(name=part)
                current = current.children[part]

                # Update counts
                current.message_count += topic_info.message_count
                if current.last_seen is None or topic_info.last_seen > current.last_seen:
                    current.last_seen = topic_info.last_seen
                if topic_info.is_sparkplug:
                    current.is_sparkplug = True

            # Set full topic and metrics on leaf node
            current.full_topic = topic_str
            if topic_info.sparkplug_metrics:
                current.sparkplug_metrics = topic_info.sparkplug_metrics

        return root

    def _evict_stale_topics(self) -> None:
        """Remove topics older than TTL."""
        if self._ttl_seconds <= 0:
            return

        now = datetime.now(timezone.utc)
        with self._lock:
            stale = [
                topic
                for topic, info in self._topics.items()
                if (now - info.last_seen).total_seconds() > self._ttl_seconds
            ]
            for topic in stale:
                del self._topics[topic]
                self._last_update.pop(topic, None)

            if stale:
                logger.debug("evicted_stale_topics", count=len(stale))
