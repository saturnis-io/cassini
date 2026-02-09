"""Rate limiting configuration using SlowAPI.

Provides a shared Limiter instance that can be imported by route modules
to apply rate limit decorators. The limiter is disabled when dev_mode is True.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from openspc.core.config import get_settings

settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address,
    enabled=not settings.dev_mode,
    default_limits=[settings.rate_limit_default],
)
