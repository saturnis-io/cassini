# Open-Core Feature Gating Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add license-key-based feature gating to split Cassini into free Community and paid Commercial editions.

**Architecture:** Ed25519-signed JWT license file validated at startup. Backend conditionally registers enterprise routers, middleware, and event bus subscribers. Frontend fetches license status and gates enterprise UI via `<FeatureGate>` component and route guards. Single codebase, single Docker image — license file presence is the only difference.

**Tech Stack:** PyJWT (EdDSA/Ed25519 via `cryptography`), Zustand, React

**Design doc:** `docs/plans/2026-02-27-open-core-strategy-design.md`

---

## Task 1: Backend LicenseService

**Files:**
- Create: `backend/src/cassini/core/licensing.py`
- Modify: `backend/src/cassini/core/config.py:12-57` (add `license_file` setting)
- Test: `backend/tests/unit/test_licensing.py`

**Step 1: Write the failing tests**

```python
# backend/tests/unit/test_licensing.py
"""Tests for license validation and LicenseService."""

import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)

from cassini.core.licensing import LicenseService


@pytest.fixture
def ed25519_keypair():
    """Generate a test Ed25519 keypair."""
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    public_pem = public_key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    return private_pem, public_pem


@pytest.fixture
def make_license(ed25519_keypair, tmp_path):
    """Factory to create signed license files."""
    private_pem, public_pem = ed25519_keypair

    def _make(claims: dict, filename: str = "license.key") -> tuple[Path, bytes]:
        token = jwt.encode(claims, private_pem, algorithm="EdDSA")
        license_path = tmp_path / filename
        license_path.write_text(token)
        return license_path, public_pem

    return _make


class TestLicenseServiceCommunity:
    """Tests for Community edition (no license)."""

    def test_no_license_file_is_community(self):
        svc = LicenseService(license_path=None, public_key=b"unused")
        assert svc.is_commercial is False
        assert svc.edition == "community"
        assert svc.tier == "community"
        assert svc.max_plants == 1

    def test_nonexistent_file_is_community(self):
        svc = LicenseService(license_path="/nonexistent/license.key", public_key=b"unused")
        assert svc.is_commercial is False

    def test_days_until_expiry_is_none_for_community(self):
        svc = LicenseService(license_path=None, public_key=b"unused")
        assert svc.days_until_expiry is None


class TestLicenseServiceCommercial:
    """Tests for Commercial edition (valid license)."""

    def test_valid_license_is_commercial(self, make_license):
        path, pub = make_license({
            "sub": "acme",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.is_commercial is True
        assert svc.edition == "commercial"
        assert svc.tier == "enterprise"
        assert svc.max_plants == 20

    def test_days_until_expiry(self, make_license):
        expires = datetime.now(timezone.utc) + timedelta(days=30)
        path, pub = make_license({
            "sub": "acme",
            "tier": "professional",
            "max_plants": 5,
            "expires_at": expires.isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert 29 <= svc.days_until_expiry <= 31

    def test_expired_license_is_expired(self, make_license):
        path, pub = make_license({
            "sub": "acme",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.is_commercial is True  # Still commercial (read-only mode)
        assert svc.is_expired is True
        assert svc.days_until_expiry < 0

    def test_invalid_signature_falls_back_to_community(self, make_license, ed25519_keypair):
        # Sign with one key, validate with different key
        other_private = Ed25519PrivateKey.generate()
        other_pub = other_private.public_key().public_bytes(
            Encoding.PEM, PublicFormat.SubjectPublicKeyInfo
        )
        path, _original_pub = make_license({
            "sub": "acme",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        })
        # Validate with different public key
        svc = LicenseService(license_path=str(path), public_key=other_pub)
        assert svc.is_commercial is False

    def test_corrupted_file_falls_back_to_community(self, tmp_path, ed25519_keypair):
        _, pub = ed25519_keypair
        bad_file = tmp_path / "license.key"
        bad_file.write_text("this-is-not-a-jwt")
        svc = LicenseService(license_path=str(bad_file), public_key=pub)
        assert svc.is_commercial is False

    def test_status_dict(self, make_license):
        path, pub = make_license({
            "sub": "acme",
            "customer_name": "Acme Inc.",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key=pub)
        status = svc.status()
        assert status["edition"] == "commercial"
        assert status["tier"] == "enterprise"
        assert status["max_plants"] == 20
        assert "expires_at" in status
        assert "days_until_expiry" in status
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/unit/test_licensing.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'cassini.core.licensing'`

**Step 3: Add `license_file` setting to config**

Modify `backend/src/cassini/core/config.py` — add to the `Settings` class after line 57 (`dev_mode`):

```python
    # Licensing
    license_file: str = ""
```

**Step 4: Write LicenseService implementation**

