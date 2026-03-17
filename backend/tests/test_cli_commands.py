"""Tests for CLI resource-verb commands.

Uses Click's CliRunner with a mocked CassiniClient to test
command output formatting and option parsing without needing
a running Cassini server.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from click.testing import CliRunner

from cassini.cli.main import cli


# ---------------------------------------------------------------------------
# Mock CassiniClient that returns canned data
# ---------------------------------------------------------------------------


class MockCassiniClient:
    """Fake CassiniClient returning deterministic data."""

    def __init__(self) -> None:
        self.plants_list = AsyncMock(
            return_value=[
                {"id": 1, "name": "Plant A", "timezone": "UTC"},
                {"id": 2, "name": "Plant B", "timezone": "US/Eastern"},
            ]
        )
        self.plants_get = AsyncMock(
            return_value={"id": 1, "name": "Plant A", "timezone": "UTC"}
        )
        self.plants_create = AsyncMock(
            return_value={"id": 3, "name": "New Plant", "timezone": "US/Central"}
        )
        self.characteristics_list = AsyncMock(
            return_value=[
                {"id": 10, "name": "Diameter", "plant_id": 1},
                {"id": 11, "name": "Length", "plant_id": 1},
            ]
        )
        self.characteristics_get = AsyncMock(
            return_value={"id": 10, "name": "Diameter", "plant_id": 1}
        )
        self.samples_list = AsyncMock(
            return_value={"items": [{"id": 1, "value": 10.5}], "total": 1, "offset": 0, "limit": 100}
        )
        self.samples_submit = AsyncMock(
            return_value={"sample_id": 99, "characteristic_id": 10}
        )
        self.capability_get = AsyncMock(
            return_value={"cp": 1.33, "cpk": 1.25, "pp": 1.30, "ppk": 1.20}
        )
        self.violations_list = AsyncMock(
            return_value={"items": [], "total": 0, "offset": 0, "limit": 100}
        )
        self.users_list = AsyncMock(
            return_value=[
                {"id": 1, "username": "admin", "is_active": True},
            ]
        )
        self.users_create = AsyncMock(
            return_value={"id": 2, "username": "newuser"}
        )
        self.audit_search = AsyncMock(return_value=[])
        self.license_status = AsyncMock(
            return_value={"edition": "open", "tier": "community", "max_plants": 1}
        )
        self.api_keys_list = AsyncMock(return_value=[])
        self.api_keys_create = AsyncMock(
            return_value={"id": 5, "name": "my-key", "key": "csk_test_xxx"}
        )
        self.health = AsyncMock(return_value={"status": "healthy"})

    async def __aenter__(self) -> MockCassiniClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _invoke(args: list[str], mock_client: MockCassiniClient | None = None) -> object:
    """Invoke a CLI command with a mocked client injected.

    Returns the CliRunner Result object.
    """
    client = mock_client or MockCassiniClient()

    def _factory() -> MockCassiniClient:
        return client

    runner = CliRunner()
    return runner.invoke(cli, args, obj={"client": _factory}, catch_exceptions=False)


# ---------------------------------------------------------------------------
# Tests — Plants
# ---------------------------------------------------------------------------


class TestPlantsCommands:
    def test_plants_list_table(self):
        result = _invoke(["plants", "list"])
        assert result.exit_code == 0
        assert "Plant A" in result.output
        assert "Plant B" in result.output
        # Table header should be present
        assert "id" in result.output
        assert "name" in result.output

    def test_plants_list_json(self):
        result = _invoke(["plants", "list", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert len(data) == 2
        assert data[0]["name"] == "Plant A"

    def test_plants_list_csv(self):
        result = _invoke(["plants", "list", "--csv"])
        assert result.exit_code == 0
        assert "id,name,timezone" in result.output
        assert "Plant A" in result.output

    def test_plants_get(self):
        result = _invoke(["plants", "get", "1"])
        assert result.exit_code == 0
        assert "Plant A" in result.output

    def test_plants_get_json(self):
        result = _invoke(["plants", "get", "1", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["id"] == 1

    def test_plants_create(self):
        result = _invoke(["plants", "create", "--name", "New Plant", "--timezone", "US/Central"])
        assert result.exit_code == 0
        assert "New Plant" in result.output


# ---------------------------------------------------------------------------
# Tests — Characteristics
# ---------------------------------------------------------------------------


class TestCharsCommands:
    def test_chars_list(self):
        result = _invoke(["chars", "list"])
        assert result.exit_code == 0
        assert "Diameter" in result.output

    def test_chars_list_json(self):
        result = _invoke(["chars", "list", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert len(data) == 2

    def test_chars_list_with_plant_filter(self):
        mock = MockCassiniClient()
        result = _invoke(["chars", "list", "--plant-id", "1"], mock)
        assert result.exit_code == 0
        mock.characteristics_list.assert_called_once_with(plant_id=1)

    def test_chars_get(self):
        result = _invoke(["chars", "get", "10"])
        assert result.exit_code == 0
        assert "Diameter" in result.output

    def test_chars_get_json(self):
        result = _invoke(["chars", "get", "10", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["id"] == 10


# ---------------------------------------------------------------------------
# Tests — Samples
# ---------------------------------------------------------------------------


class TestSamplesCommands:
    def test_samples_list(self):
        result = _invoke(["samples", "list"])
        assert result.exit_code == 0

    def test_samples_list_with_char_filter(self):
        mock = MockCassiniClient()
        result = _invoke(["samples", "list", "--char-id", "10"], mock)
        assert result.exit_code == 0
        mock.samples_list.assert_called_once_with(characteristic_id=10, limit=100)

    def test_samples_submit(self):
        mock = MockCassiniClient()
        result = _invoke(
            ["samples", "submit", "--char-id", "10", "1.0", "2.0", "3.0"], mock
        )
        assert result.exit_code == 0
        mock.samples_submit.assert_called_once_with(10, [1.0, 2.0, 3.0])

    def test_samples_submit_json(self):
        result = _invoke(
            ["samples", "submit", "--char-id", "10", "--json", "1.0", "2.0"],
        )
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["sample_id"] == 99


# ---------------------------------------------------------------------------
# Tests — Capability
# ---------------------------------------------------------------------------


class TestCapabilityCommands:
    def test_capability_get(self):
        result = _invoke(["capability", "get", "10"])
        assert result.exit_code == 0
        assert "1.33" in result.output

    def test_capability_get_json(self):
        result = _invoke(["capability", "get", "10", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["cp"] == 1.33
        assert data["cpk"] == 1.25


# ---------------------------------------------------------------------------
# Tests — Violations
# ---------------------------------------------------------------------------


class TestViolationsCommands:
    def test_violations_list(self):
        result = _invoke(["violations", "list"])
        assert result.exit_code == 0
        # CliRunner is not a TTY, so empty list outputs as JSON "[]"
        data = json.loads(result.output)
        assert data == []

    def test_violations_list_active(self):
        mock = MockCassiniClient()
        result = _invoke(["violations", "list", "--active"], mock)
        assert result.exit_code == 0
        mock.violations_list.assert_called_once_with(
            characteristic_id=None, active=True
        )


# ---------------------------------------------------------------------------
# Tests — Users
# ---------------------------------------------------------------------------


class TestUsersCommands:
    def test_users_list(self):
        result = _invoke(["users", "list"])
        assert result.exit_code == 0
        assert "admin" in result.output

    def test_users_list_json(self):
        result = _invoke(["users", "list", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data[0]["username"] == "admin"

    def test_users_create(self):
        result = _invoke(["users", "create", "--username", "bob", "--password", "secret123"])
        assert result.exit_code == 0
        assert "newuser" in result.output


# ---------------------------------------------------------------------------
# Tests — Audit
# ---------------------------------------------------------------------------


class TestAuditCommands:
    def test_audit_search(self):
        result = _invoke(["audit", "search"])
        assert result.exit_code == 0
        # CliRunner is not a TTY, so empty list outputs as JSON "[]"
        data = json.loads(result.output)
        assert data == []

    def test_audit_search_json(self):
        result = _invoke(["audit", "search", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data == []


# ---------------------------------------------------------------------------
# Tests — License
# ---------------------------------------------------------------------------


class TestLicenseCommands:
    def test_license_status(self):
        result = _invoke(["license", "status"])
        assert result.exit_code == 0
        assert "open" in result.output

    def test_license_status_json(self):
        result = _invoke(["license", "status", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["edition"] == "open"
        assert data["max_plants"] == 1


# ---------------------------------------------------------------------------
# Tests — API Keys
# ---------------------------------------------------------------------------


class TestApiKeysCommands:
    def test_api_keys_list(self):
        result = _invoke(["api-keys", "list"])
        assert result.exit_code == 0

    def test_api_keys_create(self):
        result = _invoke(["api-keys", "create", "--name", "my-key"])
        assert result.exit_code == 0
        assert "my-key" in result.output

    def test_api_keys_create_with_plant_ids(self):
        mock = MockCassiniClient()
        result = _invoke(
            ["api-keys", "create", "--name", "scoped", "--plant-ids", "1,2,3"], mock
        )
        assert result.exit_code == 0
        mock.api_keys_create.assert_called_once_with(
            "scoped", scope="read-write", plant_ids=[1, 2, 3]
        )


# ---------------------------------------------------------------------------
# Tests — Health / Status
# ---------------------------------------------------------------------------


class TestOpsCommands:
    def test_health(self):
        result = _invoke(["health"])
        assert result.exit_code == 0
        assert "healthy" in result.output

    def test_health_json(self):
        result = _invoke(["health", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["status"] == "healthy"

    def test_status(self):
        result = _invoke(["status"])
        assert result.exit_code == 0
        assert "healthy" in result.output
        assert "open" in result.output

    def test_status_json(self):
        result = _invoke(["status", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["health"] == "healthy"
        assert data["edition"] == "open"


# ---------------------------------------------------------------------------
# Tests — Output formatter
# ---------------------------------------------------------------------------


class TestOutputFormatter:
    def test_format_table_single_dict(self):
        from cassini.cli.output import format_output

        result = format_output({"name": "Plant A", "id": 1}, fmt="table")
        assert "name: Plant A" in result
        assert "id: 1" in result

    def test_format_table_list(self):
        from cassini.cli.output import format_output

        data = [{"id": 1, "name": "A"}, {"id": 2, "name": "B"}]
        result = format_output(data, fmt="table", columns=["id", "name"])
        assert "id" in result
        assert "name" in result
        assert "A" in result
        assert "B" in result
        # Should have separator line
        assert "--" in result

    def test_format_table_empty(self):
        from cassini.cli.output import format_output

        result = format_output([], fmt="table")
        assert result == "(no results)"

    def test_format_json(self):
        from cassini.cli.output import format_output

        data = [{"id": 1}]
        result = format_output(data, fmt="json")
        parsed = json.loads(result)
        assert parsed == [{"id": 1}]

    def test_format_csv(self):
        from cassini.cli.output import format_output

        data = [{"id": 1, "name": "A"}, {"id": 2, "name": "B"}]
        result = format_output(data, fmt="csv", columns=["id", "name"])
        assert "id,name" in result
        assert "1,A" in result
        assert "2,B" in result

    def test_format_csv_empty(self):
        from cassini.cli.output import format_output

        result = format_output([], fmt="csv")
        assert result == ""

    def test_auto_detect_json_for_pipe(self):
        """When stdout is not a TTY, default format should be JSON."""
        from unittest.mock import patch
        from cassini.cli.output import format_output, is_tty

        with patch("cassini.cli.output.is_tty", return_value=False):
            result = format_output([{"id": 1}])
            # Should be valid JSON
            parsed = json.loads(result)
            assert parsed == [{"id": 1}]

    def test_auto_detect_table_for_tty(self):
        """When stdout is a TTY, default format should be table."""
        from unittest.mock import patch

        with patch("cassini.cli.output.is_tty", return_value=True):
            from cassini.cli.output import format_output

            result = format_output(
                [{"id": 1, "name": "A"}], columns=["id", "name"]
            )
            # Should be a table, not JSON
            assert "id" in result
            assert "--" in result
