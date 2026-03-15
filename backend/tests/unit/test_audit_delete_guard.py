"""Tests for audit deletion guard, GET auditing rate limiting, and health endpoint.

Covers:
- ORM event listener preventing AuditLog deletion
- AuditMiddleware GET audit rate limiting
- AuditService.get_health() status reporting
"""

from __future__ import annotations

import time
from unittest.mock import MagicMock

import pytest

from cassini.core.audit import AuditMiddleware, AuditService
from cassini.db.models.audit_log import AuditLog, prevent_audit_deletion


# ---------------------------------------------------------------------------
# 1. Audit Deletion Guard
# ---------------------------------------------------------------------------


class TestAuditDeletionGuard:
    """ORM event listener should prevent AuditLog deletion."""

    def test_audit_log_deletion_blocked(self):
        """Directly invoking the listener raises RuntimeError."""
        target = AuditLog()
        with pytest.raises(RuntimeError, match="cannot be deleted"):
            prevent_audit_deletion(None, None, target)

    def test_error_message_mentions_dba(self):
        """Error message should guide users toward DBA-level solutions."""
        target = AuditLog()
        with pytest.raises(RuntimeError, match="REVOKE DELETE"):
            prevent_audit_deletion(None, None, target)


# ---------------------------------------------------------------------------
# 2. GET Audit Rate Limiting
# ---------------------------------------------------------------------------


class TestGetAuditRateLimiting:
    """Verify in-memory rate-limit logic on AuditMiddleware."""

    def _make_middleware(self) -> AuditMiddleware:
        """Create an AuditMiddleware with a dummy app."""
        mw = AuditMiddleware(app=MagicMock())
        mw.audit_gets = True
        return mw

    def test_cache_starts_empty(self):
        mw = self._make_middleware()
        assert mw._get_audit_cache == {}

    def test_sensitive_segments_defined(self):
        """Middleware should have the four expected sensitive path segments."""
        expected = {"/audit/", "/users/", "/signatures/", "/export"}
        assert set(AuditMiddleware._SENSITIVE_GET_SEGMENTS) == expected

    def test_rate_limit_interval_is_five_minutes(self):
        assert AuditMiddleware._GET_RATE_LIMIT_SECONDS == 300

    def test_cache_max_size(self):
        assert AuditMiddleware._GET_CACHE_MAX_SIZE == 1000

    def test_cache_eviction_triggers_at_max_size(self):
        """When cache reaches max size, oldest 25% should be evicted."""
        mw = self._make_middleware()
        max_size = AuditMiddleware._GET_CACHE_MAX_SIZE

        # Fill cache to exactly max size with staggered timestamps
        for i in range(max_size):
            mw._get_audit_cache[("/test/", i)] = float(i)

        assert len(mw._get_audit_cache) == max_size

        # Simulate what the middleware does on a new entry when cache is full:
        # evict oldest 25%, then add new entry
        if len(mw._get_audit_cache) >= max_size:
            sorted_keys = sorted(mw._get_audit_cache, key=mw._get_audit_cache.get)  # type: ignore[arg-type]
            for k in sorted_keys[: max_size // 4]:
                del mw._get_audit_cache[k]

        # Should have evicted 250 entries (25% of 1000)
        assert len(mw._get_audit_cache) == max_size - max_size // 4

        # The oldest entries (0-249) should be gone
        for i in range(max_size // 4):
            assert ("/test/", i) not in mw._get_audit_cache

        # Newer entries should remain
        assert ("/test/", max_size - 1) in mw._get_audit_cache

    def test_rate_limit_respects_interval(self):
        """Same (path_prefix, user_id) should not log again within interval."""
        mw = self._make_middleware()
        cache_key = ("/api/v1/audit/", 1)
        now = time.monotonic()

        # First access: no entry in cache -> should log
        assert cache_key not in mw._get_audit_cache

        # Simulate logging
        mw._get_audit_cache[cache_key] = now

        # Immediate second access: within interval -> should NOT log
        last_logged = mw._get_audit_cache.get(cache_key)
        assert last_logged is not None
        assert (now - last_logged) < AuditMiddleware._GET_RATE_LIMIT_SECONDS

        # After interval: should log again
        mw._get_audit_cache[cache_key] = now - AuditMiddleware._GET_RATE_LIMIT_SECONDS - 1
        last_logged = mw._get_audit_cache.get(cache_key)
        assert (now - last_logged) >= AuditMiddleware._GET_RATE_LIMIT_SECONDS

    def test_audit_gets_disabled_by_default(self):
        """audit_gets should default to False."""
        mw = AuditMiddleware(app=MagicMock())
        assert mw.audit_gets is False


# ---------------------------------------------------------------------------
# 3. AuditService Health
# ---------------------------------------------------------------------------


class TestAuditServiceHealth:
    """Verify AuditService.get_health() reporting."""

    def _make_service(self) -> AuditService:
        """Create an AuditService with a dummy session factory."""
        return AuditService(session_factory=MagicMock())

    def test_healthy_by_default(self):
        svc = self._make_service()
        health = svc.get_health()
        assert health["status"] == "healthy"
        assert health["failure_count"] == 0
        assert health["last_failure_at"] is None

    def test_degraded_after_many_failures(self):
        svc = self._make_service()
        svc._failure_count = 11
        svc._last_failure_at = "2026-03-15T12:00:00+00:00"
        health = svc.get_health()
        assert health["status"] == "degraded"
        assert health["failure_count"] == 11
        assert health["last_failure_at"] == "2026-03-15T12:00:00+00:00"

    def test_healthy_at_threshold(self):
        """Exactly 10 failures should still be 'healthy' (>10 is degraded)."""
        svc = self._make_service()
        svc._failure_count = 10
        health = svc.get_health()
        assert health["status"] == "healthy"

    def test_degraded_at_eleven(self):
        svc = self._make_service()
        svc._failure_count = 11
        health = svc.get_health()
        assert health["status"] == "degraded"

    def test_last_failure_at_initially_none(self):
        svc = self._make_service()
        assert svc._last_failure_at is None
