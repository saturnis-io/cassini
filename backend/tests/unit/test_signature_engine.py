"""Unit tests for SignatureWorkflowEngine.

Tests cover:
- Signature verification endpoint (chain-of-custody integrity)
- Password expiry enforcement at sign time
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.auth.passwords import hash_password
from cassini.core.signature_engine import (
    SignatureWorkflowEngine,
    compute_resource_hash,
    compute_signature_hash,
)
from cassini.db.models.plant import Plant
from cassini.db.models.signature import (
    ElectronicSignature,
    PasswordPolicy,
    SignatureMeaning,
    SignatureWorkflow,
    SignatureWorkflowInstance,
    SignatureWorkflowStep,
)
from cassini.db.models.user import User, UserPlantRole, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def plant(async_session: AsyncSession) -> Plant:
    """Create a test plant."""
    p = Plant(name="Test Plant", code="TP")
    async_session.add(p)
    await async_session.flush()
    await async_session.refresh(p)
    return p


@pytest_asyncio.fixture
async def user_with_role(async_session: AsyncSession, plant: Plant) -> User:
    """Create a test user with supervisor role at the test plant."""
    u = User(
        username="signer",
        hashed_password=hash_password("correct-password"),
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

    # Reload user with relationships
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
async def signature(
    async_session: AsyncSession, user_with_role: User
) -> ElectronicSignature:
    """Create a test signature for verification tests.

    The signature_hash must be computed using the timestamp AS IT WILL
    APPEAR after a DB round-trip. SQLite strips timezone info from
    datetime columns, so we flush+refresh first to get the canonical
    timestamp, then compute the hash with that value.
    """
    resource_type = "fai_report"
    resource_data = {"resource_id": 42}
    resource_hash = compute_resource_hash(resource_type, resource_data)
    now = datetime.now(timezone.utc)

    # Use a placeholder signature_hash; we'll fix it after round-trip
    sig = ElectronicSignature(
        user_id=user_with_role.id,
        username=user_with_role.username,
        full_name=None,
        timestamp=now,
        meaning_code="approved",
        meaning_display="Approved",
        resource_type=resource_type,
        resource_id=42,
        resource_hash=resource_hash,
        signature_hash="placeholder",
    )
    async_session.add(sig)
    await async_session.flush()
    await async_session.refresh(sig)

    # Recompute signature_hash using the DB-round-tripped timestamp
    sig.signature_hash = compute_signature_hash(
        sig.user_id, sig.timestamp, sig.meaning_code, sig.resource_hash
    )
    await async_session.flush()
    await async_session.refresh(sig)
    return sig


# ---------------------------------------------------------------------------
# Part A: Signature Verification Tests
# ---------------------------------------------------------------------------


class TestVerifySignature:
    """Tests for verify_signature chain-of-custody verification."""

    @pytest.mark.asyncio
    async def test_verify_valid_signature(
        self, async_session: AsyncSession, signature: ElectronicSignature
    ) -> None:
        """A signature whose resource hasn't changed should be tamper-free."""
        engine = SignatureWorkflowEngine(async_session)
        result = await engine.verify_signature(signature.id)

        assert result["signature_id"] == signature.id
        assert result["is_tamper_free"] is True
        assert result["resource_hash_valid"] is True
        assert result["signature_hash_valid"] is True
        assert result["signed_by"] == "signer"
        assert result["meaning"] == "Approved"
        assert result["resource_type"] == "fai_report"
        assert result["resource_id"] == "42"
        assert result["signed_at"] != ""

    @pytest.mark.asyncio
    async def test_verify_tampered_resource_hash(
        self, async_session: AsyncSession, signature: ElectronicSignature
    ) -> None:
        """If the stored resource_hash is corrupted, both checks should fail.

        The signature_hash was computed from the original resource_hash, so
        recomputing it with the corrupted resource_hash produces a mismatch.
        """
        # Corrupt the stored resource hash
        signature.resource_hash = "0000000000000000000000000000000000000000000000000000000000000000"
        await async_session.flush()

        engine = SignatureWorkflowEngine(async_session)
        result = await engine.verify_signature(signature.id)

        assert result["resource_hash_valid"] is False
        assert result["signature_hash_valid"] is False
        assert result["is_tamper_free"] is False

    @pytest.mark.asyncio
    async def test_verify_tampered_signature_hash(
        self, async_session: AsyncSession, signature: ElectronicSignature
    ) -> None:
        """If the stored signature_hash is corrupted, signature_hash_valid should be False."""
        # Corrupt the stored signature hash
        signature.signature_hash = "deadbeef" * 8
        await async_session.flush()

        engine = SignatureWorkflowEngine(async_session)
        result = await engine.verify_signature(signature.id)

        assert result["resource_hash_valid"] is True
        assert result["signature_hash_valid"] is False
        assert result["is_tamper_free"] is False

    @pytest.mark.asyncio
    async def test_verify_nonexistent_signature(
        self, async_session: AsyncSession
    ) -> None:
        """Verifying a non-existent signature should raise 404."""
        from fastapi import HTTPException

        engine = SignatureWorkflowEngine(async_session)
        with pytest.raises(HTTPException) as exc_info:
            await engine.verify_signature(99999)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_verify_result_has_all_fields(
        self, async_session: AsyncSession, signature: ElectronicSignature
    ) -> None:
        """The verification result should contain all required fields."""
        engine = SignatureWorkflowEngine(async_session)
        result = await engine.verify_signature(signature.id)

        expected_keys = {
            "signature_id",
            "is_tamper_free",
            "resource_hash_valid",
            "signature_hash_valid",
            "signed_by",
            "signed_at",
            "meaning",
            "resource_type",
            "resource_id",
        }
        assert set(result.keys()) == expected_keys


