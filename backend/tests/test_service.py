"""Tests for the Cassini Windows Service module.

Tests exercise the service class attributes, data dir resolution,
and log path configuration. Skipped on non-Windows platforms.
"""

from __future__ import annotations

import sys
from unittest.mock import MagicMock, patch

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows only")


class TestServiceClassAttributes:
    """Tests for CassiniService class metadata."""

    def test_service_class_exists(self):
        from cassini.service.windows_service import CassiniService

        assert CassiniService._svc_name_ == "CassiniSPC"
        assert CassiniService._svc_display_name_ == "Cassini SPC"

    def test_service_description(self):
        from cassini.service.windows_service import CassiniService

        assert CassiniService._svc_description_ == "Statistical Process Control server"


class TestServiceDataDir:
    """Tests for get_service_data_dir()."""

    def test_service_data_dir_resolution(self):
        from cassini.service.windows_service import get_service_data_dir

        data_dir = get_service_data_dir()
        assert "Cassini" in data_dir

    def test_service_data_dir_uses_programdata(self):
        from cassini.service.windows_service import get_service_data_dir

        with patch.dict("os.environ", {"PROGRAMDATA": r"C:\ProgramData"}):
            data_dir = get_service_data_dir()
            assert data_dir == r"C:\ProgramData\Cassini"


class TestServiceLogPath:
    """Tests for get_service_log_path()."""

    def test_service_log_config(self):
        from cassini.service.windows_service import get_service_log_path

        log_path = get_service_log_path()
        assert log_path.endswith("cassini.log")
        assert "logs" in log_path

    @patch("cassini.service.windows_service.os.makedirs")
    def test_service_log_creates_dirs(self, mock_makedirs):
        from cassini.service.windows_service import get_service_log_path

        get_service_log_path()
        mock_makedirs.assert_called_once()


class TestServiceCLI:
    """Tests for the service CLI subgroup."""

    def test_cli_help_lists_service(self):
        from click.testing import CliRunner

        from cassini.cli.main import cli

        runner = CliRunner()
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "service" in result.output

    def test_service_group_help(self):
        from click.testing import CliRunner

        from cassini.cli.main import cli

        runner = CliRunner()
        result = runner.invoke(cli, ["service", "--help"])
        assert result.exit_code == 0
        assert "install" in result.output
        assert "uninstall" in result.output
        assert "start" in result.output
        assert "stop" in result.output

    @patch("cassini.cli.main._service_install")
    def test_service_install(self, mock_install):
        from click.testing import CliRunner

        from cassini.cli.main import cli

        runner = CliRunner()
        result = runner.invoke(cli, ["service", "install"])
        assert result.exit_code == 0
        mock_install.assert_called_once()

    @patch("cassini.cli.main._service_uninstall")
    def test_service_uninstall(self, mock_uninstall):
        from click.testing import CliRunner

        from cassini.cli.main import cli

        runner = CliRunner()
        result = runner.invoke(cli, ["service", "uninstall"])
        assert result.exit_code == 0
        mock_uninstall.assert_called_once()

    @patch("cassini.cli.main._service_start")
    def test_service_start(self, mock_start):
        from click.testing import CliRunner

        from cassini.cli.main import cli

        runner = CliRunner()
        result = runner.invoke(cli, ["service", "start"])
        assert result.exit_code == 0
        mock_start.assert_called_once()

    @patch("cassini.cli.main._service_stop")
    def test_service_stop(self, mock_stop):
        from click.testing import CliRunner

        from cassini.cli.main import cli

        runner = CliRunner()
        result = runner.invoke(cli, ["service", "stop"])
        assert result.exit_code == 0
        mock_stop.assert_called_once()
