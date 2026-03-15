"""Tests for API key signature guard and resource hash expansion.

Tests cover:
- API key auth is rejected on signature operations (403)
- User auth works on signature operations
- Resource hash includes actual content for known types
- Unknown resource type raises ValueError
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_user_no_api_key
from cassini.core.auth.passwords import hash_password
from cassini.core.signature_engine import SignatureWorkflowEngine, compute_resource_hash
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.material import Material
from cassini.db.models.plant import Plant
from cassini.db.models.signature import SignatureMeaning
from cassini.db.models.user import User, UserPlantRole, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def plant(async_session: AsyncSession) -> Plant:
    """Create a test plant."""
    p = Plant(name="Guard Test Plant", code="GT")
    async_session.add(p)
    await async_session.flush()
    await async_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def user_with_role(async_session: AsyncSession, plant: Plant) -> User:
    """Create a test user with supervisor role."""
    u = User(
        username="guard_tester",
        hashed_password=hash_password("test-password"),
        is_active=True,
        password_changed_at=datetime.now(timezone.utc),
    )
    async_session.add(u)
    await async_session.flush()
    await async_session.refresh(u)

    role = UserPlantRole(
        user_id=u.id,
        plant_id=plant.id,
        role=UserRole.supervisor,
    )
    async_session.add(role)
    await async_session.flush()
    await async_session.refresh(u, ["plant_roles"])
    return u


@pytest_asyncio.fixture
async def meaning(async_session: AsyncSession, plant: Plant) -> SignatureMeaning:
    """Create a test signature meaning."""
    m = SignatureMeaning(
        plant_id=plant.id,
        code="approved",
        display_name="Approved",
        requires_comment=False,
    )
    async_session.add(m)
    await async_session.flush()
    await async_session.refresh(m)
    return m


@pytest_asyncio.fixture
async def hierarchy_node(async_session: AsyncSession, plant: Plant) -> Hierarchy:
    """Create a test hierarchy node."""
    h = Hierarchy(
        name="Test Line",
        type="Line",
        plant_id=plant.id,
    )
    async_session.add(h)
    await async_session.flush()
    await async_session.refresh(h)
    return h


@pytest_asyncio.fixture
async def characteristic(
    async_session: AsyncSession, hierarchy_node: Hierarchy
) -> Characteristic:
    """Create a test characteristic."""
    c = Characteristic(
        hierarchy_id=hierarchy_node.id,
        name="Diameter",
        subgroup_size=5,
        usl=10.5,
        lsl=9.5,
        target_value=10.0,
    )
    async_session.add(c)
    await async_session.flush()
    await async_session.refresh(c)
    return c


@pytest_asyncio.fixture
async def material(async_session: AsyncSession, plant: Plant) -> Material:
    """Create a test material."""
    m = Material(
        plant_id=plant.id,
        name="Steel Rod",
        code="SR-001",
    )
    async_session.add(m)
    await async_session.flush()
    await async_session.refresh(m)
    return m


# ---------------------------------------------------------------------------
# Part A: API Key Signature Guard Tests
# ---------------------------------------------------------------------------


class TestAPIKeySignatureGuard:
    """Tests for get_current_user_no_api_key dependency."""

    @pytest.mark.asyncio
    async def test_rejects_api_key_only_auth(
        self, async_session: AsyncSession
    ) -> None:
        """API key auth without JWT should be rejected with 403."""
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_no_api_key(
                authorization=None,
                x_api_key="some-api-key-value",
                session=async_session,
            )

        assert exc_info.value.status_code == 403
        assert "API key" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_rejects_no_auth(self, async_session: AsyncSession) -> None:
        """No auth at all should be rejected with 401."""
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_no_api_key(
                authorization=None,
                x_api_key=None,
                session=async_session,
            )

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_rejects_invalid_jwt(self, async_session: AsyncSession) -> None:
        """Invalid JWT should be rejected with 401."""
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_no_api_key(
                authorization="Bearer invalid-token-value",
                x_api_key=None,
                session=async_session,
            )

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_accepts_valid_jwt(
        self, async_session: AsyncSession, user_with_role: User
    ) -> None:
        """Valid JWT should return the authenticated user."""
        from cassini.core.auth.jwt import create_access_token

        token = create_access_token(user_with_role.id, user_with_role.username)
        result = await get_current_user_no_api_key(
            authorization=f"Bearer {token}",
            x_api_key=None,
            session=async_session,
        )

        assert isinstance(result, User)
        assert result.id == user_with_role.id
        assert result.username == "guard_tester"

    @pytest.mark.asyncio
    async def test_prefers_jwt_even_with_api_key_present(
        self, async_session: AsyncSession, user_with_role: User
    ) -> None:
        """When both JWT and API key are provided, JWT should be used."""
        from cassini.core.auth.jwt import create_access_token

        token = create_access_token(user_with_role.id, user_with_role.username)
        result = await get_current_user_no_api_key(
            authorization=f"Bearer {token}",
            x_api_key="some-api-key",
            session=async_session,
        )

        assert isinstance(result, User)
        assert result.id == user_with_role.id


# ---------------------------------------------------------------------------
# Part B: Resource Hash Expansion Tests
# ---------------------------------------------------------------------------


class TestResourceHashExpansion:
    """Tests for load_resource_content with expanded resource types."""

    @pytest.mark.asyncio
    async def test_characteristic_hash_includes_content(
        self,
        async_session: AsyncSession,
        characteristic: Characteristic,
    ) -> None:
        """Characteristic resource hash should include spec limits and subgroup size."""
        engine = SignatureWorkflowEngine(async_session)
        content = await engine.load_resource_content(
            async_session, "characteristic", characteristic.id
        )

        assert content["resource_id"] == characteristic.id
        assert content["name"] == "Diameter"
        assert content["usl"] == 10.5
        assert content["lsl"] == 9.5
        assert content["target"] == 10.0
        assert content["subgroup_size"] == 5

    @pytest.mark.asyncio
    async def test_plant_hash_includes_content(
        self,
        async_session: AsyncSession,
        plant: Plant,
    ) -> None:
        """Plant resource hash should include name and code."""
        engine = SignatureWorkflowEngine(async_session)
        content = await engine.load_resource_content(
            async_session, "plant", plant.id
        )

        assert content["resource_id"] == plant.id
        assert content["name"] == "Guard Test Plant"
        assert content["code"] == "GT"

    @pytest.mark.asyncio
    async def test_hierarchy_node_hash_includes_content(
        self,
        async_session: AsyncSession,
        hierarchy_node: Hierarchy,
        plant: Plant,
    ) -> None:
        """Hierarchy node resource hash should include name, type, parent_id."""
        engine = SignatureWorkflowEngine(async_session)
        content = await engine.load_resource_content(
            async_session, "hierarchy_node", hierarchy_node.id
        )

        assert content["resource_id"] == hierarchy_node.id
        assert content["name"] == "Test Line"
        assert content["type"] == "Line"
        assert content["parent_id"] is None  # root node

    @pytest.mark.asyncio
    async def test_material_hash_includes_content(
        self,
        async_session: AsyncSession,
        material: Material,
        plant: Plant,
    ) -> None:
        """Material resource hash should include code, name, plant_id."""
        engine = SignatureWorkflowEngine(async_session)
        content = await engine.load_resource_content(
            async_session, "material", material.id
        )

        assert content["resource_id"] == material.id
        assert content["code"] == "SR-001"
        assert content["name"] == "Steel Rod"
        assert content["plant_id"] == plant.id

    @pytest.mark.asyncio
    async def test_unknown_resource_type_raises_value_error(
        self,
        async_session: AsyncSession,
    ) -> None:
        """Unknown resource types should raise ValueError, not silently hash."""
        engine = SignatureWorkflowEngine(async_session)
        with pytest.raises(ValueError, match="Unknown resource type"):
            await engine.load_resource_content(
                async_session, "nonexistent_type", 999
            )

    @pytest.mark.asyncio
    async def test_known_type_missing_record_returns_minimal(
        self,
        async_session: AsyncSession,
    ) -> None:
        """A known type with a missing record should return minimal content."""
        engine = SignatureWorkflowEngine(async_session)
        content = await engine.load_resource_content(
            async_session, "characteristic", 99999
        )

        assert content == {"resource_id": 99999}

    @pytest.mark.asyncio
    async def test_resource_hash_changes_with_content(
        self,
        async_session: AsyncSession,
        characteristic: Characteristic,
    ) -> None:
        """Hash should differ between ID-only and content-rich data."""
        # Hash with actual content
        engine = SignatureWorkflowEngine(async_session)
        content = await engine.load_resource_content(
            async_session, "characteristic", characteristic.id
        )
        hash_with_content = compute_resource_hash("characteristic", content)

        # Hash with ID-only data (what the old fallback would produce)
        hash_id_only = compute_resource_hash(
            "characteristic", {"resource_id": characteristic.id}
        )

        assert hash_with_content != hash_id_only

    @pytest.mark.asyncio
    async def test_retention_purge_still_works(
        self,
        async_session: AsyncSession,
    ) -> None:
        """Existing retention_purge handler should still work."""
        engine = SignatureWorkflowEngine(async_session)
        content = await engine.load_resource_content(
            async_session, "retention_purge", 42
        )

        assert content == {"action": "purge", "resource_id": 42}

    @pytest.mark.asyncio
    async def test_characteristic_hash_deterministic(
        self,
        async_session: AsyncSession,
        characteristic: Characteristic,
    ) -> None:
        """Repeated calls with same data should produce identical hashes."""
        engine = SignatureWorkflowEngine(async_session)
        content1 = await engine.load_resource_content(
            async_session, "characteristic", characteristic.id
        )
        content2 = await engine.load_resource_content(
            async_session, "characteristic", characteristic.id
        )

        hash1 = compute_resource_hash("characteristic", content1)
        hash2 = compute_resource_hash("characteristic", content2)

        assert hash1 == hash2
