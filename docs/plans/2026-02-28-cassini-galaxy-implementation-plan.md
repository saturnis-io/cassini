# Cassini Galaxy Visualization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform SPC control chart data into an interactive Three.js galaxy where each characteristic is a Saturn-like planet with data-driven rings and moons, navigable via fly-through camera transitions.

**Architecture:** Extract a reusable `PlanetSystem` class from the existing `SaturnScene.tsx` login animation. The galaxy view instantiates one `PlanetSystem` per characteristic, arranged in constellation clusters derived from the hierarchy tree. A 3-tier LOD system (dot/halo/full) keeps performance manageable. WebSocket events drive live moon spawning and violation flame effects.

**Tech Stack:** Three.js (existing), CSS2DRenderer (Three.js addon), React 19, TanStack Query v5, Zustand v5, existing WebSocket infrastructure.

**Design doc:** `docs/plans/2026-02-28-cassini-galaxy-visualization-design.md`

---

## Phase 1: Foundation (Single Planet View)

### Task 1: Extract `PlanetSystem` class

Extract the planet/ring/moon creation logic from `SaturnScene.tsx` into a standalone class that both the login page and galaxy view can consume. This is a pure refactor — the login page must look identical after.

**Files:**
- Create: `frontend/src/lib/galaxy/PlanetSystem.ts`
- Create: `frontend/src/lib/galaxy/types.ts`
- Modify: `frontend/src/components/login/SaturnScene.tsx`

**Step 1: Create the types file**

```ts
// frontend/src/lib/galaxy/types.ts
import type * as THREE from 'three'

export interface GapConfig {
  in: number
  out: number
  center: number
}

export interface PlanetColors {
  navy: THREE.Color
  gold: THREE.Color
  cream: THREE.Color
  orange: THREE.Color
  muted: THREE.Color
}

export interface MoonState {
  mesh: THREE.Mesh
  angle: number
  speed: number
  gap: GapConfig
  currentRadius: number
  targetRadius: number
  anomalyState: number // 0=normal, 1=anomaly, 2=recovering
  anomalyTarget: number
  noiseOffset: number
  noiseFreq: number
  currentRotation: number
  anomaliesThisRotation: number
  rotationsSinceLastAnomaly: number
  anomalyTimeout: ReturnType<typeof setTimeout> | null
}

export interface PlanetSystemConfig {
  planetParticleCount: number
  ringParticleCount: number
  planetRadius: number
  gaps: GapConfig[]
  moonCount: number
  colors: PlanetColors
}

export const DEFAULT_LOGIN_CONFIG: Omit<PlanetSystemConfig, 'colors'> = {
  planetParticleCount: 6000,
  ringParticleCount: 180000,
  planetRadius: 10.5,
  gaps: [
    { in: 14.5, out: 16.5, center: 15.5 },
    { in: 20.0, out: 23.5, center: 21.75 },
    { in: 27.0, out: 28.5, center: 27.75 },
  ],
  moonCount: 12,
}
```

**Step 2: Create the `PlanetSystem` class**

Extract the planet sphere creation, ring particle creation, moon creation, and moon state machine update into a class. The class does NOT own a scene, renderer, camera, or animation loop — it creates Three.js objects and exposes an `update(time)` method.

