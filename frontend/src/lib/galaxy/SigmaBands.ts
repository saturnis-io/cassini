import * as THREE from 'three'
import {
  sigmaFlowVertexShader,
  sigmaFlowFragmentShader,
} from '@/lib/galaxy/sigma-flow-shader'

/**
 * Flowing particle river along the Archimedean spiral data path.
 * Particles spawn near the newest data point (outer edge) and flow
 * inward toward the black hole, colored by which sigma zone they
 * occupy: green (±1σ), yellow (±2σ), red (±3σ).
 *
 * Violation effects are handled by the ring particle shader's
 * heat-diffusion fire coloring (activated via uMoonStatus uniforms).
 */

const FLOW_PARTICLE_COUNT = 180000
const SPIRAL_INNER = 9.0
const SPIRAL_OUTER = 22.0
const POINTS_PER_TURN = 25

export class SigmaBands {
  readonly group: THREE.Group

  // Sigma flow particles
  private geo: THREE.BufferGeometry | null = null
  private mat: THREE.ShaderMaterial | null = null
  private mesh: THREE.Points | null = null

  constructor() {
    this.group = new THREE.Group()
  }

  /**
   * Build the flowing particle system.
   * @param total - number of data points (determines spiral shape/turns)
   * @param maxDisplacementFraction - fraction of armSpacing for ±3σ width (0.35)
   */
  create(total: number, maxDisplacementFraction = 0.35): void {
    this.dispose()
    if (total < 2) return

    const totalTurns = Math.max(1, Math.ceil(total / POINTS_PER_TURN))
    const armSpacing = (SPIRAL_OUTER - SPIRAL_INNER) / totalTurns
    const maxDisplacement = armSpacing * maxDisplacementFraction

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
  }

  /** Advance the particle system. Call each frame with elapsed time. */
  update(time: number): void {
    if (this.mat) {
      this.mat.uniforms.uTime.value = time
    }
  }

  dispose(): void {
    if (this.mesh) this.group.remove(this.mesh)
    this.geo?.dispose()
    this.mat?.dispose()
    this.geo = null
    this.mat = null
    this.mesh = null
  }
}
