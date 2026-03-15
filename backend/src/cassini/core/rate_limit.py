"""Rate limiting configuration using SlowAPI.

Provides a shared Limiter instance that can be imported by route modules
to apply rate limit decorators. The limiter is disabled when dev_mode is True.

Rate limit keys are per-API-key (hashed) when present, otherwise per-IP.
"""

import hashlib

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from cassini.core.config import get_settings

settings = get_settings()


def get_rate_limit_key(request: Request) -> str:
    """Rate limit per API key (if present) or per IP."""
    api_key = request.headers.get("X-API-Key")
    if api_key:
        return f"apikey:{hashlib.sha256(api_key.encode()).hexdigest()[:16]}"
    return get_remote_address(request)


limiter = Limiter(
    key_func=get_rate_limit_key,
    enabled=not settings.dev_mode,
    default_limits=[settings.rate_limit_default],
)