```ts
// frontend/src/lib/galaxy/PlanetSystem.ts
import * as THREE from 'three'
import { ringVertexShader, ringFragmentShader } from '@/components/login/saturn-shaders'
import type { GapConfig, MoonState, PlanetColors, PlanetSystemConfig } from './types'

export class PlanetSystem {
  readonly group: THREE.Group
  private planet: THREE.Points
  private core: THREE.Mesh
  private rings: THREE.Points
  private ringShaderMat: THREE.ShaderMaterial
  private moons: MoonState[]
  private moonGeo: THREE.SphereGeometry
  private colors: PlanetColors
  private config: PlanetSystemConfig

  constructor(config: PlanetSystemConfig) {
    this.config = config
    this.colors = config.colors
    this.group = new THREE.Group()

    this.planet = this.createPlanet()
    this.core = this.createCore()
    const { rings, material } = this.createRings()
    this.rings = rings
    this.ringShaderMat = material
    this.moonGeo = new THREE.SphereGeometry(0.12, 16, 16)
    this.moons = this.createMoons()

    this.group.add(this.planet)
    this.group.add(this.core)
    this.group.add(this.rings)
  }

  // --- Creation methods (extracted from SaturnScene.tsx) ---

  private createPlanet(): THREE.Points {
    const { planetParticleCount, planetRadius } = this.config
    const { cream, gold } = this.colors
    const positions = new Float32Array(planetParticleCount * 3)
    const colors = new Float32Array(planetParticleCount * 3)
    const phi = Math.PI * (3 - Math.sqrt(5))

    for (let i = 0; i < planetParticleCount; i++) {
      const y = 1 - (i / (planetParticleCount - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = phi * i

      positions[i * 3] = Math.cos(theta) * r * planetRadius
      positions[i * 3 + 1] = y * planetRadius
      positions[i * 3 + 2] = Math.sin(theta) * r * planetRadius

      const mixed = cream.clone().lerp(gold, (y + 1) / 2 + (Math.random() * 0.2 - 0.1))
      colors[i * 3] = mixed.r
      colors[i * 3 + 1] = mixed.g
      colors[i * 3 + 2] = mixed.b
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      }),
    )
  }

  private createCore(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(this.config.planetRadius - 0.3, 32, 32)
    const mat = new THREE.MeshBasicMaterial({ color: this.colors.navy })
    return new THREE.Mesh(geo, mat)
  }

  private createRings(): { rings: THREE.Points; material: THREE.ShaderMaterial } {
    const { ringParticleCount, gaps } = this.config
    const { cream, muted, orange } = this.colors
    const positions = new Float32Array(ringParticleCount * 3)
    const colors = new Float32Array(ringParticleCount * 3)

    let idx = 0
    while (idx < ringParticleCount) {
      const theta = Math.random() * Math.PI * 2
      const radius = 12.0 + Math.pow(Math.random(), 1.2) * 20.0

      let inGap = false
      for (const g of gaps) {
        if (radius > g.in && radius < g.out) {
          if (Math.random() > 0.015) inGap = true
        }
      }
      if (inGap) continue

      positions[idx * 3] = Math.cos(theta) * radius
      positions[idx * 3 + 1] = (Math.random() - 0.5) * 0.04
      positions[idx * 3 + 2] = Math.sin(theta) * radius

      const col = cream.clone().lerp(muted, (radius - 12.0) / 20.0)
      colors[idx * 3] = col.r
      colors[idx * 3 + 1] = col.g
      colors[idx * 3 + 2] = col.b
      idx++
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const uMoonsArray: THREE.Vector3[] = []
    const uMoonStatusArray: number[] = []
    for (let i = 0; i < this.config.moonCount; i++) {
      uMoonsArray.push(new THREE.Vector3())
      uMoonStatusArray.push(0)
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: ringVertexShader,
      fragmentShader: ringFragmentShader,
      uniforms: {
        uMoons: { value: uMoonsArray },
        uMoonStatus: { value: uMoonStatusArray },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uAlertColor: { value: orange },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    return { rings: new THREE.Points(geo, material), material }
  }

  private createMoons(): MoonState[] {
    const { moonCount, gaps } = this.config
    const states: MoonState[] = []

    for (let i = 0; i < moonCount; i++) {
      const gap = gaps[i % gaps.length]
      const mat = new THREE.MeshBasicMaterial({ color: this.colors.cream.clone() })
      const mesh = new THREE.Mesh(this.moonGeo, mat)
      this.group.add(mesh)

      const initialAngle = ((Math.PI * 2) / moonCount) * i + Math.random()
      states.push({
        mesh,
        angle: initialAngle,
        speed: 0.0015 + Math.random() * 0.001,
        gap,
        currentRadius: gap.center,
        targetRadius: gap.center,
        anomalyState: 0,
        anomalyTarget: gap.center,
        noiseOffset: Math.random() * 100,
        noiseFreq: 0.3 + Math.random() * 0.3,
        currentRotation: Math.floor(initialAngle / (Math.PI * 2)),
        anomaliesThisRotation: 0,
        rotationsSinceLastAnomaly: 0,
        anomalyTimeout: null,
      })
    }

    return states
  }

  // --- Update (called each frame by scene owner) ---

  update(time: number): void {
    this.ringShaderMat.uniforms.uTime.value = time
    this.planet.rotation.y += 0.001

    this.moons.forEach((moon, i) => {
      this.updateMoon(moon, i, time)
    })
  }

  private updateMoon(moon: MoonState, index: number, time: number): void {
    const { cream, orange } = this.colors

    moon.angle += moon.speed

    const currentRot = Math.floor(moon.angle / (Math.PI * 2))
    if (currentRot > moon.currentRotation) {
      if (moon.anomaliesThisRotation === 0) moon.rotationsSinceLastAnomaly++
      else moon.rotationsSinceLastAnomaly = 0
      moon.anomaliesThisRotation = 0
      moon.currentRotation = currentRot
    }

    if (moon.anomalyState === 0) {
      moon.targetRadius =
        moon.gap.center +
        Math.sin(time * moon.noiseFreq + moon.noiseOffset) *
          ((moon.gap.out - moon.gap.in) * 0.25)

      let prob = 0
      if (moon.anomaliesThisRotation < 2) {
        if (moon.rotationsSinceLastAnomaly >= 2) {
          const fraction = (moon.angle / (Math.PI * 2)) % 1
          prob = 0.002 + fraction * 0.05
        } else {
          prob = 0.0004
        }
      }

      if (Math.random() < prob) {
        moon.anomalyState = 1
        moon.anomaliesThisRotation++
        const dir = Math.random() > 0.5 ? 1 : -1
        moon.anomalyTarget =
          moon.gap.center + dir * ((moon.gap.out - moon.gap.in) * 0.5 + 1.2)
        moon.anomalyTimeout = setTimeout(() => {
          if (moon.anomalyState === 1) moon.anomalyState = 2
        }, 4000 + Math.random() * 3000)
      }
    } else if (moon.anomalyState === 1) {
      moon.targetRadius = moon.anomalyTarget
    } else if (moon.anomalyState === 2) {
      moon.targetRadius =
        moon.gap.center +
        Math.sin(time * moon.noiseFreq + moon.noiseOffset) *
          ((moon.gap.out - moon.gap.in) * 0.25)
      if (Math.abs(moon.currentRadius - moon.targetRadius) < 0.3) {
        moon.anomalyState = 0
      }
    }

    const speed = moon.anomalyState === 1 ? 0.015 : 0.003
    moon.currentRadius += (moon.targetRadius - moon.currentRadius) * speed

    let status = 0
    const buffer = 0.8
    if (moon.currentRadius < moon.gap.in + buffer)
      status = (moon.gap.in + buffer - moon.currentRadius) / buffer
    if (moon.currentRadius > moon.gap.out - buffer)
      status = (moon.currentRadius - (moon.gap.out - buffer)) / buffer
    status = Math.max(0, Math.min(1, status))

    moon.mesh.position.set(
      Math.cos(moon.angle) * moon.currentRadius,
      0,
      Math.sin(moon.angle) * moon.currentRadius,
    )

    ;(moon.mesh.material as THREE.MeshBasicMaterial).color.lerpColors(cream, orange, status)
    moon.mesh.scale.setScalar(1.0 + status * 0.6)

    this.ringShaderMat.uniforms.uMoons.value[index].set(
      moon.currentRadius,
      moon.angle,
      moon.gap.center,
    )
    this.ringShaderMat.uniforms.uMoonStatus.value[index] = status
  }

  // --- Public API for data-driven mode (galaxy view will use these) ---

  /** Set a moon's position directly (for data-driven mode, not random state machine) */
  setMoonPosition(index: number, angle: number, radius: number): void {
    const moon = this.moons[index]
    if (!moon) return
    moon.angle = angle
    moon.currentRadius = radius
    moon.targetRadius = radius
  }

  /** Trigger anomaly state on a moon (for WebSocket violation events) */
  triggerMoonAnomaly(index: number, direction: 1 | -1 = 1): void {
    const moon = this.moons[index]
    if (!moon) return
    moon.anomalyState = 1
    moon.anomaliesThisRotation++
    moon.anomalyTarget =
      moon.gap.center + direction * ((moon.gap.out - moon.gap.in) * 0.5 + 1.2)
    moon.anomalyTimeout = setTimeout(() => {
      if (moon.anomalyState === 1) moon.anomalyState = 2
    }, 4000 + Math.random() * 3000)
  }

  /** Update planet surface color (for Cpk-driven coloring) */
  setPlanetColor(color: THREE.Color): void {
    const colors = this.planet.geometry.attributes.color
    const arr = colors.array as Float32Array
    for (let i = 0; i < arr.length; i += 3) {
      const y = this.planet.geometry.attributes.position.array[i + 1]
      const norm = (y / this.config.planetRadius + 1) / 2
      const mixed = color.clone().lerp(this.colors.gold, norm * 0.3)
      arr[i] = mixed.r
      arr[i + 1] = mixed.g
      arr[i + 2] = mixed.b
    }
    colors.needsUpdate = true
  }

  /** Update pixel ratio uniform (on resize) */
  setPixelRatio(ratio: number): void {
    this.ringShaderMat.uniforms.uPixelRatio.value = ratio
  }

  /** Clean up all GPU resources */
  dispose(): void {
    this.moons.forEach((m) => {
      if (m.anomalyTimeout) clearTimeout(m.anomalyTimeout)
      ;(m.mesh.material as THREE.Material).dispose()
    })
    this.planet.geometry.dispose()
    ;(this.planet.material as THREE.Material).dispose()
    this.core.geometry.dispose()
    ;(this.core.material as THREE.Material).dispose()
    this.rings.geometry.dispose()
    this.ringShaderMat.dispose()
    this.moonGeo.dispose()
  }
}
```

