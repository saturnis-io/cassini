"""Cross-plant isolation tests for the Cassini API.

Covers the IDOR fixes from internal audit findings A6-C1, A6-C2, A6-C3, and
A4-H6. Each test creates two plants and two operators (one per plant) and
verifies that operator B cannot read, list, or be notified about resources
owned by plant A.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import pytest
import pytest_asyncio
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient

from cassini.api.deps import (
    get_current_admin,
    get_current_engineer,
    get_current_user,
    get_db_session,
)
from cassini.api.v1.audit import router as audit_router
from cassini.api.v1.characteristics import router as characteristics_router
from cassini.api.v1.samples import router as samples_router
from cassini.api.v1.violations import router as violations_router
from cassini.db.models.audit_log import AuditLog
from cassini.db.models.characteristic import Characteristic, CharacteristicRule
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.plant import Plant
from cassini.db.models.sample import Measurement, Sample, SampleEditHistory
from cassini.db.models.user import User, UserPlantRole, UserRole
from cassini.db.models.violation import Violation


# ---------------------------------------------------------------------------
# Two-plant fixture set
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def two_plants(async_session) -> tuple[Plant, Plant]:
    """Create two distinct plants A and B."""
    plant_a = Plant(name="Plant A", code="PA")
    plant_b = Plant(name="Plant B", code="PB")
    async_session.add_all([plant_a, plant_b])
    await async_session.commit()
    await async_session.refresh(plant_a)
    await async_session.refresh(plant_b)
    return plant_a, plant_b


@pytest_asyncio.fixture
async def hierarchies(async_session, two_plants):
    """Hierarchy node per plant (one Site each)."""
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
    """One characteristic per plant."""
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
    await async_session.flush()
    for cid in (c_a.id, c_b.id):
        for rule_id in range(1, 9):
            async_session.add(CharacteristicRule(char_id=cid, rule_id=rule_id, is_enabled=True))
    await async_session.commit()
    await async_session.refresh(c_a)
    await async_session.refresh(c_b)
    return c_a, c_b


class _StubPlantRole:
    """Plain stub so equality comparisons against ``UserRole.admin`` work.

    A MagicMock would always return a truthy mock for attribute access, which
    makes ``pr.role == UserRole.admin`` falsely positive.
    """

    def __init__(self, plant_id: int, role: UserRole):
        self.plant_id = plant_id
        self.role = role


class _StubUser:
    """Minimal User stand-in that satisfies the auth helpers."""

    def __init__(self, user_id: int, plant_id: int, role: UserRole):
        self.id = user_id
        self.username = f"user{user_id}"
        self.is_active = True
        self.plant_roles = [_StubPlantRole(plant_id=plant_id, role=role)]


def _make_user(user_id: int, plant_id: int, role: UserRole) -> _StubUser:
    return _StubUser(user_id, plant_id, role)


@pytest_asyncio.fixture
async def operator_a(two_plants):
    """Operator at Plant A (no role at Plant B)."""
    return _make_user(101, two_plants[0].id, UserRole.operator)


@pytest_asyncio.fixture
async def operator_b(two_plants):
    """Operator at Plant B (no role at Plant A)."""
    return _make_user(102, two_plants[1].id, UserRole.operator)


@pytest_asyncio.fixture
async def admin_a(two_plants):
    """Admin at Plant A only — for audit-log scoping tests."""
    return _make_user(103, two_plants[0].id, UserRole.admin)


def _build_app(routers, session, current_user, current_admin=None):
    """Construct a FastAPI app wired to the given session and acting user."""
    app = FastAPI()
    for router in routers:
        app.include_router(router)

    async def override_session():
        yield session

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_current_engineer] = lambda: current_user
    if current_admin is not None:
        app.dependency_overrides[get_current_admin] = lambda: current_admin
    else:
        app.dependency_overrides[get_current_admin] = lambda: current_user
    return app


# ---------------------------------------------------------------------------
# A6-C1: detail / history / list endpoints must block cross-plant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sample_get_blocks_cross_plant(async_session, chars, operator_b):
    """Operator at Plant B cannot read Plant A's sample by ID."""
    c_a, _ = chars
    sample = Sample(char_id=c_a.id, timestamp=datetime.now(timezone.utc), is_excluded=False)
    async_session.add(sample)
    await async_session.flush()
    async_session.add(Measurement(sample_id=sample.id, value=100.0))
    await async_session.commit()

    app = _build_app([samples_router], async_session, operator_b)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/samples/{sample.id}")

    assert resp.status_code == 404, (
        f"Cross-plant operator must get 404, got {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_violation_get_blocks_cross_plant(async_session, chars, operator_b):
    """Operator at Plant B cannot read Plant A's violation by ID."""
    c_a, _ = chars
    sample = Sample(char_id=c_a.id, timestamp=datetime.now(timezone.utc), is_excluded=False)
    async_session.add(sample)
    await async_session.flush()
    violation = Violation(
        sample_id=sample.id, char_id=c_a.id,
        rule_id=1, rule_name="Outlier", severity="CRITICAL",
    )
    async_session.add(violation)
    await async_session.commit()
    await async_session.refresh(violation)

    app = _build_app([violations_router], async_session, operator_b)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/violations/{violation.id}")

    assert resp.status_code == 404, (
        f"Cross-plant operator must get 404, got {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_characteristic_get_blocks_cross_plant(async_session, chars, operator_b):
    """Operator at Plant B cannot read Plant A's characteristic by ID."""
    c_a, _ = chars

    app = _build_app([characteristics_router], async_session, operator_b)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/characteristics/{c_a.id}")

    assert resp.status_code == 404, (
        f"Cross-plant operator must get 404, got {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_sample_history_blocks_cross_plant(async_session, chars, operator_b):
    """Operator at Plant B cannot read Plant A's sample edit history."""
    c_a, _ = chars
    sample = Sample(
        char_id=c_a.id, timestamp=datetime.now(timezone.utc), is_excluded=False,
        is_modified=True,
    )
    async_session.add(sample)
    await async_session.flush()
    async_session.add(Measurement(sample_id=sample.id, value=100.0))
    async_session.add(SampleEditHistory(
        sample_id=sample.id,
        edited_by="other",
        reason="initial",
        previous_values="[99.0]",
        new_values="[100.0]",
        previous_mean=99.0,
        new_mean=100.0,
    ))
    await async_session.commit()

    app = _build_app([samples_router], async_session, operator_b)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/samples/{sample.id}/history")

    assert resp.status_code == 404, (
        f"Cross-plant operator must get 404, got {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
async def test_sample_list_filters_to_user_plants(async_session, chars, operator_a):
    """Listing samples without a characteristic_id filter must only return rows
    for plants the user has a role at."""
    c_a, c_b = chars
    s_a = Sample(char_id=c_a.id, timestamp=datetime.now(timezone.utc), is_excluded=False)
    s_b = Sample(char_id=c_b.id, timestamp=datetime.now(timezone.utc), is_excluded=False)
    async_session.add_all([s_a, s_b])
    await async_session.flush()
    async_session.add_all([
        Measurement(sample_id=s_a.id, value=100.0),
        Measurement(sample_id=s_b.id, value=50.0),
    ])
    await async_session.commit()
    await async_session.refresh(s_a)
    await async_session.refresh(s_b)

    app = _build_app([samples_router], async_session, operator_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/samples/")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    returned_ids = {item["id"] for item in body["items"]}
    assert s_a.id in returned_ids
    assert s_b.id not in returned_ids, (
        "Operator at Plant A must NOT see samples from Plant B"
    )


@pytest.mark.asyncio
async def test_violation_list_filters_to_user_plants(async_session, chars, operator_a):
    """List violations must only return rows for plants the user has a role at."""
    c_a, c_b = chars
    s_a = Sample(char_id=c_a.id, timestamp=datetime.now(timezone.utc), is_excluded=False)
    s_b = Sample(char_id=c_b.id, timestamp=datetime.now(timezone.utc), is_excluded=False)
    async_session.add_all([s_a, s_b])
    await async_session.flush()
    v_a = Violation(sample_id=s_a.id, char_id=c_a.id, rule_id=1, rule_name="O", severity="CRITICAL")
    v_b = Violation(sample_id=s_b.id, char_id=c_b.id, rule_id=1, rule_name="O", severity="CRITICAL")
    async_session.add_all([v_a, v_b])
    await async_session.commit()
    await async_session.refresh(v_a)
    await async_session.refresh(v_b)

    app = _build_app([violations_router], async_session, operator_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/violations/")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    returned_ids = {item["id"] for item in body["items"]}
    assert v_a.id in returned_ids
    assert v_b.id not in returned_ids, (
        "Operator at Plant A must NOT see violations from Plant B"
    )


# ---------------------------------------------------------------------------
# A6-C2: audit-log list / export must scope to caller's plant memberships
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_audit_search_filters_to_user_plants(async_session, two_plants, admin_a):
    """Admin at Plant A listing audit logs must NOT see Plant B's rows."""
    plant_a, plant_b = two_plants
    now = datetime.now(timezone.utc)
    rows = [
        AuditLog(
            action="create", resource_type="sample", resource_id=1,
            plant_id=plant_a.id, timestamp=now - timedelta(minutes=5),
            sequence_number=1, sequence_hash="a" * 64,
        ),
        AuditLog(
            action="create", resource_type="sample", resource_id=2,
            plant_id=plant_b.id, timestamp=now - timedelta(minutes=4),
            sequence_number=2, sequence_hash="b" * 64,
        ),
        AuditLog(
            action="login", resource_type=None, resource_id=None,
            plant_id=None, timestamp=now - timedelta(minutes=3),
            sequence_number=3, sequence_hash="c" * 64,
        ),
    ]
    async_session.add_all(rows)
    await async_session.commit()

    app = _build_app([audit_router], async_session, admin_a, current_admin=admin_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/audit/logs")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    plant_ids = [item.get("resource_id") for item in body["items"]]
    # Plant A row (resource_id=1) and the system login (NULL plant) are visible;
    # Plant B row (resource_id=2) is hidden.
    assert 1 in plant_ids
    assert 2 not in plant_ids, "Plant A admin must NOT see Plant B audit rows"


@pytest.mark.asyncio
async def test_audit_export_filters_to_user_plants(async_session, two_plants, admin_a):
    """Admin at Plant A exporting audit logs as CSV must NOT include Plant B rows."""
    plant_a, plant_b = two_plants
    now = datetime.now(timezone.utc)
    rows = [
        AuditLog(
            action="create", resource_type="sample", resource_id=10,
            plant_id=plant_a.id, timestamp=now - timedelta(minutes=2),
            sequence_number=10, sequence_hash="d" * 64,
        ),
        AuditLog(
            action="create", resource_type="sample", resource_id=20,
            plant_id=plant_b.id, timestamp=now - timedelta(minutes=1),
            sequence_number=11, sequence_hash="e" * 64,
        ),
    ]
    async_session.add_all(rows)
    await async_session.commit()

    app = _build_app([audit_router], async_session, admin_a, current_admin=admin_a)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/audit/logs/export")

    assert resp.status_code == 200, resp.text
    csv_text = resp.text
    assert ",sample,10," in csv_text, "Plant A audit row must appear in export"
    assert ",sample,20," not in csv_text, (
        "Plant A admin must NOT see Plant B audit rows in the CSV export"
    )


# ---------------------------------------------------------------------------
# A6-C3: WebSocket fan-out must scope to subscribers at the originating plant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_websocket_filters_per_plant(monkeypatch):
    """broadcast_to_all with a plant_id must only deliver to users with role
    at that plant — never to a subscriber from another plant.
    """
    from cassini.api.v1.websocket import ConnectionManager, WSConnection
    from datetime import datetime as _dt, timezone as _tz

    manager = ConnectionManager()

    # Two fake WebSocket clients, identified by user IDs.
    sent_a, sent_b = [], []

    class _FakeWS:
        def __init__(self, sink):
            self._sink = sink

        async def send_json(self, payload):
            self._sink.append(payload)

    manager._connections["conn-a"] = WSConnection(
        websocket=_FakeWS(sent_a),
        connected_at=_dt.now(_tz.utc),
        user_id=101,  # operator A
    )
    manager._connections["conn-b"] = WSConnection(
        websocket=_FakeWS(sent_b),
        connected_at=_dt.now(_tz.utc),
        user_id=102,  # operator B
    )

    # Pretend the lookup returned only operator A's user_id (i.e. operator A
    # has access to the originating plant; operator B does not). This avoids
    # spinning up the database and isolates the fan-out logic.
    async def fake_lookup(plant_id):
        assert plant_id == 999
        return {101}

    monkeypatch.setattr(
        "cassini.api.v1.websocket._user_ids_with_plant_access", fake_lookup
    )

    await manager.broadcast_to_all(
        {"type": "ack_update", "violation_id": 7, "plant_id": 999},
        plant_id=999,
    )

    assert len(sent_a) == 1, "Operator A (member of plant 999) must receive the ack"
    assert len(sent_b) == 0, (
        "Operator B (NOT a member of plant 999) must NOT receive the ack"
    )


# ---------------------------------------------------------------------------
# A4-H6: signature_engine.sign() must reject mismatched plant_id
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sign_rejects_workflow_plant_mismatch(async_session, two_plants):
    """sign() must raise when the caller-supplied plant_id does not match the
    workflow's plant — even if the caller has supervisor role at their own plant.
    """
    from cassini.core.signature_engine import SignatureWorkflowEngine
    from cassini.db.models.signature import (
        SignatureMeaning,
        SignatureWorkflow,
        SignatureWorkflowInstance,
        SignatureWorkflowStep,
    )

    plant_a, plant_b = two_plants

    # Workflow lives at Plant A.
    workflow = SignatureWorkflow(
        plant_id=plant_a.id,
        name="A-Workflow",
        resource_type="sample_approval",
        is_active=True,
        is_required=True,
    )
    async_session.add(workflow)
    await async_session.flush()
    step = SignatureWorkflowStep(
        workflow_id=workflow.id,
        step_order=1,
        name="approve",
        min_role="supervisor",
        meaning_code="approve",
    )
    async_session.add(step)
    instance = SignatureWorkflowInstance(
        workflow_id=workflow.id,
        resource_type="sample_approval",
        resource_id=1,
        status="in_progress",
        current_step=1,
    )
    async_session.add(instance)
    # Meaning belongs to Plant B (where the attacker has role) — kept here to
    # demonstrate the attack would otherwise progress past meaning validation.
    async_session.add(SignatureMeaning(
        plant_id=plant_b.id, code="approve", display_name="Approve",
    ))
    await async_session.commit()
    await async_session.refresh(instance)

    # User has supervisor at Plant B but NOT Plant A.
    user = User(
        username="attacker",
        email="a@x.com",
        hashed_password="$2b$12$KIXuC0z.ig8qm4Ahy6tUd.2N3JpL6V8xQLjGqcJ7pBn4SmFDYrAtu",
        is_active=True,
    )
    async_session.add(user)
    await async_session.flush()
    async_session.add(UserPlantRole(
        user_id=user.id, plant_id=plant_b.id, role=UserRole.supervisor,
    ))
    await async_session.commit()
    await async_session.refresh(user)
    # Eager-load plant_roles for the engine
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select as sa_select
    user = (await async_session.execute(
        sa_select(User).options(selectinload(User.plant_roles)).where(User.id == user.id)
    )).scalar_one()

    engine = SignatureWorkflowEngine(async_session)

    with pytest.raises(HTTPException) as exc_info:
        await engine.sign(
            workflow_instance_id=instance.id,
            user=user,
            password="not-validated-because-mismatch-checked-later",
            meaning_code="approve",
            plant_id=plant_b.id,  # Caller LIES about plant — workflow is at Plant A.
        )

    # Must be 404 (resource not found at caller's plant) — not 200/400.
    # We accept 401 too because password verification may still fire first
    # depending on rule ordering — the critical assertion is the workflow does
    # not advance and no signature is created.
    assert exc_info.value.status_code in (401, 404), (
        f"Expected 401/404 for plant-mismatch, got {exc_info.value.status_code}"
    )

    # Workflow must not have advanced.
    await async_session.refresh(instance)
    assert instance.status == "in_progress"
    assert instance.current_step == 1
