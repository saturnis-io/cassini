"""Integration tests for the time-travel SPC replay endpoint.

Verifies six audit-grade behaviours:

1. Snapshot returns the resource state as it stood at the requested
   timestamp.
2. Samples are filtered to those at-or-before the requested timestamp;
   later samples are not leaked.
3. Cross-plant access is blocked (404, not 403, to prevent existence
   probing).
4. Pro+ tier gate runs BEFORE plant-scope so unentitled callers cannot
   enumerate resource IDs.
5. Resource with no audit history still returns a snapshot (best-effort)
   rather than 500ing.
6. Signature `is_valid_at_replay` flips False if the signature was
   already invalidated by the requested timestamp.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from cassini.api.deps import (
    get_current_user,
    get_db_session,
    get_license_service,
)
from cassini.api.v1.replay import router as replay_router
from cassini.db.models.audit_log import AuditLog
from cassini.db.models.characteristic import Characteristic, CharacteristicRule
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.plant import Plant
from cassini.db.models.sample import Measurement, Sample
from cassini.db.models.signature import ElectronicSignature
from cassini.db.models.user import UserRole


# ---------------------------------------------------------------------------
# Mock auth + license helpers
# ---------------------------------------------------------------------------


class _MockPlantRole:
    def __init__(self, plant_id: int, role: UserRole):
        self.plant_id = plant_id
        self.role = role


class _MockUser:
    """Mock user scoped to a single plant (non-admin) so cross-plant tests work."""

    def __init__(self, plant_id: int, role: UserRole = UserRole.engineer):
        self.id = 1
        self.username = "testuser"
        self.email = "test@example.com"
        self.is_active = True
        self.must_change_password = False
        self.plant_roles = [_MockPlantRole(plant_id=plant_id, role=role)]


class _MockLicenseService:
    """Lightweight LicenseService stand-in returning a configurable feature set."""

    def __init__(self, features: set[str]):
        self._features = features

    def has_feature(self, feature: str) -> bool:
        return feature in self._features


def _utcnow_naive() -> datetime:
    """SQLite stores DateTimes naive — match its on-disk shape so range
    queries don't false-positive across tz-aware/naive boundaries."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Fixtures — fresh app + DB per test, with a plant/hierarchy/characteristic
# already seeded so each test focuses on the assertion under verification.
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def replay_plant(async_session) -> Plant:
    plant = Plant(name="Replay Plant", code="RP01")
    async_session.add(plant)
    await async_session.commit()
    await async_session.refresh(plant)
    return plant


@pytest_asyncio.fixture
async def replay_hierarchy(async_session, replay_plant) -> Hierarchy:
    h = Hierarchy(name="Line A", type="Site", parent_id=None, plant_id=replay_plant.id)
    async_session.add(h)
    await async_session.commit()
    await async_session.refresh(h)
    return h


@pytest_asyncio.fixture
async def replay_characteristic(async_session, replay_hierarchy) -> Characteristic:
    char = Characteristic(
        hierarchy_id=replay_hierarchy.id,
        name="Replay Temp",
        description="Process temp",
        subgroup_size=1,
        target_value=100.0,
        usl=110.0,
        lsl=90.0,
        ucl=106.0,
        lcl=94.0,
    )
    async_session.add(char)
    await async_session.flush()
    rule = CharacteristicRule(char_id=char.id, rule_id=1, is_enabled=True)
    async_session.add(rule)
    await async_session.commit()
    await async_session.refresh(char)
    return char


def _build_app(
    async_session,
    user: _MockUser,
    *,
    has_replay: bool = True,
) -> FastAPI:
    """Wire up a minimal FastAPI app with the replay router and overrides."""
    app = FastAPI()
    app.include_router(replay_router)

    async def override_get_session():
        yield async_session

    features = {"time_travel_replay"} if has_replay else set()
    license_service = _MockLicenseService(features)

    app.dependency_overrides[get_db_session] = override_get_session
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_license_service] = lambda: license_service

    return app


@pytest_asyncio.fixture
async def replay_app(async_session, replay_plant):
    return _build_app(async_session, _MockUser(plant_id=replay_plant.id))


@pytest_asyncio.fixture
async def replay_client(replay_app):
    async with AsyncClient(
        transport=ASGITransport(app=replay_app), base_url="http://test"
    ) as client:
        yield client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_replay_returns_state_at_timestamp(
    replay_client, async_session, replay_characteristic, replay_plant
):
    """A snapshot at `at` returns the characteristic config + plant scope."""
    target = _utcnow_naive() - timedelta(hours=1)

    # Seed an audit event so audit_event_count >= 1 for trust signaling.
    async_session.add(
        AuditLog(
            action="recalculate",
            resource_type="characteristic",
            resource_id=replay_characteristic.id,
            timestamp=target - timedelta(minutes=5),
            sequence_number=1,
            sequence_hash="0" * 64,
            detail={"ucl": 105.0, "lcl": 95.0, "center_line": 100.0},
        )
    )
    await async_session.commit()

    response = await replay_client.get(
        f"/api/v1/replay/characteristic/{replay_characteristic.id}",
        params={"at": target.isoformat() + "Z"},
    )
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["resource_type"] == "characteristic"
    assert body["resource_id"] == replay_characteristic.id
    assert body["plant_id"] == replay_plant.id
    assert body["characteristic"]["name"] == "Replay Temp"
    assert body["characteristic"]["ucl"] == 105.0  # overlaid from audit event
    assert body["characteristic"]["lcl"] == 95.0
    assert body["audit_event_count"] >= 1