**Step 3: Refactor `SaturnScene.tsx` to use `PlanetSystem`**

Replace the inline planet/ring/moon creation with a `PlanetSystem` instance. The `SaturnScene` still owns the renderer, scene, camera, stars, parallax, and animation loop — it just delegates the Saturn system to `PlanetSystem`.

Key changes:
- Import `PlanetSystem` and `DEFAULT_LOGIN_CONFIG` from `@/lib/galaxy/PlanetSystem` and `@/lib/galaxy/types`
- Replace the ~100 lines of planet/ring/moon creation with:
  ```ts
  const system = new PlanetSystem({ ...DEFAULT_LOGIN_CONFIG, colors: { navy, gold, cream, orange, muted } })
  system.group.position.set(10, -5, -15)
  system.group.rotation.z = -20 * (Math.PI / 180)
  system.group.rotation.x = 12 * (Math.PI / 180)
  scene.add(system.group)
  ```
- Replace the moon state machine loop in `animate()` with `system.update(time)`
- Replace the dispose section with `system.dispose()`
- Keep stars, parallax, camera, resize handler, renderer as-is

**Step 4: Verify login page is visually identical**

Run: `cd frontend && npm run dev`
Navigate to `/login`. Verify:
- Planet renders with Fibonacci sphere pattern
- Ring particles flow with 3 gaps
- 12 moons orbit in gaps with anomaly state machine
- Wake/flame shader fires on anomaly
- Mouse parallax works
- No console errors

