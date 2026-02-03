"""Unit tests for Sparkplug B protocol implementation."""

import json
from datetime import datetime
from unittest.mock import AsyncMock, Mock

import pytest

from openspc.mqtt.sparkplug import (
    SparkplugAdapter,
    SparkplugDecoder,
    SparkplugEncoder,
    SparkplugMessage,
    SparkplugMetric,
)


class TestSparkplugMetric:
    """Tests for SparkplugMetric dataclass."""

    def test_metric_creation_with_defaults(self) -> None:
        """Test creating metric with default values."""
        metric = SparkplugMetric(name="Temperature", value=22.5)

        assert metric.name == "Temperature"
        assert metric.value == 22.5
        assert metric.timestamp is None
        assert metric.data_type == "Float"
        assert metric.properties is None

    def test_metric_creation_with_all_fields(self) -> None:
        """Test creating metric with all fields specified."""
        timestamp = datetime(2024, 2, 1, 12, 0, 0)
        properties = {"unit": "celsius"}

        metric = SparkplugMetric(
            name="Temperature",
            value=22.5,
            timestamp=timestamp,
            data_type="Double",
            properties=properties,
        )

        assert metric.name == "Temperature"
        assert metric.value == 22.5
        assert metric.timestamp == timestamp
        assert metric.data_type == "Double"
        assert metric.properties == properties

    def test_metric_with_different_types(self) -> None:
        """Test metrics with different data types."""
        float_metric = SparkplugMetric("Temp", 22.5, data_type="Float")
        int_metric = SparkplugMetric("Count", 42, data_type="Int32")
        bool_metric = SparkplugMetric("InControl", True, data_type="Boolean")
        string_metric = SparkplugMetric("Status", "OK", data_type="String")

        assert float_metric.value == 22.5
        assert int_metric.value == 42
        assert bool_metric.value is True
        assert string_metric.value == "OK"


class TestSparkplugMessage:
    """Tests for SparkplugMessage dataclass."""

    def test_message_creation_node_level(self) -> None:
        """Test creating a node-level message (no device_id)."""
        timestamp = datetime(2024, 2, 1, 12, 0, 0)
        metrics = [SparkplugMetric("Temp", 22.5)]

        message = SparkplugMessage(
            topic="spBv1.0/spc/NDATA/node1",
            message_type="NDATA",
            group_id="spc",
            edge_node_id="node1",
            device_id=None,
            timestamp=timestamp,
            metrics=metrics,
        )

        assert message.topic == "spBv1.0/spc/NDATA/node1"
        assert message.message_type == "NDATA"
        assert message.group_id == "spc"
        assert message.edge_node_id == "node1"
        assert message.device_id is None
        assert message.timestamp == timestamp
        assert len(message.metrics) == 1
        assert message.seq is None

    def test_message_creation_device_level(self) -> None:
        """Test creating a device-level message (with device_id)."""
        timestamp = datetime(2024, 2, 1, 12, 0, 0)
        metrics = [SparkplugMetric("Value", 7.45)]

        message = SparkplugMessage(
            topic="spBv1.0/spc/DDATA/node1/device1",
            message_type="DDATA",
            group_id="spc",
            edge_node_id="node1",
            device_id="device1",
            timestamp=timestamp,
            metrics=metrics,
            seq=5,
        )

        assert message.device_id == "device1"
        assert message.seq == 5


