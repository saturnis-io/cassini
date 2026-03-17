"""Tests for enhanced health endpoint — broker info, roles, drain mode."""
from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.v1.health import router as health_router
from cassini.core.broker.interfaces import QueueStats


# ---------------------------------------------------------------------------
# Lightweight app fixture — avoids pulling in the full Cassini lifespan
# ---------------------------------------------------------------------------

@dataclass
class _FakeBroker:
    backend: str = "local"
    task_queue: object = None


class _FakeTaskQueue:
    def __init__(self, pending: int = 0):
        self._pending = pending

    async def stats(self) -> QueueStats:
        return QueueStats(
            pending=self._pending,
            enqueued_total=self._pending,
            dequeued_total=0,
            errors_total=0,
            healthy=True,
        )


def _make_app(
    *,
    broker_backend: str = "local",
    queue_pending: int = 0,
    draining: bool = False,
    roles: str = "all",
) -> FastAPI:
    """Build a minimal FastAPI app with the health router wired up."""

    app = FastAPI()

    # Mock session dependency — returns an object whose execute() succeeds
    mock_session = AsyncMock(spec=AsyncSession)
    mock_session.execute = AsyncMock(return_value=None)

    async def _get_session():
        yield mock_session

    from cassini.db.database import get_session

    app.dependency_overrides[get_session] = _get_session

    task_queue = _FakeTaskQueue(pending=queue_pending)
    app.state.broker = _FakeBroker(backend=broker_backend, task_queue=task_queue)
    app.state.draining = draining

    app.include_router(health_router, prefix="/api/v1")
    return app, roles


@pytest.mark.asyncio
async def test_health_returns_broker_info_for_admin():
    """Admin health response includes broker backend."""
    app, roles = _make_app(broker_backend="valkey", queue_pending=5, roles="api,spc")

    with patch("cassini.api.v1.health._try_get_admin", return_value=True), \
         patch("cassini.api.v1.health.get_settings") as mock_settings:
        mock_settings.return_value.app_version = "0.0.9"
        mock_settings.return_value.role_list = ["api", "spc"]
        mock_settings.return_value.roles = "api,spc"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/health")

    assert resp.status_code == 200
    data = resp.json()
    assert data["broker"] == "valkey"
    assert data["roles"] == ["api", "spc"]
    assert data["queue_depth"] == 5
    assert "timestamp" in data


@pytest.mark.asyncio
async def test_health_returns_roles_for_admin():
    """Admin health response includes role list from settings."""
    app, roles = _make_app(roles="spc,ingestion")

    with patch("cassini.api.v1.health._try_get_admin", return_value=True), \
         patch("cassini.api.v1.health.get_settings") as mock_settings:
        mock_settings.return_value.app_version = "0.0.9"
        mock_settings.return_value.role_list = ["spc", "ingestion"]
        mock_settings.return_value.roles = "spc,ingestion"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/health")

    assert resp.status_code == 200
    data = resp.json()
    assert data["roles"] == ["spc", "ingestion"]


@pytest.mark.asyncio
async def test_health_anon_does_not_include_broker():
    """Anonymous callers get minimal response without broker/roles/queue_depth."""
    app, _ = _make_app(broker_backend="valkey", queue_pending=3)

    with patch("cassini.api.v1.health._try_get_admin", return_value=False):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/health")

    assert resp.status_code == 200
    data = resp.json()
    assert "broker" not in data
    assert "roles" not in data
    assert "queue_depth" not in data
    assert data["status"] in ("healthy", "degraded")


@pytest.mark.asyncio
async def test_health_ready_returns_200_normally():
    """/health/ready returns 200 when not draining."""
    app, _ = _make_app(draining=False)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/api/v1/health/ready")

    assert resp.status_code == 200
    assert resp.json() == {"status": "ready"}


@pytest.mark.asyncio
async def test_health_ready_returns_503_when_draining():
    """/health/ready returns 503 when app is draining."""
    app, _ = _make_app(draining=True)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/api/v1/health/ready")

    assert resp.status_code == 503
    assert resp.json() == {"status": "draining"}


@pytest.mark.asyncio
async def test_health_queue_depth_zero_when_no_broker():
    """When broker is not on app.state, queue_depth defaults to 0."""
    app, _ = _make_app()

    # Remove broker from state to simulate missing broker
    del app.state.broker

    with patch("cassini.api.v1.health._try_get_admin", return_value=True), \
         patch("cassini.api.v1.health.get_settings") as mock_settings:
        mock_settings.return_value.app_version = "0.0.9"
        mock_settings.return_value.role_list = ["all"]
        mock_settings.return_value.roles = "all"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/health")

    assert resp.status_code == 200
    data = resp.json()
    assert data["broker"] == "local"
    assert data["queue_depth"] == 0
