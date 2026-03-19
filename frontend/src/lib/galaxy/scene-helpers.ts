/**
 * Extracted utility functions from GalaxyScene.tsx.
 *
 * All functions are pure (no module-level state). They accept the Three.js
 * refs / maps they need as explicit parameters so they remain safe to call
 * from React callbacks that close over mutable refs.
 */
import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { PlanetSystem } from '@/lib/galaxy/PlanetSystem'
import { MoonLines } from '@/lib/galaxy/MoonLines'
import { SigmaBands } from '@/lib/galaxy/SigmaBands'
import { ViolationSparks } from '@/lib/galaxy/ViolationSparks'
import type { GapConfig } from '@/lib/galaxy/types'
import type { ConstellationPosition } from '@/lib/galaxy/constellation-layout'
import type { ZoomLevel } from '@/lib/galaxy/CameraController'
import {
  controlLimitsToGap,
  valueToRadius,
  spiralPosition,
  cpkToColorHex,
} from '@/lib/galaxy/data-mapping'
import type { Characteristic, CapabilityResult } from '@/types'
import {
  createGalaxyInfoCard,
  createConstellationCard,
  disposeLabel,
} from '@/components/galaxy/GalaxyLabel'

// ---------------------------------------------------------------------------
// Click-target raycasting
// ---------------------------------------------------------------------------

export interface ClickTarget {
  charId: number
  constellationId: number
  position: THREE.Vector3
}

/**
 * Raycast into the scene to find the PlanetSystem (and its constellation)
 * that the pointer event hit.
 */
export function findClickTarget(
  event: PointerEvent,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  scene: THREE.Scene,
  pointer: THREE.Vector2,
  raycaster: THREE.Raycaster,
  systems: Map<number, PlanetSystem>,
  posMap: Map<number, ConstellationPosition>,
): ClickTarget | null {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  camera.updateMatrixWorld()
  raycaster.setFromCamera(pointer, camera)

  const intersects = raycaster.intersectObjects(scene.children, true)

  for (const hit of intersects) {
    let obj: THREE.Object3D | null = hit.object
    while (obj) {
      for (const [charId, system] of systems.entries()) {
        if (obj === system.group) {
          const pos = posMap.get(charId)
          if (pos) {
            return {
              charId,
              constellationId: pos.constellationId,
              position: new THREE.Vector3(pos.x, 0, pos.z),
            }
          }
        }
      }
      obj = obj.parent
    }
  }

  return null
}

/**
 * Raycast to find which moon mesh (data-point sphere) was clicked
 * on the currently-focused planet system (planet zoom only).
 *
 * Returns the moon index, or null if nothing hit.
 */
export function findMoonClickTarget(
  event: PointerEvent,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  pointer: THREE.Vector2,
  raycaster: THREE.Raycaster,
  focusedSystem: PlanetSystem,
): number | null {
  if (focusedSystem.lod !== 'full') return null

  const moonMeshes = focusedSystem.getMoonMeshes()
  if (moonMeshes.length === 0) return null

  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  camera.updateMatrixWorld()
  raycaster.setFromCamera(pointer, camera)

  const intersects = raycaster.intersectObjects(moonMeshes, false)
  if (intersects.length === 0) return null

  const hitMesh = intersects[0].object
  const moonIndex = moonMeshes.indexOf(hitMesh as THREE.Mesh)
  return moonIndex >= 0 ? moonIndex : null
}

// ---------------------------------------------------------------------------
// Spiral moon data builder
// ---------------------------------------------------------------------------

export interface SpiralMoon {
  angle: number
  radius: number
  hasViolation: boolean
  hasUnacknowledgedViolation: boolean
}

interface ChartDataLike {
  data_type?: string
  attribute_data_points?: Array<{
    plotted_value: number
    violation_ids: number[]
    unacknowledged_violation_ids?: number[]
  }>
  data_points: Array<{
    mean: number
    violation_ids: number[]
    unacknowledged_violation_ids?: number[]
  }>
}

