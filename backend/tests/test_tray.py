"""Tests for the Cassini system tray companion app.

Tests exercise icon generation, health check polling, menu structure,
and CLI integration. Skipped on non-Windows platforms.
"""

from __future__ import annotations

import json
import sys
from unittest.mock import MagicMock, patch

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows only")


# ---------------------------------------------------------------------------
# Icon generation
# ---------------------------------------------------------------------------


class TestIconGeneration:
    """Tests for create_status_icon()."""

    def test_running_icon(self):
        from cassini.tray.icons import create_status_icon

        icon = create_status_icon("running")
        assert icon is not None
        assert icon.size == (64, 64)

    def test_stopped_icon(self):
        from cassini.tray.icons import create_status_icon

        icon = create_status_icon("stopped")
        assert icon is not None
        assert icon.size == (64, 64)

    def test_starting_icon(self):
        from cassini.tray.icons import create_status_icon

        icon = create_status_icon("starting")
        assert icon is not None
        assert icon.size == (64, 64)

    def test_unknown_icon(self):
        from cassini.tray.icons import create_status_icon

        icon = create_status_icon("unknown")
        assert icon is not None
        assert icon.size == (64, 64)

    def test_all_statuses_produce_distinct_icons(self):
        from cassini.tray.icons import STATUS_COLORS, create_status_icon

        icons = {}
        for status in STATUS_COLORS:
            icons[status] = create_status_icon(status)
            assert icons[status].size == (64, 64)

        # running and stopped should differ (different colors)
        assert icons["running"].tobytes() != icons["stopped"].tobytes()

    def test_invalid_status_falls_back_to_unknown(self):
        from cassini.tray.icons import create_status_icon

        icon = create_status_icon("bogus_status")
        assert icon is not None
        assert icon.size == (64, 64)


# ---------------------------------------------------------------------------
# CassiniTray class
# ---------------------------------------------------------------------------


