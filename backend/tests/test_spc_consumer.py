"""Test SPC Consumer Service — reads from TaskQueue, delegates to evaluator."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from cassini.core.broker.local import LocalTaskQueue
from cassini.core.engine.spc_consumer import SPCConsumerService, SPCConsumerStats


@pytest.fixture
def task_queue():
    return LocalTaskQueue(maxsize=100)


@pytest.fixture
def mock_session_factory():
    """Create a mock session factory that yields an async context manager."""
    session = AsyncMock()
    session.commit = AsyncMock()

    class FakeCtx:
        async def __aenter__(self):
            return session

        async def __aexit__(self, *args):
            pass

    def factory():
        return FakeCtx()

    factory._session = session  # expose for assertions
    return factory


@pytest.fixture
def mock_event_bus():
    bus = AsyncMock()
    bus.publish = AsyncMock()
    return bus


@pytest.fixture
def mock_window_manager():
    return MagicMock()


class TestSPCConsumerLifecycle:
    """Test start/stop/stats lifecycle."""

    @pytest.mark.asyncio
    async def test_start_sets_running(self, task_queue, mock_session_factory, mock_event_bus, mock_window_manager):
        consumer = SPCConsumerService(
            task_queue, mock_session_factory, mock_event_bus, mock_window_manager
        )
        await task_queue.start()

        assert not consumer.is_running

        with patch("cassini.core.engine.batch_evaluator.BatchEvaluator"):
            await consumer.start()
            assert consumer.is_running

            await consumer.stop(timeout=2.0)
            assert not consumer.is_running

        await task_queue.shutdown()

    @pytest.mark.asyncio
    async def test_stats_initial(self, task_queue, mock_session_factory, mock_event_bus, mock_window_manager):
        consumer = SPCConsumerService(
            task_queue, mock_session_factory, mock_event_bus, mock_window_manager
        )
        stats = consumer.stats
        assert isinstance(stats, SPCConsumerStats)
        assert stats.is_running is False
        assert stats.dequeued == 0
        assert stats.errors == 0
        assert stats.healthy is False  # not running = not healthy

    @pytest.mark.asyncio
    async def test_double_start_is_noop(self, task_queue, mock_session_factory, mock_event_bus, mock_window_manager):
        consumer = SPCConsumerService(
            task_queue, mock_session_factory, mock_event_bus, mock_window_manager
        )
        await task_queue.start()

        with patch("cassini.core.engine.batch_evaluator.BatchEvaluator"):
            await consumer.start()
            await consumer.start()  # second call should not raise
            assert consumer.is_running

            await consumer.stop(timeout=2.0)

        await task_queue.shutdown()


class TestSPCConsumerProcessing:
    """Test that the consumer correctly processes queued items."""

    @pytest.mark.asyncio
    async def test_processes_valid_request(self, task_queue, mock_session_factory, mock_event_bus, mock_window_manager):
        """Consumer should dequeue, evaluate, and publish events."""
        await task_queue.start()

        # Mock BatchEvaluator.assess to return a result with events
        mock_result = MagicMock()
        mock_result.events = []

        with patch("cassini.core.engine.batch_evaluator.BatchEvaluator") as MockEval:
            evaluator_instance = AsyncMock()
            evaluator_instance.assess = AsyncMock(return_value=mock_result)
            MockEval.return_value = evaluator_instance

            consumer = SPCConsumerService(
                task_queue, mock_session_factory, mock_event_bus, mock_window_manager
            )
            await consumer.start()

            # Enqueue a request
            await task_queue.enqueue({
                "characteristic_id": 1,
                "sample_ids": [10, 11],
                "material_id": None,
            })

            # Wait for processing
            await asyncio.sleep(0.3)

            assert consumer.stats.dequeued == 1
            assert consumer.stats.errors == 0
            evaluator_instance.assess.assert_called_once()

            await consumer.stop(timeout=2.0)

        await task_queue.shutdown()

    @pytest.mark.asyncio
    async def test_invalid_request_increments_errors(self, task_queue, mock_session_factory, mock_event_bus, mock_window_manager):
        """Invalid items (missing characteristic_id) should increment error count."""
        await task_queue.start()

        with patch("cassini.core.engine.batch_evaluator.BatchEvaluator"):
            consumer = SPCConsumerService(
                task_queue, mock_session_factory, mock_event_bus, mock_window_manager
            )
            await consumer.start()

            # Enqueue invalid request (missing characteristic_id)
            await task_queue.enqueue({"bad_key": "bad_value"})

            await asyncio.sleep(0.3)

            assert consumer.stats.errors == 1
            assert consumer.stats.dequeued == 0

            await consumer.stop(timeout=2.0)

        await task_queue.shutdown()

    @pytest.mark.asyncio
    async def test_evaluation_error_increments_errors(self, task_queue, mock_session_factory, mock_event_bus, mock_window_manager):
        """BatchEvaluator.assess raising should increment errors, not crash consumer."""
        await task_queue.start()

        with patch("cassini.core.engine.batch_evaluator.BatchEvaluator") as MockEval:
            evaluator_instance = AsyncMock()
            evaluator_instance.assess = AsyncMock(side_effect=RuntimeError("boom"))
            MockEval.return_value = evaluator_instance

            consumer = SPCConsumerService(
                task_queue, mock_session_factory, mock_event_bus, mock_window_manager
            )
            await consumer.start()

            await task_queue.enqueue({
                "characteristic_id": 1,
                "sample_ids": [10],
            })

            await asyncio.sleep(0.3)

            # Consumer should still be running despite the error
            assert consumer.is_running
            assert consumer.stats.errors == 1
            assert consumer.stats.dequeued == 0

            await consumer.stop(timeout=2.0)

        await task_queue.shutdown()

    @pytest.mark.asyncio
    async def test_events_published_after_commit(self, task_queue, mock_session_factory, mock_event_bus, mock_window_manager):
        """Events from BatchEvaluator result should be published after session commit."""
        await task_queue.start()

        fake_event = MagicMock()
        mock_result = MagicMock()
        mock_result.events = [fake_event]

        with patch("cassini.core.engine.batch_evaluator.BatchEvaluator") as MockEval:
            evaluator_instance = AsyncMock()
            evaluator_instance.assess = AsyncMock(return_value=mock_result)
            MockEval.return_value = evaluator_instance

            consumer = SPCConsumerService(
                task_queue, mock_session_factory, mock_event_bus, mock_window_manager
            )
            await consumer.start()

            await task_queue.enqueue({
                "characteristic_id": 5,
                "sample_ids": [100],
            })

            await asyncio.sleep(0.3)

            mock_event_bus.publish.assert_called_once_with(fake_event)

            await consumer.stop(timeout=2.0)

        await task_queue.shutdown()