/** Build moon data array from chart data using spiral positions. */
export function buildSpiralMoonData(
  cd: ChartDataLike,
  gap: GapConfig,
  ucl: number | null,
  lcl: number | null,
): SpiralMoon[] {
  const isAttribute =
    cd.data_type === 'attribute' && cd.attribute_data_points?.length
  const points = isAttribute ? cd.attribute_data_points! : cd.data_points
  return points.map((pt, i, arr) => {
    const sp = spiralPosition(i, arr.length)
    const value =
      'plotted_value' in pt
        ? pt.plotted_value
        : (pt as { mean: number }).mean
    const hasViolation = pt.violation_ids.length > 0
    const hasUnacknowledgedViolation = pt.unacknowledged_violation_ids
      ? pt.unacknowledged_violation_ids.length > 0
      : hasViolation

    if (ucl == null || lcl == null) {
      return {
        angle: sp.angle,
        radius: sp.baseRadius,
        hasViolation,
        hasUnacknowledgedViolation,
      }
    }

    const rawDisplacement = valueToRadius(value, ucl, lcl, gap) - gap.center
    const halfWidth = Math.max((gap.out - gap.in) / 2, 0.5)
    const maxDisplacement = sp.armSpacing * 0.35
    const scaledDisplacement = Math.max(
      -maxDisplacement,
      Math.min(
        maxDisplacement,
        (rawDisplacement / halfWidth) * maxDisplacement,
      ),
    )
    return {
      angle: sp.angle,
      radius: sp.baseRadius - scaledDisplacement,
      hasViolation,
      hasUnacknowledgedViolation,
    }
  })
}

// ---------------------------------------------------------------------------
// Characteristic → dot/planet color
// ---------------------------------------------------------------------------

/**
 * Apply dot and planet color to a PlanetSystem based on characteristic
 * metadata (sample count, violations, Cpk). Returns true if the
 * characteristic is currently violating.
 */
export function applyCharacteristicColor(
  system: PlanetSystem,
  char: Pick<
    Characteristic,
    'sample_count' | 'unacknowledged_violations' | 'latest_cpk'
  >,
): boolean {
  if (!char.sample_count) {
    system.setDotColor(new THREE.Color('#6B7280'))
    system.setPlanetColor(new THREE.Color('#6B7280'))
    return false
  }
  if ((char.unacknowledged_violations ?? 0) > 0) {
    system.setDotColor(new THREE.Color('#EF4444'))
    system.setPlanetColor(new THREE.Color('#EF4444'))
    return true
  }
  if (char.latest_cpk != null) {
    const hex = cpkToColorHex(char.latest_cpk)
    system.setDotColor(new THREE.Color(hex))
    system.setPlanetColor(new THREE.Color(hex))
  } else {
    system.setDotColor(new THREE.Color(cpkToColorHex(null)))
    system.setPlanetColor(new THREE.Color(cpkToColorHex(null)))
  }
  return false
}

// ---------------------------------------------------------------------------
// Info-card lifecycle (galaxy / constellation level)
// ---------------------------------------------------------------------------

/** Dispose all CSS2DObject entries from a map and clear the map. */
export function disposeCardMap(cards: Map<number, CSS2DObject>): void {
  for (const card of cards.values()) {
    disposeLabel(card)
  }
  cards.clear()
}

/** Create galaxy info cards and add them to corresponding PlanetSystem groups. */
export function createGalaxyCards(
  chars: Characteristic[],
  systems: Map<number, PlanetSystem>,
  cards: Map<number, CSS2DObject>,
): void {
  for (const char of chars) {
    const system = systems.get(char.id)
    if (!system) continue
    const card = createGalaxyInfoCard(char)
    system.group.add(card)
    cards.set(char.id, card)
  }
}

