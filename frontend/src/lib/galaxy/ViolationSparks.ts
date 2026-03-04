import * as THREE from 'three'
import {
  violationSparkVertexShader,
  violationSparkFragmentShader,
} from '@/lib/galaxy/violation-spark-shader'

/** Number of spark particles per violation moon */
const SPARKS_PER_VIOLATION = 80

export interface ViolationMoon {
  angle: number
  radius: number
  isAcknowledged: boolean
}

/**
 * GPU particle system that emits sparks from violation data-point moons.
 * Sparks flow along the spiral direction (matching the sigma flow),
 * creating a visible red/amber disruption in the particle river.
 *
 * - Unacknowledged: bright red-orange sparks
 * - Acknowledged: muted amber sparks (still sparky, just softer)
 */
export class ViolationSparks {
  readonly group: THREE.Group
  private geo: THREE.BufferGeometry | null = null
  private mat: THREE.ShaderMaterial | null = null
  private mesh: THREE.Points | null = null

  constructor() {
    this.group = new THREE.Group()
  }

  create(violations: ViolationMoon[]): void {
    this.dispose()
    if (violations.length === 0) return

    const count = violations.length * SPARKS_PER_VIOLATION
    const positions = new Float32Array(count * 3) // dummy — shader computes real positions
    const origins = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    const phases = new Float32Array(count)
    const lifetimes = new Float32Array(count)
    const colors = new Float32Array(count * 3)

    // Unacknowledged: bright red-orange
    const unackColor = new THREE.Color('#EF4444')
    // Acknowledged: muted warm amber
    const ackColor = new THREE.Color('#9B7D4A')

    for (let vi = 0; vi < violations.length; vi++) {
      const v = violations[vi]
      const originX = Math.cos(v.angle) * v.radius
      const originZ = Math.sin(v.angle) * v.radius
      const color = v.isAcknowledged ? ackColor : unackColor

      // Spiral flow direction at this moon position:
      // Sigma flow goes inward with decreasing angle (matching sigma-flow-shader).
      // Tangent in decreasing-angle direction: (sin(θ), 0, -cos(θ))
      // Radial inward: (-cos(θ), 0, -sin(θ))
      // Combined spiral flow = tangent + small inward pull
      const flowTangentX = Math.sin(v.angle)
      const flowTangentZ = -Math.cos(v.angle)
      const radialInX = -Math.cos(v.angle)
      const radialInZ = -Math.sin(v.angle)

      // Combined flow direction (mostly tangential, slight inward drift)
      const flowX = flowTangentX + radialInX * 0.25
      const flowZ = flowTangentZ + radialInZ * 0.25
      const flowLen = Math.sqrt(flowX * flowX + flowZ * flowZ)
      const flowDirX = flowX / flowLen
      const flowDirZ = flowZ / flowLen

      // Perpendicular to flow (for spread)
      const perpX = -flowDirZ
      const perpZ = flowDirX

      for (let si = 0; si < SPARKS_PER_VIOLATION; si++) {
        const idx = vi * SPARKS_PER_VIOLATION + si

        origins[idx * 3] = originX
        origins[idx * 3 + 1] = 0
        origins[idx * 3 + 2] = originZ

        // Primary velocity: along spiral flow direction with speed variation
        const flowSpeed = 0.4 + Math.random() * 0.8
        // Small perpendicular spread for sparkle width
        const perpSpeed = (Math.random() - 0.5) * 0.3
        // Tiny vertical flutter
        const verticalSpeed = (Math.random() - 0.5) * 0.15

        velocities[idx * 3] =
          flowDirX * flowSpeed + perpX * perpSpeed
        velocities[idx * 3 + 1] = verticalSpeed
        velocities[idx * 3 + 2] =
          flowDirZ * flowSpeed + perpZ * perpSpeed

        phases[idx] = Math.random() * 10
        lifetimes[idx] = 1.0 + Math.random() * 2.0

        colors[idx * 3] = color.r
        colors[idx * 3 + 1] = color.g
        colors[idx * 3 + 2] = color.b
      }
    }

    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    )
    this.geo.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3))
    this.geo.setAttribute(
      'aVelocity',
      new THREE.BufferAttribute(velocities, 3),
    )
    this.geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    this.geo.setAttribute(
      'aLifetime',
      new THREE.BufferAttribute(lifetimes, 1),
    )
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))

    // Manual bounding sphere — particles can travel outward from origins
    this.geo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 0),
      45,
    )

    this.mat = new THREE.ShaderMaterial({
      vertexShader: violationSparkVertexShader,
      fragmentShader: violationSparkFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    this.mesh = new THREE.Points(this.geo, this.mat)
    this.group.add(this.mesh)
  }

  /** Advance the spark animation. Call each frame with elapsed time. */
  update(time: number): void {
    if (this.mat) {
      this.mat.uniforms.uTime.value = time
    }
  }

  dispose(): void {
    if (this.mesh) {
      this.group.remove(this.mesh)
    }
    this.geo?.dispose()
    this.mat?.dispose()
    this.geo = null
    this.mat = null
    this.mesh = null
  }
}
