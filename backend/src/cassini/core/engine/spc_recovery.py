"""Recover pending SPC evaluations on startup.

On crash or restart, samples with spc_status='pending_spc' were accepted into
the database but never evaluated. This module scans for them and re-enqueues
one request per (characteristic_id, material_id) group.

Exactly ONE enqueue target is used per invocation to avoid double-evaluation:
- SPCQueue (legacy, in-process): for local / single-node mode
- TaskQueue (broker-based):      for cluster mode

If both are provided, only the TaskQueue is used (cluster mode takes
precedence). Callers should pass only the appropriate queue for their mode.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

import structlog
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)


async def recover_pending_spc(
    session: AsyncSession,
    spc_queue: Any | None = None,
    task_queue: Any | None = None,
) -> int:
    """Scan for pending_spc samples and re-enqueue by characteristic.

    Exactly one queue is used to avoid double-evaluation. If *task_queue*
    is provided it takes precedence (cluster mode); otherwise *spc_queue*
    is used (local / single-node mode). If neither is provided, recovery
    is skipped.

    Args:
        session: Async database session.
        spc_queue: Optional SPCQueue instance (legacy in-process queue).
            Uses enqueue_nowait() which may raise asyncio.QueueFull.
        task_queue: Optional broker TaskQueue instance.
            Uses await enqueue() for cluster-mode recovery.

    Returns:
        Number of characteristic groups re-enqueued.
    """
    # Select exactly one target to prevent double-evaluation
    use_task_queue = task_queue is not None
    use_spc_queue = not use_task_queue and spc_queue is not None

    if not use_task_queue and not use_spc_queue:
        logger.info("spc_recovery_skipped: no queue provided")
        return 0

    from cassini.db.models.sample import Sample

    stmt = (
        sa_select(Sample.id, Sample.char_id, Sample.material_id)
        .where(Sample.spc_status == "pending_spc")
        .order_by(Sample.id)
    )
    result = await session.execute(stmt)
    rows = result.all()

    if not rows:
        logger.info("No pending SPC evaluations to recover")
        return 0

    # Group by (characteristic_id, material_id)
    groups: dict[tuple[int, int | None], list[int]] = defaultdict(list)
    for row in rows:
        groups[(row.char_id, row.material_id)].append(row.id)

    enqueued = 0

    for (char_id, material_id), sample_ids in groups.items():
        if use_spc_queue:
            try:
                from cassini.core.engine.spc_queue import SPCEvaluationRequest

                spc_queue.enqueue_nowait(SPCEvaluationRequest(
                    characteristic_id=char_id,
                    sample_ids=sample_ids,
                    material_id=material_id,
                ))
            except asyncio.QueueFull:
                logger.error(
                    "spc_recovery_queue_full",
                    char_id=char_id,
                    pending=len(sample_ids),
                )
                break
        elif use_task_queue:
            try:
                await task_queue.enqueue({
                    "characteristic_id": char_id,
                    "sample_ids": sample_ids,
                    "material_id": material_id,
                    "recovery": True,
                })
            except Exception:
                logger.exception(
                    "spc_recovery_task_queue_failed",
                    char_id=char_id,
                    pending=len(sample_ids),
                )
                break

        enqueued += 1

    logger.info(
        "spc_recovery_complete",
        groups=enqueued,
        total_samples=len(rows),
        target="task_queue" if use_task_queue else "spc_queue",
    )
    return enqueued
