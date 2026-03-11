"""Unit tests for CharacteristicUpdatedEvent publication.

Verifies that update_characteristic(), update_rules(), apply_preset(),
and change_subgroup_mode() endpoints publish CharacteristicUpdatedEvent
to the event bus after successful commits.

This is critical for cache invalidation (e.g., NelsonRuleLibrary cache
in SPCEngine, control limit cache in RollingWindowManager).

Tests for update_characteristic() use httpx ASGITransport (no rules
relationship access, so no MissingGreenlet).  Tests for update_rules(),
apply_preset(), and change_subgroup_mode() call the endpoint functions
directly to avoid the known MissingGreenlet issue with httpx
ASGITransport + session.delete() on selectinloaded relationships.
"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from cassini.api.deps import get_current_engineer, get_current_user, get_db_session
from cassini.api.v1.characteristics import router
from cassini.api.schemas.characteristic import NelsonRuleConfig
from cassini.core.events.events import CharacteristicUpdatedEvent
from cassini.db.models.characteristic import Characteristic, CharacteristicRule
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.plant import Plant
from cassini.db.models.rule_preset import RulePreset
from cassini.db.models.user import UserRole


class _MockPlantRole:
    """Lightweight stand-in for UserPlantRole so check_plant_role works."""

    def __init__(self, plant_id: int, role: UserRole):
        self.plant_id = plant_id
        self.role = role


class _MockUser:
    """Lightweight stand-in for User that satisfies auth checks."""

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

    async def override_get_session():
        yield async_session

    app.dependency_overrides[get_db_session] = override_get_session

    test_user = _MockUser()
    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[get_current_engineer] = lambda: test_user

    return app


@pytest_asyncio.fixture
async def client(app):
    """Create async HTTP client for testing."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
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
    """Create test characteristic with default rules."""
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

    for rule_id in range(1, 9):
        rule = CharacteristicRule(char_id=char.id, rule_id=rule_id, is_enabled=True)
        async_session.add(rule)

    await async_session.commit()
    await async_session.refresh(char)
    return char


# ---------------------------------------------------------------------------
# update_characteristic — via httpx (no rules relationship, no greenlet issue)
# ---------------------------------------------------------------------------


class TestUpdateCharacteristicPublishesEvent:
    """Tests for CharacteristicUpdatedEvent publication from update_characteristic()."""

    @pytest.mark.asyncio
    async def test_update_characteristic_publishes_event(
        self, client, test_characteristic,
    ):
        """Changing characteristic config publishes CharacteristicUpdatedEvent."""
        mock_publish = AsyncMock()

        with patch("cassini.api.v1.characteristics.event_bus") as mock_bus:
            mock_bus.publish = mock_publish

            response = await client.patch(
                f"/api/v1/characteristics/{test_characteristic.id}",
                json={"name": "Updated Temperature"},
            )

        assert response.status_code == 200
        mock_publish.assert_called_once()

        event = mock_publish.call_args[0][0]
        assert isinstance(event, CharacteristicUpdatedEvent)
        assert event.characteristic_id == test_characteristic.id
        assert "name" in event.changes
        assert event.changes["name"] == "Updated Temperature"

    @pytest.mark.asyncio
    async def test_update_characteristic_no_changes_no_event(
        self, client, test_characteristic,
    ):
        """If no fields actually changed, no event should be published."""
        mock_publish = AsyncMock()

        with patch("cassini.api.v1.characteristics.event_bus") as mock_bus:
            mock_bus.publish = mock_publish

            # Send the same name -- no actual change
            response = await client.patch(
                f"/api/v1/characteristics/{test_characteristic.id}",
                json={"name": "Temperature"},
            )

        assert response.status_code == 200
        mock_publish.assert_not_called()

    @pytest.mark.asyncio
    async def test_update_characteristic_event_contains_only_changed_fields(
        self, client, test_characteristic,
    ):
        """Event changes dict should only include fields that actually changed."""
        mock_publish = AsyncMock()

        with patch("cassini.api.v1.characteristics.event_bus") as mock_bus:
            mock_bus.publish = mock_publish

            response = await client.patch(
                f"/api/v1/characteristics/{test_characteristic.id}",
                json={"name": "New Name", "description": "Process temperature"},
            )

        assert response.status_code == 200
        mock_publish.assert_called_once()

        event = mock_publish.call_args[0][0]
        # description didn't change, so only name should be in changes
        assert "name" in event.changes
        assert "description" not in event.changes


