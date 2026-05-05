"""Integration tests for ERP webhook replay protection (A6-H2).

Verifies the timestamp-bound HMAC, +/- 300s acceptance window, in-memory
nonce cache, and the CASSINI_ERP_WEBHOOK_LEGACY_GRACE migration flag.
"""
from __future__ import annotations

import hashlib
import hmac as hmac_module
import json
import time
from typing import Any

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from cassini.api.deps import get_db_session
from cassini.api.v1.erp_connectors import router as erp_router
from cassini.core.erp.webhook_receiver import (
    WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
    reset_nonce_cache,
)
from cassini.db.dialects import encrypt_password, get_encryption_key
from cassini.db.models.erp_connector import ERPConnector
from cassini.db.models.plant import Plant


HMAC_SECRET = "test-webhook-secret-do-not-use-in-prod"


def _sign_with_timestamp(body: bytes, timestamp: int, secret: str) -> str:
    """Compute the X-Hub-Signature-256 value the route now expects."""
    signed = f"{timestamp}.".encode("utf-8") + body
    digest = hmac_module.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _sign_legacy(body: bytes, secret: str) -> str:
    """Compute the body-only signature accepted under the legacy grace flag."""
    digest = hmac_module.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


@pytest_asyncio.fixture
async def app(async_session):
    """Spin up a minimal FastAPI app with just the ERP router for testing."""
    test_app = FastAPI()
    test_app.include_router(erp_router)

    async def override_session():
        yield async_session

    test_app.dependency_overrides[get_db_session] = override_session
    return test_app


@pytest_asyncio.fixture
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest_asyncio.fixture
async def webhook_connector(async_session) -> ERPConnector:
    """Create an active generic_webhook connector with an HMAC secret."""
    plant = Plant(name="Replay Test Plant", code="RTP01")
    async_session.add(plant)
    await async_session.commit()
    await async_session.refresh(plant)

    enc_key = get_encryption_key()
    auth_blob = json.dumps({"hmac_secret": HMAC_SECRET})
    encrypted = encrypt_password(auth_blob, enc_key)

    connector = ERPConnector(
        plant_id=plant.id,
        name="Replay Test Webhook",
        connector_type="generic_webhook",
        base_url="https://example.test/webhook",
        auth_type="hmac",
        auth_config=encrypted,
        headers="{}",
        is_active=True,
        status="connected",
    )
    async_session.add(connector)
    await async_session.commit()
    await async_session.refresh(connector)
    return connector


@pytest.fixture(autouse=True)
def _clear_nonce_cache():
    """Wipe the module-level nonce cache between tests."""
    reset_nonce_cache()
    yield
    reset_nonce_cache()