**Step 5: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/lib/galaxy/PlanetSystem.ts frontend/src/lib/galaxy/types.ts frontend/src/components/login/SaturnScene.tsx
git commit -m "refactor: extract PlanetSystem class from SaturnScene"
```

---

### Task 2: Create galaxy route and basic scene

Create the page component, route, and a minimal Three.js scene that renders a single `PlanetSystem` with static (non-data-driven) content — proving the class works outside the login page.

**Files:**
- Create: `frontend/src/pages/GalaxyPage.tsx`
- Create: `frontend/src/components/galaxy/GalaxyScene.tsx`
- Modify: `frontend/src/App.tsx` (add route)

**Step 1: Create `GalaxyScene.tsx`**

Minimal Three.js scene (like `SaturnScene` pattern — imperative, ref-based):

```tsx
// frontend/src/components/galaxy/GalaxyScene.tsx
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { PlanetSystem } from '@/lib/galaxy/PlanetSystem'
import { DEFAULT_LOGIN_CONFIG } from '@/lib/galaxy/types'

interface GalaxySceneProps {
  className?: string
}

export function GalaxyScene({ className }: GalaxySceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Colors — same palette as login
    const colors = {
      navy: new THREE.Color('#080C16'),
      gold: new THREE.Color('#D4AF37'),
      cream: new THREE.Color('#F4F1DE'),
      orange: new THREE.Color('#E05A3D'),
      muted: new THREE.Color('#4B5563'),
    }

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // Scene
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(colors.navy.getHex(), 0.003)

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    )
    camera.position.set(0, 30, 60)
    camera.lookAt(0, 0, 0)

    // Stars
    const starsGeo = new THREE.BufferGeometry()
    const starPositions = new Float32Array(1000 * 3)
    for (let i = 0; i < 1000 * 3; i += 3) {
      const r = 100 + Math.random() * 200
      const theta = Math.random() * Math.PI * 2
      const p = Math.acos(Math.random() * 2 - 1)
      starPositions[i] = r * Math.sin(p) * Math.cos(theta)
      starPositions[i + 1] = r * Math.sin(p) * Math.sin(theta)
      starPositions[i + 2] = r * Math.cos(p)
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starsMesh = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({
        color: colors.muted.getHex(),
        size: 0.2,
        transparent: true,
        opacity: 0.4,
      }),
    )
    scene.add(starsMesh)

    // Single planet system (proof of concept)
    const system = new PlanetSystem({ ...DEFAULT_LOGIN_CONFIG, colors })
    system.group.rotation.z = -20 * (Math.PI / 180)
    system.group.rotation.x = 12 * (Math.PI / 180)
    scene.add(system.group)

    // Animation loop
    const clock = new THREE.Clock()
    let frameId: number

    function animate() {
      frameId = requestAnimationFrame(animate)
      const time = clock.getElapsedTime()
      system.update(time)
      starsMesh.rotation.y += 0.0001
      renderer.render(scene, camera)
    }
    animate()

    // Resize
    function handleResize() {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
      system.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(frameId)
      system.dispose()
      starsGeo.dispose()
      ;(starsMesh.material as THREE.Material).dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ background: '#080C16', width: '100%', height: '100%' }}
    />
  )
}
```

**Step 2: Create `GalaxyPage.tsx`**

```tsx
// frontend/src/pages/GalaxyPage.tsx
import { GalaxyScene } from '@/components/galaxy/GalaxyScene'

export function GalaxyPage() {
  return (
    <div className="fixed inset-0 z-50 bg-[#080C16]">
      <GalaxyScene className="h-full w-full" />
    </div>
  )
}
```

**Step 3: Add route to `App.tsx`**

Add inside the authenticated routes (after the wall-dashboard route):

```tsx
<Route path="/galaxy" element={<GalaxyPage />} />
```

Import: `import { GalaxyPage } from '@/pages/GalaxyPage'`

Place it alongside the other full-screen routes (`/kiosk`, `/wall-dashboard`) — inside `RequireAuth` but outside `Layout` (no sidebar).

**Step 4: Verify**

Run: `cd frontend && npm run dev`
Navigate to `/galaxy` (must be logged in). Verify:
- Full-screen dark scene with stars
- Single Saturn planet with rings, moons, wake effects
- Animation runs smoothly
- No console errors

**Step 5: Type check**

Run: `cd frontend && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add frontend/src/pages/GalaxyPage.tsx frontend/src/components/galaxy/GalaxyScene.tsx frontend/src/App.tsx
git commit -m "feat(galaxy): add galaxy page with basic Three.js scene"
```

---

### Task 3: Data-driven single planet — gap from control limits, moons from samples

Replace the static/random planet with real chart data for a single characteristic. The ring gap width maps to UCL−LCL. Moons are positioned by actual sample values and timestamps.

**Files:**
- Create: `frontend/src/lib/galaxy/data-mapping.ts`
- Modify: `frontend/src/lib/galaxy/PlanetSystem.ts` (add `createDataDrivenMoons`)
- Modify: `frontend/src/components/galaxy/GalaxyScene.tsx`
- Modify: `frontend/src/pages/GalaxyPage.tsx` (accept charId from URL)

**Step 1: Create `data-mapping.ts`**

Utility functions that convert SPC data into Three.js coordinates:

```ts
// frontend/src/lib/galaxy/data-mapping.ts
import type { GapConfig } from './types'

