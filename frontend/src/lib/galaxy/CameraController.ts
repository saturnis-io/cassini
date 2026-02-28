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
        this.targetPosition.set(target.x, 80, target.z + 120)
        this.targetLookAt.copy(target)
        break
      case 'planet':
        this.targetPosition.set(target.x + 20, 30, target.z + 50)
        this.targetLookAt.copy(target)
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
