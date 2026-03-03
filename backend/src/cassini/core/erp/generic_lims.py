"""Generic LIMS REST adapter with configurable endpoints.

Supports any LIMS system with REST APIs. Uses jsonpath-ng for flexible
response extraction. Supports API key, OAuth2, and basic auth.
"""

from typing import Any

import httpx
import structlog

from cassini.core.erp.base import BaseERPAdapter

logger = structlog.get_logger(__name__)


class GenericLIMSAdapter(BaseERPAdapter):
    """Generic LIMS connector — configurable endpoints and JSONPath extraction."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        # Endpoint URL templates from auth_config
        self._endpoints: dict[str, str] = self.auth_config.get("endpoints", {})

    async def test_connection(self) -> dict[str, Any]:
        try:
            await self.authenticate()
            headers = self._build_auth_headers()
            # Try a simple GET on the base URL
            async with httpx.AsyncClient(timeout=15.0, verify=True) as client:
                resp = await client.get(self.base_url, headers=headers)
                if resp.status_code < 400:
                    return {"success": True, "message": f"Connected to LIMS (HTTP {resp.status_code})"}
                return {"success": False, "message": f"LIMS returned HTTP {resp.status_code}"}
        except Exception:
            logger.exception("lims_test_connection_failed")
            return {"success": False, "message": "Connection test failed"}

    async def authenticate(self) -> None:
        if self.auth_type in ("basic", "api_key"):
            return  # Handled by _build_auth_headers

        if self.auth_type == "oauth2_client_credentials":
            import time
            if self._access_token and time.time() < self._token_expires_at - 60:
                return

            token_url = self.auth_config.get("token_url", "")
            client_id = self.auth_config.get("client_id", "")
            client_secret = self.auth_config.get("client_secret", "")

            if not token_url:
                raise ConnectionError("OAuth2 token_url not configured for LIMS")

            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    token_url,
                    data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret},
                )
                resp.raise_for_status()
                token_data = resp.json()
                self._access_token = token_data["access_token"]
                self._token_expires_at = time.time() + token_data.get("expires_in", 3600)

    async def fetch_records(
        self, entity: str, filters: dict[str, Any] | None = None, limit: int = 100, offset: int = 0
    ) -> list[dict[str, Any]]:
        await self.authenticate()
        headers = self._build_auth_headers()
        headers["Accept"] = "application/json"

        # Use configured endpoint URL template, fallback to entity path
        endpoint_template = self._endpoints.get(entity, entity)
        url = f"{self.base_url}/{endpoint_template}"

        params: dict[str, str] = {"limit": str(limit), "offset": str(offset)}
        if filters:
            for key, value in filters.items():
                params[key] = str(value)

        async with httpx.AsyncClient(timeout=30.0, verify=True) as client:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()

        # Try JSONPath extraction if configured
        jsonpath_expr = self.auth_config.get("result_path")
        if jsonpath_expr:
            try:
                from jsonpath_ng import parse
                expr = parse(jsonpath_expr)
                matches = expr.find(data)
                return [m.value for m in matches] if matches else []
            except Exception as e:
                logger.warning("jsonpath_extraction_failed", error=str(e), path=jsonpath_expr)

        # Default: try common response structures
        if isinstance(data, list):
            return data
        for key in ("items", "results", "data", "records"):
            if key in data and isinstance(data[key], list):
                return data[key]
        return [data] if data else []

    async def push_record(self, entity: str, data: dict[str, Any]) -> dict[str, Any]:
        await self.authenticate()
        headers = self._build_auth_headers()
        headers["Content-Type"] = "application/json"

        endpoint_template = self._endpoints.get(entity, entity)
        url = f"{self.base_url}/{endpoint_template}"

        async with httpx.AsyncClient(timeout=30.0, verify=True) as client:
            resp = await client.post(url, headers=headers, json=data)
            resp.raise_for_status()
            return resp.json() if resp.content else {"status": "created"}
