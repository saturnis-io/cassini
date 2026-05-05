"""Tests for JWT secret production guard (C8 fix).

In production (CASSINI_DEV_MODE=false) with a non-loopback bind, the
server MUST refuse to auto-generate a JWT secret. The previous behaviour
silently wrote a random secret to .jwt_secret with chmod best-effort —
on Windows the chmod was a no-op, leaving the secret world-readable.

Additional protections:
  - Min secret length: 32 chars.
  - Windows ACL hardening via icacls when chmod is unavailable.
"""

from __future__ import annotations

import os
import platform
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from cassini.core.auth import jwt as jwt_module
from cassini.core.auth.jwt import (
    JWTSecretError,
    MIN_SECRET_LENGTH,
    _is_loopback,
    _resolve_jwt_secret,
    _set_windows_file_acl,
)
from cassini.core.config import Settings, get_settings


@pytest.fixture
def isolated_cwd(tmp_path, monkeypatch):
    """Run each test in an isolated CWD so .jwt_secret writes don't collide."""
    monkeypatch.chdir(tmp_path)
    return tmp_path


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Settings is lru_cached at module level — clear between tests."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _set_env(monkeypatch, **env: str | None) -> None:
    """Apply CASSINI_* env vars; pass None to delete."""
    for key, value in env.items():
        full_key = f"CASSINI_{key}"
        if value is None:
            monkeypatch.delenv(full_key, raising=False)
        else:
            monkeypatch.setenv(full_key, value)
    # Always clear legacy-grace to avoid contamination between tests.
    monkeypatch.delenv("CASSINI_LICENSE_LEGACY_GRACE", raising=False)


class TestProductionGuard:
    """C8: refuse to auto-generate a JWT secret in production."""

    def test_startup_fails_without_secret_in_prod_non_loopback(
        self, isolated_cwd, monkeypatch
    ):
        """Production (dev_mode=false) + non-loopback bind + no secret = fail."""
        _set_env(
            monkeypatch,
            JWT_SECRET="",
            DEV_MODE="false",
            SERVER_HOST="0.0.0.0",
        )

        with pytest.raises(JWTSecretError) as exc_info:
            _resolve_jwt_secret()

        msg = str(exc_info.value).lower()
        assert "non-loopback" in msg or "0.0.0.0" in msg
        assert "cassini_jwt_secret" in msg

    def test_startup_fails_with_public_bind_address(
        self, isolated_cwd, monkeypatch
    ):
        """Public IP bind without secret = fail."""
        _set_env(
            monkeypatch,
            JWT_SECRET="",
            DEV_MODE="false",
            SERVER_HOST="192.168.1.100",
        )
        with pytest.raises(JWTSecretError):
            _resolve_jwt_secret()

    def test_startup_succeeds_with_secret_set(self, isolated_cwd, monkeypatch):
        """Production scenario WITH a strong secret succeeds."""
        strong_secret = "a" * 64
        _set_env(
            monkeypatch,
            JWT_SECRET=strong_secret,
            DEV_MODE="false",
            SERVER_HOST="0.0.0.0",
        )

        result = _resolve_jwt_secret()
        assert result == strong_secret

    def test_startup_succeeds_dev_mode_non_loopback(
        self, isolated_cwd, monkeypatch
    ):
        """Dev mode permits auto-gen even on non-loopback bind."""
        _set_env(
            monkeypatch,
            JWT_SECRET="",
            DEV_MODE="true",
            SERVER_HOST="0.0.0.0",
        )

        result = _resolve_jwt_secret()
        assert len(result) >= MIN_SECRET_LENGTH

    def test_startup_succeeds_loopback_no_secret(
        self, isolated_cwd, monkeypatch
    ):
        """Loopback bind permits auto-gen even with dev_mode=false."""
        _set_env(
            monkeypatch,
            JWT_SECRET="",
            DEV_MODE="false",
            SERVER_HOST="127.0.0.1",
        )

        result = _resolve_jwt_secret()
        assert len(result) >= MIN_SECRET_LENGTH

    def test_loopback_detection_variants(self):
        """All standard loopback addresses recognised."""
        assert _is_loopback("127.0.0.1") is True
        assert _is_loopback("localhost") is True
        assert _is_loopback("LOCALHOST") is True
        assert _is_loopback("::1") is True
        assert _is_loopback(" 127.0.0.1 ") is True
        assert _is_loopback("0.0.0.0") is False
        assert _is_loopback("192.168.1.1") is False
        assert _is_loopback("10.0.0.1") is False


