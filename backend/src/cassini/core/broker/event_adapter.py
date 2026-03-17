"""Adapter bridging typed Python event classes to string-topic EventBusInterface.

Existing codebase uses: event_bus.subscribe(SampleProcessedEvent, handler)
New broker uses:        event_bus.subscribe("sample.processed", handler)

This adapter provides both interfaces. Register type-to-topic mappings, then use
either the typed API (backwards compatible) or the string API.
"""
from __future__ import annotations

import dataclasses
import logging
from typing import Any, Awaitable, Callable, Type

from cassini.core.broker.interfaces import EventBusInterface

logger = logging.getLogger(__name__)


class TypedEventBusAdapter:
    """Bridges typed event classes to the string-topic EventBusInterface."""

    def __init__(self, inner: EventBusInterface):
        self._inner = inner
        self._type_to_topic: dict[Type, str] = {}
        self._topic_to_type: dict[str, Type] = {}

    def register_event_type(self, event_class: Type, topic: str) -> None:
        """Register a mapping from a Python event class to a string topic."""
        self._type_to_topic[event_class] = topic
        self._topic_to_type[topic] = event_class

    async def publish(self, event: Any) -> None:
        """Publish a typed event. Serializes to dict for the inner bus."""
        event_type = type(event)
        topic = self._type_to_topic.get(event_type)
        if topic is None:
            logger.warning(
                "No topic registered for event type %s", event_type.__name__
            )
            return
        if dataclasses.is_dataclass(event):
            payload = dataclasses.asdict(event)
        elif hasattr(event, "__dict__"):
            payload = event.__dict__.copy()
        else:
            payload = {"value": event}
        payload["__event_type__"] = event_type.__name__
        await self._inner.publish(topic, payload)

    async def subscribe(
        self, event_type_or_topic: Any, handler: Callable
    ) -> None:
        """Subscribe to events. Accepts either a type class or a string topic."""
        if isinstance(event_type_or_topic, str):
            await self._inner.subscribe(event_type_or_topic, handler)
            return

        topic = self._type_to_topic.get(event_type_or_topic)
        if topic is None:
            logger.warning(
                "No topic registered for %s", event_type_or_topic.__name__
            )
            return

        event_class = event_type_or_topic

        async def typed_handler(payload: dict) -> None:
            clean = {k: v for k, v in payload.items() if k != "__event_type__"}
            try:
                event = event_class(**clean)
            except Exception:
                event = payload
            await handler(event)

        await self._inner.subscribe(topic, typed_handler)

    async def unsubscribe(
        self, event_type_or_topic: Any, handler: Callable
    ) -> None:
        """Unsubscribe from events."""
        if isinstance(event_type_or_topic, str):
            await self._inner.unsubscribe(event_type_or_topic, handler)
            return
        logger.warning("Typed unsubscribe not yet implemented")

    async def publish_and_wait(self, event: Any) -> None:
        """Publish and wait for all handlers. For backwards compatibility."""
        await self.publish(event)

    async def shutdown(self) -> None:
        await self._inner.shutdown()
