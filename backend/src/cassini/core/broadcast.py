"""WebSocket broadcaster for real-time SPC event broadcasting.

This module provides WebSocketBroadcaster that bridges the Event Bus and WebSocket
infrastructure. It subscribes to domain events and broadcasts them to connected
WebSocket clients in real-time.

The broadcaster implements the AlertNotifier protocol for integration with AlertManager
and subscribes to the Event Bus for other event types like sample processing and
control limit updates.

In cluster mode, an optional BroadcastChannel provides cross-node fan-out:
events originating on one node are published to the channel and received by
all other nodes, which rebroadcast them to their local WebSocket clients.
"""

import asyncio
import structlog
from typing import Any, TYPE_CHECKING

from cassini.core.alerts.manager import ViolationAcknowledged, ViolationCreated
from cassini.core.events import (
    AnomalyDetectedEvent,
    CharacteristicUpdatedEvent,
    ControlLimitsUpdatedEvent,
    EventBus,
    SampleProcessedEvent,
)

if TYPE_CHECKING:
    from cassini.api.v1.websocket import ConnectionManager
    from cassini.core.broker.interfaces import BroadcastChannel

logger = structlog.get_logger(__name__)

# Channel name for cross-node WebSocket fan-out
_WS_BROADCAST_CHANNEL = "cassini:ws:fanout"


