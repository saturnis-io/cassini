"""Tests for MCP server — tool registration, dispatch, and security."""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest

# The MCP SDK is available in CI, but tests should degrade gracefully.
mcp = pytest.importorskip("mcp")

from cassini.cli.mcp_server import (
    _READ_TOOLS,
    _WRITE_TOOLS,
    _build_tool_list,
    _dispatch_tool,
    _require_mcp,
    run_mcp_server,
)


# ── Tool registration ─────────────────────────────────────────────────


class TestToolRegistration:
    """Verify that tool definitions produce valid MCP Tool objects."""

    def test_read_tools_build(self):
        tools = _build_tool_list(_READ_TOOLS)
        names = {t.name for t in tools}
        assert "cassini_plants_list" in names
        assert "cassini_health" in names
        assert "cassini_characteristics_list" in names
        assert "cassini_capability_get" in names
        assert "cassini_violations_list" in names
        assert "cassini_samples_query" in names
        assert "cassini_audit_search" in names
        assert "cassini_license_status" in names
        assert len(tools) == len(_READ_TOOLS)

    def test_write_tools_build(self):
        tools = _build_tool_list(_WRITE_TOOLS)
        names = {t.name for t in tools}
        assert "cassini_samples_submit" in names
        assert "cassini_plants_create" in names
        assert "cassini_users_create" in names
        assert "cassini_characteristics_create" in names
        assert len(tools) == len(_WRITE_TOOLS)

    def test_read_only_excludes_write_tools(self):
        """In read-only mode, only read tools are registered."""
        read_tools = _build_tool_list(_READ_TOOLS)
        read_names = {t.name for t in read_tools}
        for write_name in _WRITE_TOOLS:
            assert write_name not in read_names

    def test_allow_writes_includes_all_tools(self):
        """With --allow-writes, both read and write tools are registered."""
        all_defs = dict(_READ_TOOLS)
        all_defs.update(_WRITE_TOOLS)
        all_tools = _build_tool_list(all_defs)
        all_names = {t.name for t in all_tools}
        for name in _READ_TOOLS:
            assert name in all_names
        for name in _WRITE_TOOLS:
            assert name in all_names

    def test_tool_schema_has_required_fields(self):
        """Tools with required params include 'required' in inputSchema."""
        tools = _build_tool_list(_READ_TOOLS)
        cap_tool = next(t for t in tools if t.name == "cassini_capability_get")
        assert "required" in cap_tool.inputSchema
        assert "char_id" in cap_tool.inputSchema["required"]

    def test_tool_schema_optional_has_no_required(self):
        """Tools without required params omit 'required' from inputSchema."""
        tools = _build_tool_list(_READ_TOOLS)
        plants_tool = next(t for t in tools if t.name == "cassini_plants_list")
        assert "required" not in plants_tool.inputSchema


# ── Dispatch ──────────────────────────────────────────────────────────


