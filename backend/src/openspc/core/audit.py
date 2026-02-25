"""Audit trail service and middleware.

Provides centralized audit logging for all user actions, login events,
and system events. The AuditMiddleware automatically logs mutating API
requests (POST/PUT/PATCH/DELETE) without blocking responses.
"""

import asyncio
import re
from typing import Optional

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from openspc.db.models.audit_log import AuditLog

logger = structlog.get_logger(__name__)

# Map URL path segments to resource types
_RESOURCE_PATTERNS: list[tuple[re.Pattern, str]] = [
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
    if "activate" in path:
        return "activate"
    if "discover" in path:
        return "discover"
    method_map = {
        "POST": "create",
        "PUT": "update",
        "PATCH": "update",
        "DELETE": "delete",
    }
    return method_map.get(method, "unknown")


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


class AuditMiddleware(BaseHTTPMiddleware):
    """Logs all mutating API requests (POST/PUT/PATCH/DELETE).

    Runs after the response is sent so it does not slow down the request.
    Gets AuditService lazily from app.state so it can be registered before lifespan.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Get audit service lazily from app state
        audit_service: Optional[AuditService] = getattr(request.app.state, "audit_service", None)
        if audit_service is None:
            return response

        # Only log mutating requests that succeeded
        if (
            request.method in ("POST", "PUT", "PATCH", "DELETE")
            and response.status_code < 400
            and request.url.path not in _SKIP_PATHS
            # Skip auth endpoints (login/logout handled separately)
            and "/auth/" not in request.url.path
        ):
            # Extract user info from JWT (best-effort, don't block on failure)
            user_id, username = _extract_user_from_request(request)
            resource_type, resource_id = _parse_resource(request.url.path)
            action = _method_to_action(request.method, request.url.path)
            ip = _get_client_ip(request)
            ua = (request.headers.get("user-agent") or "")[:512]

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
                    detail={"method": request.method, "path": request.url.path},
                )
            )

        return response


def _extract_user_from_request(request: Request) -> tuple[Optional[int], Optional[str]]:
    """Best-effort JWT user extraction for middleware logging.

    Does NOT validate the token fully — that's the endpoint's job.
    Just decodes the payload to get user_id and username.
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
