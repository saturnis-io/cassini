"""Authentication module for OpenSPC."""

from openspc.core.auth.api_key import APIKeyAuth, verify_api_key

__all__ = ["APIKeyAuth", "verify_api_key"]
