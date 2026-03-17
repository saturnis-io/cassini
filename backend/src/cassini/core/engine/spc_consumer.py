"""SPC Consumer Service — reads evaluation requests from a TaskQueue.

In cluster mode, the SPC producer (batch endpoint on an API node) enqueues
requests via broker.task_queue.enqueue(). The consumer (on an SPC-role node)
dequeues and evaluates them via BatchEvaluator.

In single-node mode (local broker), this provides the same functionality as
the existing SPCQueue._consume loop but using the broker TaskQueue interface.

Lifecycle:
    start()    — spawns the consumer as an asyncio.Task
    stop()     — signals shutdown and waits for drain
    drain()    — waits for pending items with timeout
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import structlog

from cassini.core.broker.interfaces import TaskQueue

logger = structlog.get_logger(__name__)


@dataclass
class SPCConsumerStats:
    """Snapshot of consumer health and throughput."""

    is_running: bool
    dequeued: int
    errors: int
    healthy: bool


class SPCConsumerService:
    """Consumes SPC evaluation requests from a TaskQueue.

    Design:
    - Reads dicts from TaskQueue.dequeue()
    - Converts to SPCEvaluationRequest
    - Delegates to BatchEvaluator.assess()
    - Publishes events AFTER session commit (no phantom events)
    - Per-item try/except — consumer never dies from evaluation errors
    - _mark_failed uses a separate session
    """

    def __init__(
        self,
        task_queue: TaskQueue,
        session_factory: Any,
        event_bus: Any,
        window_manager: Any,
    ) -> None:
        self._task_queue = task_queue
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._window_manager = window_manager
        self._consumer_task: asyncio.Task[None] | None = None
        self._shutdown_event = asyncio.Event()
        self._dequeued: int = 0
        self._errors: int = 0

    @property
    def is_running(self) -> bool:
        return (
            self._consumer_task is not None
            and not self._consumer_task.done()
        )

    @property
    def stats(self) -> SPCConsumerStats:
        return SPCConsumerStats(
            is_running=self.is_running,
            dequeued=self._dequeued,
            errors=self._errors,
            healthy=self.is_running,
        )

    async def start(self) -> None:
        """Spawn the consumer loop as a background task."""
        if self._consumer_task is not None and not self._consumer_task.done():
            logger.warning("spc_consumer_already_running")
            return
        self._shutdown_event.clear()
        self._consumer_task = asyncio.create_task(self._consume_loop())
        logger.info("spc_consumer_started")

    async def stop(self, timeout: float = 10.0) -> None:
        """Signal shutdown and wait for consumer to finish."""
        self._shutdown_event.set()
        if self._consumer_task is not None:
            try:
                await asyncio.wait_for(
                    asyncio.shield(self._consumer_task), timeout=timeout
                )
            except asyncio.TimeoutError:
                logger.warning("spc_consumer_drain_timeout", timeout=timeout)
                self._consumer_task.cancel()
                try:
                    await self._consumer_task
                except asyncio.CancelledError:
                    pass
            except asyncio.CancelledError:
                pass
        logger.info(
            "spc_consumer_stopped",
            dequeued=self._dequeued,
            errors=self._errors,
        )

    async def drain(self, timeout: float = 10.0) -> None:
        """Wait for the consumer to process pending items (up to timeout)."""
        await self.stop(timeout=timeout)

    async def _consume_loop(self) -> None:
        """Consumer loop — reads from TaskQueue, delegates to BatchEvaluator."""
        # Lazy import to break circular dependency
        from cassini.core.engine.batch_evaluator import BatchEvaluator
        from cassini.core.engine.spc_queue import SPCEvaluationRequest

        while not self._shutdown_event.is_set():
            item = await self._task_queue.dequeue(timeout=1.0)
            if item is None:
                continue

            # Convert dict to SPCEvaluationRequest
            try:
                request = SPCEvaluationRequest(
                    characteristic_id=item["characteristic_id"],
                    sample_ids=item.get("sample_ids", []),
                    material_id=item.get("material_id"),
                )
            except (KeyError, TypeError):
                self._errors += 1
                logger.exception("spc_consumer_invalid_request", item=item)
                continue

            try:
                async with self._session_factory() as session:
                    evaluator = BatchEvaluator(
                        session, self._event_bus, self._window_manager
                    )
                    result = await evaluator.assess(request)
                    await session.commit()

                # Publish events AFTER commit — no phantom events
                for ev in result.events:
                    await self._event_bus.publish(ev)

                self._dequeued += 1
            except Exception:
                self._errors += 1
                logger.exception(
                    "spc_consumer_evaluation_failed",
                    characteristic_id=request.characteristic_id,
                    sample_ids=request.sample_ids,
                )
                # Mark samples as failed in a separate session
                try:
                    async with self._session_factory() as fail_session:
                        await self._mark_failed(
                            fail_session, request.sample_ids
                        )
                        await fail_session.commit()
                except Exception:
                    logger.exception(
                        "spc_consumer_mark_failed_error",
                        sample_ids=request.sample_ids,
                    )

    @staticmethod
    async def _mark_failed(session: Any, sample_ids: list[int]) -> None:
        """Mark samples as spc_failed when evaluation errors occur."""
        if not sample_ids:
            return

        from sqlalchemy import update

        from cassini.db.models.sample import Sample

        stmt = (
            update(Sample)
            .where(
                Sample.id.in_(sample_ids),
                Sample.spc_status == "pending_spc",
            )
            .values(spc_status="spc_failed")
        )
        await session.execute(stmt)