/**
 * Map control limits to a ring gap configuration.
 * The gap represents the in-control zone (LCL to UCL).
 * Ring particles exist OUTSIDE the gap (danger zones).
 */
export function controlLimitsToGap(
  ucl: number | null,
  lcl: number | null,
  centerLine: number | null,
): GapConfig {
  // Default gap dimensions if limits are missing
  const defaultGap: GapConfig = { in: 14.5, out: 16.5, center: 15.5 }
  if (ucl == null || lcl == null || centerLine == null) return defaultGap

  // Map the control range to ring radii
  // Gap center at radius 15.5 (matching login page middle gap)
  // Gap width proportional to UCL-LCL, clamped to reasonable visual range
  const gapCenter = 15.5
  const range = ucl - lcl
  if (range <= 0) return defaultGap

  // Scale: gap half-width between 0.5 and 4.0 ring units
  const halfWidth = Math.max(0.5, Math.min(4.0, 2.0))

  return {
    in: gapCenter - halfWidth,
    out: gapCenter + halfWidth,
    center: gapCenter,
  }
}

/**
 * Map a measurement value to a radial position within the gap.
 * Values within UCL/LCL map to within the gap.
 * Values beyond limits map outside the gap (triggering flame effect).
 */
export function valueToRadius(
  value: number,
  ucl: number,
  lcl: number,
  gap: GapConfig,
): number {
  const range = ucl - lcl
  if (range <= 0) return gap.center

  const centerLine = (ucl + lcl) / 2
  const normalized = (value - centerLine) / (range / 2) // -1 to +1 for in-control

  // Map normalized value to gap radius
  // 0 = gap center, ±1 = gap edges, beyond ±1 = outside gap (violation)
  const halfWidth = (gap.out - gap.in) / 2
  return gap.center + normalized * halfWidth
}

/**
 * Map a sample's timestamp to an angular position on the ring.
 * Newest sample at 12 o'clock (PI/2), oldest at 6 o'clock,
 * flowing clockwise.
 */
export function timestampToAngle(
  timestamp: string,
  allTimestamps: string[],
): number {
  if (allTimestamps.length <= 1) return Math.PI / 2

  const sorted = [...allTimestamps].sort()
  const idx = sorted.indexOf(timestamp)
  const fraction = idx / (sorted.length - 1) // 0 = oldest, 1 = newest

  // Clockwise from 12 o'clock: newest at top (PI/2),
  // sweep clockwise (decreasing angle) to oldest
  // Full circle minus a small opening at the top for visual clarity
  const arcSpan = Math.PI * 1.8 // ~324 degrees, leaving a gap at top
  const startAngle = Math.PI / 2 // 12 o'clock
  return startAngle - fraction * arcSpan
}

/**
 * Determine planet color from Cpk value using plant thresholds.
 */
