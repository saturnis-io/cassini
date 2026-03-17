"""Tests for CassiniClient HTTP client."""
from __future__ import annotations

import json

import httpx
import pytest

from cassini.cli.client import CassiniClient, CassiniClientError


# ---------------------------------------------------------------------------
# Mock transport that returns canned responses based on request path/method
# ---------------------------------------------------------------------------

class MockTransport(httpx.AsyncBaseTransport):
    """Deterministic transport for testing CassiniClient."""

    def __init__(self, handler=None):
        self._handler = handler or self._default_handler

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        return self._handler(request)

    @staticmethod
    def _default_handler(request: httpx.Request) -> httpx.Response:
        """Route requests to canned responses."""
        path = request.url.path
        method = request.method

        # --- Plants ---
        if path == "/api/v1/plants/" and method == "GET":
            return httpx.Response(200, json=[
                {"id": 1, "name": "Plant A", "timezone": "UTC"},
                {"id": 2, "name": "Plant B", "timezone": "US/Eastern"},
            ])

        if path == "/api/v1/plants/1" and method == "GET":
            return httpx.Response(200, json={"id": 1, "name": "Plant A", "timezone": "UTC"})

        if path == "/api/v1/plants/" and method == "POST":
            body = json.loads(request.content)
            return httpx.Response(201, json={"id": 3, "name": body["name"], "timezone": body.get("timezone", "UTC")})

        # --- Characteristics ---
        if path == "/api/v1/characteristics/" and method == "GET":
            return httpx.Response(200, json=[{"id": 10, "name": "Diameter"}])

        if path == "/api/v1/characteristics/10" and method == "GET":
            return httpx.Response(200, json={"id": 10, "name": "Diameter"})

        # --- Capability ---
        if path == "/api/v1/characteristics/10/capability" and method == "GET":
            return httpx.Response(200, json={"cp": 1.33, "cpk": 1.25, "pp": 1.30, "ppk": 1.20})

        # --- Samples ---
        if path == "/api/v1/samples/" and method == "GET":
            return httpx.Response(200, json={"items": [], "total": 0, "offset": 0, "limit": 100})

        # --- Data entry ---
        if path == "/api/v1/data-entry/submit" and method == "POST":
            body = json.loads(request.content)
            return httpx.Response(201, json={"sample_id": 99, "characteristic_id": body["characteristic_id"]})

        # --- Violations ---
        if path == "/api/v1/violations/" and method == "GET":
            return httpx.Response(200, json={"items": [], "total": 0, "offset": 0, "limit": 100})

        # --- Users ---
        if path == "/api/v1/users/" and method == "GET":
            return httpx.Response(200, json=[{"id": 1, "username": "admin"}])

        if path == "/api/v1/users/" and method == "POST":
            body = json.loads(request.content)
            return httpx.Response(201, json={"id": 2, "username": body["username"]})

        # --- Audit ---
        if path == "/api/v1/audit/" and method == "GET":
            return httpx.Response(200, json=[])

        # --- License ---
        if path == "/api/v1/license/status" and method == "GET":
            return httpx.Response(200, json={"edition": "open", "tier": "community", "max_plants": 1})

        # --- API Keys ---
        if path == "/api/v1/api-keys/" and method == "GET":
            return httpx.Response(200, json=[])

        if path == "/api/v1/api-keys/" and method == "POST":
            body = json.loads(request.content)
            return httpx.Response(201, json={"id": 5, "name": body["name"], "key": "csk_test_xxx"})

        # --- Health ---
        if path == "/api/v1/health" and method == "GET":
            return httpx.Response(200, json={"status": "healthy"})

        # --- MSA ---
        if path == "/api/v1/msa/studies" and method == "GET":
            return httpx.Response(200, json=[])

        # --- DOE ---
        if path == "/api/v1/doe/studies" and method == "GET":
            return httpx.Response(200, json=[])

        # --- PATCH (generic) ---
        if method == "PATCH":
            return httpx.Response(200, json={"patched": True})

        # --- DELETE (generic) ---
        if method == "DELETE":
            return httpx.Response(204, content=b"")

        return httpx.Response(404, json={"detail": f"Not found: {method} {path}"})


