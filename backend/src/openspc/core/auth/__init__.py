"""Authentication module for OpenSPC."""

from openspc.core.auth.api_key import APIKeyAuth, verify_api_key
from openspc.core.auth.jwt import (
    create_access_token,
    create_refresh_token,
    verify_access_token,
    verify_refresh_token,
)
from openspc.core.auth.passwords import hash_password, needs_rehash, verify_password

__all__ = [
    # API Key auth
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
