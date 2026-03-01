import * as THREE from 'three'

export type ZoomLevel = 'galaxy' | 'constellation' | 'planet'

export interface FlyTarget {
  position: THREE.Vector3
  zoomLevel: ZoomLevel
  charId?: number
  constellationId?: number
}

/** Ease-out cubic: fast start, gentle deceleration. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Camera controller for the galaxy scene. Manages smooth fly-through
 * transitions between three zoom levels: galaxy, constellation, and planet.
 *
 * The owner is responsible for:
 * - Calling `update(deltaTime)` each frame
 * - Forwarding pointer, wheel, and keyboard events
 */
export class CameraController {
  private camera: THREE.PerspectiveCamera
  private currentLookAt: THREE.Vector3

  // Animation state
  private startPosition = new THREE.Vector3()
  private startLookAt = new THREE.Vector3()
  private targetPosition = new THREE.Vector3()
  private targetLookAt = new THREE.Vector3()
  private progress = 1 // 1 = idle (not animating)
  private duration = 800 // ms

  // Zoom level tracking
  private _zoomLevel: ZoomLevel = 'galaxy'
  private _focusedCharId: number | null = null
  private _focusedConstellationId: number | null = null

  // Scratch vectors to avoid allocations
  private readonly _lerpPos = new THREE.Vector3()
  private readonly _lerpLook = new THREE.Vector3()

  // Galaxy-level interaction state (drag-to-pan + scroll-to-zoom)
  private galaxyDragActive = false
  private galaxyDragStartX = 0
  private galaxyDragStartY = 0
  private readonly _panRight = new THREE.Vector3()
  private readonly _panForward = new THREE.Vector3()

  // Planet-level interaction state
  private planetDragActive = false
  private planetDragStartX = 0
  private planetOrbitAngle = 0
  private planetDistance = 46 // default distance from flyTo offset calc
  private readonly PLANET_MIN_DIST = 25
  private readonly PLANET_MAX_DIST = 100
  private readonly PLANET_Y = 26 // fixed camera height at planet level

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
    this.currentLookAt = new THREE.Vector3(0, 0, 0)
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  get zoomLevel(): ZoomLevel {
    return this._zoomLevel
  }

  get focusedCharId(): number | null {
    return this._focusedCharId
  }

  get focusedConstellationId(): number | null {
    return this._focusedConstellationId
  }

  get isAnimating(): boolean {
    return this.progress < 1
  }

  get isDragging(): boolean {
    return this.planetDragActive
  }

  get isGalaxyDragging(): boolean {
    return this.galaxyDragActive
  }

  // ---------------------------------------------------------------------------
  // Fly-to
  // ---------------------------------------------------------------------------

  /**
   * Animate the camera to look at `target` from the appropriate vantage
   * point for the given zoom level.
   */
  flyTo(
    target: THREE.Vector3,
    zoomLevel: ZoomLevel,
    opts?: {
      duration?: number
      charId?: number
      constellationId?: number
    },
  ): void {
    // Snapshot current state as animation start
    this.startPosition.copy(this.camera.position)
    this.startLookAt.copy(this.currentLookAt)

    // Compute destination camera position based on zoom level
    switch (zoomLevel) {
      case 'galaxy':
        this.targetPosition.set(0, 300, 500)
        this.targetLookAt.set(0, 0, 0)
        break
      case 'constellation':
        this.targetPosition.set(target.x, 140, target.z + 220)
        this.targetLookAt.copy(target)
        break
      case 'planet':
        this.targetPosition.set(target.x + 16, 26, target.z + 40)
        this.targetLookAt.copy(target)
        // Reset planet orbit state when flying to a new planet
        this.resetPlanetOrbit()
        break
    }

    this.duration = opts?.duration ?? 800
    this.progress = 0
    this._zoomLevel = zoomLevel

    // Update focus tracking
    switch (zoomLevel) {
      case 'galaxy':
        this._focusedCharId = null
        this._focusedConstellationId = null
        break
      case 'constellation':
        this._focusedCharId = null
        this._focusedConstellationId = opts?.constellationId ?? null
        break
      case 'planet':
        this._focusedCharId = opts?.charId ?? null
        this._focusedConstellationId = opts?.constellationId ?? null
        break
    }
  }

  // ---------------------------------------------------------------------------
  // Back navigation
  // ---------------------------------------------------------------------------

  /**
   * Navigate back one zoom level.
   * Returns the FlyTarget the caller should use, or null if already at galaxy.
   */
  back(): FlyTarget | null {
    if (this._zoomLevel === 'galaxy') return null

    if (this._zoomLevel === 'planet') {
      // Back to constellation — use the current lookAt as the constellation center
      return {
        position: this.currentLookAt.clone(),
        zoomLevel: 'constellation',
        constellationId: this._focusedConstellationId ?? undefined,
      }
    }

    // constellation -> galaxy
    return {
      position: new THREE.Vector3(0, 0, 0),
      zoomLevel: 'galaxy',
    }
  }

  // ---------------------------------------------------------------------------
  // Scroll handling
  // ---------------------------------------------------------------------------

