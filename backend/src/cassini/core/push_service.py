"""Web Push notification service for real-time SPC alerts.

Subscribes to Event Bus events and sends push notifications to subscribed
browsers whose owners have matching notification preferences (event type,
channel="push", severity filter).  Uses the Web Push protocol with VAPID
authentication.  Follows the same pattern as NotificationDispatcher in
core/notifications.py.
"""

import asyncio
import json
from typing import Any

import structlog
from sqlalchemy import select, delete

from cassini.core.config import get_settings
from cassini.core.events import (
    AnomalyDetectedEvent,
    EventBus,
    ViolationCreatedEvent,
)
from cassini.core.notifications import RULE_SEVERITY
from cassini.db.models.notification import NotificationPreference
from cassini.db.models.push_subscription import PushSubscription

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
            "sub": f"mailto:{settings.vapid_contact_email}" if settings.vapid_contact_email else "mailto:admin@cassini.local",
        }
        self._initialized = True

    def _setup_subscriptions(self) -> None:
        """Subscribe to event bus events."""
        self._event_bus.subscribe(ViolationCreatedEvent, self._on_violation_created)
        self._event_bus.subscribe(AnomalyDetectedEvent, self._on_anomaly_detected)
        logger.debug("PushNotificationService subscribed to 2 event types")

    async def _on_violation_created(self, event: ViolationCreatedEvent) -> None:
        """Handle violation event -- send push only to users with matching preferences."""
        rule_severity = RULE_SEVERITY.get(event.rule_id, "info")

        payload = {
            "title": "SPC Violation Detected",
            "body": f"Rule {event.rule_id} ({event.rule_name}) -- {event.severity}",
            "tag": f"violation-{event.violation_id}",
            "data": {
                "url": f"/violations?highlight={event.violation_id}",
                "characteristic_id": event.characteristic_id,
            },
        }
        recipients = await self._send_filtered(
            json.dumps(payload),
            event_type="violation_created",
            rule_severity=rule_severity,
        )
        await self._audit_push_send("violation_created", recipients)

    async def _on_anomaly_detected(self, event: AnomalyDetectedEvent) -> None:
        """Handle anomaly event -- send push only to users with matching preferences."""
        payload = {
            "title": "Anomaly Detected",
            "body": event.summary[:200],
            "tag": f"anomaly-{event.anomaly_event_id}",
            "data": {
                "url": f"/dashboard?characteristic={event.characteristic_id}",
                "characteristic_id": event.characteristic_id,
            },
        }
        # Anomaly events are always treated as "critical" severity
        recipients = await self._send_filtered(
            json.dumps(payload),
            event_type="anomaly_detected",
            rule_severity="critical",
        )
        await self._audit_push_send("anomaly_detected", recipients)

    async def _send_filtered(
        self,
        payload: str,
        *,
        event_type: str,
        rule_severity: str | None = None,
    ) -> int:
        """Send push notifications only to users whose preferences match.

        Queries ``NotificationPreference`` for ``channel='push'`` and the given
        ``event_type``, applies severity filtering, then sends only to
        ``PushSubscription`` rows belonging to those users.

        Falls back to ``_send_to_all`` when no preference rows exist at all
        (i.e. nobody has configured push preferences yet), so that push
        continues to work out-of-the-box before users customise settings.

        Returns:
            Number of subscriptions the notification was sent to.
        """
        if not self._initialized or self._webpush is None:
            return 0

        async with self._session_factory() as session:
            # Build preference query for push channel + event type
            pref_query = select(NotificationPreference.user_id).where(
                NotificationPreference.event_type == event_type,
                NotificationPreference.channel == "push",
                NotificationPreference.is_enabled == True,  # noqa: E712
            )

            # Apply severity filtering (same logic as NotificationDispatcher)
            if rule_severity:
                if rule_severity == "info":
                    pref_query = pref_query.where(
                        NotificationPreference.severity_filter == "all"
                    )
                elif rule_severity == "warning":
                    pref_query = pref_query.where(
                        NotificationPreference.severity_filter.in_(
                            ["all", "critical_and_warning"]
                        )
                    )
                # "critical" always passes all severity filters

            pref_result = await session.execute(pref_query)
            opted_in_user_ids = [row[0] for row in pref_result.all()]

            # Check whether ANY push preference rows exist for this event type.
            # If none exist at all, fall back to sending to everyone so push
            # works before users configure preferences.
            any_pref_query = select(NotificationPreference.id).where(
                NotificationPreference.event_type == event_type,
                NotificationPreference.channel == "push",
            ).limit(1)
            any_pref_result = await session.execute(any_pref_query)
            has_any_prefs = any_pref_result.first() is not None

            if has_any_prefs and not opted_in_user_ids:
                # Preferences exist but nobody matched the severity filter
                logger.debug(
                    "push_no_matching_users",
                    event_type=event_type,
                    rule_severity=rule_severity,
                )
                return 0

            # Get subscriptions — scoped to matching users, or all if no prefs
            sub_query = select(PushSubscription)
            if has_any_prefs:
                sub_query = sub_query.where(
                    PushSubscription.user_id.in_(opted_in_user_ids)
                )

            result = await session.execute(sub_query)
            subscriptions = result.scalars().all()

            if not subscriptions:
                return 0

            return await self._dispatch_push(session, subscriptions, payload)

    async def _dispatch_push(
        self,
        session: Any,
        subscriptions: list[PushSubscription],
        payload: str,
    ) -> int:
        """Send *payload* to a pre-selected list of subscriptions.

        Handles per-subscription errors, cleans up gone (404/410) endpoints,
        and returns the number of successfully sent notifications.
        """
        sent_count = 0
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
                sent_count += 1
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

        return sent_count

    async def _audit_push_send(self, event_type: str, recipients: int) -> None:
        """Log push notification dispatch to the audit trail."""
        if recipients == 0:
            return
        try:
            from cassini.core.audit import AuditService

            async with self._session_factory() as session:
                from cassini.db.models.audit_log import AuditLog

                entry = AuditLog(
                    user_id=None,
                    username="system",
                    action="send",
                    resource_type="push_notification",
                    resource_id=None,
                    detail={
                        "source": "event_bus",
                        "event_type": event_type,
                        "recipients": recipients,
                    },
                )
                session.add(entry)
                await session.commit()
        except Exception:
            logger.warning("push_audit_log_failed", event_type=event_type)
