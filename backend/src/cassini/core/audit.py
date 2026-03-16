"""Audit trail service and middleware.

Provides centralized audit logging for all user actions, login events,
and system events. The AuditMiddleware automatically logs mutating API
requests (POST/PUT/PATCH/DELETE) without blocking responses.

When ``audit_gets`` is enabled on the middleware (Enterprise only),
GET requests to sensitive endpoints (audit, users, signatures, export)
are also logged with per-worker in-memory rate limiting to prevent
log flooding.

.. note::

    GET audit rate-limit state is per-worker.  In multi-worker deployments
    (e.g. gunicorn with ``--workers N``), each worker maintains its own
    cache so the effective rate limit is per-worker, not global.
"""

import asyncio
import hashlib
import json as _json
import re
import time
from typing import Optional

import structlog
from sqlalchemy.exc import IntegrityError
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from cassini.db.models.audit_log import AuditLog

logger = structlog.get_logger(__name__)


def compute_audit_hash(
    previous_hash: str,
    action,
    resource_type,
    resource_id,
    user_id,
    username,
    timestamp,
    sequence_number=None,
) -> str:
    """Compute SHA-256 chain hash for an audit entry.

    Normalizes the timestamp to naive UTC (no tzinfo suffix) so the hash
    is consistent regardless of whether the datetime came from Python
    (tz-aware) or was read back from SQLite (tz-stripped).

    When *sequence_number* is provided it is included in the hash input
    for stronger tamper evidence in multi-instance deployments.
    """
    # Normalize: strip tzinfo so isoformat() never includes +00:00
    ts = timestamp
    if ts.tzinfo is not None:
        ts = ts.replace(tzinfo=None)
    hash_input = (
        f"{previous_hash}|"
        f"{action}|"
        f"{resource_type}|"
        f"{resource_id}|"
        f"{user_id}|"
        f"{username}|"
        f"{ts.isoformat()}"
    )
    if sequence_number is not None:
        hash_input += f"|{sequence_number}"
    return hashlib.sha256(hash_input.encode()).hexdigest()

