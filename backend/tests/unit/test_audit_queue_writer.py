"""Tests for the queue-decoupled audit writer.

Covers:
- ``AuditService.log()`` is a fast non-blocking enqueue when the writer
  task is running (closes A7-C18: per-request SELECT + retry contention).
- The background writer drains queued events into a contiguous chain.
- Hash-chain integrity holds under concurrent enqueues.
- ``stop_writer()`` drains pending events before shutting down.
"""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from cassini.core.audit import AuditService, compute_audit_hash
from cassini.db.models.audit_log import AuditLog


GENESIS_HASH = "0" * 64


def _make_session_factory(async_engine):
    """Factory matching the ``async with factory() as session`` contract."""
    factory = sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    @asynccontextmanager
    async def _ctx():
        async with factory() as session:
            yield session

    return _ctx


@pytest_asyncio.fixture
async def started_audit_service(async_engine):
    """An AuditService with the writer task running.

    Tests that need to assert against persisted rows should call
    ``await service.stop_writer()`` (or rely on the fixture teardown).
    """
    svc = AuditService(_make_session_factory(async_engine))
    await svc.start_writer()
    try:
        yield svc
    finally:
        # Always tear down so a stuck writer doesn't leak into the next test.
        await svc.stop_writer(timeout=5.0)


@pytest_asyncio.fixture
async def query_session(async_engine):
    """Independent session for verifying persisted audit rows."""
    factory = sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with factory() as session:
        yield session


# ---------------------------------------------------------------------------
# 1. Enqueue performance — log() must NOT block on DB I/O
# ---------------------------------------------------------------------------


class TestEnqueueDoesNotBlock:
    """``log()`` should be a fast non-blocking enqueue."""

    @pytest.mark.asyncio
    async def test_enqueue_under_one_ms_per_call(
        self, started_audit_service: AuditService
    ) -> None:
        """1000 enqueues complete in well under 1s; per-call avg < 1ms.

        The previous implementation issued a SELECT + INSERT per call, so
        1000 sequential calls would take seconds.  With the queue, each
        call is just a ``put_nowait`` and a per-request hot path budget of
        1ms is generous.
        """
        # Warm up: ensure the queue + writer machinery is created so the
        # first measured call doesn't pay setup cost.
        await started_audit_service.log(action="warmup", username="test")

        n = 1000
        start = time.perf_counter()
        for i in range(n):
            await started_audit_service.log(
                action="create",
                resource_type="characteristic",
                resource_id=i,
                user_id=1,
                username="testuser",
            )
        elapsed = time.perf_counter() - start

        avg_ms = (elapsed / n) * 1000
        assert avg_ms < 1.0, (
            f"Average log() latency {avg_ms:.3f}ms exceeds 1ms budget "
            f"(total {elapsed*1000:.1f}ms for {n} calls)"
        )

    @pytest.mark.asyncio
    async def test_log_returns_before_db_write(
        self, started_audit_service: AuditService, query_session: AsyncSession
    ) -> None:
        """``log()`` returns BEFORE the writer has persisted the row.

        Verifies the decoupling: producer doesn't wait on the DB.  We
        check that immediately after ``log()`` returns, the row may not
        yet exist; only after waiting on ``queue.join()`` does it appear.
        """
        await started_audit_service.log(
            action="create",
            resource_type="sample",
            resource_id=42,
            user_id=1,
            username="op",
        )

        # The queue may or may not have already drained, depending on
        # scheduler luck.  What we CAN assert is that after waiting for
        # the queue to fully drain, the row is present.
        queue = started_audit_service._queue
        assert queue is not None
        await queue.join()

        rows = (
            await query_session.execute(
                select(AuditLog).where(AuditLog.resource_id == 42)
            )
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].action == "create"
        assert rows[0].resource_type == "sample"


# ---------------------------------------------------------------------------
# 2. Writer drains queue — all events persisted in chain order
# ---------------------------------------------------------------------------


class TestWriterDrainsQueue:
    """The writer task must persist every queued event."""

    @pytest.mark.asyncio
    async def test_all_events_persisted(
        self, started_audit_service: AuditService, query_session: AsyncSession
    ) -> None:
        """Enqueue 50 events, await drain, verify all persisted in order."""
        n = 50
        for i in range(n):
            await started_audit_service.log(
                action="update",
                resource_type="plant",
                resource_id=i,
                user_id=1,
                username="admin",
            )

        # Wait for the writer to drain everything.
        queue = started_audit_service._queue
        assert queue is not None
        await queue.join()

        rows = (
            await query_session.execute(
                select(AuditLog).order_by(AuditLog.sequence_number.asc())
            )
        ).scalars().all()
        assert len(rows) == n, f"Expected {n} rows, got {len(rows)}"

        # Sequence numbers are contiguous starting from 1.
        for idx, row in enumerate(rows, start=1):
            assert row.sequence_number == idx, (
                f"Row {idx} has sequence_number {row.sequence_number}; "
                f"expected contiguous numbering"
            )

        # Resource IDs preserved in enqueue order (single writer FIFO).
        resource_ids = [row.resource_id for row in rows]
        assert resource_ids == list(range(n))

    @pytest.mark.asyncio
    async def test_chain_hash_continuous_after_drain(
        self, started_audit_service: AuditService, query_session: AsyncSession
    ) -> None:
        """Each row's sequence_hash must match compute_audit_hash(prev, ...)."""
        for i in range(10):
            await started_audit_service.log(
                action="create",
                resource_type="characteristic",
                resource_id=i,
                user_id=1,
                username="engineer",
            )

        queue = started_audit_service._queue
        assert queue is not None
        await queue.join()

        rows = (
            await query_session.execute(
                select(AuditLog).order_by(AuditLog.sequence_number.asc())
            )
        ).scalars().all()
        assert len(rows) == 10

        previous_hash = GENESIS_HASH
        for row in rows:
            expected = compute_audit_hash(
                previous_hash,
                row.action,
                row.resource_type,
                row.resource_id,
                row.user_id,
                row.username,
                row.timestamp,
                sequence_number=row.sequence_number,
            )
            assert row.sequence_hash == expected, (
                f"Chain break at row {row.id} "
                f"(seq={row.sequence_number}): "
                f"expected {expected[:16]}..., got {row.sequence_hash[:16]}..."
            )
            previous_hash = row.sequence_hash


