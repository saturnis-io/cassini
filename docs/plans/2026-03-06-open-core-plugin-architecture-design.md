# Open-Core Plugin Architecture Design

**Date**: 2026-03-06
**Status**: Approved
**Goal**: Split Cassini into an open-source core and a closed-source commercial extension package to protect revenue-generating features while enabling community adoption.

---

## 1. Business Model

| | Open-Source Core | Commercial Package |
|---|---|---|
| **Repo** | `SPC-client` (public GitHub) | `cassini-enterprise` (private repo) |
| **Backend** | `cassini` pip package | `cassini-enterprise` pip package |
| **Frontend** | `@saturnis/cassini` npm package | `@saturnis/cassini-enterprise` npm package |
| **DB schema** | All tables (including MSA, FAI, etc.) | No migrations — uses core tables |
| **License** | None required | Ed25519 JWT (existing `LicenseService`) |
| **Distribution** | Public GitHub / PyPI / npm | TBD (private registry, direct download, or Docker) |

The commercial package is designed to support multiple tiers internally (e.g., Professional vs Enterprise) via the existing `tier` claim in the license JWT. Initially, there are two effective editions: Community (no package) and Commercial (package installed + valid license). Granular tier gating can be added later without architectural changes.

---

## 2. Feature Split

### Core (open-source)

- Full SPC engine (control charts, capability analysis, Nelson rules, short-run)
- Single plant with ISA-95 hierarchy, characteristics, samples
- Manual data entry + single MQTT or OPC-UA data source connection
- Dashboard with violation tracking and annotations
- Show Your Work (explain API)
- Basic user management and per-plant roles
- Audit trail
- SQLite database support

### Commercial (closed-source)

- Multi-plant support (2+ plants)
- Cross-plant dashboards and comparisons (future)
- MSA / Gage R&R
- FAI (First Article Inspection)
- Anomaly detection (ML-based)
- Scheduled and automated reporting
- Electronic signatures (21 CFR Part 11)
- Data retention policies
- Multiple simultaneous data source connections
- Enterprise database support (PostgreSQL, MSSQL, MySQL)
- SSO / LDAP integration (future)

---

## 3. Architecture

### 3.1 Backend: Conditional Import Pattern

The core app attempts to import the commercial package at startup. If absent, the app runs as Community edition. If present, the package registers its features.

**Core side** — single hook in `cassini/main.py`:

```python
# After app creation and middleware setup
try:
    from cassini_enterprise import initialize as init_enterprise
    init_enterprise(app, license_service)
    logger.info("Commercial extension loaded")
except ImportError:
    logger.info("Running as Community Edition (no commercial extension)")
```

**Commercial side** — `cassini_enterprise/__init__.py`:

```python
from fastapi import FastAPI
from cassini.core.licensing import LicenseService

def initialize(app: FastAPI, license_service: LicenseService) -> None:
    """Register all commercial features with the core app."""
    if not license_service.is_commercial:
        return  # License invalid or expired — silently degrade

    from .routers import mount_routers
    from .services import register_services
    from .tasks import register_background_tasks

    mount_routers(app)          # Mounts /api/v1/msa/*, /api/v1/fai/*, etc.
    register_services(app)      # Adds service instances to app.state
    register_background_tasks() # Scheduled reports, anomaly jobs
```

**What `mount_routers()` does:**

```python
def mount_routers(app: FastAPI) -> None:
    from .msa.router import router as msa_router
    from .fai.router import router as fai_router
    from .anomaly.router import router as anomaly_router
    from .signatures.router import router as signatures_router
    from .retention.router import router as retention_router
    from .reports.router import router as reports_router

    prefix = "/api/v1"
    app.include_router(msa_router, prefix=f"{prefix}/msa", tags=["msa"])
    app.include_router(fai_router, prefix=f"{prefix}/fai", tags=["fai"])
    # ... etc.
```

**Gating that stays in core:** The existing `license_service.is_commercial` check in the plant creation endpoint (`POST /plants`) remains in core. This is the only core router that needs license awareness — it enforces `max_plants`.

**Database models stay in core.** The commercial package imports models from `cassini.db.models` and uses them directly. No duplicate model definitions.

### 3.2 Frontend: Registry Pattern

The core defines an extension registry. The commercial package registers routes, sidebar items, dashboard widgets, and settings panels into it.

**Core side** — `src/lib/extensionRegistry.ts`:

