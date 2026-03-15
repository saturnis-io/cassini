"""Tests for 21 CFR Part 11 audit trail features.

Covers the SHA-256 hash chain, integrity verification endpoint,
change_reason storage, and tamper detection.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from cassini.api.deps import get_current_admin, get_db_session
from cassini.api.v1.audit import router
from cassini.core.audit import AuditService, compute_audit_hash
from cassini.db.models.audit_log import AuditLog
from cassini.db.models.user import User, UserRole


GENESIS_HASH = "0" * 64


def _make_session_factory(async_engine):
    """Build a session factory compatible with AuditService.

    AuditService calls ``async with self._session_factory() as session:``
    so the factory must return an async context manager that yields a session.
    """
    factory = sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    @asynccontextmanager
    async def _ctx():
        async with factory() as session:
            yield session

    return _ctx


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def audit_service(async_engine):
    """Create an AuditService backed by the test engine."""
    return AuditService(_make_session_factory(async_engine))


@pytest_asyncio.fixture
async def query_session(async_engine):
    """A separate session for querying audit entries after AuditService commits."""
    factory = sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with factory() as session:
        yield session


# ---------------------------------------------------------------------------
# 1. Hash chain — sequential entries
# ---------------------------------------------------------------------------


class TestAuditHashChainSequential:
    """Verify the SHA-256 hash chain across consecutive audit entries."""

    @pytest.mark.asyncio
    async def test_three_entries_form_valid_chain(
        self, audit_service: AuditService, query_session: AsyncSession
    ) -> None:
        """Create 3 entries and verify chaining: genesis -> e1 -> e2 -> e3."""
        # Create three sequential audit entries
        for i in range(1, 4):
            await audit_service.log(
                action="create",
                resource_type="characteristic",
                resource_id=i,
                user_id=1,
                username="testuser",
            )

        # Query entries in chronological order
        stmt = (
            select(AuditLog)
            .where(AuditLog.sequence_hash.isnot(None))
            .order_by(AuditLog.timestamp.asc(), AuditLog.id.asc())
        )
        rows = (await query_session.execute(stmt)).scalars().all()
        assert len(rows) == 3

        # Verify basic hash properties
        for row in rows:
            assert row.sequence_hash is not None
            assert len(row.sequence_hash) == 64, "SHA-256 hex digest must be 64 chars"

        # Walk the chain and verify each hash
        previous_hash = GENESIS_HASH
        for row in rows:
            expected = compute_audit_hash(
                previous_hash,
                row.action,
                row.resource_type,
                row.resource_id,
                row.user_id,
                row.username,
                row.timestamp,
            )
            assert row.sequence_hash == expected, (
                f"Hash mismatch at entry {row.id}: "
                f"expected {expected[:16]}..., got {row.sequence_hash[:16]}..."
            )
            previous_hash = row.sequence_hash

    @pytest.mark.asyncio
    async def test_each_entry_has_unique_hash(
        self, audit_service: AuditService, query_session: AsyncSession
    ) -> None:
        """Each entry should have a distinct hash (different timestamps/IDs)."""
        for i in range(1, 4):
            await audit_service.log(
                action="update",
                resource_type="sample",
                resource_id=i,
                user_id=2,
                username="engineer",
            )

        stmt = (
            select(AuditLog.sequence_hash)
            .where(AuditLog.sequence_hash.isnot(None))
        )
        hashes = (await query_session.execute(stmt)).scalars().all()
        assert len(set(hashes)) == 3, "All hashes should be unique"


# ---------------------------------------------------------------------------
# 2. Hash chain — recovery after service restart
# ---------------------------------------------------------------------------


class TestAuditHashChainRecovery:
    """Verify that a new AuditService instance continues the chain."""

    @pytest.mark.asyncio
    async def test_recovery_continues_chain(
        self, async_engine, query_session: AsyncSession
    ) -> None:
        """After restart, the 3rd entry must chain from the 2nd, not genesis."""
        factory = _make_session_factory(async_engine)

        # First service instance — create 2 entries
        svc1 = AuditService(factory)
        await svc1.log(
            action="create",
            resource_type="plant",
            resource_id=1,
            user_id=1,
            username="admin",
        )
        await svc1.log(
            action="update",
            resource_type="plant",
            resource_id=1,
            user_id=1,
            username="admin",
        )

        # Capture the 2nd entry's hash before the "restart"
        stmt = (
            select(AuditLog.sequence_hash)
            .where(AuditLog.sequence_hash.isnot(None))
            .order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
            .limit(1)
        )
        last_hash_before = (await query_session.execute(stmt)).scalar_one()

        # Simulate service restart: new instance, recover chain
        svc2 = AuditService(factory)
        assert svc2._last_hash == GENESIS_HASH, "New instance starts at genesis"

        await svc2.recover_last_hash()
        assert svc2._last_hash == last_hash_before, "Recovery must load last DB hash"

        # Create 3rd entry with recovered service
        await svc2.log(
            action="delete",
            resource_type="plant",
            resource_id=1,
            user_id=1,
            username="admin",
        )

        # Verify the full chain (3 entries, no breaks)
        stmt = (
            select(AuditLog)
            .where(AuditLog.sequence_hash.isnot(None))
            .order_by(AuditLog.timestamp.asc(), AuditLog.id.asc())
        )
        rows = (await query_session.execute(stmt)).scalars().all()
        assert len(rows) == 3

        previous_hash = GENESIS_HASH
        for row in rows:
            expected = compute_audit_hash(
                previous_hash,
                row.action,
                row.resource_type,
                row.resource_id,
                row.user_id,
                row.username,
                row.timestamp,
            )
            assert row.sequence_hash == expected, (
                f"Chain break at entry {row.id} after recovery"
            )
            previous_hash = row.sequence_hash


# ---------------------------------------------------------------------------
# 3. change_reason stored in audit detail
# ---------------------------------------------------------------------------


class TestChangeReasonInAuditDetail:
    """Verify that change_reason is persisted in the detail JSON."""

    @pytest.mark.asyncio
    async def test_change_reason_stored(
        self, audit_service: AuditService, query_session: AsyncSession
    ) -> None:
        """Log with a detail dict containing change_reason; verify it round-trips."""
        reason_text = "Customer spec changed per ECN-2026-0042"
        await audit_service.log(
            action="update",
            resource_type="characteristic",
            resource_id=42,
            user_id=1,
            username="engineer",
            detail={
                "change_reason": reason_text,
                "before": {"usl": 10.0},
                "after": {"usl": 12.0},
            },
        )

        stmt = select(AuditLog).where(AuditLog.resource_id == 42)
        entry = (await query_session.execute(stmt)).scalar_one()

        assert entry.detail is not None
        assert entry.detail["change_reason"] == reason_text
        assert entry.detail["before"] == {"usl": 10.0}
        assert entry.detail["after"] == {"usl": 12.0}

    @pytest.mark.asyncio
    async def test_detail_none_is_allowed(
        self, audit_service: AuditService, query_session: AsyncSession
    ) -> None:
        """Entries without detail should store None, not crash."""
        await audit_service.log(
            action="login",
            username="operator",
        )

        stmt = select(AuditLog).where(AuditLog.action == "login")
        entry = (await query_session.execute(stmt)).scalar_one()
        assert entry.detail is None


# ---------------------------------------------------------------------------
# 4. Integrity verification endpoint — valid chain
# ---------------------------------------------------------------------------


class _MockUser:
    """Lightweight stand-in for User that satisfies admin auth checks."""

    def __init__(self):
        self.id = 1
        self.username = "admin"
        self.email = "admin@test.com"
        self.is_active = True
        self.must_change_password = False
        self.plant_roles = []


@pytest_asyncio.fixture
async def audit_app(async_engine, async_session):
    """Create FastAPI app with the audit router and test overrides."""
    app = FastAPI()
    app.include_router(router)

    async def override_get_session():
        yield async_session

    app.dependency_overrides[get_db_session] = override_get_session

    test_admin = _MockUser()
    app.dependency_overrides[get_current_admin] = lambda: test_admin

    return app


@pytest_asyncio.fixture
async def audit_client(audit_app):
    """Create async HTTP client for audit endpoint tests."""
    async with AsyncClient(
        transport=ASGITransport(app=audit_app),
        base_url="http://test",
    ) as client:
        yield client


class TestAuditIntegrityEndpointValid:
    """Test the verify-integrity endpoint returns valid for a clean chain."""

    @pytest.mark.asyncio
    async def test_empty_log_is_valid(self, audit_client: AsyncClient) -> None:
        """No entries should still return valid=true."""
        resp = await audit_client.get("/api/v1/audit/verify-integrity")
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["verified_count"] == 0

    @pytest.mark.asyncio
    async def test_valid_chain_returns_true(
        self, async_session: AsyncSession, audit_client: AsyncClient
    ) -> None:
        """Insert entries with correct hashes, then verify via endpoint."""
        from datetime import datetime

        previous_hash = GENESIS_HASH
        for i in range(1, 4):
            # Use fixed naive timestamps (no tz) to match what SQLite stores
            ts = datetime(2026, 3, 15, 12, 0, i)
            seq_hash = compute_audit_hash(
                previous_hash, "create", "sample", i, 1, "admin", ts,
            )
            entry = AuditLog(
                action="create",
                resource_type="sample",
                resource_id=i,
                user_id=1,
                username="admin",
                timestamp=ts,
                sequence_hash=seq_hash,
            )
            async_session.add(entry)
            previous_hash = seq_hash

        await async_session.flush()

        resp = await audit_client.get("/api/v1/audit/verify-integrity")
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["verified_count"] == 3


# ---------------------------------------------------------------------------
# 5. Integrity verification — tamper detection
# ---------------------------------------------------------------------------


class TestAuditIntegrityDetectsTampering:
    """Test that modifying a hash is detected by the endpoint."""

    @pytest.mark.asyncio
    async def test_tampered_hash_detected(
        self, async_session: AsyncSession, audit_client: AsyncClient
    ) -> None:
        """Insert entries, corrupt one hash, verify endpoint catches it."""
        from datetime import datetime

        previous_hash = GENESIS_HASH
        entry_ids: list[int] = []
        for i in range(1, 4):
            ts = datetime(2026, 3, 15, 13, 0, i)
            seq_hash = compute_audit_hash(
                previous_hash, "create", "broker", i, 1, "admin", ts,
            )
            entry = AuditLog(
                action="create",
                resource_type="broker",
                resource_id=i,
                user_id=1,
                username="admin",
                timestamp=ts,
                sequence_hash=seq_hash,
            )
            async_session.add(entry)
            await async_session.flush()
            entry_ids.append(entry.id)
            previous_hash = seq_hash

        # Corrupt the 2nd entry's hash
        tampered_id = entry_ids[1]
        await async_session.execute(
            update(AuditLog)
            .where(AuditLog.id == tampered_id)
            .values(sequence_hash="deadbeef" * 8)
        )
        await async_session.flush()

        resp = await audit_client.get("/api/v1/audit/verify-integrity")
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False
        assert data["first_break_id"] == tampered_id
        assert data["verified_count"] == 1  # Only entry 1 verified OK
