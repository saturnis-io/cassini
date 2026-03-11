"""Unit tests for SPCQueue — async queue for deferred SPC processing.

Tests cover:
- SPCEvaluationRequest dataclass construction
- Enqueue behavior (success, QueueFull, counter increment)
- Stats property (initial state, reflects mutations)
- Consumer coroutine (processes items, survives errors, shutdown)
- Singleton accessors (get_spc_queue, _reset_spc_queue)
"""

from __future__ import annotations

import asyncio
import sys
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# BatchEvaluator module doesn't exist yet (Task 4).  Inject a stub module
# into sys.modules so the lazy import inside _consume() resolves to a mock
# that individual tests can override.
_stub_module = ModuleType("cassini.core.engine.batch_evaluator")
_stub_module.BatchEvaluator = MagicMock()  # type: ignore[attr-defined]
sys.modules.setdefault("cassini.core.engine.batch_evaluator", _stub_module)

from cassini.core.engine.spc_queue import (
    SPCEvaluationRequest,
    SPCQueue,
    _reset_spc_queue,
    get_spc_queue,
)


# ---------------------------------------------------------------------------
# SPCEvaluationRequest
# ---------------------------------------------------------------------------


class TestSPCEvaluationRequest:
    """Tests for SPCEvaluationRequest dataclass."""

    def test_construction_with_all_fields(self) -> None:
        req = SPCEvaluationRequest(
            characteristic_id=42,
            sample_ids=[1, 2, 3],
            material_id=7,
        )
        assert req.characteristic_id == 42
        assert req.sample_ids == [1, 2, 3]
        assert req.material_id == 7

    def test_default_material_id_is_none(self) -> None:
        req = SPCEvaluationRequest(characteristic_id=1, sample_ids=[10])
        assert req.material_id is None


# ---------------------------------------------------------------------------
# Enqueue
# ---------------------------------------------------------------------------


class TestSPCQueueEnqueue:
    """Tests for enqueue_nowait behavior."""

    def test_enqueue_succeeds(self) -> None:
        queue = SPCQueue(max_size=10)
        req = SPCEvaluationRequest(characteristic_id=1, sample_ids=[1])
        queue.enqueue_nowait(req)
        assert queue._queue.qsize() == 1

    def test_enqueue_increments_counter(self) -> None:
        queue = SPCQueue(max_size=10)
        for i in range(5):
            queue.enqueue_nowait(
                SPCEvaluationRequest(characteristic_id=i, sample_ids=[i])
            )
        assert queue._enqueued == 5

    def test_enqueue_raises_queue_full(self) -> None:
        queue = SPCQueue(max_size=2)
        queue.enqueue_nowait(SPCEvaluationRequest(characteristic_id=1, sample_ids=[1]))
        queue.enqueue_nowait(SPCEvaluationRequest(characteristic_id=2, sample_ids=[2]))
        with pytest.raises(asyncio.QueueFull):
            queue.enqueue_nowait(
                SPCEvaluationRequest(characteristic_id=3, sample_ids=[3])
            )


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class TestSPCQueueStats:
    """Tests for the stats property."""

    def test_initial_stats(self) -> None:
        queue = SPCQueue(max_size=100)
        stats = queue.stats
        assert stats["depth"] == 0
        assert stats["enqueued"] == 0
        assert stats["dequeued"] == 0
        assert stats["errors"] == 0
        assert stats["healthy"] is True

    def test_stats_reflect_enqueue(self) -> None:
        queue = SPCQueue(max_size=100)
        queue.enqueue_nowait(SPCEvaluationRequest(characteristic_id=1, sample_ids=[1]))
        queue.enqueue_nowait(SPCEvaluationRequest(characteristic_id=2, sample_ids=[2]))
        stats = queue.stats
        assert stats["depth"] == 2
        assert stats["enqueued"] == 2

    def test_healthy_false_when_consumer_not_running(self) -> None:
        queue = SPCQueue(max_size=100)
        # Simulate a dead consumer by setting _consumer_task to a done task
        done_future: asyncio.Future[None] = asyncio.get_event_loop().create_future()
        done_future.set_result(None)
        queue._consumer_task = done_future  # type: ignore[assignment]
        stats = queue.stats
        assert stats["healthy"] is False


# ---------------------------------------------------------------------------
# Consumer
# ---------------------------------------------------------------------------


