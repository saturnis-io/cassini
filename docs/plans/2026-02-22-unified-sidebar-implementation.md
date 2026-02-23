# Unified Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Combine the global navigation sidebar and the characteristics hierarchy tree into a single unified left panel with dual-collapsible sections and drag-resizable width.

**Architecture:** Sidebar.tsx gets two independently collapsible sections: "Navigation" (page links) and "Characteristics" (status tabs + hierarchy tree). HierarchyTodoList gains an `embedded` prop that strips the card wrapper for sidebar use and adds navigate-to-dashboard on characteristic click. OperatorDashboard loses its separate hierarchy panel — the chart area fills the full content width. New UI state (section collapse, sidebar width) is persisted in uiStore.

**Tech Stack:** React 19, TypeScript 5.9, Zustand v5 (persisted), Tailwind 4, Lucide icons

---

## Task 1: Add unified sidebar state to uiStore

**Files:**
- Modify: `frontend/src/stores/uiStore.ts`

**Step 1: Add state interface fields**

Add these fields to the `UIState` interface (after the existing `setMobileSidebarOpen` / `toggleMobileSidebar` block):

```typescript
  // Sidebar section collapse states
  navSectionCollapsed: boolean
  setNavSectionCollapsed: (collapsed: boolean) => void
  characteristicsPanelOpen: boolean
  setCharacteristicsPanelOpen: (open: boolean) => void

  // Sidebar resizable width (px)
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
```

**Step 2: Add implementation**

Add to the `create` store body, after the `toggleMobileSidebar` implementation:

```typescript
      // Nav section collapse — default expanded
      navSectionCollapsed: false,
      setNavSectionCollapsed: (collapsed) => set({ navSectionCollapsed: collapsed }),

      // Characteristics panel — default expanded
      characteristicsPanelOpen: true,
      setCharacteristicsPanelOpen: (open) => set({ characteristicsPanelOpen: open }),

      // Sidebar width — clamped to [200, 450]
      sidebarWidth: 260,
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(450, width)) }),
```

**Step 3: Add to persist partialize**

Add to the `partialize` function return object:

```typescript
        navSectionCollapsed: state.navSectionCollapsed,
        characteristicsPanelOpen: state.characteristicsPanelOpen,
        sidebarWidth: state.sidebarWidth,
```

**Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/stores/uiStore.ts
git commit -m "feat(sidebar): add unified sidebar state to uiStore"
```

---

## Task 2: Make HierarchyTodoList sidebar-friendly

**Files:**
- Modify: `frontend/src/components/HierarchyTodoList.tsx`

The component currently renders a standalone card with header, status tabs, and tree. We add an `embedded` prop that strips the card chrome, compacts the layout, and navigates to `/dashboard` when a characteristic is selected from a non-dashboard page.

**Step 1: Add imports and update props**

Add to imports:

```typescript
import { useNavigate, useLocation } from 'react-router-dom'
```

Update the props interface:

```typescript
interface HierarchyTodoListProps {
  className?: string
  /** When true, renders without card wrapper for sidebar embedding */
  embedded?: boolean
}
```

Update function signature:

```typescript
export function HierarchyTodoList({ className, embedded }: HierarchyTodoListProps) {
```

**Step 2: Add navigation callback**

Inside the `HierarchyTodoList` function body, after the existing hooks, add:

```typescript
  const navigate = useNavigate()
  const location = useLocation()

  const handleCharacteristicSelect = useCallback(
    (charId: number) => {
      if (isMultiSelectMode) return // multi-select handles its own logic
      setSelectedId(charId)
      if (embedded && location.pathname !== '/dashboard' && location.pathname !== '/') {
        navigate('/dashboard')
      }
    },
    [embedded, isMultiSelectMode, location.pathname, navigate],
  )
```

Where `setSelectedId` is: add to the existing store selectors at the top of the function:

```typescript
  const setSelectedId = useDashboardStore((state) => state.setSelectedCharacteristicId)
```

Note: this selector is already used inside `TodoTreeNode` but not in the parent. Add it to the parent so the callback can use it.

**Step 3: Add `onCharacteristicSelect` prop to TodoTreeNode**

Update the `TodoTreeNodeProps` interface:

```typescript
interface TodoTreeNodeProps {
  node: HierarchyNode
  level: number
  statusFilter: StatusFilter
  expandedNodeIds: Set<number>
  toggleNodeExpanded: (id: number) => void
  onCharacteristicSelect?: (charId: number) => void
}
```

Update the `TodoTreeNode` function signature to destructure the new prop:

```typescript
function TodoTreeNode({
  node,
  level,
  statusFilter,
  expandedNodeIds,
  toggleNodeExpanded,
  onCharacteristicSelect,
}: TodoTreeNodeProps) {
```

In the characteristic click handler (the `onClick` on the characteristic `<div>`), replace:

```typescript
                  onClick={() => {
                    if (isMultiSelectMode) {
                      toggleCharacteristicSelection(char.id)
                    } else {
                      setSelectedId(char.id)
                    }
                  }}
```

With:

```typescript
                  onClick={() => {
                    if (isMultiSelectMode) {
                      toggleCharacteristicSelection(char.id)
                    } else if (onCharacteristicSelect) {
                      onCharacteristicSelect(char.id)
                    } else {
                      setSelectedId(char.id)
                    }
                  }}
```

Pass the prop through to recursive child nodes — in the `{node.children?.map}` block:

```typescript
            <TodoTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              statusFilter={statusFilter}
              expandedNodeIds={expandedNodeIds}
              toggleNodeExpanded={toggleNodeExpanded}
              onCharacteristicSelect={onCharacteristicSelect}
            />
```

**Step 4: Add embedded rendering path**

Before the existing main return statement (the one starting with `return ( <> <div className={cn('bg-card ...`), add the embedded rendering path:

```typescript
  if (embedded) {
    // Loading states for embedded mode
    if (!selectedPlant && !plantLoading) {
      return (
        <div className={cn('text-muted-foreground flex flex-1 items-center justify-center px-3 text-xs', className)}>
          Select a plant
        </div>
      )
    }
    if (isLoading) {
      return (
        <div className={cn('text-muted-foreground flex flex-1 items-center justify-center gap-2 px-3 text-xs', className)}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading...
        </div>
      )
    }

    return (
      <>
        <div className={cn('flex h-full flex-col', className)}>
          <div className="flex items-center gap-1.5 px-2 pb-1.5">
            <div className="min-w-0 flex-1">
              <StatusFilterTabs value={statusFilter} onChange={setStatusFilter} counts={statusCounts} />
            </div>
            <button
              onClick={() => setMultiSelectMode(!isMultiSelectMode)}
              className={cn(
                'flex flex-shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors',
                isMultiSelectMode
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground',
              )}
              title={isMultiSelectMode ? 'Exit multi-select' : 'Select for reporting'}
            >
              <ListChecks className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-1">
            <div className="space-y-0.5">
              {nodes?.map((node) => (
                <TodoTreeNode
                  key={node.id}
                  node={node}
                  level={0}
                  statusFilter={statusFilter}
                  expandedNodeIds={expandedNodeIds}
                  toggleNodeExpanded={toggleNodeExpanded}
                  onCharacteristicSelect={handleCharacteristicSelect}
                />
              ))}
            </div>
          </div>
        </div>
        {isMultiSelectMode && <SelectionToolbar />}
      </>
    )
  }
```

The original (non-embedded) return block stays unchanged, but update its `<TodoTreeNode>` calls to also pass `onCharacteristicSelect={undefined}` (or just leave them — the prop is optional and defaults to undefined).

**Step 5: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/components/HierarchyTodoList.tsx
git commit -m "feat(sidebar): make HierarchyTodoList sidebar-friendly with embedded mode"
```

---

## Task 3: Rewrite Sidebar.tsx for unified layout

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

This is the largest task. The sidebar gets dual-collapsible sections, embedded HierarchyTodoList, drag-resize, and updated widths (260/56).

**Step 1: Add new imports**

Add/update imports:

```typescript
import { useEffect, useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  FileText,
  Settings,
  ListTree,
  Network,
  Microscope,
  ClipboardCheck,
  Users,
  Wrench,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useViolationStats, useDevToolsStatus } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'
import { canAccessView, type Role } from '@/lib/roles'
import { HierarchyTodoList } from './HierarchyTodoList'
```

**Step 2: Add the resize hook**

Add this before the `Sidebar` function:

```typescript
/** Drag-resize the sidebar width (200–450px range) */
function useSidebarResize(isCollapsed: boolean) {
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isCollapsed) return
      e.preventDefault()
      const startX = e.clientX
      const startWidth = sidebarWidth

      const onMouseMove = (ev: MouseEvent) => {
        setSidebarWidth(startWidth + ev.clientX - startX)
      }
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [isCollapsed, sidebarWidth, setSidebarWidth],
  )

  return { sidebarWidth, handleMouseDown }
}
```

**Step 3: Update store destructuring in Sidebar function**

Replace the existing store line:

```typescript
  const { sidebarState, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } = useUIStore()
```

With:

```typescript
  const {
    sidebarState,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    navSectionCollapsed,
    setNavSectionCollapsed,
    characteristicsPanelOpen,
    setCharacteristicsPanelOpen,
  } = useUIStore()
  const { sidebarWidth, handleMouseDown: handleResizeMouseDown } = useSidebarResize(isCollapsed)
```

**Step 4: Rewrite the mobile sidebar overlay**

Replace the entire mobile sidebar `<aside>` content (lines 218–233) with:

```tsx
          <aside className="bg-card absolute inset-y-0 left-0 flex w-[280px] flex-col shadow-lg">
            {/* Close button header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">{t('navigation')}</span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                aria-label={t('closeNavigation')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation links */}
            <nav className="space-y-1 overflow-y-auto border-b p-2">{navContent(true)}</nav>

            {/* Characteristics tree */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="text-muted-foreground px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider">
                Characteristics
              </div>
              <HierarchyTodoList embedded className="min-h-0 flex-1" />
            </div>
          </aside>
```

**Step 5: Rewrite the desktop sidebar**

Replace the entire desktop `<aside>` block (the `{!isHidden && ( <aside ...` through its closing `</aside>)}`) with:

```tsx
      {/* Desktop sidebar */}
      {!isHidden && (
        <aside
          className={cn(
            'bg-card relative hidden h-full flex-col border-r transition-[width] duration-150 ease-in-out md:flex',
            className,
          )}
          style={{ width: isCollapsed ? 56 : sidebarWidth }}
        >
          {/* ── Navigation section header ── */}
          {!isCollapsed && (
            <button
              onClick={() => setNavSectionCollapsed(!navSectionCollapsed)}
              className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider"
            >
              <span>Navigation</span>
              {navSectionCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          )}

          {/* ── Navigation items ── */}
          {isCollapsed ? (
            <nav className="space-y-0.5 overflow-y-auto px-1 py-2">{navContent(false)}</nav>
          ) : !navSectionCollapsed ? (
            <nav className="space-y-0.5 overflow-y-auto px-2 pb-1">{navContent(false)}</nav>
          ) : null}

          {/* ── Divider ── */}
          <div className="border-border mx-2 my-1 border-t" />

          {/* ── Characteristics section ── */}
          {isCollapsed ? (
            /* Collapsed: tree icon that expands sidebar */
            <div className="flex flex-col items-center py-2">
              <button
                onClick={toggleSidebar}
                className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-10 w-10 items-center justify-center rounded-lg transition-colors"
                title="Show characteristics"
              >
                <ListTree className="h-5 w-5" />
              </button>
            </div>
          ) : (
            /* Expanded: collapsible characteristics panel */
            <div className="flex min-h-0 flex-1 flex-col">
              <button
                onClick={() => setCharacteristicsPanelOpen(!characteristicsPanelOpen)}
                className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider"
              >
                <span>Characteristics</span>
                {characteristicsPanelOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>

              {characteristicsPanelOpen && (
                <div className="min-h-0 flex-1">
                  <HierarchyTodoList embedded className="h-full" />
                </div>
              )}
            </div>
          )}

          {/* ── Collapse toggle tab (protruding from sidebar edge) ── */}
          <button
            onClick={toggleSidebar}
            className={cn(
              'absolute top-20 right-0 z-10 translate-x-full',
              'flex h-12 w-6 items-center justify-center rounded-r-md',
              'bg-card border-border border border-l-0 shadow-sm',
              'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            )}
            title={isCollapsed ? t('expandSidebar') : t('collapseSidebar')}
          >
            {isCollapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>

          {/* ── Resize handle (right edge drag strip) ── */}
          {!isCollapsed && (
            <div
              onMouseDown={handleResizeMouseDown}
              className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize transition-colors hover:bg-primary/20"
            />
          )}
        </aside>
      )}
```

**Step 6: Update collapsed icon size**

In the `renderNavItem` function, change the collapsed styling from:

```typescript
            !forMobile && isCollapsed && 'justify-center px-2',
```

To (the px-2 is fine for 56px — icons are 20px + 8px padding each side = 36px, fits in 56px):

```typescript
            !forMobile && isCollapsed && 'justify-center px-2',
```

No change needed — the existing collapsed styling works at 56px.

**Step 7: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat(sidebar): unified layout with nav + characteristics sections and resize handle"
```

---

## Task 4: Remove hierarchy panel from OperatorDashboard

**Files:**
- Modify: `frontend/src/pages/OperatorDashboard.tsx`

**Step 1: Remove HierarchyTodoList import**

Delete this line:

```typescript
import { HierarchyTodoList } from '@/components/HierarchyTodoList'
```

**Step 2: Remove the left panel and simplify layout**

Find the main content area (around line 376):

```tsx
      {/* ── Main Content Area ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 md:flex-row">
        {/* Left Panel — Hierarchy / Characteristics (Watchlist-style) */}
        <div className="h-48 flex-shrink-0 md:h-auto md:w-72">
          <HierarchyTodoList className="h-full" />
        </div>

        {/* Center + Right — Chart area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
```

Replace with:

```tsx
      {/* ── Main Content Area (hierarchy now in sidebar) ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
```

Also remove the extra closing `</div>` that was wrapping the old two-panel flex row. The old structure was:

```
<div flex-row>          ← REMOVE (the outer wrapper for side-by-side)
  <div w-72>            ← REMOVE (left panel)
    <HierarchyTodoList> ← REMOVE
  </div>                ← REMOVE
  <div flex-1>          ← KEEP (but becomes the main content div above)
    ...chart content...
  </div>
</div>                  ← REMOVE (closing the outer flex-row)
```

After the change there should be one less nesting level. The chart content `<div>` with `flex min-h-0 min-w-0 flex-1 flex-col gap-2` becomes the direct child, and since we're removing the wrapper, simplify its classes — drop `min-w-0` (no longer needed without sibling):

The final structure should be:

```tsx
      <div className="flex min-h-0 flex-1 flex-col gap-2">
          {selectedId ? (
            <>
              {/* Toolbar, Range Slider, Charts, Bottom Drawer */}
              ...
            </>
          ) : (
            <div className="...">Select a characteristic</div>
          )}
      </div>
```

**Step 3: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/pages/OperatorDashboard.tsx
git commit -m "feat(dashboard): remove hierarchy panel, chart gets full width"
```

---

## Task 5: Visual QA

Run: `cd frontend && npm run dev`

Open the app in a browser and verify:

**Expanded sidebar (260px default):**
- [ ] "NAVIGATION" section header visible with collapse chevron
- [ ] All nav links render with icons and labels
- [ ] Clicking "NAVIGATION" header collapses nav items to a single header line
- [ ] "CHARACTERISTICS" section header visible below divider
- [ ] Status filter tabs (ALL/OOC/DUE/OK) render with counts
- [ ] Multi-select button visible next to status tabs
- [ ] Hierarchy tree renders correctly with expand/collapse, status badges
- [ ] Clicking a characteristic on the dashboard selects it and updates the chart
- [ ] Clicking a characteristic on a non-dashboard page navigates to /dashboard
- [ ] Tree area scrolls independently when content overflows
- [ ] Collapsing Navigation gives Characteristics significantly more vertical space

**Collapsed sidebar (56px):**
- [ ] Nav items show icons only, tooltips on hover
- [ ] ListTree icon appears below divider
- [ ] Clicking ListTree icon expands the sidebar
- [ ] Active route highlighting works
- [ ] Violation badge dot indicator shows

**Resize handle:**
- [ ] Cursor changes to `col-resize` when hovering the sidebar's right edge
- [ ] Dragging resizes sidebar between 200px and 450px
- [ ] Width persists across page refresh (check localStorage `openspc-ui`)
- [ ] Main content area reflows dynamically (chart fills remaining space)

**Mobile (< 768px viewport):**
- [ ] Hamburger menu opens overlay sidebar
- [ ] Overlay includes Navigation links AND Characteristics tree
- [ ] Clicking a nav link closes the overlay
- [ ] Clicking a characteristic closes overlay and navigates to dashboard

**Dashboard page:**
- [ ] No left hierarchy panel — chart area uses full width
- [ ] Bottom drawer (Capability + Annotations tabs) still works
- [ ] Stats ticker displays correctly at top
- [ ] Range slider, comparison mode, annotation dialog all functional
