"""Test that scoped API keys are enforced at the auth layer."""
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException


def test_read_only_key_blocks_write_methods():
    """A read-only API key should raise 403 on POST/PUT/PATCH/DELETE."""
    from cassini.core.auth.api_key import check_api_key_scope

    key = MagicMock()
    key.scope = "read-only"

    request = MagicMock()
    request.method = "POST"

    with pytest.raises(HTTPException) as exc:
        check_api_key_scope(key, request)
    assert exc.value.status_code == 403
    assert "read-only" in str(exc.value.detail).lower()


def test_read_only_key_allows_get():
    """A read-only API key should allow GET and HEAD."""
    from cassini.core.auth.api_key import check_api_key_scope

    key = MagicMock()
    key.scope = "read-only"

    request = MagicMock()
    request.method = "GET"

    # Should not raise
    check_api_key_scope(key, request)


def test_read_only_key_allows_head():
    from cassini.core.auth.api_key import check_api_key_scope

    key = MagicMock()
    key.scope = "read-only"

    request = MagicMock()
    request.method = "HEAD"

    check_api_key_scope(key, request)


def test_read_write_key_allows_post():
    from cassini.core.auth.api_key import check_api_key_scope

    key = MagicMock()
    key.scope = "read-write"

    request = MagicMock()
    request.method = "POST"

    check_api_key_scope(key, request)


def test_plant_restricted_key_blocks_other_plants():
    """A key restricted to plants [1,3] should raise 403 for plant_id=5."""
    from cassini.core.auth.api_key import check_api_key_plant_access

    key = MagicMock()
    key.plant_ids = [1, 3]

    with pytest.raises(HTTPException) as exc:
        check_api_key_plant_access(key, plant_id=5)
    assert exc.value.status_code == 403


def test_plant_restricted_key_allows_matching_plant():
    from cassini.core.auth.api_key import check_api_key_plant_access

    key = MagicMock()
    key.plant_ids = [1, 3]

    # Should not raise
    check_api_key_plant_access(key, plant_id=3)


def test_unrestricted_key_allows_all_plants():
    """A key with plant_ids=None should allow any plant."""
    from cassini.core.auth.api_key import check_api_key_plant_access

    key = MagicMock()
    key.plant_ids = None

    # Should not raise
    check_api_key_plant_access(key, plant_id=99)


def test_plant_check_with_no_plant_id():
    """When no plant_id is provided (None), should pass regardless."""
    from cassini.core.auth.api_key import check_api_key_plant_access

    key = MagicMock()
    key.plant_ids = [1, 3]

    # Should not raise — no plant context
    check_api_key_plant_access(key, plant_id=None)
