import * as THREE from 'three'
import { ringVertexShader, ringFragmentShader } from '@/components/login/saturn-shaders'
import type { MoonState, PlanetSystemConfig } from '@/lib/galaxy/types'

/**
 * Reusable Three.js planet/ring/moon particle system.
 * Extracted from SaturnScene.tsx so both the login page and galaxy view can consume it.
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

  // Geometries (kept for dispose)
  private readonly planetGeo: THREE.BufferGeometry
  private readonly planetMat: THREE.PointsMaterial
  private readonly coreGeo: THREE.SphereGeometry
  private readonly coreMat: THREE.MeshBasicMaterial
  private readonly ringGeo: THREE.BufferGeometry
  private readonly ringShaderMat: THREE.ShaderMaterial
  private readonly moonGeo: THREE.SphereGeometry

  // References needed during update()
  private readonly planet: THREE.Points
  private readonly uMoonsArray: THREE.Vector3[]
  private readonly uMoonStatusArray: number[]

  constructor(config: PlanetSystemConfig) {
    this.config = config
    this.group = new THREE.Group()

    // Build all sub-objects
    ;({ geo: this.planetGeo, mat: this.planetMat, points: this.planet } = this.createPlanet())
    ;({ geo: this.coreGeo, mat: this.coreMat } = this.createCore())
    ;({
      geo: this.ringGeo,
      mat: this.ringShaderMat,
      uMoonsArray: this.uMoonsArray,
      uMoonStatusArray: this.uMoonStatusArray,
    } = this.createRings())
    this.moonGeo = this.createMoons()
  }

  // ---------------------------------------------------------------------------
  // Construction helpers (verbatim from SaturnScene)
  // ---------------------------------------------------------------------------

  private createPlanet() {
    const { planetParticleCount, planetRadius, colors } = this.config
    const { cream, gold } = colors

    const pPositions = new Float32Array(planetParticleCount * 3)
    const pColors = new Float32Array(planetParticleCount * 3)
    const phi = Math.PI * (3 - Math.sqrt(5))

    for (let i = 0; i < planetParticleCount; i++) {
      const y = 1 - (i / (planetParticleCount - 1)) * 2
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
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geo, mat)
    this.group.add(points)

    return { geo, mat, points }
  }

  private createCore() {
    const { colors } = this.config
    const geo = new THREE.SphereGeometry(10.2, 32, 32)
    const mat = new THREE.MeshBasicMaterial({ color: colors.navy })
    const core = new THREE.Mesh(geo, mat)
    this.group.add(core)
    return { geo, mat }
  }

  private createRings() {
    const { ringParticleCount, gaps, moonCount, colors } = this.config
    const { cream, muted, orange } = colors

    const rPositions = new Float32Array(ringParticleCount * 3)
    const rColors = new Float32Array(ringParticleCount * 3)

    let ringIdx = 0
    while (ringIdx < ringParticleCount) {
      const theta = Math.random() * Math.PI * 2
      const radius = 12.0 + Math.pow(Math.random(), 1.2) * 20.0

      let inGap = false
      for (const g of gaps) {
        if (radius > g.in && radius < g.out) {
          if (Math.random() > 0.015) inGap = true
        }
      }
      if (inGap) continue

      rPositions[ringIdx * 3] = Math.cos(theta) * radius
      rPositions[ringIdx * 3 + 1] = (Math.random() - 0.5) * 0.04
      rPositions[ringIdx * 3 + 2] = Math.sin(theta) * radius

      const ringCol = cream.clone().lerp(muted, (radius - 12.0) / 20.0)
      rColors[ringIdx * 3] = ringCol.r
      rColors[ringIdx * 3 + 1] = ringCol.g
      rColors[ringIdx * 3 + 2] = ringCol.b

      ringIdx++
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(rPositions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(rColors, 3))

    const uMoonsArray: THREE.Vector3[] = []
    const uMoonStatusArray: number[] = []
    for (let i = 0; i < moonCount; i++) {
      uMoonsArray.push(new THREE.Vector3())
      uMoonStatusArray.push(0)
    }

    const mat = new THREE.ShaderMaterial({
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

    const rings = new THREE.Points(geo, mat)
    this.group.add(rings)

    return { geo, mat, uMoonsArray, uMoonStatusArray }
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
  // Frame update (verbatim moon state machine from SaturnScene animate())
  // ---------------------------------------------------------------------------

  update(time: number): void {
    // Pass time to the shader for active ripple undulation
    this.ringShaderMat.uniforms.uTime.value = time

    this.planet.rotation.y += 0.001

    // Moon state machine
    this.moons.forEach((moon, i) => {
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

    // 3-State Machine: 0 = Normal, 1 = Anomaly Spike, 2 = Recovering
    if (moon.anomalyState === 0) {
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
        moon.anomalyState = 1
        moon.anomaliesThisRotation++
        const dir = Math.random() > 0.5 ? 1 : -1
        moon.anomalyTarget =
          moon.gap.center + dir * ((moon.gap.out - moon.gap.in) * 0.5 + 1.2)

        // Transition to Recovery State (2) after holding the anomaly
        moon.anomalyTimeout = setTimeout(
          () => {
            if (moon.anomalyState === 1) moon.anomalyState = 2
          },
          4000 + Math.random() * 3000,
        )
      }
    } else if (moon.anomalyState === 1) {
      // Hold the anomaly position
      moon.targetRadius = moon.anomalyTarget
    } else if (moon.anomalyState === 2) {
      // Recovering: slowly return to baseline variance
      moon.targetRadius =
        moon.gap.center +
        Math.sin(time * moon.noiseFreq + moon.noiseOffset) *
          ((moon.gap.out - moon.gap.in) * 0.25)

      // Once safely back near the center, reset to Normal (0)
      if (Math.abs(moon.currentRadius - moon.targetRadius) < 0.3) {
        moon.anomalyState = 0
      }
    }

    // Fast outward spike, very slow lazy drift back
    const transitionSpeed = moon.anomalyState === 1 ? 0.015 : 0.003
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

    this.ringShaderMat.uniforms.uMoons.value[index].set(
      moon.currentRadius,
      moon.angle,
      moon.gap.center,
    )
    this.ringShaderMat.uniforms.uMoonStatus.value[index] = status
  }

  // ---------------------------------------------------------------------------
  // Public API for galaxy view
  // ---------------------------------------------------------------------------

  /** Set a moon's orbital position directly (for external control). */
  setMoonPosition(index: number, angle: number, radius: number): void {
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
    const moon = this.moons[index]
    if (!moon) return
    moon.anomalyState = 1
    moon.anomaliesThisRotation++
    moon.anomalyTarget =
      moon.gap.center + direction * ((moon.gap.out - moon.gap.in) * 0.5 + 1.2)

    if (moon.anomalyTimeout) clearTimeout(moon.anomalyTimeout)
    moon.anomalyTimeout = setTimeout(
      () => {
        if (moon.anomalyState === 1) moon.anomalyState = 2
      },
      4000 + Math.random() * 3000,
    )
  }

  /** Remove all existing moons and create new ones at data-driven positions. */
  setDataMoons(
    samples: Array<{ angle: number; radius: number; hasViolation: boolean }>,
  ): void {
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
        anomalyState: sample.hasViolation ? 1 : 0,
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
    const posAttr = this.planetGeo.getAttribute('position')
    const colAttr = this.planetGeo.getAttribute('color')
    const { planetRadius } = this.config
    const tmp = new THREE.Color() // reuse one instance

    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i) / planetRadius
      tmp
        .copy(color)
        .lerp(this.config.colors.gold, (y + 1) / 2 + (Math.random() * 0.2 - 0.1))
      colAttr.setXYZ(i, tmp.r, tmp.g, tmp.b)
    }
    colAttr.needsUpdate = true
  }

  /** Update the shader's pixel ratio uniform (call on resize). */
  setPixelRatio(ratio: number): void {
    this.ringShaderMat.uniforms.uPixelRatio.value = ratio
  }

  /** Clean up all GPU resources. */
  dispose(): void {
    this.moons.forEach((m) => {
      if (m.anomalyTimeout) clearTimeout(m.anomalyTimeout)
      ;(m.mesh.material as THREE.Material).dispose()
    })

    this.planetGeo.dispose()
    this.planetMat.dispose()
    this.coreGeo.dispose()
    this.coreMat.dispose()
    this.ringGeo.dispose()
    this.ringShaderMat.dispose()
    this.moonGeo.dispose()
  }
}
