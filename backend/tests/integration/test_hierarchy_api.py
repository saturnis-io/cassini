"""Integration tests for Hierarchy REST API endpoints.

Tests the complete API layer including request validation, business logic,
and database operations.
"""

import pytest
import pytest_asyncio
from fastapi import FastAPI, status
from httpx import AsyncClient

from openspc.api.v1.hierarchy import router as hierarchy_router
from openspc.db.models.characteristic import Characteristic, ProviderType
from openspc.db.models.hierarchy import Hierarchy
from openspc.db.repositories.characteristic import CharacteristicRepository
from openspc.db.repositories.hierarchy import HierarchyRepository


@pytest_asyncio.fixture
async def app(async_session):
    """Create FastAPI app with hierarchy router."""
    app = FastAPI()
    app.include_router(hierarchy_router, prefix="/api/v1/hierarchy")

    # Override dependencies to use test session
    from openspc.api.deps import get_db_session

    async def override_get_db():
        yield async_session

    app.dependency_overrides[get_db_session] = override_get_db

    return app


@pytest_asyncio.fixture
async def client(app):
    """Create async HTTP client for testing."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def sample_hierarchy(async_session):
    """Create sample hierarchy for testing.

    Structure:
        Factory A (Site)
        └── Production Area (Area)
            ├── Line 1 (Line)
            └── Line 2 (Line)
    """
    repo = HierarchyRepository(async_session)

    factory = await repo.create(name="Factory A", type="Site", parent_id=None)
    area = await repo.create(name="Production Area", type="Area", parent_id=factory.id)
    line1 = await repo.create(name="Line 1", type="Line", parent_id=area.id)
    line2 = await repo.create(name="Line 2", type="Line", parent_id=area.id)

    await async_session.commit()

    return {
        "factory": factory,
        "area": area,
        "line1": line1,
        "line2": line2,
    }


@pytest_asyncio.fixture
async def hierarchy_with_characteristics(async_session, sample_hierarchy):
    """Create hierarchy with characteristics attached."""
    line1 = sample_hierarchy["line1"]
    line2 = sample_hierarchy["line2"]

    # Add characteristics to Line 1
    char1 = Characteristic(
        hierarchy_id=line1.id,
        name="Temperature",
        description="Process temperature",
        subgroup_size=1,
        provider_type=ProviderType.TAG,
        mqtt_topic="sensors/temp1",
    )
    char2 = Characteristic(
        hierarchy_id=line1.id,
        name="Pressure",
        description="Process pressure",
        subgroup_size=3,
        provider_type=ProviderType.MANUAL,
    )

    # Add characteristic to Line 2
    char3 = Characteristic(
        hierarchy_id=line2.id,
        name="Flow Rate",
        description="Process flow rate",
        subgroup_size=1,
        provider_type=ProviderType.TAG,
        mqtt_topic="sensors/flow1",
    )

    async_session.add_all([char1, char2, char3])
    await async_session.commit()

    return {
        **sample_hierarchy,
        "char1": char1,
        "char2": char2,
        "char3": char3,
    }


class TestGetHierarchyTree:
    """Test GET /api/v1/hierarchy/ endpoint."""

    @pytest.mark.asyncio
    async def test_get_empty_tree(self, client):
        """Test getting tree when no hierarchy exists."""
        response = await client.get("/api/v1/hierarchy/")
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_get_single_root_node(self, client, async_session):
        """Test getting tree with single root node."""
        repo = HierarchyRepository(async_session)
        factory = await repo.create(name="Factory A", type="Site", parent_id=None)
        await async_session.commit()

        response = await client.get("/api/v1/hierarchy/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == factory.id
        assert data[0]["name"] == "Factory A"
        assert data[0]["type"] == "Site"
        assert data[0]["children"] == []
        assert data[0]["characteristic_count"] == 0

    @pytest.mark.asyncio
    async def test_get_nested_tree(self, client, sample_hierarchy):
        """Test getting nested tree structure."""
        response = await client.get("/api/v1/hierarchy/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert len(data) == 1  # One root (factory)

        factory = data[0]
        assert factory["name"] == "Factory A"
        assert factory["type"] == "Site"
        assert len(factory["children"]) == 1  # One area

        area = factory["children"][0]
        assert area["name"] == "Production Area"
        assert area["type"] == "Area"
        assert len(area["children"]) == 2  # Two lines

        line_names = {child["name"] for child in area["children"]}
        assert line_names == {"Line 1", "Line 2"}

    @pytest.mark.asyncio
    async def test_get_multiple_root_nodes(self, client, async_session):
        """Test getting tree with multiple root nodes."""
        repo = HierarchyRepository(async_session)
        factory_a = await repo.create(name="Factory A", type="Site", parent_id=None)
        factory_b = await repo.create(name="Factory B", type="Site", parent_id=None)
        await async_session.commit()

        response = await client.get("/api/v1/hierarchy/")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert len(data) == 2
        names = {node["name"] for node in data}
        assert names == {"Factory A", "Factory B"}


class TestCreateHierarchyNode:
    """Test POST /api/v1/hierarchy/ endpoint."""

    @pytest.mark.asyncio
    async def test_create_root_node(self, client):
        """Test creating a root hierarchy node."""
        payload = {
            "parent_id": None,
            "name": "New Factory",
            "type": "Site",
        }

        response = await client.post("/api/v1/hierarchy/", json=payload)
        assert response.status_code == status.HTTP_201_CREATED

        data = response.json()
        assert data["id"] > 0
        assert data["parent_id"] is None
        assert data["name"] == "New Factory"
        assert data["type"] == "Site"

    @pytest.mark.asyncio
    async def test_create_child_node(self, client, sample_hierarchy):
        """Test creating a child node under existing parent."""
        factory_id = sample_hierarchy["factory"].id

        payload = {
            "parent_id": factory_id,
            "name": "Quality Lab",
            "type": "Area",
        }

        response = await client.post("/api/v1/hierarchy/", json=payload)
        assert response.status_code == status.HTTP_201_CREATED

        data = response.json()
        assert data["parent_id"] == factory_id
        assert data["name"] == "Quality Lab"
        assert data["type"] == "Area"

    @pytest.mark.asyncio
    async def test_create_node_parent_not_found(self, client):
        """Test creating node with non-existent parent."""
        payload = {
            "parent_id": 99999,
            "name": "Test Node",
            "type": "Line",
        }

        response = await client.post("/api/v1/hierarchy/", json=payload)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "Parent hierarchy node 99999 not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_create_node_invalid_type(self, client):
        """Test creating node with invalid hierarchy type."""
        payload = {
            "parent_id": None,
            "name": "Test Node",
            "type": "InvalidType",
        }

        response = await client.post("/api/v1/hierarchy/", json=payload)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    @pytest.mark.asyncio
    async def test_create_node_missing_name(self, client):
        """Test creating node without required name field."""
        payload = {
            "parent_id": None,
            "type": "Site",
        }

        response = await client.post("/api/v1/hierarchy/", json=payload)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    @pytest.mark.asyncio
    async def test_create_node_empty_name(self, client):
        """Test creating node with empty name."""
        payload = {
            "parent_id": None,
            "name": "",
            "type": "Site",
        }

        response = await client.post("/api/v1/hierarchy/", json=payload)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestGetHierarchyNode:
    """Test GET /api/v1/hierarchy/{node_id} endpoint."""

    @pytest.mark.asyncio
    async def test_get_existing_node(self, client, sample_hierarchy):
        """Test getting an existing hierarchy node."""
        factory_id = sample_hierarchy["factory"].id

        response = await client.get(f"/api/v1/hierarchy/{factory_id}")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data["id"] == factory_id
        assert data["name"] == "Factory A"
        assert data["type"] == "Site"
        assert data["parent_id"] is None

    @pytest.mark.asyncio
    async def test_get_child_node(self, client, sample_hierarchy):
        """Test getting a child node."""
        line_id = sample_hierarchy["line1"].id
        area_id = sample_hierarchy["area"].id

        response = await client.get(f"/api/v1/hierarchy/{line_id}")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data["id"] == line_id
        assert data["name"] == "Line 1"
        assert data["type"] == "Line"
        assert data["parent_id"] == area_id

    @pytest.mark.asyncio
    async def test_get_nonexistent_node(self, client):
        """Test getting a node that doesn't exist."""
        response = await client.get("/api/v1/hierarchy/99999")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "Hierarchy node 99999 not found" in response.json()["detail"]


