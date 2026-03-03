# Accretion Disc Spiral Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-ring moon layout at planet zoom level with an Archimedean spiral showing 75-125 data points with age-based visual fading.

**Architecture:** Add a `spiralPosition()` function to `data-mapping.ts` that computes per-point `{ baseRadius, angle }` along an Archimedean spiral. Refactor `PlanetSystem.setDataMoons()` to accept age-based sizing/opacity. Update `MoonLines` to trace the spiral path with spoke baselines at the spiral arm (not a fixed ring). Increase chart data fetch limit from 25 to 100. Ring shader wake effects limited to newest 30 points for performance (shader still loops NUM_MOONS=30, but all 100 moon meshes are rendered).

**Tech Stack:** Three.js (meshes, lines, shader materials), TypeScript

**Design doc:** `docs/plans/2026-02-28-accretion-disc-spiral-design.md`

---

### Task 1: Add `spiralPosition()` to data-mapping

**Files:**
- Modify: `frontend/src/lib/galaxy/data-mapping.ts:56-66`

**Step 1: Add the spiralPosition function**

Add below the existing `timestampToAngle` function (which stays for backward compat but will no longer be called from the galaxy scene):

```typescript
/**
 * Spiral layout constants.
 * Inner radius starts just outside planet core (10.5).
 * Outer radius extends to the ring particle outer edge.
 */
const SPIRAL_INNER_RADIUS = 13.0
const SPIRAL_OUTER_RADIUS = 31.0
const SPIRAL_POINTS_PER_TURN = 25

/**
 * Compute position on an Archimedean spiral for a data point.
 * Index 0 = oldest (near planet center), index total-1 = newest (outer edge).
 *
 * Returns the baseline radius (on the spiral arm) and the angle.
 * The caller applies radial displacement from valueToRadius() on top.
 */
export function spiralPosition(
  index: number,
  total: number,
): { baseRadius: number; angle: number } {
  if (total <= 1) return { baseRadius: SPIRAL_OUTER_RADIUS, angle: Math.PI / 2 }

  const fraction = index / (total - 1) // 0 = oldest, 1 = newest
  const baseRadius =
    SPIRAL_INNER_RADIUS + fraction * (SPIRAL_OUTER_RADIUS - SPIRAL_INNER_RADIUS)

  // Total turns based on point count
  const totalTurns = Math.ceil(total / SPIRAL_POINTS_PER_TURN)
  // Clockwise from 12 o'clock, total angular sweep
  const totalAngle = totalTurns * Math.PI * 2
  const startAngle = Math.PI / 2
  const angle = startAngle + fraction * totalAngle

  return { baseRadius, angle }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /c/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/lib/galaxy/data-mapping.ts
git commit -m "feat(galaxy): add spiralPosition() for accretion disc layout"
```

---

### Task 2: Update `DEFAULT_GALAXY_CONFIG` moonCount to 100

**Files:**
- Modify: `frontend/src/lib/galaxy/types.ts:57-60`

**Step 1: Increase moonCount**

Change `DEFAULT_GALAXY_CONFIG.moonCount` from 50 to 100:

```typescript
export const DEFAULT_GALAXY_CONFIG: Omit<PlanetSystemConfig, 'colors'> = {
  ...DEFAULT_LOGIN_CONFIG,
  moonCount: 100,
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /c/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/lib/galaxy/types.ts
git commit -m "feat(galaxy): increase moonCount to 100 for spiral density"
```

---

### Task 3: Increase chart data fetch limit from 25 to 100

**Files:**
- Modify: `frontend/src/pages/GalaxyPage.tsx:45`

**Step 1: Update the useChartData limit**

Change `{ limit: 25 }` to `{ limit: 100 }`:

```typescript
  const { data: chartData } = useChartData(
    activeCharacteristicId ?? 0,
    { limit: 100 },
    { refetchInterval: isConnected ? false : 5000 },
  )
```

**Step 2: Verify TypeScript compiles**

