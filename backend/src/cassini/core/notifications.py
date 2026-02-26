"""Notification dispatcher for SMTP email and webhook delivery.

Subscribes to Event Bus events and dispatches notifications to configured
channels (email via aiosmtplib, webhooks via httpx) based on user preferences.
Follows the same pattern as MQTTPublisher in core/publish.py.
"""

import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import structlog
from sqlalchemy import select

from cassini.core.events import (
    AnomalyDetectedEvent,
    ControlLimitsUpdatedEvent,
    EventBus,
    SignatureCreatedEvent,
    ViolationCreatedEvent,
    WorkflowCompletedEvent,
)
from cassini.db.dialects import decrypt_password, get_encryption_key
from cassini.db.models.notification import (
    NotificationPreference,
    SmtpConfig,
    WebhookConfig,
)
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

# Nelson rule severity mapping
RULE_SEVERITY: dict[int, str] = {
    1: "critical",  # Beyond control limits
    2: "warning",  # Run of 9 above/below
    3: "warning",  # Run of 6 increasing/decreasing
    4: "warning",  # 14 alternating
    5: "info",  # 2 of 3 in Zone A
    6: "info",  # 4 of 5 in Zone B
    7: "info",  # 15 in Zone C
    8: "info",  # 8 outside Zone C
}


