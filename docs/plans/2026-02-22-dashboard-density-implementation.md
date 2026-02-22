# Dashboard Density Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Maximize OperatorDashboard chart space by moving CapabilityCard and AnnotationListPanel into a collapsible bottom drawer, enhancing the vertical histogram with capability overlays, and trimming the stats ticker.

**Architecture:** Three independent tracks — (1) Zustand store additions + BottomDrawer component, (2) OperatorDashboard rewiring + stats ticker trim, (3) histogram capability overlays. Track 2 depends on Track 1. Track 3 is independent.

**Tech Stack:** React 19, TypeScript, Zustand v5, Tailwind 4, ECharts 6

**Design doc:** `docs/plans/2026-02-22-dashboard-density-redesign.md`

---

### Task 1: Add drawer state to dashboardStore

**Files:**
- Modify: `frontend/src/stores/dashboardStore.ts`

**Step 1: Add drawer state to the DashboardState interface**

Add these fields after the `showAnomalies` block (around line 105):

```typescript
// Bottom drawer state
drawerOpen: boolean
setDrawerOpen: (open: boolean) => void
drawerTab: 'capability' | 'annotations'
setDrawerTab: (tab: 'capability' | 'annotations') => void
```

**Step 2: Add drawer state to the store implementation**

Add after the `setShowAnomalies` implementation (around line 251):

```typescript
// Bottom drawer
drawerOpen: false,
setDrawerOpen: (open) => set({ drawerOpen: open }),
drawerTab: 'capability' as 'capability' | 'annotations',
setDrawerTab: (tab) => set({ drawerTab: tab }),
```

**Step 3: Add drawer state to the persist partialize**

Add `drawerOpen` and `drawerTab` to the `partialize` return object (around line 265):

```typescript
drawerOpen: state.drawerOpen,
drawerTab: state.drawerTab,
```