```typescript
import type { ComponentType, LazyExoticComponent } from 'react'

export interface RouteDefinition {
  path: string
  component: LazyExoticComponent<ComponentType>
  label: string
  minRole?: 'operator' | 'supervisor' | 'engineer' | 'admin'
}

export interface SidebarItem {
  label: string
  icon: ComponentType
  path: string
  minRole?: 'operator' | 'supervisor' | 'engineer' | 'admin'
  section?: 'primary' | 'secondary'  // Where in the sidebar it appears
  order?: number
}

export interface DashboardWidget {
  id: string
  component: LazyExoticComponent<ComponentType>
  label: string
  minRole?: 'operator' | 'supervisor' | 'engineer' | 'admin'
  defaultVisible?: boolean
}

export interface SettingsPanel {
  id: string
  label: string
  component: LazyExoticComponent<ComponentType>
  minRole?: 'operator' | 'supervisor' | 'engineer' | 'admin'
}

interface ExtensionRegistry {
  routes: RouteDefinition[]
  sidebarItems: SidebarItem[]
  dashboardWidgets: DashboardWidget[]
  settingsPanels: SettingsPanel[]
}

const registry: ExtensionRegistry = {
  routes: [],
  sidebarItems: [],
  dashboardWidgets: [],
  settingsPanels: [],
}

export function registerExtension(ext: Partial<ExtensionRegistry>): void {
  if (ext.routes) registry.routes.push(...ext.routes)
  if (ext.sidebarItems) registry.sidebarItems.push(...ext.sidebarItems)
  if (ext.dashboardWidgets) registry.dashboardWidgets.push(...ext.dashboardWidgets)
  if (ext.settingsPanels) registry.settingsPanels.push(...ext.settingsPanels)
}

export function getRegistry(): Readonly<ExtensionRegistry> {
  return registry
}
```

**Commercial side** — `@saturnis/cassini-enterprise/index.ts`:

```typescript
import { registerExtension } from '@saturnis/cassini/lib/extensionRegistry'
import { lazy } from 'react'

registerExtension({
  routes: [
    {
      path: '/msa/*',
      component: lazy(() => import('./features/msa/routes')),
      label: 'MSA',
      minRole: 'engineer',
    },
    {
      path: '/fai/*',
      component: lazy(() => import('./features/fai/routes')),
      label: 'FAI',
      minRole: 'engineer',
    },
    // ... anomaly, signatures, retention, reports
  ],
  sidebarItems: [
    { label: 'MSA', icon: lazy(() => import('./icons/MsaIcon')), path: '/msa', minRole: 'engineer', section: 'primary' },
    { label: 'FAI', icon: lazy(() => import('./icons/FaiIcon')), path: '/fai', minRole: 'engineer', section: 'primary' },
    // ...
  ],
})
```

**Core consumes the registry in existing components:**

- `AppRouter.tsx` — merges `getRegistry().routes` into the `<Routes>` tree
- `Sidebar.tsx` — merges `getRegistry().sidebarItems` into the nav list
- `Dashboard.tsx` — renders `getRegistry().dashboardWidgets` as additional cards
- `SettingsPage.tsx` — renders `getRegistry().settingsPanels` as additional tabs

If no commercial package is installed, all registries are empty arrays — core renders exactly as it does today.

**Frontend initialization** — `src/main.tsx`:

```typescript
// After imports, before ReactDOM.createRoot
try {
  await import('@saturnis/cassini-enterprise')
  console.log('Commercial extension loaded')
} catch {
  // Community edition — no commercial features
}
```

### 3.3 Database Strategy

All SQLAlchemy models and Alembic migrations remain in the core repo. The commercial package imports and uses core models directly:

```python
# Inside cassini_enterprise/msa/service.py
from cassini.db.models.msa import MSAStudy, MSAMeasurement
from cassini.db.models.characteristic import Characteristic
```

This means:
- No separate migration chain to manage
- No schema drift between editions
- Unused tables in Community edition cost nothing
- The commercial value is in the **logic** (algorithms, workflows, UI), not the schema

### 3.4 License Enforcement

The existing `LicenseService` is the gatekeeper. Enforcement happens at two levels:

1. **Backend**: Commercial routers are only mounted if `license_service.is_commercial` is True. Even if someone reverse-engineers the commercial package, the routers won't activate without a valid signed license.

2. **Frontend**: The commercial package checks the `/api/v1/license` endpoint before registering extensions. If the backend reports Community edition, no routes or sidebar items are registered.

3. **Multi-plant cap**: Stays in core's `POST /plants` endpoint via existing `max_plants` check.