/** Create constellation-level info cards for a single constellation. */
export function createConstellationCards(
  constellationId: number,
  chars: Characteristic[],
  systems: Map<number, PlanetSystem>,
  posMap: Map<number, ConstellationPosition>,
  cards: Map<number, CSS2DObject>,
  pathMap: Map<number, string> | null,
): void {
  for (const char of chars) {
    const pos = posMap.get(char.id)
    if (!pos || pos.constellationId !== constellationId) continue
    const system = systems.get(char.id)
    if (!system) continue
    const hierarchyPath = pathMap?.get(char.hierarchy_id) ?? undefined
    const card = createConstellationCard(char, hierarchyPath)
    system.group.add(card)
    cards.set(char.id, card)
  }
}

// ---------------------------------------------------------------------------
// Moon-line / sigma-band / violation-spark dispose helpers
// ---------------------------------------------------------------------------

export function disposeMoonLinesFromSystem(
  moonLines: MoonLines | null,
  system: PlanetSystem | null,
): null {
  if (moonLines) {
    if (system) {
      system.group.remove(moonLines.sequentialGroup)
      system.group.remove(moonLines.radialGroup)
    }
    moonLines.dispose()
  }
  return null
}

export function disposeSigmaBandsFromSystem(
  bands: SigmaBands | null,
  system: PlanetSystem | null,
): null {
  if (bands) {
    if (system) {
      system.group.remove(bands.group)
    }
    bands.dispose()
  }
  return null
}

export function disposeViolationSparksFromSystem(
  sparks: ViolationSparks | null,
  system: PlanetSystem | null,
): null {
  if (sparks) {
    if (system) {
      system.group.remove(sparks.group)
    }
    sparks.dispose()
  }
  return null
}

// ---------------------------------------------------------------------------
// LOD update
// ---------------------------------------------------------------------------

interface LODRefs {
  systems: Map<number, PlanetSystem>
  posMap: Map<number, ConstellationPosition>
  galaxyCards: Map<number, CSS2DObject>
  constellationCards: Map<number, CSS2DObject>
  chars: Characteristic[]
  pathMap: Map<number, string> | null
  moonLines: MoonLines | null
  focusedSystem: PlanetSystem | null
  sigmaBands: SigmaBands | null
  violationSparks: ViolationSparks | null
}

interface LODDisposals {
  moonLines: null
  sigmaBands: null
  violationSparks: null
}

/**
 * Update LOD for all planet systems based on the current zoom level.
 * Disposes stale info cards / overlays and creates new ones for the level.
 *
 * Returns nulled refs for moon lines, sigma bands, and violation sparks
 * (the caller must assign them back to their refs).
 */
export function updateLODForZoomLevel(
  level: ZoomLevel,
  charId: number | null,
  constellationId: number | null,
  refs: LODRefs,
): LODDisposals {
  const { systems, posMap, galaxyCards, constellationCards, chars, pathMap } =
    refs

  // Dispose previous level's overlays
  disposeCardMap(galaxyCards)
  disposeCardMap(constellationCards)
  const ml = disposeMoonLinesFromSystem(refs.moonLines, refs.focusedSystem)
  const sb = disposeSigmaBandsFromSystem(refs.sigmaBands, refs.focusedSystem)
  const vs = disposeViolationSparksFromSystem(
    refs.violationSparks,
    refs.focusedSystem,
  )

  if (systems.size === 0) {
    return { moonLines: ml, sigmaBands: sb, violationSparks: vs }
  }

  if (level === 'galaxy') {
    for (const system of systems.values()) {
      if (system.lod !== 'dot') system.setLOD('dot')
    }
    createGalaxyCards(chars, systems, galaxyCards)
  } else if (level === 'constellation' && constellationId != null) {
    for (const [id, system] of systems.entries()) {
      const pos = posMap.get(id)
      if (pos?.constellationId === constellationId) {
        if (system.lod !== 'halo') system.setLOD('halo')
      } else {
        if (system.lod !== 'dot') system.setLOD('dot')
      }
    }
    createConstellationCards(
      constellationId,
      chars,
      systems,
      posMap,
      constellationCards,
      pathMap,
    )
  } else if (level === 'planet' && charId != null) {
    const targetPos = posMap.get(charId)
    for (const [id, system] of systems.entries()) {
      if (id === charId) {
        if (system.lod !== 'full') system.setLOD('full')
      } else {
        const pos = posMap.get(id)
        if (
          targetPos &&
          pos?.constellationId === targetPos.constellationId
        ) {
          if (system.lod !== 'halo') system.setLOD('halo')
        } else {
          if (system.lod !== 'dot') system.setLOD('dot')
        }
      }
    }
  }

  return { moonLines: ml, sigmaBands: sb, violationSparks: vs }
}

