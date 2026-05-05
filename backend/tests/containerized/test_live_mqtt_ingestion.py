"""Live MQTT ingestion integration test.

Publishes a Sparkplug-B-flavored NDATA message to the MQTT broker and verifies
that a Sample row is persisted in the database through the Cassini backend.

The test flow:
1. Seed a plant, hierarchy, characteristic, and MQTT data source via the REST API
   (using the auth_token and cassini_backend fixtures).
2. Publish an NDATA message to the broker on the topic that matches the seeded
   data source.
3. Poll the samples endpoint until the measurement appears (max 15 s).

Requires: cassini-backend container connected to the MQTT broker.

Run with:
    pytest -m "containerized and live_broker"
"""

from __future__ import annotations

import asyncio
import json
import time
import urllib.request
from typing import Any

import pytest


pytestmark = [pytest.mark.containerized, pytest.mark.live_broker]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_GROUP_ID = "cassini-test"
_NODE_ID = "smoke-node"
_DEVICE_ID = "smoke-device"
_METRIC_NAME = "Thickness"
_METRIC_VALUE = 12.34


def _api_post(
    base_url: str, path: str, body: dict[str, Any], token: str
) -> dict[str, Any]:
    """POST to the Cassini REST API and return the parsed JSON response body."""
    url = f"{base_url}/api/v1{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(  # noqa: S310
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
        return json.loads(resp.read())


def _api_get(
    base_url: str, path: str, token: str
) -> dict[str, Any] | list[Any]:
    """GET from the Cassini REST API and return the parsed JSON response."""
    url = f"{base_url}/api/v1{path}"
    req = urllib.request.Request(  # noqa: S310
        url,
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
        return json.loads(resp.read())


def _sparkplug_ndata_json(metric_name: str, value: float) -> bytes:
    """Build a minimal JSON-format Sparkplug NDATA payload.

    Cassini's SparkplugDecoder accepts JSON payloads as a fallback to protobuf,
    which lets this integration test avoid a protobuf dependency.
    """
    payload = {
        "timestamp": int(time.time() * 1000),
        "metrics": [
            {
                "name": metric_name,
                "datatype": "Double",
                "value": value,
                "timestamp": int(time.time() * 1000),
            }
        ],
        "seq": 1,
    }
    return json.dumps(payload).encode()


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mqtt_publish_creates_sample(
    cassini_backend: str,
    auth_token: str,
    mqtt_broker: tuple[str, int],
    mqtt_publisher: Any,
) -> None:
    """Publishing an NDATA message persists a Sample via MQTT ingestion.

    This test seeds the minimum data model required for Cassini to ingest
    the MQTT message, publishes it, and polls until the sample appears.
    """
    aiomqtt = pytest.importorskip("aiomqtt", reason="aiomqtt not installed")

    mqtt_host, mqtt_port = mqtt_broker

    # ------------------------------------------------------------------
    # 1. Seed plant
    # ------------------------------------------------------------------
    plant = _api_post(
        cassini_backend,
        "/plants",
        {"name": "mqtt-smoke-plant", "code": "MQSMK", "timezone": "UTC"},
        auth_token,
    )
    plant_id: int = plant["id"]

    # ------------------------------------------------------------------
    # 2. Register the MQTT broker inside Cassini so it knows where to connect
    # ------------------------------------------------------------------
    broker_record = _api_post(
        cassini_backend,
        "/brokers",
        {
            "plant_id": plant_id,
            "name": "smoke-mosquitto",
            "host": mqtt_host,
            "port": mqtt_port,
            "use_tls": False,
        },
        auth_token,
    )
    broker_id: int = broker_record["id"]

    # ------------------------------------------------------------------
    # 3. Create hierarchy: line -> station
    # ------------------------------------------------------------------
    line = _api_post(
        cassini_backend,
        "/hierarchy",
        {"plant_id": plant_id, "name": "Line-A", "level": "line"},
        auth_token,
    )
    station = _api_post(
        cassini_backend,
        "/hierarchy",
        {
            "plant_id": plant_id,
            "name": "Station-1",
            "level": "station",
            "parent_id": line["id"],
        },
        auth_token,
    )

    # ------------------------------------------------------------------
    # 4. Create characteristic with Sparkplug MQTT data source
    # ------------------------------------------------------------------
    sparkplug_topic = f"spBv1.0/{_GROUP_ID}/NDATA/{_NODE_ID}/{_DEVICE_ID}"
    char = _api_post(
        cassini_backend,
        "/characteristics",
        {
            "plant_id": plant_id,
            "hierarchy_id": station["id"],
            "name": _METRIC_NAME,
            "unit": "mm",
            "nominal": 12.5,
            "usl": 13.0,
            "lsl": 12.0,
            "data_source": {
                "type": "mqtt",
                "broker_id": broker_id,
                "topic": sparkplug_topic,
                "metric_name": _METRIC_NAME,
            },
        },
        auth_token,
    )
    char_id: int = char["id"]

    # ------------------------------------------------------------------
    # 5. Publish the NDATA message
    # ------------------------------------------------------------------
    topic = sparkplug_topic
    payload = _sparkplug_ndata_json(_METRIC_NAME, _METRIC_VALUE)
    await mqtt_publisher.publish(topic, payload, qos=1)

    # ------------------------------------------------------------------
    # 6. Poll until a sample appears (max 15 s)
    # ------------------------------------------------------------------
    deadline = time.monotonic() + 15
    samples: list[Any] = []
    while time.monotonic() < deadline:
        await asyncio.sleep(0.5)
        try:
            result = _api_get(
                cassini_backend,
                f"/characteristics/{char_id}/samples?limit=1",
                auth_token,
            )
            if isinstance(result, list):
                samples = result
            elif isinstance(result, dict):
                samples = result.get("items", result.get("samples", []))
        except Exception:
            continue
        if samples:
            break

    assert samples, (
        f"No Sample row appeared within 15 s for char_id={char_id} "
        f"after publishing to topic={topic}"
    )
    sample = samples[0]
    assert abs(sample["value"] - _METRIC_VALUE) < 1e-6, (
        f"Expected value {_METRIC_VALUE}, got {sample['value']}"
    )
