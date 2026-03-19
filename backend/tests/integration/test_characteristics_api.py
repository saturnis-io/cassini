"""Integration tests for Characteristic REST API endpoints.

Tests cover CRUD operations, filtering, chart data retrieval,
control limit recalculation, and Nelson Rule management.
"""

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from cassini.api.deps import get_current_engineer, get_current_user, get_db_session
from cassini.api.v1.characteristics import router
from cassini.db.models.characteristic import Characteristic, CharacteristicRule
from cassini.db.models.data_source import DataSource
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.plant import Plant
from cassini.db.models.sample import Measurement, Sample
from cassini.db.models.user import UserRole
from cassini.db.repositories import CharacteristicRepository, HierarchyRepository


class _MockPlantRole:
    """Lightweight stand-in for UserPlantRole so check_plant_role works."""

    def __init__(self, plant_id: int, role: UserRole):
        self.plant_id = plant_id
        self.role = role


class _MockUser:
    """Lightweight stand-in for User that satisfies auth checks.

    Uses admin role at plant_id=0. Because admin at any plant is treated
    as admin everywhere, this satisfies all check_plant_role calls.
    """

    def __init__(self):
        self.id = 1
        self.username = "testuser"
        self.email = "test@example.com"
        self.is_active = True
        self.must_change_password = False
        self.plant_roles = [_MockPlantRole(plant_id=0, role=UserRole.admin)]


@pytest_asyncio.fixture
async def app(async_session):
    """Create FastAPI app with test dependencies."""
    app = FastAPI()
    app.include_router(router)

    # Override database dependency
    async def override_get_session():
        yield async_session

    app.dependency_overrides[get_db_session] = override_get_session

    # Override auth dependencies
    test_user = _MockUser()
    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[get_current_engineer] = lambda: test_user

    return app


