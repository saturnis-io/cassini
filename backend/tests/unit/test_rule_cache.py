"""Tests for NelsonRuleLibrary shared caching in SPCEngine."""

import time
from unittest.mock import AsyncMock

import pytest

from cassini.core.engine.nelson_rules import NelsonRuleLibrary
from cassini.core.engine.spc_engine import (
    SPCEngine,
    get_shared_rule_cache,
    invalidate_rule_cache,
    _RULE_CACHE_MAX_SIZE,
    _RULE_CACHE_TTL,
)
from cassini.core.events import EventBus
import cassini.core.engine.spc_engine as spc_engine_mod


@pytest.fixture(autouse=True)
def reset_shared_cache():
    """Reset the module-level shared cache before each test."""
    spc_engine_mod._shared_rule_cache = None
    yield
    spc_engine_mod._shared_rule_cache = None


def _make_engine() -> SPCEngine:
    """Create SPCEngine with mocked deps for cache testing."""
    return SPCEngine(
        sample_repo=AsyncMock(),
        char_repo=AsyncMock(),
        violation_repo=AsyncMock(),
        window_manager=AsyncMock(),
        rule_library=NelsonRuleLibrary(),
        event_bus=EventBus(),
    )


class TestSharedRuleCache:
    """Tests for the module-level shared rule cache."""

    def test_get_shared_rule_cache_lazy_init(self):
        """get_shared_rule_cache creates the OrderedDict on first call."""
        assert spc_engine_mod._shared_rule_cache is None
        cache = get_shared_rule_cache()
        assert cache is not None
        assert len(cache) == 0

    def test_get_shared_rule_cache_returns_same_instance(self):
        """Successive calls return the same OrderedDict."""
        cache1 = get_shared_rule_cache()
        cache2 = get_shared_rule_cache()
        assert cache1 is cache2

    def test_invalidate_rule_cache_no_cache_is_noop(self):
        """invalidate_rule_cache is safe when cache hasn't been created."""
        assert spc_engine_mod._shared_rule_cache is None
        invalidate_rule_cache(42)  # Should not raise

    def test_invalidate_rule_cache_removes_entry(self):
        """invalidate_rule_cache removes the specified entry."""
        cache = get_shared_rule_cache()
        cache[1] = ("lib", 0.0)
        cache[2] = ("lib2", 0.0)
        invalidate_rule_cache(1)
        assert 1 not in cache
        assert 2 in cache

    def test_invalidate_rule_cache_nonexistent_key_is_noop(self):
        """invalidate_rule_cache on a missing key does not raise."""
        get_shared_rule_cache()
        invalidate_rule_cache(999)  # Should not raise


class TestRuleCacheViaEngine:
    """Tests for cache behaviour accessed through SPCEngine methods."""

    def test_cache_miss_builds_and_stores(self):
        """First call builds library and stores in shared cache."""
        engine = _make_engine()
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]
        lib = engine._get_or_build_rule_library(1, configs)
        assert isinstance(lib, NelsonRuleLibrary)
        assert 1 in get_shared_rule_cache()

    def test_cache_hit_skips_rebuild(self):
        """Second call returns cached library (same identity)."""
        engine = _make_engine()
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]
        lib1 = engine._get_or_build_rule_library(1, configs)
        lib2 = engine._get_or_build_rule_library(1, configs)
        assert lib1 is lib2

    def test_cache_independent_per_characteristic(self):
        """Different char_ids get independent libraries."""
        engine = _make_engine()
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]
        lib1 = engine._get_or_build_rule_library(1, configs)
        lib2 = engine._get_or_build_rule_library(2, configs)
        assert lib1 is not lib2
        assert len(get_shared_rule_cache()) == 2

    def test_invalidate_via_engine_method(self):
        """_invalidate_rule_cache delegates to module-level function."""
        engine = _make_engine()
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]
        engine._get_or_build_rule_library(1, configs)
        assert 1 in get_shared_rule_cache()
        engine._invalidate_rule_cache(1)
        assert 1 not in get_shared_rule_cache()

    def test_invalidate_nonexistent_is_noop(self):
        """Invalidating a non-cached entry via engine does not raise."""
        engine = _make_engine()
        engine._invalidate_rule_cache(999)

    def test_cache_ttl_expires(self):
        """Cache entry older than TTL is rebuilt."""
        engine = _make_engine()
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]
        lib1 = engine._get_or_build_rule_library(1, configs)

        # Manually age the cache entry past TTL
        cache = get_shared_rule_cache()
        cache[1] = (lib1, time.monotonic() - _RULE_CACHE_TTL - 100)

        lib2 = engine._get_or_build_rule_library(1, configs)
        assert lib1 is not lib2  # New instance (rebuilt)

    def test_cache_lru_eviction(self):
        """Cache evicts oldest entry when exceeding max size."""
        # Temporarily reduce max size for testing via monkeypatch
        original = spc_engine_mod._RULE_CACHE_MAX_SIZE
        spc_engine_mod._RULE_CACHE_MAX_SIZE = 3
        try:
            engine = _make_engine()
            configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]

            engine._get_or_build_rule_library(1, configs)
            engine._get_or_build_rule_library(2, configs)
            engine._get_or_build_rule_library(3, configs)

            cache = get_shared_rule_cache()
            assert len(cache) == 3

            # Adding 4th should evict char_id=1 (oldest)
            engine._get_or_build_rule_library(4, configs)
            assert len(cache) == 3
            assert 1 not in cache
            assert 4 in cache
        finally:
            spc_engine_mod._RULE_CACHE_MAX_SIZE = original

    def test_cache_lru_touch_on_hit(self):
        """Accessing a cached entry moves it to end (most recent)."""
        original = spc_engine_mod._RULE_CACHE_MAX_SIZE
        spc_engine_mod._RULE_CACHE_MAX_SIZE = 3
        try:
            engine = _make_engine()
            configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]

            engine._get_or_build_rule_library(1, configs)
            engine._get_or_build_rule_library(2, configs)
            engine._get_or_build_rule_library(3, configs)

            # Touch char_id=1 (moves to end)
            engine._get_or_build_rule_library(1, configs)

            # Adding 4th should now evict char_id=2 (oldest untouched)
            engine._get_or_build_rule_library(4, configs)
            cache = get_shared_rule_cache()
            assert 1 in cache  # Was touched, kept
            assert 2 not in cache  # Oldest, evicted
        finally:
            spc_engine_mod._RULE_CACHE_MAX_SIZE = original

    def test_cross_engine_cache_sharing(self):
        """Two separate SPCEngine instances share the same cache."""
        engine1 = _make_engine()
        engine2 = _make_engine()
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]

        # engine1 populates cache
        lib1 = engine1._get_or_build_rule_library(1, configs)

        # engine2 should get a cache hit (same identity)
        lib2 = engine2._get_or_build_rule_library(1, configs)
        assert lib1 is lib2

    def test_cross_engine_invalidation(self):
        """Invalidation from one engine affects lookups from another."""
        engine1 = _make_engine()
        engine2 = _make_engine()
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]

        lib_original = engine1._get_or_build_rule_library(1, configs)

        # Invalidate via module function (as the event handler would)
        invalidate_rule_cache(1)

        # engine2 should rebuild (different identity)
        lib_rebuilt = engine2._get_or_build_rule_library(1, configs)
        assert lib_original is not lib_rebuilt
