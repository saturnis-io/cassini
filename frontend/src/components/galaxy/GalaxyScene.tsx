import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import * as THREE from 'three'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { PlanetSystem } from '@/lib/galaxy/PlanetSystem'
import { ConstellationLines } from '@/lib/galaxy/ConstellationLines'
import { MoonLines } from '@/lib/galaxy/MoonLines'
import { SigmaBands } from '@/lib/galaxy/SigmaBands'
import { ViolationSparks } from '@/lib/galaxy/ViolationSparks'
import { DEFAULT_GALAXY_CONFIG } from '@/lib/galaxy/types'
import type { GapConfig } from '@/lib/galaxy/types'
import {
  computeConstellationLayout,
  buildHierarchyPathMap,
} from '@/lib/galaxy/constellation-layout'
import type { ConstellationPosition } from '@/lib/galaxy/constellation-layout'
import { CameraController } from '@/lib/galaxy/CameraController'
import type { ZoomLevel } from '@/lib/galaxy/CameraController'
import { useChartData } from '@/api/hooks/characteristics'
import { useCharacteristics, useHierarchyTreeByPlant, useCapability } from '@/api/hooks'
import { useWebSocketContext } from '@/providers/WebSocketProvider'
import {
  controlLimitsToGap,
  valueToRadius,
  spiralPosition,
  cpkToColorHex,
} from '@/lib/galaxy/data-mapping'
import {
  createGalaxyInfoCard,
  createConstellationCard,
  disposeLabel,
} from '@/components/galaxy/GalaxyLabel'

interface GalaxySceneProps {
  className?: string
  plantId: number
  initialFocusCharId?: number
  onFocusChange?: (
    charId: number | null,
    zoomLevel: ZoomLevel,
    constellationId?: number | null,
  ) => void
  /** When changed, fly the camera to this constellation */
  navigateToConstellationId?: number | null
  /** When changed, fly the camera to this planet */
  navigateToCharId?: number | null
  /** Kiosk mode: slow auto-rotate camera, no click/scroll interaction needed */
  kioskMode?: boolean
  /** Called when a moon (data point) is clicked at planet zoom level */
  onMoonClick?: (moonIndex: number) => void
  /** Toggle sequential trace lines between moons */
  showTrace?: boolean
  /** Toggle radial spoke lines from moons to center */
  showSpokes?: boolean
  /** When changed (incremented), fly the camera back to galaxy zoom */
  navigateToGalaxy?: number
}

/** Shared color palette for all planet systems */
const colors = {
  navy: new THREE.Color('#080C16'),
  gold: new THREE.Color('#D4AF37'),
  cream: new THREE.Color('#F4F1DE'),
  orange: new THREE.Color('#EF4444'),
  muted: new THREE.Color('#4B5563'),
}

