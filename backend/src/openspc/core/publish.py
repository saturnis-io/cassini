"""MQTT outbound publisher for SPC event broadcasting.

This module provides MQTTPublisher that bridges the Event Bus and MQTT
infrastructure. It subscribes to domain events and publishes them to
outbound-enabled MQTT brokers using UNS-compatible topic structures.

The publisher supports both JSON and SparkplugB payload formats, with
per-characteristic rate limiting to prevent publish storms.
"""

import json
import re
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

import structlog
from sqlalchemy import select

from openspc.core.events import (
    ControlLimitsUpdatedEvent,
    EventBus,
    SampleProcessedEvent,
    ViolationAcknowledgedEvent,
    ViolationCreatedEvent,
)
from openspc.db.models.broker import MQTTBroker
from openspc.db.models.characteristic import Characteristic
from openspc.db.models.hierarchy import Hierarchy
from openspc.db.models.plant import Plant

if TYPE_CHECKING:
    from openspc.mqtt.manager import MQTTManager

logger = structlog.get_logger(__name__)

# Characters invalid in MQTT topic segments
_INVALID_TOPIC_CHARS = re.compile(r"[#+/\x00]")


def sanitize_topic_segment(name: str) -> str:
    """Sanitize a string for use as an MQTT topic segment.

    Replaces spaces with underscores, removes characters invalid in
    MQTT topics (# + / null), and lowercases for consistency.

    Args:
        name: Raw name string to sanitize

    Returns:
        Sanitized topic segment string
    """
    result = name.strip().replace(" ", "_")
    result = _INVALID_TOPIC_CHARS.sub("", result)
    return result.lower()


def build_outbound_topic(
    prefix: str,
    plant_name: str,
    hierarchy_segments: list[str],
    char_name: str,
    event_type: str,
) -> str:
    """Build a UNS-compatible MQTT topic for outbound publishing.

    Assembles a topic in the format:
        {prefix}/{plant}/{path...}/{char}/{event}

    Each segment is sanitized for MQTT topic compatibility.

    Args:
        prefix: Topic prefix (e.g., "openspc")
        plant_name: Name of the plant
        hierarchy_segments: Hierarchy path segments (e.g., ["Area1", "Line2"])
        char_name: Characteristic name
        event_type: Event type ("sample", "violation", "ack", "limits")

    Returns:
        Fully assembled MQTT topic string
    """
    parts = [sanitize_topic_segment(prefix)]
    parts.append(sanitize_topic_segment(plant_name))
    for seg in hierarchy_segments:
        parts.append(sanitize_topic_segment(seg))
    parts.append(sanitize_topic_segment(char_name))
    parts.append(sanitize_topic_segment(event_type))
    return "/".join(parts)


async def build_hierarchy_path(
    session: Any,
    characteristic_id: int,
) -> tuple[str, list[str]]:
    """Build the hierarchy path for a characteristic.

    Queries the Characteristic to get its hierarchy_id, then walks the
    Hierarchy parent chain via recursive queries to build the path.
    Also queries the Plant name for the plant segment.

    Args:
        session: SQLAlchemy async session
        characteristic_id: ID of the characteristic

    Returns:
        Tuple of (plant_name, hierarchy_path_segments).
        Example: ("Plant A", ["Area1", "Line2", "Cell3"])
    """
    # Get characteristic's hierarchy_id and plant info
    stmt = (
        select(Characteristic.hierarchy_id, Characteristic.name)
        .where(Characteristic.id == characteristic_id)
    )
    result = await session.execute(stmt)
    row = result.one_or_none()
    if row is None:
        return ("unknown", [])

    hierarchy_id = row[0]

    # Walk the hierarchy parent chain
    segments: list[str] = []
    plant_name = "unknown"
    current_id: int | None = hierarchy_id

    while current_id is not None:
        h_stmt = select(
            Hierarchy.id, Hierarchy.name, Hierarchy.parent_id, Hierarchy.plant_id
        ).where(Hierarchy.id == current_id)
        h_result = await session.execute(h_stmt)
        h_row = h_result.one_or_none()
        if h_row is None:
            break
        segments.insert(0, h_row[1])  # name

        # If this node has a plant_id, fetch plant name
        if h_row[3] is not None and plant_name == "unknown":
            p_stmt = select(Plant.name).where(Plant.id == h_row[3])
            p_result = await session.execute(p_stmt)
            p_row = p_result.one_or_none()
            if p_row is not None:
                plant_name = p_row[0]

        current_id = h_row[2]  # parent_id

    return (plant_name, segments)