@pytest_asyncio.fixture
async def client(app):
    """Create async HTTP client for testing."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client


@pytest_asyncio.fixture
async def test_plant(async_session):
    """Create test plant."""
    plant = Plant(name="Test Plant", code="TP01")
    async_session.add(plant)
    await async_session.commit()
    await async_session.refresh(plant)
    return plant


@pytest_asyncio.fixture
async def test_hierarchy(async_session, test_plant):
    """Create test hierarchy node."""
    hierarchy = Hierarchy(
        name="Test Factory",
        type="Site",
        parent_id=None,
        plant_id=test_plant.id,
    )
    async_session.add(hierarchy)
    await async_session.commit()
    await async_session.refresh(hierarchy)
    return hierarchy


@pytest_asyncio.fixture
async def test_characteristic(async_session, test_hierarchy):
    """Create test characteristic."""
    char = Characteristic(
        hierarchy_id=test_hierarchy.id,
        name="Temperature",
        description="Process temperature",
        subgroup_size=1,
        target_value=100.0,
        usl=110.0,
        lsl=90.0,
        ucl=106.0,
        lcl=94.0,
    )
    async_session.add(char)
    await async_session.flush()

    # Add default rules
    for rule_id in range(1, 9):
        rule = CharacteristicRule(char_id=char.id, rule_id=rule_id, is_enabled=True)
        async_session.add(rule)

    await async_session.commit()
    await async_session.refresh(char)
    return char


@pytest_asyncio.fixture
async def test_characteristic_with_samples(async_session, test_characteristic):
    """Create test characteristic with sample data."""
    # Create 30 samples for testing
    base_time = datetime.utcnow() - timedelta(hours=30)
    for i in range(30):
        sample = Sample(
            char_id=test_characteristic.id,
            timestamp=base_time + timedelta(hours=i),
            batch_number=f"BATCH-{i:03d}",
            is_excluded=False,
        )
        async_session.add(sample)
        await async_session.flush()

        # Add measurement
        measurement = Measurement(
            sample_id=sample.id,
            value=100.0 + (i % 10) * 0.5,  # Values between 100.0 and 104.5
        )
        async_session.add(measurement)

    await async_session.commit()
    await async_session.refresh(test_characteristic)
    return test_characteristic


class TestListCharacteristics:
    """Test GET /api/v1/characteristics/"""

    @pytest.mark.asyncio
    async def test_list_empty(self, client):
        """Test listing when no characteristics exist."""
        response = await client.get("/api/v1/characteristics/")
        assert response.status_code == 200

        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["offset"] == 0
        assert data["limit"] == 100

    @pytest.mark.asyncio
    async def test_list_with_characteristics(self, client, test_characteristic):
        """Test listing characteristics."""
        response = await client.get("/api/v1/characteristics/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["items"]) == 1
        assert data["total"] == 1
        assert data["items"][0]["id"] == test_characteristic.id
        assert data["items"][0]["name"] == "Temperature"

    @pytest.mark.asyncio
    async def test_filter_by_hierarchy_id(self, client, async_session, test_hierarchy):
        """Test filtering by hierarchy_id."""
        # Create characteristics in different hierarchies
        char1 = Characteristic(
            hierarchy_id=test_hierarchy.id,
            name="Char 1",
            subgroup_size=1,

        )
        async_session.add(char1)

        hierarchy2 = Hierarchy(name="Factory 2", type="Site", parent_id=None)
        async_session.add(hierarchy2)
        await async_session.flush()

        char2 = Characteristic(
            hierarchy_id=hierarchy2.id,
            name="Char 2",
            subgroup_size=1,

        )
        async_session.add(char2)
        await async_session.commit()

        # Filter by first hierarchy
        response = await client.get(
            f"/api/v1/characteristics/?hierarchy_id={test_hierarchy.id}"
        )
        assert response.status_code == 200

        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["hierarchy_id"] == test_hierarchy.id

    @pytest.mark.asyncio
    async def test_filter_by_provider_type(self, client, async_session, test_hierarchy):
        """Test filtering by provider_type."""
        # Create a manual characteristic (no data source)
        char_manual = Characteristic(
            hierarchy_id=test_hierarchy.id,
            name="Manual Char",
            subgroup_size=1,
        )
        async_session.add(char_manual)
        await async_session.flush()

        # Create an MQTT characteristic (has a data source)
        char_mqtt = Characteristic(
            hierarchy_id=test_hierarchy.id,
            name="MQTT Char",
            subgroup_size=1,
        )
        async_session.add(char_mqtt)
        await async_session.flush()

        ds = DataSource(
            type="mqtt",
            characteristic_id=char_mqtt.id,
        )
        async_session.add(ds)
        await async_session.commit()

        # Filter by MANUAL — should only return the manual char
        response = await client.get("/api/v1/characteristics/?provider_type=MANUAL")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "Manual Char"

    @pytest.mark.asyncio
    async def test_pagination(self, client, async_session, test_hierarchy):
        """Test pagination parameters."""
        # Create 5 characteristics
        for i in range(5):
            char = Characteristic(
                hierarchy_id=test_hierarchy.id,
                name=f"Char {i}",
                subgroup_size=1,
    
            )
            async_session.add(char)
        await async_session.commit()

        # Get first page (2 items)
        response = await client.get("/api/v1/characteristics/?offset=0&limit=2")
        assert response.status_code == 200

        data = response.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["offset"] == 0
        assert data["limit"] == 2

        # Get second page
        response = await client.get("/api/v1/characteristics/?offset=2&limit=2")
        assert response.status_code == 200

        data = response.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["offset"] == 2


class TestCreateCharacteristic:
    """Test POST /api/v1/characteristics/"""

    @pytest.mark.asyncio
    async def test_create_manual_characteristic(self, client, test_hierarchy):
        """Test creating a characteristic (no data source by default)."""
        payload = {
            "hierarchy_id": test_hierarchy.id,
            "name": "Pressure",
            "description": "Process pressure measurement",
            "subgroup_size": 1,
            "target_value": 50.0,
            "usl": 55.0,
            "lsl": 45.0,
        }

        response = await client.post("/api/v1/characteristics/", json=payload)
        assert response.status_code == 201

        data = response.json()
        assert data["name"] == "Pressure"
        assert data["hierarchy_id"] == test_hierarchy.id
        assert data["data_source"] is None
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_with_invalid_hierarchy_fails(self, client):
        """Test creating characteristic with non-existent hierarchy."""
        payload = {
            "hierarchy_id": 99999,
            "name": "Test",
            "subgroup_size": 1,
        }

        response = await client.post("/api/v1/characteristics/", json=payload)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_create_initializes_rules(self, client, async_session, test_hierarchy):
        """Test that creating characteristic initializes all 8 Nelson Rules."""
        payload = {
            "hierarchy_id": test_hierarchy.id,
            "name": "Test Char",
            "subgroup_size": 1,
        }

        response = await client.post("/api/v1/characteristics/", json=payload)
        assert response.status_code == 201

        char_id = response.json()["id"]

        # Verify rules were created
        repo = CharacteristicRepository(async_session)
        char = await repo.get_with_rules(char_id)
        assert len(char.rules) == 8
        assert all(rule.is_enabled for rule in char.rules)


class TestGetCharacteristic:
    """Test GET /api/v1/characteristics/{char_id}"""

    @pytest.mark.asyncio
    async def test_get_existing_characteristic(self, client, test_characteristic):
        """Test getting an existing characteristic."""
        response = await client.get(f"/api/v1/characteristics/{test_characteristic.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == test_characteristic.id
        assert data["name"] == "Temperature"
        assert data["ucl"] == 106.0
        assert data["lcl"] == 94.0

    @pytest.mark.asyncio
    async def test_get_nonexistent_characteristic(self, client):
        """Test getting a non-existent characteristic."""
        response = await client.get("/api/v1/characteristics/99999")
        assert response.status_code == 404


class TestUpdateCharacteristic:
    """Test PATCH /api/v1/characteristics/{char_id}"""

    @pytest.mark.asyncio
    async def test_update_name(self, client, test_characteristic):
        """Test updating characteristic name."""
        payload = {"name": "Updated Temperature"}

        response = await client.patch(
            f"/api/v1/characteristics/{test_characteristic.id}",
            json=payload
        )
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "Updated Temperature"
        # Other fields should remain unchanged
        assert data["ucl"] == 106.0

    @pytest.mark.asyncio
    async def test_update_control_limits(self, client, test_characteristic):
        """Test updating control limits."""
        payload = {
            "ucl": 108.0,
            "lcl": 92.0,
        }

        response = await client.patch(
            f"/api/v1/characteristics/{test_characteristic.id}",
            json=payload
        )
        assert response.status_code == 200

        data = response.json()
        assert data["ucl"] == 108.0
        assert data["lcl"] == 92.0

    @pytest.mark.asyncio
    async def test_update_nonexistent_characteristic(self, client):
        """Test updating non-existent characteristic."""
        payload = {"name": "Test"}

        response = await client.patch("/api/v1/characteristics/99999", json=payload)
        assert response.status_code == 404


class TestDeleteCharacteristic:
    """Test DELETE /api/v1/characteristics/{char_id}"""

    @pytest.mark.asyncio
    async def test_delete_characteristic_without_samples(self, client, test_characteristic):
        """Test deleting characteristic with no samples."""
        response = await client.delete(f"/api/v1/characteristics/{test_characteristic.id}")
        assert response.status_code == 204

        # Verify it's deleted
        response = await client.get(f"/api/v1/characteristics/{test_characteristic.id}")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_characteristic_with_samples_fails(
        self, client, test_characteristic_with_samples
    ):
        """Test that deleting characteristic with samples returns 409."""
        response = await client.delete(
            f"/api/v1/characteristics/{test_characteristic_with_samples.id}"
        )
        assert response.status_code == 409
        assert "samples" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_delete_nonexistent_characteristic(self, client):
        """Test deleting non-existent characteristic."""
        response = await client.delete("/api/v1/characteristics/99999")
        assert response.status_code == 404


class TestGetChartData:
    """Test GET /api/v1/characteristics/{char_id}/chart-data"""

    @pytest.mark.asyncio
    async def test_get_chart_data(self, client, test_characteristic_with_samples):
        """Test getting chart data with samples."""
        response = await client.get(
            f"/api/v1/characteristics/{test_characteristic_with_samples.id}/chart-data"
        )
        assert response.status_code == 200

        data = response.json()
        assert data["characteristic_id"] == test_characteristic_with_samples.id
        assert "characteristic_name" in data
        assert len(data["data_points"]) > 0
        assert "control_limits" in data
        assert "spec_limits" in data
        assert "zone_boundaries" in data

        # Verify control limits structure
        limits = data["control_limits"]
        assert "center_line" in limits
        assert "ucl" in limits
        assert "lcl" in limits

        # Verify zone boundaries structure
        zones = data["zone_boundaries"]
        assert "plus_1_sigma" in zones
        assert "plus_2_sigma" in zones
        assert "plus_3_sigma" in zones
        assert "minus_1_sigma" in zones
        assert "minus_2_sigma" in zones
        assert "minus_3_sigma" in zones

        # Verify sample structure
        sample = data["data_points"][0]
        assert "sample_id" in sample
        assert "timestamp" in sample
        assert "mean" in sample
        assert "zone" in sample
        assert "excluded" in sample
        assert "violation_ids" in sample
        assert "measurements" in sample
        assert isinstance(sample["measurements"], list)
        assert len(sample["measurements"]) > 0

    @pytest.mark.asyncio
    async def test_chart_data_with_limit(self, client, test_characteristic_with_samples):
        """Test chart data with limit parameter."""
        response = await client.get(
            f"/api/v1/characteristics/{test_characteristic_with_samples.id}/chart-data?limit=10"
        )
        assert response.status_code == 200

        data = response.json()
        assert len(data["data_points"]) == 10

    @pytest.mark.asyncio
    async def test_chart_data_without_control_limits(
        self, client, async_session, test_hierarchy
    ):
        """Test chart data when control limits are not defined."""
        # Create characteristic without control limits
        char = Characteristic(
            hierarchy_id=test_hierarchy.id,
            name="No Limits",
            subgroup_size=1,
            ucl=None,
            lcl=None,
        )
        async_session.add(char)
        await async_session.commit()

        response = await client.get(f"/api/v1/characteristics/{char.id}/chart-data")
        # API returns 200 with empty data when no control limits are defined
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_chart_data_nonexistent_characteristic(self, client):
        """Test chart data for non-existent characteristic."""
        response = await client.get("/api/v1/characteristics/99999/chart-data")
        assert response.status_code == 404


class TestRecalculateLimits:
    """Test POST /api/v1/characteristics/{char_id}/recalculate-limits"""

    @pytest.mark.asyncio
    async def test_recalculate_limits(self, client, test_characteristic_with_samples):
        """Test recalculating control limits."""
        response = await client.post(
            f"/api/v1/characteristics/{test_characteristic_with_samples.id}/recalculate-limits"
        )
        assert response.status_code == 200

        data = response.json()
        assert "before" in data
        assert "after" in data
        assert "calculation" in data

        # Verify before/after structure
        assert "ucl" in data["before"]
        assert "lcl" in data["before"]
        assert "center_line" in data["before"]

        assert "ucl" in data["after"]
        assert "lcl" in data["after"]
        assert "center_line" in data["after"]

        # Verify calculation metadata
        calc = data["calculation"]
        assert "method" in calc
        assert calc["method"] in ["moving_range", "r_bar_d2", "s_bar_c4"]
        assert "sigma" in calc
        assert "sample_count" in calc
        assert calc["sample_count"] == 30
        assert "excluded_count" in calc
        assert "calculated_at" in calc

    @pytest.mark.asyncio
    async def test_recalculate_with_exclude_ooc(
        self, client, test_characteristic_with_samples
    ):
        """Test recalculating limits with exclude_ooc parameter."""
        response = await client.post(
            f"/api/v1/characteristics/{test_characteristic_with_samples.id}/recalculate-limits?exclude_ooc=true"
        )
        assert response.status_code == 200

        data = response.json()
        # Verify that calculation was performed
        assert "after" in data
        assert data["after"]["ucl"] is not None

    @pytest.mark.asyncio
    async def test_recalculate_with_min_samples(
        self, client, test_characteristic_with_samples
    ):
        """Test recalculating limits with custom min_samples."""
        response = await client.post(
            f"/api/v1/characteristics/{test_characteristic_with_samples.id}/recalculate-limits?min_samples=20"
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_recalculate_insufficient_samples_fails(self, client, test_characteristic):
        """Test recalculating limits with insufficient samples."""
        response = await client.post(
            f"/api/v1/characteristics/{test_characteristic.id}/recalculate-limits?min_samples=25"
        )
        assert response.status_code == 400
        detail = response.json()["detail"].lower()
        assert "insufficient" in detail or "invalid input" in detail

    @pytest.mark.asyncio
    async def test_recalculate_nonexistent_characteristic(self, client):
        """Test recalculating limits for non-existent characteristic."""
        response = await client.post("/api/v1/characteristics/99999/recalculate-limits")
        assert response.status_code == 404


class TestGetRules:
    """Test GET /api/v1/characteristics/{char_id}/rules"""

    @pytest.mark.asyncio
    async def test_get_rules(self, client, test_characteristic):
        """Test getting Nelson Rule configuration."""
        response = await client.get(f"/api/v1/characteristics/{test_characteristic.id}/rules")
        assert response.status_code == 200

        rules = response.json()
        assert len(rules) == 8
        assert all("rule_id" in rule for rule in rules)
        assert all("is_enabled" in rule for rule in rules)
        assert all(rule["is_enabled"] for rule in rules)  # All enabled by default

        # Verify all rule IDs 1-8 are present
        rule_ids = {rule["rule_id"] for rule in rules}
        assert rule_ids == {1, 2, 3, 4, 5, 6, 7, 8}

    @pytest.mark.asyncio
    async def test_get_rules_nonexistent_characteristic(self, client):
        """Test getting rules for non-existent characteristic."""
        response = await client.get("/api/v1/characteristics/99999/rules")
        assert response.status_code == 404


class TestUpdateRules:
    """Test PUT /api/v1/characteristics/{char_id}/rules"""

    @pytest.mark.asyncio
    @pytest.mark.xfail(
        reason="MissingGreenlet: session.delete() on selectinload-ed rules "
               "triggers lazy cascade in httpx ASGITransport thread context",
        raises=Exception,
    )
    async def test_update_rules(self, client, test_characteristic):
        """Test updating Nelson Rule configuration."""
        payload = [
            {"rule_id": 1, "is_enabled": True},
            {"rule_id": 2, "is_enabled": False},
            {"rule_id": 3, "is_enabled": True},
            {"rule_id": 4, "is_enabled": False},
            {"rule_id": 5, "is_enabled": True},
            {"rule_id": 6, "is_enabled": True},
            {"rule_id": 7, "is_enabled": False},
            {"rule_id": 8, "is_enabled": True},
        ]

        response = await client.put(
            f"/api/v1/characteristics/{test_characteristic.id}/rules",
            json=payload
        )
        assert response.status_code == 200

        rules = response.json()
        assert len(rules) == 8

        # Verify specific rules were disabled
        rule_dict = {rule["rule_id"]: rule["is_enabled"] for rule in rules}
        assert rule_dict[2] is False
        assert rule_dict[4] is False
        assert rule_dict[7] is False

    @pytest.mark.asyncio
    @pytest.mark.xfail(
        reason="MissingGreenlet: session.delete() on selectinload-ed rules "
               "triggers lazy cascade in httpx ASGITransport thread context",
        raises=Exception,
    )
    async def test_update_rules_invalid_rule_id(self, client, test_characteristic):
        """Test updating rules with invalid rule_id."""
        payload = [
            {"rule_id": 9, "is_enabled": True},  # Invalid: only 1-8 allowed
        ]

        response = await client.put(
            f"/api/v1/characteristics/{test_characteristic.id}/rules",
            json=payload
        )
        assert response.status_code == 400
        assert "invalid" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_update_rules_nonexistent_characteristic(self, client):
        """Test updating rules for non-existent characteristic."""
        payload = [{"rule_id": 1, "is_enabled": True}]

        response = await client.put("/api/v1/characteristics/99999/rules", json=payload)
        assert response.status_code == 404

    @pytest.mark.asyncio
    @pytest.mark.xfail(
        reason="MissingGreenlet: session.delete() on selectinload-ed rules "
               "triggers lazy cascade in httpx ASGITransport thread context",
        raises=Exception,
    )
    async def test_update_rules_persists(self, client, async_session, test_characteristic):
        """Test that rule updates persist in database."""
        payload = [
            {"rule_id": i, "is_enabled": i % 2 == 0}
            for i in range(1, 9)
        ]

        response = await client.put(
            f"/api/v1/characteristics/{test_characteristic.id}/rules",
            json=payload
        )
        assert response.status_code == 200

        # Verify persistence by fetching again
        repo = CharacteristicRepository(async_session)
        char = await repo.get_with_rules(test_characteristic.id)
        rule_dict = {rule.rule_id: rule.is_enabled for rule in char.rules}

        # Even rule IDs should be enabled, odd should be disabled
        for i in range(1, 9):
            expected = i % 2 == 0
            assert rule_dict[i] == expected
