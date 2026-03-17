"""Test broker and role configuration."""
import pytest
import os


def test_broker_url_defaults_to_empty():
    from cassini.core.config import Settings
    s = Settings(_env_file=None)
    assert s.broker_url == ""


def test_roles_defaults_to_all():
    from cassini.core.config import Settings
    s = Settings(_env_file=None)
    assert s.role_list == ["all"]


def test_broker_url_from_env(monkeypatch):
    monkeypatch.setenv("CASSINI_BROKER_URL", "valkey://localhost:6379")
    from cassini.core.config import Settings
    s = Settings(_env_file=None)
    assert s.broker_url == "valkey://localhost:6379"


def test_roles_from_env(monkeypatch):
    monkeypatch.setenv("CASSINI_ROLES", "api,spc")
    from cassini.core.config import Settings
    s = Settings(_env_file=None)
    assert s.role_list == ["api", "spc"]


def test_has_role_specific():
    from cassini.core.config import Settings
    s = Settings(_env_file=None, roles="api,spc")
    assert s.has_role("api")
    assert s.has_role("spc")
    assert not s.has_role("reports")


def test_has_role_all():
    from cassini.core.config import Settings
    s = Settings(_env_file=None, roles="all")
    assert s.has_role("api")
    assert s.has_role("spc")
    assert s.has_role("reports")
    assert s.has_role("ingestion")


def test_valid_roles():
    from cassini.core.config import VALID_ROLES
    for role in ["all", "api", "spc", "ingestion", "reports", "erp", "purge", "ai"]:
        assert role in VALID_ROLES
