"""Builders for MQTT message payloads used in live-broker integration tests.

Covers:
- Sparkplug B JSON payloads (NBIRTH / DBIRTH / DDATA / NDATA)
- Plain JSON measurement payloads (bridge format)
- Intentionally malformed payloads for negative-path tests

All builders return ``bytes`` ready to hand to ``aiomqtt.Client.publish()``.

Topic helpers follow the Sparkplug B namespace:
    spBv1.0/{group_id}/{message_type}/{edge_node_id}[/{device_id}]

The Cassini backend accepts JSON as a fallback to protobuf, so these
builders use JSON encoding — no protobuf dependency required in the test
harness.
"""

from __future__ import annotations

import json
import time
from typing import Any


# ---------------------------------------------------------------------------
# Topic builder
# ---------------------------------------------------------------------------


def sparkplug_topic(
    group_id: str,
    message_type: str,
    edge_node_id: str,
    device_id: str | None = None,
) -> str:
    """Build a Sparkplug B topic string.

    Args:
        group_id: Sparkplug group identifier.
        message_type: One of NBIRTH / NDEATH / NDATA / NCMD /
                      DBIRTH / DDEATH / DDATA / DCMD.
        edge_node_id: Edge node identifier.
        device_id: Optional device identifier.

    Returns:
        Formatted Sparkplug topic string.
    """
    parts = ["spBv1.0", group_id, message_type, edge_node_id]
    if device_id:
        parts.append(device_id)
    return "/".join(parts)


# ---------------------------------------------------------------------------
# Payload builders — valid messages
# ---------------------------------------------------------------------------


def ndata_payload(
    metric_name: str,
    value: float,
    *,
    seq: int = 1,
    ts_ms: int | None = None,
) -> bytes:
    """JSON-encoded Sparkplug NDATA payload with a single Float metric.

    This is the "normal path" payload that the ingestion pipeline should
    process and persist as a Sample row.

    Args:
        metric_name: Metric name (must match the data-source config).
        value: Numeric measurement value.
        seq: Sparkplug sequence number (default 1).
        ts_ms: Timestamp in milliseconds since epoch.  Defaults to now.

    Returns:
        UTF-8 encoded JSON bytes.
    """
    if ts_ms is None:
        ts_ms = _now_ms()
    payload: dict[str, Any] = {
        "timestamp": ts_ms,
        "seq": seq,
        "metrics": [
            {
                "name": metric_name,
                "type": "Float",
                "value": value,
            }
        ],
    }
    return json.dumps(payload).encode("utf-8")


def nbirth_payload(
    metric_names: list[str] | None = None,
    *,
    ts_ms: int | None = None,
) -> bytes:
    """JSON-encoded Sparkplug NBIRTH payload.

    Birth certificates enumerate the node's available metrics.

    Args:
        metric_names: List of metric names to declare.  Defaults to
                      ``["Node Control/Rebirth"]``.
        ts_ms: Timestamp in milliseconds since epoch.

    Returns:
        UTF-8 encoded JSON bytes.
    """
    if ts_ms is None:
        ts_ms = _now_ms()
    if metric_names is None:
        metric_names = ["Node Control/Rebirth"]
    metrics = [
        {"name": name, "type": "Boolean", "value": False}
        for name in metric_names
    ]
    return json.dumps({"timestamp": ts_ms, "seq": 0, "metrics": metrics}).encode()


def dbirth_payload(
    device_metric_names: list[str],
    *,
    ts_ms: int | None = None,
    seq: int = 1,
) -> bytes:
    """JSON-encoded Sparkplug DBIRTH payload.

    Device birth certificates enumerate device metrics.  Must be sent
    before any DDATA for that device.

    Args:
        device_metric_names: Metric names the device will publish.
        ts_ms: Timestamp in milliseconds.
        seq: Sequence number.

    Returns:
        UTF-8 encoded JSON bytes.
    """
    if ts_ms is None:
        ts_ms = _now_ms()
    metrics = [
        {"name": name, "type": "Float", "value": 0.0}
        for name in device_metric_names
    ]
    return json.dumps({"timestamp": ts_ms, "seq": seq, "metrics": metrics}).encode()


def ddata_payload(
    metric_name: str,
    value: float,
    *,
    seq: int = 2,
    ts_ms: int | None = None,
) -> bytes:
    """JSON-encoded Sparkplug DDATA payload (device-level data).

    Args:
        metric_name: Metric name.
        value: Measurement value.
        seq: Sequence number (must be > DBIRTH seq).
        ts_ms: Timestamp in milliseconds.

    Returns:
        UTF-8 encoded JSON bytes.
    """
    if ts_ms is None:
        ts_ms = _now_ms()
    return json.dumps({
        "timestamp": ts_ms,
        "seq": seq,
        "metrics": [{"name": metric_name, "type": "Float", "value": value}],
    }).encode()


def bridge_json_payload(value: float, *, ts: float | None = None) -> bytes:
    """Simple JSON payload matching the cassini-bridge format.

    The bridge publishes ``{"value": <float>, "timestamp": <unix_float>}``
    to plain (non-Sparkplug) topics.

    Args:
        value: Measurement value.
        ts: Unix timestamp as float.  Defaults to now.

    Returns:
        UTF-8 encoded JSON bytes.
    """
    if ts is None:
        ts = time.time()
    return json.dumps({"value": value, "timestamp": ts}).encode("utf-8")


# ---------------------------------------------------------------------------
# Payload builders — malformed / negative-path messages
# ---------------------------------------------------------------------------


def malformed_not_json() -> bytes:
    """Bytes that are not valid JSON (binary garbage)."""
    return b"\xff\xfe\x00\x01<not-json>"


def malformed_json_missing_metrics() -> bytes:
    """Valid JSON but missing the required ``metrics`` field."""
    return json.dumps({"timestamp": _now_ms(), "seq": 0}).encode()


def malformed_json_wrong_schema() -> bytes:
    """Valid JSON with an unexpected top-level schema."""
    return json.dumps(
        {"sensor": "temperature", "reading": 42, "units": "Celsius"}
    ).encode()


def malformed_empty() -> bytes:
    """Zero-byte payload."""
    return b""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _now_ms() -> int:
    """Current time as milliseconds since epoch."""
    return int(time.time() * 1000)
