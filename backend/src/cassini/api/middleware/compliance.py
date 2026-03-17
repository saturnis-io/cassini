"""Compliance and license enforcement middleware.

ComplianceMiddleware: Blocks most API requests when the system has more active
plants than the license allows.

LicenseEnforcementMiddleware: Blocks access to commercial (Pro/Enterprise)
endpoints when the current license tier does not cover them.  This ensures
that once a license is removed via DELETE /license, the already-registered
FastAPI routers return 403 instead of continuing to serve data.
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


# ---------------------------------------------------------------------------
# License tier enforcement
# ---------------------------------------------------------------------------

# Tier rank — higher is a superset of lower
_TIER_RANK = {"community": 0, "pro": 1, "enterprise": 2}

def _compile_route_patterns(routers: list) -> list[re.Pattern]:
    """Convert APIRouter path templates into compiled regex patterns.

    Each router has a ``prefix`` and individual routes with ``path``.
    Path parameters (e.g. ``{char_id}``) are converted to ``[^/]+``
    so the regex can match actual URL paths at runtime.

    Returns a list of compiled regex patterns.
    """
    patterns: list[re.Pattern] = []
    seen: set[str] = set()

    for router in routers:
        prefix = getattr(router, "prefix", "") or ""
        for route in getattr(router, "routes", []):
            route_path = getattr(route, "path", "")
            template = prefix + route_path
            if not template or template in seen:
                continue
            seen.add(template)

            # Build regex by splitting path segments: literal segments are
            # escaped, path parameter segments become [^/]+.
            parts = template.split("/")
            regex_parts = []
            for part in parts:
                if part.startswith("{") and part.endswith("}"):
                    regex_parts.append("[^/]+")
                else:
                    regex_parts.append(re.escape(part))
            regex_str = "^" + "/".join(regex_parts) + "$"
            patterns.append(re.compile(regex_str))

    return patterns


class LicenseEnforcementMiddleware(BaseHTTPMiddleware):
    """Gates commercial endpoints behind a runtime license check.

    On startup (and when a license is uploaded/removed at runtime) the
    ``app.state.license_service`` reflects the current tier.  This
    middleware intercepts every request and:

    1. Checks if the URL path matches a commercial route pattern.
    2. If so, verifies the current license tier covers it.
    3. Returns 403 if the tier is insufficient.

    Route patterns are compiled once (lazily, on first request) from
    ``app.state.pro_routers`` and ``app.state.enterprise_routers`` and
    cached for the lifetime of the process.
    """

    def __init__(self, app) -> None:
        super().__init__(app)
        self._pro_patterns: list[re.Pattern] | None = None
        self._enterprise_patterns: list[re.Pattern] | None = None

    def _ensure_patterns(self, app) -> None:
        """Lazily compile the commercial route patterns from app.state routers."""
        if self._pro_patterns is not None:
            return

        pro_routers = getattr(app.state, "pro_routers", []) or []
        enterprise_routers = getattr(app.state, "enterprise_routers", []) or []

        self._pro_patterns = _compile_route_patterns(pro_routers)
        self._enterprise_patterns = _compile_route_patterns(enterprise_routers)

    def _match_tier(self, path: str) -> str | None:
        """Return the required tier for a path, or None if community."""
        # Check enterprise first (more restrictive)
        for pattern in self._enterprise_patterns:
            if pattern.match(path):
                return "enterprise"
        for pattern in self._pro_patterns:
            if pattern.match(path):
                return "pro"
        return None

    async def dispatch(self, request: Request, call_next) -> Response:
        self._ensure_patterns(request.app)

        # Fast path: if no commercial routes are registered, skip
        if not self._pro_patterns and not self._enterprise_patterns:
            return await call_next(request)

        path = request.url.path
        required_tier = self._match_tier(path)

        if required_tier is None:
            # Community route — always allowed
            return await call_next(request)

        # Check current license tier
        license_service = getattr(request.app.state, "license_service", None)
        if license_service is None:
            return JSONResponse(
                status_code=403,
                content={"detail": f"This feature requires a {required_tier.title()} license"},
            )

        current_tier = license_service.tier  # "community", "pro", or "enterprise"
        current_rank = _TIER_RANK.get(current_tier, 0)
        required_rank = _TIER_RANK.get(required_tier, 0)

        if current_rank < required_rank:
            if required_tier == "enterprise":
                msg = "This feature requires an Enterprise license"
            else:
                msg = "This feature requires a Pro or Enterprise license"
            return JSONResponse(
                status_code=403,
                content={"detail": msg},
            )

        return await call_next(request)