class TestSparkplugDecoderTopicParsing:
    """Tests for Sparkplug topic parsing."""

    def test_parse_node_level_topic(self) -> None:
        """Test parsing node-level topic without device_id."""
        topic = "spBv1.0/spc/NDATA/node1"
        parts = SparkplugDecoder.parse_topic(topic)

        assert parts["namespace"] == "spBv1.0"
        assert parts["group_id"] == "spc"
        assert parts["message_type"] == "NDATA"
        assert parts["edge_node_id"] == "node1"
        assert parts["device_id"] is None

    def test_parse_device_level_topic(self) -> None:
        """Test parsing device-level topic with device_id."""
        topic = "spBv1.0/factory1/DDATA/edge-node-1/sensor-42"
        parts = SparkplugDecoder.parse_topic(topic)

        assert parts["namespace"] == "spBv1.0"
        assert parts["group_id"] == "factory1"
        assert parts["message_type"] == "DDATA"
        assert parts["edge_node_id"] == "edge-node-1"
        assert parts["device_id"] == "sensor-42"

    def test_parse_birth_certificate(self) -> None:
        """Test parsing NBIRTH topic."""
        topic = "spBv1.0/spc/NBIRTH/openspc-server"
        parts = SparkplugDecoder.parse_topic(topic)

        assert parts["message_type"] == "NBIRTH"
        assert parts["edge_node_id"] == "openspc-server"

    def test_parse_death_certificate(self) -> None:
        """Test parsing NDEATH topic."""
        topic = "spBv1.0/spc/NDEATH/openspc-server"
        parts = SparkplugDecoder.parse_topic(topic)

        assert parts["message_type"] == "NDEATH"

    def test_parse_invalid_topic_missing_parts(self) -> None:
        """Test parsing topic with missing parts raises ValueError."""
        with pytest.raises(ValueError, match="Invalid Sparkplug topic"):
            SparkplugDecoder.parse_topic("spBv1.0/spc")

    def test_parse_invalid_topic_wrong_namespace(self) -> None:
        """Test parsing topic with wrong namespace raises ValueError."""
        with pytest.raises(ValueError, match="Invalid Sparkplug topic"):
            SparkplugDecoder.parse_topic("mqtt/spc/NDATA/node1")

    def test_parse_empty_topic(self) -> None:
        """Test parsing empty topic raises ValueError."""
        with pytest.raises(ValueError, match="Invalid Sparkplug topic"):
            SparkplugDecoder.parse_topic("")


class TestSparkplugDecoderPayloadDecoding:
    """Tests for Sparkplug payload decoding."""

    def test_decode_simple_payload(self) -> None:
        """Test decoding payload with single metric."""
        payload = json.dumps(
            {
                "timestamp": 1706890000000,
                "metrics": [{"name": "Temperature", "type": "Float", "value": 22.5}],
            }
        ).encode("utf-8")

        timestamp, metrics, seq = SparkplugDecoder.decode_payload(payload)

        assert timestamp == datetime.utcfromtimestamp(1706890000)
        assert len(metrics) == 1
        assert metrics[0].name == "Temperature"
        assert metrics[0].value == 22.5
        assert metrics[0].data_type == "Float"
        assert seq is None

    def test_decode_multiple_metrics(self) -> None:
        """Test decoding payload with multiple metrics."""
        payload = json.dumps(
            {
                "timestamp": 1706890000000,
                "metrics": [
                    {"name": "Temperature", "type": "Float", "value": 22.5},
                    {"name": "Humidity", "type": "Float", "value": 65.0},
                    {"name": "Status", "type": "String", "value": "OK"},
                ],
            }
        ).encode("utf-8")

        timestamp, metrics, seq = SparkplugDecoder.decode_payload(payload)

        assert len(metrics) == 3
        assert metrics[0].name == "Temperature"
        assert metrics[1].name == "Humidity"
        assert metrics[2].name == "Status"

    def test_decode_payload_with_sequence(self) -> None:
        """Test decoding payload with sequence number."""
        payload = json.dumps(
            {
                "timestamp": 1706890000000,
                "seq": 42,
                "metrics": [{"name": "Value", "type": "Float", "value": 7.45}],
            }
        ).encode("utf-8")

        timestamp, metrics, seq = SparkplugDecoder.decode_payload(payload)

        assert seq == 42

    def test_decode_payload_default_type(self) -> None:
        """Test metric without explicit type defaults to Float."""
        payload = json.dumps(
            {
                "timestamp": 1706890000000,
                "metrics": [{"name": "Value", "value": 123.45}],
            }
        ).encode("utf-8")

        timestamp, metrics, seq = SparkplugDecoder.decode_payload(payload)

        assert metrics[0].data_type == "Float"

    def test_decode_payload_with_properties(self) -> None:
        """Test decoding metric with properties."""
        payload = json.dumps(
            {
                "timestamp": 1706890000000,
                "metrics": [
                    {
                        "name": "Temperature",
                        "type": "Float",
                        "value": 22.5,
                        "properties": {"unit": "celsius", "sensor_id": "T-001"},
                    }
                ],
            }
        ).encode("utf-8")

        timestamp, metrics, seq = SparkplugDecoder.decode_payload(payload)

        assert metrics[0].properties == {"unit": "celsius", "sensor_id": "T-001"}

    def test_decode_invalid_json_raises_error(self) -> None:
        """Test decoding invalid JSON raises ValueError."""
        payload = b"not valid json"

        with pytest.raises(ValueError, match="Invalid JSON payload"):
            SparkplugDecoder.decode_payload(payload)

    def test_decode_missing_timestamp_raises_error(self) -> None:
        """Test decoding without timestamp raises ValueError."""
        payload = json.dumps(
            {"metrics": [{"name": "Value", "value": 123}]}
        ).encode("utf-8")

        with pytest.raises(ValueError, match="Missing required field: timestamp"):
            SparkplugDecoder.decode_payload(payload)

    def test_decode_missing_metrics_raises_error(self) -> None:
        """Test decoding without metrics raises ValueError."""
        payload = json.dumps({"timestamp": 1706890000000}).encode("utf-8")

        with pytest.raises(ValueError, match="Missing required field: metrics"):
            SparkplugDecoder.decode_payload(payload)

    def test_decode_invalid_metric_skipped(self) -> None:
        """Test invalid metrics are skipped with warning."""
        payload = json.dumps(
            {
                "timestamp": 1706890000000,
                "metrics": [
                    {"name": "Valid", "value": 123},
                    {"invalid": "metric"},  # Missing name and value
                    {"name": "AlsoValid", "value": 456},
                ],
            }
        ).encode("utf-8")

        timestamp, metrics, seq = SparkplugDecoder.decode_payload(payload)

        # Should skip invalid metric
        assert len(metrics) == 2
        assert metrics[0].name == "Valid"
        assert metrics[1].name == "AlsoValid"


