# Open-Core Phase 1: Extension Points Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add extension point infrastructure to the Cassini core so a commercial package can register routes, sidebar items, settings panels, and dashboard widgets — without changing any current behavior (empty registries = identical app).

**Architecture:** Create a frontend `extensionRegistry` module that holds arrays of routes/sidebar/widgets/settings. Core components consume those arrays (empty by default). Backend gets a single `try/import` hook. No commercial package exists yet — this is purely the "socket" side.

**Tech Stack:** React 19, TypeScript 5.9, FastAPI, Python 3.11

**Key insight from codebase exploration:** Routes live in `App.tsx` (not a separate AppRouter). Sidebar uses `NavItem` interface with `commercial?` flag. Settings uses `SIDEBAR_GROUPS` array. Dashboard is tightly coupled to characteristic selection — widget extension point is deferred to Phase 3 (YAGNI).

---

### Task 1: Create the Extension Registry Module

**Files:**
- Create: `frontend/src/lib/extensionRegistry.ts`

**Step 1: Create the registry file**

```typescript
// frontend/src/lib/extensionRegistry.ts
import type { ComponentType, LazyExoticComponent } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Role } from '@/stores/authStore'

export interface ExtensionRoute {
  path: string
  component: LazyExoticComponent<ComponentType>
  label: string
  requiredRole?: Role
}

export interface ExtensionSidebarItem {
  path: string
  labelKey: string
  icon: React.ReactNode
  requiredRole?: Role
  section: 'studies' | 'system'
  order?: number
}

export interface ExtensionSettingsTab {
  to: string
  labelKey: string
  icon: LucideIcon
  component: LazyExoticComponent<ComponentType>
  group: string
  minRole?: Role
}

interface ExtensionRegistry {
  routes: ExtensionRoute[]
  sidebarItems: ExtensionSidebarItem[]
  settingsTabs: ExtensionSettingsTab[]
}

const registry: ExtensionRegistry = {
  routes: [],
  sidebarItems: [],
  settingsTabs: [],
}

export function registerExtension(ext: Partial<ExtensionRegistry>): void {
  if (ext.routes) registry.routes.push(...ext.routes)
  if (ext.sidebarItems) registry.sidebarItems.push(...ext.sidebarItems)
  if (ext.settingsTabs) registry.settingsTabs.push(...ext.settingsTabs)
}

export function getRegistry(): Readonly<ExtensionRegistry> {
  return registry
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (no errors from new file)

**Step 3: Commit**

```bash
git add frontend/src/lib/extensionRegistry.ts
git commit -m "feat: add extension registry module for open-core plugin architecture"
```

---

### Task 2: Add Backend Extension Hook

**Files:**
- Modify: `backend/src/cassini/main.py:401` (after commercial router block)

**Step 1: Add the try/import hook after the commercial router block**

After line 401 (`logger.info("Community edition — enterprise routers not registered")`), before the dev tools block (line 403), insert:

```python
# Extension hook — commercial package registers additional routers/services
try:
    from cassini_enterprise import initialize as init_enterprise  # type: ignore[import-not-found]
    init_enterprise(app, _license_svc)
    logger.info("Commercial extension package loaded")
except ImportError:
    pass  # Community edition — no extension package
