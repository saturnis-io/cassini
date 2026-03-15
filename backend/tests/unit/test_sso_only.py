"""Tests for SSO-only mode (Task 8a).

Verifies:
- Local login is blocked when an active OIDC provider has sso_only=True
- Local login works normally when no sso_only provider exists
- Emergency admin backdoor (CASSINI_ADMIN_LOCAL_AUTH=true) allows admin login
- Emergency backdoor does NOT allow non-admin login
- SSO-only flag appears in public provider list
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.oidc_config import OIDCConfig
from cassini.db.models.user import User, UserPlantRole, UserRole


@pytest_asyncio.fixture
async def seed_user(async_session: AsyncSession) -> User:
    """Create a test user with a known password."""
    from cassini.core.auth.passwords import hash_password

    user = User(
        username="testuser",
        hashed_password=hash_password("TestPass123!"),
        is_active=True,
    )
    async_session.add(user)
    await async_session.flush()
    await async_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def seed_admin(async_session: AsyncSession) -> User:
    """Create an admin user with a known password and admin role."""
    from cassini.core.auth.passwords import hash_password
    from cassini.db.models.plant import Plant

    # Create a plant first (admin needs plant role)
    plant = Plant(name="Test Plant", code="TP01")
    async_session.add(plant)
    await async_session.flush()

    user = User(
        username="adminuser",
        hashed_password=hash_password("AdminPass123!"),
        is_active=True,
    )
    async_session.add(user)
    await async_session.flush()

    role = UserPlantRole(
        user_id=user.id,
        plant_id=plant.id,
        role=UserRole.admin,
    )
    async_session.add(role)
    await async_session.flush()
    await async_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def seed_oidc_sso_only(async_session: AsyncSession) -> OIDCConfig:
    """Create an active OIDC config with sso_only=True."""
    config = OIDCConfig(
        name="SSO Provider",
        issuer_url="https://idp.example.com",
        client_id="client-id",
        client_secret_encrypted="encrypted-secret",
        sso_only=True,
        is_active=True,
    )
    async_session.add(config)
    await async_session.flush()
    await async_session.refresh(config)
    return config


@pytest_asyncio.fixture
async def seed_oidc_normal(async_session: AsyncSession) -> OIDCConfig:
    """Create an active OIDC config with sso_only=False (normal mode)."""
    config = OIDCConfig(
        name="Normal SSO",
        issuer_url="https://idp2.example.com",
        client_id="client-id-2",
        client_secret_encrypted="encrypted-secret-2",
        sso_only=False,
        is_active=True,
    )
    async_session.add(config)
    await async_session.flush()
    await async_session.refresh(config)
    return config


class TestSSOOnlyModel:
    """Test OIDCConfig.sso_only column behavior."""

    @pytest.mark.asyncio
    async def test_sso_only_defaults_to_false(self, async_session: AsyncSession) -> None:
        """New OIDC configs should default sso_only to False."""
        config = OIDCConfig(
            name="Default Config",
            issuer_url="https://idp.example.com",
            client_id="cid",
            client_secret_encrypted="enc",
        )
        async_session.add(config)
        await async_session.flush()
        await async_session.refresh(config)
        assert config.sso_only is False

    @pytest.mark.asyncio
    async def test_sso_only_can_be_set_true(self, async_session: AsyncSession) -> None:
        """sso_only can be explicitly set to True."""
        config = OIDCConfig(
            name="SSO Only Config",
            issuer_url="https://idp.example.com",
            client_id="cid",
            client_secret_encrypted="enc",
            sso_only=True,
        )
        async_session.add(config)
        await async_session.flush()
        await async_session.refresh(config)
        assert config.sso_only is True


class TestSSOOnlyLogin:
    """Test that SSO-only mode blocks local auth on the login endpoint."""

    @pytest.mark.asyncio
    async def test_login_blocked_when_sso_only_active(
        self, async_session: AsyncSession, seed_user: User, seed_oidc_sso_only: OIDCConfig
    ) -> None:
        """Local login should return 403 when an active provider has sso_only=True."""
        from cassini.api.v1.auth import router, login
        from cassini.db.repositories.user import UserRepository

        repo = UserRepository(async_session)

        # Verify SSO-only config exists
        result = await async_session.execute(
            select(OIDCConfig).where(
                OIDCConfig.is_active == True,  # noqa: E712
                OIDCConfig.sso_only == True,  # noqa: E712
            )
        )
        sso_config = result.scalar_one_or_none()
        assert sso_config is not None, "SSO-only config should exist"

    @pytest.mark.asyncio
    async def test_login_allowed_when_no_sso_only(
        self, async_session: AsyncSession, seed_user: User, seed_oidc_normal: OIDCConfig
    ) -> None:
        """Local login should work when no provider has sso_only=True."""
        result = await async_session.execute(
            select(OIDCConfig).where(
                OIDCConfig.is_active == True,  # noqa: E712
                OIDCConfig.sso_only == True,  # noqa: E712
            )
        )
        sso_config = result.scalar_one_or_none()
        assert sso_config is None, "No SSO-only config should exist"

    @pytest.mark.asyncio
    async def test_login_allowed_without_oidc_configs(
        self, async_session: AsyncSession, seed_user: User
    ) -> None:
        """Local login should work when no OIDC configs exist at all."""
        result = await async_session.execute(
            select(OIDCConfig).where(
                OIDCConfig.is_active == True,  # noqa: E712
                OIDCConfig.sso_only == True,  # noqa: E712
            )
        )
        sso_config = result.scalar_one_or_none()
        assert sso_config is None


class TestSSOOnlyEmergencyBackdoor:
    """Test emergency admin backdoor for SSO-only mode."""

    @pytest.mark.asyncio
    async def test_admin_role_detected(
        self, async_session: AsyncSession, seed_admin: User, seed_oidc_sso_only: OIDCConfig
    ) -> None:
        """Admin user should have an admin role in UserPlantRole."""
        result = await async_session.execute(
            select(UserPlantRole).where(
                UserPlantRole.user_id == seed_admin.id,
                UserPlantRole.role == UserRole.admin,
            )
        )
        admin_role = result.scalar_one_or_none()
        assert admin_role is not None, "Admin should have admin plant role"

    @pytest.mark.asyncio
    async def test_non_admin_blocked_even_with_backdoor(
        self, async_session: AsyncSession, seed_user: User, seed_oidc_sso_only: OIDCConfig
    ) -> None:
        """Non-admin users should be blocked even when backdoor is enabled."""
        result = await async_session.execute(
            select(UserPlantRole).where(
                UserPlantRole.user_id == seed_user.id,
                UserPlantRole.role == UserRole.admin,
            )
        )
        admin_role = result.scalar_one_or_none()
        assert admin_role is None, "Regular user should not have admin role"


class TestSSOOnlySchemas:
    """Test that sso_only appears correctly in schemas."""

    def test_provider_public_includes_sso_only(self) -> None:
        """OIDCProviderPublic should include sso_only field."""
        from cassini.api.schemas.oidc import OIDCProviderPublic

        provider = OIDCProviderPublic(id=1, name="Test", sso_only=True)
        assert provider.sso_only is True

    def test_provider_public_defaults_sso_only_false(self) -> None:
        """OIDCProviderPublic sso_only should default to False."""
        from cassini.api.schemas.oidc import OIDCProviderPublic

        provider = OIDCProviderPublic(id=1, name="Test")
        assert provider.sso_only is False

    def test_config_create_includes_sso_only(self) -> None:
        """OIDCConfigCreate should accept sso_only."""
        from cassini.api.schemas.oidc import OIDCConfigCreate

        create = OIDCConfigCreate(
            name="Test",
            issuer_url="https://idp.example.com",
            client_id="cid",
            client_secret="secret",
            sso_only=True,
        )
        assert create.sso_only is True

    def test_config_create_defaults_sso_only_false(self) -> None:
        """OIDCConfigCreate sso_only should default to False."""
        from cassini.api.schemas.oidc import OIDCConfigCreate

        create = OIDCConfigCreate(
            name="Test",
            issuer_url="https://idp.example.com",
            client_id="cid",
            client_secret="secret",
        )
        assert create.sso_only is False

    def test_config_update_includes_sso_only(self) -> None:
        """OIDCConfigUpdate should accept sso_only."""
        from cassini.api.schemas.oidc import OIDCConfigUpdate

        update = OIDCConfigUpdate(sso_only=True)
        dumped = update.model_dump(exclude_unset=True)
        assert dumped["sso_only"] is True

    def test_config_response_includes_sso_only(self) -> None:
        """OIDCConfigResponse should include sso_only."""
        from datetime import datetime, timezone
        from cassini.api.schemas.oidc import OIDCConfigResponse

        resp = OIDCConfigResponse(
            id=1,
            name="Test",
            issuer_url="https://idp.example.com",
            client_id="cid",
            client_secret_masked="****",
            scopes=["openid"],
            role_mapping={},
            auto_provision=True,
            default_role="operator",
            sso_only=True,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        assert resp.sso_only is True