class TestSparkplugDecoderMessageDecoding:
    """Tests for complete message decoding."""

    def test_decode_complete_message(self) -> None:
        """Test decoding complete Sparkplug message."""
        topic = "spBv1.0/spc/NDATA/node1/device1"
        payload = json.dumps(
            {
                "timestamp": 1706890000000,
                "seq": 5,
                "metrics": [
                    {"name": "Temperature", "type": "Float", "value": 22.5},
                    {"name": "Pressure", "type": "Float", "value": 101.3},
                ],
            }
        ).encode("utf-8")

        decoder = SparkplugDecoder()
        message = decoder.decode_message(topic, payload)

        assert message.topic == topic
        assert message.message_type == "NDATA"
        assert message.group_id == "spc"
        assert message.edge_node_id == "node1"
        assert message.device_id == "device1"
        assert message.seq == 5
        assert len(message.metrics) == 2

    def test_decode_birth_certificate_message(self) -> None:
        """Test decoding NBIRTH message."""
        topic = "spBv1.0/factory1/NBIRTH/edge-node-1"
        payload = json.dumps(
            {
                "timestamp": 1706890000000,
                "seq": 0,
                "metrics": [
                    {"name": "Node Control/Rebirth", "type": "Boolean", "value": False}
                ],
            }
        ).encode("utf-8")

        decoder = SparkplugDecoder()
        message = decoder.decode_message(topic, payload)

        assert message.message_type == "NBIRTH"
        assert message.seq == 0
        assert len(message.metrics) == 1


