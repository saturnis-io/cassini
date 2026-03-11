"""Tests for the Cassini CLI entrypoint.

Tests use click.testing.CliRunner to exercise CLI commands without
spawning a real server or touching the database.
"""

from unittest.mock import AsyncMock, MagicMock, patch

from click.testing import CliRunner

from cassini.cli.main import cli


class TestCliGroup:
    """Tests for the top-level CLI group."""

    def test_cli_group_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "Cassini SPC" in result.output

    def test_cli_group_lists_commands(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "serve" in result.output
        assert "migrate" in result.output
        assert "create-admin" in result.output
        assert "version" in result.output
        assert "check" in result.output


class TestVersionCommand:
    """Tests for the 'version' command."""

    def test_cli_version(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["version"])
        assert result.exit_code == 0
        assert "0.0.9" in result.output

    def test_cli_version_shows_python(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["version"])
        assert result.exit_code == 0
        assert "Python" in result.output


class TestServeCommand:
    """Tests for the 'serve' command."""

    def test_serve_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["serve", "--help"])
        assert result.exit_code == 0
        assert "--host" in result.output
        assert "--port" in result.output
        assert "--no-migrate" in result.output

    def test_serve_help_shows_workers(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["serve", "--help"])
        assert result.exit_code == 0
        assert "--workers" in result.output

    @patch("cassini.cli.main._run_migrations")
    @patch("cassini.cli.main.uvicorn")
    def test_serve_default(self, mock_uvicorn, mock_migrate):
        runner = CliRunner()
        result = runner.invoke(cli, ["serve"])
        assert result.exit_code == 0
        mock_migrate.assert_called_once()
        mock_uvicorn.run.assert_called_once_with(
            "cassini.main:app",
            host="127.0.0.1",
            port=8000,
            workers=1,
            log_level="info",
        )

    @patch("cassini.cli.main._run_migrations")
    @patch("cassini.cli.main.uvicorn")
    def test_serve_custom_host_port(self, mock_uvicorn, mock_migrate):
        runner = CliRunner()
        result = runner.invoke(cli, ["serve", "--host", "0.0.0.0", "--port", "9000"])
        assert result.exit_code == 0
        mock_uvicorn.run.assert_called_once_with(
            "cassini.main:app",
            host="0.0.0.0",
            port=9000,
            workers=1,
            log_level="info",
        )

    @patch("cassini.cli.main._run_migrations")
    @patch("cassini.cli.main.uvicorn")
    def test_serve_no_migrate(self, mock_uvicorn, mock_migrate):
        runner = CliRunner()
        result = runner.invoke(cli, ["serve", "--no-migrate"])
        assert result.exit_code == 0
        mock_migrate.assert_not_called()
        mock_uvicorn.run.assert_called_once()

    @patch("cassini.cli.main._run_migrations")
    @patch("cassini.cli.main.uvicorn")
    def test_serve_workers(self, mock_uvicorn, mock_migrate):
        runner = CliRunner()
        result = runner.invoke(cli, ["serve", "--workers", "4"])
        assert result.exit_code == 0
        mock_uvicorn.run.assert_called_once_with(
            "cassini.main:app",
            host="127.0.0.1",
            port=8000,
            workers=4,
            log_level="info",
        )


class TestMigrateCommand:
    """Tests for the 'migrate' command."""

    def test_migrate_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["migrate", "--help"])
        assert result.exit_code == 0

    @patch("cassini.cli.main._run_migrations")
    def test_migrate_runs(self, mock_migrate):
        runner = CliRunner()
        result = runner.invoke(cli, ["migrate"])
        assert result.exit_code == 0
        mock_migrate.assert_called_once()
        assert "complete" in result.output.lower()


class TestCreateAdminCommand:
    """Tests for the 'create-admin' command."""

    def test_create_admin_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["create-admin", "--help"])
        assert result.exit_code == 0
        assert "--username" in result.output

    @patch("cassini.cli.main._create_admin_user")
    def test_create_admin_interactive(self, mock_create):
        mock_create.return_value = None
        runner = CliRunner()
        result = runner.invoke(
            cli, ["create-admin"], input="testadmin\nsecureP@ss1\nsecureP@ss1\n"
        )
        assert result.exit_code == 0
        mock_create.assert_called_once_with("testadmin", "secureP@ss1")

    @patch("cassini.cli.main._create_admin_user")
    def test_create_admin_with_flags(self, mock_create):
        mock_create.return_value = None
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["create-admin", "--username", "myadmin", "--password", "secureP@ss1"],
        )
        assert result.exit_code == 0
        mock_create.assert_called_once_with("myadmin", "secureP@ss1")

    def test_create_admin_password_mismatch(self):
        runner = CliRunner()
        result = runner.invoke(
            cli, ["create-admin"], input="testadmin\npass1\npass2\n"
        )
        assert result.exit_code != 0
        assert "do not match" in result.output.lower()

    def test_create_admin_password_too_short(self):
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["create-admin", "--username", "admin", "--password", "short"],
        )
        assert result.exit_code != 0
        assert "at least 8" in result.output.lower()


class TestCheckCommand:
    """Tests for the 'check' command."""

    def test_check_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["check", "--help"])
        assert result.exit_code == 0
