"""Test scoped API key model fields and enforcement."""
import pytest
from cassini.db.models.api_key import APIKey


def test_api_key_has_scope_field():
    """APIKey model should have a scope field that accepts values."""
    key = APIKey(name="test", key_hash="fakehash", scope="read-write")
    assert key.scope == "read-write"


def test_api_key_scope_server_default():
    """scope column should have server_default='read-write' for DB-level insert."""
    col = APIKey.__table__.c.scope
    assert col.server_default.arg == "read-write"
    assert col.nullable is False


def test_api_key_has_plant_ids_field():
    """APIKey model should have an optional plant_ids JSON field."""
    key = APIKey(name="test", key_hash="fakehash", plant_ids=[1, 3])
    assert key.plant_ids == [1, 3]


def test_api_key_plant_ids_defaults_to_none():
    """plant_ids=None means unrestricted (all plants)."""
    key = APIKey(name="test", key_hash="fakehash")
    assert key.plant_ids is None


def test_api_key_is_read_only():
    """Helper property for scope check."""
    key = APIKey(name="test", key_hash="fakehash", scope="read-only")
    assert key.is_read_only is True

    key2 = APIKey(name="test", key_hash="fakehash", scope="read-write")
    assert key2.is_read_only is False