class TestSPCQueueConsumer:
    """Tests for the _consume loop and start/shutdown lifecycle."""

    @pytest.mark.asyncio
    async def test_processes_item(self) -> None:
        """Consumer calls BatchEvaluator.assess and publishes events after commit."""
        queue = SPCQueue(max_size=100)

        mock_result = MagicMock(events=[])
        mock_evaluator_instance = MagicMock()
        mock_evaluator_instance.assess = AsyncMock(return_value=mock_result)
        mock_evaluator_cls = MagicMock(return_value=mock_evaluator_instance)

        mock_session = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_session_factory = MagicMock(return_value=mock_session)
        mock_event_bus = AsyncMock()
        mock_window_manager = MagicMock()

        with patch(
            "cassini.core.engine.batch_evaluator.BatchEvaluator",
            mock_evaluator_cls,
        ):
            await queue.start(mock_session_factory, mock_event_bus, mock_window_manager)

            req = SPCEvaluationRequest(characteristic_id=1, sample_ids=[10, 11])
            queue.enqueue_nowait(req)

            # Give consumer time to process
            await asyncio.sleep(0.1)

            await queue.shutdown(timeout=2.0)

        mock_evaluator_instance.assess.assert_called_once_with(req)
        mock_session.commit.assert_called_once()
        assert queue._dequeued == 1

    @pytest.mark.asyncio
    async def test_publishes_events_after_commit(self) -> None:
        """Events are published AFTER session commit."""
        queue = SPCQueue(max_size=100)

        mock_event_1 = MagicMock()
        mock_event_2 = MagicMock()
        mock_result = MagicMock(events=[mock_event_1, mock_event_2])
        mock_evaluator_instance = MagicMock()
        mock_evaluator_instance.assess = AsyncMock(return_value=mock_result)
        mock_evaluator_cls = MagicMock(return_value=mock_evaluator_instance)

        mock_session = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_session_factory = MagicMock(return_value=mock_session)
        mock_event_bus = AsyncMock()
        mock_event_bus.publish = AsyncMock()
        mock_window_manager = MagicMock()

        with patch(
            "cassini.core.engine.batch_evaluator.BatchEvaluator",
            mock_evaluator_cls,
        ):
            await queue.start(mock_session_factory, mock_event_bus, mock_window_manager)

            req = SPCEvaluationRequest(characteristic_id=1, sample_ids=[10])
            queue.enqueue_nowait(req)

            await asyncio.sleep(0.1)
            await queue.shutdown(timeout=2.0)

        assert mock_event_bus.publish.call_count == 2
        mock_event_bus.publish.assert_any_call(mock_event_1)
        mock_event_bus.publish.assert_any_call(mock_event_2)

    @pytest.mark.asyncio
    async def test_survives_evaluation_error(self) -> None:
        """Consumer logs error, marks failed, but keeps processing."""
        queue = SPCQueue(max_size=100)

        call_count = 0

        async def side_effect(req: SPCEvaluationRequest) -> MagicMock:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("boom")
            return MagicMock(events=[])

        mock_evaluator_instance = MagicMock()
        mock_evaluator_instance.assess = AsyncMock(side_effect=side_effect)
        mock_evaluator_cls = MagicMock(return_value=mock_evaluator_instance)

        mock_session = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_session_factory = MagicMock(return_value=mock_session)
        mock_event_bus = AsyncMock()
        mock_window_manager = MagicMock()

        with patch(
            "cassini.core.engine.batch_evaluator.BatchEvaluator",
            mock_evaluator_cls,
        ), patch.object(SPCQueue, "_mark_failed", new_callable=AsyncMock) as mock_mark:
            await queue.start(mock_session_factory, mock_event_bus, mock_window_manager)

            # First request will fail, second will succeed
            queue.enqueue_nowait(
                SPCEvaluationRequest(characteristic_id=1, sample_ids=[10])
            )
            queue.enqueue_nowait(
                SPCEvaluationRequest(characteristic_id=2, sample_ids=[20])
            )

            await asyncio.sleep(0.2)
            await queue.shutdown(timeout=2.0)

        assert queue._errors == 1
        assert queue._dequeued == 1  # Only the successful one
        mock_mark.assert_called_once()

    @pytest.mark.asyncio
    async def test_shutdown_with_timeout(self) -> None:
        """Shutdown cancels consumer after timeout if queue doesn't drain."""
        queue = SPCQueue(max_size=100)

        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_session_factory = MagicMock(return_value=mock_session)
        mock_event_bus = AsyncMock()
        mock_window_manager = MagicMock()

        # Use a no-op evaluator — just start and immediately shutdown
        mock_evaluator_cls = MagicMock()
        with patch(
            "cassini.core.engine.batch_evaluator.BatchEvaluator",
            mock_evaluator_cls,
        ):
            await queue.start(mock_session_factory, mock_event_bus, mock_window_manager)
            await queue.shutdown(timeout=1.0)

        # Consumer task should be done after shutdown
        assert queue._consumer_task is None or queue._consumer_task.done()


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


class TestSPCQueueSingleton:
    """Tests for module-level singleton accessors."""

    def test_get_spc_queue_returns_same_instance(self) -> None:
        _reset_spc_queue()
        q1 = get_spc_queue()
        q2 = get_spc_queue()
        assert q1 is q2

    def test_reset_creates_new_instance(self) -> None:
        _reset_spc_queue()
        q1 = get_spc_queue()
        _reset_spc_queue()
        q2 = get_spc_queue()
        assert q1 is not q2