# Map URL path segments to resource types
_RESOURCE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"/api/v1/plants/(\d+)/material-classes(?:/(\d+))?"), "material_class"),
    (re.compile(r"/api/v1/plants/(\d+)/materials(?:/(\d+))?"), "material"),
    (re.compile(r"/api/v1/characteristics/(\d+)/material-overrides(?:/(\d+))?"), "material_override"),
    (re.compile(r"/api/v1/characteristics/(\d+)/diagnose"), "ishikawa"),
    (re.compile(r"/api/v1/characteristics/(\d+)"), "characteristic"),
    (re.compile(r"/api/v1/characteristics/?$"), "characteristic"),
    (re.compile(r"/api/v1/samples/(\d+)"), "sample"),
    (re.compile(r"/api/v1/samples/?$"), "sample"),
    (re.compile(r"/api/v1/data-entry/"), "sample"),
    (re.compile(r"/api/v1/plants/(\d+)"), "plant"),
    (re.compile(r"/api/v1/plants/?$"), "plant"),
    (re.compile(r"/api/v1/users/(\d+)"), "user"),
    (re.compile(r"/api/v1/users/?$"), "user"),
    (re.compile(r"/api/v1/brokers/(\d+)"), "broker"),
    (re.compile(r"/api/v1/brokers/?$"), "broker"),
    (re.compile(r"/api/v1/opcua-servers/(\d+)"), "opcua_server"),
    (re.compile(r"/api/v1/opcua-servers/?$"), "opcua_server"),
    (re.compile(r"/api/v1/hierarchy/(\d+)"), "hierarchy"),
    (re.compile(r"/api/v1/hierarchy/?$"), "hierarchy"),
    (re.compile(r"/api/v1/violations/(\d+)"), "violation"),
    (re.compile(r"/api/v1/violations/?$"), "violation"),
    (re.compile(r"/api/v1/retention/"), "retention"),
    (re.compile(r"/api/v1/database/"), "database"),
    (re.compile(r"/api/v1/api-keys/"), "api_key"),
    (re.compile(r"/api/v1/tags/"), "tag_mapping"),
    (re.compile(r"/api/v1/import/"), "import"),
    (re.compile(r"/api/v1/annotations"), "annotation"),
    (re.compile(r"/api/v1/rule-presets(?:/(\d+))?"), "rule_preset"),
    (re.compile(r"/api/v1/msa/studies(?:/(\d+))?"), "msa_study"),
    (re.compile(r"/api/v1/fai/reports(?:/(\d+)(?:/.*)?)?"), "fai_report"),
    (re.compile(r"/api/v1/gage-bridges(?:/(\d+))?"), "gage_bridge"),
    (re.compile(r"/api/v1/anomaly/"), "anomaly"),
    (re.compile(r"/api/v1/signatures/"), "signature"),
    (re.compile(r"/api/v1/auth/oidc/config(?:/(\d+))?"), "oidc_config"),
    (re.compile(r"/api/v1/auth/oidc/links(?:/(\d+))?"), "oidc_link"),
    (re.compile(r"/api/v1/push/"), "push_subscription"),
    (re.compile(r"/api/v1/erp/connectors(?:/(\d+))?"), "erp_connector"),
    (re.compile(r"/api/v1/correlation/"), "correlation_analysis"),
    (re.compile(r"/api/v1/multivariate/groups(?:/(\d+))?"), "multivariate_group"),
    (re.compile(r"/api/v1/multivariate/correlation/"), "correlation"),
    (re.compile(r"/api/v1/predictions(?:/(\d+))?"), "prediction"),
    (re.compile(r"/api/v1/ai/"), "ai_config"),
    (re.compile(r"/api/v1/collection-plans(?:/(\d+)(?:/.*)?)?"), "collection_plan"),
    (re.compile(r"/api/v1/doe/studies(?:/(\d+)(?:/.*)?)?"), "doe_study"),
    (re.compile(r"/api/v1/plants/(\d+)/deactivate"), "plant"),
    (re.compile(r"/api/v1/plants/(\d+)/reactivate"), "plant"),
    (re.compile(r"/api/v1/license/compliance"), "license"),
    (re.compile(r"/api/v1/license$"), "license"),
    (re.compile(r"/api/v1/system-settings"), "system_settings"),
    (re.compile(r"/api/v1/auth/forgot-password"), "auth"),
    (re.compile(r"/api/v1/auth/reset-password"), "auth"),
    (re.compile(r"/api/v1/auth/verify-email"), "auth"),
    (re.compile(r"/api/v1/auth/update-profile"), "auth"),
    (re.compile(r"/api/v1/scheduled-reports(?:/(\d+))?"), "report_schedule"),
    (re.compile(r"/api/v1/reports/analytics(?:/|$)"), "report_analytics"),
]

# Paths to skip auditing (health checks, reads, auth refresh, websocket)
_SKIP_PATHS = {"/health", "/", "/docs", "/openapi.json", "/redoc"}


def _parse_resource(path: str) -> tuple[Optional[str], Optional[int]]:
    """Extract resource_type and resource_id from a URL path."""
    for pattern, resource_type in _RESOURCE_PATTERNS:
        m = pattern.search(path)
        if m:
            resource_id = int(m.group(1)) if m.lastindex and m.lastindex >= 1 else None
            return resource_type, resource_id
    return None, None


def _method_to_action(method: str, path: str) -> str:
    """Map HTTP method + path to an action string."""
    if "recalculate" in path:
        return "recalculate"
    if "acknowledge" in path:
        return "acknowledge"
    if "export" in path:
        return "export"
    if "/delta" in path:
        return "create_delta"
    if "connect" in path:
        return "connect"
    if "disconnect" in path:
        return "disconnect"
    if "/deactivate" in path:
        return "deactivate"
    if "/reactivate" in path:
        return "reactivate"
    if "activate" in path:
        return "activate"
    if "discover" in path:
        return "discover"
    if "/execute" in path:
        return "execute"
    if "/submit" in path:
        return "submit"
    if "/approve" in path:
        return "approve"
    if "/reject" in path:
        return "reject"
    if "/decompose" in path:
        return "decompose"
    if "calculate" in path or "/compute" in path:
        return "calculate"
    if "/unfreeze" in path:
        return "unfreeze"
    if "/freeze" in path:
        return "freeze"
    if "/train" in path:
        return "train"
    if "/generate" in path:
        return "generate"
    if "/analyze" in path or "/analytics" in path:
        return "analyze"
    if "/sign" in path:
        return "sign"
    if "/sync" in path:
        return "sync"
    if "/dismiss" in path:
        return "dismiss"
    if "/roles-lock" in path:
        return "lock_roles"
    if "/purge" in path:
        return "purge"
    if "/unlock" in path:
        return "unlock"
    if "/cusum-reset" in path:
        return "reset"
    if "/forecast" in path:
        return "forecast"
    if "/test" in path:
        return "test"
    if "forgot-password" in path:
        return "password_reset_requested"
    if "reset-password" in path:
        return "password_reset_completed"
    if "verify-email" in path:
        return "email_verified"
    if "update-profile" in path:
        return "profile_updated"
    method_map = {
        "POST": "create",
        "PUT": "update",
        "PATCH": "update",
        "DELETE": "delete",
    }
    return method_map.get(method, "unknown")


