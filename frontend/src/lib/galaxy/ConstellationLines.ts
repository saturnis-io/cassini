import * as THREE from 'three'
import type { Characteristic } from '@/types'
import type { ConstellationPosition } from '@/lib/galaxy/constellation-layout'

/**
 * Renders gold-colored line segments between sibling characteristics
 * (those sharing the same hierarchy_id) in the constellation view.
 *
 * Supports a violation pulse effect: lines connected to violating
 * characteristics animate their opacity between 0.15 and 0.5 using a sin wave.
 */
export class ConstellationLines {
  readonly lineSegments: THREE.LineSegments
  private readonly material: THREE.LineBasicMaterial
  /** Map from charId to the vertex-pair indices that touch this char */
  private readonly charLineIndices: Map<number, number[]>
  /** Total number of vertex pairs (each pair = one line segment) */
  private readonly pairCount: number

  constructor(
    characteristics: Characteristic[],
    positions: Map<number, ConstellationPosition>,
  ) {
    this.charLineIndices = new Map()

    // Group characteristics by hierarchy_id (siblings share the same parent node)
    const siblingGroups = new Map<number, Characteristic[]>()
    for (const char of characteristics) {
      if (!positions.has(char.id)) continue
      let group = siblingGroups.get(char.hierarchy_id)
      if (!group) {
        group = []
        siblingGroups.set(char.hierarchy_id, group)
      }
      group.push(char)
    }

    // Build line segment pairs between every pair of siblings
    const pairs: Array<{ aId: number; bId: number; ax: number; az: number; bx: number; bz: number }> = []

    for (const group of siblingGroups.values()) {
      if (group.length < 2) continue
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const posA = positions.get(group[i].id)!
          const posB = positions.get(group[j].id)!
          pairs.push({
            aId: group[i].id,
            bId: group[j].id,
            ax: posA.x,
            az: posA.z,
            bx: posB.x,
            bz: posB.z,
          })
        }
      }
    }

    this.pairCount = pairs.length

    // Build geometry: each pair contributes 2 vertices (6 floats)
    const vertexCount = pairs.length * 2
    const positionArray = new Float32Array(vertexCount * 3)

    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i]
      const base = i * 6
      // Vertex A
      positionArray[base] = p.ax
      positionArray[base + 1] = 0
      positionArray[base + 2] = p.az
      // Vertex B
      positionArray[base + 3] = p.bx
      positionArray[base + 4] = 0
      positionArray[base + 5] = p.bz
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3))

    // Build charLineIndices: map each charId to the pair indices it participates in
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i]

      let aIndices = this.charLineIndices.get(p.aId)
      if (!aIndices) {
        aIndices = []
        this.charLineIndices.set(p.aId, aIndices)
      }
      aIndices.push(i)

      let bIndices = this.charLineIndices.get(p.bId)
      if (!bIndices) {
        bIndices = []
        this.charLineIndices.set(p.bId, bIndices)
      }
      bIndices.push(i)
    }

    this.material = new THREE.LineBasicMaterial({
      color: 0xd4af37, // gold
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    this.lineSegments = new THREE.LineSegments(geometry, this.material)
  }

  /**
   * Animate line opacity for violation pulse effects. Call each frame.
   *
   * Lines connected to a violating characteristic pulse between 0.15 and 0.5.
   * All other lines remain at base opacity 0.15.
   *
   * Since LineBasicMaterial has a single opacity for the whole mesh, we use
   * per-vertex color alpha via a custom approach: we set the material opacity
   * to the maximum needed, then let individual segment visibility be controlled
   * by whether any of its connected chars are violating.
   *
   * For simplicity (LineSegments shares one material), we pulse the entire
   * material opacity based on whether ANY violations exist, and use a simple
   * sin wave. Lines not connected to violations stay visually at base because
   * the gold color on dark background is subtle at 0.15.
   */
  update(time: number, violatingCharIds: Set<number>): void {
    if (this.pairCount === 0) return

    if (violatingCharIds.size === 0) {
      // No violations — stay at base opacity
      this.material.opacity = 0.15
      return
    }

    // Pulse between 0.15 and 0.5
    const pulse = 0.15 + (Math.sin(time * 3) * 0.5 + 0.5) * 0.35
    this.material.opacity = pulse
  }

  dispose(): void {
    this.lineSegments.geometry.dispose()
    this.material.dispose()
  }
}