export function GalaxyScene({
  className,
  plantId,
  initialFocusCharId,
  onFocusChange,
  navigateToConstellationId,
  navigateToCharId,
  kioskMode = false,
  onMoonClick,
  showTrace = true,
  showSpokes = false,
  navigateToGalaxy,
}: GalaxySceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Three.js scene objects stored in refs so population effect can access them
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const starsRef = useRef<THREE.Points | null>(null)
  const clockRef = useRef<THREE.Clock | null>(null)
  const frameIdRef = useRef<number>(0)

  // Multi-planet state
  const systemsRef = useRef<Map<number, PlanetSystem>>(new Map())
  const linesRef = useRef<ConstellationLines | null>(null)
  const violatingIdsRef = useRef<Set<number>>(new Set())

  // Focused system ref (for data sync)
  const focusedSystemRef = useRef<PlanetSystem | null>(null)
  const focusedCharIdRef = useRef<number | null>(null)
  const [subscribedCharId, setSubscribedCharId] = useState<number | null>(null)

  // Camera controller
  const controllerRef = useRef<CameraController | null>(null)
  const prevZoomLevelRef = useRef<ZoomLevel>('galaxy')
  const prevConstellationIdRef = useRef<number | null>(null)

  // Layout positions ref (accessible from event handlers and animation loop)
  const positionsRef = useRef<Map<number, ConstellationPosition> | null>(null)

  // CSS2DRenderer for labels
  const labelRendererRef = useRef<CSS2DRenderer | null>(null)
  const activeLabelRef = useRef<CSS2DObject | null>(null)
  const activeControlLabelsRef = useRef<CSS2DObject[]>([])

  // Galaxy/Constellation info cards
  const galaxyInfoCardsRef = useRef<Map<number, CSS2DObject>>(new Map())
  const constellationCardsRef = useRef<Map<number, CSS2DObject>>(new Map())

  // Moon lines (sequential trace + radial spokes)
  const moonLinesRef = useRef<MoonLines | null>(null)

  // Sigma zone bands along the spiral
  const sigmaBandsRef = useRef<SigmaBands | null>(null)

  // Violation spark particles
  const violationSparksRef = useRef<ViolationSparks | null>(null)

  // Label visibility toggle — hide during camera movement to avoid CSS2DRenderer lag
  const labelVisibleRef = useRef(true)
  const cameraSettleMsRef = useRef(0)

  // Raycaster for click detection
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const pointerRef = useRef<THREE.Vector2>(new THREE.Vector2())

  // Kiosk mode ref (accessible from animation loop)
  const kioskModeRef = useRef(kioskMode)
  kioskModeRef.current = kioskMode

  // Line visibility refs (accessible from effects)
  const showTraceRef = useRef(showTrace)
  showTraceRef.current = showTrace
  const showSpokesRef = useRef(showSpokes)
  showSpokesRef.current = showSpokes

  // Moon click callback ref
  const onMoonClickRef = useRef(onMoonClick)
  onMoonClickRef.current = onMoonClick

  // Callback ref for focus changes
  const onFocusChangeRef = useRef(onFocusChange)
  onFocusChangeRef.current = onFocusChange

  // Initial focus ref (consumed once on first population)
  const initialFocusRef = useRef(initialFocusCharId)
  const initialFocusConsumedRef = useRef(false)

  // Navigation guards (reset on zoom level change so sidebar can re-navigate)
  const prevNavConstellationRef = useRef<number | null | undefined>(undefined)
  const prevNavCharRef = useRef<number | null | undefined>(undefined)

  const { subscribe, unsubscribe, isConnected } = useWebSocketContext()

  // Fetch hierarchy tree and all characteristics for the selected plant
  const { data: hierarchyTree } = useHierarchyTreeByPlant(plantId)
  const { data: charsData } = useCharacteristics(
    { plant_id: plantId, per_page: 5000 },
    { refetchInterval: 30_000 },
  )
  const characteristics = useMemo(() => charsData?.items ?? [], [charsData])

  // Compute layout positions from hierarchy + characteristics
  const positions = useMemo(() => {
    if (!hierarchyTree || characteristics.length === 0) return null
    return computeConstellationLayout(hierarchyTree, characteristics)
  }, [hierarchyTree, characteristics])

  // Build hierarchy path map for constellation card breadcrumbs
  const hierarchyPathMap = useMemo(() => {
    if (!hierarchyTree) return null
    return buildHierarchyPathMap(hierarchyTree)
  }, [hierarchyTree])

  // Keep positions ref in sync
  useEffect(() => {
    positionsRef.current = positions ?? null
  }, [positions])

  // Hierarchy path map ref (accessible from callbacks)
  const hierarchyPathMapRef = useRef(hierarchyPathMap)
  hierarchyPathMapRef.current = hierarchyPathMap

  // Fetch chart data and capability for the focused characteristic
  const { data: chartData } = useChartData(
    focusedCharIdRef.current ?? 0,
    { limit: 100 },
    { refetchInterval: isConnected ? false : 5000 },
  )
  const { data: capability } = useCapability(focusedCharIdRef.current ?? 0)

  // Data refs (accessible from Effect 1 event handlers which close over mount scope)
  const characteristicsRef = useRef(characteristics)
  characteristicsRef.current = characteristics

  // -------------------------------------------------------------------------
  // LOD management callback — called when zoom level changes
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Helpers: dispose info card maps
  // -------------------------------------------------------------------------
  const disposeGalaxyCards = useCallback(() => {
    for (const card of galaxyInfoCardsRef.current.values()) {
      disposeLabel(card)
    }
    galaxyInfoCardsRef.current.clear()
  }, [])

  const disposeConstellationCards = useCallback(() => {
    for (const card of constellationCardsRef.current.values()) {
      disposeLabel(card)
    }
    constellationCardsRef.current.clear()
  }, [])

  const disposeMoonLines = useCallback(() => {
    if (moonLinesRef.current) {
      const system = focusedSystemRef.current
      if (system) {
        system.group.remove(moonLinesRef.current.sequentialGroup)
        system.group.remove(moonLinesRef.current.radialGroup)
      }
      moonLinesRef.current.dispose()
      moonLinesRef.current = null
    }
  }, [])

  const disposeSigmaBands = useCallback(() => {
    if (sigmaBandsRef.current) {
      const system = focusedSystemRef.current
      if (system) {
        system.group.remove(sigmaBandsRef.current.group)
      }
      sigmaBandsRef.current.dispose()
      sigmaBandsRef.current = null
    }
  }, [])

  const disposeViolationSparks = useCallback(() => {
    if (violationSparksRef.current) {
      const system = focusedSystemRef.current
      if (system) {
        system.group.remove(violationSparksRef.current.group)
      }
      violationSparksRef.current.dispose()
      violationSparksRef.current = null
    }
  }, [])

  const createGalaxyCards = useCallback(() => {
    const systems = systemsRef.current
    const chars = characteristicsRef.current
    for (const char of chars) {
      const system = systems.get(char.id)
      if (!system) continue
      const card = createGalaxyInfoCard(char)
      system.group.add(card)
      galaxyInfoCardsRef.current.set(char.id, card)
    }
  }, [])

  const createConstellationCardsForLevel = useCallback(
    (constellationId: number) => {
      const systems = systemsRef.current
      const posMap = positionsRef.current
      const chars = characteristicsRef.current
      const pathMap = hierarchyPathMapRef.current
      if (!posMap) return

      for (const char of chars) {
        const pos = posMap.get(char.id)
        if (!pos || pos.constellationId !== constellationId) continue
        const system = systems.get(char.id)
        if (!system) continue
        const hierarchyPath = pathMap?.get(char.hierarchy_id) ?? undefined
        const card = createConstellationCard(char, hierarchyPath)
        system.group.add(card)
        constellationCardsRef.current.set(char.id, card)
      }
    },
    [],
  )

  const updateLODForZoomLevel = useCallback(
    (
      level: ZoomLevel,
      charId: number | null,
      constellationId: number | null,
    ) => {
      const systems = systemsRef.current
      const posMap = positionsRef.current
      if (systems.size === 0 || !posMap) return

      // Dispose info cards from the previous level
      disposeGalaxyCards()
      disposeConstellationCards()
      disposeMoonLines()
      disposeSigmaBands()
      disposeViolationSparks()

      if (level === 'galaxy') {
        // Downgrade everything to dot
        for (const system of systems.values()) {
          if (system.lod !== 'dot') system.setLOD('dot')
        }
        // Create galaxy info cards
        createGalaxyCards()
      } else if (level === 'constellation' && constellationId != null) {
        // Upgrade constellation members to halo, rest to dot
        for (const [id, system] of systems.entries()) {
          const pos = posMap.get(id)
          if (pos?.constellationId === constellationId) {
            if (system.lod !== 'halo') system.setLOD('halo')
          } else {
            if (system.lod !== 'dot') system.setLOD('dot')
          }
        }
        // Create constellation info cards
        createConstellationCardsForLevel(constellationId)
      } else if (level === 'planet' && charId != null) {
        // Upgrade target to full, constellation to halo, rest to dot
        const targetPos = posMap.get(charId)
        for (const [id, system] of systems.entries()) {
          if (id === charId) {
            if (system.lod !== 'full') system.setLOD('full')
          } else {
            const pos = posMap.get(id)
            if (
              targetPos &&
              pos?.constellationId === targetPos.constellationId
            ) {
              if (system.lod !== 'halo') system.setLOD('halo')
            } else {
              if (system.lod !== 'dot') system.setLOD('dot')
            }
          }
        }
      }
    },
    [disposeGalaxyCards, disposeConstellationCards, disposeMoonLines, disposeSigmaBands, disposeViolationSparks, createGalaxyCards, createConstellationCardsForLevel],
  )

  // -------------------------------------------------------------------------
  // Find which constellation/planet was clicked via raycasting
  // -------------------------------------------------------------------------
  const findClickTarget = useCallback(
    (
      event: PointerEvent,
    ): {
      charId: number
      constellationId: number
      position: THREE.Vector3
    } | null => {
      const renderer = rendererRef.current
      const camera = cameraRef.current
      const scene = sceneRef.current
      if (!renderer || !camera || !scene) return null

      const rect = renderer.domElement.getBoundingClientRect()
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerRef.current.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1

      camera.updateMatrixWorld()
      raycasterRef.current.setFromCamera(pointerRef.current, camera)

      // Intersect all objects in the scene recursively
      const intersects = raycasterRef.current.intersectObjects(
        scene.children,
        true,
      )

      // Find the closest intersection that belongs to a PlanetSystem group
      const systems = systemsRef.current
      const posMap = positionsRef.current
      if (!posMap) return null

      for (const hit of intersects) {
        // Walk up the parent chain to find which PlanetSystem group this belongs to
        let obj: THREE.Object3D | null = hit.object
        while (obj) {
          for (const [charId, system] of systems.entries()) {
            if (obj === system.group) {
              const pos = posMap.get(charId)
              if (pos) {
                return {
                  charId,
                  constellationId: pos.constellationId,
                  position: new THREE.Vector3(pos.x, 0, pos.z),
                }
              }
            }
          }
          obj = obj.parent
        }
      }

      return null
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Find which moon mesh was clicked (planet zoom only)
  // -------------------------------------------------------------------------
  const findMoonClickTarget = useCallback(
    (event: PointerEvent): number | null => {
      const renderer = rendererRef.current
      const camera = cameraRef.current
      if (!renderer || !camera) return null

      const system = focusedSystemRef.current
      if (!system || system.lod !== 'full') return null

      const moonMeshes = system.getMoonMeshes()
      if (moonMeshes.length === 0) return null

      const rect = renderer.domElement.getBoundingClientRect()
      pointerRef.current.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerRef.current.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1

      camera.updateMatrixWorld()
      raycasterRef.current.setFromCamera(pointerRef.current, camera)

      const intersects = raycasterRef.current.intersectObjects(
        moonMeshes,
        false,
      )
      if (intersects.length === 0) return null

      const hitMesh = intersects[0].object
      const moonIndex = moonMeshes.indexOf(hitMesh as THREE.Mesh)
      return moonIndex >= 0 ? moonIndex : null
    },
    [],
  )
  // -------------------------------------------------------------------------
  // Dismiss any active CSS2D labels
  // -------------------------------------------------------------------------
  const dismissLabels = useCallback(() => {
    if (activeLabelRef.current) {
      disposeLabel(activeLabelRef.current)
      activeLabelRef.current = null
    }
    for (const cl of activeControlLabelsRef.current) {
      disposeLabel(cl)
    }
    activeControlLabelsRef.current = []
  }, [])

  // -------------------------------------------------------------------------
  // Effect 1: Setup Three.js renderer, scene, camera, stars, animation loop
  // Runs once on mount. Does NOT depend on data.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // CSS2DRenderer overlay for labels
    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(container.clientWidth, container.clientHeight)
    labelRenderer.domElement.style.position = 'absolute'
    labelRenderer.domElement.style.top = '0'
    labelRenderer.domElement.style.left = '0'
    labelRenderer.domElement.style.pointerEvents = 'none'
    container.appendChild(labelRenderer.domElement)
    labelRendererRef.current = labelRenderer

    // Scene + fog (lower density for galaxy scale)
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(colors.navy.getHex(), 0.0003)
    sceneRef.current = scene

    // Camera — pulled way back for galaxy overview
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      2000,
    )
    camera.position.set(0, 300, 500)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // Camera controller
    const controller = new CameraController(camera)
    controllerRef.current = controller

    // Background stars — larger sphere with more stars for galaxy scale
    const starCount = 3000
    const starsGeo = new THREE.BufferGeometry()
    const starPositions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount * 3; i += 3) {
      const r = 500 + Math.random() * 1000
      const theta = Math.random() * Math.PI * 2
      const p = Math.acos(Math.random() * 2 - 1)
      starPositions[i] = r * Math.sin(p) * Math.cos(theta)
      starPositions[i + 1] = r * Math.sin(p) * Math.sin(theta)
      starPositions[i + 2] = r * Math.cos(p)
    }
    starsGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(starPositions, 3),
    )
    const starsMesh = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({
        color: colors.muted.getHex(),
        size: 0.5,
        transparent: true,
        opacity: 0.6,
      }),
    )
    scene.add(starsMesh)
    starsRef.current = starsMesh

    // Animation loop
    const clock = new THREE.Clock()
    clockRef.current = clock
    let prevTime = 0

    function animate() {
      frameIdRef.current = requestAnimationFrame(animate)
      const time = clock.getElapsedTime()
      const deltaMs = (time - prevTime) * 1000
      prevTime = time

      // Update camera controller
      const ctrl = controllerRef.current
      const labelEl = labelRendererRef.current?.domElement
      if (ctrl) {
        const cameraMoved = ctrl.update(deltaMs)

        // Check for zoom level or focused char changes and update LOD
        const level = ctrl.zoomLevel
        const currentFocusedChar = ctrl.focusedCharId
        if (level !== prevZoomLevelRef.current || currentFocusedChar !== focusedCharIdRef.current || ctrl.focusedConstellationId !== prevConstellationIdRef.current) {
          // Dismiss labels when zooming out (level change)
          dismissLabels()

          updateLODForZoomLevel(
            level,
            ctrl.focusedCharId,
            ctrl.focusedConstellationId,
          )

          // Track focused system for data sync
          const charId = ctrl.focusedCharId
          focusedCharIdRef.current = charId
          setSubscribedCharId(charId)
          if (charId != null) {
            focusedSystemRef.current =
              systemsRef.current.get(charId) ?? null
          } else {
            focusedSystemRef.current = null
          }

          // Notify parent of focus change (including constellation id for sidebar sync)
          onFocusChangeRef.current?.(charId, level, ctrl.focusedConstellationId)

          // Reset navigation guards so sidebar can re-navigate to same targets
          prevNavConstellationRef.current = undefined
          prevNavCharRef.current = undefined

          prevZoomLevelRef.current = level
          prevConstellationIdRef.current = ctrl.focusedConstellationId
        }

        // Label visibility: hide during movement, show after 120ms idle
        const isMoving = cameraMoved || ctrl.isGalaxyDragging || ctrl.isDragging
        if (isMoving) {
          cameraSettleMsRef.current = 0
          if (labelVisibleRef.current && labelEl) {
            labelEl.style.display = 'none'
            labelVisibleRef.current = false
          }
        } else {
          cameraSettleMsRef.current += deltaMs
          if (!labelVisibleRef.current && cameraSettleMsRef.current >= 120 && labelEl) {
            labelEl.style.display = ''
            labelVisibleRef.current = true
          }
        }
      }

      // Kiosk auto-rotate: orbit camera around Y axis when not animating
      if (kioskModeRef.current && ctrl && !ctrl.isAnimating) {
        const angle = 0.0002
        const cosA = Math.cos(angle)
        const sinA = Math.sin(angle)
        const cx = camera.position.x * cosA - camera.position.z * sinA
        const cz = camera.position.x * sinA + camera.position.z * cosA
        camera.position.x = cx
        camera.position.z = cz
        camera.lookAt(0, 0, 0)
      }

      // Update all planet systems
      for (const system of systemsRef.current.values()) {
        system.update(time)
      }

      // Update sigma flow particles
      if (sigmaBandsRef.current) {
        sigmaBandsRef.current.update(time)
      }

      // Update violation sparks
      if (violationSparksRef.current) {
        violationSparksRef.current.update(time)
      }

      // Update constellation lines
      if (linesRef.current) {
        linesRef.current.update(time, violatingIdsRef.current)
      }

      if (starsRef.current) {
        starsRef.current.rotation.y += 0.0001
      }
      renderer.render(scene, camera)
      if (labelVisibleRef.current) {
        labelRenderer.render(scene, camera)
      }
    }
    animate()

    // -----------------------------------------------------------------------
    // Click handler — raycast to detect planet/constellation clicks
    // -----------------------------------------------------------------------
    // Track drag distance to distinguish clicks from drags
    let pointerDownX = 0
    let pointerDownY = 0
    let pointerMoved = false

    function handlePointerDown(event: PointerEvent) {
      const ctrl = controllerRef.current
      if (!ctrl || ctrl.isAnimating) return

      pointerDownX = event.clientX
      pointerDownY = event.clientY
      pointerMoved = false

      if (ctrl.zoomLevel === 'galaxy') {
        ctrl.startGalaxyDrag(event.clientX, event.clientY)
      } else if (ctrl.zoomLevel === 'planet') {
        // Check for moon click first (handled in pointerup if no drag)
        ctrl.startPlanetDrag(event.clientX, event.clientY)
      }
    }

    function handlePointerMove(event: PointerEvent) {
      const ctrl = controllerRef.current
      if (!ctrl) return

      const dx = event.clientX - pointerDownX
      const dy = event.clientY - pointerDownY
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        pointerMoved = true
      }

      if (ctrl.zoomLevel === 'galaxy' && ctrl.isGalaxyDragging) {
        ctrl.updateGalaxyDrag(event.clientX, event.clientY)
      } else if (ctrl.zoomLevel === 'planet' && ctrl.isDragging) {
        ctrl.updatePlanetDrag(event.clientX, event.clientY)
      }
    }

    function handlePointerUp(event: PointerEvent) {
      const ctrl = controllerRef.current
      if (!ctrl || ctrl.isAnimating) return

      // End drags
      if (ctrl.isGalaxyDragging) {
        ctrl.endGalaxyDrag()
      }
      if (ctrl.isDragging) {
        ctrl.endPlanetDrag()
      }

      // If pointer moved significantly, treat as drag — suppress click
      if (pointerMoved) return

      // --- Click handling (pointer didn't move) ---

      // At planet zoom, check for moon clicks only — no scene-level click handling
      if (ctrl.zoomLevel === 'planet') {
        const moonIdx = findMoonClickTarget(event)
        if (moonIdx != null) {
          onMoonClickRef.current?.(moonIdx)
        }
        return
      }

      const hit = findClickTarget(event)

      if (!hit) {
        dismissLabels()
        return
      }

      const currentZoom = ctrl.zoomLevel

      if (currentZoom === 'galaxy') {
        dismissLabels()
        ctrl.flyTo(hit.position, 'constellation', {
          constellationId: hit.constellationId,
        })
      } else if (currentZoom === 'constellation') {
        dismissLabels()

        ctrl.flyTo(hit.position, 'planet', {
          charId: hit.charId,
          constellationId: hit.constellationId,
        })
      }
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)

    // -----------------------------------------------------------------------
    // Scroll handler — forward to camera controller
    // -----------------------------------------------------------------------
    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      const ctrl = controllerRef.current
      if (!ctrl || ctrl.isAnimating) return

      // At planet zoom, scroll adjusts distance instead of changing zoom level
      if (ctrl.zoomLevel === 'planet') {
        ctrl.planetZoom(event.deltaY)
        return
      }

      // At galaxy zoom, scroll zooms in/out instead of changing zoom level
      if (ctrl.zoomLevel === 'galaxy') {
        ctrl.galaxyZoom(event.deltaY)
        return
      }

      // Constellation level: scroll-out goes back to galaxy
      const target = ctrl.handleWheel(event.deltaY)
      if (target) {
        ctrl.flyTo(target.position, target.zoomLevel, {
          charId: target.charId,
          constellationId: target.constellationId,
        })
      }
    }
    renderer.domElement.addEventListener('wheel', handleWheel, {
      passive: false,
    })

    // -----------------------------------------------------------------------
    // ESC handler — back out one level
    // -----------------------------------------------------------------------
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return

      // Always dismiss labels on ESC
      dismissLabels()

      const ctrl = controllerRef.current
      if (!ctrl || ctrl.isAnimating) return

      const target = ctrl.back()
      if (target) {
        ctrl.flyTo(target.position, target.zoomLevel, {
          charId: target.charId,
          constellationId: target.constellationId,
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    // Resize handler (shared between window resize and ResizeObserver)
    function handleResize() {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
      labelRenderer.setSize(container.clientWidth, container.clientHeight)
      const pr = Math.min(window.devicePixelRatio, 2)
      for (const system of systemsRef.current.values()) {
        system.setPixelRatio(pr)
      }
    }
    window.addEventListener('resize', handleResize)

    // ResizeObserver — catches sidebar toggle (doesn't fire window.resize)
    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(container)

    // Cleanup
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', handleKeyDown)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('wheel', handleWheel)
      cancelAnimationFrame(frameIdRef.current)

      // Dispose all planet systems
      for (const system of systemsRef.current.values()) {
        system.dispose()
      }
      systemsRef.current.clear()

      // Dispose constellation lines
      if (linesRef.current) {
        scene.remove(linesRef.current.lineSegments)
        linesRef.current.dispose()
        linesRef.current = null
      }

      // Dispose stars
      starsGeo.dispose()
      ;(starsMesh.material as THREE.Material).dispose()

      // Dispose active labels and info cards
      dismissLabels()
      disposeGalaxyCards()
      disposeConstellationCards()
      disposeMoonLines()
      disposeSigmaBands()
      disposeViolationSparks()

      // Dispose CSS2DRenderer
      if (container.contains(labelRenderer.domElement)) {
        container.removeChild(labelRenderer.domElement)
      }
      labelRendererRef.current = null

      // Dispose renderer
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }

      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      starsRef.current = null
      clockRef.current = null
      controllerRef.current = null
      focusedSystemRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -------------------------------------------------------------------------
  // Effect 2: Populate scene with planet systems + constellation lines
  // Runs when hierarchy/characteristics data arrives or changes.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !positions || characteristics.length === 0) return

    // Tear down previous population if any
    for (const system of systemsRef.current.values()) {
      scene.remove(system.group)
      system.dispose()
    }
    systemsRef.current.clear()
    focusedSystemRef.current = null

    if (linesRef.current) {
      scene.remove(linesRef.current.lineSegments)
      linesRef.current.dispose()
      linesRef.current = null
    }

    // Create one PlanetSystem per characteristic at dot LOD
    const systems = new Map<number, PlanetSystem>()
    const violatingIds = new Set<number>()

    for (const char of characteristics) {
      const pos = positions.get(char.id)
      if (!pos) continue

      const system = new PlanetSystem(
        { ...DEFAULT_GALAXY_CONFIG, colors },
        'dot',
        { skipDefaultMoons: true, blackHole: true },
      )
      system.group.position.set(pos.x, 0, pos.z)
      scene.add(system.group)
      systems.set(char.id, system)

      // Set initial color based on Cpk or violation status
      if (!char.sample_count) {
        // No data: grey "dead planet"
        system.setDotColor(new THREE.Color('#6B7280'))
        system.setPlanetColor(new THREE.Color('#6B7280'))
      } else if ((char.unacknowledged_violations ?? 0) > 0) {
        system.setDotColor(new THREE.Color('#EF4444'))
        system.setPlanetColor(new THREE.Color('#EF4444'))
        violatingIds.add(char.id)
      } else if (char.latest_cpk != null) {
        const hex = cpkToColorHex(char.latest_cpk)
        system.setDotColor(new THREE.Color(hex))
        system.setPlanetColor(new THREE.Color(hex))
      } else {
        // Has data but no Cpk yet — gray pending
        system.setDotColor(new THREE.Color(cpkToColorHex(null)))
        system.setPlanetColor(new THREE.Color(cpkToColorHex(null)))
      }
    }

    systemsRef.current = systems
    violatingIdsRef.current = violatingIds

    // Create galaxy info cards (starts at galaxy zoom)
    disposeGalaxyCards()
    for (const char of characteristics) {
      const system = systems.get(char.id)
      if (!system) continue
      const card = createGalaxyInfoCard(char)
      system.group.add(card)
      galaxyInfoCardsRef.current.set(char.id, card)
    }

    // Create constellation lines between siblings
    const constellationLines = new ConstellationLines(characteristics, positions)
    scene.add(constellationLines.lineSegments)
    linesRef.current = constellationLines

    // Handle initial focus (consumed once)
    if (
      !initialFocusConsumedRef.current &&
      initialFocusRef.current != null
    ) {
      initialFocusConsumedRef.current = true
      const charId = initialFocusRef.current
      const pos = positions.get(charId)
      const controller = controllerRef.current
      if (pos && controller) {
        const target = new THREE.Vector3(pos.x, 0, pos.z)
        // Fly to the planet directly
        controller.flyTo(target, 'planet', {
          charId,
          constellationId: pos.constellationId,
        })
      }
    }
  }, [positions, characteristics, disposeGalaxyCards])

  // -------------------------------------------------------------------------
  // Effect 2b: Diff characteristic data to refresh dot colors without rebuild
  // -------------------------------------------------------------------------
  const prevCharsSnapshotRef = useRef<string>('')
  useEffect(() => {
    if (characteristics.length === 0) return
    const systems = systemsRef.current
    if (systems.size === 0) return

    // Build a lightweight snapshot to detect changes
    const snapshot = characteristics
      .map((c) => `${c.id}:${c.latest_cpk ?? ''}:${c.unacknowledged_violations ?? 0}:${c.sample_count ?? 0}`)
      .join('|')
    if (snapshot === prevCharsSnapshotRef.current) return
    prevCharsSnapshotRef.current = snapshot

    // Update dot/halo colors for each characteristic
    const violatingIds = new Set<number>()
    for (const char of characteristics) {
      const system = systems.get(char.id)
      if (!system) continue

      if (!char.sample_count) {
        system.setDotColor(new THREE.Color('#6B7280'))
        system.setPlanetColor(new THREE.Color('#6B7280'))
      } else if ((char.unacknowledged_violations ?? 0) > 0) {
        system.setDotColor(new THREE.Color('#EF4444'))
        system.setPlanetColor(new THREE.Color('#EF4444'))
        violatingIds.add(char.id)
      } else if (char.latest_cpk != null) {
        const hex = cpkToColorHex(char.latest_cpk)
        system.setDotColor(new THREE.Color(hex))
        system.setPlanetColor(new THREE.Color(hex))
      } else {
        // Has data but no Cpk yet — gray pending
        system.setDotColor(new THREE.Color(cpkToColorHex(null)))
        system.setPlanetColor(new THREE.Color(cpkToColorHex(null)))
      }
    }
    violatingIdsRef.current = violatingIds
  }, [characteristics])

  /** Build moon data array from chart data using spiral positions. */
  const buildSpiralMoonData = useCallback(
    (
      cd: {
        data_type?: string
        attribute_data_points?: Array<{ plotted_value: number; violation_ids: number[]; unacknowledged_violation_ids?: number[] }>
        data_points: Array<{ mean: number; violation_ids: number[]; unacknowledged_violation_ids?: number[] }>
      },
      gap: GapConfig,
      ucl: number | null,
      lcl: number | null,
    ) => {
      const isAttribute =
        cd.data_type === 'attribute' && cd.attribute_data_points?.length
      const points = isAttribute ? cd.attribute_data_points! : cd.data_points
      return points.map((pt, i, arr) => {
        const sp = spiralPosition(i, arr.length)
        const value =
          'plotted_value' in pt ? pt.plotted_value : (pt as { mean: number }).mean
        const hasViolation = pt.violation_ids.length > 0
        const hasUnacknowledgedViolation = pt.unacknowledged_violation_ids
          ? pt.unacknowledged_violation_ids.length > 0
          : hasViolation

        // If control limits are missing, place moon at spiral baseline (no displacement)
        if (ucl == null || lcl == null) {
          return {
            angle: sp.angle,
            radius: sp.baseRadius,
            hasViolation,
            hasUnacknowledgedViolation,
          }
        }

        const rawDisplacement =
          valueToRadius(value, ucl, lcl, gap) - gap.center
        // Scale displacement to fit within arm spacing (±35% of arm gap)
        const halfWidth = Math.max((gap.out - gap.in) / 2, 0.5)
        const maxDisplacement = sp.armSpacing * 0.35
        const scaledDisplacement = Math.max(
          -maxDisplacement,
          Math.min(maxDisplacement, (rawDisplacement / halfWidth) * maxDisplacement),
        )
        return {
          angle: sp.angle,
          radius: sp.baseRadius - scaledDisplacement,
          hasViolation,
          hasUnacknowledgedViolation,
        }
      })
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Effect 3: Sync chart data + capability to the focused planet
  // -------------------------------------------------------------------------
  useEffect(() => {
    const charId = focusedCharIdRef.current
    if (!charId) return
    const system = systemsRef.current.get(charId)
    if (!system) return

    if (chartData) {
      const ucl = chartData.control_limits?.ucl ?? null
      const lcl = chartData.control_limits?.lcl ?? null
      const cl = chartData.control_limits?.center_line ?? null

      // Build gap from control limits
      const gap = controlLimitsToGap(ucl, lcl, cl)

      // Build spiral moon positions from chart data
      const moonData = buildSpiralMoonData(chartData, gap, ucl, lcl)

      system.setDataMoons(moonData)

      // Update violation tracking for this characteristic
      const hasViolation = moonData.some((m) => m.hasViolation)
      if (hasViolation) {
        violatingIdsRef.current.add(charId)
      } else {
        violatingIdsRef.current.delete(charId)
      }
    }

    // Apply Cpk coloring to planet
    if (capability) {
      const hex = cpkToColorHex(capability.cpk)
      system.setPlanetColor(new THREE.Color(hex))
    }

    // Update galaxy/constellation info cards with live capability for the focused char
    if (capability && charId) {
      const ctrl0 = controllerRef.current
      const char = characteristicsRef.current.find((c) => c.id === charId)
      if (char && ctrl0?.zoomLevel === 'galaxy') {
        const oldCard = galaxyInfoCardsRef.current.get(charId)
        if (oldCard) disposeLabel(oldCard)
        const newCard = createGalaxyInfoCard(char, capability)
        system.group.add(newCard)
        galaxyInfoCardsRef.current.set(charId, newCard)
      } else if (char && ctrl0?.zoomLevel === 'constellation') {
        const oldCard = constellationCardsRef.current.get(charId)
        if (oldCard) disposeLabel(oldCard)
        const pathMap = hierarchyPathMapRef.current
        const hierarchyPath = pathMap?.get(char.hierarchy_id) ?? undefined
        const newCard = createConstellationCard(char, hierarchyPath, capability)
        system.group.add(newCard)
        constellationCardsRef.current.set(charId, newCard)
      }
    }

    // At planet zoom, attach moon lines, sigma bands, and violation sparks
    const ctrl = controllerRef.current
    if (ctrl?.zoomLevel === 'planet' && chartData) {
      // Create moon lines (sequential trace + radial spokes)
      disposeMoonLines()

      const ucl2 = chartData.control_limits?.ucl ?? null
      const lcl2 = chartData.control_limits?.lcl ?? null
      const cl2 = chartData.control_limits?.center_line ?? null
      const gap2 = controlLimitsToGap(ucl2, lcl2, cl2)
      const lineMoonData = buildSpiralMoonData(chartData, gap2, ucl2, lcl2)

      // Compute spiral baselines for spoke lines
      const spiralBaselines = lineMoonData.map((_, i, arr) =>
        spiralPosition(i, arr.length).baseRadius,
      )

      const lines = new MoonLines()
      lines.update(lineMoonData, gap2.center, spiralBaselines)
      lines.setSequentialVisible(showTraceRef.current)
      lines.setRadialVisible(showSpokesRef.current)
      system.group.add(lines.sequentialGroup)
      system.group.add(lines.radialGroup)
      moonLinesRef.current = lines

      // Create sigma bands along the spiral
      disposeSigmaBands()

      const isAttribute =
        chartData.data_type === 'attribute' &&
        (chartData.attribute_data_points?.length ?? 0) > 0
      const totalPoints = isAttribute
        ? chartData.attribute_data_points!.length
        : chartData.data_points.length

      if (totalPoints >= 2) {
        const bands = new SigmaBands()
        bands.create(totalPoints)
        system.group.add(bands.group)
        sigmaBandsRef.current = bands
      }

      // Create violation sparks for data points with violations
      disposeViolationSparks()
      const violationMoons = lineMoonData
        .filter((m) => m.hasViolation)
        .map((m) => ({
          angle: m.angle,
          radius: m.radius,
          isAcknowledged: !m.hasUnacknowledgedViolation,
        }))
      if (violationMoons.length > 0) {
        const sparks = new ViolationSparks()
        sparks.create(violationMoons)
        system.group.add(sparks.group)
        violationSparksRef.current = sparks
      }

    }
  }, [chartData, capability, disposeMoonLines, disposeSigmaBands, disposeViolationSparks, buildSpiralMoonData])

  // -------------------------------------------------------------------------
  // Effect 3b: Sync moon line visibility when props change
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (moonLinesRef.current) {
      moonLinesRef.current.setSequentialVisible(showTrace)
      moonLinesRef.current.setRadialVisible(showSpokes)
    }
  }, [showTrace, showSpokes])

  // -------------------------------------------------------------------------
  // Effect 4: WebSocket subscription for live updates on focused characteristic
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!subscribedCharId) return
    subscribe(subscribedCharId)
    return () => unsubscribe(subscribedCharId)
  }, [subscribedCharId, subscribe, unsubscribe])

  // -------------------------------------------------------------------------
  // Effect 5: Navigate to constellation when navigateToConstellationId changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (
      navigateToConstellationId == null ||
      navigateToConstellationId === prevNavConstellationRef.current
    )
      return

    const controller = controllerRef.current
    const posMap = positionsRef.current
    if (!controller || !posMap || controller.isAnimating) return

    // Single pass to compute constellation center
    let cx = 0
    let cz = 0
    let count = 0
    for (const [, p] of posMap) {
      if (p.constellationId === navigateToConstellationId) {
        cx += p.x
        cz += p.z
        count++
      }
    }
    if (count === 0) return

    // Only commit prevRef after we know we can act
    prevNavConstellationRef.current = navigateToConstellationId

    cx /= count
    cz /= count
    const target = new THREE.Vector3(cx, 0, cz)
    controller.flyTo(target, 'constellation', {
      constellationId: navigateToConstellationId,
    })
  }, [navigateToConstellationId])

  // -------------------------------------------------------------------------
  // Effect 6: Navigate to planet when navigateToCharId changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (
      navigateToCharId == null ||
      navigateToCharId === prevNavCharRef.current
    )
      return

    const controller = controllerRef.current
    const posMap = positionsRef.current
    if (!controller || !posMap || controller.isAnimating) return

    const pos = posMap.get(navigateToCharId)
    if (!pos) return

    // Only commit prevRef after we know we can act
    prevNavCharRef.current = navigateToCharId

    const target = new THREE.Vector3(pos.x, 0, pos.z)
    controller.flyTo(target, 'planet', {
      charId: navigateToCharId,
      constellationId: pos.constellationId,
    })
  }, [navigateToCharId])

  // -------------------------------------------------------------------------
  // Effect 7: Navigate to galaxy when navigateToGalaxy counter changes
  // -------------------------------------------------------------------------
  const prevNavigateToGalaxyRef = useRef(navigateToGalaxy)
  useEffect(() => {
    if (navigateToGalaxy == null || navigateToGalaxy === prevNavigateToGalaxyRef.current) return
    prevNavigateToGalaxyRef.current = navigateToGalaxy

    const controller = controllerRef.current
    if (!controller || controller.isAnimating) return

    controller.flyTo(new THREE.Vector3(0, 0, 0), 'galaxy')
  }, [navigateToGalaxy])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ background: '#080C16', width: '100%', height: '100%', position: 'relative' }}
    />
  )
}