class TestSparkplugEncoderTopicBuilding:
    """Tests for Sparkplug topic building."""

    def test_build_node_level_topic(self) -> None:
        """Test building node-level topic."""
        topic = SparkplugEncoder.build_topic("spc", "NDATA", "openspc-server")

        assert topic == "spBv1.0/spc/NDATA/openspc-server"

    def test_build_device_level_topic(self) -> None:
        """Test building device-level topic."""
        topic = SparkplugEncoder.build_topic(
            "factory1", "DDATA", "edge-node-1", "sensor-42"
        )

        assert topic == "spBv1.0/factory1/DDATA/edge-node-1/sensor-42"

    def test_build_birth_topic(self) -> None:
        """Test building NBIRTH topic."""
        topic = SparkplugEncoder.build_topic("spc", "NBIRTH", "node1")

        assert topic == "spBv1.0/spc/NBIRTH/node1"

    def test_build_death_topic(self) -> None:
        """Test building NDEATH topic."""
        topic = SparkplugEncoder.build_topic("spc", "NDEATH", "node1")

        assert topic == "spBv1.0/spc/NDEATH/node1"

    def test_build_command_topic(self) -> None:
        """Test building NCMD topic."""
        topic = SparkplugEncoder.build_topic("spc", "NCMD", "node1", "device1")

        assert topic == "spBv1.0/spc/NCMD/node1/device1"


class TestSparkplugEncoderMetricEncoding:
    """Tests for metric encoding."""

    def test_encode_single_metric(self) -> None:
        """Test encoding single metric."""
        timestamp = datetime(2024, 2, 1, 12, 0, 0)
        metrics = [SparkplugMetric("Temperature", 22.5, data_type="Float")]

        payload = SparkplugEncoder.encode_metrics(metrics, timestamp)
        data = json.loads(payload.decode("utf-8"))

        assert "timestamp" in data
        assert "metrics" in data
        assert len(data["metrics"]) == 1
        assert data["metrics"][0]["name"] == "Temperature"
        assert data["metrics"][0]["type"] == "Float"
        assert data["metrics"][0]["value"] == 22.5

    def test_encode_multiple_metrics(self) -> None:
        """Test encoding multiple metrics."""
        metrics = [
            SparkplugMetric("Temp", 22.5, data_type="Float"),
            SparkplugMetric("Humidity", 65.0, data_type="Float"),
            SparkplugMetric("Status", "OK", data_type="String"),
        ]

        payload = SparkplugEncoder.encode_metrics(metrics)
        data = json.loads(payload.decode("utf-8"))

        assert len(data["metrics"]) == 3

    def test_encode_with_sequence_number(self) -> None:
        """Test encoding with sequence number."""
        metrics = [SparkplugMetric("Value", 123)]
        payload = SparkplugEncoder.encode_metrics(metrics, seq=42)
        data = json.loads(payload.decode("utf-8"))

        assert data["seq"] == 42

    def test_encode_without_sequence_number(self) -> None:
        """Test encoding without sequence number."""
        metrics = [SparkplugMetric("Value", 123)]
        payload = SparkplugEncoder.encode_metrics(metrics)
        data = json.loads(payload.decode("utf-8"))

        assert "seq" not in data

    def test_encode_with_default_timestamp(self) -> None:
        """Test encoding uses current time when timestamp not provided."""
        metrics = [SparkplugMetric("Value", 123)]
        payload = SparkplugEncoder.encode_metrics(metrics)
        data = json.loads(payload.decode("utf-8"))

        # Should have a timestamp
        assert "timestamp" in data
        assert isinstance(data["timestamp"], int)
        assert data["timestamp"] > 0

    def test_encode_timestamp_as_milliseconds(self) -> None:
        """Test timestamp is encoded as milliseconds since epoch."""
        timestamp = datetime(2024, 2, 1, 12, 0, 0)
        metrics = [SparkplugMetric("Value", 123)]
        payload = SparkplugEncoder.encode_metrics(metrics, timestamp)
        data = json.loads(payload.decode("utf-8"))

        expected_ms = int(timestamp.timestamp() * 1000)
        assert data["timestamp"] == expected_ms


