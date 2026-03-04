import * as THREE from 'three'
import {
  createRingVertexShader,
  ringFragmentShader,
} from '@/components/login/saturn-shaders'
import {
  ringHaloVertexShader,
  ringHaloFragmentShader,
} from '@/lib/galaxy/ring-halo-shader'
import {
  blackHoleVertexShader,
  blackHoleFragmentShader,
} from '@/lib/galaxy/black-hole-shader'
import type { LODLevel, MoonState, PlanetSystemConfig } from '@/lib/galaxy/types'

/** Particle counts for the halo LOD tier */
const HALO_PLANET_PARTICLES = 800
const HALO_RING_PARTICLES = 2000
const HALO_CORE_RADIUS_RATIO = 0.97 // relative to planetRadius
const FULL_CORE_RADIUS_RATIO = 0.97 // relative to planetRadius (10.2 / 10.5 ≈ 0.97)
const MIN_PARTICLE_COUNT = 2

/** Moon anomaly state machine values */
const ANOMALY_NORMAL = 0
const ANOMALY_SPIKE = 1
const ANOMALY_RECOVERING = 2
const ANOMALY_HOLD_MIN_MS = 4000
const ANOMALY_HOLD_RANGE_MS = 3000

/** Ring geometry constants — inner/outer derived from config gaps at build time */
const RING_INNER_PADDING = 2.0 // padding inside the innermost gap
const RING_OUTER_PADDING = 2.0 // padding outside the outermost gap
const RING_GAP_LEAK_PROBABILITY = 0.015
const RING_VERTICAL_SPREAD = 0.04

/** Moon sizing: larger dots for visibility at planet zoom */
const MOON_SIZE_NEWEST = 0.18
const MOON_SIZE_OLDEST = 0.10
/** Opacity: gentle fade toward center (inner spiral = oldest = most transparent) */
const MOON_OPACITY_NEWEST = 0.85
const MOON_OPACITY_OLDEST = 0.04

/** Invisible hit-target radius for easier moon click detection */
const MOON_HIT_RADIUS = 0.6

/** Ring shader only receives the newest N points for wake effects (perf) */
const SHADER_MOON_LIMIT = 30

/** Black hole accretion disc particle count */
const BLACK_HOLE_DISC_PARTICLES = 12000
const BLACK_HOLE_INNER_RADIUS = 7.5
const BLACK_HOLE_OUTER_RADIUS = 23.0

/** Cached radial-gradient glow texture shared by all dot sprites */
let glowTextureCache: THREE.CanvasTexture | null = null

function getGlowTexture(): THREE.CanvasTexture {
  if (glowTextureCache) return glowTextureCache

  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const center = size / 2

  const imageData = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - center) / center
      const dy = (y - center) / center
      const r = Math.sqrt(dx * dx + dy * dy)
      const alpha = r <= 1 ? Math.exp(-4 * r * r) : 0
      const idx = (y * size + x) * 4
      imageData.data[idx] = 255
      imageData.data[idx + 1] = 255
      imageData.data[idx + 2] = 255
      imageData.data[idx + 3] = Math.round(alpha * 255)
    }
  }
  ctx.putImageData(imageData, 0, 0)

  glowTextureCache = new THREE.CanvasTexture(canvas)
  return glowTextureCache
}

/**
 * Reusable Three.js planet/ring/moon particle system.
 * Extracted from SaturnScene.tsx so both the login page and galaxy view can consume it.
 *
 * Supports three LOD levels for efficient multi-planet rendering:
 * - `full`  186K particles — planet (6K) + ring (180K) + moons
 * - `halo`  ~2.5K particles — planet (500) + ring band (2K), no moons
 * - `dot`   1 sprite — single colored dot
 *
 * The scene owner is responsible for:
 * - Adding `system.group` to their scene
 * - Calling `system.update(time)` each frame
 * - Calling `system.dispose()` on cleanup
 */
export class PlanetSystem {
  readonly group: THREE.Group

  private readonly config: PlanetSystemConfig
  private moons: MoonState[] = []

  // Current LOD state
  private currentLOD: LODLevel = 'full'

  // Full-LOD resources (nullable — only present when LOD === 'full')
  private planetGeo: THREE.BufferGeometry | null = null
  private planetMat: THREE.PointsMaterial | null = null
  private planet: THREE.Points | null = null
  private coreGeo: THREE.SphereGeometry | null = null
  private coreMat: THREE.MeshBasicMaterial | null = null
  private ringGeo: THREE.BufferGeometry | null = null
  private ringShaderMat: THREE.ShaderMaterial | null = null
  private moonGeo: THREE.SphereGeometry | null = null
  private moonHitGeo: THREE.SphereGeometry | null = null
  private moonHitMat: THREE.MeshBasicMaterial | null = null
  private uMoonsArray: THREE.Vector3[] = []
  private uMoonStatusArray: number[] = []

