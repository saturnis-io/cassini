"""Integration tests for the Cassini Lakehouse data product API.

The lakehouse endpoint (``GET /api/v1/lakehouse/{table}``) exposes a
plant-scoped, read-only view of whitelisted Cassini tables in Arrow,
Parquet, CSV, and JSON formats.

These tests cover:

* All four wire formats (with graceful skip when pyarrow is not present)
* Cross-plant isolation: an operator at Plant A must not see Plant B rows
* Column projection and date-range filters
* 404 on unknown table
* 403 when the license tier is below Pro
* Audit logging of every export
* Rate limit enforcement (10/minute via ``rate_limit_export``)
"""

from __future__ import annotations

import io
import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from cassini.api.deps import (
    get_current_user,
    get_db_session,
    get_license_service,
)
from cassini.api.v1.lakehouse import router as lakehouse_router
from cassini.core.audit import AuditService
from cassini.core.rate_limit import limiter
from cassini.db.models.audit_log import AuditLog
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.plant import Plant
from cassini.db.models.sample import Measurement, Sample
from cassini.db.models.user import UserRole
from cassini.db.models.violation import Violation


# ---------------------------------------------------------------------------
# Shared scaffolding
# ---------------------------------------------------------------------------


class _StubPlantRole:
    def __init__(self, plant_id: int, role: UserRole) -> None:
        self.plant_id = plant_id
        self.role = role


class _StubUser:
    def __init__(self, user_id: int, plant_id: int, role: UserRole) -> None:
        self.id = user_id
        self.username = f"user{user_id}"
        self.is_active = True
        self.plant_roles = [_StubPlantRole(plant_id=plant_id, role=role)]


class _StubLicenseService:
    """Minimal LicenseService stand-in covering the bits the router uses."""

    def __init__(self, *, tier: str = "pro") -> None:
        self._tier = tier

    @property
    def tier(self) -> str:
        return self._tier

    @property
    def is_commercial(self) -> bool:
        return self._tier in ("pro", "enterprise")

    @property
    def is_pro(self) -> bool:
        return self._tier == "pro"

    @property
    def is_enterprise(self) -> bool:
        return self._tier == "enterprise"

    def has_feature(self, feature: str) -> bool:
        if self._tier == "community":
            return False
        if feature == "lakehouse-export":
            return True
        return self._tier == "enterprise"


def _make_session_factory(async_engine):
    factory = sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False,
    )

    @asynccontextmanager
    async def _ctx():
        async with factory() as session:
            yield session

    return _ctx


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def two_plants(async_session) -> tuple[Plant, Plant]:
    """Two distinct plants A and B."""
    plant_a = Plant(name="Plant A", code="PA")
    plant_b = Plant(name="Plant B", code="PB")
    async_session.add_all([plant_a, plant_b])
    await async_session.commit()
    await async_session.refresh(plant_a)
    await async_session.refresh(plant_b)
    return plant_a, plant_b


@pytest_asyncio.fixture
async def hierarchies(async_session, two_plants):
    plant_a, plant_b = two_plants
    h_a = Hierarchy(name="A-Site", type="Site", parent_id=None, plant_id=plant_a.id)
    h_b = Hierarchy(name="B-Site", type="Site", parent_id=None, plant_id=plant_b.id)
    async_session.add_all([h_a, h_b])
    await async_session.commit()
    await async_session.refresh(h_a)
    await async_session.refresh(h_b)
    return h_a, h_b


@pytest_asyncio.fixture
async def chars(async_session, hierarchies):
    h_a, h_b = hierarchies
    c_a = Characteristic(
        hierarchy_id=h_a.id, name="A-Char", subgroup_size=1,
        target_value=100.0, usl=110.0, lsl=90.0, ucl=105.0, lcl=95.0,
    )
    c_b = Characteristic(
        hierarchy_id=h_b.id, name="B-Char", subgroup_size=1,
        target_value=50.0, usl=60.0, lsl=40.0, ucl=55.0, lcl=45.0,
    )
    async_session.add_all([c_a, c_b])
    await async_session.commit()
    await async_session.refresh(c_a)
    await async_session.refresh(c_b)
    return c_a, c_b