class TestUpdateHierarchyNode:
    """Test PATCH /api/v1/hierarchy/{node_id} endpoint."""

    @pytest.mark.asyncio
    async def test_update_node_name(self, client, sample_hierarchy):
        """Test updating node name."""
        factory_id = sample_hierarchy["factory"].id

        payload = {"name": "Factory A - Renovated"}

        response = await client.patch(f"/api/v1/hierarchy/{factory_id}", json=payload)
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data["id"] == factory_id
        assert data["name"] == "Factory A - Renovated"
        assert data["type"] == "Site"  # Unchanged

    @pytest.mark.asyncio
    async def test_update_node_type(self, client, sample_hierarchy):
        """Test updating node type."""
        line_id = sample_hierarchy["line1"].id

        payload = {"type": "Cell"}

        response = await client.patch(f"/api/v1/hierarchy/{line_id}", json=payload)
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data["id"] == line_id
        assert data["name"] == "Line 1"  # Unchanged
        assert data["type"] == "Cell"

    @pytest.mark.asyncio
    async def test_update_multiple_fields(self, client, sample_hierarchy):
        """Test updating multiple fields at once."""
        area_id = sample_hierarchy["area"].id

        payload = {
            "name": "Manufacturing Area",
            "type": "Line",
        }

        response = await client.patch(f"/api/v1/hierarchy/{area_id}", json=payload)
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data["id"] == area_id
        assert data["name"] == "Manufacturing Area"
        assert data["type"] == "Line"

    @pytest.mark.asyncio
    async def test_update_nonexistent_node(self, client):
        """Test updating a node that doesn't exist."""
        payload = {"name": "Updated Name"}

        response = await client.patch("/api/v1/hierarchy/99999", json=payload)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.asyncio
    async def test_update_with_empty_payload(self, client, sample_hierarchy):
        """Test updating with no fields (should return current node)."""
        factory_id = sample_hierarchy["factory"].id

        response = await client.patch(f"/api/v1/hierarchy/{factory_id}", json={})
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data["id"] == factory_id
        assert data["name"] == "Factory A"  # Unchanged

    @pytest.mark.asyncio
    async def test_update_with_invalid_type(self, client, sample_hierarchy):
        """Test updating with invalid hierarchy type."""
        factory_id = sample_hierarchy["factory"].id

        payload = {"type": "InvalidType"}

        response = await client.patch(f"/api/v1/hierarchy/{factory_id}", json=payload)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestDeleteHierarchyNode:
    """Test DELETE /api/v1/hierarchy/{node_id} endpoint."""

    @pytest.mark.asyncio
    async def test_delete_leaf_node(self, client, async_session, sample_hierarchy):
        """Test deleting a leaf node (no children)."""
        line_id = sample_hierarchy["line1"].id

        response = await client.delete(f"/api/v1/hierarchy/{line_id}")
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify node was deleted
        repo = HierarchyRepository(async_session)
        node = await repo.get_by_id(line_id)
        assert node is None

    @pytest.mark.asyncio
    async def test_delete_node_with_children(self, client, sample_hierarchy):
        """Test deleting a node that has children (should fail)."""
        area_id = sample_hierarchy["area"].id

        response = await client.delete(f"/api/v1/hierarchy/{area_id}")
        assert response.status_code == status.HTTP_409_CONFLICT
        assert "has 2 child node(s)" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_delete_root_with_children(self, client, sample_hierarchy):
        """Test deleting a root node with children (should fail)."""
        factory_id = sample_hierarchy["factory"].id

        response = await client.delete(f"/api/v1/hierarchy/{factory_id}")
        assert response.status_code == status.HTTP_409_CONFLICT
        assert "has 1 child node(s)" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_delete_nonexistent_node(self, client):
        """Test deleting a node that doesn't exist."""
        response = await client.delete("/api/v1/hierarchy/99999")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "Hierarchy node 99999 not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_delete_cascade(self, client, async_session, sample_hierarchy):
        """Test deleting all nodes bottom-up."""
        # Delete in correct order: leaves first
        line1_id = sample_hierarchy["line1"].id
        line2_id = sample_hierarchy["line2"].id
        area_id = sample_hierarchy["area"].id
        factory_id = sample_hierarchy["factory"].id

        # Delete line 1
        response = await client.delete(f"/api/v1/hierarchy/{line1_id}")
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Delete line 2
        response = await client.delete(f"/api/v1/hierarchy/{line2_id}")
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Now delete area (no more children)
        response = await client.delete(f"/api/v1/hierarchy/{area_id}")
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Finally delete factory
        response = await client.delete(f"/api/v1/hierarchy/{factory_id}")
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify all deleted
        repo = HierarchyRepository(async_session)
        assert await repo.get_by_id(factory_id) is None
        assert await repo.get_by_id(area_id) is None
        assert await repo.get_by_id(line1_id) is None
        assert await repo.get_by_id(line2_id) is None