  // Halo-LOD resources (nullable — only present when LOD === 'halo')
  private haloPlanetGeo: THREE.BufferGeometry | null = null
  private haloPlanetMat: THREE.PointsMaterial | null = null
  private haloCoreGeo: THREE.SphereGeometry | null = null
  private haloCoreMat: THREE.MeshBasicMaterial | null = null
  private haloRingGeo: THREE.BufferGeometry | null = null
  private haloRingMat: THREE.ShaderMaterial | null = null
  private haloPlanet: THREE.Points | null = null

  // Dot-LOD resources (nullable — only present when LOD === 'dot')
  private dotSprite: THREE.Sprite | null = null

  // Ring mesh references for rotation animation
  private ringMesh: THREE.Points | null = null
  private haloRingMesh: THREE.Points | null = null

  // Skip default animated moons (galaxy view creates data-driven moons instead)
  private readonly skipDefaultMoons: boolean
  // Black hole mode: accretion disc + photon ring instead of Saturn rings
  private readonly blackHoleMode: boolean

  // Black hole resources
  private blackHoleGeo: THREE.BufferGeometry | null = null
  private blackHoleMat: THREE.ShaderMaterial | null = null
  private blackHoleMesh: THREE.Points | null = null

  // Reusable scratch color to avoid GC pressure
  private readonly _tmpColor = new THREE.Color()

  // Deferred state: stored when methods are called at a LOD that can't apply them
  private pendingPlanetColor: THREE.Color | null = null
  private pendingDataMoons: Array<{
    angle: number
    radius: number
    hasViolation: boolean
    hasUnacknowledgedViolation?: boolean
  }> | null = null

  constructor(
    config: PlanetSystemConfig,
    initialLOD: LODLevel = 'full',
    options?: { skipDefaultMoons?: boolean; blackHole?: boolean },
  ) {
    this.config = config
    this.group = new THREE.Group()
    this.skipDefaultMoons = options?.skipDefaultMoons ?? false
    this.blackHoleMode = options?.blackHole ?? false

    // Build the requested initial LOD
    switch (initialLOD) {
      case 'dot':
        this.buildDot()
        this.currentLOD = 'dot'
        break
      case 'halo':
        this.buildHalo()
        this.currentLOD = 'halo'
        break
      case 'full':
      default:
        this.buildFull()
        this.currentLOD = 'full'
        break
    }
  }

  // ---------------------------------------------------------------------------
  // LOD switching
  // ---------------------------------------------------------------------------

  /** Current LOD level. */
  get lod(): LODLevel {
    return this.currentLOD
  }

  /** Transition to a new LOD level. Tears down current geometry and builds new. */
  setLOD(level: LODLevel): void {
    if (level === this.currentLOD) return

    this.teardownCurrentLOD()

    switch (level) {
      case 'dot':
        this.buildDot()
        break
      case 'halo':
        this.buildHalo()
        break
      case 'full':
        this.buildFull()
        // Apply any deferred state
        if (this.pendingPlanetColor) {
          this.setPlanetColor(this.pendingPlanetColor)
          this.pendingPlanetColor = null
        }
        if (this.pendingDataMoons) {
          this.setDataMoons(this.pendingDataMoons)
          this.pendingDataMoons = null
        }
        break
    }

    this.currentLOD = level
  }

  // ---------------------------------------------------------------------------
  // Build helpers
  // ---------------------------------------------------------------------------

