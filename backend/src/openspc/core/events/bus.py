"""Asynchronous event bus for decoupled component communication.

The EventBus provides a publish-subscribe pattern for internal events,
enabling loose coupling between different parts of the application.

Key features:
- Type-safe event subscription based on event classes
- Multiple handlers per event type
- Async handlers that don't block publishers
- Error isolation - one handler failure doesn't affect others
- Optional synchronous waiting for all handlers to complete
"""

import asyncio
import structlog
from collections.abc import Awaitable, Callable
from typing import Type

from openspc.core.events.events import Event

# Type alias for event handler functions
EventHandler = Callable[[Event], Awaitable[None]]

logger = structlog.get_logger(__name__)


class EventBus:
    """Asynchronous event bus for internal communication.

    The EventBus allows components to communicate without direct dependencies.
    Publishers emit events without knowing who will handle them, and subscribers
    register handlers for specific event types.

    Example:
        >>> bus = EventBus()
        >>>
        >>> # Subscribe to events
        >>> async def on_sample_processed(event: SampleProcessedEvent):
        ...     print(f"Sample {event.sample_id} processed")
        >>>
        >>> bus.subscribe(SampleProcessedEvent, on_sample_processed)
        >>>
        >>> # Publish events (non-blocking)
        >>> await bus.publish(SampleProcessedEvent(
        ...     sample_id=1,
        ...     characteristic_id=1,
        ...     mean=10.5,
        ...     range_value=None,
        ...     zone="zone_c_upper",
        ...     in_control=True
        ... ))

    Thread Safety:
        This implementation is designed for use within a single async event loop.
        For multi-threaded usage, external synchronization would be required.
    """

    def __init__(self) -> None:
        """Initialize the event bus."""
        self._handlers: dict[Type[Event], list[EventHandler]] = {}
        self._running_tasks: set[asyncio.Task[None]] = set()

    def subscribe(self, event_type: Type[Event], handler: EventHandler) -> None:
        """Subscribe a handler to an event type.

        The handler will be invoked whenever an event of the specified type
        is published. Multiple handlers can subscribe to the same event type.

        Args:
            event_type: The event class to subscribe to
            handler: Async function to handle the event

        Example:
            >>> async def log_violation(event: ViolationCreatedEvent):
            ...     logger.info(f"Violation {event.violation_id} created")
            >>>
            >>> bus.subscribe(ViolationCreatedEvent, log_violation)
        """
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)
        logger.debug(
            "handler_subscribed",
            handler=handler.__name__,
            event_type=event_type.__name__,
        )

    def unsubscribe(self, event_type: Type[Event], handler: EventHandler) -> None:
        """Unsubscribe a handler from an event type.

        Removes the specified handler from the event type's subscriber list.
        If the handler was not subscribed, this is a no-op.

        Args:
            event_type: The event class to unsubscribe from
            handler: The handler to remove

        Example:
            >>> bus.unsubscribe(ViolationCreatedEvent, log_violation)
        """
        if event_type in self._handlers:
            self._handlers[event_type] = [
                h for h in self._handlers[event_type] if h != handler
            ]
            logger.debug(
                "handler_unsubscribed",
                handler=handler.__name__,
                event_type=event_type.__name__,
            )

    async def publish(self, event: Event) -> None:
        """Publish an event to all subscribed handlers.

        Handlers are invoked asynchronously and do not block the publisher.
        Errors in handlers are caught and logged but do not propagate.

        Args:
            event: The event to publish

        Example:
            >>> await bus.publish(SampleProcessedEvent(
            ...     sample_id=1,
            ...     characteristic_id=1,
            ...     mean=10.5,
            ...     range_value=None,
            ...     zone="zone_c_upper",
            ...     in_control=True
            ... ))

        Note:
            This method returns immediately after creating handler tasks.
            Use publish_and_wait() if you need to ensure all handlers complete.
        """
        event_type = type(event)
        handlers = self._handlers.get(event_type, [])

        if handlers:
            logger.debug(
                "publishing_event",
                event_type=event_type.__name__,
                handler_count=len(handlers),
            )

        for handler in handlers:
            task = asyncio.create_task(self._safe_invoke(handler, event))
            self._running_tasks.add(task)
            task.add_done_callback(self._running_tasks.discard)

    async def publish_and_wait(self, event: Event) -> list[Exception]:
        """Publish an event and wait for all handlers to complete.

        Unlike publish(), this method waits for all handlers to finish
        before returning. This is useful when you need to ensure event
        processing is complete before proceeding.

        Args:
            event: The event to publish

        Returns:
            List of exceptions from failed handlers (empty if all succeeded)

        Example:
            >>> errors = await bus.publish_and_wait(
            ...     ControlLimitsUpdatedEvent(
            ...         characteristic_id=1,
            ...         center_line=100.0,
            ...         ucl=103.0,
            ...         lcl=97.0
            ...     )
            ... )
            >>> if errors:
            ...     logger.error(f"{len(errors)} handler(s) failed")
        """
        event_type = type(event)
        handlers = self._handlers.get(event_type, [])

        if handlers:
            logger.debug(
                "publishing_event_sync",
                event_type=event_type.__name__,
                handler_count=len(handlers),
            )

        tasks = [
            asyncio.create_task(self._safe_invoke_with_result(handler, event))
            for handler in handlers
        ]

        results = await asyncio.gather(*tasks)
        errors = [r for r in results if r is not None]

        if errors:
            logger.warning(
                "handlers_failed",
                failed=len(errors),
                total=len(handlers),
                event_type=event_type.__name__,
            )

        return errors

    async def _safe_invoke(self, handler: EventHandler, event: Event) -> None:
        """Invoke handler with error isolation.

        Catches and logs any exceptions from the handler to prevent
        one failing handler from affecting others.

        Args:
            handler: The handler function to invoke
            event: The event to pass to the handler
        """
        try:
            await handler(event)
        except Exception as e:
            logger.error(
                "event_handler_failed",
                handler=handler.__name__,
                event_type=type(event).__name__,
                error=str(e),
                exc_info=True,
            )

    async def _safe_invoke_with_result(
        self, handler: EventHandler, event: Event
    ) -> Exception | None:
        """Invoke handler and return exception if any.

        Used by publish_and_wait() to collect handler failures.

        Args:
            handler: The handler function to invoke
            event: The event to pass to the handler

        Returns:
            Exception if handler failed, None if successful
        """
        try:
            await handler(event)
            return None
        except Exception as e:
            logger.error(
                "event_handler_failed",
                handler=handler.__name__,
                event_type=type(event).__name__,
                error=str(e),
                exc_info=True,
            )
            return e

    async def shutdown(self) -> None:
        """Wait for all pending tasks to complete.

        Should be called during application shutdown to ensure
        all event handlers have completed processing.

        Example:
            >>> # During application shutdown
            >>> await bus.shutdown()
        """
        if self._running_tasks:
            logger.info("waiting_for_handlers", count=len(self._running_tasks))
            await asyncio.gather(*self._running_tasks, return_exceptions=True)
            logger.info("All event handlers completed")

    def get_handler_count(self, event_type: Type[Event]) -> int:
        """Get the number of handlers subscribed to an event type.

        Useful for testing and debugging.

        Args:
            event_type: The event class to query

        Returns:
            Number of subscribed handlers

        Example:
            >>> count = bus.get_handler_count(SampleProcessedEvent)
            >>> print(f"{count} handler(s) subscribed")
        """
        return len(self._handlers.get(event_type, []))

    def clear_handlers(self, event_type: Type[Event] | None = None) -> None:
        """Clear handlers for an event type or all event types.

        Primarily useful for testing to reset handler state between tests.

        Args:
            event_type: Event type to clear handlers for, or None to clear all

        Example:
            >>> # Clear all handlers
            >>> bus.clear_handlers()
            >>>
            >>> # Clear handlers for specific event
            >>> bus.clear_handlers(SampleProcessedEvent)
        """
        if event_type is None:
            self._handlers.clear()
            logger.debug("Cleared all event handlers")
        else:
            self._handlers.pop(event_type, None)
            logger.debug("handlers_cleared", event_type=event_type.__name__)


# Global event bus instance
# Components can import and use this directly, or use dependency injection
event_bus = EventBus()