Future tier differentiation (Professional vs Enterprise) can be added by passing `license_service.tier` into `initialize()` and selectively registering features.

---

## 4. Repo Structure

### 4.1 Core Repo (`SPC-client`)

No structural change. Add two small files:

```
backend/src/cassini/main.py         # Add try/import for cassini_enterprise
frontend/src/lib/extensionRegistry.ts  # New file (~50 lines)
frontend/src/main.tsx               # Add try/import for commercial package
```

Modify three existing files to consume the registry:

```
frontend/src/components/Sidebar.tsx     # Merge getRegistry().sidebarItems
frontend/src/components/AppRouter.tsx   # Merge getRegistry().routes
frontend/src/pages/Dashboard.tsx        # Merge getRegistry().dashboardWidgets
```

### 4.2 Commercial Repo (`cassini-enterprise`)

```
cassini-enterprise/
  backend/
    pyproject.toml                   # pip package: cassini-enterprise
    src/cassini_enterprise/
      __init__.py                    # initialize(app, license_service)
      routers.py                     # mount_routers(app)
      services.py                    # register_services(app)
      tasks.py                       # register_background_tasks()
      msa/
        router.py                    # FastAPI router
        service.py                   # Business logic
        schemas.py                   # Pydantic schemas (request/response)
      fai/
        router.py
        service.py
        schemas.py
      anomaly/
        router.py
        service.py
        schemas.py
      signatures/
        router.py
        service.py
        schemas.py
      retention/
        router.py
        service.py
        schemas.py
      reports/
        router.py
        service.py
        schemas.py
  frontend/
    package.json                     # npm package: @saturnis/cassini-enterprise
    tsconfig.json
    src/
      index.ts                       # registerExtension() call
      features/
        msa/
          routes.tsx
          components/
          hooks/
        fai/
          routes.tsx
          components/
          hooks/
        anomaly/
          routes.tsx
          components/
          hooks/
        signatures/
          routes.tsx
          components/
          hooks/
        retention/
          routes.tsx
          components/
          hooks/
        reports/
          routes.tsx
          components/
          hooks/
      icons/
```

---

## 5. Local Development Setup

### 5.1 Prerequisites

You will work with two repos side by side:

```
~/Projects/
  SPC-client/              # Open-source core (existing)
  cassini-enterprise/      # Commercial extension (new private repo)
```

### 5.2 Creating the Commercial Repo

```bash
# Create the repo
mkdir -p ~/Projects/cassini-enterprise
cd ~/Projects/cassini-enterprise
git init

# Backend package
mkdir -p backend/src/cassini_enterprise
cat > backend/pyproject.toml << 'PYEOF'
[build-system]
requires = ["setuptools>=68.0", "wheel"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "cassini-enterprise"
version = "0.1.0"
description = "Commercial extensions for Cassini SPC"
requires-python = ">=3.11"
dependencies = [
    "cassini",  # Core package
]

[tool.setuptools.packages.find]
where = ["src"]
PYEOF

# Backend init with initialize() stub
cat > backend/src/cassini_enterprise/__init__.py << 'PYEOF'
"""Cassini Enterprise — commercial extension package."""

from fastapi import FastAPI
from cassini.core.licensing import LicenseService

import structlog

logger = structlog.get_logger(__name__)


def initialize(app: FastAPI, license_service: LicenseService) -> None:
    """Register all commercial features with the core app."""
    if not license_service.is_commercial:
        logger.info("License is not commercial — enterprise features disabled")
        return

    # TODO: Uncomment as features are extracted
    # from .routers import mount_routers
    # from .services import register_services
    # from .tasks import register_background_tasks
    #
    # mount_routers(app)
    # register_services(app)
    # register_background_tasks()

    logger.info("Enterprise features initialized", tier=license_service.tier)
PYEOF

# Frontend package
mkdir -p frontend/src
cat > frontend/package.json << 'JSONEOF'
{
  "name": "@saturnis/cassini-enterprise",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
JSONEOF

cat > frontend/src/index.ts << 'TSEOF'
// @saturnis/cassini-enterprise — commercial extension entry point
// import { registerExtension } from '@saturnis/cassini/lib/extensionRegistry'

// TODO: Register features as they are extracted
// registerExtension({
//   routes: [],
//   sidebarItems: [],
//   dashboardWidgets: [],
//   settingsPanels: [],
// })

console.log('[cassini-enterprise] Commercial extension loaded')
TSEOF

git add -A && git commit -m "chore: scaffold cassini-enterprise package"
```

