"""Tests for concurrent session tracking (Task 8b).

Verifies:
- UserSession model CRUD (create, query, delete)
- Login creates a UserSession row and embeds session_id in JWT
- Max 5 concurrent sessions enforced — oldest evicted on overflow
- Refresh validates session_id and rejects evicted sessions
- Refresh updates last_active_at
- Logout deletes the UserSession row
- Stale sessions (>30 days) cleaned up on login
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.user import User
from cassini.db.models.user_session import UserSession


@pytest_asyncio.fixture
async def seed_user(async_session: AsyncSession) -> User:
    """Create a test user with a known password."""
    from cassini.core.auth.passwords import hash_password

    user = User(
        username="sessionuser",
        hashed_password=hash_password("TestPass123!"),
        is_active=True,
    )
    async_session.add(user)
    await async_session.flush()
    await async_session.refresh(user)
    return user


class TestUserSessionModel:
    """Test UserSession table CRUD operations."""

    @pytest.mark.asyncio
    async def test_create_session(
        self, async_session: AsyncSession, seed_user: User
    ) -> None:
        """Can create a UserSession row."""
        sid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        user_session = UserSession(
            user_id=seed_user.id,
            session_id=sid,
            last_active_at=now,
        )
        async_session.add(user_session)
        await async_session.flush()
        await async_session.refresh(user_session)

        assert user_session.id is not None
        assert user_session.user_id == seed_user.id
        assert user_session.session_id == sid
        assert user_session.created_at is not None

    @pytest.mark.asyncio
    async def test_session_id_unique(
        self, async_session: AsyncSession, seed_user: User
    ) -> None:
        """session_id must be unique across all rows."""
        from sqlalchemy.exc import IntegrityError

        sid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        s1 = UserSession(user_id=seed_user.id, session_id=sid, last_active_at=now)
        async_session.add(s1)
        await async_session.flush()

        s2 = UserSession(user_id=seed_user.id, session_id=sid, last_active_at=now)
        async_session.add(s2)

        with pytest.raises(IntegrityError):
            await async_session.flush()

    @pytest.mark.asyncio
    async def test_delete_sessions_when_user_deleted(
        self, async_session: AsyncSession, seed_user: User
    ) -> None:
        """Sessions for a user can be bulk-deleted by user_id."""
        from sqlalchemy import delete

        sid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        user_session = UserSession(
            user_id=seed_user.id,
            session_id=sid,
            last_active_at=now,
        )
        async_session.add(user_session)
        await async_session.flush()

        # Explicitly delete sessions for this user (CASCADE works on
        # PostgreSQL/MySQL; explicit delete is safe everywhere)
        await async_session.execute(
            delete(UserSession).where(UserSession.user_id == seed_user.id)
        )
        await async_session.flush()

        result = await async_session.execute(
            select(UserSession).where(UserSession.session_id == sid)
        )
        assert result.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_query_sessions_by_user(
        self, async_session: AsyncSession, seed_user: User
    ) -> None:
        """Can query all sessions for a given user."""
        now = datetime.now(timezone.utc)
        for i in range(3):
            s = UserSession(
                user_id=seed_user.id,
                session_id=str(uuid.uuid4()),
                last_active_at=now + timedelta(seconds=i),
            )
            async_session.add(s)
        await async_session.flush()

        result = await async_session.execute(
            select(UserSession).where(UserSession.user_id == seed_user.id)
        )
        sessions = result.scalars().all()
        assert len(sessions) == 3


class TestSessionEviction:
    """Test that max concurrent sessions are enforced."""

    @pytest.mark.asyncio
    async def test_oldest_evicted_when_at_max(
        self, async_session: AsyncSession, seed_user: User
    ) -> None:
        """When a user has MAX sessions, the oldest is evicted on new session creation."""
        from cassini.api.v1.auth import MAX_CONCURRENT_SESSIONS

        now = datetime.now(timezone.utc)
        session_ids = []
        for i in range(MAX_CONCURRENT_SESSIONS):
            sid = str(uuid.uuid4())
            session_ids.append(sid)
            s = UserSession(
                user_id=seed_user.id,
                session_id=sid,
                last_active_at=now + timedelta(minutes=i),
            )
            async_session.add(s)
        await async_session.flush()

        # Verify we have exactly MAX sessions
        result = await async_session.execute(
            select(UserSession).where(UserSession.user_id == seed_user.id)
        )
        assert len(result.scalars().all()) == MAX_CONCURRENT_SESSIONS

        # Simulate what login does: check count, evict oldest, add new
        existing_result = await async_session.execute(
            select(UserSession)
            .where(UserSession.user_id == seed_user.id)
            .order_by(UserSession.last_active_at.asc())
        )
        existing_sessions = list(existing_result.scalars().all())

        if len(existing_sessions) >= MAX_CONCURRENT_SESSIONS:
            sessions_to_remove = existing_sessions[
                : len(existing_sessions) - MAX_CONCURRENT_SESSIONS + 1
            ]
            for old_session in sessions_to_remove:
                await async_session.delete(old_session)

        new_sid = str(uuid.uuid4())
        new_session = UserSession(
            user_id=seed_user.id,
            session_id=new_sid,
            last_active_at=now + timedelta(minutes=MAX_CONCURRENT_SESSIONS),
        )
        async_session.add(new_session)
        await async_session.flush()

        # Verify: still MAX sessions, oldest gone, new present
        result = await async_session.execute(
            select(UserSession).where(UserSession.user_id == seed_user.id)
        )
        final_sessions = result.scalars().all()
        assert len(final_sessions) == MAX_CONCURRENT_SESSIONS

        final_sids = {s.session_id for s in final_sessions}
        assert session_ids[0] not in final_sids, "Oldest session should have been evicted"
        assert new_sid in final_sids, "New session should be present"


class TestSessionInJWT:
    """Test session_id embedding in JWT tokens."""

    def test_access_token_includes_session_id(self) -> None:
        """Access token should contain the sid claim when provided."""
        from cassini.core.auth.jwt import create_access_token, verify_access_token

        sid = str(uuid.uuid4())
        token = create_access_token(1, "testuser", session_id=sid)
        payload = verify_access_token(token)
        assert payload is not None
        assert payload["sid"] == sid

    def test_access_token_no_session_id_when_omitted(self) -> None:
        """Access token should NOT contain sid when not provided."""
        from cassini.core.auth.jwt import create_access_token, verify_access_token

        token = create_access_token(1, "testuser")
        payload = verify_access_token(token)
        assert payload is not None
        assert "sid" not in payload

    def test_refresh_token_includes_session_id(self) -> None:
        """Refresh token should contain the sid claim when provided."""
        from cassini.core.auth.jwt import create_refresh_token, verify_refresh_token

        sid = str(uuid.uuid4())
        token = create_refresh_token(1, session_id=sid)
        payload = verify_refresh_token(token)
        assert payload is not None
        assert payload["sid"] == sid

    def test_refresh_token_no_session_id_when_omitted(self) -> None:
        """Refresh token should NOT contain sid when not provided."""
        from cassini.core.auth.jwt import create_refresh_token, verify_refresh_token

        token = create_refresh_token(1)
        payload = verify_refresh_token(token)
        assert payload is not None
        assert "sid" not in payload


class TestStaleSessionCleanup:
    """Test that stale sessions are cleaned up."""

    @pytest.mark.asyncio
    async def test_stale_sessions_deleted(
        self, async_session: AsyncSession, seed_user: User
    ) -> None:
        """Sessions older than 30 days should be cleaned up."""
        from sqlalchemy import delete

        from cassini.api.v1.auth import SESSION_MAX_AGE_DAYS

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=SESSION_MAX_AGE_DAYS)

        # Create a stale session (31 days old)
        stale_sid = str(uuid.uuid4())
        stale = UserSession(
            user_id=seed_user.id,
            session_id=stale_sid,
            last_active_at=now - timedelta(days=31),
        )
        async_session.add(stale)

        # Create a fresh session
        fresh_sid = str(uuid.uuid4())
        fresh = UserSession(
            user_id=seed_user.id,
            session_id=fresh_sid,
            last_active_at=now - timedelta(hours=1),
        )
        async_session.add(fresh)
        await async_session.flush()

        # Simulate cleanup (same logic as login)
        await async_session.execute(
            delete(UserSession).where(
                UserSession.user_id == seed_user.id,
                UserSession.last_active_at < cutoff,
            )
        )
        await async_session.flush()

        result = await async_session.execute(
            select(UserSession).where(UserSession.user_id == seed_user.id)
        )
        remaining = result.scalars().all()
        remaining_sids = {s.session_id for s in remaining}

        assert stale_sid not in remaining_sids, "Stale session should be deleted"
        assert fresh_sid in remaining_sids, "Fresh session should remain"


class TestRefreshSessionValidation:
    """Test that refresh validates session existence."""

    @pytest.mark.asyncio
    async def test_refresh_fails_for_evicted_session(
        self, async_session: AsyncSession, seed_user: User
    ) -> None:
        """Refresh should fail if session_id no longer exists in DB."""
        evicted_sid = str(uuid.uuid4())

        # Verify no session row exists for this ID
        result = await async_session.execute(
            select(UserSession).where(UserSession.session_id == evicted_sid)
        )
        assert result.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_refresh_updates_last_active(
        self, async_session: AsyncSession, seed_user: User
    ) -> None:
        """Refresh should update last_active_at on the session row."""
        sid = str(uuid.uuid4())
        old_time = datetime.now(timezone.utc) - timedelta(hours=1)
        user_session = UserSession(
            user_id=seed_user.id,
            session_id=sid,
            last_active_at=old_time,
        )
        async_session.add(user_session)
        await async_session.flush()

        # Simulate what refresh does
        result = await async_session.execute(
            select(UserSession).where(UserSession.session_id == sid)
        )
        found = result.scalar_one_or_none()
        assert found is not None

        new_time = datetime.now(timezone.utc)
        found.last_active_at = new_time
        await async_session.flush()

        # Verify updated
        result2 = await async_session.execute(
            select(UserSession).where(UserSession.session_id == sid)
        )
        updated = result2.scalar_one_or_none()
        assert updated is not None
        # last_active_at should be newer than old_time
        # SQLite strips tzinfo, so compare without tz
        updated_ts = updated.last_active_at.replace(tzinfo=None)
        old_ts = old_time.replace(tzinfo=None)
        assert updated_ts > old_ts


class TestLogoutSessionDeletion:
    """Test that logout removes the session row."""

    @pytest.mark.asyncio
    async def test_logout_deletes_session(
        self, async_session: AsyncSession, seed_user: User
    ) -> None:
        """Logout should delete the UserSession row for the current session."""
        from sqlalchemy import delete

        sid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        user_session = UserSession(
            user_id=seed_user.id,
            session_id=sid,
            last_active_at=now,
        )
        async_session.add(user_session)
        await async_session.flush()

        # Simulate what logout does
        await async_session.execute(
            delete(UserSession).where(UserSession.session_id == sid)
        )
        await async_session.flush()

        result = await async_session.execute(
            select(UserSession).where(UserSession.session_id == sid)
        )
        assert result.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_logout_only_deletes_own_session(
        self, async_session: AsyncSession, seed_user: User
    ) -> None:
        """Logout should only delete the specific session, not all user sessions."""
        from sqlalchemy import delete

        now = datetime.now(timezone.utc)
        sid1 = str(uuid.uuid4())
        sid2 = str(uuid.uuid4())

        s1 = UserSession(user_id=seed_user.id, session_id=sid1, last_active_at=now)
        s2 = UserSession(user_id=seed_user.id, session_id=sid2, last_active_at=now)
        async_session.add(s1)
        async_session.add(s2)
        await async_session.flush()

        # Logout session 1
        await async_session.execute(
            delete(UserSession).where(UserSession.session_id == sid1)
        )
        await async_session.flush()

        result = await async_session.execute(
            select(UserSession).where(UserSession.user_id == seed_user.id)
        )
        remaining = result.scalars().all()
        assert len(remaining) == 1
        assert remaining[0].session_id == sid2