_SENSITIVE_KEYS = frozenset({
    "password", "secret", "api_key", "token", "credential",
    "client_secret", "auth_config", "p256dh", "auth_key",
    "ca_cert_pem", "client_cert_pem", "client_key_pem",
})


def _sanitize_body(body: dict) -> dict:
    """Strip sensitive fields from a request body dict for audit logging."""
    return {k: v for k, v in body.items() if k.lower() not in _SENSITIVE_KEYS}


class AuditService:
    """Central audit logging service.

    Uses its own session factory to avoid sharing the request's session.
    All log methods are fire-and-forget safe.

    The hash chain and sequence numbering are DB-authoritative: each call
    to ``log()`` reads the latest hash/sequence from the database so that
    multiple application instances can safely append to the same chain.
    """

    def __init__(self, session_factory):
        self._session_factory = session_factory
        self._failure_count = 0
        self._last_failure_at: Optional[str] = None
        self._last_hash: str = "0" * 64  # Genesis hash (used as fast-path cache)

    async def _get_last_hash_and_seq(self, session) -> tuple[str, int]:
        """Read the most recent sequence_hash and sequence_number from the DB.

        Returns (last_hash, last_sequence_number). If the table is empty,
        returns the genesis hash and 0.
        """
        from sqlalchemy import select as sa_select

        stmt = (
            sa_select(AuditLog.sequence_hash, AuditLog.sequence_number)
            .where(AuditLog.sequence_hash.isnot(None))
            .order_by(AuditLog.sequence_number.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        row = result.first()
        if row and row[0]:
            return row[0], row[1] or 0
        return "0" * 64, 0

    async def log(
        self,
        action: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[int] = None,
        detail: Optional[dict] = None,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        resource_display: Optional[str] = None,
    ) -> None:
        """Create an audit log entry.

        If *resource_display* is not supplied but *resource_type* and
        *resource_id* are present, the display name is resolved at write
        time so it survives resource deletion.
        """
        try:
            async with self._session_factory() as session:
                # Resolve display name at capture time when not provided
                if resource_display is None and resource_type:
                    try:
                        from cassini.core.resource_display import resolve_resource_display

                        if resource_id:
                            resource_display = await resolve_resource_display(
                                session, resource_type, resource_id
                            )
                        else:
                            # No ID (e.g., POST creating a new resource) — use type label
                            resource_display = await resolve_resource_display(
                                session, resource_type, 0
                            )
                    except Exception:
                        logger.debug(
                            "resource_display_resolve_failed",
                            resource_type=resource_type,
                            resource_id=resource_id,
                        )

                from datetime import datetime, timezone

                # Retry loop: on IntegrityError (duplicate sequence_number from
                # concurrent requests), re-read last_seq and retry.  This handles
                # the read-then-write race without SELECT FOR UPDATE (which
                # doesn't work on SQLite).
                for attempt in range(3):
                    try:
                        last_hash, last_seq = await self._get_last_hash_and_seq(session)
                        next_seq = last_seq + 1

                        entry = AuditLog(
                            user_id=user_id,
                            username=username,
                            action=action,
                            resource_type=resource_type,
                            resource_id=resource_id,
                            resource_display=resource_display,
                            detail=detail,
                            ip_address=ip_address,
                            user_agent=user_agent,
                            timestamp=datetime.now(timezone.utc),
                            sequence_number=next_seq,
                        )

                        # Tamper evidence: SHA-256 chain (includes sequence_number)
                        entry.sequence_hash = compute_audit_hash(
                            last_hash,
                            entry.action,
                            entry.resource_type,
                            entry.resource_id,
                            entry.user_id,
                            entry.username,
                            entry.timestamp,
                            sequence_number=entry.sequence_number,
                        )
                        self._last_hash = entry.sequence_hash

                        session.add(entry)
                        await session.flush()
                        await session.commit()
                        break
                    except IntegrityError:
                        await session.rollback()
                        if attempt == 2:
                            raise
                        continue
        except Exception:
            self._failure_count += 1
            from datetime import datetime, timezone

            self._last_failure_at = datetime.now(timezone.utc).isoformat()
            logger.warning("audit_log_failed", action=action, failure_count=self._failure_count, exc_info=True)

    async def log_login(
        self,
        username: str,
        success: bool,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        user_id: Optional[int] = None,
    ) -> None:
        """Log a login attempt."""
        action = "login" if success else "login_failed"
        await self.log(
            action=action,
            username=username,
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def log_event(
        self,
        action: str,
        resource_type: str,
        resource_id: Optional[int] = None,
        detail: Optional[dict] = None,
    ) -> None:
        """Log a system event (from event bus)."""
        await self.log(
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
            username="system",
        )

    async def recover_last_hash(self) -> None:
        """Load the last sequence_hash from DB to continue the chain after restart."""
        try:
            async with self._session_factory() as session:
                last_hash, last_seq = await self._get_last_hash_and_seq(session)
                if last_hash != "0" * 64:
                    self._last_hash = last_hash
                    logger.info(
                        "audit_hash_chain_recovered",
                        last_hash=last_hash[:12],
                        last_sequence=last_seq,
                    )
        except Exception:
            logger.warning("audit_hash_chain_recovery_failed", exc_info=True)

    def get_health(self) -> dict:
        """Return audit subsystem health status.

        Returns a dict with failure_count, last_failure_at, and an
        overall status string ("healthy" or "degraded").  The threshold
        for degraded is >10 cumulative failures.
        """
        return {
            "failure_count": self._failure_count,
            "last_failure_at": self._last_failure_at,
            "status": "degraded" if self._failure_count > 10 else "healthy",
        }

    def setup_subscriptions(self, event_bus) -> None:
        """Wire all audit event subscriptions to the event bus.

        Consolidates audit event handlers that were previously inline closures
        in main.py lifespan.
        """
        from cassini.core.events import (
            AnomalyDetectedEvent,
            BatchEvaluationCompleteEvent,
            CharacteristicCreatedEvent,
            CharacteristicDeletedEvent,
            ControlLimitsUpdatedEvent,
            ERPSyncCompletedEvent,
            PredictedOOCEvent,
            PurgeCompletedEvent,
            SampleProcessedEvent,
            SignatureCreatedEvent,
            SignatureInvalidatedEvent,
            SignatureRejectedEvent,
            ViolationCreatedEvent,
            WorkflowCompletedEvent,
            WorkflowExpiredEvent,
        )

        async def _audit_violation_created(event):
            await self.log_event(
                action="violation_created",
                resource_type="violation",
                resource_id=event.violation_id,
                detail={"rule_id": event.rule_id, "rule_name": event.rule_name, "severity": event.severity},
            )

        async def _audit_limits_updated(event):
            await self.log_event(
                action="recalculate",
                resource_type="characteristic",
                resource_id=event.characteristic_id,
                detail={"ucl": event.ucl, "lcl": event.lcl, "center_line": event.center_line},
            )

        async def _audit_char_created(event):
            await self.log_event(
                action="create",
                resource_type="characteristic",
                resource_id=event.characteristic_id,
                detail={"name": event.name, "chart_type": event.chart_type},
            )

        async def _audit_char_deleted(event):
            await self.log_event(
                action="delete",
                resource_type="characteristic",
                resource_id=event.characteristic_id,
                detail={"name": event.name},
            )

        async def _audit_anomaly_detected(event):
            await self.log_event(
                action="detect",
                resource_type="anomaly",
                resource_id=event.characteristic_id,
                detail={
                    "source": "event_bus",
                    "anomaly_event_id": event.anomaly_event_id,
                    "detector_type": event.detector_type,
                    "event_type": event.event_type,
                    "severity": event.severity,
                },
            )

        async def _audit_erp_sync_completed(event):
            await self.log_event(
                action="sync",
                resource_type="erp_connector",
                resource_id=event.connector_id,
                detail={
                    "source": "event_bus",
                    "connector_name": event.connector_name,
                    "direction": event.direction,
                    "status": event.status,
                    "records_processed": event.records_processed,
                    "records_failed": event.records_failed,
                },
            )

        async def _audit_sample_processed(event):
            await self.log_event(
                action="process",
                resource_type="sample",
                resource_id=event.sample_id,
                detail={
                    "characteristic_id": event.characteristic_id,
                    "in_control": event.in_control,
                    "zone": event.zone,
                },
            )

        async def _audit_signature_created(event):
            await self.log_event(
                action="sign",
                resource_type="signature",
                resource_id=event.signature_id,
                detail={
                    "user_id": event.user_id,
                    "username": event.username,
                    "resource_type": event.resource_type,
                    "resource_id": event.resource_id,
                    "meaning_code": event.meaning_code,
                },
            )

        async def _audit_signature_rejected(event):
            await self.log_event(
                action="reject",
                resource_type="signature",
                resource_id=event.workflow_instance_id,
                detail={
                    "user_id": event.user_id,
                    "username": event.username,
                    "resource_type": event.resource_type,
                    "resource_id": event.resource_id,
                    "reason": event.reason,
                },
            )

        async def _audit_workflow_completed(event):
            await self.log_event(
                action="complete",
                resource_type="workflow",
                resource_id=event.workflow_instance_id,
                detail={
                    "resource_type": event.resource_type,
                    "resource_id": event.resource_id,
                },
            )

        async def _audit_signature_invalidated(event):
            await self.log_event(
                action="invalidate",
                resource_type="signature",
                detail={
                    "source": "event_bus",
                    "resource_type": event.resource_type,
                    "resource_id": event.resource_id,
                    "invalidated_count": len(event.invalidated_signature_ids),
                    "reason": event.reason,
                },
            )

        async def _audit_workflow_expired(event):
            await self.log_event(
                action="expire",
                resource_type="workflow",
                resource_id=event.workflow_instance_id,
                detail={
                    "source": "event_bus",
                    "resource_type": event.resource_type,
                    "resource_id": event.resource_id,
                },
            )

        async def _audit_predicted_ooc(event):
            await self.log_event(
                action="predict_ooc",
                resource_type="prediction",
                resource_id=event.characteristic_id,
                detail={
                    "source": "event_bus",
                    "forecast_step": event.forecast_step,
                    "predicted_value": event.predicted_value,
                    "limit_type": event.limit_type,
                    "limit_value": event.limit_value,
                    "model_type": event.model_type,
                },
            )

        async def _audit_purge_completed(event):
            await self.log_event(
                action="purge",
                resource_type="retention",
                resource_id=event.plant_id,
                detail={
                    "source": "event_bus",
                    "samples_deleted": event.samples_deleted,
                    "violations_deleted": event.violations_deleted,
                    "characteristics_processed": event.characteristics_processed,
                },
            )

        async def _audit_batch_evaluation_complete(event):
            await self.log_event(
                action="batch_evaluate",
                resource_type="sample",
                resource_id=event.characteristic_id,
                detail={
                    "source": "event_bus",
                    "sample_count": event.sample_count,
                    "violation_count": event.violation_count,
                },
            )

        # Registry of all audited events for visibility
        _AUDITED_EVENTS = {
            BatchEvaluationCompleteEvent: _audit_batch_evaluation_complete,
            ViolationCreatedEvent: _audit_violation_created,
            ControlLimitsUpdatedEvent: _audit_limits_updated,
            CharacteristicCreatedEvent: _audit_char_created,
            CharacteristicDeletedEvent: _audit_char_deleted,
            AnomalyDetectedEvent: _audit_anomaly_detected,
            ERPSyncCompletedEvent: _audit_erp_sync_completed,
            SampleProcessedEvent: _audit_sample_processed,
            SignatureCreatedEvent: _audit_signature_created,
            SignatureRejectedEvent: _audit_signature_rejected,
            WorkflowCompletedEvent: _audit_workflow_completed,
            SignatureInvalidatedEvent: _audit_signature_invalidated,
            WorkflowExpiredEvent: _audit_workflow_expired,
            PredictedOOCEvent: _audit_predicted_ooc,
            PurgeCompletedEvent: _audit_purge_completed,
        }

        for event_type, handler in _AUDITED_EVENTS.items():
            event_bus.subscribe(event_type, handler)

        logger.info("audit_subscriptions_wired", event_count=len(_AUDITED_EVENTS))


class AuditMiddleware:
    """Pure ASGI middleware for audit logging.

    Logs all mutating API requests (POST/PUT/PATCH/DELETE) without
    double-buffering the request body. Gets AuditService lazily from
    app.state so it can be registered before lifespan.

    Compatible with ``app.add_middleware(AuditMiddleware)`` — Starlette wraps
    any class with ``__init__(app)`` + ``__call__(scope, receive, send)``.
    """

    # Sensitive path segments that are eligible for GET auditing
    _SENSITIVE_GET_SEGMENTS = ("/audit/", "/users/", "/signatures/", "/export")

    # Rate-limit interval (seconds) for GET audit entries per (path_prefix, user_id) combo
    _GET_RATE_LIMIT_SECONDS = 300  # 5 minutes

    # Maximum entries in the rate-limit cache before eviction
    _GET_CACHE_MAX_SIZE = 1000

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        # Toggle for GET request auditing (Enterprise only, off by default).
        # Set to True at runtime to enable auditing of GET requests to
        # sensitive endpoints (audit, users, signatures, export).
        self.audit_gets: bool = False
        # In-memory rate-limit cache: (path_prefix, user_id) -> last_logged_timestamp.
        # NOTE: each ASGI worker has its own cache — in multi-worker deployments
        # the effective rate limit is per-worker, not global.
        self._get_audit_cache: dict[tuple[str, int], float] = {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Build a lightweight Request wrapper to read headers/path/state
        request = Request(scope, receive)

        method = scope["method"]

        # ---------------------------------------------------------------
        # Body caching: intercept `receive` to capture JSON body <100KB
        # for Tier 2 auto-capture without consuming the stream.
        # ---------------------------------------------------------------
        cached_body: dict | None = None
        body_chunks: list[bytes] = []
        body_complete = False

        should_cache_body = method in ("POST", "PUT", "PATCH")
        if should_cache_body:
            headers = dict(scope.get("headers", []))
            content_type = (headers.get(b"content-type", b"") or b"").decode("latin-1")
            content_length_raw = (headers.get(b"content-length", b"0") or b"0").decode("latin-1")
            try:
                content_length = int(content_length_raw)
            except (ValueError, TypeError):
                content_length = 0
            should_cache_body = (
                "application/json" in content_type
                and 0 < content_length <= 102400
            )

        async def receive_wrapper() -> Message:
            nonlocal body_complete, cached_body
            message = await receive()

            if should_cache_body and not body_complete and message["type"] == "http.request":
                chunk = message.get("body", b"")
                if chunk:
                    body_chunks.append(chunk)
                if not message.get("more_body", False):
                    body_complete = True
                    raw = b"".join(body_chunks)
                    if raw:
                        try:
                            cached_body = _json.loads(raw)
                        except Exception:
                            cached_body = None

            return message

        # ---------------------------------------------------------------
        # Response status capture: intercept `send` to read status code
        # ---------------------------------------------------------------
        response_status = 0

        async def send_wrapper(message: Message) -> None:
            nonlocal response_status
            if message["type"] == "http.response.start":
                response_status = message.get("status", 0)
            await send(message)

        # ---------------------------------------------------------------
        # Run the inner app
        # ---------------------------------------------------------------
        try:
            await self.app(scope, receive_wrapper, send_wrapper)
        except Exception:
            # If the inner app raises, mark as 500 so the audit log
            # correctly records the request as failed (not a false success).
            response_status = 500
            raise

        # ---------------------------------------------------------------
        # Post-response audit logging (fire-and-forget)
        # ---------------------------------------------------------------
        audit_service: Optional[AuditService] = getattr(
            request.app.state, "audit_service", None
        )
        if audit_service is None:
            return

        path = scope.get("path", "")

        if (
            method in ("POST", "PUT", "PATCH", "DELETE")
            and response_status < 400
            and path not in _SKIP_PATHS
            and not any(
                seg in path
                for seg in (
                    "/auth/login", "/auth/logout", "/auth/refresh", "/auth/token",
                )
            )
        ):
            # Extract user info from JWT (best-effort)
            user_id, username = _extract_user_from_request(request)
            ip = _get_client_ip(request)
            ua = (request.headers.get("user-agent") or "")[:512]

            # Check for endpoint-injected audit context (Tier 1)
            audit_ctx: dict | None = getattr(request.state, "audit_context", None)

            if audit_ctx:
                # Tier 1: endpoint set rich context
                resource_type = audit_ctx.get("resource_type") or _parse_resource(path)[0]
                resource_id = audit_ctx.get("resource_id") or _parse_resource(path)[1]
                action = audit_ctx.get("action") or _method_to_action(method, path)
                detail: dict = {
                    "summary": audit_ctx.get("summary"),
                    **(audit_ctx.get("fields") or {}),
                }
            else:
                # Tier 2: auto-capture sanitized request body
                resource_type, resource_id = _parse_resource(path)
                action = _method_to_action(method, path)
                detail = {"method": method, "path": path}
                if cached_body and isinstance(cached_body, dict):
                    detail["body"] = _sanitize_body(cached_body)

            # Fire and forget — don't block the response
            asyncio.create_task(
                audit_service.log(
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    user_id=user_id,
                    username=username,
                    ip_address=ip,
                    user_agent=ua,
                    detail=detail,
                )
            )

        # ---------------------------------------------------------------
        # GET auditing (Enterprise only, rate-limited)
        # ---------------------------------------------------------------
        elif (
            method == "GET"
            and self.audit_gets
            and response_status < 400
            and path not in _SKIP_PATHS
            and any(seg in path for seg in self._SENSITIVE_GET_SEGMENTS)
        ):
            user_id, username = _extract_user_from_request(request)
            # Determine a coarse path prefix for rate-limit grouping
            # (e.g. "/api/v1/audit/" or "/api/v1/users/")
            path_prefix = path
            for seg in self._SENSITIVE_GET_SEGMENTS:
                idx = path.find(seg)
                if idx >= 0:
                    path_prefix = path[: idx + len(seg)]
                    break

            cache_key = (path_prefix, user_id or 0)
            now = time.monotonic()
            last_logged = self._get_audit_cache.get(cache_key)

            if last_logged is None or (now - last_logged) >= self._GET_RATE_LIMIT_SECONDS:
                # Evict oldest entries if cache exceeds cap
                if len(self._get_audit_cache) >= self._GET_CACHE_MAX_SIZE:
                    # Remove the oldest 25% to avoid evicting on every request
                    sorted_keys = sorted(self._get_audit_cache, key=self._get_audit_cache.get)  # type: ignore[arg-type]
                    for k in sorted_keys[: self._GET_CACHE_MAX_SIZE // 4]:
                        del self._get_audit_cache[k]

                self._get_audit_cache[cache_key] = now

                ip = _get_client_ip(request)
                ua = (request.headers.get("user-agent") or "")[:512]
                resource_type, resource_id = _parse_resource(path)

                asyncio.create_task(
                    audit_service.log(
                        action="view",
                        resource_type=resource_type,
                        resource_id=resource_id,
                        user_id=user_id,
                        username=username,
                        ip_address=ip,
                        user_agent=ua,
                        detail={"method": "GET", "path": path},
                    )
                )


def _extract_user_from_request(request: Request) -> tuple[Optional[int], Optional[str]]:
    """Best-effort JWT user extraction for middleware logging.

    If the auth middleware has already verified the token and stored a ``user``
    object on ``request.state``, we use that (verified attribution).

    Otherwise we fall back to base64-decoding the JWT payload WITHOUT
    verifying the signature.  In that case the extracted username is
    prefixed with ``[unverified] `` so audit logs clearly distinguish
    verified vs unverified attributions.
    """
    # Prefer verified user from auth middleware (set on successful auth)
    verified_user = getattr(request.state, "user", None)
    if verified_user is not None:
        uid = getattr(verified_user, "id", None)
        uname = getattr(verified_user, "username", None)
        if uid or uname:
            return uid, uname

    # Fallback: decode JWT payload without verification
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, None

    try:
        import base64
        import json

        token = auth_header.split(" ", 1)[1]
        parts = token.split(".")
        if len(parts) != 3:
            return None, None

        # Decode payload (add padding)
        payload_b64 = parts[1] + "=" * (4 - len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))

        username = payload.get("username") or None
        # Mark as unverified — JWT signature was NOT checked.
        # Set user_id to None: an unverified JWT could be forged,
        # so we must not attribute actions to a specific user_id
        # (that would enable framing).  The [unverified] username
        # prefix is sufficient for human identification.
        if username:
            username = f"[unverified] {username}"
        return None, username
    except Exception:
        return None, None


def _get_client_ip(request: Request) -> str:
    """Get the client IP address, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
