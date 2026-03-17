"""Unit tests for Valkey broker implementations using mock Redis client.

No running Valkey/Redis instance needed — all Redis calls are mocked.
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from cassini.core.broker.interfaces import QueueStats


# ---------------------------------------------------------------------------
# ValkeyTaskQueue
# ---------------------------------------------------------------------------


class TestValkeyTaskQueue:
    """Test task queue backed by Valkey Lists."""

    def _make_queue(self):
        """Create a ValkeyTaskQueue with a mock client."""
        from cassini.core.broker.valkey import ValkeyTaskQueue

        q = ValkeyTaskQueue("valkey://localhost:6379", namespace="test", connect=False)
        q._client = AsyncMock()
        q._connected = True
        return q

    @pytest.mark.asyncio
    async def test_enqueue_calls_lpush(self):
        q = self._make_queue()
        item = {"char_id": 1, "sample_id": 42}

        await q.enqueue(item)

        q._client.lpush.assert_awaited_once_with(
            "cassini:test:spc_queue", json.dumps(item)
        )
        assert q._enqueued == 1

    @pytest.mark.asyncio
    async def test_dequeue_calls_brpop_and_parses(self):
        q = self._make_queue()
        payload = {"char_id": 1, "sample_id": 42}
        q._client.brpop.return_value = ("cassini:test:spc_queue", json.dumps(payload))

        result = await q.dequeue(timeout=2.0)

        q._client.brpop.assert_awaited_once_with("cassini:test:spc_queue", timeout=2)
        assert result == payload
        assert q._dequeued == 1

    @pytest.mark.asyncio
    async def test_dequeue_returns_none_on_timeout(self):
        q = self._make_queue()
        q._client.brpop.return_value = None

        result = await q.dequeue(timeout=1.0)

        assert result is None
        assert q._dequeued == 0

    @pytest.mark.asyncio
    async def test_dequeue_timeout_floor_at_1(self):
        """BRPOP timeout is int with minimum of 1 second."""
        q = self._make_queue()
        q._client.brpop.return_value = None

        await q.dequeue(timeout=0.1)

        q._client.brpop.assert_awaited_once_with("cassini:test:spc_queue", timeout=1)

    @pytest.mark.asyncio
    async def test_stats_calls_llen(self):
        q = self._make_queue()
        q._client.llen.return_value = 5
        q._enqueued = 10
        q._dequeued = 5
        q._errors = 1

        stats = await q.stats()

        q._client.llen.assert_awaited_once_with("cassini:test:spc_queue")
        assert stats == QueueStats(
            pending=5, enqueued_total=10, dequeued_total=5, errors_total=1, healthy=True
        )

    @pytest.mark.asyncio
    async def test_stats_handles_llen_error(self):
        """Stats returns pending=0 if llen raises."""
        q = self._make_queue()
        q._client.llen.side_effect = ConnectionError("down")

        stats = await q.stats()

        assert stats.pending == 0
        assert stats.healthy is True

    @pytest.mark.asyncio
    async def test_start_pings(self):
        q = self._make_queue()
        q._connected = False

        await q.start()

        q._client.ping.assert_awaited_once()
        assert q._connected is True

    @pytest.mark.asyncio
    async def test_shutdown_closes_client(self):
        q = self._make_queue()
        mock_client = q._client  # Capture before shutdown nulls it

        await q.shutdown()

        mock_client.aclose.assert_awaited_once()
        assert q._client is None
        assert q._connected is False

    @pytest.mark.asyncio
    async def test_enqueue_raises_when_not_connected(self):
        from cassini.core.broker.valkey import ValkeyTaskQueue

        q = ValkeyTaskQueue("valkey://localhost", connect=False)
        # _client is None because connect=False

        with pytest.raises(RuntimeError, match="not connected"):
            await q.enqueue({"test": 1})

    @pytest.mark.asyncio
    async def test_dequeue_raises_when_not_connected(self):
        from cassini.core.broker.valkey import ValkeyTaskQueue

        q = ValkeyTaskQueue("valkey://localhost", connect=False)

        with pytest.raises(RuntimeError, match="not connected"):
            await q.dequeue()


# ---------------------------------------------------------------------------
# ValkeyEventBus
# ---------------------------------------------------------------------------


class TestValkeyEventBus:
    """Test event bus backed by Valkey Streams."""

    def _make_bus(self):
        from cassini.core.broker.valkey import ValkeyEventBus

        bus = ValkeyEventBus("valkey://localhost:6379", namespace="test", connect=False)
        bus._client = AsyncMock()
        return bus

    @pytest.mark.asyncio
    async def test_publish_calls_xadd(self):
        bus = self._make_bus()
        payload = {"char_id": 1, "action": "recalc"}

        await bus.publish("spc.recalc", payload)

        bus._client.xadd.assert_awaited_once_with(
            "cassini:test:events:spc.recalc",
            {"data": json.dumps(payload)},
        )

    @pytest.mark.asyncio
    async def test_publish_raises_when_not_connected(self):
        from cassini.core.broker.valkey import ValkeyEventBus

        bus = ValkeyEventBus("valkey://localhost", connect=False)

        with pytest.raises(RuntimeError, match="not connected"):
            await bus.publish("test", {})

    @pytest.mark.asyncio
    async def test_subscribe_creates_consumer_group(self):
        bus = self._make_bus()
        handler = AsyncMock()

        # Patch asyncio.create_task to avoid actually running the consumer loop
        with patch("asyncio.create_task") as mock_task:
            mock_task.return_value = MagicMock()
            await bus.subscribe("spc.recalc", handler)

        bus._client.xgroup_create.assert_awaited_once_with(
            "cassini:test:events:spc.recalc",
            "cassini_consumers",
            id="0",
            mkstream=True,
        )
        assert handler in bus._handlers["spc.recalc"]

    @pytest.mark.asyncio
    async def test_subscribe_without_client_stores_handler(self):
        from cassini.core.broker.valkey import ValkeyEventBus

        bus = ValkeyEventBus("valkey://localhost", connect=False)
        handler = AsyncMock()

        await bus.subscribe("test.event", handler)

        assert handler in bus._handlers["test.event"]

    @pytest.mark.asyncio
    async def test_unsubscribe_removes_handler(self):
        bus = self._make_bus()
        handler = AsyncMock()
        bus._handlers["test.event"] = [handler]

        await bus.unsubscribe("test.event", handler)

        assert handler not in bus._handlers.get("test.event", [])

    @pytest.mark.asyncio
    async def test_shutdown_cancels_tasks_and_closes(self):
        bus = self._make_bus()
        mock_client = bus._client  # Capture before shutdown nulls it

        # Create a real task that blocks forever so cancel() works naturally
        async def block_forever():
            await asyncio.sleep(3600)

        real_task = asyncio.create_task(block_forever())
        bus._consumer_tasks["test"] = real_task

        await bus.shutdown()

        assert real_task.cancelled()
        mock_client.aclose.assert_awaited_once()
        assert len(bus._consumer_tasks) == 0
        assert len(bus._handlers) == 0


# ---------------------------------------------------------------------------
# ValkeyBroadcast
# ---------------------------------------------------------------------------


class TestValkeyBroadcast:
    """Test broadcast channel backed by Valkey Pub/Sub."""

    def _make_broadcast(self):
        from cassini.core.broker.valkey import ValkeyBroadcast

        bc = ValkeyBroadcast("valkey://localhost:6379", namespace="test", connect=False)
        bc._client = AsyncMock()
        return bc

    @pytest.mark.asyncio
    async def test_broadcast_calls_publish(self):
        bc = self._make_broadcast()
        message = {"type": "violation", "char_id": 1}

        await bc.broadcast("spc_updates", message)

        bc._client.publish.assert_awaited_once_with(
            "cassini:test:broadcast:spc_updates",
            json.dumps(message),
        )

    @pytest.mark.asyncio
    async def test_broadcast_raises_when_not_connected(self):
        from cassini.core.broker.valkey import ValkeyBroadcast

        bc = ValkeyBroadcast("valkey://localhost", connect=False)

        with pytest.raises(RuntimeError, match="not connected"):
            await bc.broadcast("test", {})

    @pytest.mark.asyncio
    async def test_subscribe_sets_up_pubsub(self):
        bc = self._make_broadcast()
        mock_pubsub = AsyncMock()
        # client.pubsub() is a sync call in redis-py, so use MagicMock return
        bc._client.pubsub = MagicMock(return_value=mock_pubsub)
        handler = AsyncMock()

        with patch("asyncio.create_task") as mock_task:
            mock_task.return_value = MagicMock()
            await bc.subscribe("spc_updates", handler)

        bc._client.pubsub.assert_called_once()
        mock_pubsub.subscribe.assert_awaited_once_with(
            "cassini:test:broadcast:spc_updates"
        )
        assert handler in bc._handlers["spc_updates"]

    @pytest.mark.asyncio
    async def test_subscribe_without_client_stores_handler(self):
        from cassini.core.broker.valkey import ValkeyBroadcast

        bc = ValkeyBroadcast("valkey://localhost", connect=False)
        handler = AsyncMock()

        await bc.subscribe("test_channel", handler)

        assert handler in bc._handlers["test_channel"]

    @pytest.mark.asyncio
    async def test_unsubscribe_calls_pubsub_unsubscribe(self):
        bc = self._make_broadcast()
        bc._pubsub = AsyncMock()
        bc._handlers["spc_updates"] = [AsyncMock()]

        await bc.unsubscribe("spc_updates")

        bc._pubsub.unsubscribe.assert_awaited_once_with(
            "cassini:test:broadcast:spc_updates"
        )
        assert "spc_updates" not in bc._handlers

    @pytest.mark.asyncio
    async def test_shutdown_cancels_listener_and_closes(self):
        bc = self._make_broadcast()
        mock_pubsub = AsyncMock()
        bc._pubsub = mock_pubsub
        mock_client = bc._client  # Capture before shutdown nulls it

        # Create a real task that blocks forever so cancel() works naturally
        async def block_forever():
            await asyncio.sleep(3600)

        real_task = asyncio.create_task(block_forever())
        bc._listener_task = real_task

        await bc.shutdown()

        assert real_task.cancelled()
        mock_pubsub.aclose.assert_awaited_once()
        mock_client.aclose.assert_awaited_once()
        assert len(bc._handlers) == 0


# ---------------------------------------------------------------------------
# Factory integration
# ---------------------------------------------------------------------------


class TestFactoryValkeyBackend:
    """Test that the factory returns Valkey backends for valkey:// URLs."""

    def test_valkey_scheme(self):
        from cassini.core.broker.factory import create_broker

        broker = create_broker("valkey://localhost:6379", connect=False)

        assert broker.backend == "valkey"

        from cassini.core.broker.valkey import (
            ValkeyTaskQueue,
            ValkeyEventBus,
            ValkeyBroadcast,
        )

        assert isinstance(broker.task_queue, ValkeyTaskQueue)
        assert isinstance(broker.event_bus, ValkeyEventBus)
        assert isinstance(broker.broadcast, ValkeyBroadcast)

    def test_redis_scheme(self):
        from cassini.core.broker.factory import create_broker

        broker = create_broker("redis://localhost:6379", connect=False)
        assert broker.backend == "valkey"

    def test_rediss_scheme(self):
        from cassini.core.broker.factory import create_broker

        broker = create_broker("rediss://localhost:6379", connect=False)
        assert broker.backend == "valkey"

    def test_local_fallback(self):
        from cassini.core.broker.factory import create_broker

        broker = create_broker("")
        assert broker.backend == "local"

    def test_unknown_scheme_raises(self):
        from cassini.core.broker.factory import create_broker

        with pytest.raises(ValueError, match="Unsupported broker scheme"):
            create_broker("kafka://localhost:9092")


# ---------------------------------------------------------------------------
# Protocol compliance
# ---------------------------------------------------------------------------


class TestProtocolCompliance:
    """Verify Valkey classes satisfy the Protocol interfaces."""

    def test_task_queue_protocol(self):
        from cassini.core.broker.interfaces import TaskQueue
        from cassini.core.broker.valkey import ValkeyTaskQueue

        q = ValkeyTaskQueue("valkey://localhost", connect=False)
        assert isinstance(q, TaskQueue)

    def test_event_bus_protocol(self):
        from cassini.core.broker.interfaces import EventBusInterface
        from cassini.core.broker.valkey import ValkeyEventBus

        bus = ValkeyEventBus("valkey://localhost", connect=False)
        assert isinstance(bus, EventBusInterface)

    def test_broadcast_protocol(self):
        from cassini.core.broker.interfaces import BroadcastChannel
        from cassini.core.broker.valkey import ValkeyBroadcast

        bc = ValkeyBroadcast("valkey://localhost", connect=False)
        assert isinstance(bc, BroadcastChannel)