# ---------------------------------------------------------------------------
# update_rules — direct function invocation to avoid MissingGreenlet
# ---------------------------------------------------------------------------


class TestUpdateRulesPublishesEvent:
    """Tests for CharacteristicUpdatedEvent publication from update_rules().

    These tests call the endpoint function directly with a mocked session
    and repo layer to avoid the MissingGreenlet issue that occurs when
    session.delete() is called on selectinloaded rules inside the httpx
    ASGITransport thread context.
    """

    @pytest.mark.asyncio
    async def test_update_rules_publishes_event(self):
        """Changing rule configuration publishes CharacteristicUpdatedEvent."""
        from cassini.api.v1.characteristics import update_rules

        # Build mock characteristic with eagerly-loaded rules
        mock_char = MagicMock()
        mock_char.id = 42
        old_rule = MagicMock()
        old_rule.rule_id = 1
        old_rule.is_enabled = True
        mock_char.rules = [old_rule]

        # After commit + refresh, characteristic.rules reflects new state
        new_rule_obj = MagicMock()
        new_rule_obj.rule_id = 1
        new_rule_obj.is_enabled = False
        new_rule_obj.require_acknowledgement = True
        new_rule_obj.parameters = None

        mock_repo = AsyncMock()
        mock_repo.get_with_rules.return_value = mock_char

        mock_session = AsyncMock()

        # After session.refresh(), update characteristic.rules to new state
        async def _refresh_side_effect(obj):
            obj.rules = [new_rule_obj]
        mock_session.refresh.side_effect = _refresh_side_effect

        mock_request = MagicMock()
        mock_request.state = SimpleNamespace()

        mock_user = _MockUser()

        rules_input = [NelsonRuleConfig(rule_id=1, is_enabled=False)]

        mock_publish = AsyncMock()
        with patch("cassini.api.v1.characteristics.event_bus") as mock_bus:
            mock_bus.publish = mock_publish

            result = await update_rules(
                char_id=42,
                rules=rules_input,
                request=mock_request,
                repo=mock_repo,
                session=mock_session,
                _user=mock_user,
            )

        mock_publish.assert_called_once()
        event = mock_publish.call_args[0][0]
        assert isinstance(event, CharacteristicUpdatedEvent)
        assert event.characteristic_id == 42
        assert "rules" in event.changes

    @pytest.mark.asyncio
    async def test_update_rules_event_contains_new_rule_state(self):
        """Event changes['rules'] should reflect the new rule configuration."""
        from cassini.api.v1.characteristics import update_rules

        mock_char = MagicMock()
        mock_char.id = 10
        # Old rules: all enabled
        old_rules = []
        for i in range(1, 9):
            r = MagicMock()
            r.rule_id = i
            r.is_enabled = True
            old_rules.append(r)
        mock_char.rules = old_rules

        # New rules after refresh: rule 3 disabled
        new_rule_objs = []
        for i in range(1, 9):
            r = MagicMock()
            r.rule_id = i
            r.is_enabled = (i != 3)
            r.require_acknowledgement = True
            r.parameters = None
            new_rule_objs.append(r)

        mock_repo = AsyncMock()
        mock_repo.get_with_rules.return_value = mock_char

        mock_session = AsyncMock()

        async def _refresh_side_effect(obj):
            obj.rules = new_rule_objs
        mock_session.refresh.side_effect = _refresh_side_effect

        mock_request = MagicMock()
        mock_request.state = SimpleNamespace()

        rules_input = [
            NelsonRuleConfig(rule_id=i, is_enabled=(i != 3))
            for i in range(1, 9)
        ]

        mock_publish = AsyncMock()
        with patch("cassini.api.v1.characteristics.event_bus") as mock_bus:
            mock_bus.publish = mock_publish

            await update_rules(
                char_id=10,
                rules=rules_input,
                request=mock_request,
                repo=mock_repo,
                session=mock_session,
                _user=_MockUser(),
            )

        event = mock_publish.call_args[0][0]
        rules_in_event = event.changes["rules"]
        rule_3 = next(r for r in rules_in_event if r["rule_id"] == 3)
        assert rule_3["is_enabled"] is False

        # Confirm other rules are enabled
        rule_1 = next(r for r in rules_in_event if r["rule_id"] == 1)
        assert rule_1["is_enabled"] is True