class TestGetNodeCharacteristics:
    """Test GET /api/v1/hierarchy/{node_id}/characteristics endpoint."""

    @pytest.mark.asyncio
    async def test_get_characteristics_direct_only(
        self, client, hierarchy_with_characteristics
    ):
        """Test getting characteristics directly under a node."""
        line1_id = hierarchy_with_characteristics["line1"].id

        response = await client.get(
            f"/api/v1/hierarchy/{line1_id}/characteristics",
            params={"include_descendants": False},
        )
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert len(data) == 2  # Line 1 has 2 characteristics

        names = {char["name"] for char in data}
        assert names == {"Temperature", "Pressure"}

        # Verify structure
        for char in data:
            assert "id" in char
            assert "name" in char
            assert "provider_type" in char
            assert "in_control" in char
            assert "unacknowledged_violations" in char

    @pytest.mark.asyncio
    async def test_get_characteristics_with_descendants(
        self, client, hierarchy_with_characteristics
    ):
        """Test getting characteristics including descendants."""
        area_id = hierarchy_with_characteristics["area"].id

        response = await client.get(
            f"/api/v1/hierarchy/{area_id}/characteristics",
            params={"include_descendants": True},
        )
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert len(data) == 3  # Area has 3 characteristics across both lines

        names = {char["name"] for char in data}
        assert names == {"Temperature", "Pressure", "Flow Rate"}

    @pytest.mark.asyncio
    async def test_get_characteristics_empty_node(self, client, sample_hierarchy):
        """Test getting characteristics from node with none."""
        factory_id = sample_hierarchy["factory"].id

        response = await client.get(
            f"/api/v1/hierarchy/{factory_id}/characteristics",
            params={"include_descendants": False},
        )
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data == []

    @pytest.mark.asyncio
    async def test_get_characteristics_nonexistent_node(self, client):
        """Test getting characteristics from non-existent node."""
        response = await client.get("/api/v1/hierarchy/99999/characteristics")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "Hierarchy node 99999 not found" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_characteristics_default_params(
        self, client, hierarchy_with_characteristics
    ):
        """Test getting characteristics with default parameters."""
        line1_id = hierarchy_with_characteristics["line1"].id

        # Without include_descendants param (should default to False)
        response = await client.get(f"/api/v1/hierarchy/{line1_id}/characteristics")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert len(data) == 2  # Only direct characteristics

    @pytest.mark.asyncio
    async def test_get_characteristics_filter_by_provider(
        self, client, hierarchy_with_characteristics
    ):
        """Test characteristic filtering by provider type."""
        line1_id = hierarchy_with_characteristics["line1"].id

        response = await client.get(f"/api/v1/hierarchy/{line1_id}/characteristics")
        assert response.status_code == status.HTTP_200_OK

        data = response.json()

        # Verify provider types are present
        providers = {char["provider_type"] for char in data}
        assert providers == {"TAG", "MANUAL"}

        # Count by type
        tag_count = sum(1 for char in data if char["provider_type"] == "TAG")
        manual_count = sum(1 for char in data if char["provider_type"] == "MANUAL")
        assert tag_count == 1
        assert manual_count == 1