class TestSparkplugEncoderViolationMetrics:
    """Tests for SPC violation metric encoding."""

    def test_encode_violation_metrics_basic(self) -> None:
        """Test encoding basic violation metrics."""
        payload = SparkplugEncoder.encode_violation_metrics(
            characteristic_name="Diameter",
            value=7.45,
            ucl=7.6,
            lcl=7.0,
            in_control=False,
            active_rules=["Rule 1: Outlier"],
        )

        data = json.loads(payload.decode("utf-8"))

        assert len(data["metrics"]) == 5  # No operator
        metric_map = {m["name"]: m for m in data["metrics"]}

        assert metric_map["Value"]["value"] == 7.45
        assert metric_map["Value"]["type"] == "Float"
        assert metric_map["Control/UCL"]["value"] == 7.6
        assert metric_map["Control/LCL"]["value"] == 7.0
        assert metric_map["State/InControl"]["value"] is False
        assert metric_map["State/InControl"]["type"] == "Boolean"
        assert metric_map["State/ActiveRules"]["value"] == "Rule 1: Outlier"
        assert metric_map["State/ActiveRules"]["type"] == "String"

    def test_encode_violation_metrics_with_operator(self) -> None:
        """Test encoding violation metrics with operator."""
        payload = SparkplugEncoder.encode_violation_metrics(
            characteristic_name="Diameter",
            value=7.45,
            ucl=7.6,
            lcl=7.0,
            in_control=True,
            active_rules=[],
            operator="J.Smith",
        )

        data = json.loads(payload.decode("utf-8"))

        assert len(data["metrics"]) == 6  # With operator
        metric_map = {m["name"]: m for m in data["metrics"]}

        assert "Context/Operator" in metric_map
        assert metric_map["Context/Operator"]["value"] == "J.Smith"
        assert metric_map["Context/Operator"]["type"] == "String"

    def test_encode_violation_metrics_in_control(self) -> None:
        """Test encoding metrics when process is in control."""
        payload = SparkplugEncoder.encode_violation_metrics(
            characteristic_name="Diameter",
            value=7.3,
            ucl=7.6,
            lcl=7.0,
            in_control=True,
            active_rules=[],
        )

        data = json.loads(payload.decode("utf-8"))
        metric_map = {m["name"]: m for m in data["metrics"]}

        assert metric_map["State/InControl"]["value"] is True
        assert metric_map["State/ActiveRules"]["value"] == ""

    def test_encode_violation_metrics_multiple_rules(self) -> None:
        """Test encoding metrics with multiple active rules."""
        payload = SparkplugEncoder.encode_violation_metrics(
            characteristic_name="Diameter",
            value=7.45,
            ucl=7.6,
            lcl=7.0,
            in_control=False,
            active_rules=["Rule 1: Outlier", "Rule 3: 6 points trending"],
        )

        data = json.loads(payload.decode("utf-8"))
        metric_map = {m["name"]: m for m in data["metrics"]}

        assert (
            metric_map["State/ActiveRules"]["value"]
            == "Rule 1: Outlier, Rule 3: 6 points trending"
        )

    def test_encode_violation_metrics_custom_timestamp(self) -> None:
        """Test encoding with custom timestamp."""
        timestamp = datetime(2024, 2, 1, 12, 0, 0)

        payload = SparkplugEncoder.encode_violation_metrics(
            characteristic_name="Diameter",
            value=7.45,
            ucl=7.6,
            lcl=7.0,
            in_control=True,
            active_rules=[],
            timestamp=timestamp,
        )

        data = json.loads(payload.decode("utf-8"))
        expected_ms = int(timestamp.timestamp() * 1000)

        assert data["timestamp"] == expected_ms


class TestSparkplugAdapterInitialization:
    """Tests for SparkplugAdapter initialization."""

    def test_adapter_initialization(self) -> None:
        """Test adapter initializes with correct defaults."""
        mock_mqtt = Mock()
        adapter = SparkplugAdapter(mock_mqtt)

        assert adapter._mqtt == mock_mqtt
        assert adapter._group_id == "spc"
        assert adapter._edge_node_id == "openspc-server"
        assert adapter._seq == 0

    def test_adapter_custom_ids(self) -> None:
        """Test adapter with custom group and node IDs."""
        mock_mqtt = Mock()
        adapter = SparkplugAdapter(mock_mqtt, "factory1", "edge-node-42")

        assert adapter._group_id == "factory1"
        assert adapter._edge_node_id == "edge-node-42"


