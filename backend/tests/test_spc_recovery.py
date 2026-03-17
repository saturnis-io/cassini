"""Test in-flight SPC recovery on startup."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from cassini.db.models import Base


@pytest_asyncio.fixture
async def recovery_engine():
    """Create an in-memory SQLite engine with schema for recovery tests."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def recovery_session(recovery_engine):
    """Create an async session for recovery tests."""
    factory = sessionmaker(
        recovery_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with factory() as session:
        yield session
        await session.rollback()


async def _create_pending_samples(session, char_id, material_id, count):
    """Helper: insert samples with spc_status='pending_spc'."""
    from cassini.db.models.sample import Sample
    from cassini.db.models.characteristic import Characteristic
    from cassini.db.models.hierarchy import Hierarchy
    from cassini.db.models.plant import Plant
    from sqlalchemy import select

    # Ensure plant exists
    result = await session.execute(select(Plant).where(Plant.id == 1))
    if not result.scalar_one_or_none():
        plant = Plant(id=1, name="Test Plant", code="TST", is_active=True)
        session.add(plant)
        await session.flush()

    # Ensure hierarchy node exists
    result = await session.execute(select(Hierarchy).where(Hierarchy.id == 1))
    if not result.scalar_one_or_none():
        node = Hierarchy(id=1, name="Test Node", plant_id=1, type="station")
        session.add(node)
        await session.flush()

    # Ensure characteristic exists
    result = await session.execute(select(Characteristic).where(Characteristic.id == char_id))
    if not result.scalar_one_or_none():
        char = Characteristic(
            id=char_id,
            name=f"Char {char_id}",
            hierarchy_id=1,
            subgroup_size=1,
        )
        session.add(char)
        await session.flush()

    sample_ids = []
    for i in range(count):
        sample = Sample(
            char_id=char_id,
            material_id=material_id,
            spc_status="pending_spc",
        )
        session.add(sample)
        await session.flush()
        sample_ids.append(sample.id)

    await session.commit()
    return sample_ids


class TestRecoverPendingSPC:
    """Test the recover_pending_spc function."""

    @pytest.mark.asyncio
    async def test_no_pending_returns_zero(self, recovery_session):
        from cassini.core.engine.spc_recovery import recover_pending_spc

        count = await recover_pending_spc(recovery_session)
        assert count == 0

    @pytest.mark.asyncio
    async def test_pending_samples_enqueued_to_spc_queue(self, recovery_session):
        from cassini.core.engine.spc_recovery import recover_pending_spc

        sample_ids = await _create_pending_samples(recovery_session, char_id=1, material_id=None, count=3)

        mock_queue = MagicMock()
        mock_queue.enqueue_nowait = MagicMock()

        count = await recover_pending_spc(recovery_session, spc_queue=mock_queue)
        assert count == 1  # 1 group (char_id=1, material_id=None)
        mock_queue.enqueue_nowait.assert_called_once()

        # Check the request has correct characteristic_id and sample_ids
        call_args = mock_queue.enqueue_nowait.call_args[0][0]
        assert call_args.characteristic_id == 1
        assert set(call_args.sample_ids) == set(sample_ids)

    @pytest.mark.asyncio
    async def test_pending_samples_enqueued_to_task_queue(self, recovery_session):
        from cassini.core.engine.spc_recovery import recover_pending_spc
        from cassini.core.broker.local import LocalTaskQueue

        sample_ids = await _create_pending_samples(recovery_session, char_id=2, material_id=None, count=2)

        task_queue = LocalTaskQueue(maxsize=100)
        await task_queue.start()

        count = await recover_pending_spc(recovery_session, task_queue=task_queue)
        assert count == 1

        # Dequeue and verify
        item = await task_queue.dequeue(timeout=1.0)
        assert item is not None
        assert item["characteristic_id"] == 2
        assert set(item["sample_ids"]) == set(sample_ids)
        assert item["recovery"] is True

        await task_queue.shutdown()

    @pytest.mark.asyncio
    async def test_multiple_characteristics_grouped(self, recovery_session):
        from cassini.core.engine.spc_recovery import recover_pending_spc
        from cassini.core.broker.local import LocalTaskQueue

        await _create_pending_samples(recovery_session, char_id=10, material_id=None, count=2)
        await _create_pending_samples(recovery_session, char_id=20, material_id=None, count=3)

        task_queue = LocalTaskQueue(maxsize=100)
        await task_queue.start()

        count = await recover_pending_spc(recovery_session, task_queue=task_queue)
        assert count == 2  # 2 characteristic groups

        # Dequeue both
        items = []
        for _ in range(2):
            item = await task_queue.dequeue(timeout=1.0)
            if item:
                items.append(item)

        char_ids = {item["characteristic_id"] for item in items}
        assert char_ids == {10, 20}

        await task_queue.shutdown()

    @pytest.mark.asyncio
    async def test_both_queues_enqueued(self, recovery_session):
        """When both spc_queue and task_queue are provided, both get items."""
        from cassini.core.engine.spc_recovery import recover_pending_spc
        from cassini.core.broker.local import LocalTaskQueue

        await _create_pending_samples(recovery_session, char_id=5, material_id=None, count=1)

        mock_queue = MagicMock()
        mock_queue.enqueue_nowait = MagicMock()

        task_queue = LocalTaskQueue(maxsize=100)
        await task_queue.start()

        count = await recover_pending_spc(
            recovery_session, spc_queue=mock_queue, task_queue=task_queue
        )
        assert count == 1

        # Both should have received items
        mock_queue.enqueue_nowait.assert_called_once()

        item = await task_queue.dequeue(timeout=1.0)
        assert item is not None
        assert item["characteristic_id"] == 5

        await task_queue.shutdown()

    @pytest.mark.asyncio
    async def test_queue_full_stops_early(self, recovery_session):
        from cassini.core.engine.spc_recovery import recover_pending_spc

        await _create_pending_samples(recovery_session, char_id=30, material_id=None, count=1)
        await _create_pending_samples(recovery_session, char_id=31, material_id=None, count=1)

        mock_queue = MagicMock()
        mock_queue.enqueue_nowait = MagicMock(
            side_effect=asyncio.QueueFull()
        )

        count = await recover_pending_spc(recovery_session, spc_queue=mock_queue)
        # Should stop after the first QueueFull error
        assert count == 0
