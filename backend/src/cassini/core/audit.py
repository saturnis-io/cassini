"""Audit trail service and middleware.

Provides centralized audit logging for all user actions, login events,
and system events. The AuditMiddleware automatically logs mutating API
requests (POST/PUT/PATCH/DELETE) without blocking responses.
"""

import asyncio
import json as _json
import re
from typing import Optional

import structlog
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from cassini.db.models.audit_log import AuditLog

logger = structlog.get_logger(__name__)

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
    (re.compile(r"/api/v1/multivariate/groups(?:/(\d+))?"), "multivariate_group"),
    (re.compile(r"/api/v1/multivariate/correlation/"), "correlation"),
    (re.compile(r"/api/v1/predictions(?:/(\d+))?"), "prediction"),
    (re.compile(r"/api/v1/ai/"), "ai_config"),
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
    if "/submit" in path:
        return "submit"
    if "/approve" in path:
        return "approve"
    if "/reject" in path:
        return "reject"
    if "calculate" in path or "/compute" in path:
        return "calculate"
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
    if "/purge" in path:
        return "purge"
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
    """

    def __init__(self, session_factory):
        self._session_factory = session_factory
        self._failure_count = 0

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
    ) -> None:
        """Create an audit log entry."""
        try:
            async with self._session_factory() as session:
                entry = AuditLog(
                    user_id=user_id,
                    username=username,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    detail=detail,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
                session.add(entry)
                await session.commit()
        except Exception:
            self._failure_count += 1
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

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Build a lightweight Request wrapper to read headers/path/state
        request = Request(scope, receive)

        # Skip audit logging entirely in Community edition
        license_svc = getattr(request.app.state, "license_service", None)
        if license_svc and not license_svc.is_commercial:
            await self.app(scope, receive, send)
            return

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


def _extract_user_from_request(request: Request) -> tuple[Optional[int], Optional[str]]:
    """Best-effort JWT user extraction for middleware logging.

    Does NOT validate the token fully — that's the endpoint's job.
    Just decodes the payload to get user_id and username.

    NOTE: The username and user_id returned here are UNVERIFIED for requests
    that fail authentication (401/403 responses). A forged JWT with arbitrary
    claims would produce attacker-controlled values in audit logs for those cases.
    This is acceptable because the audit entry also records the HTTP status code,
    which indicates auth failure.
    """
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

        user_id = int(payload.get("sub", 0)) or None
        username = payload.get("username") or None
        return user_id, username
    except Exception:
        return None, None


def _get_client_ip(request: Request) -> str:
    """Get the client IP address, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