```python
# backend/src/cassini/core/licensing.py
"""License validation for Cassini open-core editions.

Validates Ed25519-signed JWT license files for Commercial edition features.
Community edition (no license) provides core SPC functionality.
Commercial edition (valid license) unlocks enterprise features.
"""

import structlog
from datetime import datetime, timezone
from pathlib import Path

import jwt

logger = structlog.get_logger(__name__)

# Saturnis Ed25519 public key for license validation.
# Replace this with your actual production public key.
_DEFAULT_PUBLIC_KEY = b"""-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAPlaceholderKeyReplaceWithActualProductionKey00=
-----END PUBLIC KEY-----
"""


class LicenseService:
    """Validates and exposes license state for feature gating."""

    def __init__(self, license_path: str | None, public_key: bytes = _DEFAULT_PUBLIC_KEY):
        self._claims: dict | None = None
        self._valid = False
        self._load(license_path, public_key)

    def _load(self, license_path: str | None, public_key: bytes) -> None:
        if not license_path:
            logger.info("No license file configured — running as Community Edition")
            return

        path = Path(license_path)
        if not path.exists():
            logger.info("License file not found at %s — running as Community Edition", license_path)
            return

        try:
            token = path.read_text().strip()
            self._claims = jwt.decode(token, public_key, algorithms=["EdDSA"])
            self._valid = True
            logger.info(
                "License validated",
                tier=self._claims.get("tier"),
                customer=self._claims.get("sub"),
                expires_at=self._claims.get("expires_at"),
            )
        except jwt.InvalidSignatureError:
            logger.warning("License file has invalid signature — running as Community Edition")
        except jwt.DecodeError:
            logger.warning("License file is corrupted — running as Community Edition")
        except Exception as e:
            logger.warning("License validation failed — running as Community Edition", error=type(e).__name__)

    @property
    def is_commercial(self) -> bool:
        return self._valid

    @property
    def edition(self) -> str:
        return "commercial" if self._valid else "community"

    @property
    def tier(self) -> str:
        if not self._valid or not self._claims:
            return "community"
        return self._claims.get("tier", "professional")

    @property
    def max_plants(self) -> int:
        if not self._valid or not self._claims:
            return 1
        return self._claims.get("max_plants", 1)

    @property
    def is_expired(self) -> bool:
        if not self._valid or not self._claims:
            return False
        expires_at = self._claims.get("expires_at")
        if not expires_at:
            return False
        expiry = datetime.fromisoformat(expires_at)
        return datetime.now(timezone.utc) > expiry

    @property
    def days_until_expiry(self) -> int | None:
        if not self._valid or not self._claims:
            return None
        expires_at = self._claims.get("expires_at")
        if not expires_at:
            return None
        expiry = datetime.fromisoformat(expires_at)
        delta = expiry - datetime.now(timezone.utc)
        return delta.days

    def status(self) -> dict:
        """Return license status for the API endpoint."""
        if not self._valid:
            return {"edition": "community", "tier": "community", "max_plants": 1}
        return {
            "edition": "commercial",
            "tier": self.tier,
            "max_plants": self.max_plants,
            "expires_at": self._claims.get("expires_at") if self._claims else None,
            "days_until_expiry": self.days_until_expiry,
            "is_expired": self.is_expired,
        }
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/unit/test_licensing.py -v`
Expected: All 8 tests PASS

**Step 6: Commit**

```bash
git add backend/src/cassini/core/licensing.py backend/src/cassini/core/config.py backend/tests/unit/test_licensing.py
git commit -m "feat(licensing): add LicenseService with Ed25519 JWT validation"
```

---

## Task 2: License Status API Endpoint

**Files:**
- Create: `backend/src/cassini/api/v1/license.py`
- Create: `backend/src/cassini/api/schemas/license.py`
- Modify: `backend/src/cassini/api/deps.py` (add `get_license_service` dependency)
- Modify: `backend/src/cassini/main.py:78-85` (init LicenseService in lifespan)
- Modify: `backend/src/cassini/main.py:377` (register license router)
- Test: `backend/tests/unit/test_license_api.py`

**Step 1: Write the license schema**

```python
# backend/src/cassini/api/schemas/license.py
"""Pydantic schemas for license status endpoint."""

from pydantic import BaseModel


class LicenseStatusResponse(BaseModel):
    edition: str  # "community" or "commercial"
    tier: str  # "community", "professional", "enterprise", "enterprise_plus"
    max_plants: int
    expires_at: str | None = None
    days_until_expiry: int | None = None
    is_expired: bool | None = None
```

**Step 2: Write the dependency function**

Add to `backend/src/cassini/api/deps.py` — after the existing imports (line 20), add:

```python
from cassini.core.licensing import LicenseService
```

Then at the end of the file, add:

```python
def get_license_service(request: Request) -> LicenseService:
    """Get the LicenseService from app state."""
    return request.app.state.license_service
```

**Step 3: Write the license router**