export function cpkToColor(
  cpk: number | null,
  greenThreshold = 1.67,
  yellowThreshold = 1.33,
): string {
  if (cpk == null) return '#4B5563' // muted gray for unknown
  if (cpk >= greenThreshold) return '#D4AF37' // gold — excellent
  if (cpk >= yellowThreshold) return '#F4F1DE' // cream — good
  if (cpk >= 1.0) return '#F59E0B' // amber — marginal
  return '#E05A3D' // orange-red — poor
}
```

**Step 2: Add data-driven moon management to `PlanetSystem`**

Add methods to `PlanetSystem.ts`:

```ts
/** Remove all existing moons and create new ones at data-driven positions */
setDataMoons(
  samples: Array<{ angle: number; radius: number; hasViolation: boolean }>,
): void {
  // Remove existing moon meshes
  this.moons.forEach((m) => {
    this.group.remove(m.mesh)
    ;(m.mesh.material as THREE.Material).dispose()
    if (m.anomalyTimeout) clearTimeout(m.anomalyTimeout)
  })

  // Pad/update shader uniforms (need exactly moonCount entries)
  const uniformMoons = this.ringShaderMat.uniforms.uMoons.value as THREE.Vector3[]
  const uniformStatus = this.ringShaderMat.uniforms.uMoonStatus.value as number[]

  this.moons = samples.slice(0, this.config.moonCount).map((sample, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: this.colors.cream.clone() })
    const mesh = new THREE.Mesh(this.moonGeo, mat)
    this.group.add(mesh)

    mesh.position.set(
      Math.cos(sample.angle) * sample.radius,
      0,
      Math.sin(sample.angle) * sample.radius,
    )

    // Update shader uniforms
    if (i < uniformMoons.length) {
      uniformMoons[i].set(sample.radius, sample.angle, this.config.gaps[0]?.center ?? 15.5)
      uniformStatus[i] = sample.hasViolation ? 0.8 : 0
    }

    // Color violation moons orange
    if (sample.hasViolation) {
      ;(mesh.material as THREE.MeshBasicMaterial).color.copy(this.colors.orange)
      mesh.scale.setScalar(1.6)
    }

    return {
      mesh,
      angle: sample.angle,
      speed: 0, // data moons don't orbit
      gap: this.config.gaps[0] ?? { in: 14.5, out: 16.5, center: 15.5 },
      currentRadius: sample.radius,
      targetRadius: sample.radius,
      anomalyState: sample.hasViolation ? 1 : 0,
      anomalyTarget: sample.radius,
      noiseOffset: 0,
      noiseFreq: 0,
      currentRotation: 0,
      anomaliesThisRotation: 0,
      rotationsSinceLastAnomaly: 0,
      anomalyTimeout: null,
    }
  })

  // Zero out unused uniform slots
  for (let i = this.moons.length; i < this.config.moonCount; i++) {
    if (i < uniformMoons.length) {
      uniformMoons[i].set(0, 0, 0)
      uniformStatus[i] = 0
    }
  }
}
```

**Step 3: Update `GalaxyScene` to accept and use chart data**

Modify `GalaxyScene` to accept `characteristicId` prop, fetch chart data and capability using existing hooks, and call `system.setDataMoons()` when data arrives. This requires moving the scene setup to work with React's data flow — fetch data outside the effect, pass it in.

```tsx
// In GalaxyScene.tsx, add props:
interface GalaxySceneProps {
  className?: string
  characteristicId?: number
}

// Use hooks at component level:
const { data: chartData } = useChartData(characteristicId ?? 0, { limit: 25 })
const { data: capability } = useCapability(characteristicId ?? 0)

// In the useEffect, after creating the PlanetSystem, apply data:
// (Use a ref to the system so data updates can reach it)
```

The key architectural pattern: store the `PlanetSystem` instance in a `useRef`, create it once in the setup effect, and update it reactively when `chartData` or `capability` changes via a separate `useEffect`.

**Step 4: Update `GalaxyPage` to read charId from URL**

```tsx
// frontend/src/pages/GalaxyPage.tsx
import { useSearchParams } from 'react-router-dom'

export function GalaxyPage() {
  const [searchParams] = useSearchParams()
  const focusParam = searchParams.get('focus') // e.g. "planet:42"
  const charId = focusParam?.startsWith('planet:')
    ? parseInt(focusParam.split(':')[1], 10)
    : undefined

  return (
    <div className="fixed inset-0 z-50 bg-[#080C16]">
      <GalaxyScene className="h-full w-full" characteristicId={charId} />
    </div>
  )
}
```

**Step 5: Verify**

Run: `cd frontend && npm run dev`
Navigate to `/galaxy?focus=planet:{id}` with a real characteristic ID. Verify:
- Planet renders with ring gap
- Moons positioned at actual sample values
- Violation moons are orange and scaled up
- Wake effect fires on out-of-control moons
- Planet surface color reflects Cpk

**Step 6: Type check and commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/src/lib/galaxy/data-mapping.ts frontend/src/lib/galaxy/PlanetSystem.ts frontend/src/components/galaxy/GalaxyScene.tsx frontend/src/pages/GalaxyPage.tsx
git commit -m "feat(galaxy): data-driven planet with chart data and Cpk coloring"
```

---

### Task 4: WebSocket live updates

Subscribe to the characteristic's WebSocket channel and animate new samples/violations in real time.

**Files:**
- Modify: `frontend/src/components/galaxy/GalaxyScene.tsx`

**Step 1: Add WebSocket subscription**

Use `useWebSocketContext()` to subscribe to the characteristic when the galaxy scene mounts at planet zoom level. The existing WebSocket infrastructure invalidates React Query caches on `sample` and `violation` events, which will cause `useChartData` to refetch — the data-mapping effect will then update the moons automatically.

```tsx
// In GalaxyScene.tsx:
import { useWebSocketContext } from '@/providers/WebSocketProvider'

// Inside component:
const { subscribe, unsubscribe } = useWebSocketContext()

useEffect(() => {
  if (!characteristicId) return
  subscribe(characteristicId)
  return () => unsubscribe(characteristicId)
}, [characteristicId, subscribe, unsubscribe])
```

Since the WebSocket provider already invalidates `['characteristics', 'chartData', charId]` on sample events, the `useChartData` hook will refetch, the data-mapping effect will recalculate moon positions, and the scene will update. No additional WebSocket message handling needed at this stage.

