"""Web Push notification service for real-time SPC alerts.

Subscribes to Event Bus events and sends push notifications to all active
browser subscriptions via the Web Push protocol (VAPID authentication).
Follows the same pattern as NotificationDispatcher in core/notifications.py.
"""

import asyncio
import json
from typing import Any

import structlog
from sqlalchemy import select, delete

from openspc.core.config import get_settings
from openspc.core.events import (
    AnomalyDetectedEvent,
    EventBus,
    ViolationCreatedEvent,
)
from openspc.db.models.push_subscription import PushSubscription

logger = structlog.get_logger(__name__)


class PushNotificationService:
    """Sends push notifications for SPC events to subscribed browsers."""

    def __init__(self, event_bus: EventBus, session_factory: Any) -> None:
        self._event_bus = event_bus
        self._session_factory = session_factory
        self._webpush = None
        self._vapid_private_key = ""
        self._vapid_claims: dict[str, str] = {}
        self._initialized = False
        self._init_webpush()
        if self._initialized:
            self._setup_subscriptions()
            logger.info("PushNotificationService initialized")
        else:
            logger.warning("PushNotificationService disabled (pywebpush not available or VAPID not configured)")

    def _init_webpush(self) -> None:
        """Try to import pywebpush and load VAPID config."""
        try:
            from pywebpush import webpush
            self._webpush = webpush
        except ImportError:
            logger.info("pywebpush not installed -- push notifications disabled")
            return

        settings = get_settings()
        if not settings.vapid_private_key or not settings.vapid_public_key:
            logger.info("VAPID keys not configured -- push notifications disabled")
            return

        self._vapid_private_key = settings.vapid_private_key
        self._vapid_claims = {
            "sub": f"mailto:{settings.vapid_contact_email}" if settings.vapid_contact_email else "mailto:admin@openspc.local",
        }
        self._initialized = True

    def _setup_subscriptions(self) -> None:
        """Subscribe to event bus events."""
        self._event_bus.subscribe(ViolationCreatedEvent, self._on_violation_created)
        self._event_bus.subscribe(AnomalyDetectedEvent, self._on_anomaly_detected)
        logger.debug("PushNotificationService subscribed to 2 event types")

    async def _on_violation_created(self, event: ViolationCreatedEvent) -> None:
        """Handle violation event -- send push to all subscribers."""
        payload = {
            "title": "SPC Violation Detected",
            "body": f"Rule {event.rule_id} ({event.rule_name}) -- {event.severity}",
            "tag": f"violation-{event.violation_id}",
            "data": {
                "url": f"/violations?highlight={event.violation_id}",
                "characteristic_id": event.characteristic_id,
            },
        }
        await self._send_to_all(json.dumps(payload))

    async def _on_anomaly_detected(self, event: AnomalyDetectedEvent) -> None:
        """Handle anomaly event -- send push to all subscribers."""
        payload = {
            "title": "Anomaly Detected",
            "body": event.summary[:200],
            "tag": f"anomaly-{event.anomaly_event_id}",
            "data": {
                "url": f"/dashboard?characteristic={event.characteristic_id}",
                "characteristic_id": event.characteristic_id,
            },
        }
        await self._send_to_all(json.dumps(payload))

    async def _send_to_all(self, payload: str) -> None:
        """Send a push notification to all active subscriptions."""
        if not self._initialized or self._webpush is None:
            return

        async with self._session_factory() as session:
            stmt = select(PushSubscription)
            result = await session.execute(stmt)
            subscriptions = result.scalars().all()

            if not subscriptions:
                return

            gone_ids: list[int] = []

            for sub in subscriptions:
                try:
                    subscription_info = {
                        "endpoint": sub.endpoint,
                        "keys": {
                            "p256dh": sub.p256dh_key,
                            "auth": sub.auth_key,
                        },
                    }
                    # pywebpush is synchronous -- run in thread pool
                    await asyncio.to_thread(
                        self._webpush,
                        subscription_info=subscription_info,
                        data=payload,
                        vapid_private_key=self._vapid_private_key,
                        vapid_claims=self._vapid_claims,
                    )
                except Exception as e:
                    # pywebpush raises WebPushException with response attribute
                    response = getattr(e, "response", None)
                    status_code = getattr(response, "status_code", None) if response else None
                    if status_code in (404, 410):
                        gone_ids.append(sub.id)
                        logger.info("push_subscription_gone", subscription_id=sub.id, status=status_code)
                    else:
                        logger.warning("push_send_failed", subscription_id=sub.id, error=str(e))

            # Clean up gone subscriptions
            if gone_ids:
                stmt_del = delete(PushSubscription).where(PushSubscription.id.in_(gone_ids))
                await session.execute(stmt_del)
                await session.commit()
                logger.info("push_subscriptions_cleaned", count=len(gone_ids))