```python
# backend/src/cassini/api/v1/license.py
"""License status API endpoint.

Returns the current edition and feature entitlements.
No authentication required — needed for login page badging.
"""

from fastapi import APIRouter, Depends

from cassini.api.deps import get_license_service
from cassini.api.schemas.license import LicenseStatusResponse
from cassini.core.licensing import LicenseService

router = APIRouter(prefix="/api/v1/license", tags=["license"])


@router.get("/status", response_model=LicenseStatusResponse)
async def get_license_status(
    license_service: LicenseService = Depends(get_license_service),
) -> LicenseStatusResponse:
    """Get current license status.

    Returns edition type, tier, plant limits, and expiry info.
    No authentication required.
    """
    return LicenseStatusResponse(**license_service.status())
```

**Step 4: Initialize LicenseService in main.py lifespan**

Modify `backend/src/cassini/main.py`.

Add import near line 64:

```python
from cassini.core.licensing import LicenseService
```

Add at line 85 (after `logger.info("Starting Cassini application")`, before DB init):

```python
    # Initialize license service
    license_service = LicenseService(license_path=settings.license_file or None)
    app.state.license_service = license_service
    logger.info("License service initialized", edition=license_service.edition)
```

Add router import near line 16 (with the other router imports):

```python
from cassini.api.v1.license import router as license_router
```

Add router registration after line 419 (after `app.include_router(health_router, ...)`):

```python
app.include_router(license_router)
```

**Step 5: Run the app to verify endpoint works**

Run: `cd backend && uvicorn cassini.main:app --reload`
Test: `curl http://localhost:8000/api/v1/license/status`
Expected: `{"edition":"community","tier":"community","max_plants":1}`

**Step 6: Commit**

```bash
git add backend/src/cassini/api/v1/license.py backend/src/cassini/api/schemas/license.py backend/src/cassini/api/deps.py backend/src/cassini/main.py
git commit -m "feat(licensing): add /api/v1/license/status endpoint"
```

---

## Task 3: Conditional Router Registration

**Files:**
- Modify: `backend/src/cassini/main.py:16-58` (move enterprise imports inside conditional)
- Modify: `backend/src/cassini/main.py:377-419` (conditional include_router)

**Step 1: Refactor router registration in main.py**

Replace the router registration block (lines 377–419) with a conditional split. Keep all community routers unconditional. Gate enterprise routers behind `license_service.is_commercial`.

Community routers (always registered):
- `auth_router`, `users_router`, `hierarchy_router`, `plant_hierarchy_router`, `plants_router`
- `characteristics_router`, `config_router`, `samples_router`, `violations_router`
- `data_entry_router`, `import_router`, `annotations_router`, `tags_router`
- `capability_router`, `explain_router` (Show Your Work), `websocket_router`
- `health_router`, `brokers_router`, `license_router`

Enterprise routers (commercial only):
- `anomaly_router`, `audit_router`, `api_keys_router`, `opcua_servers_router`
- `database_admin_router`, `distributions_router`, `fai_router`, `gage_bridges_router`
- `ishikawa_router`, `msa_router`, `notifications_router`, `oidc_router`
- `providers_router`, `retention_router`, `rule_presets_router`, `scheduled_reports_router`
- `signatures_router`, `system_settings_router`, `push_router`, `erp_router`
- `multivariate_router`, `predictions_router`, `ai_analysis_router`, `doe_router`

**Implementation pattern:**

```python
# --- Community routers (always registered) ---
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(hierarchy_router, prefix="/api/v1/hierarchy")
app.include_router(plant_hierarchy_router, prefix="/api/v1/plants/{plant_id}/hierarchies")
app.include_router(plants_router)
app.include_router(characteristics_router)
app.include_router(config_router)
app.include_router(samples_router)
app.include_router(violations_router)
app.include_router(data_entry_router)
app.include_router(import_router)
app.include_router(annotations_router)
app.include_router(tags_router)
app.include_router(capability_router)
app.include_router(explain_router)
app.include_router(brokers_router)
app.include_router(websocket_router)
app.include_router(health_router, prefix="/api/v1")
app.include_router(license_router)

# --- Commercial routers (license required) ---
if app.state.license_service.is_commercial:
    app.include_router(anomaly_router)
    app.include_router(audit_router)
    app.include_router(api_keys_router)
    app.include_router(opcua_servers_router)
    app.include_router(database_admin_router)
    app.include_router(distributions_router)
    app.include_router(fai_router)
    app.include_router(gage_bridges_router)
    app.include_router(ishikawa_router)
    app.include_router(msa_router)
    app.include_router(notifications_router)
    app.include_router(oidc_router)
    app.include_router(providers_router)
    app.include_router(retention_router)
    app.include_router(rule_presets_router)
    app.include_router(scheduled_reports_router)
    app.include_router(signatures_router)
    app.include_router(system_settings_router)
    app.include_router(push_router)
    app.include_router(erp_router)
    app.include_router(multivariate_router)
    app.include_router(predictions_router)
    app.include_router(ai_analysis_router)
    app.include_router(doe_router)
    logger.info("Commercial routers registered")
else:
    logger.info("Community edition — enterprise routers not registered")
```