  private buildFull(): void {
    const { geo, mat, points } = this.createPlanet(
      this.config.planetParticleCount,
    )
    this.planetGeo = geo
    this.planetMat = mat
    this.planet = points

    const core = this.createCore()
    this.coreGeo = core.geo
    this.coreMat = core.mat

    if (this.blackHoleMode) {
      // Black hole: accretion disc + photon ring instead of Saturn rings
      this.darkenPlanetCore()
      const bh = this.createBlackHoleDisc()
      this.blackHoleGeo = bh.geo
      this.blackHoleMat = bh.mat
      this.blackHoleMesh = bh.mesh

      // Still need ring shader for moon wake effects (minimal version)
      const rings = this.createRings()
      this.ringGeo = rings.geo
      this.ringShaderMat = rings.mat
      this.ringMesh = rings.ringsMesh
      // Hide the Saturn ring particles — keep only the shader uniforms
      if (this.ringMesh) this.ringMesh.visible = false
      this.uMoonsArray = rings.uMoonsArray
      this.uMoonStatusArray = rings.uMoonStatusArray
    } else {
      const rings = this.createRings()
      this.ringGeo = rings.geo
      this.ringShaderMat = rings.mat
      this.ringMesh = rings.ringsMesh
      this.uMoonsArray = rings.uMoonsArray
      this.uMoonStatusArray = rings.uMoonStatusArray
    }

    if (this.skipDefaultMoons) {
      // Galaxy view: only create shared geometry, no animated moons
      this.moonGeo = new THREE.SphereGeometry(0.12, 16, 16)
    } else {
      this.moonGeo = this.createMoons()
    }
  }

  private buildHalo(): void {
    const { geo, mat, points } = this.createHaloPlanet()
    this.haloPlanetGeo = geo
    this.haloPlanetMat = mat
    this.haloPlanet = points

    const core = this.createHaloCore()
    this.haloCoreGeo = core.geo
    this.haloCoreMat = core.mat

    const ring = this.createHaloRing()
    this.haloRingGeo = ring.geo
    this.haloRingMat = ring.mat
    this.haloRingMesh = ring.ringsMesh
  }

