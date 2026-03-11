"""Tests for NelsonRuleLibrary caching in SPCEngine."""

import time
from unittest.mock import AsyncMock

import pytest

from cassini.core.engine.nelson_rules import NelsonRuleLibrary
from cassini.core.engine.spc_engine import SPCEngine
from cassini.core.events import EventBus


@pytest.fixture
def engine():
    """Create SPCEngine with mocked deps for cache testing."""
    engine = SPCEngine(
        sample_repo=AsyncMock(),
        char_repo=AsyncMock(),
        violation_repo=AsyncMock(),
        window_manager=AsyncMock(),
        rule_library=NelsonRuleLibrary(),
        event_bus=EventBus(),
    )
    return engine


class TestRuleCache:
    def test_cache_miss_builds_and_stores(self, engine):
        """First call builds library and stores in cache."""
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]
        lib = engine._get_or_build_rule_library(1, configs)
        assert isinstance(lib, NelsonRuleLibrary)
        assert 1 in engine._rule_cache

    def test_cache_hit_skips_rebuild(self, engine):
        """Second call returns cached library."""
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]
        lib1 = engine._get_or_build_rule_library(1, configs)
        lib2 = engine._get_or_build_rule_library(1, configs)
        assert lib1 is lib2  # Same object (identity check)

    def test_cache_independent_per_characteristic(self, engine):
        """Different char_ids get independent libraries."""
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]
        lib1 = engine._get_or_build_rule_library(1, configs)
        lib2 = engine._get_or_build_rule_library(2, configs)
        assert lib1 is not lib2
        assert len(engine._rule_cache) == 2

    def test_cache_invalidated_on_event(self, engine):
        """_invalidate_rule_cache removes the entry."""
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]
        engine._get_or_build_rule_library(1, configs)
        assert 1 in engine._rule_cache
        engine._invalidate_rule_cache(1)
        assert 1 not in engine._rule_cache

    def test_cache_invalidate_nonexistent_is_noop(self, engine):
        """Invalidating a non-cached entry does not raise."""
        engine._invalidate_rule_cache(999)  # Should not raise

    def test_cache_ttl_expires(self, engine):
        """Cache entry older than TTL is rebuilt."""
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]
        lib1 = engine._get_or_build_rule_library(1, configs)

        # Manually age the cache entry past TTL
        engine._rule_cache[1] = (lib1, time.monotonic() - 400)  # 400s > 300s TTL

        lib2 = engine._get_or_build_rule_library(1, configs)
        assert lib1 is not lib2  # New instance (rebuilt)

    def test_cache_lru_eviction(self, engine):
        """Cache evicts oldest entry when exceeding max size."""
        engine._rule_cache_max_size = 3
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]

        engine._get_or_build_rule_library(1, configs)
        engine._get_or_build_rule_library(2, configs)
        engine._get_or_build_rule_library(3, configs)
        assert len(engine._rule_cache) == 3

        # Adding 4th should evict char_id=1 (oldest)
        engine._get_or_build_rule_library(4, configs)
        assert len(engine._rule_cache) == 3
        assert 1 not in engine._rule_cache
        assert 4 in engine._rule_cache

    def test_cache_lru_touch_on_hit(self, engine):
        """Accessing a cached entry moves it to end (most recent)."""
        engine._rule_cache_max_size = 3
        configs = [{"rule_id": 1, "is_enabled": True, "parameters": None}]

        engine._get_or_build_rule_library(1, configs)
        engine._get_or_build_rule_library(2, configs)
        engine._get_or_build_rule_library(3, configs)

        # Touch char_id=1 (moves to end)
        engine._get_or_build_rule_library(1, configs)

        # Adding 4th should now evict char_id=2 (oldest untouched)
        engine._get_or_build_rule_library(4, configs)
        assert 1 in engine._rule_cache  # Was touched, kept
        assert 2 not in engine._rule_cache  # Oldest, evicted
