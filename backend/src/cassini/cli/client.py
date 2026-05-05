"""CassiniClient — HTTP client for Cassini API.

Used by CLI commands and MCP server. Handles connection, API key auth,
and typed convenience methods for each resource endpoint.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class CassiniClientError(Exception):
    """Base error for CassiniClient operations."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"HTTP {status_code}: {detail}")


class CassiniClient:
    """Async HTTP client for the Cassini REST API.

    Intended for use as an async context manager::

        async with CassiniClient("http://localhost:8000", api_key="...") as c:
            plants = await c.plants_list()
    """

    def __init__(
        self,
        server_url: str,
        api_key: str | None = None,
        timeout: float = 30.0,
        actor: str | None = None,
    ):
        self._server_url = server_url.rstrip("/")
        self._api_key = api_key
        self._actor = actor
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> CassiniClient:
        headers: dict[str, str] = {}
        if self._api_key:
            headers["X-API-Key"] = self._api_key
        if self._actor:
            headers["X-Cassini-Actor"] = self._actor
        self._client = httpx.AsyncClient(
            base_url=f"{self._server_url}/api/v1",
            headers=headers,
            timeout=self._timeout,
        )
        return self

    async def __aexit__(self, *args: object) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError(
                "CassiniClient must be used as an async context manager"
            )
        return self._client

    def _check_response(self, response: httpx.Response) -> None:
        """Raise CassiniClientError for non-2xx responses."""
        if response.is_success:
            return
        try:
            data = response.json()
            detail = data.get("detail", response.text)
        except Exception:
            detail = response.text
        raise CassiniClientError(response.status_code, str(detail))

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        client = self._ensure_client()
        resp = await client.get(path, params=params)
        self._check_response(resp)
        return resp.json()

    async def _post(self, path: str, json: dict[str, Any] | None = None) -> Any:
        client = self._ensure_client()
        resp = await client.post(path, json=json)
        self._check_response(resp)
        return resp.json() if resp.content else None

    async def _patch(self, path: str, json: dict[str, Any] | None = None) -> Any:
        client = self._ensure_client()
        resp = await client.patch(path, json=json)
        self._check_response(resp)
        return resp.json()

    async def _delete(self, path: str) -> None:
        client = self._ensure_client()
        resp = await client.delete(path)
        self._check_response(resp)

    # ── Plants ────────────────────────────────────────────────────────

    async def plants_list(self) -> list[dict[str, Any]]:
        return await self._get("/plants/")

    async def plants_get(self, plant_id: int) -> dict[str, Any]:
        return await self._get(f"/plants/{plant_id}")

    async def plants_create(
        self, name: str, timezone: str = "UTC", **kwargs: Any
    ) -> dict[str, Any]:
        return await self._post(
            "/plants/", json={"name": name, "timezone": timezone, **kwargs}
        )

    # ── Characteristics ───────────────────────────────────────────────

    async def characteristics_list(
        self, plant_id: int | None = None, **params: Any
    ) -> list[dict[str, Any]]:
        p: dict[str, Any] = {}
        if plant_id is not None:
            p["plant_id"] = plant_id
        p.update(params)
        return await self._get("/characteristics/", params=p)

    async def characteristics_get(self, char_id: int) -> dict[str, Any]:
        return await self._get(f"/characteristics/{char_id}")

    # ── Samples ───────────────────────────────────────────────────────

    async def samples_list(
        self,
        characteristic_id: int | None = None,
        limit: int = 100,
        **params: Any,
    ) -> dict[str, Any]:
        p: dict[str, Any] = {"limit": limit}
        if characteristic_id is not None:
            p["characteristic_id"] = characteristic_id
        p.update(params)
        return await self._get("/samples/", params=p)

    async def samples_submit(
        self, characteristic_id: int, measurements: list[float]
    ) -> dict[str, Any]:
        return await self._post(
            "/data-entry/submit",
            json={
                "characteristic_id": characteristic_id,
                "measurements": measurements,
            },
        )

    # ── Capability ────────────────────────────────────────────────────

    async def capability_get(self, char_id: int) -> dict[str, Any]:
        return await self._get(f"/characteristics/{char_id}/capability")

    # ── Violations ────────────────────────────────────────────────────

    async def violations_list(
        self,
        characteristic_id: int | None = None,
        active: bool = False,
        **params: Any,
    ) -> dict[str, Any]:
        p: dict[str, Any] = {}
        if characteristic_id is not None:
            p["characteristic_id"] = characteristic_id
        if active:
            p["active"] = True
        p.update(params)
        return await self._get("/violations/", params=p)

    # ── Users ─────────────────────────────────────────────────────────

    async def users_list(self) -> list[dict[str, Any]]:
        return await self._get("/users/")

    async def users_create(
        self, username: str, password: str, **kwargs: Any
    ) -> dict[str, Any]:
        return await self._post(
            "/users/", json={"username": username, "password": password, **kwargs}
        )

    # ── Audit ─────────────────────────────────────────────────────────

    async def audit_search(self, **params: Any) -> list[dict[str, Any]]:
        return await self._get("/audit/", params=params)

    # ── License ───────────────────────────────────────────────────────

    async def license_status(self) -> dict[str, Any]:
        return await self._get("/license/status")

    # ── API Keys ──────────────────────────────────────────────────────

    async def api_keys_list(self) -> list[dict[str, Any]]:
        return await self._get("/api-keys/")

    async def api_keys_create(
        self,
        name: str,
        scope: str = "read-write",
        plant_ids: list[int] | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"name": name, "scope": scope}
        if plant_ids is not None:
            data["plant_ids"] = plant_ids
        return await self._post("/api-keys/", json=data)

    # ── Health / Cluster ──────────────────────────────────────────────

    async def health(self) -> dict[str, Any]:
        return await self._get("/health")

    async def cluster_status(self) -> dict[str, Any]:
        return await self._get("/cluster/status")

    # ── MSA ───────────────────────────────────────────────────────────

    async def msa_studies_list(
        self, plant_id: int | None = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if plant_id is not None:
            params["plant_id"] = plant_id
        return await self._get("/msa/studies", params=params)

    # ── DOE ───────────────────────────────────────────────────────────

    async def doe_studies_list(
        self, plant_id: int | None = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if plant_id is not None:
            params["plant_id"] = plant_id
        return await self._get("/doe/studies", params=params)

    # ── Replay (Pro) ──────────────────────────────────────────────────

    async def replay_get(
        self, resource_type: str, resource_id: int, at: str
    ) -> dict[str, Any]:
        return await self._get(
            f"/replay/{resource_type}/{resource_id}", params={"at": at}
        )

    # ── Lakehouse (Pro) ───────────────────────────────────────────────

    async def lakehouse_tables(self) -> dict[str, Any]:
        return await self._get("/lakehouse/tables")

    async def lakehouse_export(
        self,
        table: str,
        format: str = "json",
        plant_id: int | None = None,
        columns: str | None = None,
        from_: str | None = None,
        to: str | None = None,
        limit: int | None = None,
    ) -> Any:
        params: dict[str, Any] = {"format": format}
        if plant_id is not None:
            params["plant_id"] = plant_id
        if columns is not None:
            params["columns"] = columns
        if from_ is not None:
            params["from"] = from_
        if to is not None:
            params["to"] = to
        if limit is not None:
            params["limit"] = limit
        # JSON exports return a {metadata, rows} body. Binary formats
        # (parquet/arrow/csv) are not exposed via MCP — the agent surface
        # returns only structured JSON.
        if format != "json":
            raise ValueError(
                f"lakehouse_export via MCP only supports format='json' "
                f"(got {format!r}). Use the REST endpoint directly for "
                f"parquet / arrow / csv."
            )
        return await self._get(f"/lakehouse/{table}", params=params)

    # ── CEP rules (Enterprise) ────────────────────────────────────────

    async def cep_rules_list(self, plant_id: int | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if plant_id is not None:
            params["plant_id"] = plant_id
        return await self._get("/cep_rules", params=params)

    async def cep_rules_validate(self, yaml_text: str) -> dict[str, Any]:
        return await self._post("/cep_rules/validate", json={"yaml_text": yaml_text})

    async def cep_rules_create(
        self, plant_id: int, yaml_text: str, enabled: bool = True
    ) -> dict[str, Any]:
        return await self._post(
            "/cep_rules",
            json={"plant_id": plant_id, "yaml_text": yaml_text, "enabled": enabled},
        )

    async def cep_rules_update(
        self,
        rule_id: int,
        yaml_text: str | None = None,
        enabled: bool | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if yaml_text is not None:
            body["yaml_text"] = yaml_text
        if enabled is not None:
            body["enabled"] = enabled
        client = self._ensure_client()
        resp = await client.put(f"/cep_rules/{rule_id}", json=body)
        self._check_response(resp)
        return resp.json()
