"""Signature HMAC key persistence — 21 CFR Part 11 §11.10(e).

The signature key MUST resolve to a CWD-independent path so a uvicorn
restart from a different working directory cannot silently regenerate the
key (which would mark every historical signature as tampered).
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from cassini.core import signature_engine


def _reset_signature_key_cache() -> None:
    """Clear the module-level cache between test cases."""
    signature_engine._signature_key_cache = None
    signature_engine._signature_key_path_cache = None


@pytest.fixture(autouse=True)
def _isolate_signature_key(monkeypatch, tmp_path):
    """Pin the data directory to a temp path per test and clear caches.

    Without this, tests would race against the shared backend/data
    directory and could leak keys between cases.
    """
    monkeypatch.setenv("CASSINI_DATA_DIR", str(tmp_path))
    # The settings singleton is cached via lru_cache — clear it so the
    # new env var is observed.
    from cassini.core.config import get_settings

    get_settings.cache_clear()
    _reset_signature_key_cache()
    yield
    _reset_signature_key_cache()
    get_settings.cache_clear()


def test_signature_key_path_is_stable(tmp_path, monkeypatch) -> None:
    """Resolved path must NOT depend on CWD.

    Sign once from CWD A, then change CWD to B and sign again. Both calls
    must hit the same key file — proving that the key is anchored to the
    configured data dir, not the process working directory.
    """
    # Pin the data dir to tmp_path
    monkeypatch.setenv("CASSINI_DATA_DIR", str(tmp_path))
    from cassini.core.config import get_settings

    get_settings.cache_clear()
    _reset_signature_key_cache()

    # CWD A
    cwd_a = tmp_path / "cwd_a"
    cwd_a.mkdir()
    monkeypatch.chdir(cwd_a)
    path_a = signature_engine._get_signature_key_path()

    # Read the key once to materialise it
    key_a = signature_engine._get_signature_key()

    # CWD B — different working directory, but data dir env var unchanged.
    # Reset the in-process cache so a stale-path bug would surface as
    # divergence instead of being masked by the cache.
    cwd_b = tmp_path / "cwd_b"
    cwd_b.mkdir()
    monkeypatch.chdir(cwd_b)
    _reset_signature_key_cache()
    path_b = signature_engine._get_signature_key_path()
    key_b = signature_engine._get_signature_key()

    assert path_a == path_b, "Signature key path must not depend on CWD"
    assert path_a.is_absolute(), "Key path must be absolute"
    assert key_a == key_b, "Loading the same key file twice must return the same bytes"
    # Sanity: path must be inside the configured data dir, not relative to CWD
    assert str(path_a).startswith(str(tmp_path.resolve()))


def test_signature_key_lazy_generation_on_fresh_install(tmp_path) -> None:
    """First-time generation: key file is created in the data dir."""
    import base64

    key_path = signature_engine._get_signature_key_path()
    assert not key_path.exists()

    key = signature_engine._get_signature_key()

    assert key_path.exists()
    assert len(key) >= 16
    # Persisted as base64 (whitespace-safe); decoding round-trips
    assert base64.b64decode(key_path.read_bytes().strip()) == key


def test_startup_fails_if_key_file_missing_when_signatures_exist() -> None:
    """If signatures exist in the DB but the key file is gone, startup MUST fail.

    Auto-regeneration would mark every prior signature as tampered. The
    operator must be told to restore the key from backup, not silently
    issue a fresh one.
    """
    # Key file does not exist (fresh tmp_path)
    with pytest.raises(RuntimeError) as exc_info:
        signature_engine.verify_signature_key_path(signatures_exist=True)

    msg = str(exc_info.value).lower()
    assert "signature" in msg
    assert "21 cfr part 11" in msg or "tamper" in msg or "backup" in msg


def test_startup_succeeds_on_fresh_install_no_signatures(tmp_path) -> None:
    """Missing key file is fine if no signatures exist yet (new install)."""
    # Should NOT raise — first install path
    path = signature_engine.verify_signature_key_path(signatures_exist=False)
    assert path == signature_engine._get_signature_key_path()


def test_startup_succeeds_when_key_file_present(tmp_path) -> None:
    """If the key already exists, startup verification passes."""
    # Materialise the key
    signature_engine._get_signature_key()

    path = signature_engine.verify_signature_key_path(signatures_exist=True)
    assert path.exists()
