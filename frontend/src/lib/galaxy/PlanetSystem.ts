import * as THREE from 'three'
import { ringVertexShader, ringFragmentShader } from '@/components/login/saturn-shaders'
import {
  ringHaloVertexShader,
  ringHaloFragmentShader,
} from '@/lib/galaxy/ring-halo-shader'
import type { LODLevel, MoonState, PlanetSystemConfig } from '@/lib/galaxy/types'

/** Particle counts for the halo LOD tier */
const HALO_PLANET_PARTICLES = 500
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

/** Ring geometry constants */
const RING_INNER_RADIUS = 12.0
const RING_RADIAL_DEPTH = 20.0
const RING_GAP_LEAK_PROBABILITY = 0.015
const RING_VERTICAL_SPREAD = 0.04

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

  // Reusable scratch color to avoid GC pressure
  private readonly _tmpColor = new THREE.Color()

  // Deferred state: stored when methods are called at a LOD that can't apply them
  private pendingPlanetColor: THREE.Color | null = null
  private pendingDataMoons: Array<{
    angle: number
    radius: number
    hasViolation: boolean
  }> | null = null

  constructor(config: PlanetSystemConfig, initialLOD: LODLevel = 'full') {
    this.config = config
    this.group = new THREE.Group()

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

    const rings = this.createRings()
    this.ringGeo = rings.geo
    this.ringShaderMat = rings.mat
    this.uMoonsArray = rings.uMoonsArray
    this.uMoonStatusArray = rings.uMoonStatusArray

    this.moonGeo = this.createMoons()
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
  }

  private buildDot(): void {
    const spriteMat = new THREE.SpriteMaterial({
      color: this.config.colors.gold,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    })
    this.dotSprite = new THREE.Sprite(spriteMat)
    this.dotSprite.scale.setScalar(0.5)
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

    this.planetGeo = null
    this.planetMat = null
    this.planet = null
    this.coreGeo = null
    this.coreMat = null
    this.ringGeo = null
    this.ringShaderMat = null
    this.moonGeo = null
    this.uMoonsArray = []
    this.uMoonStatusArray = []
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
    const { gaps, colors } = this.config
    const { cream, muted } = colors

    const rPositions = new Float32Array(particleCount * 3)
    const rColors = new Float32Array(particleCount * 3)

    let ringIdx = 0
    let iterations = 0
    const maxIterations = particleCount * 10 // safety valve
    while (ringIdx < particleCount && iterations < maxIterations) {
      iterations++
      const theta = Math.random() * Math.PI * 2
      const radius = RING_INNER_RADIUS + Math.pow(Math.random(), 1.2) * RING_RADIAL_DEPTH

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

      const ringCol = cream.clone().lerp(muted, (radius - RING_INNER_RADIUS) / RING_RADIAL_DEPTH)
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

    return { geo, mat }
  }

  private createPlanet(particleCount: number) {
    return this.buildPlanetParticles(particleCount, 0.12)
  }

  private createCore() {
    return this.buildCoreOccluder(FULL_CORE_RADIUS_RATIO, 32)
  }

  private createRings() {
    const { moonCount, colors } = this.config
    const { orange } = colors

    const uMoonsArray: THREE.Vector3[] = []
    const uMoonStatusArray: number[] = []
    for (let i = 0; i < moonCount; i++) {
      uMoonsArray.push(new THREE.Vector3())
      uMoonStatusArray.push(0)
    }

    const { geo, mat } = this.buildRingParticles(
      this.config.ringParticleCount,
      { vertex: ringVertexShader, fragment: ringFragmentShader },
      {
        uMoons: { value: uMoonsArray },
        uMoonStatus: { value: uMoonStatusArray },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uAlertColor: { value: orange },
        uTime: { value: 0 },
      },
    )

    return { geo, mat: mat as THREE.ShaderMaterial, uMoonsArray, uMoonStatusArray }
  }

  private createMoons(): THREE.SphereGeometry {
    const { moonCount, gaps, colors } = this.config
    const { cream } = colors

    const moonGeo = new THREE.SphereGeometry(0.12, 16, 16)

    for (let i = 0; i < moonCount; i++) {
      const gap = gaps[i % gaps.length]
      const mat = new THREE.MeshBasicMaterial({ color: cream.clone() })
      const mesh = new THREE.Mesh(moonGeo, mat)
      this.group.add(mesh)

      const initialAngle = ((Math.PI * 2) / moonCount) * i + Math.random()
      this.moons.push({
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

    return moonGeo
  }

  // ---------------------------------------------------------------------------
  // Halo-LOD construction (simplified geometry, no moons)
  // ---------------------------------------------------------------------------

  private createHaloPlanet() {
    return this.buildPlanetParticles(HALO_PLANET_PARTICLES, 0.18)
  }

  private createHaloCore() {
    return this.buildCoreOccluder(HALO_CORE_RADIUS_RATIO, 16)
  }

  private createHaloRing() {
    return this.buildRingParticles(
      HALO_RING_PARTICLES,
      { vertex: ringHaloVertexShader, fragment: ringHaloFragmentShader },
      {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
    )
  }

  // ---------------------------------------------------------------------------
  // Frame update (handles all LOD states)
  // ---------------------------------------------------------------------------

  update(time: number): void {
    // Dot level: no animation needed
    if (this.currentLOD === 'dot') return

    // Halo level: rotate planet slowly, no moon logic
    if (this.currentLOD === 'halo') {
      if (this.haloPlanet) {
        this.haloPlanet.rotation.y += 0.001
      }
      return
    }

    // Full level: original behavior
    if (this.ringShaderMat) {
      this.ringShaderMat.uniforms.uTime.value = time
    }
    if (this.planet) {
      this.planet.rotation.y += 0.001
    }

    // Moon state machine (skip data-driven moons — they're stationary at their data positions)
    this.moons.forEach((moon, i) => {
      if (moon.speed === 0) return
      this.updateMoon(moon, i, time)
    })
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

    moon.mesh.position.set(
      Math.cos(moon.angle) * moon.currentRadius,
      0,
      Math.sin(moon.angle) * moon.currentRadius,
    )

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
    moon.mesh.position.set(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius,
    )
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

    this.moons = samples.slice(0, this.config.moonCount).map((sample, i) => {
      const mat = new THREE.MeshBasicMaterial({
        color: this.config.colors.cream.clone(),
      })
      const mesh = new THREE.Mesh(this.moonGeo, mat)
      this.group.add(mesh)

      mesh.position.set(
        Math.cos(sample.angle) * sample.radius,
        0,
        Math.sin(sample.angle) * sample.radius,
      )

      // Update shader uniforms for wake effects
      if (i < uniformMoons.length) {
        uniformMoons[i].set(sample.radius, sample.angle, gapCenter)
        uniformStatus[i] = sample.hasViolation ? 0.8 : 0
      }

      // Color and scale violation moons
      if (sample.hasViolation) {
        ;(mesh.material as THREE.MeshBasicMaterial).color.copy(
          this.config.colors.orange,
        )
        mesh.scale.setScalar(1.6)
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
    for (let i = this.moons.length; i < uniformMoons.length; i++) {
      uniformMoons[i].set(0, 0, 0)
      uniformStatus[i] = 0
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

    // Halo LOD or missing geometry: store for deferred application
    this.pendingPlanetColor = color.clone()
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