@pytest_asyncio.fixture
async def populated_data(async_session, chars):
    """Seed two samples per plant so plant-scoping is observable."""
    c_a, c_b = chars
    now = datetime.now(timezone.utc)
    samples = [
        Sample(char_id=c_a.id, timestamp=now - timedelta(minutes=10), is_excluded=False),
        Sample(char_id=c_a.id, timestamp=now - timedelta(minutes=5), is_excluded=False),
        Sample(char_id=c_b.id, timestamp=now - timedelta(minutes=10), is_excluded=False),
        Sample(char_id=c_b.id, timestamp=now - timedelta(minutes=5), is_excluded=False),
    ]
    async_session.add_all(samples)
    await async_session.flush()
    measurements = [Measurement(sample_id=s.id, value=100.0 + i) for i, s in enumerate(samples)]
    violations = [
        Violation(
            sample_id=samples[0].id, char_id=c_a.id,
            rule_id=1, rule_name="Outlier", severity="CRITICAL",
        ),
        Violation(
            sample_id=samples[2].id, char_id=c_b.id,
            rule_id=1, rule_name="Outlier", severity="CRITICAL",
        ),
    ]
    async_session.add_all(measurements + violations)
    await async_session.commit()
    return samples


@pytest_asyncio.fixture
async def operator_a(two_plants):
    return _StubUser(101, two_plants[0].id, UserRole.operator)


@pytest_asyncio.fixture
async def operator_b(two_plants):
    return _StubUser(102, two_plants[1].id, UserRole.operator)


@pytest_asyncio.fixture(autouse=True)
def _disable_rate_limiter():
    """Most tests exercise functional behavior — the rate-limit test re-enables.

    The ``slowapi`` limiter is module-level so we toggle ``enabled`` per test
    instead of trying to swap the limiter out wholesale.
    """
    previous = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = previous


def _build_app(
    async_engine,
    async_session,
    *,
    user,
    license_tier: str = "pro",
    audit_service: AuditService | None = None,
) -> FastAPI:
    """Construct an isolated FastAPI app wired for lakehouse tests."""
    app = FastAPI()
    app.include_router(lakehouse_router)

    async def override_session():
        yield async_session

    license_stub = _StubLicenseService(tier=license_tier)

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_license_service] = lambda: license_stub

    if audit_service is not None:
        app.state.audit_service = audit_service
    return app


