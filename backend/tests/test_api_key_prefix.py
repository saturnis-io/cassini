"""Test that API key prefix extraction uses chars AFTER the cassini_ prefix."""

import pytest

from cassini.core.auth.api_key import APIKeyAuth


def test_extract_prefix_differentiates_keys():
    """Two different keys should produce different prefixes."""
    key1 = "cassini_AAAAAAAA" + "x" * 24
    key2 = "cassini_BBBBBBBB" + "y" * 24
    prefix1 = APIKeyAuth.extract_prefix(key1)
    prefix2 = APIKeyAuth.extract_prefix(key2)
    assert prefix1 != prefix2, "Prefixes must differ for different keys"
    assert prefix1 == "AAAAAAAA"
    assert prefix2 == "BBBBBBBB"


def test_extract_prefix_skips_cassini_prefix():
    """Prefix should be the first 8 chars after 'cassini_'."""
    key = APIKeyAuth.generate_key()
    prefix = APIKeyAuth.extract_prefix(key)
    assert not prefix.startswith("cassini")
    assert len(prefix) == 8
    assert prefix == key[8:16]  # chars 8-15 (after "cassini_")


def test_extract_prefix_legacy_key_without_cassini():
    """Keys without cassini_ prefix should use first 8 chars."""
    legacy_key = "abcdefghijklmnop"
    prefix = APIKeyAuth.extract_prefix(legacy_key)
    assert prefix == "abcdefgh"