**Step 2: Disable polling when WebSocket is connected**

Pass `refetchInterval: false` to `useChartData` when WebSocket is connected:

```tsx
const { isConnected } = useWebSocketContext()
const { data: chartData } = useChartData(
  characteristicId ?? 0,
  { limit: 25 },
  { refetchInterval: isConnected ? false : 5000 },
)
```

**Step 3: Verify**

- Open `/galaxy?focus=planet:{id}` in one browser tab
- Submit a new sample via data entry in another tab
- Verify the new moon appears in the galaxy view within ~500ms
- Submit an out-of-control value — verify the moon turns orange with flame effect

**Step 4: Commit**

```bash
git add frontend/src/components/galaxy/GalaxyScene.tsx
git commit -m "feat(galaxy): live WebSocket updates for samples and violations"
```

---

## Phase 2: Constellation View

### Task 5: LOD system for PlanetSystem

Add `setLOD(level)` method that swaps geometry complexity. Three levels: `dot` (sprite), `halo` (simplified ring), `full` (current).

**Files:**
- Create: `frontend/src/lib/galaxy/ring-halo-shader.ts` (simplified shader, no moon wake)
- Modify: `frontend/src/lib/galaxy/PlanetSystem.ts` (add LOD switching)
- Modify: `frontend/src/lib/galaxy/types.ts` (add `LODLevel` type)

**Key implementation details:**
- `dot`: Hide planet/ring/moon groups. Add a single `THREE.Sprite` with `SpriteMaterial` (color = Cpk). Size = 0.5 units.
- `halo`: Rebuild planet with 500 particles, ring with 2000 particles (simplified shader, no moon uniforms). Hide moons.
- `full`: Current behavior (6K planet, 180K ring, moons).
- LOD transitions fade particles in/out over 200ms using material opacity tweening.
- `setLOD()` disposes old geometries before creating new ones to prevent memory leaks.

**Commit:** `feat(galaxy): add 3-tier LOD system to PlanetSystem`

---

### Task 6: Force-directed constellation layout

Compute spatial positions for all characteristics in a plant, grouped by hierarchy.

**Files:**
- Create: `frontend/src/lib/galaxy/constellation-layout.ts`

**Key implementation details:**
- Input: hierarchy tree + characteristics list
- Output: `Map<number, { x: number, z: number, constellationId: number }>` (charId → world position)
- Algorithm: Simple force-directed with constraints:
  - Same parent → attract (spring force, rest length 15 units)
  - Different parent → repel (inverse square, range 100 units)
  - Top-level groups offset by 120+ units from each other
  - Iterate 100 steps (deterministic, seeded by hierarchy IDs)
- Positions are deterministic — same hierarchy always produces same layout

**Commit:** `feat(galaxy): force-directed constellation layout from hierarchy`

---

### Task 7: Multi-planet scene with constellation lines

Render all characteristics as planets at their layout positions, with connecting lines.

**Files:**
- Modify: `frontend/src/components/galaxy/GalaxyScene.tsx` (multi-planet rendering)
- Create: `frontend/src/lib/galaxy/ConstellationLines.ts` (Three.js LineSegments)

**Key implementation details:**
- Create one `PlanetSystem` per characteristic, all at `dot` LOD initially
- Position each system's group at its layout coordinates
- Draw `THREE.LineSegments` between siblings (same parent node) using gold color, 0.15 opacity
- Store all systems in a `Map<number, PlanetSystem>` for lookup by charId
- Violation pulse: when a system's moon data shows violations, animate the connecting line's opacity between 0.15 and 0.5 using sin wave

**Commit:** `feat(galaxy): multi-planet constellation rendering with lines`

---

### Task 8: Camera fly-through system

Implement the 3-level zoom with smooth camera transitions.

**Files:**
- Create: `frontend/src/lib/galaxy/CameraController.ts`
- Modify: `frontend/src/components/galaxy/GalaxyScene.tsx`

**Key implementation details:**
- `CameraController` class manages camera position/target with eased tweening (ease-out cubic, 800ms)
- Three states: `galaxy` (camera at 500u), `constellation` (80u, centered on group), `planet` (50u, centered on system)
- `flyTo(target: Vector3, distance: number, duration: number)` — smoothly animates camera
- On fly-in: upgrade target system's LOD (dot → halo → full based on distance)
- On fly-out: downgrade LOD
- Star streak effect: during transition, multiply star positions by velocity vector to create motion blur
- Scroll wheel: at constellation zoom, scroll toward planet triggers fly-to-planet
- Click detection: raycaster on planet sprites/meshes → trigger fly-to
- ESC / back: fly out one level

**Commit:** `feat(galaxy): smooth camera fly-through with LOD transitions`

---

### Task 9: Hierarchy sidebar with bidirectional sync

Add the collapsible sidebar with hierarchy tree that syncs with the 3D camera.

**Files:**
- Create: `frontend/src/components/galaxy/GalaxySidebar.tsx`
- Modify: `frontend/src/pages/GalaxyPage.tsx`

