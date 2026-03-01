# Cassini Galaxy — SPC Data Visualization Design

**Date:** 2026-02-28
**Status:** Approved
**Branch:** TBD

## Overview

A Three.js visualization that transforms SPC control chart data into an interactive galaxy. Each characteristic becomes a Saturn-like planet with rings that represent its control chart — particles flow through the ring, data points orbit as moons within the ring gap, and out-of-control violations trigger flame/wake effects identical to the login page. The plant's full hierarchy of characteristics is rendered as constellation clusters connected by faint lines, navigable via smooth camera fly-throughs and a synchronized hierarchy sidebar.

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Extend existing SaturnScene architecture | Reuses GLSL wake shaders, Fibonacci sphere, ring particles. Same visual language as login page. |
| 2 | Ring gap = control zone (moons orbit inside) | Matches login page metaphor: moon in gap = calm, moon exits gap = flame. Not inverted. |
| 3 | Constellation clusters for plant-wide view | Hierarchy groups (Area/Line) map to spatial clusters connected by faint lines. Organic star-map layout. |
| 4 | Smooth camera fly-through transitions | 800ms eased camera tweens between galaxy → constellation → planet zoom levels. Star streak during flight. |
| 5 | Hierarchy sidebar with bidirectional sync | Click tree → camera flies. Camera flies → tree expands. Search → planets glow. Same component as existing HierarchyTree. |
| 6 | Labels on click, not always visible | Retro monospace style via CSS2DRenderer. Appear on click, dismiss on click-elsewhere. No label clutter at any zoom. |
| 7 | Live WebSocket data feed | Real-time sample/violation events drive moon spawning and anomaly animations. Wall-display ready. |
| 8 | LOD system for performance | dot (10 particles) / halo (2.5K) / full (186K) per planet. Galaxy zoom budget: ~1,500 particles for 50 characteristics. |
| 9 | Progressive entry: Easter egg → nav item | `CASSINI` key sequence on dashboard triggers cinematic transition. `/galaxy` route always works. Promote to nav when ready. |
| 10 | Phased delivery across 4 phases | Foundation → constellation → polish → future. Each phase is independently shippable. |

## Zoom Levels

| Level | Camera Distance | Visuals | Labels | Data Source |
|-------|----------------|---------|--------|-------------|
| **Galaxy** | ~500 units | Constellation clusters (glowing dots + faint gold lines) | Hover → tooltip (char name + Cpk). Click → fly in. | `useCharacteristics()` + hierarchy tree |
| **Constellation** | ~80 units | Planet spheres with halo rings, color = Cpk | Click → name + Cpk billboard label above planet | `useCapability()` per characteristic |
| **Planet** | ~50 units | Full ring = control chart, moons = data points in gap | Persistent: char name, UCL/CL/LCL along ring edges | `useChartData()` + WebSocket live feed |

## Ring-as-Control-Chart Data Mapping

### Core Metaphor

The ring gap IS the control zone. Particles flow in the dense bands above UCL and below LCL (the "danger zones"). Moons orbit within the clear gap. When a moon breaches the gap edge into the particle field, the wake/flame shader fires — identical visual trigger to the login page.

```
  ████ particles (above UCL) ████     ← danger zone
  ┊                            ┊
  ┊   GAP = control zone       ┊      ← UCL edge
  ┊   ● moon (in control)      ┊      ← calm, cream colored
  ┊   · · · CL · · · ·         ┊      ← center line
  ┊   ● moon (in control)      ┊
  ┊                             ┊      ← LCL edge
  ████ particles (below LCL) ████     ← danger zone

  Moon exits gap → flame/wake fires → orange glow, scale up
```

### Particle Mapping

| Property | Maps To |
|----------|---------|
| Angular position | Time (clockwise from 12:00 = newest) |
| Radial position | Above UCL or below LCL (danger zone bands) |
| Color | Cream (ambient), shifts orange/thermal near moon wakes |
| Flow speed | Constant clockwise drift |

### Moon = Data Point

| Property | Maps To |
|----------|---------|
| Angular position | Sample timestamp (clockwise) |
| Radial position | Measurement value mapped within gap (CL = gap center) |
| Color | Cream = in control, orange = violation |
| Size | 1.0 normal, 1.6 on violation |
| Wake effect | Subtle in control, intense flame when out of gap |
| Count | Last N samples visible (default 25), oldest fades out |

### Ring Structure

Zone boundaries (±1σ, ±2σ) rendered as faint markers within the gap — 10-15% density reduction lines, not separate bands.

### Planet Color = Capability Health

| Cpk Range | Color | Meaning |
|-----------|-------|---------|
| ≥ 1.67 | Gold (brand primary) | Excellent |
| 1.33 – 1.67 | Cream/warm white | Good |
| 1.00 – 1.33 | Amber/yellow | Marginal |
| < 1.00 | Orange → Red | Poor |

