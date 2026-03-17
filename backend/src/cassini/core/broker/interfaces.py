"""Broker abstraction interfaces for cluster-ready Cassini.

Two implementations:
- Local (in-process): asyncio.Queue, in-memory pub/sub, local WebSocket — default
- Valkey: Redis-compatible distributed queue, streams, pub/sub — Enterprise cluster mode
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Protocol, runtime_checkable


@dataclass(frozen=True)
class QueueStats:
    pending: int
    enqueued_total: int
    dequeued_total: int
    errors_total: int
    healthy: bool


@runtime_checkable
class TaskQueue(Protocol):
    """Distributed task queue for SPC evaluation requests."""

    async def enqueue(self, item: dict) -> None: ...
    async def dequeue(self, timeout: float = 1.0) -> dict | None: ...
    async def stats(self) -> QueueStats: ...
    async def start(self) -> None: ...
    async def shutdown(self, timeout: float = 10.0) -> None: ...


@runtime_checkable
class EventBusInterface(Protocol):
    """Pub/sub event bus for domain events."""

    async def publish(self, event_type: str, payload: dict) -> None: ...
    async def subscribe(
        self, event_type: str, handler: Callable[[dict], Awaitable[None]]
    ) -> None: ...
    async def unsubscribe(
        self, event_type: str, handler: Callable[[dict], Awaitable[None]]
    ) -> None: ...
    async def shutdown(self) -> None: ...


@runtime_checkable
class BroadcastChannel(Protocol):
    """Cross-node broadcast for WebSocket fan-out."""

    async def broadcast(self, channel: str, message: dict) -> None: ...
    async def subscribe(
        self, channel: str, handler: Callable[[dict], Awaitable[None]]
    ) -> None: ...
    async def unsubscribe(self, channel: str) -> None: ...
    async def shutdown(self) -> None: ...