def _has_pyarrow() -> bool:
    try:
        import pyarrow  # noqa: F401
        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lakehouse_arrow_format_returns_arrow_stream(
    async_engine, async_session, populated_data, operator_a,
):
    """Arrow IPC format streams a non-empty body and parses cleanly."""
    if not _has_pyarrow():
        pytest.skip("pyarrow not installed")

    import pyarrow as pa  # type: ignore[import-not-found]

    app = _build_app(async_engine, async_session, user=operator_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/lakehouse/samples?format=arrow")

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("application/vnd.apache.arrow.stream")
    assert resp.headers["content-disposition"].endswith('"cassini-samples.arrow"')

    reader = pa.ipc.open_stream(io.BytesIO(resp.content))
    table = reader.read_all()
    # Plant A has two samples → two rows.
    assert table.num_rows == 2
    assert "id" in table.schema.names
    assert "char_id" in table.schema.names


@pytest.mark.asyncio
async def test_lakehouse_parquet_format_returns_parquet_file(
    async_engine, async_session, populated_data, operator_a,
):
    """Parquet exports return a binary body with a Parquet magic header."""
    if not _has_pyarrow():
        pytest.skip("pyarrow not installed")

    import pyarrow.parquet as pq  # type: ignore[import-not-found]

    app = _build_app(async_engine, async_session, user=operator_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/lakehouse/samples?format=parquet")

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/vnd.apache.parquet"
    # Parquet files start with "PAR1" magic bytes.
    assert resp.content[:4] == b"PAR1"
    table = pq.read_table(io.BytesIO(resp.content))
    assert table.num_rows == 2


@pytest.mark.asyncio
async def test_lakehouse_filters_to_accessible_plants(
    async_engine, async_session, populated_data, operator_a,
):
    """Operator at Plant A must only see Plant A rows."""
    app = _build_app(async_engine, async_session, user=operator_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/lakehouse/samples?format=json")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    plant_ids = {row["plant_id"] for row in body["rows"]}
    assert plant_ids == {operator_a.plant_roles[0].plant_id}
    assert body["metadata"]["row_count"] == 2


@pytest.mark.asyncio
async def test_lakehouse_csv_format(
    async_engine, async_session, populated_data, operator_a,
):
    """CSV exports include the header row and one data row per accessible sample."""
    app = _build_app(async_engine, async_session, user=operator_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/lakehouse/samples?format=csv")

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/csv")
    text = resp.content.decode("utf-8")
    lines = [ln for ln in text.splitlines() if ln.strip()]
    # 1 header + 2 data rows.
    assert len(lines) == 3
    header = lines[0].split(",")
    assert "id" in header
    assert "plant_id" in header


@pytest.mark.asyncio
async def test_lakehouse_columns_filter(
    async_engine, async_session, populated_data, operator_a,
):
    """The ``columns=`` query param restricts the projection."""
    app = _build_app(async_engine, async_session, user=operator_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(
            "/api/v1/lakehouse/samples?format=json&columns=id,plant_id"
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["metadata"]["columns"] == ["id", "plant_id"]
    for row in body["rows"]:
        assert set(row.keys()) == {"id", "plant_id"}


@pytest.mark.asyncio
async def test_lakehouse_date_range_filter(
    async_engine, async_session, chars, operator_a,
):
    """Samples outside the [from, to] window must be excluded."""
    c_a, _ = chars
    base = datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)
    inside = Sample(char_id=c_a.id, timestamp=base, is_excluded=False)
    before = Sample(
        char_id=c_a.id, timestamp=base - timedelta(days=10), is_excluded=False,
    )
    after = Sample(
        char_id=c_a.id, timestamp=base + timedelta(days=10), is_excluded=False,
    )
    async_session.add_all([inside, before, after])
    await async_session.commit()
    await async_session.refresh(inside)
    await async_session.refresh(before)
    await async_session.refresh(after)

    app = _build_app(async_engine, async_session, user=operator_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(
            "/api/v1/lakehouse/samples",
            params={
                "format": "json",
                "from": (base - timedelta(days=1)).isoformat(),
                "to": (base + timedelta(days=1)).isoformat(),
            },
        )

    assert resp.status_code == 200, resp.text
    ids = {row["id"] for row in resp.json()["rows"]}
    assert inside.id in ids
    assert before.id not in ids
    assert after.id not in ids


@pytest.mark.asyncio
async def test_lakehouse_unknown_table_404(
    async_engine, async_session, operator_a,
):
    """An unrecognized table path returns 404."""
    app = _build_app(async_engine, async_session, user=operator_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/lakehouse/unknown_table?format=json")

    assert resp.status_code == 404, resp.text
    assert "Unknown lakehouse table" in resp.text


@pytest.mark.asyncio
async def test_lakehouse_pro_tier_required(
    async_engine, async_session, populated_data, operator_a,
):
    """Community-tier callers receive 403 from the feature gate."""
    app = _build_app(
        async_engine, async_session, user=operator_a, license_tier="community",
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/lakehouse/samples?format=json")

    assert resp.status_code == 403, resp.text
    assert "Pro" in resp.text or "Enterprise" in resp.text


@pytest.mark.asyncio
async def test_lakehouse_export_audited(
    async_engine, async_session, populated_data, operator_a,
):
    """Every export must enqueue a ``lakehouse_export`` audit entry."""
    audit_service = AuditService(_make_session_factory(async_engine))
    app = _build_app(
        async_engine, async_session, user=operator_a, audit_service=audit_service,
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/lakehouse/samples?format=json")
    assert resp.status_code == 200, resp.text

    # In sync mode AuditService persists inline — query the table directly.
    factory = sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False,
    )
    async with factory() as session:
        rows = (await session.execute(
            select(AuditLog).where(AuditLog.action == "lakehouse_export")
        )).scalars().all()

    assert rows, "Expected at least one lakehouse_export audit row"
    entry = rows[0]
    assert entry.username == operator_a.username
    assert entry.user_id == operator_a.id
    assert entry.resource_type == "lakehouse"
    assert entry.detail is not None
    detail = entry.detail if isinstance(entry.detail, dict) else json.loads(entry.detail)
    assert detail["table"] == "samples"
    assert detail["format"] == "json"


@pytest.mark.asyncio
async def test_lakehouse_rate_limit_export(
    async_engine, async_session, populated_data, operator_a,
):
    """Eleven calls in one minute trigger the 10/minute export rate limit."""
    # Re-enable the limiter for this single test and clear any prior state.
    limiter.enabled = True
    try:
        # ``slowapi.Limiter`` keeps an in-memory store; drain it so the test
        # is not influenced by previous suite state.
        try:
            limiter._storage.reset()  # type: ignore[attr-defined]
        except Exception:
            pass

        app = _build_app(async_engine, async_session, user=operator_a)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            statuses: list[int] = []
            for _ in range(11):
                resp = await client.get("/api/v1/lakehouse/samples?format=json")
                statuses.append(resp.status_code)

        assert 429 in statuses, f"Expected a 429 in {statuses}"
        # The first 10 should succeed.
        assert statuses.count(200) >= 10
    finally:
        limiter.enabled = False
