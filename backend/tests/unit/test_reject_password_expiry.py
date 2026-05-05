"""``reject()`` must enforce password expiry just like ``sign()``.

A workflow rejection is a regulated, signed action under 21 CFR Part 11.
An operator with an expired password MUST be blocked from rejecting steps,
parallel to the sign() / sign_standalone() expiry checks.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.auth.passwords import hash_password
from cassini.core.signature_engine import SignatureWorkflowEngine
from cassini.db.models.plant import Plant
from cassini.db.models.signature import (
    PasswordPolicy,
    SignatureWorkflow,
    SignatureWorkflowInstance,
    SignatureWorkflowStep,
)
from cassini.db.models.user import User, UserPlantRole, UserRole


@pytest_asyncio.fixture
async def plant(async_session: AsyncSession) -> Plant:
    p = Plant(name="Test Plant", code="TP")
    async_session.add(p)
    await async_session.flush()
    await async_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def supervisor(async_session: AsyncSession, plant: Plant) -> User:
    """User with an EXPIRED password (changed 100 days ago)."""
    u = User(
        username="supervisor.bob",
        hashed_password=hash_password("right-password"),
        is_active=True,
        password_changed_at=datetime.now(timezone.utc) - timedelta(days=100),
    )
    async_session.add(u)
    await async_session.flush()
    await async_session.refresh(u)
    async_session.add(
        UserPlantRole(user_id=u.id, plant_id=plant.id, role=UserRole.supervisor)
    )
    await async_session.flush()
    await async_session.refresh(u, ["plant_roles"])
    return u


@pytest_asyncio.fixture
async def workflow_instance(async_session: AsyncSession, plant: Plant, supervisor: User):
    wf = SignatureWorkflow(
        plant_id=plant.id,
        name="Approval",
        resource_type="fai_report",
        is_active=True,
        is_required=True,
    )
    async_session.add(wf)
    await async_session.flush()
    await async_session.refresh(wf)

    step = SignatureWorkflowStep(
        workflow_id=wf.id,
        step_order=1,
        name="Approve",
        min_role="supervisor",
        meaning_code="approved",
    )
    async_session.add(step)
    await async_session.flush()

    inst = SignatureWorkflowInstance(
        workflow_id=wf.id,
        resource_type="fai_report",
        resource_id=1,
        status="pending",
        current_step=1,
        initiated_by=supervisor.id,
    )
    async_session.add(inst)
    await async_session.flush()
    await async_session.refresh(inst)
    return inst


@pytest.mark.asyncio
async def test_reject_blocks_expired_password(
    async_session: AsyncSession,
    plant: Plant,
    supervisor: User,
    workflow_instance,
) -> None:
    """A user whose password has expired CANNOT reject a workflow step.

    Mirrors ``test_sign_workflow_rejects_expired_password`` from
    test_signature_engine.py — reject() is a signed action and MUST be
    held to the same Part 11 standard as sign().
    """
    from fastapi import HTTPException

    # Plant policy: 90-day password expiry (supervisor changed pwd 100d ago)
    policy = PasswordPolicy(plant_id=plant.id, password_expiry_days=90)
    async_session.add(policy)
    await async_session.flush()

    engine = SignatureWorkflowEngine(async_session)
    with pytest.raises(HTTPException) as exc_info:
        await engine.reject(
            workflow_instance_id=workflow_instance.id,
            user=supervisor,
            password="right-password",
            reason="Found defects",
            plant_id=plant.id,
        )

    assert exc_info.value.status_code == 403
    assert "expired" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_reject_allows_current_password(
    async_session: AsyncSession,
    plant: Plant,
    supervisor: User,
    workflow_instance,
) -> None:
    """If the password is current, reject() proceeds normally."""
    # Reset password_changed_at to today
    supervisor.password_changed_at = datetime.now(timezone.utc)
    await async_session.flush()

    # Policy with 90-day expiry — well within bounds
    policy = PasswordPolicy(plant_id=plant.id, password_expiry_days=90)
    async_session.add(policy)
    await async_session.flush()

    engine = SignatureWorkflowEngine(async_session)
    # Should NOT raise
    await engine.reject(
        workflow_instance_id=workflow_instance.id,
        user=supervisor,
        password="right-password",
        reason="Found defects",
        plant_id=plant.id,
    )

    await async_session.refresh(workflow_instance)
    assert workflow_instance.status == "rejected"
