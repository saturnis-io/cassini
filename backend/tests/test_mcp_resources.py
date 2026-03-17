"""Tests for MCP resources — list, read dispatch, and unknown URI handling."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

mcp = pytest.importorskip("mcp")

from cassini.cli.mcp_server import (
    _RESOURCES,
    _dispatch_resource,
)


# ── Resource definitions ─────────────────────────────────────────────


class TestResourceDefinitions:
    """Verify the _RESOURCES registry is well-formed."""

    def test_plants_resource_defined(self):
        assert "cassini://plants" in _RESOURCES

    def test_health_resource_defined(self):
        assert "cassini://health" in _RESOURCES

    def test_all_resources_have_required_keys(self):
        for uri, info in _RESOURCES.items():
            assert "name" in info, f"{uri} missing 'name'"
            assert "description" in info, f"{uri} missing 'description'"
            assert "mimeType" in info, f"{uri} missing 'mimeType'"

    def test_resource_uris_use_cassini_scheme(self):
        for uri in _RESOURCES:
            assert uri.startswith("cassini://"), f"{uri} should use cassini:// scheme"


# ── Resource dispatch ────────────────────────────────────────────────


class TestResourceDispatch:
    """Verify _dispatch_resource routes to correct client methods."""

    @pytest.fixture
    def mock_client(self):
        client = AsyncMock()
        client.plants_list.return_value = [
            {"id": 1, "name": "Plant A"},
            {"id": 2, "name": "Plant B"},
        ]
        client.health.return_value = {
            "status": "ok",
            "broker": "mqtt://localhost:1883",
            "queue_depth": 0,
        }
        return client

    @pytest.mark.asyncio
    async def test_plants_resource(self, mock_client):
        result = await _dispatch_resource(mock_client, "cassini://plants")
        assert result == [
            {"id": 1, "name": "Plant A"},
            {"id": 2, "name": "Plant B"},
        ]
        mock_client.plants_list.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_health_resource(self, mock_client):
        result = await _dispatch_resource(mock_client, "cassini://health")
        assert result["status"] == "ok"
        assert result["queue_depth"] == 0
        mock_client.health.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_unknown_uri_raises(self, mock_client):
        with pytest.raises(ValueError, match="Unknown resource"):
            await _dispatch_resource(mock_client, "cassini://nonexistent")

    @pytest.mark.asyncio
    async def test_unknown_scheme_raises(self, mock_client):
        with pytest.raises(ValueError, match="Unknown resource"):
            await _dispatch_resource(mock_client, "other://plants")

    @pytest.mark.asyncio
    async def test_dispatch_does_not_call_wrong_method(self, mock_client):
        """Reading plants should NOT call health, and vice versa."""
        await _dispatch_resource(mock_client, "cassini://plants")
        mock_client.health.assert_not_awaited()

        mock_client.reset_mock()
        await _dispatch_resource(mock_client, "cassini://health")
        mock_client.plants_list.assert_not_awaited()
