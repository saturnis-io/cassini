"""Production safety guard tests for dev_mode and dev_tier.

Closes A6-C9. The CASSINI_ENVIRONMENT setting drives a runtime guard that
disables dev-only toggles when the server is bound to a non-loopback
interface in production. This prevents an environment leak (e.g.
CASSINI_DEV_MODE=true accidentally set on a prod box) from disabling the
login rate limiter or unlocking commercial features.
"""
from __future__ import annotations

import pytest


def test_default_environment_is_production():
    """An unconfigured deployment fails closed — default environment is production."""
    from cassini.core.config import Settings

    s = Settings(_env_file=None)
    assert s.environment == "production"
    assert s.is_production is True


def test_environment_from_env(monkeypatch):
    """CASSINI_ENVIRONMENT env var is honoured."""
    monkeypatch.setenv("CASSINI_ENVIRONMENT", "development")
    from cassini.core.config import Settings

    s = Settings(_env_file=None)
    assert s.environment == "development"
    assert s.is_production is False


def test_loopback_detection_127_0_0_1():
    """127.0.0.1 is recognised as loopback."""
    from cassini.core.config import Settings

    s = Settings(_env_file=None, server_host="127.0.0.1")
    assert s.is_loopback_bind is True


def test_loopback_detection_localhost():
    """'localhost' is recognised as loopback."""
    from cassini.core.config import Settings

    s = Settings(_env_file=None, server_host="localhost")
    assert s.is_loopback_bind is True


def test_loopback_detection_ipv6():
    """'::1' is recognised as loopback."""
    from cassini.core.config import Settings

    s = Settings(_env_file=None, server_host="::1")
    assert s.is_loopback_bind is True


def test_non_loopback_bind_detection():
    """0.0.0.0 and explicit IPs are not loopback."""
    from cassini.core.config import Settings

    s = Settings(_env_file=None, server_host="0.0.0.0")
    assert s.is_loopback_bind is False

    s2 = Settings(_env_file=None, server_host="10.0.0.5")
    assert s2.is_loopback_bind is False


def test_startup_fails_with_dev_mode_in_prod_non_loopback():
    """In production on a non-loopback bind, dev_mode is forced off."""
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="production",
        dev_mode=True,
        server_host="0.0.0.0",
    )
    warnings = s.apply_production_guards()

    assert s.dev_mode is False
    assert "production_dev_mode_disabled_non_loopback" in warnings


def test_startup_succeeds_with_dev_mode_on_loopback():
    """In production on a loopback bind, dev_mode is preserved with a warning.

    A developer running a local prod-mode build for smoke testing should not
    have their dev_mode silently flipped — the bind is still safe.
    """
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="production",
        dev_mode=True,
        server_host="127.0.0.1",
    )
    warnings = s.apply_production_guards()

    assert s.dev_mode is True
    assert "production_dev_mode_loopback_only" in warnings


def test_dev_tier_blocked_in_production():
    """In production on a non-loopback bind, dev_tier is cleared."""
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="production",
        dev_tier="enterprise",
        server_host="0.0.0.0",
    )
    warnings = s.apply_production_guards()

    assert s.dev_tier == ""
    assert "production_dev_tier_cleared_non_loopback" in warnings


def test_dev_tier_preserved_on_loopback_with_warning():
    """In production on loopback, dev_tier is preserved but a warning is emitted."""
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="production",
        dev_tier="pro",
        server_host="localhost",
    )
    warnings = s.apply_production_guards()

    assert s.dev_tier == "pro"
    assert "production_dev_tier_loopback_only" in warnings


def test_development_environment_no_guards():
    """In development, dev_mode and dev_tier are never touched."""
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="development",
        dev_mode=True,
        dev_tier="enterprise",
        server_host="0.0.0.0",
    )
    warnings = s.apply_production_guards()

    assert s.dev_mode is True
    assert s.dev_tier == "enterprise"
    assert warnings == []


def test_apply_production_guards_idempotent():
    """Calling apply_production_guards twice yields stable state."""
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="production",
        dev_mode=True,
        dev_tier="enterprise",
        server_host="0.0.0.0",
    )
    s.apply_production_guards()
    second_warnings = s.apply_production_guards()

    # After the first call dev_mode/dev_tier are already off, so the second
    # call has nothing to warn about.
    assert s.dev_mode is False
    assert s.dev_tier == ""
    assert second_warnings == []


def test_get_settings_applies_guards(monkeypatch):
    """get_settings() invokes the production guard automatically."""
    monkeypatch.setenv("CASSINI_ENVIRONMENT", "production")
    monkeypatch.setenv("CASSINI_DEV_MODE", "true")
    monkeypatch.setenv("CASSINI_SERVER_HOST", "0.0.0.0")

    # Bypass the lru_cache so this test sees fresh state
    from cassini.core import config as config_module

    config_module.get_settings.cache_clear()
    try:
        s = config_module.get_settings()
        assert s.dev_mode is False
    finally:
        config_module.get_settings.cache_clear()
