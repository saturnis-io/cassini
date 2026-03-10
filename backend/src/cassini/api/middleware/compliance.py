"""Compliance enforcement middleware.

Blocks most API requests when the system has more active plants
than the license allows. Only allows endpoints needed to resolve
the compliance violation (license management, auth, plant deactivation,
plant reads).
"""

import re

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# Pre-compiled pattern for the plant deactivate endpoint
_DEACTIVATE_PATTERN = re.compile(r"^/api/v1/plants/\d+/deactivate$")

# Paths always allowed regardless of compliance status
_ALWAYS_ALLOWED_PREFIXES = (
    "/api/v1/license",
    "/api/v1/auth",
)

_ALWAYS_ALLOWED_EXACT = frozenset({
    "/health",
    "/",
    "/docs",
    "/openapi.json",
    "/redoc",
})


class ComplianceMiddleware(BaseHTTPMiddleware):
    """Blocks API requests when plant count exceeds license limit.

    Reads ``app.state.compliance_excess`` (default 0) to decide.
    When excess > 0:
      - ALLOW: license/*, auth/*, health, docs, openapi.json
      - ALLOW: GET requests to /api/v1/plants/*
      - ALLOW: POST to /api/v1/plants/{id}/deactivate
      - BLOCK everything else with 423 Locked
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        excess = getattr(request.app.state, "compliance_excess", 0)
        if excess <= 0:
            return await call_next(request)

        path = request.url.path

        # Always allowed exact paths
        if path in _ALWAYS_ALLOWED_EXACT:
            return await call_next(request)

        # Always allowed prefixes
        for prefix in _ALWAYS_ALLOWED_PREFIXES:
            if path.startswith(prefix):
                return await call_next(request)

        # Allow GET requests to plants (so admin can see which to deactivate)
        if request.method == "GET" and path.startswith("/api/v1/plants"):
            return await call_next(request)

        # Allow POST to deactivate endpoint
        if request.method == "POST" and _DEACTIVATE_PATTERN.match(path):
            return await call_next(request)

        # Block everything else
        return JSONResponse(
            status_code=423,
            content={
                "detail": (
                    f"System locked: {excess} plant(s) exceed your license limit. "
                    "Deactivate plants or upgrade your license to restore access."
                ),
            },
        )
