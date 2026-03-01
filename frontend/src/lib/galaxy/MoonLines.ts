import * as THREE from 'three'

/**
 * Visual connectors between data-point moons at planet zoom level.
 * Two modes, independently toggleable:
 * - **Sequential trace**: a line connecting moons in index order (oldest → newest)
 * - **Radial spokes**: lines from each moon to the center-line radius
 */
export class MoonLines {
  readonly sequentialGroup: THREE.Group
  readonly radialGroup: THREE.Group

  private sequentialLine: THREE.Line | null = null
  private radialSegments: THREE.LineSegments | null = null

  constructor() {
    this.sequentialGroup = new THREE.Group()
    this.radialGroup = new THREE.Group()
  }

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
    this.disposeGeometries()

    if (moons.length === 0) return

    // --- Sequential trace ---
    const seqPositions = new Float32Array(moons.length * 3)
    for (let i = 0; i < moons.length; i++) {
      const m = moons[i]
      seqPositions[i * 3] = Math.cos(m.angle) * m.radius
      seqPositions[i * 3 + 1] = 0
      seqPositions[i * 3 + 2] = Math.sin(m.angle) * m.radius
    }

    const seqGeo = new THREE.BufferGeometry()
    seqGeo.setAttribute('position', new THREE.BufferAttribute(seqPositions, 3))

    const seqMat = new THREE.LineBasicMaterial({
      color: 0xd4af37, // gold
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
    })

    this.sequentialLine = new THREE.Line(seqGeo, seqMat)
    this.sequentialGroup.add(this.sequentialLine)

    // --- Radial spokes ---
    const spokePositions = new Float32Array(moons.length * 2 * 3)
    const spokeColors = new Float32Array(moons.length * 2 * 3)

    for (let i = 0; i < moons.length; i++) {
      const m = moons[i]
      const cos = Math.cos(m.angle)
      const sin = Math.sin(m.angle)

      // Moon position
      spokePositions[i * 6] = cos * m.radius
      spokePositions[i * 6 + 1] = 0
      spokePositions[i * 6 + 2] = sin * m.radius

      // Center-line position (same angle, spiral baseline or gap center radius)
      const baseR = spiralBaselines?.[i] ?? gapCenter
      spokePositions[i * 6 + 3] = cos * baseR
      spokePositions[i * 6 + 4] = 0
      spokePositions[i * 6 + 5] = sin * baseR

      // Color: orange for violations, white for in-control
      const r = 1.0
      const g = m.hasViolation ? 0.35 : 1.0
      const b = m.hasViolation ? 0.24 : 1.0

      spokeColors[i * 6] = r
      spokeColors[i * 6 + 1] = g
      spokeColors[i * 6 + 2] = b
      spokeColors[i * 6 + 3] = r
      spokeColors[i * 6 + 4] = g
      spokeColors[i * 6 + 5] = b
    }

    const spokeGeo = new THREE.BufferGeometry()
    spokeGeo.setAttribute('position', new THREE.BufferAttribute(spokePositions, 3))
    spokeGeo.setAttribute('color', new THREE.BufferAttribute(spokeColors, 3))

    const spokeMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    })

    this.radialSegments = new THREE.LineSegments(spokeGeo, spokeMat)
    this.radialGroup.add(this.radialSegments)
  }

  setSequentialVisible(visible: boolean): void {
    this.sequentialGroup.visible = visible
  }

  setRadialVisible(visible: boolean): void {
    this.radialGroup.visible = visible
  }

  private disposeGeometries(): void {
    if (this.sequentialLine) {
      this.sequentialGroup.remove(this.sequentialLine)
      this.sequentialLine.geometry.dispose()
      ;(this.sequentialLine.material as THREE.Material).dispose()
      this.sequentialLine = null
    }
    if (this.radialSegments) {
      this.radialGroup.remove(this.radialSegments)
      this.radialSegments.geometry.dispose()
      ;(this.radialSegments.material as THREE.Material).dispose()
      this.radialSegments = null
    }
  }

  dispose(): void {
    this.disposeGeometries()
  }
}