### 5.3 Linking Packages for Local Development

**Backend** — install both packages in dev mode in the same virtualenv:

```bash
# From the core repo
cd ~/Projects/SPC-client/backend
pip install -e .

# From the commercial repo
cd ~/Projects/cassini-enterprise/backend
pip install -e .

# Verify: Python can now import both
python -c "import cassini; import cassini_enterprise; print('Both packages available')"
```

**Frontend** — use npm link (or workspace references):

```bash
# Option A: npm link
cd ~/Projects/cassini-enterprise/frontend
npm link

cd ~/Projects/SPC-client/frontend
npm link @saturnis/cassini-enterprise

# Option B: package.json path reference (simpler, no global link)
# In SPC-client/frontend/package.json, add:
#   "@saturnis/cassini-enterprise": "file:../../cassini-enterprise/frontend"
# Then run: npm install
```

**Vite config** — add an alias so the commercial package can import from core:

```typescript
// SPC-client/frontend/vite.config.ts — add to resolve.alias
{
  '@saturnis/cassini': path.resolve(__dirname, 'src'),
  '@saturnis/cassini-enterprise': path.resolve(__dirname, '../../cassini-enterprise/frontend/src'),
}
```

### 5.4 Adding Extension Points to Core

These are the minimal changes to the core repo:

**1. Backend hook** — `backend/src/cassini/main.py`:

```python
# After license_service is created and middleware is configured:
try:
    from cassini_enterprise import initialize as init_enterprise
    init_enterprise(app, license_service)
except ImportError:
    pass
```

**2. Frontend registry** — create `frontend/src/lib/extensionRegistry.ts` (see Section 3.2).

**3. Frontend hook** — `frontend/src/main.tsx`:

```typescript
// Before ReactDOM.createRoot():
try {
  await import('@saturnis/cassini-enterprise')
} catch {
  // Community edition
}
```

**4. Consume registries** — update `Sidebar.tsx`, `AppRouter.tsx`, `Dashboard.tsx` to merge items from `getRegistry()`.

### 5.5 Extracting a Feature (Step-by-Step Example: MSA)

This is the repeatable process for moving each feature from core to commercial.

**Step 1: Identify the files to move.**

```
Backend (move to cassini-enterprise/backend/src/cassini_enterprise/msa/):
  backend/src/cassini/api/v1/msa.py        → router.py
  backend/src/cassini/core/msa.py          → service.py (if exists)
  backend/src/cassini/api/schemas/msa.py   → schemas.py

Frontend (move to cassini-enterprise/frontend/src/features/msa/):
  frontend/src/pages/MSA*.tsx              → components/
  frontend/src/components/msa/             → components/
  frontend/src/api/msa.api.ts             → hooks/api.ts
  frontend/src/api/hooks/useMSA*.ts       → hooks/
```

**Step 2: Move backend router.**

```bash
# Copy the router to commercial package
cp backend/src/cassini/api/v1/msa.py \
   ~/Projects/cassini-enterprise/backend/src/cassini_enterprise/msa/router.py

# Update imports in the copied file:
# - Change `from cassini.db.models.msa import ...` (keep — models stay in core)
# - Change `from cassini.api.schemas.msa import ...` to local import
# - Change `from cassini.api.deps import ...` (keep — deps stay in core)
```

**Step 3: Register the router in commercial package.**

```python
# cassini_enterprise/routers.py
def mount_routers(app):
    from .msa.router import router as msa_router
    app.include_router(msa_router, prefix="/api/v1/msa", tags=["msa"])
```

**Step 4: Remove the router from core.**

```bash
# Delete the router file from core
rm backend/src/cassini/api/v1/msa.py

# Remove the router import/include from core's main.py or router registration
# (the include_router line for msa_router)
```

**Step 5: Move frontend components.**

```bash
# Copy components to commercial package
cp -r frontend/src/pages/MSA* \
   ~/Projects/cassini-enterprise/frontend/src/features/msa/components/
cp -r frontend/src/components/msa/ \
   ~/Projects/cassini-enterprise/frontend/src/features/msa/components/
cp frontend/src/api/msa.api.ts \
   ~/Projects/cassini-enterprise/frontend/src/features/msa/hooks/api.ts
```

**Step 6: Register in commercial frontend.**

