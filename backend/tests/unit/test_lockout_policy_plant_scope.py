"""Plant-scoped lockout policy enforcement.

Multi-plant installs may configure different password policies per plant.
``sign()`` and ``sign_standalone()`` MUST query ``PasswordPolicy`` filtered
by ``plant_id`` so the wrong plant's policy cannot govern lockout.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.auth.passwords import hash_password
from cassini.core.signature_engine import SignatureWorkflowEngine
from cassini.db.models.plant import Plant
from cassini.db.models.signature import (
    PasswordPolicy,
    SignatureMeaning,
)
from cassini.db.models.user import User, UserPlantRole, UserRole


@pytest_asyncio.fixture
async def two_plants(async_session: AsyncSession) -> tuple[Plant, Plant]:
    """Two plants with DIFFERENT lockout policies."""
    p1 = Plant(name="Strict Plant", code="SP")
    p2 = Plant(name="Lenient Plant", code="LP")
    async_session.add_all([p1, p2])
    await async_session.flush()
    await async_session.refresh(p1)
    await async_session.refresh(p2)

    # Strict: lock after 1 failure
    strict = PasswordPolicy(
        plant_id=p1.id,
        max_failed_attempts=1,
        lockout_duration_minutes=30,
    )
    # Lenient: lock after 100 failures
    lenient = PasswordPolicy(
        plant_id=p2.id,
        max_failed_attempts=100,
        lockout_duration_minutes=5,
    )
    async_session.add_all([strict, lenient])
    await async_session.flush()

    return p1, p2


@pytest_asyncio.fixture
async def user_with_role_at_both(
    async_session: AsyncSession, two_plants: tuple[Plant, Plant]
) -> User:
    """User with supervisor role at both plants, current password."""
    p1, p2 = two_plants
    u = User(
        username="bob",
        hashed_password=hash_password("correct-pass"),
        is_active=True,
        password_changed_at=datetime.now(timezone.utc),
    )
    async_session.add(u)
    await async_session.flush()
    await async_session.refresh(u)

    async_session.add_all([
        UserPlantRole(user_id=u.id, plant_id=p1.id, role=UserRole.supervisor),
        UserPlantRole(user_id=u.id, plant_id=p2.id, role=UserRole.supervisor),
    ])
    await async_session.flush()
    await async_session.refresh(u, ["plant_roles"])
    return u


@pytest_asyncio.fixture
async def meaning_for_plant(async_session: AsyncSession, two_plants: tuple[Plant, Plant]):
    """Create the same meaning code at both plants."""
    p1, p2 = two_plants
    meanings = []
    for p in (p1, p2):
        m = SignatureMeaning(
            plant_id=p.id,
            code="approved",
            display_name="Approved",
            requires_comment=False,
        )
        async_session.add(m)
        meanings.append(m)
    await async_session.flush()
    return meanings


@pytest.mark.asyncio
async def test_sign_uses_plant_specific_lockout_policy(
    async_session: AsyncSession,
    two_plants: tuple[Plant, Plant],
    user_with_role_at_both: User,
    meaning_for_plant: list,
) -> None:
    """A failed signature at plant 2 (lenient) must apply plant 2's policy.

    Pre-condition: Plant 1 locks after 1 failure. Plant 2 locks after 100.

    With the bug (``select(PasswordPolicy).limit(1)`` — no filter), SQLite
    typically returns the first inserted row (plant 1's strict policy),
    locking the user after 1 failure even when signing at plant 2.

    With the fix (``where(plant_id == plant2.id)``), plant 2's lenient
    policy applies and the user is NOT locked after 1 failure.
    """
    from fastapi import HTTPException

    _p1, p2 = two_plants
    user = user_with_role_at_both
    engine = SignatureWorkflowEngine(async_session)

    # First failed attempt at plant 2 (lenient: max_failed_attempts=100)
    with pytest.raises(HTTPException) as exc_info:
        await engine.sign_standalone(
            resource_type="fai_report",
            resource_id=1,
            user=user,
            password="wrong-password",
            meaning_code="approved",
            plant_id=p2.id,
        )
    assert exc_info.value.status_code == 401  # invalid password, not locked

    # User should NOT be locked yet — plant 2's policy is lenient
    await async_session.refresh(user)
    assert user.failed_login_count == 1
    assert user.locked_until is None, (
        "User must NOT be locked at plant 2 — strict plant 1 policy must NOT apply"
    )


@pytest.mark.asyncio
async def test_sign_locks_user_per_correct_plant_policy(
    async_session: AsyncSession,
    two_plants: tuple[Plant, Plant],
    user_with_role_at_both: User,
    meaning_for_plant: list,
) -> None:
    """At plant 1 (strict, lock after 1), one failed attempt MUST lock the user."""
    from fastapi import HTTPException

    p1, _p2 = two_plants
    user = user_with_role_at_both
    engine = SignatureWorkflowEngine(async_session)

    with pytest.raises(HTTPException) as exc_info:
        await engine.sign_standalone(
            resource_type="fai_report",
            resource_id=1,
            user=user,
            password="wrong-password",
            meaning_code="approved",
            plant_id=p1.id,
        )
    assert exc_info.value.status_code == 401

    await async_session.refresh(user)
    assert user.failed_login_count == 1
    # Strict policy: max_failed_attempts=1 -> immediately locked
    assert user.locked_until is not None