# ---------------------------------------------------------------------------
# apply_preset — direct function invocation
# ---------------------------------------------------------------------------


class TestApplyPresetPublishesEvent:
    """Tests for CharacteristicUpdatedEvent publication from apply_preset()."""

    @pytest.mark.asyncio
    async def test_apply_preset_publishes_event(self, async_session, test_characteristic):
        """Applying a rule preset publishes CharacteristicUpdatedEvent."""
        from cassini.api.v1.rule_presets import apply_preset
        from cassini.api.schemas.rule_preset import ApplyPresetRequest

        # Create a preset in the database
        rules_config = json.dumps([
            {"rule_id": 1, "is_enabled": True},
            {"rule_id": 2, "is_enabled": False},
        ])
        preset = RulePreset(
            name="TestPreset",
            description="For testing",
            is_builtin=False,
            rules_config=rules_config,
        )
        async_session.add(preset)
        await async_session.commit()
        await async_session.refresh(preset)

        mock_request = MagicMock()
        mock_request.state = SimpleNamespace()

        body = ApplyPresetRequest(preset_id=preset.id)

        mock_publish = AsyncMock()
        with patch("cassini.api.v1.rule_presets.event_bus") as mock_bus:
            mock_bus.publish = mock_publish

            result = await apply_preset(
                char_id=test_characteristic.id,
                body=body,
                request=mock_request,
                session=async_session,
                _user=_MockUser(),
            )

        mock_publish.assert_called_once()
        event = mock_publish.call_args[0][0]
        assert isinstance(event, CharacteristicUpdatedEvent)
        assert event.characteristic_id == test_characteristic.id
        assert "rules_preset" in event.changes
        assert event.changes["rules_preset"] == "TestPreset"
        assert "rules" in event.changes

    @pytest.mark.asyncio
    async def test_apply_preset_event_contains_applied_rules(
        self, async_session, test_characteristic,
    ):
        """Event changes['rules'] should match the rules from the preset."""
        from cassini.api.v1.rule_presets import apply_preset
        from cassini.api.schemas.rule_preset import ApplyPresetRequest

        rules_config = json.dumps([
            {"rule_id": i, "is_enabled": i <= 4}
            for i in range(1, 9)
        ])
        preset = RulePreset(
            name="HalfEnabled",
            description="Rules 1-4 on, 5-8 off",
            is_builtin=False,
            rules_config=rules_config,
        )
        async_session.add(preset)
        await async_session.commit()
        await async_session.refresh(preset)

        mock_request = MagicMock()
        mock_request.state = SimpleNamespace()

        mock_publish = AsyncMock()
        with patch("cassini.api.v1.rule_presets.event_bus") as mock_bus:
            mock_bus.publish = mock_publish

            await apply_preset(
                char_id=test_characteristic.id,
                body=ApplyPresetRequest(preset_id=preset.id),
                request=mock_request,
                session=async_session,
                _user=_MockUser(),
            )

        event = mock_publish.call_args[0][0]
        rules_in_event = event.changes["rules"]
        # Rules 5-8 should be disabled
        for r in rules_in_event:
            if r["rule_id"] <= 4:
                assert r["is_enabled"] is True
            else:
                assert r["is_enabled"] is False


# ---------------------------------------------------------------------------
# change_subgroup_mode — via httpx (no rules relationship involved)
# ---------------------------------------------------------------------------


class TestChangeSubgroupModePublishesEvent:
    """Tests for CharacteristicUpdatedEvent from change_subgroup_mode()."""

    @pytest.mark.asyncio
    async def test_change_subgroup_mode_publishes_event(
        self, client, test_characteristic,
    ):
        """Changing subgroup mode publishes CharacteristicUpdatedEvent."""
        mock_publish = AsyncMock()

        with patch("cassini.api.v1.characteristics.event_bus") as mock_bus:
            mock_bus.publish = mock_publish

            response = await client.post(
                f"/api/v1/characteristics/{test_characteristic.id}/change-mode",
                json={"new_mode": "NOMINAL_TOLERANCE"},
            )

        assert response.status_code == 200
        mock_publish.assert_called_once()

        event = mock_publish.call_args[0][0]
        assert isinstance(event, CharacteristicUpdatedEvent)
        assert event.characteristic_id == test_characteristic.id
        assert event.changes == {"subgroup_mode": "NOMINAL_TOLERANCE"}