// ---------------------------------------------------------------------------
// Planet-zoom overlay builder (moon lines + sigma bands + violation sparks)
// ---------------------------------------------------------------------------

export interface PlanetZoomOverlays {
  moonLines: MoonLines
  sigmaBands: SigmaBands | null
  violationSparks: ViolationSparks | null
}

/**
 * Build and attach planet-zoom overlays (moon trace lines, sigma bands,
 * violation sparks) to a PlanetSystem. The caller is responsible for
 * storing the returned objects in refs and disposing them later.
 */
export function buildPlanetZoomOverlays(
  chartData: ChartDataLike & {
    control_limits?: {
      ucl?: number | null
      lcl?: number | null
      center_line?: number | null
    } | null
  },
  system: PlanetSystem,
  showTrace: boolean,
  showSpokes: boolean,
): PlanetZoomOverlays {
  const ucl = chartData.control_limits?.ucl ?? null
  const lcl = chartData.control_limits?.lcl ?? null
  const cl = chartData.control_limits?.center_line ?? null
  const gap = controlLimitsToGap(ucl, lcl, cl)
  const moonData = buildSpiralMoonData(chartData, gap, ucl, lcl)

  // Compute spiral baselines for spoke lines
  const spiralBaselines = moonData.map((_, i, arr) =>
    spiralPosition(i, arr.length).baseRadius,
  )

  const lines = new MoonLines()
  lines.update(moonData, gap.center, spiralBaselines)
  lines.setSequentialVisible(showTrace)
  lines.setRadialVisible(showSpokes)
  system.group.add(lines.sequentialGroup)
  system.group.add(lines.radialGroup)

  // Sigma bands
  const isAttribute =
    chartData.data_type === 'attribute' &&
    (chartData.attribute_data_points?.length ?? 0) > 0
  const totalPoints = isAttribute
    ? chartData.attribute_data_points!.length
    : chartData.data_points.length

  let sigmaBands: SigmaBands | null = null
  if (totalPoints >= 2) {
    sigmaBands = new SigmaBands()
    sigmaBands.create(totalPoints)
    system.group.add(sigmaBands.group)
  }

  // Violation sparks
  let violationSparks: ViolationSparks | null = null
  const violationMoons = moonData
    .filter((m) => m.hasViolation)
    .map((m) => ({
      angle: m.angle,
      radius: m.radius,
      isAcknowledged: !m.hasUnacknowledgedViolation,
    }))
  if (violationMoons.length > 0) {
    violationSparks = new ViolationSparks()
    violationSparks.create(violationMoons)
    system.group.add(violationSparks.group)
  }

  return { moonLines: lines, sigmaBands, violationSparks }
}

// ---------------------------------------------------------------------------
// Star field
// ---------------------------------------------------------------------------

/** Create a random star field sphere. Returns the Points mesh and its geometry. */
export function createStarField(
  count: number,
  color: number,
): { mesh: THREE.Points; geometry: THREE.BufferGeometry } {
  const geo = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count * 3; i += 3) {
    const r = 500 + Math.random() * 1000
    const theta = Math.random() * Math.PI * 2
    const p = Math.acos(Math.random() * 2 - 1)
    positions[i] = r * Math.sin(p) * Math.cos(theta)
    positions[i + 1] = r * Math.sin(p) * Math.sin(theta)
    positions[i + 2] = r * Math.cos(p)
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mesh = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color, size: 0.5, transparent: true, opacity: 0.6 }),
  )
  return { mesh, geometry: geo }
}

