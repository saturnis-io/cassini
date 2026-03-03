# Accretion Disc Spiral — Planet-Level Data Visualization

**Date**: 2026-02-28
**Status**: Approved
**Goal**: Replace single-ring moon layout with an Archimedean spiral showing 75-125 data points

## Problem

The current planet-level view places data-point moons on a single ring (up to 50 points). This limits data density and makes time-order trends hard to read when many points crowd a single circle. Users need to see 75-125 data points with both time-order trend and distribution visible at a glance.

## Design

### Spiral Geometry

Archimedean spiral in the XZ plane centered on the planet core:

```
baseRadius = innerRadius + (index / total) * (outerRadius - innerRadius)
angle = index * (totalTurns * 2π / total)
```

- **Inner radius**: ~13 (just outside planet core at 10.5)
- **Outer radius**: ~32 (current ring outer edge)
- **Turns**: `ceil(total / 25)` — ~25 points per turn. 100 points → 4 turns.
- **Index 0** = oldest data → near planet center (smallest radius)
- **Index N** = newest data → outer edge (largest radius, most visual prominence)

### Value Encoding (Radial Displacement)

Each point's position is displaced from the spiral baseline by its measurement value relative to the center line:

```
displacement = valueToRadius(value, ucl, lcl, gap) - gap.center
finalRadius = baseRadius + displacement * displacementScale
```

- `displacementScale` maps the gap half-width (~2.0 ring units) to visible displacement
- Points on center line sit exactly on the spiral arm
- Violations push noticeably outward or inward from the spiral

### Age-Based Visual Hierarchy

Points fade with age (opacity + size):

- **Moon size**: Newest = 0.18 radius, oldest = 0.08. Linear interpolation by index.
- **Opacity**: Newest = 1.0, oldest = 0.3. Via `MeshBasicMaterial.opacity + transparent: true`.
- **Color**: Violations orange/red, in-control cream/gold — stays vivid regardless of age. Only opacity encodes age.

### Connecting Lines

- **Trace line**: `THREE.Line` along the spiral path through all points. Gold, opacity 0.4, additive blending. Replaces the sequential MoonLines trace.
- **Radial spokes**: Lines from each point to its spiral baseline radius (showing deviation from center line). Same toggle behavior as current.

### Ring Particles

Existing ring particle system stays as atmospheric background. Ring shader `uMoons` array updated to reference spiral positions so wake/glow effects follow the spiral arm.

### Data Flow

- Backend chart data query: `limit` increased from 25 to 100
- New `spiralPosition(index, total, config)` function replaces `timestampToAngle`
- `PlanetSystem.setDataMoons()` refactored for spiral layout
- `MoonLines` updated to trace spiral path

### What Stays the Same

- Planet core particle sphere
- Ring particles (background ambiance)
- Ring shader wake effects (repositioned along spiral)
- CSS2D labels (planet label, control limit labels)
- Galaxy/constellation LOD system
- GalaxyControls trace/spoke toggles
- Drag-to-rotate and scroll-to-zoom interaction
- Moon click → raycast against moon meshes

## Files

| File | Change |
|------|--------|
| `frontend/src/lib/galaxy/data-mapping.ts` | Add `spiralPosition()`, keep `valueToRadius()` |
| `frontend/src/lib/galaxy/PlanetSystem.ts` | Refactor `setDataMoons()` for spiral layout, age-based sizing/opacity |
| `frontend/src/lib/galaxy/MoonLines.ts` | Update trace/spoke geometry for spiral positions |
| `frontend/src/lib/galaxy/types.ts` | Update `DEFAULT_GALAXY_CONFIG.moonCount` to 100 |
| `frontend/src/components/galaxy/GalaxyScene.tsx` | Update chart data limit, spiral data mapping |
| `frontend/src/pages/GalaxyPage.tsx` | Update chart data `limit` from 25 to 100 |
| `frontend/src/components/login/saturn-shaders.ts` | Update `createRingVertexShader` for 100 moons |