```

**Step 2: Verify backend starts without cassini_enterprise installed**

Run: `cd backend && python -c "from cassini.main import app; print('OK')"`
Expected: Prints "OK" (ImportError is silently caught)

**Step 3: Commit**

```bash
git add backend/src/cassini/main.py
git commit -m "feat: add backend extension hook for commercial package"
```

---

### Task 3: Add Frontend Extension Hook in main.tsx

**Files:**
- Modify: `frontend/src/main.tsx:39-45`

**Step 1: Wrap the mount in an async IIFE and add extension import**

Replace lines 41-45 with:

```typescript
// Extension hook — load commercial package if available
;(async () => {
  try {
    await import('@saturnis/cassini-enterprise')
  } catch {
    // Community edition — no commercial extension
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})()
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — the dynamic import will fail at runtime (caught), not at compile time. Vite build may warn about unresolved module but should not error since it's in a try/catch.

Run: `cd frontend && npm run build`
Expected: PASS (build succeeds, may log a warning about unresolved `@saturnis/cassini-enterprise`)

**Step 3: Commit**

```bash
git add frontend/src/main.tsx
git commit -m "feat: add frontend extension hook for commercial package"
```

---

### Task 4: Consume Extension Routes in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Import the registry**

Add import near the top of App.tsx (after existing imports, around line 60):

```typescript
import { getRegistry } from '@/lib/extensionRegistry'
```

**Step 2: Render extension routes inside the main layout**

Inside the `App` function component, before the `return` statement, add:

```typescript
const extensionRoutes = getRegistry().routes
```

Then inside the `<Routes>` tree, after the last route inside the main layout `<Route path="/">` block (after the settings `</Route>` closes, before the admin routes — find the right spot after all existing authenticated routes), add:

```tsx
{/* Extension routes — registered by commercial package */}
{extensionRoutes.map((ext) => (
  <Route
    key={ext.path}
    path={ext.path}
    element={
      ext.requiredRole ? (
        <ProtectedRoute requiredRole={ext.requiredRole}>
          <ErrorBoundary>
            <ext.component />
          </ErrorBoundary>
        </ProtectedRoute>
      ) : (
        <ErrorBoundary>
          <ext.component />
        </ErrorBoundary>
      )
    }
  />
))}
```

**Step 3: Verify TypeScript compiles and build succeeds**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

Run: `cd frontend && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: consume extension routes in App.tsx"
```

---

### Task 5: Consume Extension Sidebar Items in Sidebar.tsx

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

**Step 1: Import the registry**

Add import near the top:

```typescript
import { getRegistry } from '@/lib/extensionRegistry'
```

**Step 2: Get extension items and filter them**

Inside the `Sidebar` component, after the existing nav item arrays (after line 220 — after `adminNavItems`), add:

```typescript
// Extension sidebar items — registered by commercial package
const extensionStudyItems = getRegistry()
  .sidebarItems.filter((item) => item.section === 'studies')
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
const extensionSystemItems = getRegistry()
  .sidebarItems.filter((item) => item.section === 'system')
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
```

**Step 3: Filter extension items with the same role/license logic**

After the existing `visibleAdminItems` filter (after line 245), add:

```typescript
const visibleExtStudyItems = extensionStudyItems.filter(
  (item) =>
    (!item.requiredRole || canAccessView(role, item.path)) &&
    isCommercial,
)
const visibleExtSystemItems = extensionSystemItems.filter(
  (item) =>
    (!item.requiredRole || canAccessView(role, item.path)) &&
    isCommercial,
)
```

**Step 4: Render extension items in navContent**

In the `navContent` function:

- After the `visibleStudyItems` block (after line 303's `</>`), add:
```tsx
{visibleExtStudyItems.map((item) => renderNavItem(item, forMobile))}
```

- After the `visibleSystemItems` block (after line 311's `</>`), add:
```tsx
{visibleExtSystemItems.map((item) => renderNavItem(item, forMobile))}
```

Note: Extension items use the same `NavItem` interface shape (`path`, `labelKey`, `icon`, `requiredRole`) so `renderNavItem` works unchanged.

**Step 5: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: consume extension sidebar items in Sidebar.tsx"
```

---

### Task 6: Consume Extension Settings Tabs in SettingsView.tsx

**Files:**
- Modify: `frontend/src/pages/SettingsView.tsx`
- Modify: `frontend/src/App.tsx` (add extension settings routes)

**Step 1: Import the registry in SettingsView**

Add import near top:

```typescript
import { getRegistry } from '@/lib/extensionRegistry'
import { Suspense } from 'react'
```

**Step 2: Merge extension settings tabs into the SIDEBAR_GROUPS rendering**

In the `SettingsPage` component, after the existing `SIDEBAR_GROUPS.map(...)` rendering block but still inside the `<nav>` element, add a block that renders extension settings grouped by their `group` property:

```tsx
{/* Extension settings tabs — registered by commercial package */}
{(() => {
  const extTabs = getRegistry().settingsTabs.filter(
    (tab) =>
      (!tab.minRole || hasAccess(role, tab.minRole)) &&
      isCommercial,
  )
  if (extTabs.length === 0) return null
  // Group by group name
  const groups = new Map<string, typeof extTabs>()
  for (const tab of extTabs) {
    const arr = groups.get(tab.group) ?? []
    arr.push(tab)
    groups.set(tab.group, arr)
  }
  return Array.from(groups.entries()).map(([groupName, tabs]) => (
    <div key={groupName} className="mb-5">
      <div className="text-muted-foreground mb-1.5 px-3 text-[10px] font-semibold tracking-wider uppercase">
        {groupName}
      </div>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`
          }
        >
          <tab.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{t(tab.labelKey)}</span>
        </NavLink>
      ))}
    </div>
  ))
})()}
```

**Step 3: Add extension settings routes in App.tsx**

In `App.tsx`, inside the settings `<Route path="settings" ...>` block (where all settings sub-routes are), add after the last existing settings route:

```tsx
{/* Extension settings routes */}
{getRegistry().settingsTabs.map((tab) => (
  <Route
    key={tab.to}
    path={tab.to}
    element={
      <Suspense fallback={null}>
        <tab.component />
      </Suspense>
    }
  />
))}
```

Also add `Suspense` to the React import at the top of App.tsx if not already imported:

```typescript
import { Component, Suspense, useState, type ErrorInfo, type ReactNode } from 'react'
```

**Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/pages/SettingsView.tsx frontend/src/App.tsx
git commit -m "feat: consume extension settings tabs in SettingsView and App routes"
```

---

### Task 7: Full Build Verification

**Files:** None (verification only)

**Step 1: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS with zero errors

**Step 2: Run frontend production build**

Run: `cd frontend && npm run build`
Expected: PASS. May warn about unresolved `@saturnis/cassini-enterprise` — this is expected. The dynamic import in `main.tsx` is inside a try/catch so it degrades gracefully.

**Step 3: Run backend tests**

Run: `cd backend && python -m pytest tests/ -x`
Expected: PASS (or pre-existing failures only — none caused by our changes)

**Step 4: Manual smoke test**

Run: `cd backend && uvicorn cassini.main:app --reload` (in one terminal)
Run: `cd frontend && npm run dev` (in another terminal)

Verify:
- App loads normally at http://localhost:5173
- Console shows no errors (the `@saturnis/cassini-enterprise` import fails silently)
- Sidebar renders identically to before
- All existing routes work
- Settings page renders identically

**Step 5: Final commit (if any lint/formatting fixes needed)**

```bash
git add -A
git commit -m "chore: open-core Phase 1 — extension points added to core"
```

---

## Summary

| Task | What | Files | Risk |
|------|------|-------|------|
| 1 | Extension registry module | Create `lib/extensionRegistry.ts` | None — new file |
| 2 | Backend extension hook | Modify `main.py` | Low — try/except ImportError |
| 3 | Frontend extension hook | Modify `main.tsx` | Low — async IIFE + try/catch |
| 4 | Consume extension routes | Modify `App.tsx` | Low — empty array = no routes |
| 5 | Consume sidebar items | Modify `Sidebar.tsx` | Low — empty array = no items |
| 6 | Consume settings tabs | Modify `SettingsView.tsx` + `App.tsx` | Low — empty array = no tabs |
| 7 | Full verification | None | Catch-all validation |

**What is NOT in Phase 1 (deferred):**
- Dashboard widget extension point — `OperatorDashboard.tsx` is tightly coupled to characteristic selection. Widget registration adds complexity with no consumer. Defer to Phase 3 when the commercial package actually needs it.
- Vite alias for `@saturnis/cassini-enterprise` — not needed until Phase 2 (commercial repo scaffold). The dynamic import in `main.tsx` fails gracefully without it.
- `@saturnis/cassini` alias — not needed until the commercial package imports from core.
- Offline activation exchange (Ignition-style) — v1 uses simple signed JWT keys (paste and go, no phone-home). Activation file exchange with machine binding and seat management planned for v1.x once the saturnis.io customer portal exists. See D-003 for full rationale.