Run: `cd /c/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/pages/GalaxyPage.tsx
git commit -m "feat(galaxy): fetch 100 data points for spiral density"
```

---

### Task 4: Refactor `PlanetSystem.setDataMoons()` for spiral layout with age fading

**Files:**
- Modify: `frontend/src/lib/galaxy/PlanetSystem.ts:714-789`

The `setDataMoons()` method signature stays the same (`samples: Array<{ angle: number; radius: number; hasViolation: boolean }>`), but we add age-based sizing and opacity. The caller (GalaxyScene) will already be passing spiral-computed angle/radius values.

**Step 1: Add age-based moon constants**

Add near the top of the file (after the existing constants around line 30):

```typescript
/** Age-based moon sizing: newest are largest, oldest are smallest */
const MOON_SIZE_NEWEST = 0.22
const MOON_SIZE_OLDEST = 0.06
const MOON_OPACITY_NEWEST = 1.0
const MOON_OPACITY_OLDEST = 0.25

/** Ring shader only receives the newest N points for wake effects (perf) */
const SHADER_MOON_LIMIT = 30
```

**Step 2: Refactor setDataMoons for age-based sizing/opacity**

Replace `setDataMoons()` (lines 714-789) with:

```typescript
  /** Remove all existing moons and create new ones at data-driven positions. */
  setDataMoons(
    samples: Array<{ angle: number; radius: number; hasViolation: boolean }>,
  ): void {
    // If not at full LOD, store for deferred application
    if (this.currentLOD !== 'full') {
      this.pendingDataMoons = samples
      return
    }

    if (!this.ringShaderMat || !this.moonGeo) return

    // Remove existing moon meshes from group and dispose materials
    this.moons.forEach((m) => {
      this.group.remove(m.mesh)
      ;(m.mesh.material as THREE.Material).dispose()
      if (m.anomalyTimeout) clearTimeout(m.anomalyTimeout)
    })

    const uniformMoons = this.ringShaderMat.uniforms.uMoons
      .value as THREE.Vector3[]
    const uniformStatus = this.ringShaderMat.uniforms.uMoonStatus
      .value as number[]
    const gapCenter = this.config.gaps[0]?.center ?? 15.5
    const total = Math.min(samples.length, this.config.moonCount)

    this.moons = samples.slice(0, this.config.moonCount).map((sample, i) => {
      // Age fraction: 0 = oldest, 1 = newest
      const ageFraction = total > 1 ? i / (total - 1) : 1

      const mat = new THREE.MeshBasicMaterial({
        color: this.config.colors.cream.clone(),
        transparent: true,
        opacity:
          MOON_OPACITY_OLDEST +
          ageFraction * (MOON_OPACITY_NEWEST - MOON_OPACITY_OLDEST),
      })
      const moonSize =
        MOON_SIZE_OLDEST + ageFraction * (MOON_SIZE_NEWEST - MOON_SIZE_OLDEST)
      const mesh = new THREE.Mesh(this.moonGeo, mat)
      mesh.scale.setScalar(moonSize / 0.12) // 0.12 is the base geo radius
      this.group.add(mesh)

      mesh.position.set(
        Math.cos(sample.angle) * sample.radius,
        0,
        Math.sin(sample.angle) * sample.radius,
      )

      // Feed only the newest SHADER_MOON_LIMIT points to the ring shader
      const shaderSlot = i - (total - Math.min(total, SHADER_MOON_LIMIT))
      if (shaderSlot >= 0 && shaderSlot < uniformMoons.length) {
        uniformMoons[shaderSlot].set(sample.radius, sample.angle, gapCenter)
        uniformStatus[shaderSlot] = sample.hasViolation ? 0.8 : 0
      }

      // Color and scale violation moons
      if (sample.hasViolation) {
        ;(mesh.material as THREE.MeshBasicMaterial).color.copy(
          this.config.colors.orange,
        )
        mesh.scale.multiplyScalar(1.4)
      }

      return {
        mesh,
        angle: sample.angle,
        speed: 0, // data moons don't orbit randomly
        gap: this.config.gaps[0] ?? { in: 14.5, out: 16.5, center: 15.5 },
        currentRadius: sample.radius,
        targetRadius: sample.radius,
        anomalyState: sample.hasViolation ? ANOMALY_SPIKE : ANOMALY_NORMAL,
        anomalyTarget: sample.radius,
        noiseOffset: 0,
        noiseFreq: 0,
        currentRotation: 0,
        anomaliesThisRotation: 0,
        rotationsSinceLastAnomaly: 0,
        anomalyTimeout: null,
      } satisfies MoonState
    })

    // Zero out unused uniform slots
    const shaderCount = Math.min(total, SHADER_MOON_LIMIT)
    for (let i = shaderCount; i < uniformMoons.length; i++) {
      uniformMoons[i].set(0, 0, 0)
      uniformStatus[i] = 0
    }
  }
```