  /**
   * Process a wheel event. Returns a FlyTarget if the scroll should
   * trigger a zoom-level change, or null if it should be ignored.
   *
   * Scroll-in (negative deltaY) at constellation level triggers fly-to-planet
   * when the caller provides a target. The caller is responsible for
   * raycasting to find which planet to fly to.
   */
  handleWheel(deltaY: number): FlyTarget | null {
    if (this.isAnimating) return null

    // Scroll out (positive deltaY) -> back out one level
    if (deltaY > 0) {
      return this.back()
    }

    // Scroll in at galaxy level -> no automatic transition (need a target)
    // Scroll in at constellation level -> caller should raycast and provide target
    // Scroll in at planet level -> already at deepest level
    return null
  }

  // ---------------------------------------------------------------------------
  // Galaxy-level interaction: drag to pan, scroll to zoom
  // ---------------------------------------------------------------------------

  startGalaxyDrag(clientX: number, clientY: number): void {
    this.galaxyDragActive = true
    this.galaxyDragStartX = clientX
    this.galaxyDragStartY = clientY

    // Compute pan basis vectors from current camera orientation (projected to XZ)
    this._panRight.setFromMatrixColumn(this.camera.matrixWorld, 0)
    this._panRight.y = 0
    this._panRight.normalize()

    this._panForward.setFromMatrixColumn(this.camera.matrixWorld, 2)
    this._panForward.y = 0
    this._panForward.normalize()
  }

  updateGalaxyDrag(clientX: number, clientY: number): void {
    if (!this.galaxyDragActive) return

    const deltaX = clientX - this.galaxyDragStartX
    const deltaY = clientY - this.galaxyDragStartY
    this.galaxyDragStartX = clientX
    this.galaxyDragStartY = clientY

    // Scale pan speed by camera height for consistent feel
    const panScale = this.camera.position.y * 0.003

    // Apply pan to both camera position and lookAt target
    this.camera.position.addScaledVector(this._panRight, -deltaX * panScale)
    this.camera.position.addScaledVector(this._panForward, deltaY * panScale)
    this.currentLookAt.addScaledVector(this._panRight, -deltaX * panScale)
    this.currentLookAt.addScaledVector(this._panForward, deltaY * panScale)

    this.camera.lookAt(this.currentLookAt)
  }

  endGalaxyDrag(): void {
    this.galaxyDragActive = false
  }

  galaxyZoom(deltaY: number): void {
    // Move camera along the camera-to-target direction
    const dir = new THREE.Vector3()
      .subVectors(this.camera.position, this.currentLookAt)
    const dist = dir.length()
    const newDist = Math.max(100, Math.min(1500, dist + deltaY * 0.5))
    dir.normalize().multiplyScalar(newDist)
    this.camera.position.copy(this.currentLookAt).add(dir)
    this.camera.lookAt(this.currentLookAt)
  }

  // ---------------------------------------------------------------------------
  // Planet-level interaction: drag to rotate, scroll to zoom
  // ---------------------------------------------------------------------------

  startPlanetDrag(clientX: number): void {
    this.planetDragActive = true
    this.planetDragStartX = clientX
  }

  updatePlanetDrag(clientX: number): void {
    if (!this.planetDragActive) return

    const deltaX = clientX - this.planetDragStartX
    this.planetDragStartX = clientX

    // Convert pixel movement to radians (sensitivity: ~1 degree per 3 pixels)
    this.planetOrbitAngle += deltaX * 0.006

    this.applyPlanetOrbit()
  }

  endPlanetDrag(): void {
    this.planetDragActive = false
  }

  planetZoom(deltaY: number): void {
    // Zoom in/out by adjusting distance
    const step = deltaY * 0.05
    this.planetDistance = Math.max(
      this.PLANET_MIN_DIST,
      Math.min(this.PLANET_MAX_DIST, this.planetDistance + step),
    )
    this.applyPlanetOrbit()
  }

  private resetPlanetOrbit(): void {
    this.planetOrbitAngle = 0
    this.planetDistance = 46
    this.planetDragActive = false
  }

  private applyPlanetOrbit(): void {
    const target = this.currentLookAt
    this.camera.position.x =
      target.x + Math.sin(this.planetOrbitAngle) * this.planetDistance
    this.camera.position.z =
      target.z + Math.cos(this.planetOrbitAngle) * this.planetDistance
    this.camera.position.y = this.PLANET_Y
    this.camera.lookAt(target)
  }

  // ---------------------------------------------------------------------------
  // Frame update
  // ---------------------------------------------------------------------------

  /**
   * Advance the animation by `deltaMs` milliseconds.
   * Must be called every frame. Returns true if the camera moved.
   */
  update(deltaMs: number): boolean {
    if (this.progress >= 1) return false

    // Advance progress
    this.progress = Math.min(1, this.progress + deltaMs / this.duration)
    const t = easeOutCubic(this.progress)

    // Interpolate position and lookAt
    this._lerpPos.lerpVectors(this.startPosition, this.targetPosition, t)
    this._lerpLook.lerpVectors(this.startLookAt, this.targetLookAt, t)

    this.camera.position.copy(this._lerpPos)
    this.currentLookAt.copy(this._lerpLook)
    this.camera.lookAt(this._lerpLook)

    return true
  }
}
