"""Sparkplug B protocol implementation for industrial MQTT communication.

This module provides encoding/decoding for Sparkplug B messages, a standardized
MQTT specification for Industrial IoT. It handles:
- Topic namespace parsing (spBv1.0/{group_id}/{message_type}/{edge_node_id}/{device_id})
- Metric extraction and encoding
- Session awareness (NBIRTH/NDEATH)
- Integration with OpenSPC violation events
- Both protobuf (real SparkplugB) and JSON (fallback) payload formats

References:
    - Sparkplug B Specification: https://sparkplug.eclipse.org/
"""

import json
import structlog
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from openspc.mqtt.client import MQTTClient

logger = structlog.get_logger(__name__)


# SparkplugB DataType enum mapping (protobuf integer -> string name)
# See: https://sparkplug.eclipse.org/specification/version/3.0/documents/sparkplug-specification-3.0.0.pdf
DATA_TYPE_MAP: dict[int, str] = {
    1: "Int8",
    2: "Int16",
    3: "Int32",
    4: "Int64",
    5: "UInt8",
    6: "UInt16",
    7: "UInt32",
    8: "UInt64",
    9: "Float",
    10: "Double",
    11: "Boolean",
    12: "String",
    13: "DateTime",
    14: "Text",
    15: "UUID",
    16: "DataSet",
    17: "Bytes",
    18: "File",
    19: "Template",
}

# Reverse map: string name -> protobuf integer
DATA_TYPE_REVERSE_MAP: dict[str, int] = {v: k for k, v in DATA_TYPE_MAP.items()}

# Map data type names to the protobuf value field to use
_VALUE_FIELD_MAP: dict[str, str] = {
    "Int8": "int_value",
    "Int16": "int_value",
    "Int32": "int_value",
    "UInt8": "int_value",
    "UInt16": "int_value",
    "UInt32": "int_value",
    "Int64": "long_value",
    "UInt64": "long_value",
    "DateTime": "long_value",
    "Float": "float_value",
    "Double": "double_value",
    "Boolean": "boolean_value",
    "String": "string_value",
    "Text": "string_value",
    "UUID": "string_value",
    "Bytes": "bytes_value",
    "File": "bytes_value",
}


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


def _extract_protobuf_value(metric) -> Any:
    """Extract value from a protobuf Metric based on its oneof field.

    Args:
        metric: Protobuf Payload.Metric instance

    Returns:
        The extracted value (int, float, bool, str, bytes, or None)
    """
    value_field = metric.WhichOneof("value")
    if value_field is None:
        return None
    return getattr(metric, value_field)