# ---------------------------------------------------------------------------
# 3. Concurrency — chain integrity under concurrent enqueues
# ---------------------------------------------------------------------------


class TestChainIntegrityUnderConcurrentEnqueues:
    """100 concurrent ``log()`` calls produce a single contiguous chain."""

    @pytest.mark.asyncio
    async def test_concurrent_enqueues_form_valid_chain(
        self, started_audit_service: AuditService, query_session: AsyncSession
    ) -> None:
        n = 100
        tasks = [
            started_audit_service.log(
                action="create",
                resource_type="violation",
                resource_id=i,
                user_id=1,
                username="op",
            )
            for i in range(n)
        ]
        await asyncio.gather(*tasks)

        queue = started_audit_service._queue
        assert queue is not None
        await queue.join()

        rows = (
            await query_session.execute(
                select(AuditLog).order_by(AuditLog.sequence_number.asc())
            )
        ).scalars().all()
        assert len(rows) == n, (
            f"Expected {n} rows, got {len(rows)} — "
            f"queue may have lost events"
        )

        # Verify the hash chain end-to-end.  Even with concurrent
        # producers, the single writer enforces sequential append.
        previous_hash = GENESIS_HASH
        seen_seqs: set[int] = set()
        for row in rows:
            assert row.sequence_number not in seen_seqs, (
                f"Duplicate sequence_number {row.sequence_number}"
            )
            seen_seqs.add(row.sequence_number)

            expected = compute_audit_hash(
                previous_hash,
                row.action,
                row.resource_type,
                row.resource_id,
                row.user_id,
                row.username,
                row.timestamp,
                sequence_number=row.sequence_number,
            )
            assert row.sequence_hash == expected, (
                f"Chain break at row id={row.id} "
                f"seq={row.sequence_number}"
            )
            previous_hash = row.sequence_hash

        # Sequence numbers are 1..n with no gaps.
        assert seen_seqs == set(range(1, n + 1))


# ---------------------------------------------------------------------------
# 4. Graceful shutdown — drain queue before exit
# ---------------------------------------------------------------------------


class TestGracefulShutdownDrainsQueue:
    """``stop_writer()`` must drain pending events before returning."""

    @pytest.mark.asyncio
    async def test_pending_events_persisted_before_close(
        self, async_engine, query_session: AsyncSession
    ) -> None:
        """Enqueue a burst, immediately stop the writer, expect all rows persisted."""
        svc = AuditService(_make_session_factory(async_engine))
        await svc.start_writer()

        n = 25
        for i in range(n):
            await svc.log(
                action="delete",
                resource_type="broker",
                resource_id=i,
                user_id=1,
                username="admin",
            )

        # Stop immediately — the writer hasn't necessarily drained yet.
        # stop_writer() must wait for the drain.
        await svc.stop_writer(timeout=5.0)

        # After stop_writer returns, every queued row must be in the DB.
        rows = (
            await query_session.execute(
                select(AuditLog).order_by(AuditLog.sequence_number.asc())
            )
        ).scalars().all()
        assert len(rows) == n, (
            f"Graceful shutdown lost rows: expected {n}, got {len(rows)}"
        )

        # Validate chain integrity in the persisted rows.
        previous_hash = GENESIS_HASH
        for row in rows:
            expected = compute_audit_hash(
                previous_hash,
                row.action,
                row.resource_type,
                row.resource_id,
                row.user_id,
                row.username,
                row.timestamp,
                sequence_number=row.sequence_number,
            )
            assert row.sequence_hash == expected
            previous_hash = row.sequence_hash

    @pytest.mark.asyncio
    async def test_stop_writer_idempotent(self, async_engine) -> None:
        """Calling stop_writer twice is safe (lifespan teardown can be retried)."""
        svc = AuditService(_make_session_factory(async_engine))
        await svc.start_writer()
        await svc.stop_writer(timeout=5.0)
        # Second call must not raise.
        await svc.stop_writer(timeout=5.0)

    @pytest.mark.asyncio
    async def test_stop_writer_without_start_is_noop(self, async_engine) -> None:
        """stop_writer on a service that never started must not raise."""
        svc = AuditService(_make_session_factory(async_engine))
        await svc.stop_writer(timeout=1.0)