class TestCassiniTrayClass:
    """Tests for CassiniTray instantiation and attributes."""

    def test_class_exists_with_expected_methods(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray.__new__(CassiniTray)
        assert hasattr(tray, "check_health")
        assert hasattr(tray, "open_browser")
        assert hasattr(tray, "on_quit")

    def test_default_initialization(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()
        assert tray.host == "localhost"
        assert tray.port == 8000
        assert tray.base_url == "http://localhost:8000"
        assert tray.status == "unknown"

    def test_custom_host_port(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray(host="192.168.1.10", port=9000)
        assert tray.base_url == "http://192.168.1.10:9000"


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


class TestHealthCheck:
    """Tests for health endpoint polling."""

    def test_health_check_success(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()

        body = json.dumps({"status": "ok"}).encode()
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = body
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_response):
            result = tray.check_health()

        assert result == "running"

    def test_health_check_failure_returns_stopped(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()

        with patch("urllib.request.urlopen", side_effect=Exception("Connection refused")):
            result = tray.check_health()

        assert result == "stopped"

    def test_health_check_non_200_returns_stopped(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()

        mock_response = MagicMock()
        mock_response.status = 500
        mock_response.read.return_value = b""
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_response):
            result = tray.check_health()

        assert result == "stopped"


# ---------------------------------------------------------------------------
# Menu structure
# ---------------------------------------------------------------------------


class TestMenuStructure:
    """Tests for the tray context menu."""

    def test_build_menu_returns_menu(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()
        menu = tray._build_menu()

        # pystray.Menu is a tuple subclass — it should be iterable
        items = list(menu)
        assert len(items) > 0

    def test_menu_contains_expected_labels(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()
        menu = tray._build_menu()
        items = list(menu)

        # Collect all text labels (pystray MenuItem has .text attribute)
        labels = []
        for item in items:
            if hasattr(item, "text"):
                text = item.text
                # text may be a callable; evaluate if so
                if callable(text):
                    text = text(item)
                labels.append(text)

        # Check key menu items exist
        assert any("Open Cassini" in label for label in labels)
        assert any("Quit" in label for label in labels)

    def test_menu_contains_service_controls(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()
        menu = tray._build_menu()
        items = list(menu)

        labels = []
        for item in items:
            if hasattr(item, "text"):
                text = item.text
                if callable(text):
                    text = text(item)
                labels.append(text)

        assert any("Start Service" in label for label in labels)
        assert any("Stop Service" in label for label in labels)
        assert any("Restart Service" in label for label in labels)

    def test_menu_contains_settings(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()
        menu = tray._build_menu()
        items = list(menu)

        labels = []
        for item in items:
            if hasattr(item, "text"):
                text = item.text
                if callable(text):
                    text = text(item)
                labels.append(text)

        assert any("Settings" in label for label in labels)

    def test_settings_after_data_folder_before_updates(self):
        """Settings should appear between Open Data Folder and Check for Updates."""
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()
        menu = tray._build_menu()
        items = list(menu)

        labels = []
        for item in items:
            if hasattr(item, "text"):
                text = item.text
                if callable(text):
                    text = text(item)
                labels.append(text)

        # Find indices of the three relevant items
        data_folder_idx = next(i for i, l in enumerate(labels) if "Open Data Folder" in l)
        settings_idx = next(i for i, l in enumerate(labels) if "Settings" in l)
        updates_idx = next(i for i, l in enumerate(labels) if "Check for Updates" in l)

        assert data_folder_idx < settings_idx < updates_idx


# ---------------------------------------------------------------------------
# CLI integration
# ---------------------------------------------------------------------------


class TestTrayCLI:
    """Tests for the tray CLI command."""

    def test_cli_help_lists_tray(self):
        from click.testing import CliRunner

        from cassini.cli.main import cli

        runner = CliRunner()
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "tray" in result.output

    def test_tray_command_help(self):
        from click.testing import CliRunner

        from cassini.cli.main import cli

        runner = CliRunner()
        result = runner.invoke(cli, ["tray", "--help"])
        assert result.exit_code == 0
        assert "--host" in result.output
        assert "--port" in result.output


# ---------------------------------------------------------------------------
# Settings and port conflict
# ---------------------------------------------------------------------------


class TestTraySettings:
    """Tests for the Settings menu item and port conflict detection."""

    def test_tray_has_open_settings_method(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()
        assert hasattr(tray, "_open_settings")
        assert callable(tray._open_settings)

    def test_tray_has_check_port_conflict_method(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()
        assert hasattr(tray, "_check_port_conflict")
        assert callable(tray._check_port_conflict)

    def test_port_conflict_notified_flag_default(self):
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()
        assert tray._port_conflict_notified is False

    def test_port_conflict_returns_true_when_port_occupied(self):
        """When a socket connect succeeds, port is occupied by another app."""
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()

        mock_socket = MagicMock()
        mock_socket.__enter__ = MagicMock(return_value=mock_socket)
        mock_socket.__exit__ = MagicMock(return_value=False)
        mock_socket.connect = MagicMock()  # connect succeeds

        with patch("cassini.tray.app.socket.socket", return_value=mock_socket):
            assert tray._check_port_conflict() is True

    def test_port_conflict_returns_false_when_port_free(self):
        """When socket connect raises OSError, port is not in use."""
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()

        mock_socket = MagicMock()
        mock_socket.__enter__ = MagicMock(return_value=mock_socket)
        mock_socket.__exit__ = MagicMock(return_value=False)
        mock_socket.connect = MagicMock(side_effect=OSError("Connection refused"))

        with patch("cassini.tray.app.socket.socket", return_value=mock_socket):
            assert tray._check_port_conflict() is False

    @patch("cassini.tray.app.subprocess.Popen")
    @patch("cassini.core.toml_config.find_config_file", return_value="C:\\test\\cassini.toml")
    def test_open_settings_existing_config(self, mock_find, mock_popen):
        """When a config file exists, it should be opened directly."""
        from cassini.tray.app import CassiniTray

        tray = CassiniTray()
        tray._open_settings()

        mock_popen.assert_called_once_with(["notepad.exe", "C:\\test\\cassini.toml"])