**Note:** The enterprise router imports at the top of main.py (lines 16–58) can stay — Python imports are cheap and this keeps the diff minimal. The routers just won't be registered.

**Step 2: Verify Community mode**

Run: `cd backend && uvicorn cassini.main:app --reload`
Test: `curl http://localhost:8000/api/v1/signatures/workflows` → should return 404 (not registered)
Test: `curl http://localhost:8000/api/v1/characteristics/` → should return 401 (registered, needs auth)

**Step 3: Commit**

```bash
git add backend/src/cassini/main.py
git commit -m "feat(licensing): gate enterprise routers behind license check"
```

---

## Task 4: Conditional Middleware and Event Bus Subscribers

**Files:**
- Modify: `backend/src/cassini/main.py:181-302` (wrap enterprise services in license check)
- Modify: `backend/src/cassini/main.py:374-375` (conditional audit middleware)

**Step 1: Gate audit middleware**

Replace line 375 (`app.add_middleware(AuditMiddleware)`) with:

```python
# Audit trail middleware — commercial only
if app.state.license_service.is_commercial:
    app.add_middleware(AuditMiddleware)
```

**Problem:** `app.state.license_service` is set in `lifespan` which runs AFTER `add_middleware`. Middleware is added at import time, but lifespan runs on first request.

**Solution:** Make AuditMiddleware check license at runtime:

The `AuditMiddleware` already gets `AuditService` lazily from `app.state`. Add a license check in its `dispatch` method: if `app.state.license_service.is_commercial` is False, skip audit logging (pass through). This way the middleware is always registered but is a no-op in Community.

Alternative (simpler): Keep `app.add_middleware(AuditMiddleware)` as-is. In the `AuditMiddleware.dispatch`, add an early return:

```python
# At the top of AuditMiddleware.dispatch():
license_svc = getattr(request.app.state, "license_service", None)
if license_svc and not license_svc.is_commercial:
    return await call_next(request)
```

**Step 2: Gate enterprise services in lifespan**

Wrap the enterprise service initialization (lines 181–302) in a license check:

```python
    if license_service.is_commercial:
        # Initialize anomaly detector (subscribes to SampleProcessedEvent)
        from cassini.core.anomaly.detector import AnomalyDetector
        anomaly_detector = AnomalyDetector(event_bus, db.session)
        app.state.anomaly_detector = anomaly_detector
        logger.info("Anomaly detector initialized")

        # Initialize forecasting engine
        try:
            from cassini.core.forecasting import ForecastingEngine
            forecasting_engine = ForecastingEngine(event_bus, db.session)
            forecasting_engine.setup_subscriptions()
            app.state.forecasting_engine = forecasting_engine
            logger.info("Forecasting engine initialized")
        except ImportError:
            logger.info("Forecasting engine unavailable (statsmodels not installed)")

        # Initialize signature workflow engine
        from cassini.core.signature_engine import SignatureWorkflowEngine
        signature_engine = SignatureWorkflowEngine(db.session, event_bus)
        app.state.signature_engine = signature_engine
        logger.info("Signature workflow engine initialized")

        # Initialize notification dispatcher
        notification_dispatcher = NotificationDispatcher(event_bus, db.session)
        app.state.notification_dispatcher = notification_dispatcher
        logger.info("Notification dispatcher initialized")

        # Initialize Push notification service
        from cassini.core.push_service import PushNotificationService
        push_service = PushNotificationService(event_bus, db.session)
        app.state.push_service = push_service

        # Initialize ERP sync engine
        from cassini.core.erp.sync_engine import ERPSyncEngine
        erp_sync_engine = ERPSyncEngine(event_bus)
        await erp_sync_engine.start()
        app.state.erp_sync_engine = erp_sync_engine

        # Initialize ERP outbound publisher
        from cassini.core.erp.outbound_publisher import ERPOutboundPublisher
        erp_outbound_publisher = ERPOutboundPublisher(event_bus, db.session)
        app.state.erp_outbound_publisher = erp_outbound_publisher
        logger.info("ERP integration services initialized")

        # Initialize audit trail service
        audit_service = AuditService(db.session)
        app.state.audit_service = audit_service
        notification_dispatcher._audit_service = audit_service
        anomaly_detector._audit_service = audit_service

        # Wire audit event bus subscriptions
        # ... (existing _audit_* handlers and event_bus.subscribe calls)

        # Start retention purge engine
        purge_engine = PurgeEngine()
        await purge_engine.start()
        app.state.purge_engine = purge_engine

        # Start report scheduler
        report_scheduler = ReportScheduler()
        await report_scheduler.start()
        app.state.report_scheduler = report_scheduler

        logger.info("Commercial services initialized")
    else:
        logger.info("Community edition — enterprise services not started")
```

