"""Abstract base class for ERP/LIMS integration adapters.

Each adapter implements connection management, authentication, and
data fetch/push operations for a specific ERP system.
"""

from abc import ABC, abstractmethod
from typing import Any, Optional

import structlog

logger = structlog.get_logger(__name__)


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
                results.append({"success": False, "error": str(e)})
        return results

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
