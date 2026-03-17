"""Valkey/Redis broker implementations for cluster mode.

Uses redis-py async client. Only imported when broker_url is set (lazy import in factory).
Requires: pip install cassini[cluster] or pip install redis[hiredis]>=5.0
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
from typing import Any, Awaitable, Callable

from cassini.core.broker.interfaces import QueueStats

logger = logging.getLogger(__name__)

# Namespace prefix for all Valkey keys
_KEY_PREFIX = "cassini"


def _node_id() -> str:
    """Generate a node-unique identity: {hostname}:{pid}."""
    return f"{socket.gethostname()}:{os.getpid()}"


class ValkeyTaskQueue:
    """Task queue backed by Valkey Lists + BRPOP.

    Enqueue: LPUSH cassini:{ns}:spc_queue <json>
    Dequeue: BRPOP cassini:{ns}:spc_queue <timeout>
    """

    def __init__(self, broker_url: str, namespace: str = "default", connect: bool = True):
        import redis.asyncio as aioredis

        self._url = broker_url
        self._namespace = namespace
        self._key = f"{_KEY_PREFIX}:{namespace}:spc_queue"
        self._client: aioredis.Redis | None = None
        self._enqueued = 0
        self._dequeued = 0
        self._errors = 0
        self._connected = False
        if connect:
            self._client = aioredis.from_url(broker_url, decode_responses=True)

    async def start(self) -> None:
        if self._client:
            await self._client.ping()
            self._connected = True

    async def enqueue(self, item: dict) -> None:
        if not self._client:
            raise RuntimeError("ValkeyTaskQueue not connected")
        await self._client.lpush(self._key, json.dumps(item))
        self._enqueued += 1

    async def dequeue(self, timeout: float = 1.0) -> dict | None:
        if not self._client:
            raise RuntimeError("ValkeyTaskQueue not connected")
        result = await self._client.brpop(self._key, timeout=int(max(timeout, 1)))
        if result is None:
            return None
        _key, value = result
        self._dequeued += 1
        return json.loads(value)

    async def stats(self) -> QueueStats:
        pending = 0
        if self._client:
            try:
                pending = await self._client.llen(self._key)
            except Exception:
                pass
        return QueueStats(
            pending=pending,
            enqueued_total=self._enqueued,
            dequeued_total=self._dequeued,
            errors_total=self._errors,
            healthy=self._connected,
        )

    async def shutdown(self, timeout: float = 10.0) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
            self._connected = False


class ValkeyEventBus:
    """Event bus backed by Valkey Streams + consumer groups.

    Publish: XADD cassini:{ns}:events:{topic} * payload
    Subscribe: XREADGROUP GROUP cassini_consumers {node_id} ...
    """

    def __init__(self, broker_url: str, namespace: str = "default", connect: bool = True):
        import redis.asyncio as aioredis

        self._url = broker_url
        self._namespace = namespace
        self._client: aioredis.Redis | None = None
        self._handlers: dict[str, list[Callable[[dict], Awaitable[None]]]] = {}
        self._consumer_tasks: dict[str, asyncio.Task] = {}
        self._running = False
        self._node_id = _node_id()
        self._group_name = "cassini_consumers"
        if connect:
            self._client = aioredis.from_url(broker_url, decode_responses=True)

    def _stream_key(self, event_type: str) -> str:
        return f"{_KEY_PREFIX}:{self._namespace}:events:{event_type}"

    async def publish(self, event_type: str, payload: dict) -> None:
        if not self._client:
            raise RuntimeError("ValkeyEventBus not connected")
        stream_key = self._stream_key(event_type)
        await self._client.xadd(stream_key, {"data": json.dumps(payload)})

    async def subscribe(
        self, event_type: str, handler: Callable[[dict], Awaitable[None]]
    ) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

        if not self._client:
            return

        stream_key = self._stream_key(event_type)

        # Create consumer group if it doesn't exist
        try:
            await self._client.xgroup_create(stream_key, self._group_name, id="0", mkstream=True)
        except Exception as e:
            # BUSYGROUP means group already exists — expected and safe to ignore.
            # Other errors (NOAUTH, NOPERM, OOM) are logged but not fatal here,
            # as the consumer loop will surface them on xreadgroup.
            if "BUSYGROUP" not in str(e):
                logger.warning("xgroup_create for %s: %s", event_type, e)

        # Start consumer task if not already running for this topic
        if event_type not in self._consumer_tasks:
            self._running = True
            self._consumer_tasks[event_type] = asyncio.create_task(
                self._consume_stream(event_type)
            )

    async def _consume_stream(self, event_type: str) -> None:
        stream_key = self._stream_key(event_type)
        while self._running and self._client:
            try:
                results = await self._client.xreadgroup(
                    self._group_name,
                    self._node_id,
                    {stream_key: ">"},
                    count=10,
                    block=1000,
                )
                if not results:
                    continue
                for _stream, messages in results:
                    for msg_id, fields in messages:
                        payload = json.loads(fields.get("data", "{}"))
                        handlers = self._handlers.get(event_type, [])
                        any_succeeded = False
                        for handler in handlers:
                            try:
                                await handler(payload)
                                any_succeeded = True
                            except Exception:
                                logger.exception("Event handler failed for %s", event_type)
                        # Only ACK if at least one handler succeeded (preserves at-least-once delivery)
                        if any_succeeded or not handlers:
                            await self._client.xack(stream_key, self._group_name, msg_id)
                        else:
                            logger.warning("All handlers failed for %s msg %s — not ACKing for retry", event_type, msg_id)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Stream consumer error for %s", event_type)
                await asyncio.sleep(1)

    async def unsubscribe(
        self, event_type: str, handler: Callable[[dict], Awaitable[None]]
    ) -> None:
        handlers = self._handlers.get(event_type, [])
        if handler in handlers:
            handlers.remove(handler)

    async def shutdown(self) -> None:
        self._running = False
        for task in self._consumer_tasks.values():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._consumer_tasks.clear()
        self._handlers.clear()
        if self._client:
            await self._client.aclose()
            self._client = None


class ValkeyBroadcast:
    """Broadcast channel backed by Valkey Pub/Sub.

    Broadcast: PUBLISH cassini:{ns}:broadcast:{channel} <json>
    Subscribe: SUBSCRIBE cassini:{ns}:broadcast:{channel}
    """

    def __init__(self, broker_url: str, namespace: str = "default", connect: bool = True):
        import redis.asyncio as aioredis

        self._url = broker_url
        self._namespace = namespace
        self._client: aioredis.Redis | None = None
        self._pubsub: Any = None
        self._handlers: dict[str, list[Callable[[dict], Awaitable[None]]]] = {}
        self._listener_task: asyncio.Task | None = None
        self._running = False
        if connect:
            self._client = aioredis.from_url(broker_url, decode_responses=True)

    def _channel_key(self, channel: str) -> str:
        return f"{_KEY_PREFIX}:{self._namespace}:broadcast:{channel}"

    async def broadcast(self, channel: str, message: dict) -> None:
        if not self._client:
            raise RuntimeError("ValkeyBroadcast not connected")
        await self._client.publish(self._channel_key(channel), json.dumps(message))

    async def subscribe(
        self, channel: str, handler: Callable[[dict], Awaitable[None]]
    ) -> None:
        self._handlers.setdefault(channel, []).append(handler)

        if not self._client:
            return

        if self._pubsub is None:
            self._pubsub = self._client.pubsub()

        await self._pubsub.subscribe(self._channel_key(channel))

        if self._listener_task is None:
            self._running = True
            self._listener_task = asyncio.create_task(self._listen())

    async def _listen(self) -> None:
        while self._running and self._pubsub:
            try:
                message = await self._pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if message and message["type"] == "message":
                    # Extract channel name from the full key
                    full_channel = message["channel"]
                    prefix = f"{_KEY_PREFIX}:{self._namespace}:broadcast:"
                    if full_channel.startswith(prefix):
                        channel = full_channel[len(prefix) :]
                    else:
                        channel = full_channel

                    payload = json.loads(message["data"])
                    handlers = self._handlers.get(channel, [])
                    for handler in handlers:
                        try:
                            await handler(payload)
                        except Exception:
                            logger.exception("Broadcast handler failed")
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Broadcast listener error")
                await asyncio.sleep(1)

    async def unsubscribe(self, channel: str) -> None:
        if self._pubsub:
            await self._pubsub.unsubscribe(self._channel_key(channel))
        self._handlers.pop(channel, None)

    async def shutdown(self) -> None:
        self._running = False
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        try:
            if self._pubsub:
                await self._pubsub.aclose()
        except Exception:
            logger.exception("Error closing pubsub")
        finally:
            try:
                if self._client:
                    await self._client.aclose()
            except Exception:
                logger.exception("Error closing broadcast client")
        self._handlers.clear()