**Key changes from original:**
- Age fraction computed as `i / (total - 1)` where 0=oldest, 1=newest
- Moon material gets `transparent: true` + interpolated opacity
- Moon mesh scale interpolated between `MOON_SIZE_OLDEST` and `MOON_SIZE_NEWEST`
- Only the newest `SHADER_MOON_LIMIT` (30) points are sent to ring shader uniforms (prevents GPU bottleneck from 100-iteration shader loop on 180K particles)
- Violation scaling reduced from 1.6x to 1.4x (since smallest moons are tiny, 1.6x would make violations too large relative)

**Step 3: Cap the shader moon count for performance**

The `createRings()` method (line 459) currently calls `createRingVertexShader(moonCount)` which bakes `NUM_MOONS` into the shader. With 100 moonCount, the shader would loop 100 times per particle. Instead, cap it:

In `createRings()`, change:

```typescript
  private createRings() {
    const { moonCount, colors } = this.config
    const { orange } = colors

    const uMoonsArray: THREE.Vector3[] = []
    const uMoonStatusArray: number[] = []
    for (let i = 0; i < moonCount; i++) {
      uMoonsArray.push(new THREE.Vector3())
      uMoonStatusArray.push(0)
    }

    const { geo, mat, ringsMesh } = this.buildRingParticles(
      this.config.ringParticleCount,
      { vertex: createRingVertexShader(moonCount), fragment: ringFragmentShader },
```

to:

```typescript
  private createRings() {
    const { colors } = this.config
    const { orange } = colors

    // Shader receives at most SHADER_MOON_LIMIT moons for performance
    const shaderMoonCount = Math.min(this.config.moonCount, SHADER_MOON_LIMIT)

    const uMoonsArray: THREE.Vector3[] = []
    const uMoonStatusArray: number[] = []
    for (let i = 0; i < shaderMoonCount; i++) {
      uMoonsArray.push(new THREE.Vector3())
      uMoonStatusArray.push(0)
    }

    const { geo, mat, ringsMesh } = this.buildRingParticles(
      this.config.ringParticleCount,
      { vertex: createRingVertexShader(shaderMoonCount), fragment: ringFragmentShader },
```

**Step 4: Verify TypeScript compiles**

Run: `cd /c/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/lib/galaxy/PlanetSystem.ts
git commit -m "feat(galaxy): spiral age-faded moons with shader perf cap"
```

---

### Task 5: Switch GalaxyScene from `timestampToAngle` to `spiralPosition`

**Files:**
- Modify: `frontend/src/components/galaxy/GalaxyScene.tsx` (Effect 3, around lines 876-968)

**Step 1: Update imports**

At the top of the file, add `spiralPosition` to the import from `data-mapping`:

```typescript
import {
  controlLimitsToGap,
  valueToRadius,
  timestampToAngle,
  spiralPosition,
  cpkToColorHex,
} from '@/lib/galaxy/data-mapping'
```

