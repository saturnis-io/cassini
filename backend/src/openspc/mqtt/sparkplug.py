"""Sparkplug B protocol implementation for industrial MQTT communication.

This module provides encoding/decoding for Sparkplug B messages, a standardized
MQTT specification for Industrial IoT. It handles:
- Topic namespace parsing (spBv1.0/{group_id}/{message_type}/{edge_node_id}/{device_id})
- Metric extraction and encoding
- Session awareness (NBIRTH/NDEATH)
- Integration with OpenSPC violation events

References:
    - Sparkplug B Specification: https://sparkplug.eclipse.org/
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from openspc.mqtt.client import MQTTClient

logger = logging.getLogger(__name__)


@dataclass
class SparkplugMetric:
    """A single metric from a Sparkplug payload.

    Represents a name/value pair with type information and optional timestamp.
    Sparkplug metrics can represent sensor values, control parameters, or
    state information.

    Attributes:
        name: Metric identifier (e.g., "Temperature", "Control/UCL")
        value: Metric value (numeric, boolean, or string)
        timestamp: When the metric was sampled (None uses message timestamp)
        data_type: Sparkplug data type (Int32, Float, Boolean, String, etc.)
        properties: Optional metadata key-value pairs
    """

    name: str
    value: Any
    timestamp: datetime | None = None
    data_type: str = "Float"
    properties: dict[str, Any] | None = None


@dataclass
class SparkplugMessage:
    """Parsed Sparkplug B message.

    Represents a complete Sparkplug message with topic components and metrics.
    Message types include:
    - NBIRTH: Node birth certificate (session start)
    - NDEATH: Node death certificate (session end)
    - NDATA: Node data (telemetry)
    - NCMD: Node command
    - DBIRTH: Device birth certificate
    - DDEATH: Device death certificate
    - DDATA: Device data
    - DCMD: Device command

    Attributes:
        topic: Full MQTT topic string
        message_type: Sparkplug message type (NBIRTH, NDATA, etc.)
        group_id: Sparkplug group identifier
        edge_node_id: Edge node identifier
        device_id: Optional device identifier (None for node-level messages)
        timestamp: Message timestamp (milliseconds since epoch)
        metrics: List of metrics in the message
        seq: Optional sequence number for ordering
    """

    topic: str
    message_type: str
    group_id: str
    edge_node_id: str
    device_id: str | None
    timestamp: datetime
    metrics: list[SparkplugMetric]
    seq: int | None = None


class SparkplugDecoder:
    """Decodes Sparkplug B messages from MQTT payloads.

    Handles topic parsing and payload decoding. This implementation supports
    a JSON-based payload format for simplicity. For full protobuf compliance,
    use the official sparkplug-b library.

    Example:
        >>> decoder = SparkplugDecoder()
        >>> msg = decoder.decode_message(
        ...     "spBv1.0/spc/NDATA/node1/device1",
        ...     b'{"timestamp": 1706890000000, "metrics": [...]}'
        ... )
        >>> print(msg.message_type)
        'NDATA'
    """

    @staticmethod
    def parse_topic(topic: str) -> dict[str, str | None]:
        """Parse Sparkplug topic into components.

        Topic format: spBv1.0/{group_id}/{message_type}/{edge_node_id}[/{device_id}]

        Args:
            topic: Sparkplug topic string

        Returns:
            Dictionary with keys: namespace, group_id, message_type,
            edge_node_id, device_id (None if node-level message)

        Raises:
            ValueError: If topic doesn't match Sparkplug format

        Example:
            >>> parts = SparkplugDecoder.parse_topic("spBv1.0/spc/NDATA/node1")
            >>> parts["group_id"]
            'spc'
            >>> parts["device_id"]
            None
        """
        parts = topic.split("/")

        if len(parts) < 4 or parts[0] != "spBv1.0":
            raise ValueError(
                f"Invalid Sparkplug topic: {topic}. "
                f"Expected format: spBv1.0/{{group_id}}/{{message_type}}/"
                f"{{edge_node_id}}[/{{device_id}}]"
            )

        return {
            "namespace": parts[0],
            "group_id": parts[1],
            "message_type": parts[2],
            "edge_node_id": parts[3],
            "device_id": parts[4] if len(parts) > 4 else None,
        }

    @staticmethod
    def decode_payload(payload: bytes) -> tuple[datetime, list[SparkplugMetric], int | None]:
        """Decode Sparkplug B payload to metrics.

        This implementation uses JSON for simplicity. For production use with
        real Sparkplug devices, use the official protobuf-based implementation.

        Expected JSON format:
        {
            "timestamp": 1706890000000,  // milliseconds since epoch
            "seq": 0,  // optional sequence number
            "metrics": [
                {"name": "Temperature", "type": "Float", "value": 22.5},
                {"name": "State/InControl", "type": "Boolean", "value": true}
            ]
        }

        Args:
            payload: JSON-encoded payload bytes

        Returns:
            Tuple of (timestamp, metrics_list, sequence_number)

        Raises:
            ValueError: If payload is invalid JSON or missing required fields

        Example:
            >>> payload = b'{"timestamp": 1706890000000, "metrics": [...]}'
            >>> ts, metrics, seq = SparkplugDecoder.decode_payload(payload)
            >>> len(metrics)
            2
        """
        try:
            data = json.loads(payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            raise ValueError(f"Invalid JSON payload: {e}") from e

        if "timestamp" not in data:
            raise ValueError("Missing required field: timestamp")

        if "metrics" not in data:
            raise ValueError("Missing required field: metrics")

        # Convert milliseconds to datetime
        timestamp_ms = data["timestamp"]
        timestamp = datetime.utcfromtimestamp(timestamp_ms / 1000.0)

        # Parse metrics
        metrics = []
        for metric_data in data["metrics"]:
            if "name" not in metric_data or "value" not in metric_data:
                logger.warning(f"Skipping invalid metric: {metric_data}")
                continue

            metric = SparkplugMetric(
                name=metric_data["name"],
                value=metric_data["value"],
                data_type=metric_data.get("type", "Float"),
                timestamp=timestamp,
                properties=metric_data.get("properties"),
            )
            metrics.append(metric)

        seq = data.get("seq")

        return timestamp, metrics, seq

    def decode_message(self, topic: str, payload: bytes) -> SparkplugMessage:
        """Decode a complete Sparkplug message.

        Combines topic parsing and payload decoding into a single message object.

        Args:
            topic: MQTT topic string
            payload: Message payload bytes

        Returns:
            Parsed SparkplugMessage object

        Raises:
            ValueError: If topic or payload is invalid

        Example:
            >>> decoder = SparkplugDecoder()
            >>> msg = decoder.decode_message(topic, payload)
            >>> print(f"{msg.message_type}: {len(msg.metrics)} metrics")
            'NDATA: 5 metrics'
        """
        topic_parts = self.parse_topic(topic)
        timestamp, metrics, seq = self.decode_payload(payload)

        return SparkplugMessage(
            topic=topic,
            message_type=topic_parts["message_type"],
            group_id=topic_parts["group_id"],
            edge_node_id=topic_parts["edge_node_id"],
            device_id=topic_parts["device_id"],
            timestamp=timestamp,
            metrics=metrics,
            seq=seq,
        )


class SparkplugEncoder:
    """Encodes Sparkplug B messages for publishing.

    Builds Sparkplug-compliant topics and payloads. Uses JSON encoding
    for simplicity and compatibility with the decoder.

    Example:
        >>> encoder = SparkplugEncoder()
        >>> topic = encoder.build_topic("spc", "NDATA", "openspc-server", "char1")
        >>> print(topic)
        'spBv1.0/spc/NDATA/openspc-server/char1'
    """

    @staticmethod
    def build_topic(
        group_id: str,
        message_type: str,
        edge_node_id: str,
        device_id: str | None = None,
    ) -> str:
        """Build a Sparkplug topic string.

        Constructs a topic following the Sparkplug namespace specification.

        Args:
            group_id: Sparkplug group identifier (e.g., "spc", "factory1")
            message_type: Message type (NBIRTH, NDATA, NCMD, etc.)
            edge_node_id: Edge node identifier
            device_id: Optional device identifier (None for node-level)

        Returns:
            Formatted Sparkplug topic string

        Example:
            >>> SparkplugEncoder.build_topic("spc", "NDATA", "node1", "device1")
            'spBv1.0/spc/NDATA/node1/device1'
            >>> SparkplugEncoder.build_topic("spc", "NBIRTH", "node1")
            'spBv1.0/spc/NBIRTH/node1'
        """
        parts = ["spBv1.0", group_id, message_type, edge_node_id]
        if device_id:
            parts.append(device_id)
        return "/".join(parts)

    @staticmethod
    def encode_metrics(
        metrics: list[SparkplugMetric],
        timestamp: datetime | None = None,
        seq: int | None = None,
    ) -> bytes:
        """Encode metrics to Sparkplug payload.

        Creates a JSON payload matching the Sparkplug metric structure.

        Args:
            metrics: List of metrics to encode
            timestamp: Message timestamp (defaults to current time)
            seq: Optional sequence number for ordering

        Returns:
            JSON-encoded payload as bytes

        Example:
            >>> metrics = [SparkplugMetric("Temp", 22.5, data_type="Float")]
            >>> payload = SparkplugEncoder.encode_metrics(metrics)
            >>> b'"name": "Temp"' in payload
            True
        """
        if timestamp is None:
            timestamp = datetime.utcnow()

        # Convert to milliseconds since epoch
        timestamp_ms = int(timestamp.timestamp() * 1000)

        payload_data: dict[str, Any] = {
            "timestamp": timestamp_ms,
            "metrics": [
                {
                    "name": metric.name,
                    "type": metric.data_type,
                    "value": metric.value,
                }
                for metric in metrics
            ],
        }

        if seq is not None:
            payload_data["seq"] = seq

        return json.dumps(payload_data).encode("utf-8")

    @staticmethod
    def encode_violation_metrics(
        characteristic_name: str,
        value: float,
        ucl: float,
        lcl: float,
        in_control: bool,
        active_rules: list[str],
        operator: str | None = None,
        timestamp: datetime | None = None,
    ) -> bytes:
        """Encode SPC violation data as Sparkplug metrics.

        Creates a standardized payload for SPC control state following the
        UNS (Unified Namespace) payload specification.

        Metric structure:
        - Value: Measured value
        - Control/UCL: Upper control limit
        - Control/LCL: Lower control limit
        - State/InControl: Boolean control status
        - State/ActiveRules: Comma-separated active rule names
        - Context/Operator: Optional operator identifier

        Args:
            characteristic_name: Name of the characteristic
            value: Measured value
            ucl: Upper control limit
            lcl: Lower control limit
            in_control: Whether process is in control
            active_rules: List of active Nelson rule names
            operator: Optional operator identifier
            timestamp: Optional timestamp (defaults to current time)

        Returns:
            JSON-encoded Sparkplug payload

        Example:
            >>> payload = SparkplugEncoder.encode_violation_metrics(
            ...     "Diameter", 7.45, 7.6, 7.0, False, ["Rule 1"], "J.Smith"
            ... )
            >>> b'"State/InControl"' in payload
            True
        """
        metrics = [
            SparkplugMetric(name="Value", value=value, data_type="Float"),
            SparkplugMetric(name="Control/UCL", value=ucl, data_type="Float"),
            SparkplugMetric(name="Control/LCL", value=lcl, data_type="Float"),
            SparkplugMetric(name="State/InControl", value=in_control, data_type="Boolean"),
            SparkplugMetric(
                name="State/ActiveRules",
                value=", ".join(active_rules) if active_rules else "",
                data_type="String",
            ),
        ]

        if operator:
            metrics.append(
                SparkplugMetric(name="Context/Operator", value=operator, data_type="String")
            )

        return SparkplugEncoder.encode_metrics(metrics, timestamp)


class SparkplugAdapter:
    """Adapts between OpenSPC events and Sparkplug B messages.

    Provides high-level integration between the OpenSPC event system and
    Sparkplug MQTT protocol. Handles:
    - Extracting sample values from incoming NDATA messages
    - Publishing violation events as Sparkplug metrics
    - Session management (birth/death certificates)

    This adapter sits between the MQTT client and the SPC engine, translating
    between industrial IoT protocols and SPC domain events.

    Example:
        >>> config = MQTTConfig(host="mqtt.example.com")
        >>> mqtt_client = MQTTClient(config)
        >>> adapter = SparkplugAdapter(mqtt_client, "factory1", "spc-node")
        >>> await adapter.publish_spc_state("Diameter", 7.45, 7.6, 7.0, False, ["Rule 1"])
    """

    def __init__(
        self,
        mqtt_client: MQTTClient,
        group_id: str = "spc",
        edge_node_id: str = "openspc-server",
    ):
        """Initialize Sparkplug adapter.

        Args:
            mqtt_client: Configured MQTT client instance
            group_id: Sparkplug group identifier
            edge_node_id: Edge node identifier for this server
        """
        self._mqtt = mqtt_client
        self._group_id = group_id
        self._edge_node_id = edge_node_id
        self._decoder = SparkplugDecoder()
        self._encoder = SparkplugEncoder()
        self._seq = 0  # Sequence counter for ordering

    def extract_value_from_message(
        self,
        message: SparkplugMessage,
        metric_name: str = "Value",
    ) -> float | None:
        """Extract a numeric value from a Sparkplug message.

        Searches message metrics for a specific metric name and returns
        its value as a float. Useful for extracting sensor readings from
        incoming NDATA messages.

        Args:
            message: Parsed Sparkplug message
            metric_name: Name of metric to extract (default: "Value")

        Returns:
            Metric value as float, or None if not found

        Example:
            >>> msg = SparkplugMessage(...)  # Contains "Temperature" metric
            >>> value = adapter.extract_value_from_message(msg, "Temperature")
            >>> value
            22.5
        """
        for metric in message.metrics:
            if metric.name == metric_name:
                try:
                    return float(metric.value)
                except (TypeError, ValueError) as e:
                    logger.warning(
                        f"Cannot convert metric '{metric_name}' value "
                        f"{metric.value!r} to float: {e}"
                    )
                    return None
        return None

    async def publish_spc_state(
        self,
        characteristic_name: str,
        value: float,
        ucl: float,
        lcl: float,
        in_control: bool,
        active_rules: list[str],
        operator: str | None = None,
        timestamp: datetime | None = None,
    ) -> None:
        """Publish SPC state as Sparkplug NDATA message.

        Publishes the current control state of a characteristic to MQTT
        using Sparkplug format. This allows other systems to subscribe
        to SPC violations and state changes.

        The message is published to:
        spBv1.0/{group_id}/NDATA/{edge_node_id}/{characteristic_name}

        Args:
            characteristic_name: Name of the characteristic (used as device_id)
            value: Current measured value
            ucl: Upper control limit
            lcl: Lower control limit
            in_control: Whether process is in statistical control
            active_rules: List of Nelson rule names that are violated
            operator: Optional operator identifier
            timestamp: Optional timestamp (defaults to current time)

        Raises:
            RuntimeError: If MQTT client is not connected

        Example:
            >>> await adapter.publish_spc_state(
            ...     "Diameter",
            ...     value=7.45,
            ...     ucl=7.6,
            ...     lcl=7.0,
            ...     in_control=False,
            ...     active_rules=["Rule 1: Outlier"],
            ...     operator="J.Smith"
            ... )
        """
        topic = self._encoder.build_topic(
            self._group_id,
            "NDATA",
            self._edge_node_id,
            characteristic_name,
        )

        payload = self._encoder.encode_violation_metrics(
            characteristic_name=characteristic_name,
            value=value,
            ucl=ucl,
            lcl=lcl,
            in_control=in_control,
            active_rules=active_rules,
            operator=operator,
            timestamp=timestamp,
        )

        logger.info(
            f"Publishing SPC state for {characteristic_name} to {topic} "
            f"(in_control={in_control}, active_rules={len(active_rules)})"
        )

        await self._mqtt.publish(topic, payload, qos=1)
        self._seq += 1

    async def publish_birth_certificate(
        self,
        metrics: list[SparkplugMetric] | None = None,
    ) -> None:
        """Publish NBIRTH message for session awareness.

        Birth certificates announce the presence of an edge node and define
        its available metrics. This should be sent when the connection is
        established.

        Args:
            metrics: Optional list of metrics to include in birth certificate

        Example:
            >>> await adapter.publish_birth_certificate()
        """
        topic = self._encoder.build_topic(
            self._group_id,
            "NBIRTH",
            self._edge_node_id,
        )

        if metrics is None:
            metrics = [
                SparkplugMetric(
                    name="Node Control/Rebirth",
                    value=False,
                    data_type="Boolean",
                ),
            ]

        payload = self._encoder.encode_metrics(metrics, seq=0)
        self._seq = 0  # Reset sequence on birth

        logger.info(f"Publishing birth certificate to {topic}")
        await self._mqtt.publish(topic, payload, qos=1)

    async def publish_death_certificate(self) -> None:
        """Publish NDEATH message for graceful shutdown.

        Death certificates announce that an edge node is going offline.
        This should be configured as the MQTT Last Will and Testament (LWT).

        Example:
            >>> await adapter.publish_death_certificate()
        """
        topic = self._encoder.build_topic(
            self._group_id,
            "NDEATH",
            self._edge_node_id,
        )

        # Death certificate has minimal payload
        payload = self._encoder.encode_metrics([])

        logger.info(f"Publishing death certificate to {topic}")
        await self._mqtt.publish(topic, payload, qos=1)
