"""Async SPC evaluation queue with consumer coroutine.

Provides a per-worker asyncio queue that decouples sample ingestion from
SPC evaluation.  The batch endpoint enqueues ``SPCEvaluationRequest`` items
via ``enqueue_nowait()`` (never blocks) and the consumer loop drains them
one-by-one, calling ``BatchEvaluator.assess()`` inside its own session.

Lifecycle:
    start()   — spawns the consumer as an ``asyncio.Task``
    shutdown() — drains remaining items (with timeout), then cancels the task

Events are published AFTER the session commit to prevent phantom events.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    from cassini.core.engine.batch_evaluator import BatchEvaluator  # noqa: F401

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Request dataclass
# ---------------------------------------------------------------------------


@dataclass
class SPCEvaluationRequest:
    """A deferred SPC evaluation request."""

    characteristic_id: int
    sample_ids: list[int] = field(default_factory=list)
    material_id: int | None = None


# ---------------------------------------------------------------------------
# SPCQueue
# ---------------------------------------------------------------------------


class SPCQueue:
    """Per-worker async queue for deferred SPC processing.

    Design decisions:
    - ``enqueue_nowait`` raises ``asyncio.QueueFull`` — caller (batch endpoint)
      catches it, rolls back DB, returns 503.
    - ``max_size=1_000`` limits drain time on shutdown.
    - Consumer imports ``BatchEvaluator`` lazily to avoid circular imports.
    - Per-item ``try/except`` — consumer NEVER dies from evaluation errors.
    - Events published AFTER commit — no phantom events.
    - ``_mark_failed`` uses a SEPARATE session (the evaluation session may be
      in a bad state).
    """

    def __init__(self, max_size: int = 1_000) -> None:
        self._queue: asyncio.Queue[SPCEvaluationRequest] = asyncio.Queue(
            maxsize=max_size
        )
        self._consumer_task: asyncio.Task[None] | None = None
        self._shutdown_event = asyncio.Event()
        self._enqueued: int = 0
        self._dequeued: int = 0
        self._errors: int = 0

    # -- Public API ---------------------------------------------------------

    async def start(
        self,
        session_factory: Any,
        event_bus: Any,
        window_manager: Any,
    ) -> None:
        """Start the consumer coroutine as an ``asyncio.Task``."""
        self._shutdown_event.clear()
        self._consumer_task = asyncio.create_task(
            self._consume(session_factory, event_bus, window_manager)
        )
        logger.info("spc_queue_started")

    def enqueue_nowait(self, request: SPCEvaluationRequest) -> None:
        """Non-blocking enqueue. Raises ``asyncio.QueueFull`` if at capacity."""
        self._queue.put_nowait(request)
        self._enqueued += 1

    async def shutdown(self, timeout: float = 10.0) -> None:
        """Drain with timeout, then cancel consumer."""
        self._shutdown_event.set()

        if self._consumer_task is not None:
            # Wait for queue to drain up to *timeout* seconds
            try:
                await asyncio.wait_for(self._queue.join(), timeout=timeout)
            except asyncio.TimeoutError:
                logger.warning(
                    "spc_queue_drain_timeout",
                    remaining=self._queue.qsize(),
                    timeout=timeout,
                )

            # Cancel consumer task and wait for it to finish
            self._consumer_task.cancel()
            try:
                await self._consumer_task
            except asyncio.CancelledError:
                pass

        logger.info(
            "spc_queue_shutdown",
            enqueued=self._enqueued,
            dequeued=self._dequeued,
            errors=self._errors,
        )

    @property
    def stats(self) -> dict[str, Any]:
        """Queue health snapshot for the health endpoint."""
        healthy = True
        if self._consumer_task is not None and self._consumer_task.done():
            healthy = False

        return {
            "depth": self._queue.qsize(),
            "enqueued": self._enqueued,
            "dequeued": self._dequeued,
            "errors": self._errors,
            "healthy": healthy,
        }

    # -- Internal -----------------------------------------------------------

    async def _consume(
        self,
        session_factory: Any,
        event_bus: Any,
        window_manager: Any,
    ) -> None:
        """Consumer loop — per-item try/except, never dies.

        Imports ``BatchEvaluator`` lazily to avoid circular imports
        (BatchEvaluator depends on modules within the same engine package).
        """
        # Lazy import to break circular dependency
        from cassini.core.engine.batch_evaluator import BatchEvaluator

        while not self._shutdown_event.is_set():
            try:
                request = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                # Re-check shutdown flag
                continue

            try:
                async with session_factory() as session:
                    evaluator = BatchEvaluator(session, event_bus, window_manager)
                    result = await evaluator.assess(request)
                    await session.commit()

                # Publish events AFTER commit
                for ev in result.events:
                    await event_bus.publish(ev)

                self._dequeued += 1
            except Exception:
                self._errors += 1
                logger.exception(
                    "spc_evaluation_failed",
                    characteristic_id=request.characteristic_id,
                    sample_ids=request.sample_ids,
                )
                # Mark samples as failed in a separate session
                try:
                    async with session_factory() as fail_session:
                        await self._mark_failed(fail_session, request.sample_ids)
                        await fail_session.commit()
                except Exception:
                    logger.exception(
                        "mark_failed_error",
                        sample_ids=request.sample_ids,
                    )
            finally:
                self._queue.task_done()

    @staticmethod
    async def _mark_failed(session: Any, sample_ids: list[int]) -> None:
        """UPDATE sample SET spc_status='spc_failed' WHERE id IN (...)
        AND spc_status='pending_spc'.
        """
        if not sample_ids:
            return

        from sqlalchemy import update

        from cassini.db.models.sample import Sample

        stmt = (
            update(Sample)
            .where(Sample.id.in_(sample_ids), Sample.spc_status == "pending_spc")
            .values(spc_status="spc_failed")
        )
        await session.execute(stmt)


# ---------------------------------------------------------------------------
# Per-worker singleton
# ---------------------------------------------------------------------------

_spc_queue: SPCQueue | None = None


def get_spc_queue() -> SPCQueue:
    """Return the per-worker singleton SPCQueue.

    Creates the instance on first call. Subsequent calls return the
    same object.
    """
    global _spc_queue
    if _spc_queue is None:
        _spc_queue = SPCQueue()
    return _spc_queue


def _reset_spc_queue() -> None:
    """Reset the singleton — for testing only."""
    global _spc_queue
    _spc_queue = None
