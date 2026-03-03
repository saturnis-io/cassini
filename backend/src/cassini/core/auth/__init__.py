"""Authentication module for Cassini.

Note: api_key is NOT imported at module level to avoid a circular dependency:
  deps.py -> core.auth.roles -> core.auth.__init__ -> core.auth.api_key -> deps.py
api_key is imported lazily where needed (deps.py already does this).
"""

from cassini.core.auth.jwt import (
    create_access_token,
    create_refresh_token,
    verify_access_token,
    verify_refresh_token,
)
from cassini.core.auth.passwords import hash_password, needs_rehash, verify_password


def __getattr__(name: str):
    """Lazy import for api_key symbols to break circular dependency."""
    if name in ("APIKeyAuth", "verify_api_key"):
        from cassini.core.auth.api_key import APIKeyAuth, verify_api_key

        globals()["APIKeyAuth"] = APIKeyAuth
        globals()["verify_api_key"] = verify_api_key
        return globals()[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    # API Key auth (lazy-loaded)
    "APIKeyAuth",
    "verify_api_key",
    # JWT auth
    "create_access_token",
    "create_refresh_token",
    "verify_access_token",
    "verify_refresh_token",
    # Password hashing
    "hash_password",
    "verify_password",
    "needs_rehash",
]