class NotificationDispatcher:
    """Dispatches SPC event notifications via email and webhooks.

    Subscribes to ViolationCreatedEvent and ControlLimitsUpdatedEvent on the
    event bus. For each event, queries active SMTP/webhook configs and user
    preferences, then delivers notifications accordingly.

    Args:
        event_bus: Event bus for subscribing to domain events
        session_factory: Callable returning an async context manager for DB sessions
    """

    def __init__(
        self,
        event_bus: EventBus,
        session_factory: Any,
    ) -> None:
        self._event_bus = event_bus
        self._session_factory = session_factory
        self._setup_subscriptions()
        logger.info("NotificationDispatcher initialized")

    def _setup_subscriptions(self) -> None:
        """Subscribe to Event Bus events for notification dispatch."""
        self._event_bus.subscribe(ViolationCreatedEvent, self._on_violation_created)
        self._event_bus.subscribe(
            ControlLimitsUpdatedEvent, self._on_limits_updated
        )
        self._event_bus.subscribe(AnomalyDetectedEvent, self._on_anomaly_detected)
        self._event_bus.subscribe(SignatureCreatedEvent, self._on_signature_created)
        self._event_bus.subscribe(WorkflowCompletedEvent, self._on_workflow_completed)
        logger.debug("NotificationDispatcher subscribed to 5 event types")

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------

    async def _on_violation_created(self, event: ViolationCreatedEvent) -> None:
        """Handle ViolationCreatedEvent — send email + webhook notifications."""
        rule_severity = RULE_SEVERITY.get(event.rule_id, "info")

        payload = {
            "event": "violation_created",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "violation_id": event.violation_id,
            "sample_id": event.sample_id,
            "characteristic_id": event.characteristic_id,
            "rule_id": event.rule_id,
            "rule_name": event.rule_name,
            "severity": event.severity,
        }
        subject = f"[Cassini] Violation: {event.rule_name} (Rule {event.rule_id})"
        body = (
            f"A Nelson rule violation has been detected.\n\n"
            f"Rule: {event.rule_name} (Rule {event.rule_id})\n"
            f"Severity: {event.severity}\n"
            f"Characteristic ID: {event.characteristic_id}\n"
            f"Sample ID: {event.sample_id}\n"
            f"Time: {payload['timestamp']}\n"
        )
        await self._dispatch(
            event_type="violation_created",
            payload=payload,
            email_subject=subject,
            email_body=body,
            rule_severity=rule_severity,
        )

    async def _on_limits_updated(self, event: ControlLimitsUpdatedEvent) -> None:
        """Handle ControlLimitsUpdatedEvent — send email + webhook notifications."""
        payload = {
            "event": "limits_updated",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "characteristic_id": event.characteristic_id,
            "center_line": event.center_line,
            "ucl": event.ucl,
            "lcl": event.lcl,
            "method": event.method,
            "sample_count": event.sample_count,
        }
        subject = f"[Cassini] Control limits updated (Char {event.characteristic_id})"
        body = (
            f"Control limits have been recalculated.\n\n"
            f"Characteristic ID: {event.characteristic_id}\n"
            f"Center Line: {event.center_line:.4f}\n"
            f"UCL: {event.ucl:.4f}\n"
            f"LCL: {event.lcl:.4f}\n"
            f"Method: {event.method}\n"
            f"Samples: {event.sample_count}\n"
        )
        await self._dispatch(
            event_type="limits_updated",
            payload=payload,
            email_subject=subject,
            email_body=body,
        )

    async def _on_anomaly_detected(self, event: AnomalyDetectedEvent) -> None:
        """Handle AnomalyDetectedEvent — send email + webhook notifications."""
        payload = {
            "event": "anomaly_detected",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "anomaly_event_id": event.anomaly_event_id,
            "characteristic_id": event.characteristic_id,
            "detector_type": event.detector_type,
            "event_type": event.event_type,
            "severity": event.severity,
            "summary": event.summary,
            "sample_id": event.sample_id,
        }
        subject = f"[Cassini] Anomaly: {event.event_type} ({event.severity})"
        body = (
            f"An anomaly has been detected.\n\n"
            f"Type: {event.event_type}\n"
            f"Detector: {event.detector_type}\n"
            f"Severity: {event.severity}\n"
            f"Characteristic ID: {event.characteristic_id}\n"
            f"Summary: {event.summary}\n"
            f"Time: {payload['timestamp']}\n"
        )
        await self._dispatch(
            event_type="anomaly_detected",
            payload=payload,
            email_subject=subject,
            email_body=body,
        )

    async def _on_signature_created(self, event: SignatureCreatedEvent) -> None:
        """Handle SignatureCreatedEvent — notify relevant parties."""
        payload = {
            "event": "signature_created",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "signature_id": event.signature_id,
            "user_id": event.user_id,
            "username": event.username,
            "resource_type": event.resource_type,
            "resource_id": event.resource_id,
            "meaning_code": event.meaning_code,
            "workflow_instance_id": event.workflow_instance_id,
        }
        subject = f"[Cassini] Signature: {event.username} signed {event.resource_type} #{event.resource_id}"
        body = (
            f"An electronic signature has been created.\n\n"
            f"Signer: {event.username}\n"
            f"Resource: {event.resource_type} #{event.resource_id}\n"
            f"Meaning: {event.meaning_code}\n"
            f"Time: {payload['timestamp']}\n"
        )
        await self._dispatch(
            event_type="signature_created",
            payload=payload,
            email_subject=subject,
            email_body=body,
        )

    async def _on_workflow_completed(self, event: WorkflowCompletedEvent) -> None:
        """Handle WorkflowCompletedEvent — notify workflow initiator."""
        payload = {
            "event": "workflow_completed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "workflow_instance_id": event.workflow_instance_id,
            "resource_type": event.resource_type,
            "resource_id": event.resource_id,
        }
        subject = f"[Cassini] Workflow completed: {event.resource_type} #{event.resource_id}"
        body = (
            f"A signature workflow has been completed.\n\n"
            f"Resource: {event.resource_type} #{event.resource_id}\n"
            f"Workflow Instance: {event.workflow_instance_id}\n"
            f"Time: {payload['timestamp']}\n"
        )
        await self._dispatch(
            event_type="workflow_completed",
            payload=payload,
            email_subject=subject,
            email_body=body,
        )

    # ------------------------------------------------------------------
    # Dispatch orchestrator
    # ------------------------------------------------------------------

    async def _dispatch(
        self,
        event_type: str,
        payload: dict[str, Any],
        email_subject: str,
        email_body: str,
        rule_severity: str | None = None,
    ) -> None:
        """Dispatch notifications to all configured channels.

        Args:
            event_type: The event type string (e.g. "violation_created").
            payload: JSON-serializable payload for webhooks.
            email_subject: Subject line for email notifications.
            email_body: Plain-text body for email notifications.
            rule_severity: Optional severity level ("critical", "warning", "info")
                for filtering violation notifications by user preference.
        """
        try:
            async with self._session_factory() as session:
                # Load SMTP config
                smtp_result = await session.execute(
                    select(SmtpConfig).where(SmtpConfig.is_active == True)  # noqa: E712
                )
                smtp_config = smtp_result.scalar_one_or_none()

                # Load active webhooks
                wh_result = await session.execute(
                    select(WebhookConfig).where(WebhookConfig.is_active == True)  # noqa: E712
                )
                webhooks = list(wh_result.scalars().all())

                # Load users who want email for this event
                email_users: list[str] = []
                if smtp_config:
                    pref_query = select(NotificationPreference.user_id).where(
                        NotificationPreference.event_type == event_type,
                        NotificationPreference.channel == "email",
                        NotificationPreference.is_enabled == True,  # noqa: E712
                    )

                    # Filter by severity if this is a violation event
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
                        # "critical" always passes all filters

                    pref_result = await session.execute(pref_query)
                    user_ids = [row[0] for row in pref_result.all()]

                    if user_ids:
                        user_result = await session.execute(
                            select(User.email).where(
                                User.id.in_(user_ids),
                                User.is_active == True,  # noqa: E712
                                User.email.isnot(None),
                            )
                        )
                        email_users = [row[0] for row in user_result.all() if row[0]]

                # Extract values before leaving session context
                smtp_server = smtp_config.server if smtp_config else None
                smtp_port = smtp_config.port if smtp_config else None
                smtp_username = smtp_config.username if smtp_config else None
                smtp_password = smtp_config.password if smtp_config else None
                smtp_use_tls = smtp_config.use_tls if smtp_config else None
                smtp_from = smtp_config.from_address if smtp_config else None

                webhook_data = [
                    {
                        "id": wh.id,
                        "name": wh.name,
                        "url": wh.url,
                        "secret": wh.secret,
                        "retry_count": wh.retry_count,
                        "events_filter": wh.events_filter,
                    }
                    for wh in webhooks
                ]

            # Send emails
            if smtp_server and email_users:
                await self._send_emails(
                    recipients=email_users,
                    subject=email_subject,
                    body=email_body,
                    smtp_server=smtp_server,
                    smtp_port=smtp_port,
                    smtp_username=smtp_username,
                    smtp_password=smtp_password,
                    smtp_use_tls=smtp_use_tls,
                    smtp_from=smtp_from,
                )

            # Send webhooks
            for wh in webhook_data:
                # Check events_filter
                if wh["events_filter"]:
                    try:
                        allowed = json.loads(wh["events_filter"])
                        if isinstance(allowed, list) and event_type not in allowed:
                            continue
                    except (json.JSONDecodeError, TypeError):
                        pass

                await self._send_webhook(
                    url=wh["url"],
                    payload=payload,
                    secret=wh["secret"],
                    retry_count=wh["retry_count"],
                    webhook_name=wh["name"],
                )

        except Exception:
            logger.error(
                "notification_dispatch_error",
                event_type=event_type,
                exc_info=True,
            )

    # ------------------------------------------------------------------
    # Email delivery
    # ------------------------------------------------------------------

    async def _send_emails(
        self,
        recipients: list[str],
        subject: str,
        body: str,
        smtp_server: str,
        smtp_port: int,
        smtp_username: str | None,
        smtp_password: str | None,
        smtp_use_tls: bool,
        smtp_from: str,
    ) -> None:
        """Send email notifications via aiosmtplib."""
        try:
            import aiosmtplib

            # Decrypt credentials if present
            decrypted_username = None
            decrypted_password = None
            if smtp_username:
                try:
                    key = get_encryption_key()
                    decrypted_username = decrypt_password(smtp_username, key)
                except Exception:
                    decrypted_username = smtp_username
            if smtp_password:
                try:
                    key = get_encryption_key()
                    decrypted_password = decrypt_password(smtp_password, key)
                except Exception:
                    decrypted_password = smtp_password

            for recipient in recipients:
                try:
                    msg = MIMEMultipart()
                    msg["From"] = smtp_from
                    msg["To"] = recipient
                    msg["Subject"] = subject
                    msg.attach(MIMEText(body, "plain"))

                    await aiosmtplib.send(
                        msg,
                        hostname=smtp_server,
                        port=smtp_port,
                        username=decrypted_username,
                        password=decrypted_password,
                        start_tls=smtp_use_tls,
                    )
                    logger.debug(
                        "notification_email_sent",
                        recipient=recipient,
                        subject=subject,
                    )
                except Exception:
                    logger.warning(
                        "notification_email_failed",
                        recipient=recipient,
                        exc_info=True,
                    )

        except ImportError:
            logger.warning("aiosmtplib not installed — email notifications disabled")

    # ------------------------------------------------------------------
    # Webhook delivery
    # ------------------------------------------------------------------

    async def _send_webhook(
        self,
        url: str,
        payload: dict[str, Any],
        secret: str | None,
        retry_count: int,
        webhook_name: str,
    ) -> None:
        """POST webhook payload with optional HMAC-SHA256 signature and retries."""
        try:
            import httpx

            body_bytes = json.dumps(payload).encode("utf-8")

            headers: dict[str, str] = {"Content-Type": "application/json"}
            if secret:
                try:
                    key = get_encryption_key()
                    decrypted_secret = decrypt_password(secret, key)
                except Exception:
                    decrypted_secret = secret

                sig = hmac.new(
                    decrypted_secret.encode("utf-8"),
                    body_bytes,
                    hashlib.sha256,
                ).hexdigest()
                headers["X-Webhook-Signature"] = f"sha256={sig}"

            async with httpx.AsyncClient(timeout=10.0) as client:
                for attempt in range(max(1, retry_count)):
                    try:
                        resp = await client.post(
                            url, content=body_bytes, headers=headers
                        )
                        if resp.status_code < 400:
                            logger.debug(
                                "notification_webhook_sent",
                                webhook=webhook_name,
                                status=resp.status_code,
                            )
                            return
                        logger.warning(
                            "notification_webhook_bad_status",
                            webhook=webhook_name,
                            status=resp.status_code,
                            attempt=attempt + 1,
                        )
                    except Exception:
                        logger.warning(
                            "notification_webhook_error",
                            webhook=webhook_name,
                            attempt=attempt + 1,
                            exc_info=True,
                        )

                    # Exponential backoff: 1s, 2s, 4s, ...
                    if attempt < retry_count - 1:
                        await asyncio.sleep(2**attempt)

                logger.error(
                    "notification_webhook_exhausted",
                    webhook=webhook_name,
                    retries=retry_count,
                )

        except ImportError:
            logger.warning("httpx not installed — webhook notifications disabled")

    # ------------------------------------------------------------------
    # Test helpers (used by API endpoints)
    # ------------------------------------------------------------------

    @staticmethod
    async def send_test_email(
        smtp_server: str,
        smtp_port: int,
        smtp_username: str | None,
        smtp_password: str | None,
        smtp_use_tls: bool,
        smtp_from: str,
        recipient: str,
    ) -> str:
        """Send a test email. Returns 'ok' or error message."""
        try:
            import aiosmtplib

            msg = MIMEMultipart()
            msg["From"] = smtp_from
            msg["To"] = recipient
            msg["Subject"] = "[Cassini] Test Notification"
            msg.attach(MIMEText(
                "This is a test email from Cassini notification system.\n"
                "If you received this, your SMTP configuration is working correctly.",
                "plain",
            ))

            await aiosmtplib.send(
                msg,
                hostname=smtp_server,
                port=smtp_port,
                username=smtp_username,
                password=smtp_password,
                start_tls=smtp_use_tls,
            )
            return "ok"
        except Exception as e:
            return str(e)

    @staticmethod
    async def send_test_webhook(url: str, secret: str | None) -> str:
        """Send a test webhook payload. Returns 'ok' or error message."""
        try:
            import httpx

            payload = {
                "event": "test",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message": "Cassini webhook test",
            }
            body_bytes = json.dumps(payload).encode("utf-8")

            headers: dict[str, str] = {"Content-Type": "application/json"}
            if secret:
                sig = hmac.new(
                    secret.encode("utf-8"),
                    body_bytes,
                    hashlib.sha256,
                ).hexdigest()
                headers["X-Webhook-Signature"] = f"sha256={sig}"

            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, content=body_bytes, headers=headers)
                if resp.status_code < 400:
                    return "ok"
                return f"HTTP {resp.status_code}: {resp.text[:200]}"
        except Exception as e:
            return str(e)


__all__ = ["NotificationDispatcher", "RULE_SEVERITY"]