**Step 4: Verify the build compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add frontend/src/stores/dashboardStore.ts
git commit -m "feat: add bottom drawer state to dashboardStore"
```

---

### Task 2: Create BottomDrawer component

**Files:**
- Create: `frontend/src/components/BottomDrawer.tsx`

**Step 1: Create the BottomDrawer component**

```tsx
import { useEffect, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'

export interface DrawerTab {
  id: string
  label: string
  badge?: React.ReactNode
  content: React.ReactNode
}

interface BottomDrawerProps {
  tabs: DrawerTab[]
  className?: string
}

const DRAWER_HEIGHT = 240

export function BottomDrawer({ tabs, className }: BottomDrawerProps) {
  const drawerOpen = useDashboardStore((s) => s.drawerOpen)
  const setDrawerOpen = useDashboardStore((s) => s.setDrawerOpen)
  const drawerTab = useDashboardStore((s) => s.drawerTab)
  const setDrawerTab = useDashboardStore((s) => s.setDrawerTab)

  const activeTab = tabs.find((t) => t.id === drawerTab) ?? tabs[0]

  const handleTabClick = useCallback(
    (tabId: string) => {
      if (drawerOpen && drawerTab === tabId) {
        setDrawerOpen(false)
      } else {
        setDrawerTab(tabId as 'capability' | 'annotations')
        setDrawerOpen(true)
      }
    },
    [drawerOpen, drawerTab, setDrawerOpen, setDrawerTab],
  )

  const toggleOpen = useCallback(() => {
    setDrawerOpen(!drawerOpen)
  }, [drawerOpen, setDrawerOpen])

  // Escape key closes drawer
  useEffect(() => {
    if (!drawerOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen, setDrawerOpen])

  return (
    <div
      className={cn('border-border bg-card flex-shrink-0 overflow-hidden rounded-lg border transition-all duration-200', className)}
      style={{ height: drawerOpen ? DRAWER_HEIGHT : 36 }}
    >
      {/* Tab bar */}
      <div className="border-border flex h-9 flex-shrink-0 items-center gap-1 border-b px-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors',
              drawerTab === tab.id && drawerOpen
                ? 'bg-primary/15 text-primary border-primary/30 border'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent',
            )}
          >
            {tab.label}
            {tab.badge != null && (
              <span className="text-[10px] opacity-75">{tab.badge}</span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={toggleOpen}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded p-1 transition-colors"
          title={drawerOpen ? 'Collapse panel' : 'Expand panel'}
        >
          {drawerOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Tab content */}
      {drawerOpen && (
        <div className="overflow-y-auto" style={{ height: DRAWER_HEIGHT - 36 }}>
          {activeTab?.content}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify the build compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add frontend/src/components/BottomDrawer.tsx
git commit -m "feat: add BottomDrawer collapsible tabbed panel component"
```

---

### Task 3: Rewire OperatorDashboard — replace inline panels with BottomDrawer and trim stats ticker

**Files:**
- Modify: `frontend/src/pages/OperatorDashboard.tsx`

This is the largest task. It makes three changes to OperatorDashboard:

**Step 1: Add BottomDrawer import**

Add to the imports at the top:

```typescript
import { BottomDrawer } from '@/components/BottomDrawer'
import type { DrawerTab } from '@/components/BottomDrawer'
```

**Step 2: Remove UCL, LCL, and Center Line stat pills**

In the stats ticker bar JSX (around lines 317-363), remove:
- The `<span className="hidden md:contents">` wrapper block containing the UCL and LCL StatPills (lines 338-345)
- The CenterLine StatPill (lines 335-337)

Keep: Characteristic name/unit, Last value, Sample Count, OOC count, Cpk.

The resulting stats ticker JSX should be:

```tsx
{selectedId && quickStats && (
  <div className="flex flex-shrink-0 items-center gap-1.5 overflow-x-auto px-1 py-1 md:gap-2">
    {/* Characteristic name + chart type */}
    <div className="mr-1 flex flex-shrink-0 items-center gap-1.5 md:mr-2 md:gap-2">
      <span className="max-w-[120px] truncate text-xs font-semibold md:max-w-[200px] md:text-sm">
        {selectedCharacteristic?.name ?? '—'}
      </span>
      {selectedCharacteristic?.unit && (
        <span className="text-muted-foreground hidden text-xs md:inline">
          ({selectedCharacteristic.unit})
        </span>
      )}
    </div>

    <div className="bg-border/60 hidden h-4 w-px flex-shrink-0 md:block" />

    {/* Stats pills — trimmed to essentials */}
    <StatPill icon={Activity} label={t('stats.last')} value={quickStats.lastMean.toFixed(precision)} />
    <StatPill icon={Hash} label={t('stats.sampleCount')} value={quickStats.totalSamples} />
    <StatPill
      icon={AlertTriangle}
      label={t('stats.outOfControl')}
      value={quickStats.violationCount}
      variant={quickStats.violationCount > 0 ? 'danger' : 'success'}
    />
    {quickStats.cpk != null && (
      <StatPill
        icon={Gauge}
        label={t('stats.cpk')}
        value={quickStats.cpk.toFixed(2)}
        variant={
          quickStats.cpk >= 1.33 ? 'success' : quickStats.cpk >= 1.0 ? 'warning' : 'danger'
        }
      />
    )}
  </div>
)}
```

**Step 3: Remove the `Target` and `TrendingUp` imports** from lucide-react (line 27) since they were only used by the removed CL/UCL/LCL pills. Keep all other imports.

**Step 4: Remove the inline AnnotationListPanel block**

Delete the block around lines 515-528:

```tsx
{/* ── Annotation List Panel ── */}
{showAnnotations && selectedId && (
  <AnnotationListPanel ... />
)}
```

**Step 5: Remove the inline CapabilityCard block**

Delete the block around lines 530-537:

```tsx
{/* ── Process Capability Card ── */}
{selectedId && selectedCharacteristic?.usl != null && ... (
  <div className="flex-shrink-0">
    <CapabilityCard characteristicId={selectedId} />
  </div>
)}
```

**Step 6: Add BottomDrawer after the primary chart**

After the secondary chart (comparison mode) block (after the closing `{comparisonMode && (...)}` block, around line 513), add the BottomDrawer. Read `drawerOpen` and `setDrawerOpen` from the store and build the tabs array:

```tsx
{/* ── Bottom Drawer — Capability + Annotations ── */}
{selectedId && (
  <BottomDrawer
    tabs={[
      {
        id: 'capability',
        label: 'Capability',
        badge:
          selectedCharacteristic?.usl != null && selectedCharacteristic?.lsl != null && quickStats?.cpk != null ? (
            <span className={cn(
              'font-semibold tabular-nums',
              quickStats.cpk >= 1.33 ? 'text-success' : quickStats.cpk >= 1.0 ? 'text-warning' : 'text-destructive',
            )}>
              {quickStats.cpk.toFixed(2)}
            </span>
          ) : undefined,
        content:
          selectedCharacteristic?.usl != null && selectedCharacteristic?.lsl != null ? (
            <CapabilityCard characteristicId={selectedId} />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              Set spec limits (LSL/USL) to enable capability analysis
            </div>
          ),
      },
      {
        id: 'annotations',
        label: 'Annotations',
        badge: annotationCount > 0 ? annotationCount : undefined,
        content: (
          <AnnotationListPanel
            characteristicId={selectedId}
            visibleSampleIds={visibleSampleIds}
            visibleTimeRange={visibleTimeRange}
            onAddAnnotation={() => {
              setAnnotationMode('period')
              setAnnotationSampleId(undefined)
              setAnnotationSampleLabel(undefined)
              setAnnotationDialogOpen(true)
            }}
          />
        ),
      },
    ] satisfies DrawerTab[]}
  />
)}
```

**Step 7: Add annotation count for the badge**

Import `useAnnotations` from `@/api/hooks` and compute the count. Add near the other hooks (around line 96):

```typescript
const { data: annotationsData } = useAnnotations(selectedId ?? 0)
const annotationCount = annotationsData?.length ?? 0
```

**Step 8: Wire the Annotations toolbar toggle to open the drawer**

In the `ChartToolbar`, the `showAnnotations` toggle currently controls inline visibility. Now it should open the drawer to the Annotations tab instead. Modify the `setShowAnnotations` call in the dashboard to also open the drawer:

Find where `showAnnotations` is consumed. The `ChartToolbar` already calls `setShowAnnotations`. We need to make clicking the Annotations toolbar button open the drawer to that tab. Add an effect or modify the store behavior.

The simplest approach: add a `useEffect` that syncs `showAnnotations` to drawer state:

```typescript
const setDrawerOpen = useDashboardStore((s) => s.setDrawerOpen)
const setDrawerTab = useDashboardStore((s) => s.setDrawerTab)
const showAnnotations = useDashboardStore((s) => s.showAnnotations)

// Sync annotations toolbar toggle → drawer
useEffect(() => {
  if (showAnnotations) {
    setDrawerTab('annotations')
    setDrawerOpen(true)
  }
}, [showAnnotations, setDrawerTab, setDrawerOpen])
```

Note: `showAnnotations` is already read from the store. The `setDrawerOpen` and `setDrawerTab` are already imported for the BottomDrawer logic. This effect means: when the user clicks "Annotations" in the toolbar, it opens the drawer to the annotations tab.

**Step 9: Verify the build compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

**Step 10: Commit**

```bash
git add frontend/src/pages/OperatorDashboard.tsx
git commit -m "feat: replace inline panels with BottomDrawer, trim stats ticker"
```

---

### Task 4: Add capability zone overlays to the vertical histogram

**Files:**
- Modify: `frontend/src/components/DistributionHistogram.tsx`

**Context:** The `DistributionHistogram` already calculates `cp`, `cpk`, `ppk`, `usl`, `lsl`, and `stats.mean` internally. It already draws spec limit and control limit markLines in vertical mode. This task adds:
1. Zone band fills (green/yellow/red) between spec limits
2. Cpk/Ppk badge overlays in the chart corner

**Step 1: Add capability zone markArea data to the vertical ECharts option**

Inside the `echartsOption` useMemo, in the `if (isVertical)` branch (around line 438), after the `markLineData` array is built but before the `return` statement, add markArea data for capability zones:

```typescript
// Capability zone bands (only in vertical mode with spec limits)
const markAreaData: Array<[Record<string, unknown>, Record<string, unknown>]> = []
if (showSpecLimits && lsl !== null && usl !== null) {
  // Green zone: between spec limits (capable region)
  markAreaData.push([
    { yAxis: lsl, itemStyle: { color: 'rgba(34, 197, 94, 0.08)' } },
    { yAxis: usl },
  ])
  // Red zone below LSL
  markAreaData.push([
    { yAxis: yAxisDomain ? yAxisDomain[0] : xMin, itemStyle: { color: 'rgba(239, 68, 68, 0.06)' } },
    { yAxis: lsl },
  ])
  // Red zone above USL
  markAreaData.push([
    { yAxis: usl, itemStyle: { color: 'rgba(239, 68, 68, 0.06)' } },
    { yAxis: yAxisDomain ? yAxisDomain[1] : xMax },
  ])
}
```

Then add the markArea to the invisible line series that already carries markLine. Change:

```typescript
// Invisible line series to carry markLine reference lines
{
  type: 'line',
  data: [],
  markLine: { symbol: 'none', silent: true, data: markLineData as never[] },
  silent: true,
},
```

To:

```typescript
// Invisible line series to carry markLine + markArea reference lines
{
  type: 'line',
  data: [],
  markLine: { symbol: 'none', silent: true, data: markLineData as never[] },
  markArea: markAreaData.length > 0 ? { silent: true, data: markAreaData as never[] } : undefined,
  silent: true,
},
```

**Step 2: Add Cpk/Ppk badge as an ECharts graphic overlay**

Add a `graphic` element to the vertical ECharts option to render the Cpk badge. Inside the vertical return object (after the `series` array), add:

```typescript
graphic: cpk > 0 ? [
  {
    type: 'group',
    right: 35,
    top: 4,
    children: [
      {
        type: 'rect',
        shape: { width: 72, height: 20, r: 4 },
        style: {
          fill: cpk >= 1.33 ? 'rgba(34, 197, 94, 0.15)' : cpk >= 1.0 ? 'rgba(234, 179, 8, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          stroke: cpk >= 1.33 ? 'rgba(34, 197, 94, 0.3)' : cpk >= 1.0 ? 'rgba(234, 179, 8, 0.3)' : 'rgba(239, 68, 68, 0.3)',
          lineWidth: 1,
        },
      },
      {
        type: 'text',
        style: {
          text: `Cpk ${cpk.toFixed(2)}`,
          x: 36,
          y: 10,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize: 10,
          fontWeight: 600,
          fill: cpk >= 1.33 ? 'rgb(34, 197, 94)' : cpk >= 1.0 ? 'rgb(180, 140, 8)' : 'rgb(239, 68, 68)',
        },
      },
    ],
  },
  ...(ppk > 0 ? [{
    type: 'group' as const,
    right: 35,
    top: 28,
    children: [
      {
        type: 'rect' as const,
        shape: { width: 72, height: 20, r: 4 },
        style: {
          fill: 'rgba(139, 92, 246, 0.1)',
          stroke: 'rgba(139, 92, 246, 0.25)',
          lineWidth: 1,
        },
      },
      {
        type: 'text' as const,
        style: {
          text: `Ppk ${ppk.toFixed(2)}`,
          x: 36,
          y: 10,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize: 10,
          fontWeight: 600,
          fill: 'rgb(139, 92, 246)',
        },
      },
    ],
  }] : []),
] : undefined,
```

**Step 3: Verify the build compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add frontend/src/components/DistributionHistogram.tsx
git commit -m "feat: add capability zone bands and Cpk/Ppk badges to vertical histogram"
```

---

### Task 5: Visual verification and polish

**Files:**
- Possibly adjust: `frontend/src/components/BottomDrawer.tsx`, `frontend/src/pages/OperatorDashboard.tsx`

**Step 1: Start dev server and verify**

Run: `cd frontend && npm run dev`

Open the OperatorDashboard. Verify:

1. **Stats ticker** shows only 4 pills: Last, Samples, OOC, Cpk (no UCL/LCL/CL)
2. **Bottom drawer** appears collapsed at the bottom of the chart area with tab labels
3. **Capability tab** badge shows Cpk value (color-coded) when spec limits exist
4. **Clicking Capability tab** expands the drawer, showing the full CapabilityCard
5. **Clicking Annotations tab** switches to annotations content
6. **Clicking the active tab** collapses the drawer
7. **Escape key** collapses the drawer
8. **Annotations toolbar button** opens the drawer to the Annotations tab
9. **Chart** now fills significantly more vertical space when drawer is collapsed
10. **Histogram in "right" position** shows green/red zone bands between spec limits and Cpk/Ppk badges

**Step 2: Fix any layout or spacing issues discovered during verification**

Common things to check:
- CapabilityCard renders correctly inside the drawer's scrollable area (may need to remove rounded-xl border from the card's outer wrapper since the drawer provides the container)
- Annotations panel height looks right inside the drawer
- Drawer animation is smooth (transition-all duration-200)
- No double borders between tab bar and content

**Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: polish BottomDrawer layout and spacing"
```

---

## Task Dependency Graph

```
Task 1 (store) ──→ Task 2 (BottomDrawer) ──→ Task 3 (OperatorDashboard rewire)
                                                        │
Task 4 (histogram overlays) ─── independent ────────────┤
                                                        ↓
                                              Task 5 (visual QA)
```

Tasks 1→2→3 are sequential. Task 4 can run in parallel with Tasks 2-3. Task 5 runs last.
