"""SAP OData v4 adapter for ERP integration.

Supports OAuth2 client credentials or basic auth.
Implements OData v4 query options: $filter, $select, $expand, $top, $skip.
"""

import time
from typing import Any, Optional

import httpx
import structlog

from openspc.core.erp.base import BaseERPAdapter

logger = structlog.get_logger(__name__)


class SAPODataAdapter(BaseERPAdapter):
    """SAP S/4HANA / ECC OData v4 connector."""

    async def test_connection(self) -> dict[str, Any]:
        try:
            await self.authenticate()
            headers = self._build_auth_headers()
            async with httpx.AsyncClient(timeout=15.0, verify=True) as client:
                resp = await client.get(f"{self.base_url}/$metadata", headers=headers)
                if resp.status_code == 200:
                    return {"success": True, "message": "Connected to SAP OData service", "details": {"status_code": 200}}
                return {"success": False, "message": f"SAP returned HTTP {resp.status_code}", "details": {"status_code": resp.status_code}}
        except Exception as e:
            return {"success": False, "message": str(e)}

    async def authenticate(self) -> None:
        if self.auth_type == "basic":
            return  # Basic auth uses headers per-request

        if self.auth_type == "oauth2_client_credentials":
            # Check cached token
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
                logger.info("sap_oauth2_authenticated", token_url=token_url)

    async def fetch_records(
        self, entity: str, filters: dict[str, Any] | None = None, limit: int = 100, offset: int = 0
    ) -> list[dict[str, Any]]:
        await self.authenticate()
        headers = self._build_auth_headers()
        headers["Accept"] = "application/json"

        params: dict[str, str] = {
            "$top": str(limit),
            "$skip": str(offset),
            "$format": "json",
        }

        if filters:
            import re
            filter_parts = []
            for key, value in filters.items():
                # Validate key is a safe OData identifier (alphanumeric + underscores)
                if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', key):
                    continue
                if isinstance(value, str):
                    # Escape single quotes (OData convention: double them)
                    escaped = value.replace("'", "''")
                    filter_parts.append(f"{key} eq '{escaped}'")
                else:
                    filter_parts.append(f"{key} eq {value}")
            if filter_parts:
                params["$filter"] = " and ".join(filter_parts)

        url = f"{self.base_url}/{entity}"

        async with httpx.AsyncClient(timeout=30.0, verify=True) as client:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            # OData v4 wraps results in "value" array
            return data.get("value", data.get("d", {}).get("results", []))

    async def push_record(self, entity: str, data: dict[str, Any]) -> dict[str, Any]:
        await self.authenticate()
        headers = self._build_auth_headers()
        headers["Content-Type"] = "application/json"
        headers["Accept"] = "application/json"

        url = f"{self.base_url}/{entity}"

        async with httpx.AsyncClient(timeout=30.0, verify=True) as client:
            resp = await client.post(url, headers=headers, json=data)
            resp.raise_for_status()
            return resp.json() if resp.content else {"status": "created"}