class TestSparkplugAdapterValueExtraction:
    """Tests for value extraction from messages."""

    def test_extract_value_default_metric(self) -> None:
        """Test extracting value from default 'Value' metric."""
        message = SparkplugMessage(
            topic="spBv1.0/spc/NDATA/node1/device1",
            message_type="NDATA",
            group_id="spc",
            edge_node_id="node1",
            device_id="device1",
            timestamp=datetime.utcnow(),
            metrics=[
                SparkplugMetric("Value", 7.45, data_type="Float"),
                SparkplugMetric("Temperature", 22.5, data_type="Float"),
            ],
        )

        mock_mqtt = Mock()
        adapter = SparkplugAdapter(mock_mqtt)
        value = adapter.extract_value_from_message(message)

        assert value == 7.45

    def test_extract_value_custom_metric(self) -> None:
        """Test extracting value from custom metric name."""
        message = SparkplugMessage(
            topic="spBv1.0/spc/NDATA/node1/device1",
            message_type="NDATA",
            group_id="spc",
            edge_node_id="node1",
            device_id="device1",
            timestamp=datetime.utcnow(),
            metrics=[
                SparkplugMetric("Temperature", 22.5, data_type="Float"),
                SparkplugMetric("Humidity", 65.0, data_type="Float"),
            ],
        )

        mock_mqtt = Mock()
        adapter = SparkplugAdapter(mock_mqtt)
        value = adapter.extract_value_from_message(message, "Temperature")

        assert value == 22.5

    def test_extract_value_not_found(self) -> None:
        """Test extracting non-existent metric returns None."""
        message = SparkplugMessage(
            topic="spBv1.0/spc/NDATA/node1/device1",
            message_type="NDATA",
            group_id="spc",
            edge_node_id="node1",
            device_id="device1",
            timestamp=datetime.utcnow(),
            metrics=[SparkplugMetric("Temperature", 22.5, data_type="Float")],
        )

        mock_mqtt = Mock()
        adapter = SparkplugAdapter(mock_mqtt)
        value = adapter.extract_value_from_message(message, "Pressure")

        assert value is None

    def test_extract_value_non_numeric(self) -> None:
        """Test extracting non-numeric value returns None with warning."""
        message = SparkplugMessage(
            topic="spBv1.0/spc/NDATA/node1/device1",
            message_type="NDATA",
            group_id="spc",
            edge_node_id="node1",
            device_id="device1",
            timestamp=datetime.utcnow(),
            metrics=[SparkplugMetric("Status", "OK", data_type="String")],
        )

        mock_mqtt = Mock()
        adapter = SparkplugAdapter(mock_mqtt)
        value = adapter.extract_value_from_message(message, "Status")

        assert value is None

    def test_extract_value_convertible_to_float(self) -> None:
        """Test extracting value that can be converted to float."""
        message = SparkplugMessage(
            topic="spBv1.0/spc/NDATA/node1/device1",
            message_type="NDATA",
            group_id="spc",
            edge_node_id="node1",
            device_id="device1",
            timestamp=datetime.utcnow(),
            metrics=[SparkplugMetric("Count", 42, data_type="Int32")],
        )

        mock_mqtt = Mock()
        adapter = SparkplugAdapter(mock_mqtt)
        value = adapter.extract_value_from_message(message, "Count")

        assert value == 42.0
        assert isinstance(value, float)