**Key implementation details:**
- Reuse `HierarchyTree` component patterns (expand/collapse, status dots, search)
- `onNodeClick` callback → triggers camera fly-to constellation
- `onCharacteristicClick` callback → triggers camera fly-to planet
- Expose `setActiveNode(id)` and `setActiveCharacteristic(id)` for reverse sync (camera movement updates tree highlight)
- Search: debounced input, matching planets pulse (toggle a `highlighted` property on `PlanetSystem` that increases sprite brightness)
- Breadcrumb component at top showing current zoom path
- Collapsible with a toggle button (chevron)

**Commit:** `feat(galaxy): hierarchy sidebar with bidirectional camera sync`

---

## Phase 3: Polish & Integration

### Task 10: Easter egg trigger from dashboard

**Files:**
- Create: `frontend/src/hooks/useKonamiSequence.ts`
- Modify: `frontend/src/pages/OperatorDashboard.tsx` (or wherever dashboard lives)

**Key details:**
- Listen for key sequence `C-A-S-S-I-N-I` (case insensitive)
- On trigger: navigate to `/galaxy` with cinematic transition (dim → collapse → fly)
- The transition animation lives in `GalaxyPage` as an intro sequence that plays on first mount when `?from=easter-egg` is in the URL

**Commit:** `feat(galaxy): CASSINI easter egg trigger from dashboard`

---

### Task 11: Labels via CSS2DRenderer

**Files:**
- Create: `frontend/src/components/galaxy/GalaxyLabel.tsx` (HTML for CSS2DObject)
- Modify: `frontend/src/components/galaxy/GalaxyScene.tsx`

**Key details:**
- Add `CSS2DRenderer` as overlay renderer (same size as WebGL canvas)
- On click: create `CSS2DObject` with retro-styled HTML label attached to clicked planet/moon
- Label shows: name, Cpk value, status dot, spec limits
- At planet zoom: UCL/CL/LCL labels positioned at ring edges
- Dismiss on click-elsewhere or ESC

**Commit:** `feat(galaxy): on-click labels with CSS2DRenderer`

---

### Task 12: Sample detail panel on moon click

**Files:**
- Create: `frontend/src/components/galaxy/SampleDetailPanel.tsx`
- Modify: `frontend/src/components/galaxy/GalaxyScene.tsx`

**Key details:**
- Slide-in panel from right (matching `ExplanationPanel` style, z-60)
- Raycaster detects moon mesh clicks at planet zoom
- Panel shows sample info, measurements, violation details, acknowledge button
- Reuse existing violation acknowledgment mutation hook

**Commit:** `feat(galaxy): sample detail panel on moon click`

---

### Task 13: URL sync and breadcrumb navigation

**Files:**
- Create: `frontend/src/components/galaxy/GalaxyBreadcrumb.tsx`
- Modify: `frontend/src/pages/GalaxyPage.tsx`
- Modify: `frontend/src/components/galaxy/GalaxyScene.tsx`

**Key details:**
- Camera movements update URL query params via `useSearchParams`
- `?plant=1&focus=constellation:5` or `?plant=1&focus=planet:42`
- Breadcrumb: `Plant > Area > Line > Characteristic` — clickable segments fly camera to that level
- On page load with `focus` param: auto-fly to target after initial data load

**Commit:** `feat(galaxy): URL sync and breadcrumb navigation`

---

### Task 14: Kiosk/wall display integration

**Files:**
- Modify: `frontend/src/pages/GalaxyPage.tsx` (add auto-rotate mode)
- Modify: `frontend/src/pages/WallDashboard.tsx` (add Galaxy grid option)

**Key details:**
- `?kiosk=true` URL param: hides sidebar, enables slow auto-rotate camera (0.0002 rad/frame around Y axis)
- Violations cause camera to briefly pause rotation and zoom toward the offending constellation before resuming
- Wall dashboard: add "Galaxy" as a 1×1 grid option that embeds `<GalaxyScene />` in the grid cell

**Commit:** `feat(galaxy): kiosk auto-rotate and wall dashboard integration`

---

### Task 15: Attribute chart support

**Files:**
- Modify: `frontend/src/lib/galaxy/data-mapping.ts`

**Key details:**
- For attribute charts (`data_type === 'attribute'`): same ring gap metaphor
- Radial position maps plotted_value (proportion/count/rate) to gap position
- Particle density is uniform (no zone-based density variation)
- Zone gap markers (±1σ, ±2σ) not shown for attribute charts
- Use `attribute_data_points` instead of `data_points` from chart data

**Commit:** `feat(galaxy): attribute chart support for ring visualization`

---

## Phase 4: Future (Not In Scope)

These are documented for future reference only — not part of this implementation plan:

- **Multi-plant galaxy clusters** — multiple solar systems
- **Time-lapse replay** — historical data playback
- **AI anomaly overlay** — 3D markPoints from anomaly detection
- **WebXR VR/AR mode** — galaxy in a headset
- **Sound design** — ambient tones that shift with process health
