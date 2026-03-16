"""Tests for SQLite-backed offline buffer (store-and-forward)."""
import json
import os
import sqlite3
import tempfile
import time
from pathlib import Path
from unittest.mock import MagicMock, call

import pytest

from cassini_bridge.offline_buffer import (
    OfflineBuffer,
    DEFAULT_MAX_BUFFER_RECORDS,
    DEFAULT_MAX_BUFFER_SIZE_MB,
)


@pytest.fixture
def tmp_db(tmp_path):
    """Return a path to a temporary database file."""
    return str(tmp_path / "test_buffer.db")


@pytest.fixture
def buffer(tmp_db):
    """Create an OfflineBuffer with default settings."""
    return OfflineBuffer(db_path=tmp_db)


# ---------------------------------------------------------------------------
# Basic operations
# ---------------------------------------------------------------------------

class TestBasicOperations:

    def test_store_and_count(self, buffer):
        assert buffer.count() == 0

        buffer.store("topic/1", '{"value": 1.0}', 1000.0)
        assert buffer.count() == 1

        buffer.store("topic/2", '{"value": 2.0}', 1001.0)
        assert buffer.count() == 2

    def test_flush_publishes_in_order(self, buffer):
        buffer.store("t/a", '{"value": 1.0}', 100.0)
        buffer.store("t/b", '{"value": 2.0}', 101.0)
        buffer.store("t/a", '{"value": 3.0}', 102.0)

        mqtt = MagicMock()
        flushed = buffer.flush(mqtt)

        assert flushed == 3
        assert buffer.count() == 0

        calls = mqtt.publish.call_args_list
        assert len(calls) == 3
        assert calls[0] == call("t/a", '{"value": 1.0}', qos=1)
        assert calls[1] == call("t/b", '{"value": 2.0}', qos=1)
        assert calls[2] == call("t/a", '{"value": 3.0}', qos=1)

    def test_flush_empty_buffer_returns_zero(self, buffer):
        mqtt = MagicMock()
        assert buffer.flush(mqtt) == 0
        mqtt.publish.assert_not_called()

    def test_flush_stops_on_publish_error(self, buffer):
        """If a publish fails mid-flush, remaining readings stay buffered."""
        buffer.store("t/1", '{"v": 1}', 100.0)
        buffer.store("t/2", '{"v": 2}', 101.0)
        buffer.store("t/3", '{"v": 3}', 102.0)

        mqtt = MagicMock()
        mqtt.publish.side_effect = [None, Exception("broker error"), None]

        flushed = buffer.flush(mqtt)

        # First succeeds, second fails, flush stops — third stays buffered
        assert flushed == 1
        assert buffer.count() == 2

    def test_preserves_original_timestamp(self, buffer):
        """Buffer must store and forward the original measurement timestamp."""
        original_ts = 1700000000.123
        payload = json.dumps({"value": 42.0, "timestamp": original_ts})

        buffer.store("topic/test", payload, original_ts)

        mqtt = MagicMock()
        buffer.flush(mqtt)

        published_payload = mqtt.publish.call_args[0][1]
        parsed = json.loads(published_payload)
        assert parsed["timestamp"] == original_ts


# ---------------------------------------------------------------------------
# Limit enforcement
# ---------------------------------------------------------------------------

class TestLimits:

    def test_record_limit_drops_oldest(self, tmp_db):
        buf = OfflineBuffer(db_path=tmp_db, max_records=5, max_size_mb=500)

        for i in range(7):
            buf.store("t", f'{{"v": {i}}}', float(i))

        # Should have dropped 2 oldest to make room
        assert buf.count() == 5

        mqtt = MagicMock()
        buf.flush(mqtt)

        # Verify the oldest were dropped (values 0 and 1)
        payloads = [c[0][1] for c in mqtt.publish.call_args_list]
        values = [json.loads(p)["v"] for p in payloads]
        assert values == [2, 3, 4, 5, 6]

    def test_size_limit_drops_oldest(self, tmp_db):
        """When file size exceeds max, 10% of records are dropped."""
        # Use a very small size limit to trigger
        buf = OfflineBuffer(db_path=tmp_db, max_records=100_000, max_size_mb=0)

        # Store enough records to exceed the zero-MB limit
        for i in range(20):
            buf.store("topic", json.dumps({"value": i, "data": "x" * 100}), float(i))

        # Count should be less than 20 due to drops
        remaining = buf.count()
        assert remaining < 20


# ---------------------------------------------------------------------------
# Database path creation
# ---------------------------------------------------------------------------

class TestDatabasePath:

    def test_creates_parent_directories(self, tmp_path):
        deep_path = tmp_path / "a" / "b" / "c" / "buffer.db"
        buf = OfflineBuffer(db_path=str(deep_path))
        assert deep_path.parent.exists()
        buf.store("t", "{}", 0.0)
        assert buf.count() == 1

    def test_reuses_existing_database(self, tmp_db):
        """Buffer persists across instances (simulating bridge restart)."""
        buf1 = OfflineBuffer(db_path=tmp_db)
        buf1.store("t/1", '{"v": 1}', 100.0)
        buf1.store("t/2", '{"v": 2}', 101.0)
        assert buf1.count() == 2

        # New instance pointing to same file
        buf2 = OfflineBuffer(db_path=tmp_db)
        assert buf2.count() == 2

        mqtt = MagicMock()
        flushed = buf2.flush(mqtt)
        assert flushed == 2


# ---------------------------------------------------------------------------
# Thread safety
# ---------------------------------------------------------------------------

class TestConcurrency:

    def test_concurrent_stores(self, buffer):
        """Multiple threads storing simultaneously should not corrupt data."""
        import threading

        errors = []

        def store_batch(start):
            try:
                for i in range(50):
                    buffer.store("t", f'{{"v": {start + i}}}', float(start + i))
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=store_batch, args=(i * 50,)) for i in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        assert buffer.count() == 200