class MQTTPublisher:
    """Publishes SPC events to outbound-enabled MQTT brokers.

    This class acts as a bridge between the internal event bus and external
    MQTT brokers. It subscribes to SPC domain events and publishes them
    using UNS-compatible topic structures.

    Supports JSON and SparkplugB payload formats. Implements per-characteristic
    rate limiting to prevent publish storms.

    Args:
        mqtt_manager: MQTT connection manager for publishing
        event_bus: Event bus for subscribing to domain events
        session_factory: Callable that returns an async context manager for DB sessions

    Example:
        >>> from openspc.core.events import event_bus
        >>> from openspc.mqtt import mqtt_manager
        >>> publisher = MQTTPublisher(mqtt_manager, event_bus, db.session)
    """

    def __init__(
        self,
        mqtt_manager: "MQTTManager",
        event_bus: EventBus,
        session_factory: Any,
    ) -> None:
        """Initialize the MQTT outbound publisher.

        Args:
            mqtt_manager: MQTT connection manager instance
            event_bus: Event bus instance for event subscriptions
            session_factory: Async context manager factory for DB sessions
        """
        self._mqtt_manager = mqtt_manager
        self._event_bus = event_bus
        self._session_factory = session_factory
        self._path_cache: dict[int, tuple[str, list[str]]] = {}
        self._last_publish: dict[tuple[int, int], float] = {}
        self._publish_count: int = 0
        self._setup_subscriptions()
        logger.info("MQTTPublisher initialized")

    def _setup_subscriptions(self) -> None:
        """Subscribe to Event Bus events for outbound publishing."""
        self._event_bus.subscribe(SampleProcessedEvent, self._on_sample_processed)
        self._event_bus.subscribe(ViolationCreatedEvent, self._on_violation_created)
        self._event_bus.subscribe(
            ViolationAcknowledgedEvent, self._on_violation_acknowledged
        )
        self._event_bus.subscribe(
            ControlLimitsUpdatedEvent, self._on_limits_updated
        )
        logger.debug("MQTTPublisher subscribed to 4 event types")

    async def _resolve_path(
        self, session: Any, characteristic_id: int
    ) -> tuple[str, list[str]]:
        """Resolve hierarchy path for a characteristic, using cache.

        Args:
            session: SQLAlchemy async session
            characteristic_id: ID of the characteristic

        Returns:
            Tuple of (plant_name, hierarchy_segments)
        """
        if characteristic_id in self._path_cache:
            return self._path_cache[characteristic_id]

        result = await build_hierarchy_path(session, characteristic_id)
        self._path_cache[characteristic_id] = result
        return result

    async def _get_outbound_brokers(
        self, session: Any
    ) -> list[dict[str, Any]]:
        """Get all active brokers with outbound publishing enabled.

        Args:
            session: SQLAlchemy async session

        Returns:
            List of broker config dicts with id, outbound_topic_prefix,
            outbound_format, and outbound_rate_limit
        """
        stmt = select(
            MQTTBroker.id,
            MQTTBroker.outbound_topic_prefix,
            MQTTBroker.outbound_format,
            MQTTBroker.outbound_rate_limit,
        ).where(
            MQTTBroker.is_active == True,  # noqa: E712
            MQTTBroker.outbound_enabled == True,  # noqa: E712
        )
        result = await session.execute(stmt)
        rows = result.all()
        return [
            {
                "id": row[0],
                "outbound_topic_prefix": row[1],
                "outbound_format": row[2],
                "outbound_rate_limit": row[3],
            }
            for row in rows
        ]

    def _check_rate_limit(
        self, broker_id: int, char_id: int, rate_limit: float
    ) -> bool:
        """Check whether publishing is allowed under rate limiting.

        Args:
            broker_id: ID of the broker
            char_id: ID of the characteristic
            rate_limit: Minimum seconds between publishes

        Returns:
            True if publishing is allowed, False if throttled
        """
        key = (broker_id, char_id)
        now = time.monotonic()
        last = self._last_publish.get(key)

        if last is not None and (now - last) < rate_limit:
            return False

        self._last_publish[key] = now
        return True

    def _cleanup_stale_entries(self) -> None:
        """Remove stale rate limit entries older than 5 minutes."""
        now = time.monotonic()
        stale_keys = [
            k for k, v in self._last_publish.items() if (now - v) > 300
        ]
        for k in stale_keys:
            del self._last_publish[k]

    @staticmethod
    def _build_json_payload(event_type: str, data: dict[str, Any]) -> bytes:
        """Build a JSON payload for outbound publishing.

        Args:
            event_type: Type of event (e.g., "sample_processed")
            data: Event data dictionary

        Returns:
            UTF-8 encoded JSON bytes
        """
        payload = {
            "event": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **data,
        }
        return json.dumps(payload).encode("utf-8")

    async def _publish_to_outbound_brokers(
        self,
        topic_event_type: str,
        characteristic_id: int,
        payload_builder: Any,
    ) -> None:
        """Shared publishing logic for all event handlers.

        Opens a DB session, resolves the hierarchy path, gets the
        characteristic name, iterates outbound-enabled brokers, and
        publishes to each with rate limiting.

        Args:
            topic_event_type: Event type for topic assembly ("sample", "violation", etc.)
            characteristic_id: ID of the characteristic
            payload_builder: Callable(format_str) -> bytes that builds the payload
        """
        try:
            async with self._session_factory() as session:
                # Resolve hierarchy path
                plant_name, segments = await self._resolve_path(
                    session, characteristic_id
                )

                # Get characteristic name
                char_stmt = select(Characteristic.name).where(
                    Characteristic.id == characteristic_id
                )
                char_result = await session.execute(char_stmt)
                char_row = char_result.one_or_none()
                char_name = char_row[0] if char_row else f"char_{characteristic_id}"

                # Get outbound-enabled brokers
                brokers = await self._get_outbound_brokers(session)

            if not brokers:
                return

            for broker in brokers:
                broker_id = broker["id"]

                # Rate limit check
                if not self._check_rate_limit(
                    broker_id,
                    characteristic_id,
                    broker["outbound_rate_limit"],
                ):
                    logger.debug(
                        "mqtt_pub_throttled",
                        broker_id=broker_id,
                        characteristic_id=characteristic_id,
                    )
                    continue

                # Build topic
                topic = build_outbound_topic(
                    prefix=broker["outbound_topic_prefix"],
                    plant_name=plant_name,
                    hierarchy_segments=segments,
                    char_name=char_name,
                    event_type=topic_event_type,
                )

                # Build payload based on format
                try:
                    payload = payload_builder(broker["outbound_format"])
                except Exception:
                    logger.warning(
                        "mqtt_pub_payload_error",
                        broker_id=broker_id,
                        format=broker["outbound_format"],
                        exc_info=True,
                    )
                    continue

                # Publish
                try:
                    await self._mqtt_manager.publish(
                        topic=topic,
                        payload=payload,
                        qos=1,
                        broker_id=broker_id,
                    )
                    logger.debug(
                        "mqtt_pub_sent",
                        topic=topic,
                        broker_id=broker_id,
                        characteristic_id=characteristic_id,
                        event_type=topic_event_type,
                    )
                except Exception:
                    logger.warning(
                        "mqtt_pub_send_error",
                        topic=topic,
                        broker_id=broker_id,
                        exc_info=True,
                    )

            # Periodic cleanup
            self._publish_count += 1
            if self._publish_count % 100 == 0:
                self._cleanup_stale_entries()

        except Exception:
            logger.error(
                "mqtt_pub_handler_error",
                event_type=topic_event_type,
                characteristic_id=characteristic_id,
                exc_info=True,
            )

    async def _on_sample_processed(self, event: SampleProcessedEvent) -> None:
        """Handle SampleProcessedEvent — publish sample data to outbound brokers."""
        logger.debug(
            "mqtt_pub_sample",
            sample_id=event.sample_id,
            characteristic_id=event.characteristic_id,
        )

        data = {
            "sample_id": event.sample_id,
            "characteristic_id": event.characteristic_id,
            "mean": event.mean,
            "range": event.range_value,
            "zone": event.zone,
            "in_control": event.in_control,
        }

        def payload_builder(fmt: str) -> bytes:
            if fmt == "sparkplug":
                from openspc.mqtt.sparkplug import SparkplugEncoder, SparkplugMetric

                metrics = [
                    SparkplugMetric("Mean", event.mean, data_type="Float"),
                    SparkplugMetric(
                        "Range",
                        event.range_value if event.range_value is not None else 0.0,
                        data_type="Float",
                    ),
                    SparkplugMetric("InControl", event.in_control, data_type="Boolean"),
                    SparkplugMetric("Zone", event.zone, data_type="String"),
                ]
                return SparkplugEncoder.encode_metrics(metrics, format="protobuf")
            return self._build_json_payload("sample_processed", data)

        await self._publish_to_outbound_brokers(
            "sample", event.characteristic_id, payload_builder
        )

    async def _on_violation_created(self, event: ViolationCreatedEvent) -> None:
        """Handle ViolationCreatedEvent — publish violation data to outbound brokers."""
        logger.debug(
            "mqtt_pub_violation",
            violation_id=event.violation_id,
            characteristic_id=event.characteristic_id,
        )

        data = {
            "violation_id": event.violation_id,
            "sample_id": event.sample_id,
            "characteristic_id": event.characteristic_id,
            "rule_id": event.rule_id,
            "rule_name": event.rule_name,
            "severity": event.severity,
        }

        def payload_builder(fmt: str) -> bytes:
            if fmt == "sparkplug":
                # For SparkplugB violations, try to get char data for full metrics
                # Fall back to JSON if UCL/LCL not readily available
                try:
                    from openspc.mqtt.sparkplug import (
                        SparkplugEncoder,
                        SparkplugMetric,
                    )

                    metrics = [
                        SparkplugMetric(
                            "ViolationId", event.violation_id, data_type="Int32"
                        ),
                        SparkplugMetric("RuleId", event.rule_id, data_type="Int32"),
                        SparkplugMetric(
                            "RuleName", event.rule_name, data_type="String"
                        ),
                        SparkplugMetric(
                            "Severity", event.severity, data_type="String"
                        ),
                    ]
                    return SparkplugEncoder.encode_metrics(metrics, format="protobuf")
                except Exception:
                    pass
            return self._build_json_payload("violation_created", data)

        await self._publish_to_outbound_brokers(
            "violation", event.characteristic_id, payload_builder
        )

    async def _on_violation_acknowledged(
        self, event: ViolationAcknowledgedEvent
    ) -> None:
        """Handle ViolationAcknowledgedEvent — publish ack data to outbound brokers."""
        logger.debug(
            "mqtt_pub_ack",
            violation_id=event.violation_id,
        )

        # Need to resolve characteristic_id from violation_id
        try:
            async with self._session_factory() as session:
                from openspc.db.models.sample import Sample
                from openspc.db.models.violation import Violation

                stmt = (
                    select(Sample.char_id)
                    .join(Violation, Violation.sample_id == Sample.id)
                    .where(Violation.id == event.violation_id)
                )
                result = await session.execute(stmt)
                row = result.one_or_none()
                if row is None:
                    logger.warning(
                        "mqtt_pub_ack_no_char",
                        violation_id=event.violation_id,
                    )
                    return
                characteristic_id = row[0]
        except Exception:
            logger.error(
                "mqtt_pub_ack_resolve_error",
                violation_id=event.violation_id,
                exc_info=True,
            )
            return

        data = {
            "violation_id": event.violation_id,
            "user": event.user,
            "reason": event.reason,
        }

        def payload_builder(fmt: str) -> bytes:
            if fmt == "sparkplug":
                from openspc.mqtt.sparkplug import SparkplugEncoder, SparkplugMetric

                metrics = [
                    SparkplugMetric(
                        "ViolationId", event.violation_id, data_type="Int32"
                    ),
                    SparkplugMetric("User", event.user, data_type="String"),
                    SparkplugMetric("Reason", event.reason, data_type="String"),
                ]
                return SparkplugEncoder.encode_metrics(metrics, format="protobuf")
            return self._build_json_payload("violation_acknowledged", data)

        await self._publish_to_outbound_brokers(
            "ack", characteristic_id, payload_builder
        )

    async def _on_limits_updated(self, event: ControlLimitsUpdatedEvent) -> None:
        """Handle ControlLimitsUpdatedEvent — publish limit updates to outbound brokers."""
        logger.debug(
            "mqtt_pub_limits",
            characteristic_id=event.characteristic_id,
        )

        data = {
            "characteristic_id": event.characteristic_id,
            "center_line": event.center_line,
            "ucl": event.ucl,
            "lcl": event.lcl,
            "method": event.method,
            "sample_count": event.sample_count,
        }

        def payload_builder(fmt: str) -> bytes:
            if fmt == "sparkplug":
                from openspc.mqtt.sparkplug import SparkplugEncoder, SparkplugMetric

                metrics = [
                    SparkplugMetric(
                        "CenterLine", event.center_line, data_type="Float"
                    ),
                    SparkplugMetric("UCL", event.ucl, data_type="Float"),
                    SparkplugMetric("LCL", event.lcl, data_type="Float"),
                    SparkplugMetric("Method", event.method, data_type="String"),
                    SparkplugMetric(
                        "SampleCount", event.sample_count, data_type="Int32"
                    ),
                ]
                return SparkplugEncoder.encode_metrics(metrics, format="protobuf")
            return self._build_json_payload("limits_updated", data)

        await self._publish_to_outbound_brokers(
            "limits", event.characteristic_id, payload_builder
        )


__all__ = [
    "MQTTPublisher",
    "build_hierarchy_path",
    "build_outbound_topic",
    "sanitize_topic_segment",
]
