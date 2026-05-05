"""Tests for cluster status endpoint."""
from __future__ import annotations

import os
import socket
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from fastapi import FastAPI

from cassini.api.v1.cluster import router as cluster_router
from cassini.core.broker.interfaces import QueueStats
from cassini.db.models.user import User


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


def _fake_admin():
    """Return a mock admin user for dependency override."""
    user = MagicMock(spec=User)
    user.id = 1
    user.username = "admin"
    return user


def _make_app(
    *,
    broker_backend: str = "local",
    broker_url: str = "",
    queue_pending: int = 0,
    roles: str = "all",
) -> FastAPI:
    """Build a minimal FastAPI app with the cluster router wired up."""
    app = FastAPI()

    task_queue = _FakeTaskQueue(pending=queue_pending)
    app.state.broker = _FakeBroker(backend=broker_backend, task_queue=task_queue)

    app.include_router(cluster_router)
    return app


@pytest.mark.asyncio
async def test_cluster_status_standalone_mode():
    """Cluster status returns mode 'standalone' when no broker_url is set."""
    app = _make_app()

    with patch("cassini.api.v1.cluster._get_admin_or_api_key", new_callable=AsyncMock, return_value=_fake_admin()), \
         patch("cassini.api.v1.cluster.get_settings") as mock_settings:
        mock_settings.return_value.broker_url = ""
        mock_settings.return_value.role_list = ["all"]
        mock_settings.return_value.app_version = "0.0.9"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/cluster/status")

    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "standalone"


@pytest.mark.asyncio
async def test_cluster_status_cluster_mode():
    """Cluster status returns mode 'cluster' when broker_url is set."""
    app = _make_app(broker_backend="valkey", broker_url="valkey://localhost:6379")

    with patch("cassini.api.v1.cluster._get_admin_or_api_key", new_callable=AsyncMock, return_value=_fake_admin()), \
         patch("cassini.api.v1.cluster.get_settings") as mock_settings:
        mock_settings.return_value.broker_url = "valkey://localhost:6379"
        mock_settings.return_value.role_list = ["api", "spc"]
        mock_settings.return_value.app_version = "0.0.9"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/cluster/status")

    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "cluster"


@pytest.mark.asyncio
async def test_cluster_status_returns_broker_backend():
    """Cluster status returns the correct broker backend string."""
    app = _make_app(broker_backend="valkey")

    with patch("cassini.api.v1.cluster._get_admin_or_api_key", new_callable=AsyncMock, return_value=_fake_admin()), \
         patch("cassini.api.v1.cluster.get_settings") as mock_settings:
        mock_settings.return_value.broker_url = "valkey://localhost:6379"
        mock_settings.return_value.role_list = ["all"]
        mock_settings.return_value.app_version = "0.0.9"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/cluster/status")

    assert resp.status_code == 200
    data = resp.json()
    assert data["broker"] == "valkey"


@pytest.mark.asyncio
async def test_cluster_status_includes_node_info():
    """Cluster status includes this node's hostname, pid, roles, and version."""
    app = _make_app()

    with patch("cassini.api.v1.cluster._get_admin_or_api_key", new_callable=AsyncMock, return_value=_fake_admin()), \
         patch("cassini.api.v1.cluster.get_settings") as mock_settings:
        mock_settings.return_value.broker_url = ""
        mock_settings.return_value.role_list = ["api", "spc"]
        mock_settings.return_value.app_version = "0.0.9"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/cluster/status")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["nodes"]) == 1

    node = data["nodes"][0]
    assert node["hostname"] == socket.gethostname()
    assert node["pid"] == os.getpid()
    assert node["roles"] == ["api", "spc"]
    assert node["status"] == "healthy"
    assert node["version"] == "0.0.9"


@pytest.mark.asyncio
async def test_cluster_status_returns_queue_depth():
    """Cluster status returns queue_depth from the broker task queue."""
    app = _make_app(queue_pending=42)

    with patch("cassini.api.v1.cluster._get_admin_or_api_key", new_callable=AsyncMock, return_value=_fake_admin()), \
         patch("cassini.api.v1.cluster.get_settings") as mock_settings:
        mock_settings.return_value.broker_url = ""
        mock_settings.return_value.role_list = ["all"]
        mock_settings.return_value.app_version = "0.0.9"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/cluster/status")

    assert resp.status_code == 200
    data = resp.json()
    assert data["queue_depth"] == 42


@pytest.mark.asyncio
async def test_cluster_status_queue_depth_zero_when_no_broker():
    """When broker is not on app.state, queue_depth defaults to 0."""
    app = _make_app()
    del app.state.broker

    with patch("cassini.api.v1.cluster._get_admin_or_api_key", new_callable=AsyncMock, return_value=_fake_admin()), \
         patch("cassini.api.v1.cluster.get_settings") as mock_settings:
        mock_settings.return_value.broker_url = ""
        mock_settings.return_value.role_list = ["all"]
        mock_settings.return_value.app_version = "0.0.9"

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/cluster/status")

    assert resp.status_code == 200
    data = resp.json()
    assert data["queue_depth"] == 0
    assert data["broker"] == "local"


@pytest.mark.asyncio
async def test_cluster_status_requires_admin():
    """Cluster status endpoint returns 401/403 without admin credentials."""
    app = FastAPI()

    # Do NOT override the admin dependency — let it require real auth
    # But we do need to mock the DB session dependency used by get_current_user
    from cassini.db.database import get_session

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=MagicMock())

    async def _get_session():
        yield mock_session

    app.dependency_overrides[get_session] = _get_session
    app.include_router(cluster_router)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        # No auth header — should fail
        resp = await client.get("/api/v1/cluster/status")

    # Should be 401 (no token) or 403 (not admin)
    assert resp.status_code in (401, 403)