class TestSparkplugAdapterPublishing:
    """Tests for publishing SPC state."""

    @pytest.mark.asyncio
    async def test_publish_spc_state_basic(self) -> None:
        """Test publishing SPC state."""
        mock_mqtt = AsyncMock()
        adapter = SparkplugAdapter(mock_mqtt, "factory1", "spc-node")

        await adapter.publish_spc_state(
            characteristic_name="Diameter",
            value=7.45,
            ucl=7.6,
            lcl=7.0,
            in_control=False,
            active_rules=["Rule 1: Outlier"],
        )

        # Verify publish was called
        mock_mqtt.publish.assert_called_once()
        call_args = mock_mqtt.publish.call_args

        # Check topic
        topic = call_args[0][0]
        assert topic == "spBv1.0/factory1/NDATA/spc-node/Diameter"

        # Check payload
        payload = call_args[0][1]
        data = json.loads(payload.decode("utf-8"))
        metric_map = {m["name"]: m for m in data["metrics"]}

        assert metric_map["Value"]["value"] == 7.45
        assert metric_map["Control/UCL"]["value"] == 7.6
        assert metric_map["Control/LCL"]["value"] == 7.0
        assert metric_map["State/InControl"]["value"] is False

        # Check QoS
        assert call_args[1]["qos"] == 1

    @pytest.mark.asyncio
    async def test_publish_spc_state_with_operator(self) -> None:
        """Test publishing SPC state with operator."""
        mock_mqtt = AsyncMock()
        adapter = SparkplugAdapter(mock_mqtt)

        await adapter.publish_spc_state(
            characteristic_name="Diameter",
            value=7.45,
            ucl=7.6,
            lcl=7.0,
            in_control=True,
            active_rules=[],
            operator="J.Smith",
        )

        payload = mock_mqtt.publish.call_args[0][1]
        data = json.loads(payload.decode("utf-8"))
        metric_map = {m["name"]: m for m in data["metrics"]}

        assert "Context/Operator" in metric_map
        assert metric_map["Context/Operator"]["value"] == "J.Smith"

    @pytest.mark.asyncio
    async def test_publish_spc_state_increments_sequence(self) -> None:
        """Test sequence number increments with each publish."""
        mock_mqtt = AsyncMock()
        adapter = SparkplugAdapter(mock_mqtt)

        assert adapter._seq == 0

        await adapter.publish_spc_state(
            characteristic_name="Diameter",
            value=7.45,
            ucl=7.6,
            lcl=7.0,
            in_control=True,
            active_rules=[],
        )

        assert adapter._seq == 1

        await adapter.publish_spc_state(
            characteristic_name="Diameter",
            value=7.46,
            ucl=7.6,
            lcl=7.0,
            in_control=True,
            active_rules=[],
        )

        assert adapter._seq == 2

    @pytest.mark.asyncio
    async def test_publish_spc_state_custom_timestamp(self) -> None:
        """Test publishing with custom timestamp."""
        mock_mqtt = AsyncMock()
        adapter = SparkplugAdapter(mock_mqtt)
        timestamp = datetime(2024, 2, 1, 12, 0, 0)

        await adapter.publish_spc_state(
            characteristic_name="Diameter",
            value=7.45,
            ucl=7.6,
            lcl=7.0,
            in_control=True,
            active_rules=[],
            timestamp=timestamp,
        )

        payload = mock_mqtt.publish.call_args[0][1]
        data = json.loads(payload.decode("utf-8"))
        expected_ms = int(timestamp.timestamp() * 1000)

        assert data["timestamp"] == expected_ms


class TestSparkplugAdapterBirthCertificate:
    """Tests for birth certificate publishing."""

    @pytest.mark.asyncio
    async def test_publish_birth_certificate_default(self) -> None:
        """Test publishing birth certificate with default metrics."""
        mock_mqtt = AsyncMock()
        adapter = SparkplugAdapter(mock_mqtt, "factory1", "node1")

        await adapter.publish_birth_certificate()

        # Verify publish was called
        mock_mqtt.publish.assert_called_once()
        call_args = mock_mqtt.publish.call_args

        # Check topic
        topic = call_args[0][0]
        assert topic == "spBv1.0/factory1/NBIRTH/node1"

        # Check payload
        payload = call_args[0][1]
        data = json.loads(payload.decode("utf-8"))

        assert data["seq"] == 0
        assert len(data["metrics"]) == 1
        assert data["metrics"][0]["name"] == "Node Control/Rebirth"

    @pytest.mark.asyncio
    async def test_publish_birth_certificate_custom_metrics(self) -> None:
        """Test publishing birth certificate with custom metrics."""
        mock_mqtt = AsyncMock()
        adapter = SparkplugAdapter(mock_mqtt)

        custom_metrics = [
            SparkplugMetric("Version", "1.0.0", data_type="String"),
            SparkplugMetric("Status", "Online", data_type="String"),
        ]

        await adapter.publish_birth_certificate(custom_metrics)

        payload = mock_mqtt.publish.call_args[0][1]
        data = json.loads(payload.decode("utf-8"))

        assert len(data["metrics"]) == 2
        assert data["metrics"][0]["name"] == "Version"
        assert data["metrics"][1]["name"] == "Status"

    @pytest.mark.asyncio
    async def test_publish_birth_certificate_resets_sequence(self) -> None:
        """Test birth certificate resets sequence counter."""
        mock_mqtt = AsyncMock()
        adapter = SparkplugAdapter(mock_mqtt)

        # Increment sequence
        adapter._seq = 42

        await adapter.publish_birth_certificate()

        # Sequence should be reset
        assert adapter._seq == 0

        # Payload should have seq=0
        payload = mock_mqtt.publish.call_args[0][1]
        data = json.loads(payload.decode("utf-8"))
        assert data["seq"] == 0


