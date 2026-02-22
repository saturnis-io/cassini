# OperatorDashboard Density Redesign

**Date**: 2026-02-22
**Goal**: Maximize chart space on the OperatorDashboard by reducing vertical competition from secondary panels.

## Problem

The OperatorDashboard stacks 6 vertical sections into one flex column:

- Stats Ticker (~48px)
- ChartToolbar (~40px)
- Range Slider (~48px, when on)
- Primary Chart (flex-1)
- AnnotationListPanel (~100-150px, when on)
- CapabilityCard (~200-300px, when on)

On a 1080p monitor with the hierarchy sidebar, the chart gets roughly 400-500px of height. With capability + annotations both visible, it drops further. The chart — the primary analysis tool — is squeezed by supporting panels.

## Design

### 1. Collapsible Bottom Drawer

Replace the inline AnnotationListPanel and CapabilityCard with a tabbed bottom drawer.

**Collapsed state (default):** A 36px tab bar at the bottom of the chart area.

```
─────────────────────────────────────────────────
 [Capability (1.45)]  [Annotations (3)]      [▲]
─────────────────────────────────────────────────
```

- Capability tab badge: current Cpk value, color-coded (green/yellow/red)
- Annotations tab badge: count of visible annotations
- Chevron button expands/collapses

**Expanded state:** Pushes the chart up, fixed 240px height. Active tab content scrolls.

```
─────────────────────────────────────────────────
 [Capability]  [Annotations]                [▼]
─────────────────────────────────────────────────
│                                               │
│  (Active tab content, scrollable)             │  240px
│                                               │
─────────────────────────────────────────────────
```

**Interaction:**

- Click tab when collapsed: expand to that tab
- Click active tab when expanded: collapse
- Click different tab when expanded: switch tab, stay open
- Escape key: collapse
- State persisted in dashboardStore

**Tabs:**

| Tab | Badge (collapsed) | Expanded content |
|-----|-------------------|------------------|
| Capability | Cpk value, color-coded | 5 index cards (Cp/Cpk/Pp/Ppk/Cpm), normality badge, non-normal adjusted indices, Cpk/Ppk trend sparkline, Snapshot + Fit Distribution buttons |
| Annotations | Visible annotation count | Existing AnnotationListPanel contents with Add button |

### 2. Capability-Enhanced Histogram

When the histogram is in the "right" position (vertically aligned with the chart Y-axis), it gains capability overlays:

- **Spec limit lines**: Horizontal dashed lines at LSL/USL positions
- **Zone bands**: Semi-transparent fills — green (Cpk >= 1.33 zone), yellow (1.0-1.33), red (beyond specs)
- **Capability badges**: Cpk and Ppk values pinned in the histogram corner, color-coded
- **Process center marker**: Tick mark showing process mean vs spec limits

These overlays activate automatically when spec limits exist and the histogram is in "right" position. The existing LSL/USL toolbar toggle controls visibility on both chart and histogram. No new toggle needed.

When histogram is "below" or "hidden", capability overlays do not appear (horizontal alignment is not meaningful). Full capability details remain in the drawer.

### 3. Streamlined Stats Ticker

Reduce from 7 pills to 4 by removing values already visible as chart lines:

**Remove:** UCL, LCL, Center Line (visible on chart)
**Keep:** Characteristic name + unit, Last value, Sample count, OOC count, Cpk

```
[Bore Diameter (mm)] | [Last: 25.03] [Samples: 147] [OOC: 3] [Cpk: 1.45]
```

### 4. Resulting Layout

```
┌──────────────────────────────────────────┐
│ [Name] | [Last] [Samples] [OOC] [Cpk]   │ 36px stats ticker
│ Toolbar controls                         │ 40px
│ ┌──────────────────────┬───────────────┐ │
│ │                      │  Histogram    │ │
│ │                      │  + spec lines │ │
│ │    CHART (flex-1)    │  + zone bands │ │
│ │    maximized height  │  + Cpk badge  │ │
│ │                      │               │ │
│ └──────────────────────┴───────────────┘ │
│ [Capability (1.45)] [Annotations (3)] [▲]│ 36px drawer (collapsed)
└──────────────────────────────────────────┘
```

Chart gains ~200-350px of vertical space compared to current layout when CapabilityCard + AnnotationPanel are both visible.

## Implementation Scope

### New components
- `components/BottomDrawer.tsx` — generic tabbed collapsible drawer

### Modified components
- `pages/OperatorDashboard.tsx` — replace inline panels with BottomDrawer, trim stats ticker
- `components/DistributionHistogram.tsx` — add capability zone overlays, spec lines, Cpk badges
- `stores/dashboardStore.ts` — add drawerOpen, drawerTab, drawerHeight state

### Removed from OperatorDashboard layout
- Inline `<AnnotationListPanel>` rendering (moves into drawer tab)
- Inline `<CapabilityCard>` rendering (moves into drawer tab)
- UCL/LCL/CL stat pills

### Unchanged
- AnnotationListPanel component itself (reused inside drawer)
- CapabilityCard component itself (reused inside drawer)
- ChartToolbar (showAnnotations toggle now opens drawer to Annotations tab)
- All chart components (ControlChart, DualChartPanel, BoxWhiskerChart)
