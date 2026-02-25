"""Oracle REST adapter for quality management integration.

Supports JWT bearer or basic auth. Targets Oracle Quality Management
REST endpoints (/qualityResults, /qualitySpecifications).
Uses offset/limit pagination.
"""

import time
from typing import Any

import httpx
import structlog

from openspc.core.erp.base import BaseERPAdapter

logger = structlog.get_logger(__name__)


class OracleRESTAdapter(BaseERPAdapter):
    """Oracle Cloud / E-Business Suite quality REST connector."""

    async def test_connection(self) -> dict[str, Any]:
        try:
            await self.authenticate()
            headers = self._build_auth_headers()
            async with httpx.AsyncClient(timeout=15.0, verify=True) as client:
                # Try the quality results endpoint with limit=1
                resp = await client.get(
                    f"{self.base_url}/qualityResults",
                    headers=headers,
                    params={"limit": "1"},
                )
                if resp.status_code in (200, 204):
                    return {"success": True, "message": "Connected to Oracle REST API"}
                return {"success": False, "message": f"Oracle returned HTTP {resp.status_code}"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    async def authenticate(self) -> None:
        if self.auth_type == "basic":
            return

        if self.auth_type == "jwt_bearer":
            if self._access_token and time.time() < self._token_expires_at - 60:
                return

            token_url = self.auth_config.get("token_url", "")
            assertion = self.auth_config.get("assertion", "")

            if not token_url:
                raise ConnectionError("JWT bearer token_url not configured")

            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    token_url,
                    data={
                        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                        "assertion": assertion,
                    },
                )
                resp.raise_for_status()
                token_data = resp.json()
                self._access_token = token_data["access_token"]
                self._token_expires_at = time.time() + token_data.get("expires_in", 3600)
                logger.info("oracle_jwt_authenticated")

        elif self.auth_type == "oauth2_client_credentials":
            if self._access_token and time.time() < self._token_expires_at - 60:
                return

            token_url = self.auth_config.get("token_url", "")
            client_id = self.auth_config.get("client_id", "")
            client_secret = self.auth_config.get("client_secret", "")

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

        params: dict[str, str] = {"limit": str(limit), "offset": str(offset)}
        if filters:
            for key, value in filters.items():
                params[key] = str(value)

        url = f"{self.base_url}/{entity}"

        async with httpx.AsyncClient(timeout=30.0, verify=True) as client:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            return data.get("items", data if isinstance(data, list) else [])

    async def push_record(self, entity: str, data: dict[str, Any]) -> dict[str, Any]:
        await self.authenticate()
        headers = self._build_auth_headers()
        headers["Content-Type"] = "application/json"

        url = f"{self.base_url}/{entity}"

        async with httpx.AsyncClient(timeout=30.0, verify=True) as client:
            resp = await client.post(url, headers=headers, json=data)
            resp.raise_for_status()
            return resp.json() if resp.content else {"status": "created"}
