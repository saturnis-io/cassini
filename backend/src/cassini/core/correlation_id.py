"""Correlation ID for distributed tracing.

Every request/event gets a correlation ID at the point of entry (API request,
MQTT message, import job). Propagated through queue payloads, event bus metadata,
audit trail, and structured logs.

Usage:
    from cassini.core.correlation_id import get_correlation_id, set_correlation_id

    # In middleware — set at request entry:
    set_correlation_id(request.headers.get("X-Correlation-ID") or generate_correlation_id())

    # Anywhere in the request — read:
    cid = get_correlation_id()

    # In queue payloads — propagate:
    payload["correlation_id"] = get_correlation_id()
"""
from __future__ import annotations

import contextvars
import uuid

_correlation_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "correlation_id", default=""
)


def generate_correlation_id() -> str:
    """Generate a new correlation ID (short UUID)."""
    return uuid.uuid4().hex[:12]


def set_correlation_id(correlation_id: str) -> contextvars.Token[str]:
    """Set the correlation ID for the current context."""
    return _correlation_id_var.set(correlation_id)


def get_correlation_id() -> str:
    """Get the correlation ID for the current context."""
    return _correlation_id_var.get()
