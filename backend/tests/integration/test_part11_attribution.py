"""21 CFR Part 11 §11.50 attribution tests.

Verifies that violation acknowledgment endpoints derive the acknowledging
user from the authenticated principal, NEVER from the request body. Even if
a request reaches the endpoint with a forged ``user`` field (which the
schema now forbids), the endpoint MUST attribute the action to the JWT
subject — preventing operator Alice from acknowledging as supervisor Bob.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.v1.violations import acknowledge_violation, batch_acknowledge
from cassini.api.schemas.violation import (
    BatchAcknowledgeRequest,
    ViolationAcknowledge,
)
from cassini.core.alerts.manager import AlertManager
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.sample import Measurement, Sample
from cassini.db.models.violation import Violation
from cassini.db.repositories.sample import SampleRepository
from cassini.db.repositories.violation import ViolationRepository


@pytest.fixture
def mock_request() -> MagicMock:
    """Create a mock Request object for audit context."""
    req = MagicMock()
    req.state = MagicMock()
    return req


@pytest.fixture
def authenticated_user() -> MagicMock:
    """Create a mock User authenticated as 'real.alice'."""
    u = MagicMock()
    u.username = "real.alice"
    u.plant_roles = []
    return u


@pytest.fixture(autouse=True)
def _bypass_plant_auth():
    """Bypass plant-scoped authorization for these focused integration tests."""
    with (
        patch(
            "cassini.api.v1.violations.resolve_plant_id_for_characteristic",
            new_callable=AsyncMock,
            return_value=1,
        ),
        patch("cassini.api.v1.violations.check_plant_role"),
    ):
        yield


@pytest_asyncio.fixture
async def sample_data(async_session: AsyncSession) -> dict:
    """Create a characteristic + sample + two unacknowledged violations."""
    hierarchy = Hierarchy(name="Plant", type="Site", parent_id=None)
    async_session.add(hierarchy)
    await async_session.flush()

    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="Diameter",
        target_value=10.0,
        usl=11.0,
        lsl=9.0,
        subgroup_size=1,
    )
    async_session.add(char)
    await async_session.flush()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    samples = []
    violations = []
    for i in range(2):
        sample = Sample(
            char_id=char.id,
            timestamp=now - timedelta(hours=i),
            batch_number=f"B{i}",
            operator_id="op-1",
            is_excluded=False,
        )
        async_session.add(sample)
        await async_session.flush()
        async_session.add(Measurement(sample_id=sample.id, value=10.0 + i))
        samples.append(sample)

        v = Violation(
            sample_id=sample.id,
            char_id=char.id,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            acknowledged=False,
        )
        async_session.add(v)
        violations.append(v)

    await async_session.commit()
    return {"violations": violations, "samples": samples}


@pytest.mark.asyncio
async def test_violation_acknowledge_uses_authenticated_user(
    async_session: AsyncSession,
    sample_data: dict,
    mock_request: MagicMock,
    authenticated_user: MagicMock,
) -> None:
    """The endpoint MUST attribute acknowledgment to ``_user.username``.

    The schema now forbids the ``user`` field on the body, but even if the
    body had one, the endpoint should ignore it. We construct the schema
    object directly (no body field to forge) and confirm the audit context
    and persisted ``ack_user`` match the authenticated principal.
    """
    violation_repo = ViolationRepository(async_session)
    sample_repo = SampleRepository(async_session)
    manager = AlertManager(violation_repo, sample_repo)
    violation_id = sample_data["violations"][0].id

    data = ViolationAcknowledge(reason="Tool Change", exclude_sample=False)

    result = await acknowledge_violation(
        violation_id=violation_id,
        data=data,
        request=mock_request,
        manager=manager,
        repo=violation_repo,
        session=async_session,
        _user=authenticated_user,
    )

    # Persisted ack_user reflects the authenticated principal
    assert result.ack_user == "real.alice"

    # Audit context records the same authenticated principal
    audit_ctx = mock_request.state.audit_context
    assert audit_ctx["fields"]["acknowledged_by"] == "real.alice"


def test_violation_acknowledge_schema_rejects_forged_user_field() -> None:
    """The Pydantic schema rejects an extra ``user`` field at validation time.

    With ``extra='forbid'``, a JSON body like ``{"user": "fake.attacker",
    "reason": "x"}`` raises ValidationError before the handler ever runs —
    closing the attribution-forging hole at the boundary.
    """
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ViolationAcknowledge.model_validate(
            {"user": "fake.attacker", "reason": "Tool Change"}
        )

    with pytest.raises(ValidationError):
        BatchAcknowledgeRequest.model_validate(
            {
                "violation_ids": [1],
                "user": "fake.attacker",
                "reason": "Tool Change",
            }
        )


@pytest.mark.asyncio
async def test_violation_bulk_acknowledge_uses_authenticated_user(
    async_session: AsyncSession,
    sample_data: dict,
    mock_request: MagicMock,
    authenticated_user: MagicMock,
) -> None:
    """Bulk acknowledgment MUST also attribute to ``_user.username``."""
    violation_repo = ViolationRepository(async_session)
    sample_repo = SampleRepository(async_session)
    manager = AlertManager(violation_repo, sample_repo)
    violation_ids = [v.id for v in sample_data["violations"]]

    body = BatchAcknowledgeRequest(
        violation_ids=violation_ids,
        reason="Process Adjustment",
        exclude_sample=False,
    )

    result = await batch_acknowledge(
        body=body,
        request=mock_request,
        manager=manager,
        repo=violation_repo,
        session=async_session,
        _user=authenticated_user,
    )

    assert result.successful == len(violation_ids)
    audit_ctx = mock_request.state.audit_context
    assert audit_ctx["fields"]["acknowledged_by"] == "real.alice"

    # Persisted ack_user on every acknowledged violation matches the principal
    for v in sample_data["violations"]:
        await async_session.refresh(v)
        assert v.ack_user == "real.alice"