# ---------------------------------------------------------------------------
# Part B: Password Expiry Enforcement Tests
# ---------------------------------------------------------------------------


class TestPasswordExpiryEnforcement:
    """Tests for password expiry checks in sign() and sign_standalone()."""

    @pytest.mark.asyncio
    async def test_sign_standalone_rejects_expired_password(
        self,
        async_session: AsyncSession,
        user_with_role: User,
        plant: Plant,
        meaning: SignatureMeaning,
    ) -> None:
        """sign_standalone() should reject a user whose password has expired."""
        from fastapi import HTTPException

        # Set password_changed_at to 100 days ago
        user_with_role.password_changed_at = datetime.now(timezone.utc) - timedelta(days=100)
        await async_session.flush()

        # Create policy with 90-day expiry
        policy = PasswordPolicy(
            plant_id=plant.id,
            password_expiry_days=90,
        )
        async_session.add(policy)
        await async_session.flush()

        engine = SignatureWorkflowEngine(async_session)
        with pytest.raises(HTTPException) as exc_info:
            await engine.sign_standalone(
                resource_type="fai_report",
                resource_id=1,
                user=user_with_role,
                password="correct-password",
                meaning_code="approved",
                plant_id=plant.id,
            )

        assert exc_info.value.status_code == 403
        assert "expired" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_sign_standalone_allows_non_expired_password(
        self,
        async_session: AsyncSession,
        user_with_role: User,
        plant: Plant,
        meaning: SignatureMeaning,
    ) -> None:
        """sign_standalone() should allow a user whose password is not expired."""
        # Set password_changed_at to 10 days ago
        user_with_role.password_changed_at = datetime.now(timezone.utc) - timedelta(days=10)
        await async_session.flush()

        # Create policy with 90-day expiry
        policy = PasswordPolicy(
            plant_id=plant.id,
            password_expiry_days=90,
        )
        async_session.add(policy)
        await async_session.flush()

        engine = SignatureWorkflowEngine(async_session)
        # Should not raise — password is still valid
        sig = await engine.sign_standalone(
            resource_type="fai_report",
            resource_id=1,
            user=user_with_role,
            password="correct-password",
            meaning_code="approved",
            plant_id=plant.id,
        )
        assert sig.id is not None
        assert sig.username == "signer"

    @pytest.mark.asyncio
    async def test_sign_standalone_allows_when_no_policy(
        self,
        async_session: AsyncSession,
        user_with_role: User,
        plant: Plant,
        meaning: SignatureMeaning,
    ) -> None:
        """sign_standalone() should allow signing when no password policy exists."""
        engine = SignatureWorkflowEngine(async_session)
        sig = await engine.sign_standalone(
            resource_type="fai_report",
            resource_id=1,
            user=user_with_role,
            password="correct-password",
            meaning_code="approved",
            plant_id=plant.id,
        )
        assert sig.id is not None

    @pytest.mark.asyncio
    async def test_sign_standalone_allows_when_expiry_disabled(
        self,
        async_session: AsyncSession,
        user_with_role: User,
        plant: Plant,
        meaning: SignatureMeaning,
    ) -> None:
        """sign_standalone() should allow signing when password_expiry_days is 0."""
        # Password changed 1000 days ago but expiry is disabled
        user_with_role.password_changed_at = datetime.now(timezone.utc) - timedelta(days=1000)
        await async_session.flush()

        policy = PasswordPolicy(
            plant_id=plant.id,
            password_expiry_days=0,
        )
        async_session.add(policy)
        await async_session.flush()

        engine = SignatureWorkflowEngine(async_session)
        sig = await engine.sign_standalone(
            resource_type="fai_report",
            resource_id=1,
            user=user_with_role,
            password="correct-password",
            meaning_code="approved",
            plant_id=plant.id,
        )
        assert sig.id is not None

    @pytest.mark.asyncio
    async def test_sign_standalone_rejects_null_password_changed_at(
        self,
        async_session: AsyncSession,
        plant: Plant,
        meaning: SignatureMeaning,
    ) -> None:
        """If password_changed_at is NULL and policy requires expiry, reject."""
        from fastapi import HTTPException

        # Create user with no password_changed_at
        u = User(
            username="nochange",
            hashed_password=hash_password("pass123"),
            is_active=True,
            password_changed_at=None,
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

        policy = PasswordPolicy(
            plant_id=plant.id,
            password_expiry_days=90,
        )
        async_session.add(policy)
        await async_session.flush()

        engine = SignatureWorkflowEngine(async_session)
        with pytest.raises(HTTPException) as exc_info:
            await engine.sign_standalone(
                resource_type="fai_report",
                resource_id=1,
                user=u,
                password="pass123",
                meaning_code="approved",
                plant_id=plant.id,
            )

        assert exc_info.value.status_code == 403
        assert "expired" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_sign_workflow_rejects_expired_password(
        self,
        async_session: AsyncSession,
        user_with_role: User,
        plant: Plant,
        meaning: SignatureMeaning,
    ) -> None:
        """sign() (workflow-based) should also reject expired passwords."""
        from fastapi import HTTPException

        # Set up a workflow + instance
        workflow = SignatureWorkflow(
            plant_id=plant.id,
            name="Test Workflow",
            resource_type="fai_report",
            is_active=True,
            is_required=True,
        )
        async_session.add(workflow)
        await async_session.flush()
        await async_session.refresh(workflow)

        step = SignatureWorkflowStep(
            workflow_id=workflow.id,
            step_order=1,
            name="Approve",
            min_role="operator",
            meaning_code="approved",
        )
        async_session.add(step)
        await async_session.flush()

        instance = SignatureWorkflowInstance(
            workflow_id=workflow.id,
            resource_type="fai_report",
            resource_id=1,
            status="pending",
            current_step=1,
            initiated_by=user_with_role.id,
        )
        async_session.add(instance)
        await async_session.flush()
        await async_session.refresh(instance)

        # Expire the password
        user_with_role.password_changed_at = datetime.now(timezone.utc) - timedelta(days=100)
        await async_session.flush()

        policy = PasswordPolicy(
            plant_id=plant.id,
            password_expiry_days=90,
        )
        async_session.add(policy)
        await async_session.flush()

        engine = SignatureWorkflowEngine(async_session)
        with pytest.raises(HTTPException) as exc_info:
            await engine.sign(
                workflow_instance_id=instance.id,
                user=user_with_role,
                password="correct-password",
                meaning_code="approved",
                plant_id=plant.id,
            )

        assert exc_info.value.status_code == 403
        assert "expired" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_expiry_check_uses_correct_plant_policy(
        self,
        async_session: AsyncSession,
        user_with_role: User,
        plant: Plant,
        meaning: SignatureMeaning,
    ) -> None:
        """Password expiry should use the policy for the specified plant, not a global one."""
        # Create a second plant with a strict policy
        plant2 = Plant(name="Other Plant", code="OP")
        async_session.add(plant2)
        await async_session.flush()
        await async_session.refresh(plant2)

        # Strict policy on plant2 (1-day expiry)
        strict_policy = PasswordPolicy(
            plant_id=plant2.id,
            password_expiry_days=1,
        )
        async_session.add(strict_policy)
        await async_session.flush()

        # No policy on original plant — should allow signing
        # Password changed 5 days ago
        user_with_role.password_changed_at = datetime.now(timezone.utc) - timedelta(days=5)
        await async_session.flush()

        engine = SignatureWorkflowEngine(async_session)
        sig = await engine.sign_standalone(
            resource_type="fai_report",
            resource_id=1,
            user=user_with_role,
            password="correct-password",
            meaning_code="approved",
            plant_id=plant.id,  # This plant has no policy
        )
        assert sig.id is not None
