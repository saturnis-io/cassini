import * as THREE from 'three'
import {
  sigmaFlowVertexShader,
  sigmaFlowFragmentShader,
  violationEmitVertexShader,
  violationEmitFragmentShader,
} from '@/lib/galaxy/sigma-flow-shader'

/**
 * Flowing particle river along the Archimedean spiral data path.
 * Particles spawn near the newest data point (outer edge) and flow
 * inward toward the black hole, colored by which sigma zone they
 * occupy: green (±1σ), yellow (±2σ), red (±3σ).
 *
 * Violation moons emit a separate stream of red particles that shoot
 * along the spiral flow direction and fade/die over 2-3 data point
 * spacings. The sigma band particles are never distorted.
 */

const FLOW_PARTICLE_COUNT = 180000
const EMIT_PARTICLES_PER_SLOT = 600
const SPIRAL_INNER = 13.0
const SPIRAL_OUTER = 31.0
const POINTS_PER_TURN = 25
const MAX_VIOLATIONS = 16

export interface ViolationMoonData {
  angle: number
  radius: number
  /** 1.0 = unacknowledged (bright), 0.5 = acknowledged (muted), 0.0 = inactive */
  status: number
}

export class SigmaBands {
  readonly group: THREE.Group

  // Sigma flow particles
  private geo: THREE.BufferGeometry | null = null
  private mat: THREE.ShaderMaterial | null = null
  private mesh: THREE.Points | null = null

  // Violation emission particles
  private emitGeo: THREE.BufferGeometry | null = null
  private emitMat: THREE.ShaderMaterial | null = null
  private emitMesh: THREE.Points | null = null

  constructor() {
    this.group = new THREE.Group()
  }

