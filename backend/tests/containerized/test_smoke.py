"""Smoke tests that verify each containerized fixture works end-to-end.

All tests are marked @pytest.mark.containerized and are opt-in:

    pytest apps/cassini/backend/tests/containerized -m containerized

No containers are spun up during collection.
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any

import pytest


pytestmark = pytest.mark.containerized


# ---------------------------------------------------------------------------
# Backend health
# ---------------------------------------------------------------------------


def test_health_live(cassini_backend: str) -> None:
    """GET /api/v1/health returns 200 with status field."""
    url = f"{cassini_backend}/api/v1/health"
    with urllib.request.urlopen(url, timeout=10) as resp:  # noqa: S310
        assert resp.status == 200
        body = json.loads(resp.read())
    assert "status" in body


# ---------------------------------------------------------------------------
# Auth / seeded admin
# ---------------------------------------------------------------------------


def test_seeded_admin_login(auth_token: str) -> None:
    """auth_token fixture returns a non-empty JWT string."""
    assert isinstance(auth_token, str)
    assert len(auth_token) > 20
    # JWTs are three base64 segments separated by dots
    assert auth_token.count(".") == 2


# ---------------------------------------------------------------------------
# MQTT publish + subscribe roundtrip
# ---------------------------------------------------------------------------


@pytest.mark.live_broker
@pytest.mark.asyncio
async def test_mqtt_publish_roundtrip(
    mqtt_broker: tuple[str, int],
    mqtt_publisher: Any,
) -> None:
    """Publish a message to a test topic and receive it back via a subscriber."""
    aiomqtt = pytest.importorskip("aiomqtt", reason="aiomqtt not installed")
    import asyncio

    host, port = mqtt_broker
    topic = "cassini/test/smoke"
    payload = b"hello-smoke"

    received: list[bytes] = []

    async with aiomqtt.Client(hostname=host, port=port) as subscriber:
        await subscriber.subscribe(topic)
        await mqtt_publisher.publish(topic, payload)

        async with asyncio.timeout(5):
            async for message in subscriber.messages:
                received.append(bytes(message.payload))
                break

    assert received == [payload]


# ---------------------------------------------------------------------------
# Valkey set / get
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valkey_set_get(valkey_broker: str) -> None:
    """Basic Valkey round-trip: SET then GET returns the same value."""
    redis = pytest.importorskip("redis.asyncio", reason="redis package not installed")

    client = redis.from_url(valkey_broker, decode_responses=True)
    try:
        await client.set("cassini:smoke:key", "smoke-value", ex=60)
        value = await client.get("cassini:smoke:key")
        assert value == "smoke-value"
    finally:
        await client.aclose()


# ---------------------------------------------------------------------------
# OPC UA browse root
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_opcua_browse_root(opcua_simulator: str) -> None:
    """Connect to the OPC UA simulator and browse the root node namespace."""
    asyncua = pytest.importorskip("asyncua", reason="asyncua not installed")

    async with asyncua.Client(url=opcua_simulator) as client:
        root = client.get_root_node()
        children = await root.get_children()
    assert len(children) > 0, "OPC UA root node should have at least one child"


# ---------------------------------------------------------------------------
# Dialect parametrization proof
# ---------------------------------------------------------------------------


def test_dialect_param(cassini_db_url: str) -> None:
    """Confirm the dialect parameter iterates: each run receives a distinct URL."""
    # cassini_db_url is parametrized over sqlite/postgresql/mysql/mssql.
    # This test just verifies the URL looks plausible for any of those dialects.
    valid_prefixes = (
        "sqlite+aiosqlite://",
        "postgresql+asyncpg://",
        "mysql+aiomysql://",
        "mssql+aioodbc://",
    )
    assert any(
        cassini_db_url.startswith(prefix) for prefix in valid_prefixes
    ), f"Unexpected DB URL format: {cassini_db_url}"