class TestDispatch:
    """Verify _dispatch_tool routes to correct client methods."""

    @pytest.fixture
    def mock_client(self):
        client = AsyncMock()
        client.plants_list.return_value = [{"id": 1, "name": "Plant A"}]
        client.health.return_value = {"status": "ok"}
        client.characteristics_list.return_value = [{"id": 10}]
        client.capability_get.return_value = {"cp": 1.33}
        client.violations_list.return_value = {"items": []}
        client.samples_list.return_value = {"items": [], "total": 0}
        client.audit_search.return_value = []
        client.license_status.return_value = {"tier": "open"}
        client.samples_submit.return_value = {"id": 1}
        client.plants_create.return_value = {"id": 3, "name": "New"}
        client.users_create.return_value = {"id": 5, "username": "agent"}
        return client

    @pytest.mark.asyncio
    async def test_plants_list(self, mock_client):
        result = await _dispatch_tool(mock_client, "cassini_plants_list", {}, False)
        assert result == [{"id": 1, "name": "Plant A"}]
        mock_client.plants_list.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_health(self, mock_client):
        result = await _dispatch_tool(mock_client, "cassini_health", {}, False)
        assert result["status"] == "ok"

    @pytest.mark.asyncio
    async def test_characteristics_list_with_plant_id(self, mock_client):
        await _dispatch_tool(
            mock_client, "cassini_characteristics_list", {"plant_id": 1}, False
        )
        mock_client.characteristics_list.assert_awaited_once_with(plant_id=1)

    @pytest.mark.asyncio
    async def test_capability_get(self, mock_client):
        result = await _dispatch_tool(
            mock_client, "cassini_capability_get", {"char_id": 10}, False
        )
        mock_client.capability_get.assert_awaited_once_with(char_id=10)
        assert result["cp"] == 1.33

    @pytest.mark.asyncio
    async def test_violations_list(self, mock_client):
        await _dispatch_tool(
            mock_client,
            "cassini_violations_list",
            {"char_id": 10, "active": True},
            False,
        )
        mock_client.violations_list.assert_awaited_once_with(
            characteristic_id=10, active=True
        )

    @pytest.mark.asyncio
    async def test_samples_query(self, mock_client):
        await _dispatch_tool(
            mock_client,
            "cassini_samples_query",
            {"characteristic_id": 10, "limit": 50},
            False,
        )
        mock_client.samples_list.assert_awaited_once_with(
            characteristic_id=10, limit=50
        )

    @pytest.mark.asyncio
    async def test_audit_search(self, mock_client):
        await _dispatch_tool(
            mock_client,
            "cassini_audit_search",
            {"resource_type": "sample", "action": "create"},
            False,
        )
        mock_client.audit_search.assert_awaited_once_with(
            resource_type="sample", action="create"
        )

    @pytest.mark.asyncio
    async def test_license_status(self, mock_client):
        result = await _dispatch_tool(
            mock_client, "cassini_license_status", {}, False
        )
        assert result["tier"] == "open"

    @pytest.mark.asyncio
    async def test_samples_submit_allowed(self, mock_client):
        result = await _dispatch_tool(
            mock_client,
            "cassini_samples_submit",
            {"char_id": 10, "values": [1.0, 2.0]},
            allow_writes=True,
        )
        mock_client.samples_submit.assert_awaited_once_with(
            characteristic_id=10, measurements=[1.0, 2.0]
        )
        assert result["id"] == 1

    @pytest.mark.asyncio
    async def test_plants_create_allowed(self, mock_client):
        result = await _dispatch_tool(
            mock_client,
            "cassini_plants_create",
            {"name": "New Plant", "timezone": "US/Eastern"},
            allow_writes=True,
        )
        mock_client.plants_create.assert_awaited_once_with(
            name="New Plant", timezone="US/Eastern"
        )

    @pytest.mark.asyncio
    async def test_users_create_allowed(self, mock_client):
        await _dispatch_tool(
            mock_client,
            "cassini_users_create",
            {"username": "agent", "password": "secret123"},
            allow_writes=True,
        )
        mock_client.users_create.assert_awaited_once_with(
            username="agent", password="secret123"
        )

    @pytest.mark.asyncio
    async def test_write_tool_blocked_without_flag(self, mock_client):
        """Write tools raise PermissionError when allow_writes=False."""
        with pytest.raises(PermissionError, match="requires --allow-writes"):
            await _dispatch_tool(
                mock_client,
                "cassini_samples_submit",
                {"char_id": 10, "values": [1.0]},
                allow_writes=False,
            )

    @pytest.mark.asyncio
    async def test_unknown_tool_raises(self, mock_client):
        with pytest.raises(ValueError, match="Unknown tool"):
            await _dispatch_tool(
                mock_client, "cassini_nonexistent", {}, False
            )

    @pytest.mark.asyncio
    async def test_characteristics_create_not_implemented(self, mock_client):
        with pytest.raises(NotImplementedError, match="placeholder"):
            await _dispatch_tool(
                mock_client,
                "cassini_characteristics_create",
                {"plant_id": 1, "name": "Test"},
                allow_writes=True,
            )


# ── Security ──────────────────────────────────────────────────────────


class TestSecurity:
    """Verify env var zeroing and missing-SDK error."""

    def test_env_var_zeroed_after_read(self):
        """CASSINI_API_KEY is removed from environment after run_mcp_server reads it."""
        os.environ["CASSINI_API_KEY"] = "test-secret-key"
        # run_mcp_server will try to start the server, so we mock the heavy parts
        with patch("cassini.cli.mcp_server.Server") as MockServer, \
             patch("cassini.cli.mcp_server.stdio_server") as mock_stdio:
            # Make the server.run() finish immediately
            instance = MockServer.return_value
            instance.list_tools.return_value = lambda f: f
            instance.call_tool.return_value = lambda f: f
            instance.create_initialization_options.return_value = None
            instance.run = AsyncMock()

            # stdio_server context manager
            mock_stdio.return_value.__aenter__ = AsyncMock(
                return_value=(AsyncMock(), AsyncMock())
            )
            mock_stdio.return_value.__aexit__ = AsyncMock(return_value=False)

            import asyncio
            asyncio.run(run_mcp_server())

        # Key should be gone
        assert "CASSINI_API_KEY" not in os.environ

    def test_require_mcp_when_available(self):
        """_require_mcp does not raise when MCP SDK is installed."""
        _require_mcp()  # Should not raise

    def test_require_mcp_import_error(self):
        """_require_mcp raises ImportError with install hint when SDK is missing."""
        with patch("cassini.cli.mcp_server.HAS_MCP", False):
            with pytest.raises(ImportError, match="pip install cassini\\[mcp\\]"):
                _require_mcp()


# ── Plants create default timezone ────────────────────────────────────


class TestDefaults:
    """Verify default parameter handling."""

    @pytest.mark.asyncio
    async def test_plants_create_default_timezone(self):
        client = AsyncMock()
        client.plants_create.return_value = {"id": 1, "name": "X", "timezone": "UTC"}
        await _dispatch_tool(
            client,
            "cassini_plants_create",
            {"name": "X"},
            allow_writes=True,
        )
        client.plants_create.assert_awaited_once_with(name="X", timezone="UTC")

    @pytest.mark.asyncio
    async def test_samples_query_default_limit(self):
        client = AsyncMock()
        client.samples_list.return_value = {"items": []}
        await _dispatch_tool(
            client,
            "cassini_samples_query",
            {},
            allow_writes=False,
        )
        client.samples_list.assert_awaited_once_with(
            characteristic_id=None, limit=100
        )
