"""Automated API test runner for WS-4 Phase 2 UAT.

Starts a backend server with the requested configuration, runs API tests
against it, reports results, and shuts down. Designed to be invoked by
Claude Code or run manually from the command line.

Usage:
    python run_tests.py                     # Run all test suites
    python run_tests.py rate-limit          # Run only rate-limit suite
    python run_tests.py dev-mode            # Run only dev-mode bypass suite
    python run_tests.py code-quality        # Run only code-quality suite

The script manages its own server lifecycle — no need to start anything
beforehand. It uses a temporary database so your main openspc.db is
never touched.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import jwt as pyjwt  # PyJWT -- for crafting expired/invalid tokens in tests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parent.parent  # backend/
BASE_URL = "http://127.0.0.1:8000"
API = f"{BASE_URL}/api/v1"

ADMIN_USER = "admin"
ADMIN_PASS = "password"

# Temp DB name (deleted on cleanup)
TEST_DB = BACKEND_DIR / "test_automated.db"

# How long to wait for the server to become healthy
SERVER_STARTUP_TIMEOUT = 30  # seconds


# ---------------------------------------------------------------------------
# Test infrastructure
# ---------------------------------------------------------------------------

@dataclass
class TestResult:
    name: str
    passed: bool
    detail: str = ""


@dataclass
class TestSuite:
    name: str
    results: list[TestResult] = field(default_factory=list)

    def record(self, name: str, passed: bool, detail: str = ""):
        self.results.append(TestResult(name, passed, detail))

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if not r.passed)

    @property
    def total(self) -> int:
        return len(self.results)

    def report(self) -> str:
        lines = [f"\n{'='*56}", f"  {self.name}", f"{'='*56}"]
        for r in self.results:
            icon = "PASS" if r.passed else "FAIL"
            lines.append(f"  [{icon}] {r.name}")
            if r.detail:
                lines.append(f"         {r.detail}")
        lines.append(f"{'-'*56}")
        lines.append(f"  {self.passed}/{self.total} passed, {self.failed} failed")
        lines.append(f"{'='*56}\n")
        return "\n".join(lines)


class ServerProcess:
    """Manages a uvicorn backend subprocess."""

    def __init__(self, *, dev_mode: bool = False, db_path: Path = TEST_DB):
        self.dev_mode = dev_mode
        self.db_path = db_path
        self.proc: subprocess.Popen | None = None

    def start(self):
        # Clean up old test DB
        if self.db_path.exists():
            self.db_path.unlink()

        env = os.environ.copy()
        env["OPENSPC_DATABASE_URL"] = f"sqlite+aiosqlite:///{self.db_path}"
        env["OPENSPC_SANDBOX"] = "true"
        env["OPENSPC_JWT_SECRET"] = "openspc-automated-test-key"
        env["OPENSPC_ADMIN_USERNAME"] = ADMIN_USER
        env["OPENSPC_ADMIN_PASSWORD"] = ADMIN_PASS
        if self.dev_mode:
            env["OPENSPC_DEV_MODE"] = "true"
        else:
            env.pop("OPENSPC_DEV_MODE", None)

        # Run alembic migrations
        print(f"  [setup] Running migrations on {self.db_path.name}...")
        mig = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(BACKEND_DIR),
            env=env,
            capture_output=True,
            text=True,
        )
        if mig.returncode != 0:
            print(f"  [setup] Migration FAILED:\n{mig.stderr}")
            raise RuntimeError("Alembic migration failed")
        print("  [setup] Migrations OK")

        # Start uvicorn (no --reload so we get a clean process)
        print(f"  [setup] Starting server (dev_mode={self.dev_mode})...")
        self._stderr_path = BACKEND_DIR / "test_server_stderr.log"
        self._stderr_file = open(self._stderr_path, "w")
        self.proc = subprocess.Popen(
            [
                sys.executable, "-m", "uvicorn",
                "openspc.main:app",
                "--host", "127.0.0.1",
                "--port", "8000",
            ],
            cwd=str(BACKEND_DIR),
            env=env,
            stdout=subprocess.PIPE,
            stderr=self._stderr_file,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
        )

        # Wait for server to be ready
        deadline = time.time() + SERVER_STARTUP_TIMEOUT
        while time.time() < deadline:
            try:
                r = httpx.get(f"{BASE_URL}/api/v1/health", timeout=2)
                if r.status_code in (200, 404):
                    # 404 is fine — means the server is up, just no /health route
                    print("  [setup] Server is ready")
                    return
            except httpx.ConnectError:
                pass
            # Also try login endpoint with GET (will return 405 if server is up)
            try:
                r = httpx.get(f"{API}/auth/login", timeout=2)
                if r.status_code in (200, 405, 422):
                    print("  [setup] Server is ready")
                    return
            except httpx.ConnectError:
                pass
            time.sleep(0.5)

        self.stop()
        raise RuntimeError(f"Server did not start within {SERVER_STARTUP_TIMEOUT}s")

    def stop(self):
        if self.proc and self.proc.poll() is None:
            print("  [teardown] Stopping server...")
            if sys.platform == "win32":
                self.proc.send_signal(signal.CTRL_BREAK_EVENT)
                try:
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
            else:
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
            self.proc = None
        if hasattr(self, "_stderr_file") and self._stderr_file:
            self._stderr_file.close()
            # Dump last N lines of server log for debugging
            if self._stderr_path.exists():
                lines = self._stderr_path.read_text(errors="replace").splitlines()
                error_lines = [l for l in lines if "error" in l.lower() or "traceback" in l.lower() or "ValueError" in l]
                if error_lines:
                    print("  [server-log] Errors found:")
                    for l in error_lines[-10:]:
                        print(f"    {l}")
                self._stderr_path.unlink(missing_ok=True)
        # Clean up test DB
        if self.db_path.exists():
            try:
                self.db_path.unlink()
                print(f"  [teardown] Deleted {self.db_path.name}")
            except OSError:
                pass


# ---------------------------------------------------------------------------
# Helper: authenticated client
# ---------------------------------------------------------------------------

def login(client: httpx.Client) -> str:
    """Login as admin and return the access token."""
    r = client.post(f"{API}/auth/login", json={
        "username": ADMIN_USER,
        "password": ADMIN_PASS,
    })
    r.raise_for_status()
    return r.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Test suites
# ---------------------------------------------------------------------------

def suite_rate_limit() -> TestSuite:
    """Test SlowAPI rate limiting on auth endpoints (5/minute)."""
    suite = TestSuite("Rate Limiting (5/minute login)")
    server = ServerProcess(dev_mode=False)

    try:
        server.start()
        client = httpx.Client(timeout=10)

        # Test 1: Valid login works
        r = client.post(f"{API}/auth/login", json={
            "username": ADMIN_USER, "password": ADMIN_PASS,
        })
        suite.record(
            "Valid login succeeds",
            r.status_code in (200, 428),
            f"HTTP {r.status_code}",
        )

        # Test 2: Fire attempts 2-8, expect 429 at attempt 6
        first_429 = 0
        statuses = []
        for i in range(2, 9):
            r = client.post(f"{API}/auth/login", json={
                "username": ADMIN_USER, "password": "wrong",
            })
            statuses.append(f"#{i}={r.status_code}")
            if r.status_code == 429 and first_429 == 0:
                first_429 = i

        suite.record(
            "429 received within 8 attempts",
            first_429 > 0,
            f"First 429 at attempt {first_429} | {', '.join(statuses)}",
        )

        suite.record(
            "429 triggers at attempt 6 (5/min limit)",
            first_429 == 6,
            f"First 429 at attempt {first_429}" if first_429 else "No 429",
        )

        # Test 3: 429 body contains rate limit message
        r = client.post(f"{API}/auth/login", json={
            "username": ADMIN_USER, "password": "wrong",
        })
        body = r.text.lower()
        suite.record(
            "429 response body contains rate limit message",
            r.status_code == 429 and "rate limit" in body,
            f"HTTP {r.status_code}, body snippet: {r.text[:100]}",
        )

        client.close()
    finally:
        server.stop()

    return suite


def suite_dev_mode() -> TestSuite:
    """Test that dev_mode disables rate limiting."""
    suite = TestSuite("Dev Mode Bypass (no rate limits)")
    server = ServerProcess(dev_mode=True)

    try:
        server.start()
        client = httpx.Client(timeout=10)

        # Fire 10 rapid login attempts — none should get 429
        got_429 = False
        statuses = []
        for i in range(1, 11):
            r = client.post(f"{API}/auth/login", json={
                "username": ADMIN_USER, "password": ADMIN_PASS,
            })
            statuses.append(r.status_code)
            if r.status_code == 429:
                got_429 = True

        suite.record(
            "10 rapid logins without 429",
            not got_429,
            f"Statuses: {statuses}",
        )

        suite.record(
            "Login returns valid response",
            all(s in (200, 428) for s in statuses),
            f"All statuses: {set(statuses)}",
        )

        client.close()
    finally:
        server.stop()

    return suite


def suite_code_quality() -> TestSuite:
    """Test server-side filtering, CRUD, acknowledge, exclude, annotations."""
    suite = TestSuite("Code Quality (CRUD, filters, optimistic update endpoints)")
    server = ServerProcess(dev_mode=True)

    try:
        server.start()
        client = httpx.Client(timeout=10)

        # --- Login ---
        token = login(client)
        hdrs = auth_headers(token)
        suite.record("Login as admin", True, "Token obtained")

        # --- Create plant ---
        r = client.post(f"{API}/plants/", json={
            "name": "Automated Test Plant", "code": "AUTOTEST",
        }, headers=hdrs)
        plant_id = None
        if r.status_code in (200, 201):
            plant_id = r.json()["id"]
            suite.record("Create plant", True, f"ID={plant_id}")
        else:
            # May already exist — list and find it
            r2 = client.get(f"{API}/plants/", headers=hdrs)
            plants = r2.json() if r2.status_code == 200 else []
            if isinstance(plants, list) and plants:
                plant_id = plants[0]["id"]
            suite.record("Create plant", plant_id is not None,
                         f"Reused existing ID={plant_id}" if plant_id else f"Create={r.status_code}:{r.text[:80]}, List={r2.status_code}")

        if not plant_id:
            suite.record("ABORT", False, "No plant available")
            return suite

        # --- Create hierarchy node ---
        # Route: POST /api/v1/plants/{plant_id}/hierarchies/
        r = client.post(f"{API}/plants/{plant_id}/hierarchies/", json={
            "name": "Auto Test Line", "type": "Equipment",
        }, headers=hdrs)
        hier_id = None
        if r.status_code in (200, 201):
            hier_id = r.json()["id"]
            suite.record("Create hierarchy node", True, f"ID={hier_id}")
        else:
            # Fallback: list existing hierarchy nodes for this plant
            r2 = client.get(f"{API}/plants/{plant_id}/hierarchies/", headers=hdrs)
            tree = r2.json() if r2.status_code == 200 else []
            if isinstance(tree, list) and tree:
                hier_id = tree[0]["id"]
            suite.record("Create hierarchy node", hier_id is not None,
                         f"Reused existing ID={hier_id}" if hier_id else f"Create={r.status_code}:{r.text[:80]}, List={r2.status_code}:{r2.text[:80]}")

        if not hier_id:
            suite.record("ABORT", False, "No hierarchy node available")
            return suite

        # --- Create characteristic ---
        r = client.post(f"{API}/characteristics/", json={
            "hierarchy_id": hier_id,
            "name": "Auto Test Dim",
            "subgroup_size": 5,
            "target_value": 10.0,
            "usl": 10.5,
            "lsl": 9.5,
            "provider_type": "MANUAL",
        }, headers=hdrs)
        char_id = None
        if r.status_code in (200, 201):
            char_id = r.json()["id"]
            suite.record("Create characteristic", True, f"ID={char_id}")
        else:
            r2 = client.get(f"{API}/characteristics/", params={"plant_id": plant_id}, headers=hdrs)
            data = r2.json() if r2.status_code == 200 else {}
            items = data.get("items", []) if isinstance(data, dict) else []
            char_id = items[0]["id"] if items else None
            suite.record("Create characteristic", char_id is not None,
                         f"Reused existing ID={char_id}" if char_id else f"Create={r.status_code}:{r.text[:80]}")

        if not char_id:
            suite.record("ABORT", False, "No characteristic available")
            return suite

        # --- Submit samples (8 normal + 2 extreme) ---
        # Response is SampleProcessingResult: {sample_id, mean, zone, violations, ...}
        # --- Set control limits on the characteristic ---
        # Fresh characteristics have no UCL/LCL (computed from data), but the SPC engine
        # needs at least 2 samples to compute limits. We seed limits so the first sample
        # can be processed. target=10.0, so UCL=10.3, LCL=9.7 gives a 3-sigma spread.
        r = client.patch(f"{API}/characteristics/{char_id}", json={
            "ucl": 10.3,
            "lcl": 9.7,
        }, headers=hdrs)
        suite.record("Set control limits", r.status_code == 200,
                      f"HTTP {r.status_code}, ucl=10.3, lcl=9.7")

        sample_ids = []
        first_sample_resp = None
        for i in range(8):
            r = client.post(f"{API}/samples/", json={
                "characteristic_id": char_id,
                "measurements": [9.95, 10.02, 10.01, 9.98, 10.04],
            }, headers=hdrs)
            if first_sample_resp is None:
                first_sample_resp = f"HTTP {r.status_code}: {r.text[:300]}"
            if r.status_code in (200, 201):
                sid = r.json().get("sample_id")
                if sid:
                    sample_ids.append(sid)

        suite.record("Submit 8 normal samples", len(sample_ids) >= 8,
                      f"{len(sample_ids)} created | First: {first_sample_resp}")

        extreme_ids = []
        first_extreme_resp = None
        for i in range(2):
            r = client.post(f"{API}/samples/", json={
                "characteristic_id": char_id,
                "measurements": [12.5, 12.8, 12.3, 12.6, 12.9],
            }, headers=hdrs)
            if first_extreme_resp is None:
                first_extreme_resp = f"HTTP {r.status_code}: {r.text[:300]}"
            if r.status_code in (200, 201):
                sid = r.json().get("sample_id")
                if sid:
                    extreme_ids.append(sid)

        suite.record("Submit 2 extreme samples", len(extreme_ids) >= 2,
                      f"{len(extreme_ids)} created | First: {first_extreme_resp}")

        last_sample_id = (extreme_ids or sample_ids)[-1] if (extreme_ids or sample_ids) else None

        # --- Violations listing ---
        r = client.get(f"{API}/violations/", params={"characteristic_id": char_id}, headers=hdrs)
        viol_data = r.json()
        viol_total = viol_data.get("total", 0)
        viol_items = viol_data.get("items", [])
        suite.record("List violations", r.status_code == 200,
                      f"{viol_total} violations found")

        # --- Server-side filters ---
        for param, val, label in [
            ("requires_acknowledgement", "true", "requires_acknowledgement=true"),
            ("requires_acknowledgement", "false", "requires_acknowledgement=false"),
            ("acknowledged", "true", "acknowledged=true"),
            ("acknowledged", "false", "acknowledged=false"),
            ("severity", "CRITICAL", "severity=CRITICAL"),
            ("severity", "WARNING", "severity=WARNING"),
        ]:
            r = client.get(f"{API}/violations/", params={
                "characteristic_id": char_id, param: val,
            }, headers=hdrs)
            suite.record(f"Filter violations: {label}", r.status_code == 200,
                          f"HTTP {r.status_code}, {r.json().get('total', '?')} results")

        # --- Pagination ---
        r = client.get(f"{API}/violations/", params={
            "characteristic_id": char_id, "offset": 0, "limit": 2,
        }, headers=hdrs)
        suite.record("Violations pagination offset/limit", r.status_code == 200,
                      f"HTTP {r.status_code}")

        # --- Acknowledge a violation ---
        viol_id = viol_items[0]["id"] if viol_items else None
        if viol_id:
            r = client.post(f"{API}/violations/{viol_id}/acknowledge", json={
                "user": "admin",
                "reason": "Automated test ack",
                "exclude_sample": False,
            }, headers=hdrs)
            acked = r.json().get("acknowledged", False) if r.status_code == 200 else False
            suite.record("Acknowledge violation", r.status_code == 200 and acked,
                          f"HTTP {r.status_code}, acknowledged={acked}")
        else:
            suite.record("Acknowledge violation", True, "SKIP: no violations to ack")

        # --- Exclude sample ---
        if last_sample_id:
            r = client.patch(f"{API}/samples/{last_sample_id}/exclude", json={
                "is_excluded": True, "reason": "Automated test",
            }, headers=hdrs)
            suite.record("Exclude sample", r.status_code == 200,
                          f"HTTP {r.status_code}")

            r = client.patch(f"{API}/samples/{last_sample_id}/exclude", json={
                "is_excluded": False,
            }, headers=hdrs)
            suite.record("Re-include sample", r.status_code == 200,
                          f"HTTP {r.status_code}")

        # --- Annotation CRUD ---
        if last_sample_id:
            r = client.post(f"{API}/characteristics/{char_id}/annotations", json={
                "annotation_type": "point",
                "text": "Automated test annotation",
                "sample_id": last_sample_id,
                "color": "#ff6b6b",
            }, headers=hdrs)
            annot_id = r.json().get("id") if r.status_code in (200, 201) else None
            suite.record("Create annotation", annot_id is not None,
                          f"HTTP {r.status_code}, ID={annot_id}")

            r = client.get(f"{API}/characteristics/{char_id}/annotations", headers=hdrs)
            suite.record("List annotations", r.status_code == 200,
                          f"HTTP {r.status_code}")

            if annot_id:
                r = client.delete(f"{API}/characteristics/{char_id}/annotations/{annot_id}", headers=hdrs)
                suite.record("Delete annotation", r.status_code in (200, 204),
                              f"HTTP {r.status_code}")

        # --- Samples listing ---
        r = client.get(f"{API}/samples/", params={
            "characteristic_id": char_id, "offset": 0, "limit": 5,
        }, headers=hdrs)
        suite.record("List samples with pagination", r.status_code == 200,
                      f"HTTP {r.status_code}, total={r.json().get('total', '?')}")

        # --- Violation stats ---
        r = client.get(f"{API}/violations/stats", params={
            "characteristic_id": char_id,
        }, headers=hdrs)
        suite.record("Violation stats endpoint", r.status_code == 200,
                      f"HTTP {r.status_code}")

        client.close()
    finally:
        server.stop()

    return suite


def suite_auth_flow() -> TestSuite:
    """Test authentication flow: login, refresh, logout, /me."""
    suite = TestSuite("Auth Flow (login/refresh/logout/me)")
    server = ServerProcess(dev_mode=True)

    try:
        server.start()
        client = httpx.Client(timeout=10)

        # Test 1: Login with valid credentials returns 200 + access_token + user
        r = client.post(f"{API}/auth/login", json={
            "username": ADMIN_USER, "password": ADMIN_PASS,
        })
        body = r.json() if r.status_code == 200 else {}
        has_token = "access_token" in body
        has_user = "user" in body
        suite.record(
            "Login with valid credentials returns 200 + token + user",
            r.status_code == 200 and has_token and has_user,
            f"HTTP {r.status_code}, has_token={has_token}, has_user={has_user}",
        )
        token = body.get("access_token", "")

        # Test 2: Login with wrong password returns 401
        r = client.post(f"{API}/auth/login", json={
            "username": ADMIN_USER, "password": "wrongpassword",
        })
        suite.record(
            "Login with wrong password returns 401",
            r.status_code == 401,
            f"HTTP {r.status_code}",
        )

        # Test 3: Login with unknown username returns 401
        r = client.post(f"{API}/auth/login", json={
            "username": "nonexistent_user", "password": "password",
        })
        suite.record(
            "Login with unknown username returns 401",
            r.status_code == 401,
            f"HTTP {r.status_code}",
        )

        # Test 4: Refresh with valid cookie returns new access_token
        # First, login to get the refresh cookie
        login_client = httpx.Client(timeout=10)
        r = login_client.post(f"{API}/auth/login", json={
            "username": ADMIN_USER, "password": ADMIN_PASS,
        })
        # Extract refresh_token cookie
        refresh_cookie = None
        for cookie in login_client.cookies.jar:
            if cookie.name == "refresh_token":
                refresh_cookie = cookie.value
                break
        if refresh_cookie:
            # Send refresh request with cookie
            r = httpx.post(
                f"{API}/auth/refresh",
                cookies={"refresh_token": refresh_cookie},
                timeout=10,
            )
            refresh_body = r.json() if r.status_code == 200 else {}
            suite.record(
                "Refresh with valid cookie returns new access_token",
                r.status_code == 200 and "access_token" in refresh_body,
                f"HTTP {r.status_code}, has_token={'access_token' in refresh_body}",
            )
        else:
            suite.record(
                "Refresh with valid cookie returns new access_token",
                False,
                "No refresh_token cookie received from login",
            )
        login_client.close()

        # Test 5: Refresh without cookie returns 401
        r = httpx.post(f"{API}/auth/refresh", timeout=10)
        suite.record(
            "Refresh without cookie returns 401",
            r.status_code == 401,
            f"HTTP {r.status_code}",
        )

        # Test 6: Logout clears cookie
        r = httpx.post(
            f"{API}/auth/logout",
            headers=auth_headers(token),
            timeout=10,
        )
        suite.record(
            "Logout returns 200",
            r.status_code == 200,
            f"HTTP {r.status_code}",
        )

        # Test 7: GET /me with valid token returns user
        r = client.get(f"{API}/auth/me", headers=auth_headers(token))
        me_body = r.json() if r.status_code == 200 else {}
        suite.record(
            "GET /me with valid token returns user",
            r.status_code == 200 and "username" in me_body,
            f"HTTP {r.status_code}, username={me_body.get('username', 'N/A')}",
        )

        # Test 8: GET /me without token returns 401
        r = client.get(f"{API}/auth/me")
        suite.record(
            "GET /me without token returns 401",
            r.status_code == 401,
            f"HTTP {r.status_code}",
        )

        client.close()
    finally:
        server.stop()

    return suite


def suite_negative_auth() -> TestSuite:
    """Test negative auth scenarios: expired tokens, missing auth, forced password change."""
    suite = TestSuite("Negative Auth (expired/invalid/forced password change)")

    # --- Section 1: Invalid token scenarios (dev_mode=True) ---
    server = ServerProcess(dev_mode=True)
    try:
        server.start()
        client = httpx.Client(timeout=10)

        # Test 1: No Authorization header returns 401
        r = client.get(f"{API}/auth/me")
        suite.record(
            "No Authorization header returns 401",
            r.status_code == 401,
            f"HTTP {r.status_code}",
        )

        # Test 2: Invalid Bearer token returns 401
        r = client.get(f"{API}/auth/me", headers={"Authorization": "Bearer garbage_token_xyz"})
        suite.record(
            "Invalid Bearer token returns 401",
            r.status_code == 401,
            f"HTTP {r.status_code}",
        )

        # Test 3: Expired JWT returns 401
        expired_token = pyjwt.encode(
            {"sub": "1", "username": "admin", "type": "access", "exp": time.time() - 3600, "iat": time.time() - 7200},
            "openspc-automated-test-key",
            algorithm="HS256",
        )
        r = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
        suite.record(
            "Expired JWT returns 401",
            r.status_code == 401,
            f"HTTP {r.status_code}",
        )

        # Test 4: Change password works
        token = login(client)
        r = client.post(f"{API}/auth/change-password", json={
            "current_password": ADMIN_PASS,
            "new_password": "NewTestPass123!",
        }, headers=auth_headers(token))
        suite.record(
            "Change password returns 200",
            r.status_code == 200,
            f"HTTP {r.status_code}",
        )

        # Test 5: Login with new password succeeds
        r = client.post(f"{API}/auth/login", json={
            "username": ADMIN_USER, "password": "NewTestPass123!",
        })
        suite.record(
            "Login with new password succeeds",
            r.status_code == 200,
            f"HTTP {r.status_code}",
        )

        # Test 6: Login with old password fails
        r = client.post(f"{API}/auth/login", json={
            "username": ADMIN_USER, "password": ADMIN_PASS,
        })
        suite.record(
            "Login with old password fails after change",
            r.status_code == 401,
            f"HTTP {r.status_code}",
        )

        client.close()
    finally:
        server.stop()

    # --- Section 2: Forced password change (dev_mode=False) ---
    db2 = BACKEND_DIR / "test_automated_negauth.db"
    server2 = ServerProcess(dev_mode=False, db_path=db2)
    try:
        server2.start()
        client2 = httpx.Client(timeout=10)

        # Login should return must_change_password=true when dev_mode=False
        r = client2.post(f"{API}/auth/login", json={
            "username": ADMIN_USER, "password": ADMIN_PASS,
        })
        body = r.json() if r.status_code in (200, 428) else {}
        must_change = body.get("must_change_password", None)
        suite.record(
            "Forced password change: must_change_password=true",
            must_change is True,
            f"HTTP {r.status_code}, must_change_password={must_change}",
        )

        client2.close()
    finally:
        server2.stop()

    return suite


def suite_rbac_isolation() -> TestSuite:
    """Test RBAC plant isolation: users from Plant A cannot access Plant B."""
    suite = TestSuite("RBAC Plant Isolation (cross-plant access control)")
    server = ServerProcess(dev_mode=True)

    try:
        server.start()
        client = httpx.Client(timeout=10)

        # --- Setup: Login as admin ---
        admin_token = login(client)
        admin_hdrs = auth_headers(admin_token)

        # --- Create Plant A and Plant B ---
        r = client.post(f"{API}/plants/", json={
            "name": "RBAC Plant A", "code": "PLANTA",
        }, headers=admin_hdrs)
        plant_a_id = r.json().get("id") if r.status_code in (200, 201) else None
        if not plant_a_id:
            # List and find
            r2 = client.get(f"{API}/plants/", headers=admin_hdrs)
            plants = r2.json() if r2.status_code == 200 else []
            for p in (plants if isinstance(plants, list) else []):
                if p.get("code") == "PLANTA":
                    plant_a_id = p["id"]
                    break
        suite.record("Create Plant A", plant_a_id is not None, f"ID={plant_a_id}")

        r = client.post(f"{API}/plants/", json={
            "name": "RBAC Plant B", "code": "PLANTB",
        }, headers=admin_hdrs)
        plant_b_id = r.json().get("id") if r.status_code in (200, 201) else None
        if not plant_b_id:
            r2 = client.get(f"{API}/plants/", headers=admin_hdrs)
            plants = r2.json() if r2.status_code == 200 else []
            for p in (plants if isinstance(plants, list) else []):
                if p.get("code") == "PLANTB":
                    plant_b_id = p["id"]
                    break
        suite.record("Create Plant B", plant_b_id is not None, f"ID={plant_b_id}")

        if not plant_a_id or not plant_b_id:
            suite.record("ABORT", False, "Plants not created")
            return suite

        # --- Test 1: Admin can list both plants ---
        r = client.get(f"{API}/plants/", headers=admin_hdrs)
        plants = r.json() if r.status_code == 200 else []
        plant_count = len(plants) if isinstance(plants, list) else 0
        suite.record(
            "Admin can list both plants",
            r.status_code == 200 and plant_count >= 2,
            f"HTTP {r.status_code}, plant_count={plant_count}",
        )

        # --- Create hierarchy + characteristic under Plant A ---
        r = client.post(f"{API}/plants/{plant_a_id}/hierarchies/", json={
            "name": "RBAC Line A", "type": "Equipment",
        }, headers=admin_hdrs)
        hier_a_id = r.json().get("id") if r.status_code in (200, 201) else None
        if not hier_a_id:
            r2 = client.get(f"{API}/plants/{plant_a_id}/hierarchies/", headers=admin_hdrs)
            tree = r2.json() if r2.status_code == 200 else []
            if isinstance(tree, list) and tree:
                hier_a_id = tree[0]["id"]

        r = client.post(f"{API}/characteristics/", json={
            "hierarchy_id": hier_a_id,
            "name": "RBAC Dim A",
            "subgroup_size": 5,
            "target_value": 10.0,
            "usl": 10.5,
            "lsl": 9.5,
            "provider_type": "MANUAL",
        }, headers=admin_hdrs)
        char_a_id = r.json().get("id") if r.status_code in (200, 201) else None

        # --- Create hierarchy + characteristic under Plant B ---
        r = client.post(f"{API}/plants/{plant_b_id}/hierarchies/", json={
            "name": "RBAC Line B", "type": "Equipment",
        }, headers=admin_hdrs)
        hier_b_id = r.json().get("id") if r.status_code in (200, 201) else None
        if not hier_b_id:
            r2 = client.get(f"{API}/plants/{plant_b_id}/hierarchies/", headers=admin_hdrs)
            tree = r2.json() if r2.status_code == 200 else []
            if isinstance(tree, list) and tree:
                hier_b_id = tree[0]["id"]

        r = client.post(f"{API}/characteristics/", json={
            "hierarchy_id": hier_b_id,
            "name": "RBAC Dim B",
            "subgroup_size": 5,
            "target_value": 10.0,
            "usl": 10.5,
            "lsl": 9.5,
            "provider_type": "MANUAL",
        }, headers=admin_hdrs)
        char_b_id = r.json().get("id") if r.status_code in (200, 201) else None

        # Set limits on char B so samples can be processed
        if char_b_id:
            client.patch(f"{API}/characteristics/{char_b_id}", json={
                "ucl": 10.3, "lcl": 9.7,
            }, headers=admin_hdrs)

        # --- Create operator1 with role on Plant A only ---
        r = client.post(f"{API}/users/", json={
            "username": "operator1",
            "password": "testpass123",
            "plant_roles": [{"plant_id": plant_a_id, "role": "operator"}],
        }, headers=admin_hdrs)
        op1_created = r.status_code in (200, 201)
        suite.record("Create operator1 for Plant A", op1_created,
                      f"HTTP {r.status_code}: {r.text[:100]}")

        # --- Login as operator1 ---
        r = client.post(f"{API}/auth/login", json={
            "username": "operator1", "password": "testpass123",
        })
        op1_body = r.json() if r.status_code == 200 else {}
        op1_token = op1_body.get("access_token", "")
        op1_hdrs = auth_headers(op1_token)

        # --- Test 2: Operator1 can access Plant A characteristics ---
        r = client.get(f"{API}/characteristics/", params={"plant_id": plant_a_id}, headers=op1_hdrs)
        suite.record(
            "Operator1 can list Plant A characteristics",
            r.status_code == 200,
            f"HTTP {r.status_code}",
        )

        # --- Test 3: Operator1 CANNOT submit sample to Plant B ---
        if char_b_id:
            r = client.post(f"{API}/samples/", json={
                "characteristic_id": char_b_id,
                "measurements": [10.0, 10.1, 9.9, 10.05, 9.95],
            }, headers=op1_hdrs)
            # Should be 403 or 404 (RBAC may manifest as not found)
            suite.record(
                "Operator1 CANNOT submit sample to Plant B",
                r.status_code in (401, 403, 404),
                f"HTTP {r.status_code}",
            )
        else:
            suite.record("Operator1 CANNOT submit sample to Plant B", False, "char_b not created")

        # --- Test 4: Admin CAN submit sample to Plant B ---
        if char_b_id:
            r = client.post(f"{API}/samples/", json={
                "characteristic_id": char_b_id,
                "measurements": [10.0, 10.1, 9.9, 10.05, 9.95],
            }, headers=admin_hdrs)
            suite.record(
                "Admin CAN submit sample to Plant B",
                r.status_code in (200, 201),
                f"HTTP {r.status_code}",
            )
        else:
            suite.record("Admin CAN submit sample to Plant B", False, "char_b not created")

        # --- Create supervisor1 with role on Plant B ---
        r = client.post(f"{API}/users/", json={
            "username": "supervisor1",
            "password": "testpass123",
            "plant_roles": [{"plant_id": plant_b_id, "role": "supervisor"}],
        }, headers=admin_hdrs)
        suite.record("Create supervisor1 for Plant B",
                      r.status_code in (200, 201),
                      f"HTTP {r.status_code}: {r.text[:100]}")

        # --- Login as supervisor1 ---
        r = client.post(f"{API}/auth/login", json={
            "username": "supervisor1", "password": "testpass123",
        })
        sup1_body = r.json() if r.status_code == 200 else {}
        sup1_token = sup1_body.get("access_token", "")
        sup1_hdrs = auth_headers(sup1_token)

        # --- Test 5: Supervisor1 CAN access Plant B data ---
        r = client.get(f"{API}/characteristics/", params={"plant_id": plant_b_id}, headers=sup1_hdrs)
        suite.record(
            "Supervisor1 CAN list Plant B characteristics",
            r.status_code == 200,
            f"HTTP {r.status_code}",
        )

        # --- Test 6: Supervisor1 CANNOT access Plant A data ---
        if char_a_id:
            r = client.post(f"{API}/samples/", json={
                "characteristic_id": char_a_id,
                "measurements": [10.0, 10.1, 9.9, 10.05, 9.95],
            }, headers=sup1_hdrs)
            suite.record(
                "Supervisor1 CANNOT submit sample to Plant A",
                r.status_code in (401, 403, 404),
                f"HTTP {r.status_code}",
            )
        else:
            suite.record("Supervisor1 CANNOT submit sample to Plant A", False, "char_a not created")

        client.close()
    finally:
        server.stop()

    return suite


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

SUITES = {
    "rate-limit": suite_rate_limit,
    "dev-mode": suite_dev_mode,
    "code-quality": suite_code_quality,
    "auth-flow": suite_auth_flow,
    "negative-auth": suite_negative_auth,
    "rbac-isolation": suite_rbac_isolation,
}


def main():
    requested = sys.argv[1:] if len(sys.argv) > 1 else list(SUITES.keys())
    overall_pass = 0
    overall_fail = 0

    print()
    print("=" * 56)
    print("  OpenSPC Automated API Test Runner")
    print(f"  Suites: {', '.join(requested)}")
    print("=" * 56)
    print()

    for name in requested:
        if name not in SUITES:
            print(f"Unknown suite: {name}")
            print(f"Available: {', '.join(SUITES.keys())}")
            sys.exit(1)

        print(f">>> Running suite: {name}")
        suite = SUITES[name]()
        print(suite.report())
        overall_pass += suite.passed
        overall_fail += suite.failed

    print("=" * 56)
    print(f"  OVERALL: {overall_pass}/{overall_pass + overall_fail} passed, "
          f"{overall_fail} failed")
    print("=" * 56)

    sys.exit(1 if overall_fail > 0 else 0)


if __name__ == "__main__":
    main()