class SparkplugDecoder:
    """Decodes Sparkplug B messages from MQTT payloads.

    Handles topic parsing and payload decoding. Supports both real protobuf
    payloads (for interop with Ignition, Cirrus Link, etc.) and JSON payloads
    (for backward compatibility and testing).

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
    def decode_payload(
        payload: bytes,
        format: str = "protobuf",
    ) -> tuple[datetime, list[SparkplugMetric], int | None]:
        """Decode Sparkplug B payload to metrics.

        Supports both protobuf and JSON payload formats. When format is
        "protobuf", uses the real SparkplugB protobuf decoder. Falls back
        to JSON if protobuf parsing fails.

        Args:
            payload: Payload bytes (protobuf or JSON encoded)
            format: Payload format - "protobuf" or "json" (default: "protobuf")

        Returns:
            Tuple of (timestamp, metrics_list, sequence_number)

        Raises:
            ValueError: If payload is invalid and cannot be decoded

        Example:
            >>> ts, metrics, seq = SparkplugDecoder.decode_payload(data, format="protobuf")
            >>> len(metrics)
            2
        """
        if format == "protobuf":
            try:
                return SparkplugDecoder._decode_protobuf(payload)
            except Exception as e:
                logger.warning(
                    "protobuf_decode_failed_json_fallback",
                    error=str(e),
                )
                try:
                    return SparkplugDecoder._decode_json(payload)
                except Exception:
                    raise ValueError(
                        f"Payload could not be decoded as protobuf or JSON: {e}"
                    ) from e
        else:
            return SparkplugDecoder._decode_json(payload)

    @staticmethod
    def _decode_protobuf(
        payload: bytes,
    ) -> tuple[datetime, list[SparkplugMetric], int | None]:
        """Decode a protobuf SparkplugB payload.

        Args:
            payload: Protobuf-encoded payload bytes

        Returns:
            Tuple of (timestamp, metrics_list, sequence_number)
        """
        from openspc.mqtt.sparkplug_b_pb2 import Payload

        pb = Payload()
        pb.ParseFromString(payload)

        # Extract timestamp (ms since epoch -> datetime)
        timestamp = datetime.utcfromtimestamp(pb.timestamp / 1000.0)

        # Extract sequence number
        seq = pb.seq if pb.seq else None

        # Extract metrics
        metrics = []
        for m in pb.metrics:
            # Determine data type name
            dt_name = DATA_TYPE_MAP.get(m.datatype, "Float")

            # Extract value from oneof field
            value = _extract_protobuf_value(m)

            # Extract metric timestamp if present
            metric_ts = None
            if m.timestamp:
                metric_ts = datetime.utcfromtimestamp(m.timestamp / 1000.0)

            metric = SparkplugMetric(
                name=m.name,
                value=value,
                data_type=dt_name,
                timestamp=metric_ts or timestamp,
            )
            metrics.append(metric)

        return timestamp, metrics, seq

    @staticmethod
    def _decode_json(
        payload: bytes,
    ) -> tuple[datetime, list[SparkplugMetric], int | None]:
        """Decode a JSON SparkplugB payload (backward compatible).

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
                logger.warning("skipping_invalid_metric", metric_data=metric_data)
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

    def decode_message(
        self,
        topic: str,
        payload: bytes,
        format: str = "protobuf",
    ) -> SparkplugMessage:
        """Decode a complete Sparkplug message.

        Combines topic parsing and payload decoding into a single message object.

        Args:
            topic: MQTT topic string
            payload: Message payload bytes
            format: Payload format - "protobuf" or "json" (default: "protobuf")

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
        timestamp, metrics, seq = self.decode_payload(payload, format=format)

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

    Builds Sparkplug-compliant topics and payloads. Supports both real
    protobuf encoding (for interop with industrial devices) and JSON
    encoding (for backward compatibility).

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
        format: str = "protobuf",
    ) -> bytes:
        """Encode metrics to Sparkplug payload.

        Supports both protobuf and JSON formats.

        Args:
            metrics: List of metrics to encode
            timestamp: Message timestamp (defaults to current time)
            seq: Optional sequence number for ordering
            format: Payload format - "protobuf" or "json" (default: "protobuf")

        Returns:
            Encoded payload as bytes (protobuf binary or JSON)

        Example:
            >>> metrics = [SparkplugMetric("Temp", 22.5, data_type="Float")]
            >>> payload = SparkplugEncoder.encode_metrics(metrics, format="protobuf")
            >>> isinstance(payload, bytes)
            True
        """
        if format == "protobuf":
            return SparkplugEncoder._encode_protobuf(metrics, timestamp, seq)
        else:
            return SparkplugEncoder._encode_json(metrics, timestamp, seq)

    @staticmethod
    def _encode_protobuf(
        metrics: list[SparkplugMetric],
        timestamp: datetime | None = None,
        seq: int | None = None,
    ) -> bytes:
        """Encode metrics to protobuf SparkplugB payload.

        Args:
            metrics: List of metrics to encode
            timestamp: Message timestamp (defaults to current time)
            seq: Optional sequence number for ordering

        Returns:
            Protobuf-encoded payload as bytes
        """
        from openspc.mqtt.sparkplug_b_pb2 import Payload

        if timestamp is None:
            timestamp = datetime.now(timezone.utc)

        pb = Payload()
        pb.timestamp = int(timestamp.timestamp() * 1000)

        if seq is not None:
            pb.seq = seq

        for metric in metrics:
            m = pb.metrics.add()
            m.name = metric.name

            if metric.timestamp:
                m.timestamp = int(metric.timestamp.timestamp() * 1000)

            # Set data type
            dt_int = DATA_TYPE_REVERSE_MAP.get(metric.data_type, 9)  # Default: Float
            m.datatype = dt_int

            # Set value in appropriate field
            value_field = _VALUE_FIELD_MAP.get(metric.data_type, "float_value")
            try:
                if value_field == "float_value":
                    m.float_value = float(metric.value)
                elif value_field == "double_value":
                    m.double_value = float(metric.value)
                elif value_field == "int_value":
                    m.int_value = int(metric.value)
                elif value_field == "long_value":
                    m.long_value = int(metric.value)
                elif value_field == "boolean_value":
                    m.boolean_value = bool(metric.value)
                elif value_field == "string_value":
                    m.string_value = str(metric.value)
                elif value_field == "bytes_value":
                    if isinstance(metric.value, bytes):
                        m.bytes_value = metric.value
                    else:
                        m.bytes_value = str(metric.value).encode("utf-8")
            except (TypeError, ValueError) as e:
                logger.warning(
                    "metric_value_encode_fallback",
                    metric_name=metric.name,
                    error=str(e),
                )
                m.string_value = str(metric.value)
                m.datatype = DATA_TYPE_REVERSE_MAP.get("String", 12)

        return pb.SerializeToString()

    @staticmethod
    def _encode_json(
        metrics: list[SparkplugMetric],
        timestamp: datetime | None = None,
        seq: int | None = None,
    ) -> bytes:
        """Encode metrics to JSON payload (backward compatible).

        Args:
            metrics: List of metrics to encode
            timestamp: Message timestamp (defaults to current time)
            seq: Optional sequence number for ordering

        Returns:
            JSON-encoded payload as bytes
        """
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)

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
        format: str = "protobuf",
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
            format: Payload format - "protobuf" or "json" (default: "protobuf")

        Returns:
            Encoded Sparkplug payload

        Example:
            >>> payload = SparkplugEncoder.encode_violation_metrics(
            ...     "Diameter", 7.45, 7.6, 7.0, False, ["Rule 1"], "J.Smith"
            ... )
            >>> isinstance(payload, bytes)
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

        return SparkplugEncoder.encode_metrics(metrics, timestamp, format=format)


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
        payload_format: str = "protobuf",
    ):
        """Initialize Sparkplug adapter.

        Args:
            mqtt_client: Configured MQTT client instance
            group_id: Sparkplug group identifier
            edge_node_id: Edge node identifier for this server
            payload_format: Payload format - "protobuf" or "json" (default: "protobuf")
        """
        self._mqtt = mqtt_client
        self._group_id = group_id
        self._edge_node_id = edge_node_id
        self._payload_format = payload_format
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
                        "metric_value_conversion_failed",
                        metric_name=metric_name,
                        value=repr(metric.value),
                        error=str(e),
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
            format=self._payload_format,
        )

        logger.info(
            "publishing_spc_state",
            characteristic=characteristic_name,
            topic=topic,
            in_control=in_control,
            active_rule_count=len(active_rules),
            format=self._payload_format,
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

        payload = self._encoder.encode_metrics(
            metrics, seq=0, format=self._payload_format
        )
        self._seq = 0  # Reset sequence on birth

        logger.info("publishing_birth_certificate", topic=topic)
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
        payload = self._encoder.encode_metrics([], format=self._payload_format)

        logger.info("publishing_death_certificate", topic=topic)
        await self._mqtt.publish(topic, payload, qos=1)
