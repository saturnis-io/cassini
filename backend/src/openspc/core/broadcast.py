"""WebSocket broadcaster for real-time SPC event broadcasting.

This module provides WebSocketBroadcaster that bridges the Event Bus and WebSocket
infrastructure. It subscribes to domain events and broadcasts them to connected
WebSocket clients in real-time.

The broadcaster implements the AlertNotifier protocol for integration with AlertManager
and subscribes to the Event Bus for other event types like sample processing and
control limit updates.
"""

import logging
from typing import TYPE_CHECKING

from openspc.core.alerts.manager import ViolationAcknowledged, ViolationCreated
from openspc.core.events import (
    ControlLimitsUpdatedEvent,
    EventBus,
    SampleProcessedEvent,
)

if TYPE_CHECKING:
    from openspc.api.v1.websocket import ConnectionManager

logger = logging.getLogger(__name__)


class WebSocketBroadcaster:
    """Broadcasts SPC events to WebSocket clients.

    This class acts as a bridge between the internal event bus and external
    WebSocket clients. It subscribes to various domain events and broadcasts
    them to subscribed clients in real-time.

    The broadcaster implements the AlertNotifier protocol for integration with
    AlertManager (handling violation creation and acknowledgment) and subscribes
    to the Event Bus for other event types.

    Attributes:
        _manager: WebSocket connection manager for broadcasting
        _event_bus: Event bus for subscribing to domain events

    Example:
        >>> from openspc.core.events import event_bus
        >>> from openspc.api.v1.websocket import manager as ws_manager
        >>>
        >>> broadcaster = WebSocketBroadcaster(ws_manager, event_bus)
        >>> # Broadcaster is now listening for events and will broadcast them
    """

    def __init__(
        self,
        connection_manager: "ConnectionManager",
        event_bus: EventBus,
    ):
        """Initialize the WebSocket broadcaster.

        Args:
            connection_manager: WebSocket connection manager instance
            event_bus: Event bus instance for event subscriptions
        """
        self._manager = connection_manager
        self._event_bus = event_bus
        self._setup_subscriptions()
        logger.info("WebSocketBroadcaster initialized")

    def _setup_subscriptions(self) -> None:
        """Subscribe to Event Bus events.

        Sets up subscriptions for:
        - SampleProcessedEvent: Broadcast sample updates to subscribed clients
        - ControlLimitsUpdatedEvent: Broadcast limit changes to subscribed clients

        Note: ViolationCreated and ViolationAcknowledged events are handled via
        the AlertNotifier protocol methods (notify_violation_created and
        notify_violation_acknowledged).
        """
        self._event_bus.subscribe(SampleProcessedEvent, self._on_sample_processed)
        self._event_bus.subscribe(
            ControlLimitsUpdatedEvent, self._on_limits_updated
        )
        logger.debug(
            "Subscribed to SampleProcessedEvent and ControlLimitsUpdatedEvent"
        )

    async def _on_sample_processed(self, event: SampleProcessedEvent) -> None:
        """Broadcast sample processing event to subscribed WebSocket clients.

        Converts the internal SampleProcessedEvent to a WebSocket message format
        and broadcasts it to all clients subscribed to the characteristic.

        Args:
            event: Sample processed event from the Event Bus

        Message Format:
            {
                "type": "sample",
                "payload": {
                    "sample_id": int,
                    "characteristic_id": int,
                    "timestamp": str (ISO format),
                    "value": float,
                    "zone": str,
                    "in_control": bool
                }
            }
        """
        message = {
            "type": "sample",
            "payload": {
                "sample_id": event.sample_id,
                "characteristic_id": event.characteristic_id,
                "timestamp": event.timestamp.isoformat(),
                "value": event.mean,
                "zone": event.zone,
                "in_control": event.in_control,
            },
        }

        logger.debug(
            f"Broadcasting sample {event.sample_id} for characteristic "
            f"{event.characteristic_id} to subscribed clients"
        )

        await self._manager.broadcast_to_characteristic(
            event.characteristic_id, message
        )

    async def _on_limits_updated(self, event: ControlLimitsUpdatedEvent) -> None:
        """Broadcast control limit update event to subscribed clients.

        Converts the internal ControlLimitsUpdatedEvent to a WebSocket message
        format and broadcasts it to all clients subscribed to the characteristic.

        Args:
            event: Control limits updated event from the Event Bus

        Message Format:
            {
                "type": "control_limits",
                "payload": {
                    "characteristic_id": int,
                    "center_line": float,
                    "ucl": float,
                    "lcl": float,
                    "method": str,
                    "sample_count": int
                }
            }
        """
        message = {
            "type": "control_limits",
            "payload": {
                "characteristic_id": event.characteristic_id,
                "center_line": event.center_line,
                "ucl": event.ucl,
                "lcl": event.lcl,
                "method": event.method,
                "sample_count": event.sample_count,
            },
        }

        logger.debug(
            f"Broadcasting control limits update for characteristic "
            f"{event.characteristic_id} to subscribed clients"
        )

        await self._manager.broadcast_to_characteristic(
            event.characteristic_id, message
        )

    # AlertNotifier protocol implementation

    async def notify_violation_created(self, event: ViolationCreated) -> None:
        """Broadcast new violation to WebSocket clients.

        Implements the AlertNotifier protocol method for violation creation.
        Broadcasts the violation to all clients subscribed to the characteristic.

        Args:
            event: ViolationCreated event from AlertManager

        Message Format:
            {
                "type": "violation",
                "payload": {
                    "violation_id": int,
                    "sample_id": int,
                    "characteristic_id": int,
                    "rule_id": int,
                    "rule_name": str,
                    "severity": str,
                    "timestamp": str (ISO format)
                }
            }
        """
        message = {
            "type": "violation",
            "payload": {
                "violation_id": event.violation_id,
                "sample_id": event.sample_id,
                "characteristic_id": event.characteristic_id,
                "rule_id": event.rule_id,
                "rule_name": event.rule_name,
                "severity": event.severity,
                "timestamp": event.timestamp.isoformat(),
            },
        }

        logger.info(
            f"Broadcasting violation {event.violation_id} (Rule {event.rule_id}: "
            f"{event.rule_name}) for characteristic {event.characteristic_id}"
        )

        await self._manager.broadcast_to_characteristic(
            event.characteristic_id, message
        )

    async def notify_violation_acknowledged(
        self, event: ViolationAcknowledged
    ) -> None:
        """Broadcast acknowledgment update to all WebSocket clients.

        Implements the AlertNotifier protocol method for violation acknowledgment.
        Broadcasts the acknowledgment to ALL connected clients (not just subscribers
        of a specific characteristic) because acknowledgments are important for
        everyone to see.

        Args:
            event: ViolationAcknowledged event from AlertManager

        Message Format:
            {
                "type": "ack_update",
                "payload": {
                    "violation_id": int,
                    "acknowledged": bool,
                    "user": str,
                    "reason": str,
                    "timestamp": str (ISO format)
                }
            }
        """
        message = {
            "type": "ack_update",
            "payload": {
                "violation_id": event.violation_id,
                "acknowledged": True,
                "user": event.user,
                "reason": event.reason,
                "timestamp": event.timestamp.isoformat(),
            },
        }

        logger.info(
            f"Broadcasting acknowledgment for violation {event.violation_id} "
            f"by {event.user} to all connected clients"
        )

        # Broadcast to all clients (acknowledgments are important for everyone)
        await self._manager.broadcast_to_all(message)


__all__ = ["WebSocketBroadcaster"]