```typescript
// cassini-enterprise/frontend/src/index.ts
import { registerExtension } from '@saturnis/cassini/lib/extensionRegistry'
import { lazy } from 'react'

registerExtension({
  routes: [
    {
      path: '/msa/*',
      component: lazy(() => import('./features/msa/routes')),
      label: 'MSA',
      minRole: 'engineer',
    },
  ],
  sidebarItems: [
    {
      label: 'MSA',
      icon: lazy(() => import('./features/msa/icons/MsaIcon')),
      path: '/msa',
      minRole: 'engineer',
      section: 'primary',
    },
  ],
})
```

**Step 7: Remove from core frontend.**

```bash
# Delete MSA pages, components, API hooks from core
rm -rf frontend/src/pages/MSA*
rm -rf frontend/src/components/msa/
rm frontend/src/api/msa.api.ts
rm frontend/src/api/hooks/useMSA*.ts

# Remove MSA route from core's AppRouter.tsx
# Remove MSA sidebar item from core's Sidebar.tsx
```

**Step 8: Verify.**

```bash
# Core builds without commercial package
cd ~/Projects/SPC-client/frontend && npm run build
cd ~/Projects/SPC-client/backend && python -m pytest tests/ -x

# Core + commercial builds together
pip install -e ~/Projects/cassini-enterprise/backend
cd ~/Projects/SPC-client/frontend && npm run build
cd ~/Projects/SPC-client/backend && python -m pytest tests/ -x
```

Repeat Steps 1-8 for each feature: FAI, anomaly, signatures, retention, reports.

---

## 6. Migration Strategy

### Phase 1: Add Extension Points (~1 day)

1. Create `frontend/src/lib/extensionRegistry.ts`
2. Add `try/import cassini_enterprise` to `backend/src/cassini/main.py`
3. Add `try/import @saturnis/cassini-enterprise` to `frontend/src/main.tsx`
4. Update `Sidebar.tsx`, `AppRouter.tsx`, `Dashboard.tsx` to consume registries
5. Verify: core builds and runs identically (registries are empty)

### Phase 2: Scaffold Commercial Package (~1 day)

1. Create `cassini-enterprise` private repo (see Section 5.2)
2. Set up pip package and npm package structure
3. Implement `initialize()` stub
4. Link packages locally (see Section 5.3)
5. Verify: core + commercial package loads without errors

### Phase 3: Extract Features (1-2 days per feature)

Extract in this order (least to most entangled):

1. **MSA** — Most self-contained, few cross-feature dependencies
2. **FAI** — Self-contained workflow
3. **Anomaly detection** — Self-contained ML pipeline
4. **Scheduled reports** — Depends on core data but isolated logic
5. **Data retention** — Touches core models but logic is isolated
6. **Electronic signatures** — Most entangled (touches approval workflows)

For each: follow the step-by-step process in Section 5.5.

### Phase 4: Enforce Boundary (~1 day)

1. Remove all commercial feature code from core repo
2. Run `npm run build` and `pytest` on core alone — must pass
3. Run full build with commercial package linked — must pass
4. Update CI to test both configurations

---

## 7. What Does NOT Change

- **Database schema** — all models and migrations stay in core
- **LicenseService** — stays in core, unchanged
- **Auth/roles system** — stays in core
- **API client (`fetchApi`)** — stays in core
- **Shared UI components** — stay in core
- **SPC engine** — stays in core
- **Show Your Work** — stays in core
- **Audit trail** — stays in core

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Commercial package breaks when core updates | CI pipeline tests core alone AND core+commercial. Commercial package pins core version range. |
| Someone reverse-engineers the commercial package | License validation is server-side (Ed25519). Even with the package, routers won't mount without a valid license. Obfuscation is not the protection — cryptographic signing is. |
| Feature extraction introduces regressions | Extract one feature at a time. Full test suite after each extraction. |
| Import cycles between core and commercial | Commercial imports from core only. Core never imports from commercial (except the single `try/import` at startup). |
| Frontend registry becomes a leaky abstraction | Registry types are minimal and stable (routes, sidebar items, widgets). If a new extension point is needed, add it to the registry interface. |

---

## 9. Future Considerations

- **Tier-gated features within commercial**: Pass `license_service.tier` into `initialize()`. Register different feature subsets per tier.
- **Distribution**: Private npm registry (GitHub Packages), private PyPI (Artifactory), or bundled Docker image. Decision deferred.
- **Plugin marketplace**: The registry pattern could support third-party plugins. Not needed now but the architecture doesn't prevent it.
- **Monorepo tooling**: If managing two repos becomes painful, consider a monorepo with build-time exclusion (e.g., Nx or Turborepo with package boundaries). The plugin architecture works either way.
