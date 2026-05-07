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


def test_dev_tier_blocked_in_production_non_loopback(monkeypatch):
    """In production on a non-loopback bind, dev_tier is cleared.

    The override env var has no effect in production — it's a
    development-only escape hatch.
    """
    monkeypatch.delenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", raising=False)
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="production",
        dev_tier="enterprise",
        server_host="0.0.0.0",
    )
    warnings = s.apply_production_guards()

    assert s.dev_tier == ""
    assert "dev_tier_cleared_production" in warnings


def test_dev_tier_blocked_in_production_loopback(monkeypatch):
    """SECURITY: In production on loopback, dev_tier is STILL cleared.

    Previously dev_tier was preserved on loopback in production. This was
    the leak — a public Cassini install behind nginx (binding 127.0.0.1)
    with CASSINI_DEV_TIER=enterprise would unlock all paid features. The
    hardened guard treats production as a hard barrier regardless of bind.
    """
    monkeypatch.delenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", raising=False)
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="production",
        dev_tier="pro",
        server_host="127.0.0.1",
    )
    warnings = s.apply_production_guards()

    assert s.dev_tier == ""
    assert "dev_tier_cleared_production" in warnings


def test_dev_tier_blocked_in_production_even_with_override(monkeypatch):
    """SECURITY: The override env var is rejected in production.

    Both ``CASSINI_ENVIRONMENT=development`` AND the override are required
    — setting only the override does not bypass the production guard.
    """
    monkeypatch.setenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", "1")
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="production",
        dev_tier="enterprise",
        server_host="127.0.0.1",
    )
    warnings = s.apply_production_guards()

    assert s.dev_tier == ""
    assert "dev_tier_cleared_production" in warnings


def test_dev_tier_blocked_in_dev_without_override(monkeypatch):
    """In development WITHOUT the override env var, dev_tier is cleared.

    A user who pulls the open-source mirror and finds a stale
    CASSINI_DEV_TIER=enterprise in their shell does not get a free
    upgrade — they must explicitly opt in via the override env var.
    """
    monkeypatch.delenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", raising=False)
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="development",
        dev_tier="enterprise",
        server_host="127.0.0.1",
    )
    warnings = s.apply_production_guards()

    assert s.dev_tier == ""
    assert "dev_tier_cleared_no_override" in warnings


def test_dev_tier_honored_in_dev_with_override(monkeypatch):
    """The legitimate dev workflow: development + override env var = honored.

    This MUST keep working — the project maintainer uses
    CASSINI_DEV_TIER=enterprise daily on their dev machine.
    """
    monkeypatch.setenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", "1")
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="development",
        dev_tier="enterprise",
        server_host="127.0.0.1",
    )
    warnings = s.apply_production_guards()

    assert s.dev_tier == "enterprise"
    assert "dev_tier_override_active" in warnings


@pytest.mark.parametrize("truthy", ["1", "true", "TRUE", "yes", "on"])
def test_override_env_var_truthy_values(monkeypatch, truthy):
    """The override env var accepts standard truthy spellings."""
    monkeypatch.setenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", truthy)
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="development",
        dev_tier="pro",
        server_host="127.0.0.1",
    )
    s.apply_production_guards()
    assert s.dev_tier == "pro"


@pytest.mark.parametrize("falsy", ["0", "false", "no", "off", "", "garbage"])
def test_override_env_var_falsy_values(monkeypatch, falsy):
    """Non-truthy values for the override do not authorize dev_tier."""
    monkeypatch.setenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", falsy)
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="development",
        dev_tier="pro",
        server_host="127.0.0.1",
    )
    s.apply_production_guards()
    assert s.dev_tier == ""


def test_development_environment_no_dev_mode_guard(monkeypatch):
    """In development, dev_mode is never touched (rate-limit bypass is fine)."""
    monkeypatch.delenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", raising=False)
    from cassini.core.config import Settings

    s = Settings(
        _env_file=None,
        environment="development",
        dev_mode=True,
        server_host="0.0.0.0",
    )
    warnings = s.apply_production_guards()

    assert s.dev_mode is True
    # No dev_mode warnings in development
    assert not any("dev_mode" in w for w in warnings)


def test_apply_production_guards_idempotent(monkeypatch):
    """Calling apply_production_guards twice yields stable state."""
    monkeypatch.delenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", raising=False)
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
    monkeypatch.delenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", raising=False)

    # Bypass the lru_cache so this test sees fresh state
    from cassini.core import config as config_module

    config_module.get_settings.cache_clear()
    try:
        s = config_module.get_settings()
        assert s.dev_mode is False
    finally:
        config_module.get_settings.cache_clear()


def test_get_settings_clears_dev_tier_in_production(monkeypatch):
    """get_settings() clears CASSINI_DEV_TIER=enterprise in production.

    This is the regression test for the public-mirror leak — confirms that
    the `os.environ` -> Settings -> apply_production_guards() chain
    actually does clear the value when surfaced via get_settings().
    """
    monkeypatch.setenv("CASSINI_ENVIRONMENT", "production")
    monkeypatch.setenv("CASSINI_DEV_TIER", "enterprise")
    monkeypatch.setenv("CASSINI_SERVER_HOST", "127.0.0.1")
    monkeypatch.setenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", "1")

    from cassini.core import config as config_module

    config_module.get_settings.cache_clear()
    try:
        s = config_module.get_settings()
        assert s.dev_tier == ""
    finally:
        config_module.get_settings.cache_clear()


def test_get_settings_honors_dev_tier_with_override(monkeypatch):
    """get_settings() honors CASSINI_DEV_TIER when the override is set in dev."""
    monkeypatch.setenv("CASSINI_ENVIRONMENT", "development")
    monkeypatch.setenv("CASSINI_DEV_TIER", "enterprise")
    monkeypatch.setenv("CASSINI_SERVER_HOST", "127.0.0.1")
    monkeypatch.setenv("CASSINI_ENABLE_DEV_TIER_OVERRIDE", "1")

    from cassini.core import config as config_module

    config_module.get_settings.cache_clear()
    try:
        s = config_module.get_settings()
        assert s.dev_tier == "enterprise"
    finally:
        config_module.get_settings.cache_clear()
