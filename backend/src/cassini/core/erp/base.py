"""Abstract base class for ERP/LIMS integration adapters.

Each adapter implements connection management, authentication, and
data fetch/push operations for a specific ERP system.
"""

import ipaddress
import socket
from abc import ABC, abstractmethod
from typing import Any, Optional
from urllib.parse import urlparse

import structlog

logger = structlog.get_logger(__name__)


def validate_external_url(url: str) -> None:
    """Validate that a URL does not point to private/loopback/link-local addresses.

    Raises ValueError if the URL targets an internal network address.
    """
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid URL: no hostname")

    # Try to resolve the hostname and check all resolved IPs
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError("Internal network addresses are not allowed")
    except ValueError as e:
        if "Internal" in str(e) or "Invalid URL" in str(e):
            raise
        # It's a hostname, not an IP — resolve it
        try:
            resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            for family, _type, _proto, _canonname, sockaddr in resolved:
                addr = ipaddress.ip_address(sockaddr[0])
                if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
                    raise ValueError("Internal network addresses are not allowed")
        except socket.gaierror:
            pass  # DNS resolution failed — allow (will fail on actual request)


class BaseERPAdapter(ABC):
    """Abstract ERP adapter — all connector types must implement this.

    Args:
        base_url: Base URL of the ERP system
        auth_type: Authentication method ('basic', 'oauth2_client_credentials', 'api_key', 'jwt_bearer')
        auth_config: Decrypted authentication configuration dict
        headers: Additional HTTP headers dict
    """

    def __init__(
        self,
        base_url: str,
        auth_type: str,
        auth_config: dict[str, Any],
        headers: dict[str, str] | None = None,
    ) -> None:
        validate_external_url(base_url)
        self.base_url = base_url.rstrip("/")
        self.auth_type = auth_type
        self.auth_config = auth_config
        self.headers = headers or {}
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0

    @abstractmethod
    async def test_connection(self) -> dict[str, Any]:
        """Test connectivity to the ERP system.

        Returns:
            Dict with keys: 'success' (bool), 'message' (str), 'details' (optional dict)
        """
        ...

    @abstractmethod
    async def authenticate(self) -> None:
        """Authenticate with the ERP system and cache credentials.

        Raises:
            ConnectionError: If authentication fails
        """
        ...

    @abstractmethod
    async def fetch_records(
        self, entity: str, filters: dict[str, Any] | None = None, limit: int = 100, offset: int = 0
    ) -> list[dict[str, Any]]:
        """Fetch records from the ERP system.

        Args:
            entity: ERP entity name (e.g., 'qualityResults', 'inspectionLots')
            filters: Entity-specific filter criteria
            limit: Max records to fetch
            offset: Pagination offset

        Returns:
            List of record dicts
        """
        ...

    @abstractmethod
    async def push_record(self, entity: str, data: dict[str, Any]) -> dict[str, Any]:
        """Push a single record to the ERP system.

        Args:
            entity: ERP entity name
            data: Record data to push

        Returns:
            Response dict from ERP system
        """
        ...

    async def push_batch(self, entity: str, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Push multiple records to the ERP system.

        Default implementation sends records sequentially.
        Subclasses may override for batch APIs.
        """
        results = []
        for record in records:
            try:
                result = await self.push_record(entity, record)
                results.append({"success": True, "data": result})
            except Exception as e:
                logger.warning("erp_push_record_failed", error=str(e))
                results.append({"success": False, "error": "Push operation failed"})
        return results

    async def _authenticate_oauth2_client_credentials(self) -> None:
        """Shared OAuth2 client credentials flow for SAP and Oracle adapters."""
        import time

        import httpx

        if self._access_token and time.time() < self._token_expires_at - 60:
            return

        token_url = self.auth_config.get("token_url", "")
        client_id = self.auth_config.get("client_id", "")
        client_secret = self.auth_config.get("client_secret", "")

        if not token_url:
            raise ConnectionError("OAuth2 token_url not configured")

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            )
            resp.raise_for_status()
            token_data = resp.json()
            self._access_token = token_data["access_token"]
            self._token_expires_at = time.time() + token_data.get("expires_in", 3600)

    def _build_auth_headers(self) -> dict[str, str]:
        """Build authentication headers based on auth_type."""
        headers = dict(self.headers)

        if self.auth_type == "basic":
            import base64
            username = self.auth_config.get("username", "")
            password = self.auth_config.get("password", "")
            encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"
        elif self.auth_type in ("oauth2_client_credentials", "jwt_bearer"):
            if self._access_token:
                headers["Authorization"] = f"Bearer {self._access_token}"
        elif self.auth_type == "api_key":
            header_name = self.auth_config.get("header_name", "X-API-Key")
            api_key = self.auth_config.get("api_key", "")
            headers[header_name] = api_key

        return headers