@pytest.mark.asyncio
async def test_webhook_with_valid_timestamp_accepted(
    client: AsyncClient, webhook_connector: ERPConnector
):
    """A request with a fresh timestamp + correct timestamped HMAC is accepted."""
    body = json.dumps({"test_value": 42}).encode("utf-8")
    ts = int(time.time())
    signature = _sign_with_timestamp(body, ts, HMAC_SECRET)

    resp = await client.post(
        f"/api/v1/erp/connectors/{webhook_connector.id}/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": signature,
            "X-Webhook-Timestamp": str(ts),
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "accepted"


@pytest.mark.asyncio
async def test_webhook_with_stale_timestamp_rejected(
    client: AsyncClient, webhook_connector: ERPConnector
):
    """A timestamp older than the tolerance window is rejected with 401."""
    body = json.dumps({"test_value": 1}).encode("utf-8")
    stale_ts = int(time.time()) - (WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS + 60)
    signature = _sign_with_timestamp(body, stale_ts, HMAC_SECRET)

    resp = await client.post(
        f"/api/v1/erp/connectors/{webhook_connector.id}/webhook",
        content=body,
        headers={
            "X-Hub-Signature-256": signature,
            "X-Webhook-Timestamp": str(stale_ts),
        },
    )
    assert resp.status_code == 401
    assert "window" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_webhook_with_future_timestamp_rejected(
    client: AsyncClient, webhook_connector: ERPConnector
):
    """A timestamp far in the future (clock skew attack) is rejected."""
    body = json.dumps({"test_value": 2}).encode("utf-8")
    future_ts = int(time.time()) + (WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS + 60)
    signature = _sign_with_timestamp(body, future_ts, HMAC_SECRET)

    resp = await client.post(
        f"/api/v1/erp/connectors/{webhook_connector.id}/webhook",
        content=body,
        headers={
            "X-Hub-Signature-256": signature,
            "X-Webhook-Timestamp": str(future_ts),
        },
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_webhook_replay_with_same_nonce_rejected(
    client: AsyncClient, webhook_connector: ERPConnector
):
    """Sending the same (timestamp, signature) twice within the window blocks replay."""
    body = json.dumps({"test_value": 7}).encode("utf-8")
    ts = int(time.time())
    signature = _sign_with_timestamp(body, ts, HMAC_SECRET)
    headers = {
        "X-Hub-Signature-256": signature,
        "X-Webhook-Timestamp": str(ts),
    }

    first = await client.post(
        f"/api/v1/erp/connectors/{webhook_connector.id}/webhook",
        content=body,
        headers=headers,
    )
    assert first.status_code == 200, first.text

    # Replay the exact same request bytes — server must reject as duplicate.
    second = await client.post(
        f"/api/v1/erp/connectors/{webhook_connector.id}/webhook",
        content=body,
        headers=headers,
    )
    assert second.status_code == 409
    assert "replay" in second.json()["detail"].lower()


@pytest.mark.asyncio
async def test_legacy_grace_accepts_unsigned_timestamp_with_warning(
    client: AsyncClient, webhook_connector: ERPConnector, caplog
):
    """With legacy grace ON and no timestamp header, body-only HMAC is accepted."""
    # Default config has erp_webhook_legacy_grace=True. Confirm here.
    from cassini.core.config import get_settings

    assert get_settings().erp_webhook_legacy_grace is True

    body = json.dumps({"legacy_value": 1}).encode("utf-8")
    legacy_signature = _sign_legacy(body, HMAC_SECRET)

    resp = await client.post(
        f"/api/v1/erp/connectors/{webhook_connector.id}/webhook",
        content=body,
        headers={"X-Hub-Signature-256": legacy_signature},
        # No X-Webhook-Timestamp header.
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_legacy_grace_disabled_rejects_unsigned_timestamp(
    client: AsyncClient,
    webhook_connector: ERPConnector,
    monkeypatch,
):
    """With grace disabled, missing X-Webhook-Timestamp is a 400 error."""
    from cassini.core import config as config_module

    # Force grace OFF on the cached settings instance for this test
    settings_obj = config_module.get_settings()
    monkeypatch.setattr(settings_obj, "erp_webhook_legacy_grace", False)

    body = json.dumps({"legacy_value": 1}).encode("utf-8")
    legacy_signature = _sign_legacy(body, HMAC_SECRET)

    resp = await client.post(
        f"/api/v1/erp/connectors/{webhook_connector.id}/webhook",
        content=body,
        headers={"X-Hub-Signature-256": legacy_signature},
    )
    assert resp.status_code == 400
    assert "X-Webhook-Timestamp" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_invalid_timestamped_signature_rejected(
    client: AsyncClient, webhook_connector: ERPConnector
):
    """Tampered body with a stale signature is rejected."""
    body = json.dumps({"test_value": 99}).encode("utf-8")
    ts = int(time.time())
    # Sign for a different body
    other_signature = _sign_with_timestamp(b'{"different": "body"}', ts, HMAC_SECRET)

    resp = await client.post(
        f"/api/v1/erp/connectors/{webhook_connector.id}/webhook",
        content=body,
        headers={
            "X-Hub-Signature-256": other_signature,
            "X-Webhook-Timestamp": str(ts),
        },
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_legacy_signature_with_timestamp_header_rejected(
    client: AsyncClient, webhook_connector: ERPConnector
):
    """Sending a body-only signature alongside a timestamp header is rejected.

    Senders that move to the timestamped header MUST also recompute the
    signature over the timestamped payload — the modern path does not fall
    back to body-only validation.
    """
    body = json.dumps({"test_value": 5}).encode("utf-8")
    ts = int(time.time())
    legacy_signature = _sign_legacy(body, HMAC_SECRET)

    resp = await client.post(
        f"/api/v1/erp/connectors/{webhook_connector.id}/webhook",
        content=body,
        headers={
            "X-Hub-Signature-256": legacy_signature,
            "X-Webhook-Timestamp": str(ts),
        },
    )
    assert resp.status_code == 401
