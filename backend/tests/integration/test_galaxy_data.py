"""Backend data-binding tests for the Galaxy 3D visualization.

The Galaxy page has no dedicated /galaxy endpoint — it assembles the 3D scene
from the standard characteristics and hierarchy APIs. These tests verify:

1. ``test_galaxy_data_endpoint_shape``: the characteristics endpoint returns the
   fields that GalaxyScene.tsx requires for 3D rendering (position layout uses
   hierarchy_id, planet color uses capability Cpk, ring gap uses UCL/LCL).

2. ``test_galaxy_data_filters_by_user_plants``: a user with access to only one
   plant cannot see characteristics from another plant — multi-tenancy regression
   guard for the galaxy scene that lists all accessible characteristics.

Tests follow the same pattern as test_multi_tenancy_isolation.py — they build
a minimal FastAPI app, override DB and auth dependencies, and use httpx
AsyncClient/ASGITransport.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    get_current_user,
    get_current_engineer,
    get_db_session,
)
from cassini.api.v1.characteristics import router as characteristics_router
from cassini.api.v1.hierarchy import plant_hierarchy_router
from cassini.db.models.characteristic import Characteristic, CharacteristicRule
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.plant import Plant
from cassini.db.models.user import UserRole


# ---------------------------------------------------------------------------
# Stub auth objects (reuse the same pattern as test_multi_tenancy_isolation)
# ---------------------------------------------------------------------------


class _PlantRole:
    def __init__(self, plant_id: int, role: UserRole) -> None:
        self.plant_id = plant_id
        self.role = role


class _User:
    def __init__(self, user_id: int, plant_id: int, role: UserRole) -> None:
        self.id = user_id
        self.username = f"user{user_id}"
        self.email = f"user{user_id}@example.com"
        self.is_active = True
        self.must_change_password = False
        self.plant_roles = [_PlantRole(plant_id=plant_id, role=role)]


# ---------------------------------------------------------------------------
# Shared fixtures — two plants, two hierarchies, one char per plant
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def plant_a(async_session: AsyncSession) -> Plant:
    p = Plant(name="Galaxy Plant A", code="GPA")
    async_session.add(p)
    await async_session.commit()
    await async_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def plant_b(async_session: AsyncSession) -> Plant:
    p = Plant(name="Galaxy Plant B", code="GPB")
    async_session.add(p)
    await async_session.commit()
    await async_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def hierarchy_a(async_session: AsyncSession, plant_a: Plant) -> Hierarchy:
    h = Hierarchy(name="A-Line", type="Line", parent_id=None, plant_id=plant_a.id)
    async_session.add(h)
    await async_session.commit()
    await async_session.refresh(h)
    return h


@pytest_asyncio.fixture
async def hierarchy_b(async_session: AsyncSession, plant_b: Plant) -> Hierarchy:
    h = Hierarchy(name="B-Line", type="Line", parent_id=None, plant_id=plant_b.id)
    async_session.add(h)
    await async_session.commit()
    await async_session.refresh(h)
    return h


@pytest_asyncio.fixture
async def char_a(async_session: AsyncSession, hierarchy_a: Hierarchy) -> Characteristic:
    """Characteristic with control limits set — fields used by galaxy rendering."""
    char = Characteristic(
        hierarchy_id=hierarchy_a.id,
        name="Diameter A",
        subgroup_size=3,
        target_value=50.0,
        usl=55.0,
        lsl=45.0,
        ucl=53.5,
        lcl=46.5,
        stored_center_line=50.0,
        stored_sigma=1.2,
        decimal_precision=3,
    )
    async_session.add(char)
    await async_session.flush()
    for rule_id in range(1, 9):
        async_session.add(CharacteristicRule(char_id=char.id, rule_id=rule_id, is_enabled=True))
    await async_session.commit()
    await async_session.refresh(char)
    return char


@pytest_asyncio.fixture
async def char_b(async_session: AsyncSession, hierarchy_b: Hierarchy) -> Characteristic:
    """Characteristic for plant B."""
    char = Characteristic(
        hierarchy_id=hierarchy_b.id,
        name="Pressure B",
        subgroup_size=1,
        target_value=100.0,
        usl=110.0,
        lsl=90.0,
        ucl=107.0,
        lcl=93.0,
        stored_center_line=100.0,
        stored_sigma=2.0,
        decimal_precision=2,
    )
    async_session.add(char)
    await async_session.flush()
    for rule_id in range(1, 9):
        async_session.add(CharacteristicRule(char_id=char.id, rule_id=rule_id, is_enabled=True))
    await async_session.commit()
    await async_session.refresh(char)
    return char


# ---------------------------------------------------------------------------
# App builder helper
# ---------------------------------------------------------------------------


def _build_app(session: AsyncSession, current_user: _User) -> FastAPI:
    app = FastAPI()
    app.include_router(characteristics_router)
    # Mount plant_hierarchy_router under the same prefix as main.py uses
    app.include_router(
        plant_hierarchy_router, prefix="/api/v1/plants/{plant_id}/hierarchies"
    )

    async def _override_session():
        yield session

    app.dependency_overrides[get_db_session] = _override_session
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_current_engineer] = lambda: current_user
    return app


# ---------------------------------------------------------------------------
# test_galaxy_data_endpoint_shape
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_galaxy_data_endpoint_shape(
    async_session: AsyncSession,
    plant_a: Plant,
    hierarchy_a: Hierarchy,
    char_a: Characteristic,
) -> None:
    """The characteristics endpoint returns fields required by GalaxyScene.

    GalaxyScene needs per-characteristic:
    - id (used as Map key for PlanetSystem)
    - hierarchy_id (used by computeConstellationLayout for galaxy positioning)
    - name (shown in GalaxyLabel + PlanetOverlay)
    - ucl / lcl / stored_center_line (for ring gap via controlLimitsToGap)
    - data_type (governs chart type selection in scene-helpers)

    The capability endpoint provides cpk for cpkToColorHex — that's a separate
    call, but the characteristics list must carry the structural fields above.
    """
    user_a = _User(user_id=1, plant_id=plant_a.id, role=UserRole.operator)
    app = _build_app(async_session, user_a)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(
            "/api/v1/characteristics/",
            params={"plant_id": plant_a.id, "per_page": 100},
        )

    assert resp.status_code == 200, f"Unexpected status: {resp.status_code} — {resp.text}"
    body = resp.json()

    # The response is paginated — items list must be present
    assert "items" in body, "Response must have 'items' list for pagination"
    items = body["items"]
    assert len(items) >= 1, f"Expected at least 1 characteristic for plant_a, got {len(items)}"

    item = items[0]

    # Required structural fields for galaxy rendering
    required_fields = {"id", "name", "hierarchy_id"}
    missing = required_fields - set(item.keys())
    assert not missing, f"Characteristics response missing galaxy-required fields: {missing}"

    # Control limit fields (used by controlLimitsToGap for ring rendering)
    for limit_field in ("ucl", "lcl"):
        assert limit_field in item, f"Field '{limit_field}' missing from characteristic response"

    # Verify values for the seeded characteristic
    assert item["id"] == char_a.id
    assert item["hierarchy_id"] == hierarchy_a.id
    assert item["ucl"] == pytest.approx(53.5)
    assert item["lcl"] == pytest.approx(46.5)


@pytest.mark.asyncio
async def test_galaxy_hierarchy_tree_shape(
    async_session: AsyncSession,
    plant_a: Plant,
    hierarchy_a: Hierarchy,
    char_a: Characteristic,
) -> None:
    """The plant hierarchy tree endpoint returns fields for constellation layout.

    computeConstellationLayout groups characteristics by their top-level
    hierarchy ancestor — it needs id, parent_id on each HierarchyNode.
    """
    user_a = _User(user_id=1, plant_id=plant_a.id, role=UserRole.operator)
    app = _build_app(async_session, user_a)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get(f"/api/v1/plants/{plant_a.id}/hierarchies/")

    assert resp.status_code == 200, f"Hierarchy tree request failed: {resp.status_code}"
    tree = resp.json()
    assert isinstance(tree, list), "Hierarchy tree must be a JSON array"
    assert len(tree) >= 1, "Hierarchy tree must contain at least the seeded node"

    node = tree[0]
    for field in ("id", "name", "parent_id"):
        assert field in node, f"HierarchyNode missing field '{field}' required by galaxy layout"


# ---------------------------------------------------------------------------
# test_galaxy_data_filters_by_user_plants
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_galaxy_data_filters_by_user_plants(
    async_session: AsyncSession,
    plant_a: Plant,
    plant_b: Plant,
    hierarchy_a: Hierarchy,
    hierarchy_b: Hierarchy,
    char_a: Characteristic,
    char_b: Characteristic,
) -> None:
    """A user with access to only plant A cannot see plant B characteristics.

    Galaxy scene fetches GET /characteristics/?plant_id=X. The endpoint must
    restrict results to the requested plant, and check_plant_role must block
    access to plants the user has no role in.

    This is the multi-tenancy regression guard — prevents the galaxy from
    showing other tenants' planets.
    """
    # User has operator role at plant_a only
    user_a = _User(user_id=10, plant_id=plant_a.id, role=UserRole.operator)
    app = _build_app(async_session, user_a)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        # Requesting plant_a's characteristics — should succeed
        resp_a = await client.get(
            "/api/v1/characteristics/",
            params={"plant_id": plant_a.id, "per_page": 100},
        )

        # Requesting plant_b's characteristics — must be denied (403 or empty)
        resp_b = await client.get(
            "/api/v1/characteristics/",
            params={"plant_id": plant_b.id, "per_page": 100},
        )

    # Plant A request must succeed
    assert resp_a.status_code == 200, (
        f"Expected 200 for own-plant request, got {resp_a.status_code}"
    )
    items_a = resp_a.json().get("items", [])
    assert any(item["id"] == char_a.id for item in items_a), (
        "Characteristic A must appear in plant A response"
    )
    assert not any(item["id"] == char_b.id for item in items_a), (
        "Characteristic B must NOT appear in plant A response"
    )

    # Plant B request must either 403 (check_plant_role raises) or return empty
    if resp_b.status_code == 200:
        items_b = resp_b.json().get("items", [])
        assert not any(item["id"] == char_b.id for item in items_b), (
            "User with no role at plant B must not see plant B characteristics — "
            "multi-tenancy isolation failure"
        )
    else:
        assert resp_b.status_code in (403, 404), (
            f"Cross-plant request must return 403/404, got {resp_b.status_code}"
        )
