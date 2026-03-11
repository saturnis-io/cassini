"""Tests for TOML configuration file support."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from cassini.core.toml_config import find_config_file, load_toml_config


class TestLoadTomlConfig:
    """Tests for load_toml_config()."""

    def test_load_toml_config_basic(self, tmp_path: Path):
        config_file = tmp_path / "cassini.toml"
        config_file.write_text(
            '[server]\nhost = "127.0.0.1"\nport = 9000\n'
        )
        config = load_toml_config(str(config_file))
        assert config["server"]["host"] == "127.0.0.1"
        assert config["server"]["port"] == 9000

    def test_load_toml_config_missing_file(self):
        config = load_toml_config("/nonexistent/cassini.toml")
        assert config == {}

    def test_load_toml_config_empty_file(self, tmp_path: Path):
        config_file = tmp_path / "cassini.toml"
        config_file.write_text("")
        config = load_toml_config(str(config_file))
        assert config == {}

    def test_load_toml_config_nested_sections(self, tmp_path: Path):
        config_file = tmp_path / "cassini.toml"
        config_file.write_text(
            '[database]\nurl = "postgresql+asyncpg://user:pass@localhost/cassini"\n'
            "\n"
            '[license]\nfile = "data/license.key"\n'
        )
        config = load_toml_config(str(config_file))
        assert config["database"]["url"] == "postgresql+asyncpg://user:pass@localhost/cassini"
        assert config["license"]["file"] == "data/license.key"

    def test_load_toml_config_invalid_toml(self, tmp_path: Path):
        config_file = tmp_path / "cassini.toml"
        config_file.write_text("this is not valid toml [[[")
        config = load_toml_config(str(config_file))
        assert config == {}

    def test_load_toml_config_all_sections(self, tmp_path: Path):
        config_file = tmp_path / "cassini.toml"
        config_file.write_text(
            '[server]\n'
            'host = "0.0.0.0"\n'
            'port = 8000\n'
            "\n"
            '[database]\n'
            'url = "sqlite+aiosqlite:///./test.db"\n'
            "\n"
            '[auth]\n'
            'jwt_secret = "test-secret"\n'
            'cookie_secure = false\n'
            "\n"
            '[license]\n'
            'file = "data/license.key"\n'
        )
        config = load_toml_config(str(config_file))
        assert config["server"]["host"] == "0.0.0.0"
        assert config["server"]["port"] == 8000
        assert config["database"]["url"] == "sqlite+aiosqlite:///./test.db"
        assert config["auth"]["jwt_secret"] == "test-secret"
        assert config["auth"]["cookie_secure"] is False
        assert config["license"]["file"] == "data/license.key"


class TestFindConfigFile:
    """Tests for find_config_file()."""

    def test_find_config_file_env_override(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        config_file = tmp_path / "custom.toml"
        config_file.write_text("[server]\nport = 9999\n")
        monkeypatch.setenv("CASSINI_CONFIG", str(config_file))
        found = find_config_file()
        assert found == str(config_file)

    def test_find_config_file_env_override_missing(self, monkeypatch: pytest.MonkeyPatch):
        """CASSINI_CONFIG pointing to a missing file returns None."""
        monkeypatch.setenv("CASSINI_CONFIG", "/nonexistent/custom.toml")
        found = find_config_file()
        assert found is None

    def test_find_config_file_cwd(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.delenv("CASSINI_CONFIG", raising=False)
        monkeypatch.chdir(tmp_path)
        config_file = tmp_path / "cassini.toml"
        config_file.write_text("[server]\nport = 8000\n")
        found = find_config_file()
        assert found is not None
        assert Path(found).name == "cassini.toml"

    def test_find_config_file_none_when_absent(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Returns None when no config file exists anywhere."""
        monkeypatch.delenv("CASSINI_CONFIG", raising=False)
        monkeypatch.chdir(tmp_path)
        # Patch the Windows system path check so it doesn't find a real file
        monkeypatch.setattr(
            "cassini.core.toml_config._SYSTEM_CONFIG_PATHS", []
        )
        found = find_config_file()
        assert found is None

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-only path")
    def test_find_config_file_system_path(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Falls back to system config path on Windows."""
        monkeypatch.delenv("CASSINI_CONFIG", raising=False)
        # Use a cwd with no cassini.toml
        monkeypatch.chdir(tmp_path)
        # Create a fake system config path
        sys_dir = tmp_path / "ProgramData" / "Cassini"
        sys_dir.mkdir(parents=True)
        sys_config = sys_dir / "cassini.toml"
        sys_config.write_text("[server]\nport = 7777\n")
        monkeypatch.setattr(
            "cassini.core.toml_config._SYSTEM_CONFIG_PATHS",
            [str(sys_config)],
        )
        found = find_config_file()
        assert found == str(sys_config)


class TestTomlSettingsIntegration:
    """Tests that TOML config integrates with Pydantic Settings."""

    def test_toml_values_used_as_defaults(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """TOML values override built-in defaults."""
        config_file = tmp_path / "cassini.toml"
        config_file.write_text(
            '[database]\nurl = "postgresql+asyncpg://toml@localhost/db"\n'
        )
        monkeypatch.setenv("CASSINI_CONFIG", str(config_file))
        # Clear any env vars that would override TOML
        monkeypatch.delenv("CASSINI_DATABASE_URL", raising=False)

        from cassini.core.config import Settings

        s = Settings()
        assert s.database_url == "postgresql+asyncpg://toml@localhost/db"

    def test_env_vars_override_toml(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Env vars take precedence over TOML values."""
        config_file = tmp_path / "cassini.toml"
        config_file.write_text(
            '[database]\nurl = "postgresql+asyncpg://toml@localhost/db"\n'
        )
        monkeypatch.setenv("CASSINI_CONFIG", str(config_file))
        monkeypatch.setenv(
            "CASSINI_DATABASE_URL", "sqlite+aiosqlite:///./env-override.db"
        )

        from cassini.core.config import Settings

        s = Settings()
        assert s.database_url == "sqlite+aiosqlite:///./env-override.db"

    def test_no_toml_file_uses_defaults(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Without a TOML file, built-in defaults are used."""
        monkeypatch.delenv("CASSINI_CONFIG", raising=False)
        monkeypatch.delenv("CASSINI_DATABASE_URL", raising=False)
        # Ensure no cassini.toml in cwd or system paths
        monkeypatch.setattr(
            "cassini.core.toml_config._SYSTEM_CONFIG_PATHS", []
        )
        monkeypatch.chdir(tmp_path)

        from cassini.core.config import Settings

        s = Settings()
        assert s.database_url == "sqlite+aiosqlite:///./cassini.db"