Note: Keep `timestampToAngle` imported — it may be used elsewhere or can be cleaned up later.

**Step 2: Replace timestampToAngle with spiralPosition in Effect 3**

In Effect 3 (Sync chart data), there are two blocks that build `moonData`. Both need updating.

Replace the first `moonData` block (around line 893-903):

```typescript
      const moonData = isAttribute
        ? chartData.attribute_data_points!.map((pt, i, arr) => {
            const sp = spiralPosition(i, arr.length)
            const displacement = valueToRadius(pt.plotted_value, ucl ?? 0, lcl ?? 0, gap) - gap.center
            return {
              angle: sp.angle,
              radius: sp.baseRadius + displacement,
              hasViolation: pt.violation_ids.length > 0,
            }
          })
        : chartData.data_points.map((pt, i, arr) => {
            const sp = spiralPosition(i, arr.length)
            const displacement = valueToRadius(pt.mean, ucl ?? 0, lcl ?? 0, gap) - gap.center
            return {
              angle: sp.angle,
              radius: sp.baseRadius + displacement,
              hasViolation: pt.violation_ids.length > 0,
            }
          })
```

Replace the second `moonData` block (around line 948-958) with the same pattern:

```typescript
      const moonData = isAttribute
        ? chartData.attribute_data_points!.map((pt, i, arr) => {
            const sp = spiralPosition(i, arr.length)
            const displacement = valueToRadius(pt.plotted_value, ucl ?? 0, lcl ?? 0, gap) - gap.center
            return {
              angle: sp.angle,
              radius: sp.baseRadius + displacement,
              hasViolation: pt.violation_ids.length > 0,
            }
          })
        : chartData.data_points.map((pt, i, arr) => {
            const sp = spiralPosition(i, arr.length)
            const displacement = valueToRadius(pt.mean, ucl ?? 0, lcl ?? 0, gap) - gap.center
            return {
              angle: sp.angle,
              radius: sp.baseRadius + displacement,
              hasViolation: pt.violation_ids.length > 0,
            }
          })
```

**Step 3: Extract a helper to DRY up the duplicated moonData mapping**

Both blocks do the same thing. Extract a callback above Effect 3:

```typescript
  /** Build moon data array from chart data using spiral positions. */
  const buildSpiralMoonData = useCallback(
    (
      chartData: ChartData,
      gap: GapConfig,
      ucl: number | null,
      lcl: number | null,
    ) => {
      const isAttribute =
        chartData.data_type === 'attribute' && chartData.attribute_data_points?.length
      const points = isAttribute
        ? chartData.attribute_data_points!
        : chartData.data_points
      return points.map((pt, i, arr) => {
        const sp = spiralPosition(i, arr.length)
        const value = 'plotted_value' in pt ? pt.plotted_value : (pt as { mean: number }).mean
        const displacement = valueToRadius(value, ucl ?? 0, lcl ?? 0, gap) - gap.center
        return {
          angle: sp.angle,
          radius: sp.baseRadius + displacement,
          hasViolation: pt.violation_ids.length > 0,
        }
      })
    },
    [],
  )
```

Then both blocks become:
```typescript
const moonData = buildSpiralMoonData(chartData, gap, ucl, lcl)
```

Add necessary type imports if not already present: `GapConfig` from `@/lib/galaxy/types`, `ChartData` from `@/types`.

**Step 4: Verify TypeScript compiles**

Run: `cd /c/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/components/galaxy/GalaxyScene.tsx
git commit -m "feat(galaxy): use spiral positions for moon data mapping"
```

---

### Task 6: Update `MoonLines` for spiral-aware radial spokes

**Files:**
- Modify: `frontend/src/lib/galaxy/MoonLines.ts:24-99`

The sequential trace already connects moons in index order — that naturally follows the spiral. But the **radial spokes** currently draw lines from each moon to a fixed `gapCenter` radius. For the spiral, spokes should point from each moon to its spiral baseline position.