def _make_client(
    transport: httpx.AsyncBaseTransport | None = None,
    api_key: str | None = "test-key-123",
    actor: str | None = None,
) -> CassiniClient:
    """Build a CassiniClient wired to a mock transport."""
    client = CassiniClient(
        server_url="http://localhost:8000",
        api_key=api_key,
        actor=actor,
    )
    # Inject mock transport — after __aenter__ creates the httpx client
    client._transport_override = transport or MockTransport()
    return client


async def _enter_client(client: CassiniClient) -> CassiniClient:
    """Enter context and replace transport with the override."""
    await client.__aenter__()
    # Swap the real transport with the mock
    transport = getattr(client, "_transport_override", None)
    if transport and client._client:
        client._client._transport = transport
    return client


# ---------------------------------------------------------------------------
# Tests — Auth header injection
# ---------------------------------------------------------------------------


class TestAuthHeaders:
    async def test_api_key_header_injected(self):
        """X-API-Key header is set when api_key is provided."""
        captured = {}

        def capture_handler(request: httpx.Request) -> httpx.Response:
            captured["headers"] = dict(request.headers)
            return httpx.Response(200, json={"status": "healthy"})

        client = _make_client(transport=MockTransport(capture_handler), api_key="secret-key-456")
        async with client:
            client._client._transport = client._transport_override
            await client.health()

        assert captured["headers"]["x-api-key"] == "secret-key-456"

    async def test_no_api_key_header_when_none(self):
        """X-API-Key header is absent when api_key is None."""
        captured = {}

        def capture_handler(request: httpx.Request) -> httpx.Response:
            captured["headers"] = dict(request.headers)
            return httpx.Response(200, json={"status": "healthy"})

        client = _make_client(transport=MockTransport(capture_handler), api_key=None)
        async with client:
            client._client._transport = client._transport_override
            await client.health()

        assert "x-api-key" not in captured["headers"]

    async def test_actor_header_injected(self):
        """X-Cassini-Actor header is set when actor is provided."""
        captured = {}

        def capture_handler(request: httpx.Request) -> httpx.Response:
            captured["headers"] = dict(request.headers)
            return httpx.Response(200, json={"status": "healthy"})

        client = _make_client(
            transport=MockTransport(capture_handler),
            api_key="key",
            actor="mcp-server",
        )
        client._actor = "mcp-server"
        async with client:
            client._client._transport = client._transport_override
            await client.health()

        assert captured["headers"]["x-cassini-actor"] == "mcp-server"


# ---------------------------------------------------------------------------
# Tests — Resource methods
# ---------------------------------------------------------------------------