class WebSocketBroadcaster:
    """Broadcasts SPC events to WebSocket clients.

    This class acts as a bridge between the internal event bus and external
    WebSocket clients. It subscribes to various domain events and broadcasts
    them to subscribed clients in real-time.

    The broadcaster implements the AlertNotifier protocol for integration with
    AlertManager (handling violation creation and acknowledgment) and subscribes
    to the Event Bus for other event types.

    When a ``broadcast_channel`` is provided (cluster mode), every message
    sent to local WebSocket clients is also published to the channel.
    Messages arriving from the channel are rebroadcast to local clients
    only (no re-publish to prevent infinite loops).

    Attributes:
        _manager: WebSocket connection manager for broadcasting
        _event_bus: Event bus for subscribing to domain events
        _broadcast_channel: Optional BroadcastChannel for cross-node fan-out

    Example:
        >>> from cassini.core.events import event_bus
        >>> from cassini.api.v1.websocket import manager as ws_manager
        >>>
        >>> broadcaster = WebSocketBroadcaster(ws_manager, event_bus)
        >>> # Broadcaster is now listening for events and will broadcast them
    """

    def __init__(
        self,
        connection_manager: "ConnectionManager",
        event_bus: EventBus,
        broadcast_channel: "BroadcastChannel | None" = None,
    ):
        """Initialize the WebSocket broadcaster.

        Args:
            connection_manager: WebSocket connection manager instance
            event_bus: Event bus instance for event subscriptions
            broadcast_channel: Optional BroadcastChannel for cross-node fan-out.
                When provided, messages are published to the channel and
                incoming messages from other nodes are rebroadcast locally.
        """
        self._manager = connection_manager
        self._event_bus = event_bus
        self._broadcast_channel = broadcast_channel
        self._setup_subscriptions()

        if broadcast_channel is not None:
            self._setup_broadcast_listener()
            logger.info("WebSocketBroadcaster initialized (cluster fan-out enabled)")
        else:
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
        self._event_bus.subscribe(AnomalyDetectedEvent, self._on_anomaly_detected)
        self._event_bus.subscribe(CharacteristicUpdatedEvent, self._on_characteristic_updated)
        logger.debug(
            "Subscribed to SampleProcessedEvent, ControlLimitsUpdatedEvent, "
            "AnomalyDetectedEvent, and CharacteristicUpdatedEvent"
        )

    def _setup_broadcast_listener(self) -> None:
        """Subscribe to the BroadcastChannel for cross-node messages.

        Messages from other nodes are rebroadcast to LOCAL WebSocket clients
        only (not re-published to the channel, to prevent infinite loops).
        """

        async def _on_remote_message(message: dict) -> None:
            """Handle a message received from the BroadcastChannel (another node).

            ``broadcast_to_characteristic`` is intrinsically plant-scoped because
            local subscriptions are plant-authorized at subscribe time. For
            ``ack_update`` (broadcast-to-all class) we honour the embedded
            ``plant_id`` so cross-node fan-out does not leak across tenants.
            """
            msg_type = message.get("type")
            char_id = message.get("characteristic_id")

            if char_id is not None:
                await self._manager.broadcast_to_characteristic(char_id, message)
            elif msg_type == "ack_update":
                await self._manager.broadcast_to_all(
                    message, plant_id=message.get("plant_id")
                )
            else:
                logger.debug("broadcast_remote_unroutable", message_type=msg_type)

        # Schedule the async subscribe on the event loop
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(
                self._broadcast_channel.subscribe(
                    _WS_BROADCAST_CHANNEL, _on_remote_message
                )
            )
        except RuntimeError:
            logger.warning("No running event loop; broadcast listener not started")

    async def _publish_to_broadcast(self, message: dict) -> None:
        """Publish a message to the BroadcastChannel for cross-node fan-out.

        Called after sending to local clients. Only active in cluster mode.
        """
        if self._broadcast_channel is None:
            return
        try:
            await self._broadcast_channel.broadcast(
                _WS_BROADCAST_CHANNEL, message
            )
        except Exception:
            logger.exception("broadcast_channel_publish_failed")

    async def _on_sample_processed(self, event: SampleProcessedEvent) -> None:
        """Broadcast sample processing event to subscribed WebSocket clients.

        Converts the internal SampleProcessedEvent to a WebSocket message format
        and broadcasts it to all clients subscribed to the characteristic.

        Args:
            event: Sample processed event from the Event Bus

        Message Format:
            {
                "type": "sample",
                "characteristic_id": int,
                "sample": {
                    "id": int,
                    "characteristic_id": int,
                    "timestamp": str (ISO format),
                    "mean": float,
                    "zone": str,
                    "in_control": bool
                },
                "violations": []
            }
        """
        message = {
            "type": "sample",
            "characteristic_id": event.characteristic_id,
            "sample": {
                "id": event.sample_id,
                "characteristic_id": event.characteristic_id,
                "timestamp": event.timestamp.isoformat(),
                "mean": event.mean,
                "zone": event.zone,
                "in_control": event.in_control,
            },
            "violations": event.violations,
        }

        logger.debug(
            "broadcasting_sample",
            sample_id=event.sample_id,
            characteristic_id=event.characteristic_id,
        )

        await self._manager.broadcast_to_characteristic(
            event.characteristic_id, message
        )
        await self._publish_to_broadcast(message)

    async def _on_limits_updated(self, event: ControlLimitsUpdatedEvent) -> None:
        """Broadcast control limit update event to subscribed clients.

        Converts the internal ControlLimitsUpdatedEvent to a WebSocket message
        format and broadcasts it to all clients subscribed to the characteristic.

        Args:
            event: Control limits updated event from the Event Bus

        Message Format:
            {
                "type": "limits_update",
                "characteristic_id": int,
                "ucl": float,
                "lcl": float,
                "center_line": float
            }
        """
        message = {
            "type": "limits_update",
            "characteristic_id": event.characteristic_id,
            "ucl": event.ucl,
            "lcl": event.lcl,
            "center_line": event.center_line,
        }

        logger.debug(
            "broadcasting_limits_update",
            characteristic_id=event.characteristic_id,
        )

        await self._manager.broadcast_to_characteristic(
            event.characteristic_id, message
        )
        await self._publish_to_broadcast(message)

    async def _on_anomaly_detected(self, event: AnomalyDetectedEvent) -> None:
        message = {
            "type": "anomaly",
            "characteristic_id": event.characteristic_id,
            "event": {
                "id": event.anomaly_event_id,
                "detector_type": event.detector_type,
                "event_type": event.event_type,
                "severity": event.severity,
                "summary": event.summary,
            },
        }
        logger.debug(
            "broadcasting_anomaly",
            anomaly_event_id=event.anomaly_event_id,
            characteristic_id=event.characteristic_id,
        )
        await self._manager.broadcast_to_characteristic(
            event.characteristic_id, message
        )
        await self._publish_to_broadcast(message)

    async def _on_characteristic_updated(self, event: CharacteristicUpdatedEvent) -> None:
        message = {
            "type": "characteristic_update",
            "characteristic_id": event.characteristic_id,
            "changes": event.changes,
        }
        logger.debug(
            "broadcasting_characteristic_update",
            characteristic_id=event.characteristic_id,
        )
        await self._manager.broadcast_to_characteristic(
            event.characteristic_id, message
        )
        await self._publish_to_broadcast(message)

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
                "violation": {
                    "id": int,
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
            "violation": {
                "id": event.violation_id,
                "sample_id": event.sample_id,
                "characteristic_id": event.characteristic_id,
                "rule_id": event.rule_id,
                "rule_name": event.rule_name,
                "severity": event.severity,
                "timestamp": event.timestamp.isoformat(),
            },
        }

        logger.info(
            "broadcasting_violation",
            violation_id=event.violation_id,
            rule_id=event.rule_id,
            rule_name=event.rule_name,
            characteristic_id=event.characteristic_id,
        )

        await self._manager.broadcast_to_characteristic(
            event.characteristic_id, message
        )
        await self._publish_to_broadcast(message)

    async def notify_violation_acknowledged(
        self, event: ViolationAcknowledged
    ) -> None:
        """Broadcast acknowledgment update to WebSocket clients at the plant.

        Implements the AlertNotifier protocol method for violation acknowledgment.
        Broadcasts to all connected clients whose user has a role at the
        violation's plant — never cross-plant. Plant resolution is best-effort
        (via violation -> characteristic -> hierarchy); on failure we drop
        the notification rather than risk leaking it to other tenants.

        Args:
            event: ViolationAcknowledged event from AlertManager

        Message Format:
            {
                "type": "ack_update",
                "violation_id": int,
                "ack_user": str,
                "ack_reason": str,
                "plant_id": int | None
            }
        """
        plant_id = await self._resolve_plant_for_violation(event.violation_id)

        message = {
            "type": "ack_update",
            "violation_id": event.violation_id,
            "ack_user": event.user,
            "ack_reason": event.reason,
            "plant_id": plant_id,
        }

        logger.info(
            "broadcasting_acknowledgment",
            violation_id=event.violation_id,
            user=event.user,
            plant_id=plant_id,
        )

        # Plant-scoped broadcast: only deliver to subscribers with role at the
        # owning plant. If plant_id is None we still scope-down by passing it
        # — broadcast_to_all returns immediately when allowed_user_ids is empty.
        await self._manager.broadcast_to_all(message, plant_id=plant_id)
        await self._publish_to_broadcast(message)

    async def _resolve_plant_for_violation(
        self, violation_id: int
    ) -> int | None:
        """Best-effort plant lookup for a violation — used to scope ack fan-out."""
        from cassini.db.database import get_database
        from cassini.db.models.characteristic import Characteristic
        from cassini.db.models.hierarchy import Hierarchy
        from cassini.db.models.violation import Violation
        from sqlalchemy import select as sa_select

        try:
            db = get_database()
            async with db.session() as session:
                row = (
                    await session.execute(
                        sa_select(Hierarchy.plant_id)
                        .join(
                            Characteristic,
                            Characteristic.hierarchy_id == Hierarchy.id,
                        )
                        .join(
                            Violation,
                            Violation.char_id == Characteristic.id,
                        )
                        .where(Violation.id == violation_id)
                    )
                ).first()
                return row[0] if row else None
        except Exception:
            logger.warning(
                "violation_plant_resolve_failed", violation_id=violation_id
            )
            return None


__all__ = ["WebSocketBroadcaster"]