**Step 1: Update the `update()` signature to accept spiral baselines**

Change the method signature and spoke logic:

```typescript
  /**
   * Rebuild the line geometries from current moon positions.
   * spiralBaselines: per-moon baseline radius on the spiral arm (optional,
   * falls back to gapCenter for single-ring layout).
   */
  update(
    moons: Array<{ angle: number; radius: number; hasViolation: boolean }>,
    gapCenter: number,
    spiralBaselines?: number[],
  ): void {
```

Then in the spoke calculation, replace the fixed `gapCenter` with per-moon baseline:

```typescript
      // Center-line position (same angle, spiral baseline or gap center radius)
      const baseR = spiralBaselines?.[i] ?? gapCenter
      spokePositions[i * 6 + 3] = cos * baseR
      spokePositions[i * 6 + 4] = 0
      spokePositions[i * 6 + 5] = sin * baseR
```

**Step 2: Update GalaxyScene Effect 3 to pass spiral baselines**

In GalaxyScene, after building `moonData`, compute baselines and pass them:

```typescript
      // Compute spiral baselines for spoke lines
      const spiralBaselines = moonData.map((_, i, arr) => spiralPosition(i, arr.length).baseRadius)

      const lines = new MoonLines()
      lines.update(moonData, gapCenter, spiralBaselines)
```

**Step 3: Verify TypeScript compiles**

Run: `cd /c/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/lib/galaxy/MoonLines.ts frontend/src/components/galaxy/GalaxyScene.tsx
git commit -m "feat(galaxy): spiral-aware radial spokes for MoonLines"
```

---

### Task 7: Visual verification and polish

**Step 1: Run dev server**

```bash
cd /c/Users/djbra/Projects/SPC-client/frontend && npm run dev
```

**Step 2: Manual verification checklist**

Navigate to the galaxy view and verify:
- [ ] At galaxy zoom: info cards still visible on all characteristics
- [ ] Click a constellation → constellation cards appear
- [ ] Click a planet → data moons appear in a spiral pattern (not a ring)
- [ ] Newest moons (outer edge) are largest and brightest
- [ ] Oldest moons (near planet core) are small and faded
- [ ] Violations are orange/red regardless of age
- [ ] Trace line follows the spiral path (gold, translucent)
- [ ] Spoke lines point from each moon to its spiral baseline (not a fixed radius)
- [ ] Toggle Trace/Spokes buttons work
- [ ] Drag to rotate planet around Y-axis works
- [ ] Scroll to zoom in/out at planet level works
- [ ] Moon click opens sample detail panel
- [ ] Ring particles still have wake effects on the newest ~30 moons
- [ ] Login page Saturn still renders correctly with 12 moons on a ring
- [ ] No console errors or performance issues

**Step 3: Fix any issues discovered**

Address visual or behavioral issues. Common things to tune:
- `SPIRAL_INNER_RADIUS` / `SPIRAL_OUTER_RADIUS` if spiral is too tight or too spread
- `SPIRAL_POINTS_PER_TURN` if turns are too tight or too loose
- `MOON_SIZE_NEWEST` / `MOON_SIZE_OLDEST` if size difference is too extreme
- `MOON_OPACITY_OLDEST` if faded moons are invisible

**Step 4: Final TypeScript check**

Run: `cd /c/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add -u
git commit -m "feat(galaxy): accretion disc spiral data visualization"
```

---

## Task Dependencies

```
Task 1 (spiralPosition) ─┐
Task 2 (moonCount 100)  ─┤
Task 3 (chart limit)    ─┼─→ Task 5 (GalaxyScene wiring) ─→ Task 7 (verification)
Task 4 (PlanetSystem)   ─┤                                    ↑
                          └─→ Task 6 (MoonLines spokes) ───────┘
```

Tasks 1-4 are independent and can be parallelized.
Task 5 depends on Tasks 1, 3, 4.
Task 6 depends on Task 1.
Task 7 depends on all.