  private buildDot(): void {
    const spriteMat = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: this.config.colors.gold,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    })
    this.dotSprite = new THREE.Sprite(spriteMat)
    this.dotSprite.scale.setScalar(8.0)
    this.group.add(this.dotSprite)
  }

  // ---------------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------------

  private teardownCurrentLOD(): void {
    // Remove all children from the group
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0])
    }

    switch (this.currentLOD) {
      case 'full':
        this.disposeFull()
        break
      case 'halo':
        this.disposeHalo()
        break
      case 'dot':
        this.disposeDot()
        break
    }
  }

  private disposeFull(): void {
    // Clean up moons
    this.moons.forEach((m) => {
      if (m.anomalyTimeout) clearTimeout(m.anomalyTimeout)
      ;(m.mesh.material as THREE.Material).dispose()
    })
    this.moons = []

    this.planetGeo?.dispose()
    this.planetMat?.dispose()
    this.coreGeo?.dispose()
    this.coreMat?.dispose()
    this.ringGeo?.dispose()
    this.ringShaderMat?.dispose()
    this.moonGeo?.dispose()
    this.moonHitGeo?.dispose()
    this.moonHitMat?.dispose()

    this.planetGeo = null
    this.planetMat = null
    this.planet = null
    this.coreGeo = null
    this.coreMat = null
    this.ringGeo = null
    this.ringShaderMat = null
    this.ringMesh = null
    this.moonGeo = null
    this.moonHitGeo = null
    this.moonHitMat = null
    this.uMoonsArray = []
    this.uMoonStatusArray = []

    this.blackHoleGeo?.dispose()
    this.blackHoleMat?.dispose()
    this.blackHoleGeo = null
    this.blackHoleMat = null
    this.blackHoleMesh = null
  }

  private disposeHalo(): void {
    this.haloPlanetGeo?.dispose()
    this.haloPlanetMat?.dispose()
    this.haloCoreGeo?.dispose()
    this.haloCoreMat?.dispose()
    this.haloRingGeo?.dispose()
    this.haloRingMat?.dispose()

    this.haloPlanetGeo = null
    this.haloPlanetMat = null
    this.haloPlanet = null
    this.haloCoreGeo = null
    this.haloCoreMat = null
    this.haloRingGeo = null
    this.haloRingMat = null
    this.haloRingMesh = null
  }

  private disposeDot(): void {
    if (this.dotSprite) {
      ;(this.dotSprite.material as THREE.Material).dispose()
      this.dotSprite = null
    }
  }

  // ---------------------------------------------------------------------------
  // Full-LOD construction (original logic from SaturnScene)
  // ---------------------------------------------------------------------------

  /** Shared Fibonacci-sphere planet particle builder, used by both full and halo LODs. */
  private buildPlanetParticles(particleCount: number, pointSize: number) {
    const { planetRadius, colors } = this.config
    const { cream, gold } = colors
    const count = Math.max(particleCount, MIN_PARTICLE_COUNT)

    const pPositions = new Float32Array(count * 3)
    const pColors = new Float32Array(count * 3)
    const phi = Math.PI * (3 - Math.sqrt(5))

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = phi * i

      pPositions[i * 3] = Math.cos(theta) * r * planetRadius
      pPositions[i * 3 + 1] = y * planetRadius
      pPositions[i * 3 + 2] = Math.sin(theta) * r * planetRadius

      const mixedColor = cream.clone().lerp(
        gold,
        (y + 1) / 2 + (Math.random() * 0.2 - 0.1),
      )
      pColors[i * 3] = mixedColor.r
      pColors[i * 3 + 1] = mixedColor.g
      pColors[i * 3 + 2] = mixedColor.b
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(pColors, 3))

    const mat = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geo, mat)
    this.group.add(points)

    return { geo, mat, points }
  }

  /** Shared occluder core builder. */
  private buildCoreOccluder(radiusRatio: number, segments: number) {
    const { planetRadius, colors } = this.config
    const geo = new THREE.SphereGeometry(planetRadius * radiusRatio, segments, segments)
    const mat = new THREE.MeshBasicMaterial({ color: colors.navy })
    const core = new THREE.Mesh(geo, mat)
    this.group.add(core)
    return { geo, mat }
  }

  /** Shared ring particle builder with rejection-sampling for gaps. */
  private buildRingParticles(
    particleCount: number,
    shader: { vertex: string; fragment: string },
    uniforms: Record<string, THREE.IUniform>,
  ) {
    const { gaps, colors, planetRadius } = this.config
    const { cream, muted } = colors

    // Derive ring extents from gap positions so each config gets correct coverage
    const innermost = gaps.length > 0 ? Math.min(...gaps.map((g) => g.in)) : planetRadius + 2
    const outermost = gaps.length > 0 ? Math.max(...gaps.map((g) => g.out)) : planetRadius + 12
    const ringInner = innermost - RING_INNER_PADDING
    const ringDepth = outermost + RING_OUTER_PADDING - ringInner

    const rPositions = new Float32Array(particleCount * 3)
    const rColors = new Float32Array(particleCount * 3)

    let ringIdx = 0
    let iterations = 0
    const maxIterations = particleCount * 10 // safety valve
    while (ringIdx < particleCount && iterations < maxIterations) {
      iterations++
      const theta = Math.random() * Math.PI * 2
      const radius = ringInner + Math.pow(Math.random(), 1.2) * ringDepth

      let inGap = false
      for (const g of gaps) {
        if (radius > g.in && radius < g.out) {
          if (Math.random() > RING_GAP_LEAK_PROBABILITY) inGap = true
        }
      }
      if (inGap) continue

      rPositions[ringIdx * 3] = Math.cos(theta) * radius
      rPositions[ringIdx * 3 + 1] = (Math.random() - 0.5) * RING_VERTICAL_SPREAD
      rPositions[ringIdx * 3 + 2] = Math.sin(theta) * radius

      const ringCol = cream.clone().lerp(muted, (radius - ringInner) / ringDepth)
      rColors[ringIdx * 3] = ringCol.r
      rColors[ringIdx * 3 + 1] = ringCol.g
      rColors[ringIdx * 3 + 2] = ringCol.b

      ringIdx++
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(rPositions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(rColors, 3))

    const mat = new THREE.ShaderMaterial({
      vertexShader: shader.vertex,
      fragmentShader: shader.fragment,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const rings = new THREE.Points(geo, mat)
    this.group.add(rings)

    return { geo, mat, ringsMesh: rings }
  }

  private createPlanet(particleCount: number) {
    return this.buildPlanetParticles(particleCount, 0.12)
  }

  private createCore() {
    return this.buildCoreOccluder(FULL_CORE_RADIUS_RATIO, 32)
  }

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
      {
        uMoons: { value: uMoonsArray },
        uMoonStatus: { value: uMoonStatusArray },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uAlertColor: { value: orange },
        uTime: { value: 0 },
      },
    )

    return { geo, mat: mat as THREE.ShaderMaterial, uMoonsArray, uMoonStatusArray, ringsMesh }
  }

  /** Darken planet core particles to simulate an event horizon. */
  private darkenPlanetCore(): void {
    if (!this.planetGeo) return
    const colAttr = this.planetGeo.getAttribute('color')
    const dark = new THREE.Color(0x0a0a1a)
    const rim = new THREE.Color(0x1a1040)
    const posAttr = this.planetGeo.getAttribute('position')
    const { planetRadius } = this.config

    for (let i = 0; i < colAttr.count; i++) {
      // Blend based on height: equator gets a subtle purple rim
      const y = posAttr.getY(i) / planetRadius
      const rimFactor = 1 - Math.abs(y)
      this._tmpColor.copy(dark).lerp(rim, rimFactor * 0.4)
      colAttr.setXYZ(i, this._tmpColor.r, this._tmpColor.g, this._tmpColor.b)
    }
    colAttr.needsUpdate = true
  }

  /** Create the black hole accretion disc + photon ring particle system. */
  private createBlackHoleDisc() {
    const count = BLACK_HOLE_DISC_PARTICLES
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const phases = new Float32Array(count)

    const photonColor = new THREE.Color(0xccccff) // pale blue-white
    const innerGlow = new THREE.Color(0xffaa44) // warm orange
    const outerGlow = new THREE.Color(0x443322) // dark amber

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2

      // Distribution: denser near photon ring (r ≈ 12), sparser outward
      const u = Math.random()
      const radius =
        BLACK_HOLE_INNER_RADIUS +
        Math.pow(u, 0.7) * (BLACK_HOLE_OUTER_RADIUS - BLACK_HOLE_INNER_RADIUS)

      // Slight vertical spread, tighter near center (thin disc)
      const verticalSpread = 0.02 + ((radius - BLACK_HOLE_INNER_RADIUS) / 20) * 0.15
      const y = (Math.random() - 0.5) * verticalSpread

      positions[i * 3] = Math.cos(theta) * radius
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = Math.sin(theta) * radius

      // Color: blue-white near core → orange → dark amber at edges
      const t = (radius - BLACK_HOLE_INNER_RADIUS) / (BLACK_HOLE_OUTER_RADIUS - BLACK_HOLE_INNER_RADIUS)
      const col = t < 0.1
        ? photonColor.clone().lerp(innerGlow, t / 0.1)
        : innerGlow.clone().lerp(outerGlow, (t - 0.1) / 0.9)
      colors[i * 3] = col.r
      colors[i * 3 + 1] = col.g
      colors[i * 3 + 2] = col.b

      // Random orbital phase offset
      phases[i] = Math.random() * Math.PI * 2
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('orbitalPhase', new THREE.BufferAttribute(phases, 1))

    const mat = new THREE.ShaderMaterial({
      vertexShader: blackHoleVertexShader,
      fragmentShader: blackHoleFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const mesh = new THREE.Points(geo, mat)
    this.group.add(mesh)

    return { geo, mat, mesh }
  }

  private createMoons(): THREE.SphereGeometry {
    const { moonCount, gaps, colors } = this.config
    const { cream } = colors

    const moonGeo = new THREE.SphereGeometry(0.12, 16, 16)
    this.moonHitGeo = new THREE.SphereGeometry(MOON_HIT_RADIUS, 8, 8)
    this.moonHitMat = new THREE.MeshBasicMaterial({ visible: false })

    for (let i = 0; i < moonCount; i++) {
      const gap = gaps[i % gaps.length]
      const mat = new THREE.MeshBasicMaterial({ color: cream.clone() })
      const mesh = new THREE.Mesh(moonGeo, mat)
      const hitMesh = new THREE.Mesh(this.moonHitGeo, this.moonHitMat)
      this.group.add(mesh)
      this.group.add(hitMesh)

      const initialAngle = ((Math.PI * 2) / moonCount) * i + Math.random()
      this.moons.push({
        mesh,
        hitMesh,
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

    return moonGeo
  }

  // ---------------------------------------------------------------------------
  // Halo-LOD construction (simplified geometry, no moons)
  // ---------------------------------------------------------------------------

  private createHaloPlanet() {
    return this.buildPlanetParticles(HALO_PLANET_PARTICLES, 0.25)
  }

  private createHaloCore() {
    return this.buildCoreOccluder(HALO_CORE_RADIUS_RATIO, 16)
  }

  private createHaloRing() {
    const result = this.buildRingParticles(
      HALO_RING_PARTICLES,
      { vertex: ringHaloVertexShader, fragment: ringHaloFragmentShader },
      {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
    )
    return result
  }

  // ---------------------------------------------------------------------------
  // Frame update (handles all LOD states)
  // ---------------------------------------------------------------------------

  update(time: number): void {
    // Dot level: no animation needed
    if (this.currentLOD === 'dot') return

    // Halo level: rotate planet and ring slowly, no moon logic
    if (this.currentLOD === 'halo') {
      if (this.haloPlanet) {
        this.haloPlanet.rotation.y += 0.001
      }
      if (this.haloRingMesh) {
        this.haloRingMesh.rotation.y += 0.0005
      }
      return
    }

    // Full level: original behavior
    if (this.ringShaderMat) {
      this.ringShaderMat.uniforms.uTime.value = time
    }
    if (this.blackHoleMat) {
      this.blackHoleMat.uniforms.uTime.value = time
    }
    if (this.planet) {
      this.planet.rotation.y += 0.001
    }
    // Note: ring mesh does NOT rotate — the shader computes wake positions
    // in ring-local space, so rotating the mesh would desync wakes from moons.

    // Moon state machine (skip data-driven moons — they're stationary at their data positions)
    this.moons.forEach((moon, i) => {
      if (moon.speed === 0) return
      this.updateMoon(moon, i, time)
    })

    // Pulse violation moons (data moons have speed === 0 and anomalyState === ANOMALY_SPIKE)
    if (this.currentLOD === 'full') {
      for (const moon of this.moons) {
        if (moon.speed !== 0 || moon.anomalyState !== ANOMALY_SPIKE) continue
        const baseScale = (moon.mesh.userData.baseScale as number) ?? 1
        const pulse = 1 + 0.25 * Math.sin(time * 4 + moon.angle)
        moon.mesh.scale.setScalar(baseScale * pulse)

        const mat = moon.mesh.material as THREE.MeshBasicMaterial
        if (mat.transparent) {
          mat.opacity = 0.6 + 0.4 * Math.abs(Math.sin(time * 2.5 + moon.angle * 2))
        }
      }
    }
  }

  private updateMoon(moon: MoonState, index: number, time: number): void {
    const { colors } = this.config
    const { cream, orange } = colors

    moon.angle += moon.speed

    const currentRot = Math.floor(moon.angle / (Math.PI * 2))
    if (currentRot > moon.currentRotation) {
      if (moon.anomaliesThisRotation === 0) moon.rotationsSinceLastAnomaly++
      else moon.rotationsSinceLastAnomaly = 0
      moon.anomaliesThisRotation = 0
      moon.currentRotation = currentRot
    }

    // 3-State Machine: Normal → Anomaly Spike → Recovering
    if (moon.anomalyState === ANOMALY_NORMAL) {
      // Normal variance within the gap
      moon.targetRadius =
        moon.gap.center +
        Math.sin(time * moon.noiseFreq + moon.noiseOffset) *
          ((moon.gap.out - moon.gap.in) * 0.25)

      let triggerProbability = 0
      if (moon.anomaliesThisRotation < 2) {
        if (moon.rotationsSinceLastAnomaly >= 2) {
          const fraction = (moon.angle / (Math.PI * 2)) % 1
          triggerProbability = 0.002 + fraction * 0.05
        } else {
          triggerProbability = 0.0004
        }
      }

      if (Math.random() < triggerProbability) {
        moon.anomalyState = ANOMALY_SPIKE
        moon.anomaliesThisRotation++
        const dir = Math.random() > 0.5 ? 1 : -1
        moon.anomalyTarget =
          moon.gap.center + dir * ((moon.gap.out - moon.gap.in) * 0.5 + 1.2)

        moon.anomalyTimeout = setTimeout(
          () => {
            if (moon.anomalyState === ANOMALY_SPIKE) moon.anomalyState = ANOMALY_RECOVERING
          },
          ANOMALY_HOLD_MIN_MS + Math.random() * ANOMALY_HOLD_RANGE_MS,
        )
      }
    } else if (moon.anomalyState === ANOMALY_SPIKE) {
      // Hold the anomaly position
      moon.targetRadius = moon.anomalyTarget
    } else if (moon.anomalyState === ANOMALY_RECOVERING) {
      // Recovering: slowly return to baseline variance
      moon.targetRadius =
        moon.gap.center +
        Math.sin(time * moon.noiseFreq + moon.noiseOffset) *
          ((moon.gap.out - moon.gap.in) * 0.25)

      if (Math.abs(moon.currentRadius - moon.targetRadius) < 0.3) {
        moon.anomalyState = ANOMALY_NORMAL
      }
    }

    // Fast outward spike, very slow lazy drift back
    const transitionSpeed = moon.anomalyState === ANOMALY_SPIKE ? 0.015 : 0.003
    moon.currentRadius += (moon.targetRadius - moon.currentRadius) * transitionSpeed

    let status = 0
    const buffer = 0.8
    if (moon.currentRadius < moon.gap.in + buffer)
      status = (moon.gap.in + buffer - moon.currentRadius) / buffer
    if (moon.currentRadius > moon.gap.out - buffer)
      status = (moon.currentRadius - (moon.gap.out - buffer)) / buffer
    status = Math.max(0, Math.min(1, status))

    const px = Math.cos(moon.angle) * moon.currentRadius
    const pz = Math.sin(moon.angle) * moon.currentRadius
    moon.mesh.position.set(px, 0, pz)
    moon.hitMesh.position.set(px, 0, pz)

    ;(moon.mesh.material as THREE.MeshBasicMaterial).color.lerpColors(
      cream,
      orange,
      status,
    )
    moon.mesh.scale.setScalar(1.0 + status * 0.6)

    if (this.ringShaderMat) {
      this.ringShaderMat.uniforms.uMoons.value[index].set(
        moon.currentRadius,
        moon.angle,
        moon.gap.center,
      )
      this.ringShaderMat.uniforms.uMoonStatus.value[index] = status
    }
  }

  // ---------------------------------------------------------------------------
  // Public API for galaxy view
  // ---------------------------------------------------------------------------

  /** Set a moon's orbital position directly (for external control). */
  setMoonPosition(index: number, angle: number, radius: number): void {
    if (this.currentLOD !== 'full') return
    const moon = this.moons[index]
    if (!moon) return
    moon.angle = angle
    moon.currentRadius = radius
    moon.targetRadius = radius
    const px = Math.cos(angle) * radius
    const pz = Math.sin(angle) * radius
    moon.mesh.position.set(px, 0, pz)
    moon.hitMesh.position.set(px, 0, pz)
    this.uMoonsArray[index].set(radius, angle, moon.gap.center)
  }

  /** Trigger anomaly state on a specific moon. direction: 1 = outward, -1 = inward. */
  triggerMoonAnomaly(index: number, direction: 1 | -1): void {
    if (this.currentLOD !== 'full') return
    const moon = this.moons[index]
    if (!moon) return
    moon.anomalyState = ANOMALY_SPIKE
    moon.anomaliesThisRotation++
    moon.anomalyTarget =
      moon.gap.center + direction * ((moon.gap.out - moon.gap.in) * 0.5 + 1.2)

    if (moon.anomalyTimeout) clearTimeout(moon.anomalyTimeout)
    moon.anomalyTimeout = setTimeout(
      () => {
        if (moon.anomalyState === ANOMALY_SPIKE) moon.anomalyState = ANOMALY_RECOVERING
      },
      ANOMALY_HOLD_MIN_MS + Math.random() * ANOMALY_HOLD_RANGE_MS,
    )
  }

  /** Remove all existing moons and create new ones at data-driven positions. */
  setDataMoons(
    samples: Array<{ angle: number; radius: number; hasViolation: boolean; hasUnacknowledgedViolation?: boolean }>,
  ): void {
    // If not at full LOD, store for deferred application
    if (this.currentLOD !== 'full') {
      this.pendingDataMoons = samples
      return
    }

    if (!this.ringShaderMat || !this.moonGeo) return

    // Remove existing moon meshes and hit meshes from group and dispose materials
    this.moons.forEach((m) => {
      this.group.remove(m.mesh)
      this.group.remove(m.hitMesh)
      ;(m.mesh.material as THREE.Material).dispose()
      if (m.anomalyTimeout) clearTimeout(m.anomalyTimeout)
    })

    const uniformMoons = this.ringShaderMat.uniforms.uMoons
      .value as THREE.Vector3[]
    const uniformStatus = this.ringShaderMat.uniforms.uMoonStatus
      .value as number[]
    const gapCenter = this.config.gaps[0]?.center ?? 11.5
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
      mesh.userData.baseScale = moonSize / 0.12
      this.group.add(mesh)

      // Invisible hit target for easier click detection
      if (!this.moonHitGeo) this.moonHitGeo = new THREE.SphereGeometry(MOON_HIT_RADIUS, 8, 8)
      if (!this.moonHitMat) this.moonHitMat = new THREE.MeshBasicMaterial({ visible: false })
      const hitMesh = new THREE.Mesh(this.moonHitGeo, this.moonHitMat)
      this.group.add(hitMesh)

      const px = Math.cos(sample.angle) * sample.radius
      const pz = Math.sin(sample.angle) * sample.radius
      mesh.position.set(px, 0, pz)
      hitMesh.position.set(px, 0, pz)

      // Feed only the newest SHADER_MOON_LIMIT points to the ring shader
      const shaderSlot = i - (total - Math.min(total, SHADER_MOON_LIMIT))
      if (shaderSlot >= 0 && shaderSlot < uniformMoons.length) {
        uniformMoons[shaderSlot].set(sample.radius, sample.angle, gapCenter)
        uniformStatus[shaderSlot] = sample.hasViolation ? 0.8 : 0
      }

      // Color and scale violation moons
      const isUnacked = sample.hasUnacknowledgedViolation ?? sample.hasViolation
      if (sample.hasViolation) {
        if (isUnacked) {
          // Unacknowledged: bright orange, 1.4x scale
          ;(mesh.material as THREE.MeshBasicMaterial).color.copy(
            this.config.colors.orange,
          )
          mesh.scale.multiplyScalar(1.4)
          mesh.userData.baseScale *= 1.4
        } else {
          // Acknowledged: muted amber, 1.15x scale
          ;(mesh.material as THREE.MeshBasicMaterial).color.set('#9B7D4A')
          mesh.scale.multiplyScalar(1.15)
          mesh.userData.baseScale *= 1.15
        }
      }

      return {
        mesh,
        hitMesh,
        angle: sample.angle,
        speed: 0, // data moons don't orbit randomly
        gap: this.config.gaps[0] ?? { in: 10.0, out: 13.0, center: 11.5 },
        currentRadius: sample.radius,
        targetRadius: sample.radius,
        anomalyState: isUnacked ? ANOMALY_SPIKE : ANOMALY_NORMAL,
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

    // Hide accretion disc when data moons are present (sigma flow replaces it)
    if (this.blackHoleMesh) {
      this.blackHoleMesh.visible = this.moons.length === 0
    }
  }

  /** Update planet surface color (e.g. for Cpk-driven coloring). */
  setPlanetColor(color: THREE.Color): void {
    // Full LOD: apply to full planet geometry
    if (this.currentLOD === 'full' && this.planetGeo) {
      const posAttr = this.planetGeo.getAttribute('position')
      const colAttr = this.planetGeo.getAttribute('color')
      const { planetRadius } = this.config

      for (let i = 0; i < posAttr.count; i++) {
        const y = posAttr.getY(i) / planetRadius
        this._tmpColor
          .copy(color)
          .lerp(
            this.config.colors.gold,
            (y + 1) / 2 + (Math.random() * 0.2 - 0.1),
          )
        colAttr.setXYZ(i, this._tmpColor.r, this._tmpColor.g, this._tmpColor.b)
      }
      colAttr.needsUpdate = true
      return
    }

    // Dot LOD: update sprite color directly
    if (this.currentLOD === 'dot' && this.dotSprite) {
      ;(this.dotSprite.material as THREE.SpriteMaterial).color.copy(color)
      return
    }

    // Halo LOD: update halo planet particles directly
    if (this.currentLOD === 'halo' && this.haloPlanetGeo) {
      const posAttr = this.haloPlanetGeo.getAttribute('position')
      const colAttr = this.haloPlanetGeo.getAttribute('color')
      const { planetRadius } = this.config

      for (let i = 0; i < posAttr.count; i++) {
        const y = posAttr.getY(i) / planetRadius
        this._tmpColor
          .copy(color)
          .lerp(
            this.config.colors.gold,
            (y + 1) / 2 + (Math.random() * 0.2 - 0.1),
          )
        colAttr.setXYZ(i, this._tmpColor.r, this._tmpColor.g, this._tmpColor.b)
      }
      colAttr.needsUpdate = true
      // Also store as pending so full LOD upgrade picks it up
      this.pendingPlanetColor = color.clone()
      return
    }

    // Missing geometry: store for deferred application
    this.pendingPlanetColor = color.clone()
  }

  /** Return the hit-target mesh array for raycasting (read-only). */
  getMoonMeshes(): THREE.Mesh[] {
    return this.moons.map((m) => m.hitMesh)
  }

  /** Update the dot sprite's color directly (convenience for galaxy view). */
  setDotColor(color: THREE.Color): void {
    if (this.dotSprite) {
      ;(this.dotSprite.material as THREE.SpriteMaterial).color.copy(color)
    }
  }

  /** Update the shader's pixel ratio uniform (call on resize). */
  setPixelRatio(ratio: number): void {
    if (this.ringShaderMat) {
      this.ringShaderMat.uniforms.uPixelRatio.value = ratio
    }
    if (this.haloRingMat) {
      this.haloRingMat.uniforms.uPixelRatio.value = ratio
    }
  }

  /** Clean up all GPU resources. Works at any LOD level. */
  dispose(): void {
    // Remove all children from the group to prevent reference leaks
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0])
    }

    switch (this.currentLOD) {
      case 'full':
        this.disposeFull()
        break
      case 'halo':
        this.disposeHalo()
        break
      case 'dot':
        this.disposeDot()
        break
    }
  }
}