Thresholds match existing `capability_green_threshold` / `capability_yellow_threshold` plant config.

### Attribute Charts

Same ring metaphor. Radial position = plotted value (proportion/count/rate). Particle density uniform (no normal distribution). Zone gaps not shown.

## Galaxy Layout & Constellation Clustering

### Hierarchy → Spatial Position

- **Top-level nodes** (Areas) → constellation regions, spread across galaxy
- **Second-level nodes** (Lines) → sub-clusters within constellation
- **Characteristics** → individual planets within sub-cluster
- **Constellation lines** → faint gold traces connecting siblings under same parent

Layout algorithm: force-directed within constraints. Constellations repel for spacing, siblings attract. Deterministic positions (seeded by hierarchy IDs).

### Constellation Lines

- **Normal:** Gold, 0.15 opacity, 1px
- **Child in violation:** Line segment pulses (opacity 0.15 → 0.5), color shifts orange
- **Cross-constellation:** No lines

### Violation Effects (Multi-Level)

- **Planet level:** Moon exits gap → flame wake, orange glow, scale 1.6
- **Constellation level:** Planet color shifts orange, halo ring disturbed
- **Galaxy level:** Dot color shifts orange, constellation line pulses
- **Planet recoloring** visible at all zoom levels for at-a-glance triage

## Fly-Through Transitions

### Galaxy → Constellation (800ms)

1. Camera target → constellation center
2. FOV narrows (tunnel feel)
3. Non-target constellations fade to 0.1 opacity
4. Stars streak past camera
5. Planets resolve: sprites → sphere + halo ring (LOD swap at ~150u)
6. Sidebar tree auto-expands clicked node

### Constellation → Planet (800ms)

1. Camera flies toward planet
2. Sibling planets dim and drift to periphery
3. Ring particles spawn progressively (2K → 50K → 180K)
4. Gap resolves, moons appear at data positions
5. Zone markers (±1σ, ±2σ) fade in
6. UCL/CL/LCL labels appear
7. Sidebar highlights characteristic, breadcrumb updates
8. WebSocket subscription starts for this characteristic

### Backing Out

Reverse of above — ESC, back button, breadcrumb click, or scroll-out. Same 800ms timing.

### Camera Controls

| Level | Scroll | Left Drag | Right Drag | Click |
|-------|--------|-----------|------------|-------|
| Galaxy | Zoom in/out | Pan | Orbit (slow) | Fly to constellation |
| Constellation | Zoom toward planet | Pan | Orbit | Fly to planet |
| Planet | Zoom toward moon | Rotate ring view | Orbit planet | Moon → detail panel |

## Navigation & Labels

### Hierarchy Sidebar

Collapsible left-edge sidebar reusing existing `HierarchyTree` component patterns:

- **Bidirectional sync:** Tree click → camera fly. Camera fly → tree expand/highlight.
- **Search:** Type → matching planets pulse/glow in 3D, non-matches dim. Select result → fly to it.
- **Status dots:** Green/red matching planet colors (same visual language).
- **Breadcrumb:** Top of sidebar shows current depth: `Plant > Area > Line > [Characteristic]`

### Label Design (On-Click)

Retro monospace labels via Three.js CSS2DRenderer (HTML overlays):

```
┌─────────────────────────┐
│  BORE DIAMETER          │  ← Courier New, cream, uppercase
│  Cpk 1.47  ● In Control│  ← Gold value, green dot
│  USL 10.05  LSL 9.95   │  ← Muted gray
└─────────────────────────┘
```

- Appear on click, dismiss on click-elsewhere or ESC
- At planet level, UCL/CL/LCL labels hug ring edges

### Moon Click → Detail Panel

Slide-in panel (right side, z-60, matching ExplanationPanel style):
- Sample ID, timestamp
- Measurement value(s)
- Violation info (rule name, severity)
- Acknowledge button if unacknowledged
- Link to full sample inspector

## Rendering Architecture

### Extracted `PlanetSystem` Class

Reusable class consumed by both login page and galaxy view:

```
PlanetSystem.ts
├── createPlanet(color, particleCount)
├── createRing(innerR, outerR, particleCount, gapConfig)
├── createMoons(count, positions[])
├── updateMoonState(moonIdx, state)
├── setLOD(level: 'dot' | 'halo' | 'full')
├── update(deltaTime)
└── dispose()
```

`PlanetSystem` creates Three.js objects and exposes update methods. The scene owner (login or galaxy) runs the animation loop and calls `system.update(dt)`.

### LOD System

