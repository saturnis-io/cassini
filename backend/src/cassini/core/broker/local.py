"""Local (in-process) broker implementations. Default for single-node deployments."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable

from cassini.core.broker.interfaces import QueueStats

logger = logging.getLogger(__name__)


class LocalTaskQueue:
    """In-process task queue backed by asyncio.Queue."""

    def __init__(self, maxsize: int = 10000):
        self._queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=maxsize)
        self._enqueued = 0
        self._dequeued = 0
        self._errors = 0

    async def start(self) -> None:
        pass  # No setup needed for in-process queue

    async def enqueue(self, item: dict) -> None:
        self._queue.put_nowait(item)
        self._enqueued += 1

    async def dequeue(self, timeout: float = 1.0) -> dict | None:
        try:
            item = await asyncio.wait_for(self._queue.get(), timeout=timeout)
            self._dequeued += 1
            return item
        except asyncio.TimeoutError:
            return None

    async def stats(self) -> QueueStats:
        return QueueStats(
            pending=self._queue.qsize(),
            enqueued_total=self._enqueued,
            dequeued_total=self._dequeued,
            errors_total=self._errors,
            healthy=True,
        )

    async def shutdown(self, timeout: float = 10.0) -> None:
        pass  # In-process queue doesn't need cleanup


class LocalEventBus:
    """In-process pub/sub event bus."""

    def __init__(self):
        self._handlers: dict[str, list[Callable[[dict], Awaitable[None]]]] = {}

    async def publish(self, event_type: str, payload: dict) -> None:
        handlers = self._handlers.get(event_type, [])
        for handler in handlers:
            try:
                await handler(payload)
            except Exception:
                logger.exception("Event handler failed for %s", event_type)

    async def subscribe(
        self, event_type: str, handler: Callable[[dict], Awaitable[None]]
    ) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    async def unsubscribe(
        self, event_type: str, handler: Callable[[dict], Awaitable[None]]
    ) -> None:
        handlers = self._handlers.get(event_type, [])
        if handler in handlers:
            handlers.remove(handler)

    async def shutdown(self) -> None:
        self._handlers.clear()


class LocalBroadcast:
    """In-process broadcast channel (single-node, no cross-node fan-out)."""

    def __init__(self):
        self._handlers: dict[str, list[Callable[[dict], Awaitable[None]]]] = {}

    async def broadcast(self, channel: str, message: dict) -> None:
        handlers = self._handlers.get(channel, [])
        for handler in handlers:
            try:
                await handler(message)
            except Exception:
                logger.exception("Broadcast handler failed for %s", channel)

    async def subscribe(
        self, channel: str, handler: Callable[[dict], Awaitable[None]]
    ) -> None:
        self._handlers.setdefault(channel, []).append(handler)

    async def unsubscribe(self, channel: str) -> None:
        self._handlers.pop(channel, None)

    async def shutdown(self) -> None:
        self._handlers.clear()