class TestResourceMethods:
    async def test_plants_list(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.plants_list()

        assert len(result) == 2
        assert result[0]["name"] == "Plant A"

    async def test_plants_get(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.plants_get(1)

        assert result["id"] == 1
        assert result["name"] == "Plant A"

    async def test_plants_create(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.plants_create("New Plant", timezone="US/Central")

        assert result["name"] == "New Plant"

    async def test_characteristics_list(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.characteristics_list()

        assert len(result) == 1
        assert result[0]["name"] == "Diameter"

    async def test_characteristics_get(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.characteristics_get(10)

        assert result["id"] == 10

    async def test_capability_get(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.capability_get(10)

        assert result["cp"] == 1.33
        assert result["cpk"] == 1.25

    async def test_samples_list(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.samples_list(characteristic_id=10)

        assert result["items"] == []
        assert result["total"] == 0

    async def test_samples_submit(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.samples_submit(10, [1.0, 2.0, 3.0])

        assert result["sample_id"] == 99
        assert result["characteristic_id"] == 10

    async def test_violations_list(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.violations_list()

        assert result["items"] == []

    async def test_users_list(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.users_list()

        assert len(result) == 1
        assert result[0]["username"] == "admin"

    async def test_users_create(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.users_create("newuser", "password123")

        assert result["username"] == "newuser"

    async def test_audit_search(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.audit_search()

        assert result == []

    async def test_license_status(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.license_status()

        assert result["edition"] == "open"
        assert result["max_plants"] == 1

    async def test_api_keys_list(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.api_keys_list()

        assert result == []

    async def test_api_keys_create(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.api_keys_create("my-key", scope="read-only", plant_ids=[1, 2])

        assert result["name"] == "my-key"
        assert "key" in result

    async def test_health(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.health()

        assert result["status"] == "healthy"

    async def test_msa_studies_list(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.msa_studies_list()

        assert result == []

    async def test_doe_studies_list(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client.doe_studies_list()

        assert result == []


# ---------------------------------------------------------------------------
# Tests — HTTP method dispatch
# ---------------------------------------------------------------------------


class TestHttpMethods:
    async def test_patch_method(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            result = await client._patch("/plants/1", json={"name": "Updated"})

        assert result["patched"] is True

    async def test_delete_method(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            # Should not raise
            await client._delete("/plants/1")


# ---------------------------------------------------------------------------
# Tests — Error handling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    async def test_401_raises_client_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, json={"detail": "Invalid API key"})

        client = _make_client(transport=MockTransport(handler))
        async with client:
            client._client._transport = client._transport_override
            with pytest.raises(CassiniClientError) as exc_info:
                await client.health()

        assert exc_info.value.status_code == 401
        assert "Invalid API key" in exc_info.value.detail

    async def test_403_raises_client_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(403, json={"detail": "Forbidden"})

        client = _make_client(transport=MockTransport(handler))
        async with client:
            client._client._transport = client._transport_override
            with pytest.raises(CassiniClientError) as exc_info:
                await client.plants_list()

        assert exc_info.value.status_code == 403

    async def test_404_raises_client_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, json={"detail": "Not found"})

        client = _make_client(transport=MockTransport(handler))
        async with client:
            client._client._transport = client._transport_override
            with pytest.raises(CassiniClientError) as exc_info:
                await client.plants_get(999)

        assert exc_info.value.status_code == 404

    async def test_500_raises_client_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, json={"detail": "Internal server error"})

        client = _make_client(transport=MockTransport(handler))
        async with client:
            client._client._transport = client._transport_override
            with pytest.raises(CassiniClientError) as exc_info:
                await client.health()

        assert exc_info.value.status_code == 500

    async def test_non_json_error_body(self):
        """Handles error responses that are not valid JSON."""
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(502, content=b"Bad Gateway")

        client = _make_client(transport=MockTransport(handler))
        async with client:
            client._client._transport = client._transport_override
            with pytest.raises(CassiniClientError) as exc_info:
                await client.health()

        assert exc_info.value.status_code == 502
        assert "Bad Gateway" in exc_info.value.detail

    async def test_error_string_representation(self):
        err = CassiniClientError(422, "Validation failed")
        assert str(err) == "HTTP 422: Validation failed"
        assert err.status_code == 422
        assert err.detail == "Validation failed"


# ---------------------------------------------------------------------------
# Tests — Context manager
# ---------------------------------------------------------------------------


class TestContextManager:
    async def test_client_not_usable_outside_context(self):
        """Calling methods without entering context raises RuntimeError."""
        client = CassiniClient("http://localhost:8000", api_key="key")
        with pytest.raises(RuntimeError, match="async context manager"):
            await client.health()

    async def test_client_closed_after_exit(self):
        client = _make_client()
        async with client:
            client._client._transport = client._transport_override
            assert client._client is not None

        assert client._client is None

    async def test_base_url_strips_trailing_slash(self):
        client = CassiniClient("http://localhost:8000/", api_key="key")
        async with client:
            base = str(client._client.base_url).rstrip("/")
            assert base == "http://localhost:8000/api/v1"