// ---------------------------------------------------------------------------
// GPU resource sweep (cleanup)
// ---------------------------------------------------------------------------

/**
 * Traverse a scene and dispose all geometries, materials, and textures.
 * Call this as the final cleanup step before disposing the renderer.
 */
export function disposeSceneGPUResources(scene: THREE.Scene): void {
  scene.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    if (mesh.material) {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      for (const mat of materials) {
        for (const key of Object.keys(mat)) {
          const value = (mat as unknown as Record<string, unknown>)[key]
          if (
            value &&
            typeof value === 'object' &&
            'dispose' in value &&
            typeof (value as { dispose: unknown }).dispose === 'function'
          ) {
            ;(value as { dispose: () => void }).dispose()
          }
        }
        mat.dispose()
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Live capability info-card updater
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Chart data → moon sync
// ---------------------------------------------------------------------------

/**
 * Sync chart data to a PlanetSystem: build spiral moons, set data moons,
 * and update the violation tracking set. Returns true if any moon has a violation.
 */
export function syncChartDataToSystem(
  chartData: ChartDataLike & {
    control_limits?: {
      ucl?: number | null
      lcl?: number | null
      center_line?: number | null
    } | null
  },
  system: PlanetSystem,
  charId: number,
  violatingIds: Set<number>,
): void {
  const ucl = chartData.control_limits?.ucl ?? null
  const lcl = chartData.control_limits?.lcl ?? null
  const cl = chartData.control_limits?.center_line ?? null
  const gap = controlLimitsToGap(ucl, lcl, cl)
  const moonData = buildSpiralMoonData(chartData, gap, ucl, lcl)
  system.setDataMoons(moonData)

  if (moonData.some((m) => m.hasViolation)) {
    violatingIds.add(charId)
  } else {
    violatingIds.delete(charId)
  }
}

// ---------------------------------------------------------------------------
// Constellation center computation
// ---------------------------------------------------------------------------

/**
 * Compute the centroid of all positions belonging to a constellation.
 * Returns null if the constellation has no members.
 */
export function computeConstellationCenter(
  constellationId: number,
  posMap: Map<number, ConstellationPosition>,
): THREE.Vector3 | null {
  let cx = 0
  let cz = 0
  let count = 0
  for (const [, p] of posMap) {
    if (p.constellationId === constellationId) {
      cx += p.x
      cz += p.z
      count++
    }
  }
  if (count === 0) return null
  return new THREE.Vector3(cx / count, 0, cz / count)
}

/**
 * Replace the info card for a single characteristic with an updated one
 * that includes live capability data. Works at galaxy or constellation zoom.
 */
export function updateInfoCardForCapability(
  charId: number,
  char: Characteristic,
  capability: CapabilityResult,
  system: PlanetSystem,
  zoomLevel: 'galaxy' | 'constellation',
  galaxyCards: Map<number, CSS2DObject>,
  constellationCards: Map<number, CSS2DObject>,
  pathMap: Map<number, string> | null,
): void {
  if (zoomLevel === 'galaxy') {
    const oldCard = galaxyCards.get(charId)
    if (oldCard) disposeLabel(oldCard)
    const newCard = createGalaxyInfoCard(char, capability)
    system.group.add(newCard)
    galaxyCards.set(charId, newCard)
  } else {
    const oldCard = constellationCards.get(charId)
    if (oldCard) disposeLabel(oldCard)
    const hierarchyPath = pathMap?.get(char.hierarchy_id) ?? undefined
    const newCard = createConstellationCard(char, hierarchyPath, capability)
    system.group.add(newCard)
    constellationCards.set(charId, newCard)
  }
}