  /**
   * Build the flowing particle system + violation emission system.
   * @param total - number of data points (determines spiral shape/turns)
   * @param maxDisplacementFraction - fraction of armSpacing for ±3σ width (0.35)
   */
  create(total: number, maxDisplacementFraction = 0.35): void {
    this.dispose()
    if (total < 2) return

    const totalTurns = Math.max(1, Math.ceil(total / POINTS_PER_TURN))
    const armSpacing = (SPIRAL_OUTER - SPIRAL_INNER) / totalTurns
    const maxDisplacement = armSpacing * maxDisplacementFraction

    // --- Sigma flow particles (unchanged) ---
    const count = FLOW_PARTICLE_COUNT
    const positions = new Float32Array(count * 3)
    const spiralTs = new Float32Array(count)
    const radialOffsets = new Float32Array(count)
    const flowSpeeds = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      spiralTs[i] = Math.random()
      radialOffsets[i] =
        (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
      flowSpeeds[i] = 0.003 + Math.random() * 0.002
    }

    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.geo.setAttribute('spiralT', new THREE.BufferAttribute(spiralTs, 1))
    this.geo.setAttribute(
      'radialOffset',
      new THREE.BufferAttribute(radialOffsets, 1),
    )
    this.geo.setAttribute(
      'flowSpeed',
      new THREE.BufferAttribute(flowSpeeds, 1),
    )

    this.geo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 0),
      SPIRAL_OUTER + maxDisplacement + 2,
    )

    this.mat = new THREE.ShaderMaterial({
      vertexShader: sigmaFlowVertexShader,
      fragmentShader: sigmaFlowFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uInnerRadius: { value: SPIRAL_INNER },
        uOuterRadius: { value: SPIRAL_OUTER },
        uTotalTurns: { value: totalTurns },
        uMaxDisplacement: { value: maxDisplacement },
        uTotalPoints: { value: total },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    this.mesh = new THREE.Points(this.geo, this.mat)
    this.group.add(this.mesh)

    // --- Violation emission particles ---
    this.createEmissionSystem(total, totalTurns, maxDisplacement)
  }

  private createEmissionSystem(
    total: number,
    totalTurns: number,
    maxDisplacement: number,
  ): void {
    const emitCount = EMIT_PARTICLES_PER_SLOT * MAX_VIOLATIONS
    const emitPositions = new Float32Array(emitCount * 3)
    const birthPhases = new Float32Array(emitCount)
    const emitterSlots = new Float32Array(emitCount)
    const coneAngles = new Float32Array(emitCount)
    const emitSpeeds = new Float32Array(emitCount)

    for (let slot = 0; slot < MAX_VIOLATIONS; slot++) {
      for (let p = 0; p < EMIT_PARTICLES_PER_SLOT; p++) {
        const idx = slot * EMIT_PARTICLES_PER_SLOT + p
        birthPhases[idx] = Math.random()
        emitterSlots[idx] = slot
        // Bell-curve cone spread: denser at center, thinner at edges
        coneAngles[idx] = (Math.random() + Math.random() - 1.0)
        // Travel speed variation so particles don't all move in lockstep
        emitSpeeds[idx] = Math.random()
      }
    }

    this.emitGeo = new THREE.BufferGeometry()
    this.emitGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(emitPositions, 3),
    )
    this.emitGeo.setAttribute(
      'birthPhase',
      new THREE.BufferAttribute(birthPhases, 1),
    )
    this.emitGeo.setAttribute(
      'emitterSlot',
      new THREE.BufferAttribute(emitterSlots, 1),
    )
    this.emitGeo.setAttribute(
      'coneAngle',
      new THREE.BufferAttribute(coneAngles, 1),
    )
    this.emitGeo.setAttribute(
      'emitSpeed',
      new THREE.BufferAttribute(emitSpeeds, 1),
    )

    this.emitGeo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 0),
      SPIRAL_OUTER + maxDisplacement + 2,
    )

    // Shared violation uniform array
    const emptyMoons: THREE.Vector3[] = []
    for (let i = 0; i < MAX_VIOLATIONS; i++) {
      emptyMoons.push(new THREE.Vector3(0, 0, 0))
    }

    this.emitMat = new THREE.ShaderMaterial({
      vertexShader: violationEmitVertexShader,
      fragmentShader: violationEmitFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uInnerRadius: { value: SPIRAL_INNER },
        uOuterRadius: { value: SPIRAL_OUTER },
        uTotalTurns: { value: totalTurns },
        uMaxDisplacement: { value: maxDisplacement },
        uViolationMoons: { value: emptyMoons },
        uAlertColor: { value: new THREE.Color('#FF3B30') },
        uAckColor: { value: new THREE.Color('#9B7D4A') },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    this.emitMesh = new THREE.Points(this.emitGeo, this.emitMat)
    this.group.add(this.emitMesh)
  }

  /**
   * Set violation moon positions for the emission system.
   * Moons beyond MAX_VIOLATIONS are silently ignored.
   */
  setViolationMoons(moons: ViolationMoonData[]): void {
    if (!this.emitMat) return

    const uniforms = this.emitMat.uniforms.uViolationMoons
      .value as THREE.Vector3[]

    for (let i = 0; i < MAX_VIOLATIONS; i++) {
      if (i < moons.length) {
        uniforms[i].set(moons[i].angle, moons[i].radius, moons[i].status)
      } else {
        uniforms[i].set(0, 0, 0)
      }
    }
  }

  /** Advance both particle systems. Call each frame with elapsed time. */
  update(time: number): void {
    if (this.mat) {
      this.mat.uniforms.uTime.value = time
    }
    if (this.emitMat) {
      this.emitMat.uniforms.uTime.value = time
    }
  }

  dispose(): void {
    if (this.mesh) this.group.remove(this.mesh)
    if (this.emitMesh) this.group.remove(this.emitMesh)
    this.geo?.dispose()
    this.mat?.dispose()
    this.emitGeo?.dispose()
    this.emitMat?.dispose()
    this.geo = null
    this.mat = null
    this.mesh = null
    this.emitGeo = null
    this.emitMat = null
    this.emitMesh = null
  }
}