**Step 3: Fix shutdown to handle missing state**

In the shutdown section (lines 314–348), guard enterprise shutdowns:

```python
    # Shutdown — guard enterprise services
    if hasattr(app.state, 'report_scheduler'):
        await app.state.report_scheduler.stop()
    if hasattr(app.state, 'purge_engine'):
        await app.state.purge_engine.stop()
    if hasattr(app.state, 'erp_sync_engine'):
        await app.state.erp_sync_engine.stop()
```

**Step 4: Verify Community startup**

Run: `cd backend && uvicorn cassini.main:app --reload`
Expected log: `"Community edition — enterprise services not started"`
Verify: No anomaly detector, no signature engine, no ERP in logs

**Step 5: Commit**

```bash
git add backend/src/cassini/main.py
git commit -m "feat(licensing): gate enterprise services and middleware behind license"
```

---

## Task 5: Plant Limit Enforcement

**Files:**
- Modify: `backend/src/cassini/api/v1/plants.py:41-81` (add plant count check)

**Step 1: Add license dependency to create_plant**

Modify `backend/src/cassini/api/v1/plants.py`. Add import:

```python
from cassini.api.deps import get_license_service
from cassini.core.licensing import LicenseService
```

Modify `create_plant` function signature to add license dependency:

```python
@router.post("/", response_model=PlantResponse, status_code=status.HTTP_201_CREATED)
async def create_plant(
    data: PlantCreate,
    repo: PlantRepository = Depends(get_plant_repo),
    _user: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db_session),
    license_service: LicenseService = Depends(get_license_service),
) -> PlantResponse:
```

Add plant limit check before `repo.create()` (before line 54):

```python
    # Enforce plant limit from license
    existing_plants = await repo.get_all()
    if len(existing_plants) >= license_service.max_plants:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Plant limit reached ({license_service.max_plants}). Upgrade your license for more plants.",
        )
```

**Step 2: Verify**

Run app in Community mode (no license file). Create one plant — should succeed. Create a second — should return 403.

**Step 3: Commit**

```bash
git add backend/src/cassini/api/v1/plants.py
git commit -m "feat(licensing): enforce plant limit from license in create_plant"
```

---

## Task 6: Frontend License Store and Hook

**Files:**
- Create: `frontend/src/stores/licenseStore.ts`
- Create: `frontend/src/hooks/useLicense.ts`
- Create: `frontend/src/api/license.api.ts`

**Step 1: Create the API function**

```typescript
// frontend/src/api/license.api.ts
import { fetchApi } from '@/api/client'

export interface LicenseStatus {
  edition: 'community' | 'commercial'
  tier: string
  max_plants: number
  expires_at: string | null
  days_until_expiry: number | null
  is_expired: boolean | null
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  return fetchApi<LicenseStatus>('license/status')
}
```

**Step 2: Create the Zustand store**

```typescript
// frontend/src/stores/licenseStore.ts
import { create } from 'zustand'
import type { LicenseStatus } from '@/api/license.api'

interface LicenseState {
  edition: 'community' | 'commercial'
  tier: string
  maxPlants: number
  expiresAt: string | null
  daysUntilExpiry: number | null
  isExpired: boolean | null
  loaded: boolean
  setFromApi: (status: LicenseStatus) => void
}

export const useLicenseStore = create<LicenseState>()((set) => ({
  edition: 'community',
  tier: 'community',
  maxPlants: 1,
  expiresAt: null,
  daysUntilExpiry: null,
  isExpired: null,
  loaded: false,

  setFromApi: (status) =>
    set({
      edition: status.edition,
      tier: status.tier,
      maxPlants: status.max_plants,
      expiresAt: status.expires_at,
      daysUntilExpiry: status.days_until_expiry,
      isExpired: status.is_expired,
      loaded: true,
    }),
}))
```

**Step 3: Create the convenience hook**

```typescript
// frontend/src/hooks/useLicense.ts
import { useEffect } from 'react'
import { useLicenseStore } from '@/stores/licenseStore'
import { getLicenseStatus } from '@/api/license.api'

export function useLicense() {
  const store = useLicenseStore()

  useEffect(() => {
    if (!store.loaded) {
      getLicenseStatus()
        .then((status) => store.setFromApi(status))
        .catch(() => {
          // On error, default to community (safe fallback)
        })
    }
  }, [store.loaded])

  return {
    isCommercial: store.edition === 'commercial',
    edition: store.edition,
    tier: store.tier,
    maxPlants: store.maxPlants,
    expiresAt: store.expiresAt,
    daysUntilExpiry: store.daysUntilExpiry,
    isExpired: store.isExpired ?? false,
    loaded: store.loaded,
  }
}
```

**Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/api/license.api.ts frontend/src/stores/licenseStore.ts frontend/src/hooks/useLicense.ts
git commit -m "feat(licensing): add frontend license store, API, and useLicense hook"
```

---

## Task 7: FeatureGate Component and UpgradePage

**Files:**
- Create: `frontend/src/components/FeatureGate.tsx`
- Create: `frontend/src/components/UpgradeBanner.tsx`
- Create: `frontend/src/pages/UpgradePage.tsx`

**Step 1: Create FeatureGate component**

```tsx
// frontend/src/components/FeatureGate.tsx
import type { ReactNode } from 'react'
import { useLicense } from '@/hooks/useLicense'

interface FeatureGateProps {
  children: ReactNode
  fallback?: ReactNode
}

export function FeatureGate({ children, fallback = null }: FeatureGateProps) {
  const { isCommercial } = useLicense()

  if (!isCommercial) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
```

**Step 2: Create UpgradeBanner component**

```tsx
// frontend/src/components/UpgradeBanner.tsx
import { Lock } from 'lucide-react'

interface UpgradeBannerProps {
  feature: string
  description?: string
}

export function UpgradeBanner({ feature, description }: UpgradeBannerProps) {
  return (
    <div className="flex items-center gap-3 rounded border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <Lock className="h-5 w-5 shrink-0 text-zinc-400" />
      <div>
        <p className="font-medium text-zinc-700 dark:text-zinc-300">
          {feature} — Commercial Edition
        </p>
        {description && (
          <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Create UpgradePage**

```tsx
// frontend/src/pages/UpgradePage.tsx
import { Lock, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function UpgradePage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
          <Lock className="h-8 w-8 text-zinc-400" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Commercial Feature
        </h1>
        <p className="mb-6 text-zinc-500">
          This feature is available in Cassini Commercial Edition. Upgrade to
          unlock enterprise features including electronic signatures, audit
          trail, advanced analytics, and more.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          >
            Go Back
          </button>
          <a
            href="https://saturnis.io/cassini/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            View Pricing
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
```

**Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/components/FeatureGate.tsx frontend/src/components/UpgradeBanner.tsx frontend/src/pages/UpgradePage.tsx
git commit -m "feat(licensing): add FeatureGate, UpgradeBanner, and UpgradePage components"
```

---

## Task 8: Frontend Route Guards

**Files:**
- Modify: `frontend/src/App.tsx` (add license-gated routes)

**Step 1: Add CommercialRoute guard**

Add a new guard component in `App.tsx` (near the existing `RequireAuth` component around line 118):

```tsx
import { useLicense } from '@/hooks/useLicense'
import { UpgradePage } from '@/pages/UpgradePage'

function RequireCommercial({ children }: { children: ReactNode }) {
  const { isCommercial, loaded } = useLicense()
  if (!loaded) return null
  if (!isCommercial) return <UpgradePage />
  return <>{children}</>
}
```

**Step 2: Wrap enterprise routes**

Wrap enterprise page routes with `<RequireCommercial>`:

```tsx
{/* Enterprise pages — commercial only */}
<Route path="/msa" element={<RequireCommercial><ProtectedRoute requiredRole="engineer"><MSAPage /></ProtectedRoute></RequireCommercial>} />
<Route path="/fai" element={<RequireCommercial><ProtectedRoute requiredRole="engineer"><FAIPage /></ProtectedRoute></RequireCommercial>} />
<Route path="/doe" element={<RequireCommercial><ProtectedRoute requiredRole="engineer"><DOEPage /></ProtectedRoute></RequireCommercial>} />
<Route path="/analytics" element={<RequireCommercial><ProtectedRoute requiredRole="engineer"><AnalyticsPage /></ProtectedRoute></RequireCommercial>} />
<Route path="/connectivity" element={<RequireCommercial><ProtectedRoute requiredRole="engineer"><ConnectivityPage /></ProtectedRoute></RequireCommercial>} />
```

Enterprise settings routes (SSO, audit log, signatures, retention, ERP, AI, database, scheduled reports, API keys) should also be wrapped with `<RequireCommercial>`.

**Step 3: Verify TypeScript compiles and routes work**

Run: `cd frontend && npx tsc --noEmit`
Run: `cd frontend && npm run dev`
Navigate to `/msa` without license — should show UpgradePage

**Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(licensing): add route guards for enterprise pages"
```

---

## Task 9: Wrap Dashboard Enterprise Components

**Files:**
- Modify: `frontend/src/pages/OperatorDashboard.tsx` (wrap enterprise imports in FeatureGate)

**Step 1: Add FeatureGate imports**

Add to OperatorDashboard.tsx imports:

```tsx
import { FeatureGate } from '@/components/FeatureGate'
import { UpgradeBanner } from '@/components/UpgradeBanner'
```

**Step 2: Wrap enterprise components**

Find where `PendingApprovalsDashboard`, `CapabilityCard`, and `DiagnoseTab` are rendered. Wrap each in `<FeatureGate>`:

```tsx
<FeatureGate>
  <PendingApprovalsDashboard />
</FeatureGate>

<FeatureGate>
  <CapabilityCard characteristicId={selectedCharId} />
</FeatureGate>

<FeatureGate>
  <DiagnoseTab ... />
</FeatureGate>
```

**Note:** Do NOT wrap `<Explainable>` — Show Your Work stays in Community.

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add frontend/src/pages/OperatorDashboard.tsx
git commit -m "feat(licensing): gate enterprise dashboard components with FeatureGate"
```

---

## Task 10: Settings Page Adaptation

**Files:**
- Modify: `frontend/src/pages/SettingsView.tsx` (conditionally show enterprise tabs)

**Step 1: Add license check to tab filtering**

In `SettingsView.tsx`, the sidebar groups are defined with `minRole`. Add a `commercial` flag to `TabDef`:

```typescript
interface TabDef {
  key: string
  label: string
  icon: LucideIcon
  minRole?: Role
  commercial?: boolean  // Only show in commercial edition
}
```

Mark enterprise tabs with `commercial: true`:
- SSO, signatures, audit-log, api-keys, database, retention, reports (scheduled), ai, email-webhooks

**Step 2: Filter tabs by license**

In the rendering logic, filter tabs that have `commercial: true` when in Community edition:

```tsx
const { isCommercial } = useLicense()

// In the tab filtering:
const visibleTabs = group.tabs.filter(
  (tab) =>
    hasAccess(userRole, tab.minRole) &&
    (tab.commercial !== true || isCommercial)
)
```

**Step 3: Verify**

Run in Community mode — settings should only show: Account, Appearance, Notifications, Sites (core).

**Step 4: Commit**

```bash
git add frontend/src/pages/SettingsView.tsx
git commit -m "feat(licensing): hide enterprise settings tabs in community edition"
```

---

## Task 11: Navigation Adaptation

**Files:**
- Modify: `frontend/src/components/Layout.tsx` (or wherever sidebar nav items are defined)

**Step 1: Add license-aware nav filtering**

Find where sidebar navigation items are defined (likely in `Layout.tsx` or a `Sidebar` component). Add `commercial?: boolean` to nav item definitions and filter them with `useLicense()`.

Enterprise nav items to gate: MSA, FAI, DOE, Analytics, Connectivity.

Community nav items to keep: Dashboard, Data Entry, Configuration, Violations, Reports, Kiosk, Settings.

**Step 2: Verify**

Run in Community mode — sidebar should not show MSA, FAI, DOE, Analytics, Connectivity links.

**Step 3: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat(licensing): hide enterprise nav items in community edition"
```

---

## Task 12: License Expiry Banner

**Files:**
- Create: `frontend/src/components/LicenseExpiryBanner.tsx`
- Modify: `frontend/src/components/Layout.tsx` (render banner)

**Step 1: Create expiry banner**

```tsx
// frontend/src/components/LicenseExpiryBanner.tsx
import { AlertTriangle } from 'lucide-react'
import { useLicense } from '@/hooks/useLicense'

export function LicenseExpiryBanner() {
  const { isCommercial, daysUntilExpiry, isExpired } = useLicense()

  if (!isCommercial) return null
  if (!isExpired && (daysUntilExpiry === null || daysUntilExpiry > 30)) return null

  const message = isExpired
    ? 'Your license has expired. Enterprise features are read-only.'
    : `Your license expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}.`

  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
      <a
        href="https://saturnis.io/cassini/pricing"
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto text-amber-700 underline hover:text-amber-900 dark:text-amber-300"
      >
        Renew
      </a>
    </div>
  )
}
```

**Step 2: Render in Layout**

Add `<LicenseExpiryBanner />` at the top of the main layout, above the page content.

**Step 3: Commit**

```bash
git add frontend/src/components/LicenseExpiryBanner.tsx frontend/src/components/Layout.tsx
git commit -m "feat(licensing): add license expiry warning banner"
```

---

## Task 13: AGPL-3.0 License File

**Files:**
- Create: `LICENSE` (AGPL-3.0 full text)
- Create: `LICENSE-COMMERCIAL.md`

**Step 1: Add AGPL-3.0 license**

Download the standard AGPL-3.0 text and save as `LICENSE` in the project root.

**Step 2: Add commercial license notice**

```markdown
# Cassini Commercial License

Copyright (c) 2026 Saturnis

The Cassini software is dual-licensed:

## Open Source License (AGPL-3.0)

The source code is available under the GNU Affero General Public License v3.0.
See the `LICENSE` file for full terms.

## Commercial License

For organizations that want to use Cassini without the AGPL-3.0 obligations
(e.g., to make proprietary modifications), a commercial license is available.

The commercial license also unlocks enterprise features including:
- Electronic signatures and approval workflows
- Audit trail and compliance reporting
- SSO/OIDC integration
- ERP/LIMS connectors
- Advanced analytics (anomaly detection, DOE, multivariate SPC)
- And more

Contact: sales@saturnis.io
Website: https://saturnis.io/cassini/pricing
```

**Step 3: Commit**

```bash
git add LICENSE LICENSE-COMMERCIAL.md
git commit -m "chore: add AGPL-3.0 license and commercial license notice"
```

---

## Task 14: License Key Generation CLI (Internal Tool)

**Files:**
- Create: `tools/generate_license.py` (internal, not shipped in Docker image)

**Step 1: Write the CLI**

```python
#!/usr/bin/env python3
"""Internal tool to generate signed Cassini license keys.

NOT shipped with the application. Used by Saturnis to issue licenses.

Usage:
    python tools/generate_license.py \
        --customer "Acme Manufacturing" \
        --email "quality@acme.com" \
        --tier enterprise \
        --max-plants 20 \
        --days 365 \
        --private-key /path/to/private.pem \
        --output acme.license.key
"""

import argparse
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding, NoEncryption, PrivateFormat, PublicFormat,
    load_pem_private_key,
)


def generate_keypair(output_dir: Path) -> None:
    """Generate a new Ed25519 keypair for license signing."""
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    priv_path = output_dir / "license_private.pem"
    pub_path = output_dir / "license_public.pem"

    priv_path.write_bytes(
        private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    )
    pub_path.write_bytes(
        public_key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    )

    print(f"Private key: {priv_path}")
    print(f"Public key:  {pub_path}")
    print("\nIMPORTANT: Keep private key secret. Embed public key in licensing.py.")


def generate_license(args: argparse.Namespace) -> None:
    """Generate a signed license JWT."""
    private_pem = Path(args.private_key).read_bytes()
    private_key = load_pem_private_key(private_pem, password=None)

    now = datetime.now(timezone.utc)
    claims = {
        "sub": args.customer.lower().replace(" ", "-"),
        "customer_name": args.customer,
        "customer_email": args.email,
        "tier": args.tier,
        "max_plants": args.max_plants,
        "issued_at": now.isoformat(),
        "expires_at": (now + timedelta(days=args.days)).isoformat(),
    }

    token = jwt.encode(claims, private_key, algorithm="EdDSA")

    output = Path(args.output)
    output.write_text(token)
    print(f"License written to: {output}")
    print(f"Customer: {args.customer}")
    print(f"Tier: {args.tier}")
    print(f"Max plants: {args.max_plants}")
    print(f"Expires: {claims['expires_at']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Cassini License Key Generator")
    sub = parser.add_subparsers(dest="command")

    # generate-keypair
    kp = sub.add_parser("generate-keypair", help="Generate Ed25519 keypair")
    kp.add_argument("--output-dir", default=".", help="Directory for key files")

    # generate-license
    gl = sub.add_parser("generate-license", help="Generate signed license")
    gl.add_argument("--customer", required=True)
    gl.add_argument("--email", required=True)
    gl.add_argument("--tier", choices=["professional", "enterprise", "enterprise_plus"], required=True)
    gl.add_argument("--max-plants", type=int, default=5)
    gl.add_argument("--days", type=int, default=365)
    gl.add_argument("--private-key", required=True, help="Path to Ed25519 private key PEM")
    gl.add_argument("--output", default="license.key")

    args = parser.parse_args()

    if args.command == "generate-keypair":
        generate_keypair(Path(args.output_dir))
    elif args.command == "generate-license":
        generate_license(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
```

**Step 2: Add to .dockerignore**

Ensure `tools/` is in `.dockerignore` so the license generator and private keys never ship in the Docker image.

**Step 3: Commit**

```bash
git add tools/generate_license.py
git commit -m "chore: add internal license key generation CLI"
```

---

## Task 15: Final Verification

**Step 1: Type check frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 2: Type check backend**

Run: `cd backend && python -m pytest tests/unit/test_licensing.py -v`
Expected: All tests pass

**Step 3: Test Community mode**

1. Start backend without license file
2. Verify `GET /api/v1/license/status` returns `{"edition":"community",...}`
3. Verify enterprise endpoints return 404
4. Verify frontend hides enterprise nav/pages/components
5. Verify can create 1 plant, blocked from creating 2nd

**Step 4: Test Commercial mode**

1. Generate a test keypair: `python tools/generate_license.py generate-keypair`
2. Embed public key in `licensing.py`
3. Generate a license: `python tools/generate_license.py generate-license --customer Test --email test@test.com --tier enterprise --max-plants 20 --private-key license_private.pem`
4. Set `CASSINI_LICENSE_FILE=license.key` and restart backend
5. Verify `GET /api/v1/license/status` returns `{"edition":"commercial",...}`
6. Verify enterprise endpoints return normally
7. Verify frontend shows all features

**Step 5: Final commit**

```bash
git commit -m "feat(licensing): open-core feature gating — Community vs Commercial editions"
```