class TestSparkplugAdapterDeathCertificate:
    """Tests for death certificate publishing."""

    @pytest.mark.asyncio
    async def test_publish_death_certificate(self) -> None:
        """Test publishing death certificate."""
        mock_mqtt = AsyncMock()
        adapter = SparkplugAdapter(mock_mqtt, "factory1", "node1")

        await adapter.publish_death_certificate()

        # Verify publish was called
        mock_mqtt.publish.assert_called_once()
        call_args = mock_mqtt.publish.call_args

        # Check topic
        topic = call_args[0][0]
        assert topic == "spBv1.0/factory1/NDEATH/node1"

        # Check payload (death certificates have minimal payload)
        payload = call_args[0][1]
        data = json.loads(payload.decode("utf-8"))

        assert "timestamp" in data
        assert "metrics" in data


class TestSparkplugRoundTrip:
    """Integration tests for encode/decode round trips."""

    def test_encode_decode_round_trip(self) -> None:
        """Test encoding and decoding produces equivalent message."""
        encoder = SparkplugEncoder()
        decoder = SparkplugDecoder()

        # Create original message
        original_metrics = [
            SparkplugMetric("Temperature", 22.5, data_type="Float"),
            SparkplugMetric("Humidity", 65.0, data_type="Float"),
            SparkplugMetric("Status", "OK", data_type="String"),
        ]

        timestamp = datetime(2024, 2, 1, 12, 0, 0)

        # Encode
        topic = encoder.build_topic("spc", "NDATA", "node1", "device1")
        payload = encoder.encode_metrics(original_metrics, timestamp, seq=42)

        # Decode
        message = decoder.decode_message(topic, payload)

        # Verify
        assert message.message_type == "NDATA"
        assert message.group_id == "spc"
        assert message.edge_node_id == "node1"
        assert message.device_id == "device1"
        assert message.seq == 42
        assert len(message.metrics) == 3

        # Check metrics match
        for original, decoded in zip(original_metrics, message.metrics, strict=True):
            assert decoded.name == original.name
            assert decoded.value == original.value
            assert decoded.data_type == original.data_type

    def test_violation_metrics_round_trip(self) -> None:
        """Test encoding and decoding violation metrics."""
        encoder = SparkplugEncoder()
        decoder = SparkplugDecoder()

        # Encode violation
        topic = encoder.build_topic("spc", "NDATA", "openspc-server", "Diameter")
        payload = encoder.encode_violation_metrics(
            characteristic_name="Diameter",
            value=7.45,
            ucl=7.6,
            lcl=7.0,
            in_control=False,
            active_rules=["Rule 1: Outlier", "Rule 3: 6 points trending"],
            operator="J.Smith",
        )

        # Decode
        message = decoder.decode_message(topic, payload)

        # Verify
        assert message.device_id == "Diameter"
        assert len(message.metrics) == 6

        # Extract metrics by name
        metric_map = {m.name: m for m in message.metrics}

        assert metric_map["Value"].value == 7.45
        assert metric_map["Control/UCL"].value == 7.6
        assert metric_map["Control/LCL"].value == 7.0
        assert metric_map["State/InControl"].value is False
        assert (
            metric_map["State/ActiveRules"].value
            == "Rule 1: Outlier, Rule 3: 6 points trending"
        )
        assert metric_map["Context/Operator"].value == "J.Smith"