class TestSecretLength:
    """C8: validate minimum secret length."""

    def test_short_secret_rejected(self, isolated_cwd, monkeypatch):
        """A secret shorter than MIN_SECRET_LENGTH must be rejected."""
        _set_env(
            monkeypatch,
            JWT_SECRET="short",
            DEV_MODE="true",
            SERVER_HOST="127.0.0.1",
        )
        with pytest.raises(JWTSecretError) as exc_info:
            _resolve_jwt_secret()
        msg = str(exc_info.value).lower()
        assert "too short" in msg or "minimum" in msg

    def test_31_char_secret_rejected(self, isolated_cwd, monkeypatch):
        """31-char secret (just below floor) rejected."""
        _set_env(
            monkeypatch,
            JWT_SECRET="a" * (MIN_SECRET_LENGTH - 1),
            DEV_MODE="true",
            SERVER_HOST="127.0.0.1",
        )
        with pytest.raises(JWTSecretError):
            _resolve_jwt_secret()

    def test_min_length_secret_accepted(self, isolated_cwd, monkeypatch):
        """Secret exactly at the minimum length accepted."""
        _set_env(
            monkeypatch,
            JWT_SECRET="a" * MIN_SECRET_LENGTH,
            DEV_MODE="true",
            SERVER_HOST="127.0.0.1",
        )
        result = _resolve_jwt_secret()
        assert len(result) == MIN_SECRET_LENGTH


class TestSecretFilePersistence:
    """Auto-generated secrets persist across uvicorn --reload restarts."""

    def test_first_call_creates_secret_file(self, isolated_cwd, monkeypatch):
        _set_env(
            monkeypatch,
            JWT_SECRET="",
            DEV_MODE="true",
            SERVER_HOST="127.0.0.1",
        )
        secret = _resolve_jwt_secret()
        secret_file = isolated_cwd / ".jwt_secret"
        assert secret_file.exists()
        assert secret_file.read_text().strip() == secret

    def test_second_call_reuses_secret_file(self, isolated_cwd, monkeypatch):
        _set_env(
            monkeypatch,
            JWT_SECRET="",
            DEV_MODE="true",
            SERVER_HOST="127.0.0.1",
        )
        first = _resolve_jwt_secret()
        second = _resolve_jwt_secret()
        assert first == second

    def test_short_existing_secret_is_regenerated(
        self, isolated_cwd, monkeypatch
    ):
        """Pre-existing too-short secret on disk = regenerate, not crash."""
        _set_env(
            monkeypatch,
            JWT_SECRET="",
            DEV_MODE="true",
            SERVER_HOST="127.0.0.1",
        )
        bad_file = isolated_cwd / ".jwt_secret"
        bad_file.write_text("tooshort")

        secret = _resolve_jwt_secret()
        assert len(secret) >= MIN_SECRET_LENGTH
        assert secret != "tooshort"


@pytest.mark.skipif(platform.system() != "Windows", reason="Windows-only ACL test")
class TestWindowsACL:
    """C8: on Windows, .jwt_secret must be ACL-restricted via icacls."""

    def test_jwt_file_acl_set_on_windows(self, isolated_cwd, monkeypatch):
        """When auto-generating on Windows, icacls must be invoked."""
        _set_env(
            monkeypatch,
            JWT_SECRET="",
            DEV_MODE="true",
            SERVER_HOST="127.0.0.1",
        )

        # Spy on subprocess.run to verify icacls invocation.
        from cassini.core.auth import jwt as jwt_module_local

        original_run = jwt_module_local.subprocess.run
        call_log: list = []

        def capture_run(args, **kwargs):
            call_log.append(args)
            return original_run(args, **kwargs)

        with patch.object(jwt_module_local.subprocess, "run", side_effect=capture_run):
            _resolve_jwt_secret()

        icacls_calls = [
            args for args in call_log
            if isinstance(args, (list, tuple)) and args and args[0] == "icacls"
        ]
        assert len(icacls_calls) >= 1, (
            f"Expected at least one icacls call; got: {call_log}"
        )
        # Verify the call includes the inheritance reset and grant flags.
        cmd = icacls_calls[0]
        assert "/inheritance:r" in cmd
        assert any("/grant:r" in str(a) for a in cmd)

    def test_acl_failure_raises_jwt_secret_error(
        self, isolated_cwd, monkeypatch
    ):
        """If icacls fails, startup must abort — never ship a world-readable secret."""
        _set_env(
            monkeypatch,
            JWT_SECRET="",
            DEV_MODE="true",
            SERVER_HOST="127.0.0.1",
        )

        # Mock _set_windows_file_acl to simulate failure.
        with patch(
            "cassini.core.auth.jwt._set_windows_file_acl", return_value=False
        ):
            with pytest.raises(JWTSecretError) as exc_info:
                _resolve_jwt_secret()
        msg = str(exc_info.value).lower()
        assert "acl" in msg or "world-readable" in msg
