"""Test CLI credential storage."""
import json
import os
import pytest
from pathlib import Path
from unittest.mock import patch


@pytest.fixture
def temp_creds(tmp_path):
    """Override credentials path to temp directory."""
    creds_file = tmp_path / "credentials.json"
    with patch("cassini.cli.credentials._CONFIG_DIR", tmp_path), \
         patch("cassini.cli.credentials._CREDENTIALS_FILE", creds_file):
        yield creds_file


def test_save_and_load_credential(temp_creds):
    from cassini.cli.credentials import save_credential, load_credential
    save_credential("https://factory:8000", "cassini_abc123")
    result = load_credential()
    assert result is not None
    url, key = result
    assert url == "https://factory:8000"
    assert key == "cassini_abc123"


def test_load_nonexistent_returns_none(temp_creds):
    from cassini.cli.credentials import load_credential
    assert load_credential() is None


def test_multiple_profiles(temp_creds):
    from cassini.cli.credentials import save_credential, load_credential
    save_credential("https://dev:8000", "key_dev", profile="dev")
    save_credential("https://prod:8000", "key_prod", profile="prod")

    dev = load_credential("dev")
    prod = load_credential("prod")
    assert dev[0] == "https://dev:8000"
    assert prod[0] == "https://prod:8000"


def test_delete_credential(temp_creds):
    from cassini.cli.credentials import save_credential, delete_credential, load_credential
    save_credential("https://factory:8000", "key123")
    assert delete_credential("default") is True
    assert load_credential() is None


def test_delete_nonexistent_returns_false(temp_creds):
    from cassini.cli.credentials import delete_credential
    assert delete_credential("nonexistent") is False


def test_list_profiles(temp_creds):
    from cassini.cli.credentials import save_credential, list_profiles
    save_credential("https://a:8000", "key_a", profile="alpha")
    save_credential("https://b:8000", "key_b", profile="beta")
    profiles = list_profiles()
    assert "alpha" in profiles
    assert "beta" in profiles


def test_atomic_write_creates_file(temp_creds):
    from cassini.cli.credentials import save_credential
    save_credential("https://factory:8000", "key123")
    assert temp_creds.exists()
    data = json.loads(temp_creds.read_text())
    assert "profiles" in data


def test_corrupt_file_returns_empty(temp_creds):
    from cassini.cli.credentials import load_credential
    temp_creds.write_text("not json{{{")
    assert load_credential() is None