class TestEndToEndScenarios:
    """Test complete end-to-end scenarios."""

    @pytest.mark.asyncio
    async def test_build_complete_hierarchy(self, client):
        """Test building a complete hierarchy from scratch."""
        # Create root
        factory_response = await client.post(
            "/api/v1/hierarchy/",
            json={"parent_id": None, "name": "Factory B", "type": "Site"},
        )
        assert factory_response.status_code == status.HTTP_201_CREATED
        factory_id = factory_response.json()["id"]

        # Create area
        area_response = await client.post(
            "/api/v1/hierarchy/",
            json={"parent_id": factory_id, "name": "Assembly", "type": "Area"},
        )
        assert area_response.status_code == status.HTTP_201_CREATED
        area_id = area_response.json()["id"]

        # Create line
        line_response = await client.post(
            "/api/v1/hierarchy/",
            json={"parent_id": area_id, "name": "Line A", "type": "Line"},
        )
        assert line_response.status_code == status.HTTP_201_CREATED

        # Verify tree structure
        tree_response = await client.get("/api/v1/hierarchy/")
        assert tree_response.status_code == status.HTTP_200_OK

        tree = tree_response.json()
        # Find our factory in the tree
        factory_node = next((n for n in tree if n["id"] == factory_id), None)
        assert factory_node is not None
        assert len(factory_node["children"]) == 1
        assert factory_node["children"][0]["name"] == "Assembly"

    @pytest.mark.asyncio
    async def test_reorganize_hierarchy(self, client, async_session, sample_hierarchy):
        """Test reorganizing hierarchy structure."""
        line1_id = sample_hierarchy["line1"].id

        # Rename Line 1
        update_response = await client.patch(
            f"/api/v1/hierarchy/{line1_id}",
            json={"name": "Line 1 - Primary"},
        )
        assert update_response.status_code == status.HTTP_200_OK

        # Verify change persisted
        get_response = await client.get(f"/api/v1/hierarchy/{line1_id}")
        assert get_response.status_code == status.HTTP_200_OK
        assert get_response.json()["name"] == "Line 1 - Primary"

    @pytest.mark.asyncio
    async def test_validation_prevents_orphan_references(self, client):
        """Test that validation prevents creating orphaned references."""
        # Try to create node with non-existent parent
        response = await client.post(
            "/api/v1/hierarchy/",
            json={"parent_id": 99999, "name": "Orphan Node", "type": "Line"},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

        # Verify no node was created
        tree_response = await client.get("/api/v1/hierarchy/")
        tree = tree_response.json()
        assert not any(node["name"] == "Orphan Node" for node in tree)