| Level | Camera Distance | Planet | Ring | Moons | Budget |
|-------|----------------|--------|------|-------|--------|
| `dot` | > 200u | Single glowing sprite | Faint halo circle | None | ~10 |
| `halo` | 80–200u | Fibonacci sphere (500) | Thin particle band (2K) | None | ~2,500 |
| `full` | < 80u | Full sphere (6K) + core | Full ring (180K) | Up to 25 | ~186,000 |

LOD swaps during fly-through (user doesn't notice). Particles fade 200ms.

Galaxy budget: 50 chars × 10 = 500 + 1,000 stars = ~1,500 at galaxy zoom.
Worst case: 1 full + 8 halo = 186K + 20K = ~206K (comparable to login page).

### Scene Graph

```
Scene
├── StarField (1,000 particles)
├── ConstellationGroup[]
│   ├── ConstellationLines (LineSegments)
│   └── PlanetSystem[]
│       ├── planetGroup (sphere + core occluder)
│       ├── ringGroup (particles + zone markers)
│       └── moonGroup (sphere meshes)
├── CSS2DRenderer (label overlays)
└── Camera + Controls
```

### Shader Reuse

- `full` LOD: existing `ringVertexShader` from `saturn-shaders.ts` (12 moon uniforms, wake math)
- `halo` LOD: new simplified `ringHaloShader` (~20 lines, no moon wake)
- `dot` LOD: Three.js `SpriteMaterial` (built-in)

### WebSocket Integration

```
Mount → subscribe(visibleCharIds)

'sample' event:
  full LOD  → add moon, age existing moons
  halo/dot  → update planet color (re-fetch capability)

'violation' event:
  full LOD  → moon anomaly state (orange, scale, wake)
  halo      → planet color shifts orange
  dot       → sprite color shifts orange
  all       → pulse constellation line

'limits_update' event:
  full LOD  → animate ring gap edges to new UCL/LCL

Fly-through LOD upgrade → fetch chart data, spawn particles
Fly-through LOD downgrade → despawn particles
```

### React Component Hierarchy

```
<GalaxyPage>
  <GalaxySidebar>
    <HierarchyTree />        ← reused, with flyTo callbacks
    <GalaxyBreadcrumb />
  </GalaxySidebar>
  <GalaxyCanvas>
    <GalaxyScene ref />       ← imperative Three.js (like SaturnScene)
  </GalaxyCanvas>
  <SampleDetailPanel />       ← slide-in on moon click
</GalaxyPage>
```

## Easter Egg & Route Structure

### Easter Egg Trigger

On dashboard, typing `CASSINI` (7 keys) triggers cinematic transition:

1. Screen dims (200ms)
2. Dashboard charts collapse into glowing dots (400ms)
3. Dots drift into constellation formation (400ms)
4. Stars streak in from edges
5. Galaxy view fades in (400ms)
6. URL updates to `/galaxy` (pushState)

Total: ~1.4s. After first discovery, `/galaxy` route always works directly.

### Routes

```
/galaxy                         → Full galaxy view
/galaxy?plant=1                 → Scoped to single plant
/galaxy?focus=constellation:5   → Fly to hierarchy node
/galaxy?focus=planet:42         → Fly to characteristic
```

URL updates as you navigate — shareable deep links.

### Kiosk Integration

- Galaxy kiosk mode: full-screen, slow auto-rotate, violations flare in real time
- Existing kiosk: unchanged
- Wall dashboard: "Galaxy" as 1×1 full-screen grid option

## Phased Delivery

### Phase 1 — Foundation

- Extract `PlanetSystem` class from `SaturnScene.tsx`
- Refactor login page to consume `PlanetSystem` (no visual change)
- `GalaxyScene` with single-planet view (one characteristic, full LOD)
- Data-driven moons (chart data → positions), WebSocket violation → flame
- Planet Cpk coloring
- Route at `/galaxy?focus=planet:{id}`

### Phase 2 — Constellation

- Multi-planet scene with LOD system (dot/halo/full)
- Force-directed constellation layout from hierarchy
- Constellation lines with violation pulse
- Fly-through camera transitions (galaxy ↔ constellation ↔ planet)
- Hierarchy sidebar with bidirectional sync

### Phase 3 — Polish & Integration

- Easter egg trigger from dashboard
- Moon click → sample detail panel
- Label system (CSS2DRenderer)
- Breadcrumb navigation
- URL sync (query params)
- Kiosk/wall display mode
- Search → planet glow
- Attribute chart support

### Phase 4 — Future (Out of Scope)

- Multi-plant view (galaxy clusters)
- Time-lapse mode (replay historical data)
- Anomaly detection overlay (AI insights in 3D)
- VR/AR mode (WebXR)
- Sound design (ambient tones shift with process health)