@pytest.mark.asyncio
async def test_replay_filters_samples_to_before_timestamp(
    replay_client, async_session, replay_characteristic
):
    """Samples newer than `at` MUST be excluded from the snapshot."""
    pivot = _utcnow_naive() - timedelta(hours=1)

    # 3 samples before pivot, 2 after.
    for i in range(3):
        s = Sample(
            char_id=replay_characteristic.id,
            timestamp=pivot - timedelta(minutes=10 * (i + 1)),
            batch_number=f"OLD-{i}",
            is_excluded=False,
        )
        async_session.add(s)
        await async_session.flush()
        async_session.add(Measurement(sample_id=s.id, value=100.0 + i))

    for i in range(2):
        s = Sample(
            char_id=replay_characteristic.id,
            timestamp=pivot + timedelta(minutes=10 * (i + 1)),
            batch_number=f"NEW-{i}",
            is_excluded=False,
        )
        async_session.add(s)
        await async_session.flush()
        async_session.add(Measurement(sample_id=s.id, value=100.0 + i))

    await async_session.commit()

    response = await replay_client.get(
        f"/api/v1/replay/characteristic/{replay_characteristic.id}",
        params={"at": pivot.isoformat() + "Z"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    batches = {s["batch_number"] for s in body["samples"]}
    assert batches == {"OLD-0", "OLD-1", "OLD-2"}
    assert all(b.startswith("OLD-") for b in batches), (
        f"Future-leak: {batches}"
    )


@pytest.mark.asyncio
async def test_replay_blocks_cross_plant(
    async_session, replay_characteristic, replay_plant
):
    """A user without access to the plant gets 404, not 403, so existence
    is not leaked."""
    other_plant = Plant(name="Other Plant", code="OP01")
    async_session.add(other_plant)
    await async_session.commit()
    await async_session.refresh(other_plant)

    # User is engineer at `other_plant` only — replay_characteristic belongs
    # to replay_plant, so the request must 404.
    user = _MockUser(plant_id=other_plant.id)
    app = _build_app(async_session, user)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            f"/api/v1/replay/characteristic/{replay_characteristic.id}",
            params={"at": _utcnow_naive().isoformat() + "Z"},
        )
    assert response.status_code == 404, response.text
    assert "found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_replay_requires_pro_tier(
    async_session, replay_characteristic, replay_plant
):
    """Without the `time_travel_replay` feature, the endpoint MUST 403
    BEFORE any plant-scope check (so non-Pro callers cannot enumerate IDs)."""
    user = _MockUser(plant_id=replay_plant.id)
    app = _build_app(async_session, user, has_replay=False)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            f"/api/v1/replay/characteristic/{replay_characteristic.id}",
            params={"at": _utcnow_naive().isoformat() + "Z"},
        )
    assert response.status_code == 403, response.text
    assert "pro" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_replay_handles_no_audit_history(
    replay_client, replay_characteristic
):
    """A characteristic with zero audit events MUST NOT 500 — it returns a
    best-effort snapshot with `audit_event_count == 0` and
    `earliest_known_state_at == None` so the caller knows."""
    response = await replay_client.get(
        f"/api/v1/replay/characteristic/{replay_characteristic.id}",
        params={"at": _utcnow_naive().isoformat() + "Z"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["audit_event_count"] == 0
    assert body["earliest_known_state_at"] is None
    # Live config still returned despite no history.
    assert body["characteristic"]["name"] == "Replay Temp"


@pytest.mark.asyncio
async def test_replay_signature_state_at_timestamp(
    replay_client, async_session, replay_characteristic
):
    """`is_valid_at_replay` reflects state at the requested timestamp:
    a signature invalidated AFTER `at` is still valid in the snapshot;
    one invalidated BEFORE `at` is False."""
    sig_signed_at = _utcnow_naive() - timedelta(hours=4)
    invalidated_before = _utcnow_naive() - timedelta(hours=2)
    invalidated_after = _utcnow_naive() + timedelta(hours=2)

    sig_invalid_now = ElectronicSignature(
        username="ann",
        full_name="Ann Engineer",
        timestamp=sig_signed_at,
        meaning_code="approved",
        meaning_display="Approved",
        resource_type="characteristic",
        resource_id=replay_characteristic.id,
        resource_hash="abc123",
        signature_hash="hash-invalid-before",
        is_valid=False,
        invalidated_at=invalidated_before,
        invalidated_reason="Resource modified",
    )
    sig_still_valid = ElectronicSignature(
        username="bob",
        full_name="Bob Engineer",
        timestamp=sig_signed_at,
        meaning_code="approved",
        meaning_display="Approved",
        resource_type="characteristic",
        resource_id=replay_characteristic.id,
        resource_hash="def456",
        signature_hash="hash-invalid-after",
        is_valid=False,
        invalidated_at=invalidated_after,
        invalidated_reason="Resource modified",
    )
    async_session.add_all([sig_invalid_now, sig_still_valid])
    await async_session.commit()

    # Replay BETWEEN invalidated_before and invalidated_after — sig_invalid_now
    # was already invalidated; sig_still_valid was not yet.
    target = _utcnow_naive()
    response = await replay_client.get(
        f"/api/v1/replay/characteristic/{replay_characteristic.id}",
        params={"at": target.isoformat() + "Z"},
    )
    assert response.status_code == 200, response.text
    # resource_hash uniquely identifies our two seeded signatures.
    sigs_by_hash = {s["resource_hash"]: s for s in response.json()["signatures"]}
    assert "abc123" in sigs_by_hash
    assert "def456" in sigs_by_hash
    assert sigs_by_hash["abc123"]["is_valid_at_replay"] is False, (
        "Signature invalidated before replay timestamp must be invalid"
    )
    assert sigs_by_hash["def456"]["is_valid_at_replay"] is True, (
        "Signature whose invalidation post-dates replay timestamp must "
        "still be valid in the snapshot"
    )
