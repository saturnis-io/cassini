import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import * as THREE from 'three'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { PlanetSystem } from '@/lib/galaxy/PlanetSystem'
import { ConstellationLines } from '@/lib/galaxy/ConstellationLines'
import { MoonLines } from '@/lib/galaxy/MoonLines'
import { SigmaBands } from '@/lib/galaxy/SigmaBands'
import { ViolationSparks } from '@/lib/galaxy/ViolationSparks'
import { DEFAULT_GALAXY_CONFIG } from '@/lib/galaxy/types'
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
import { cpkToColorHex } from '@/lib/galaxy/data-mapping'
import { disposeLabel } from '@/components/galaxy/GalaxyLabel'
import {
  findClickTarget as findClickTargetHelper,
  findMoonClickTarget as findMoonClickTargetHelper,
  applyCharacteristicColor,
  disposeCardMap,
  disposeMoonLinesFromSystem,
  disposeSigmaBandsFromSystem,
  disposeViolationSparksFromSystem,
  updateLODForZoomLevel as updateLODHelper,
  buildPlanetZoomOverlays,
  disposeSceneGPUResources,
  syncChartDataToSystem,
  computeConstellationCenter,
  updateInfoCardForCapability,
  createStarField,
  createGalaxyCards as createGalaxyCardsHelper,
} from '@/lib/galaxy/scene-helpers'

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

  // Three.js scene objects
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
  const focusedSystemRef = useRef<PlanetSystem | null>(null)
  const focusedCharIdRef = useRef<number | null>(null)
  const [subscribedCharId, setSubscribedCharId] = useState<number | null>(null)

  // Camera controller
  const controllerRef = useRef<CameraController | null>(null)
  const prevZoomLevelRef = useRef<ZoomLevel>('galaxy')
  const prevConstellationIdRef = useRef<number | null>(null)
  const positionsRef = useRef<Map<number, ConstellationPosition> | null>(null)

  // CSS2D labels and info cards
  const labelRendererRef = useRef<CSS2DRenderer | null>(null)
  const activeLabelRef = useRef<CSS2DObject | null>(null)
  const activeControlLabelsRef = useRef<CSS2DObject[]>([])
  const galaxyInfoCardsRef = useRef<Map<number, CSS2DObject>>(new Map())
  const constellationCardsRef = useRef<Map<number, CSS2DObject>>(new Map())

  // Planet-zoom overlays
  const moonLinesRef = useRef<MoonLines | null>(null)
  const sigmaBandsRef = useRef<SigmaBands | null>(null)
  const violationSparksRef = useRef<ViolationSparks | null>(null)

  // Label visibility toggle — hide during camera movement
  const labelVisibleRef = useRef(true)
  const cameraSettleMsRef = useRef(0)

  // Raycaster
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const pointerRef = useRef<THREE.Vector2>(new THREE.Vector2())

  // Prop refs (accessible from animation loop / closures)
  const kioskModeRef = useRef(kioskMode)
  kioskModeRef.current = kioskMode
  const showTraceRef = useRef(showTrace)
  showTraceRef.current = showTrace
  const showSpokesRef = useRef(showSpokes)
  showSpokesRef.current = showSpokes
  const onMoonClickRef = useRef(onMoonClick)
  onMoonClickRef.current = onMoonClick
  const onFocusChangeRef = useRef(onFocusChange)
  onFocusChangeRef.current = onFocusChange

  // Initial focus (consumed once on first population)
  const initialFocusRef = useRef(initialFocusCharId)
  const initialFocusConsumedRef = useRef(false)

  // Navigation guards (reset on zoom level change)
  const prevNavConstellationRef = useRef<number | null | undefined>(undefined)
  const prevNavCharRef = useRef<number | null | undefined>(undefined)

  const { subscribe, unsubscribe, isConnected } = useWebSocketContext()

  // Data fetching
  const { data: hierarchyTree } = useHierarchyTreeByPlant(plantId)
  const { data: charsData } = useCharacteristics(
    { plant_id: plantId, per_page: 5000 },
    { refetchInterval: 30_000 },
  )
  const characteristics = useMemo(() => charsData?.items ?? [], [charsData])
  const positions = useMemo(() => {
    if (!hierarchyTree || characteristics.length === 0) return null
    return computeConstellationLayout(hierarchyTree, characteristics)
  }, [hierarchyTree, characteristics])
  const hierarchyPathMap = useMemo(() => {
    if (!hierarchyTree) return null
    return buildHierarchyPathMap(hierarchyTree)
  }, [hierarchyTree])

  useEffect(() => { positionsRef.current = positions ?? null }, [positions])
  const hierarchyPathMapRef = useRef(hierarchyPathMap)
  hierarchyPathMapRef.current = hierarchyPathMap

  const { data: chartData } = useChartData(
    focusedCharIdRef.current ?? 0,
    { limit: 100 },
    { refetchInterval: isConnected ? false : 5000 },
  )
  const { data: capability } = useCapability(focusedCharIdRef.current ?? 0)
  const characteristicsRef = useRef(characteristics)
  characteristicsRef.current = characteristics

  // LOD / dispose helpers — thin wrappers around scene-helpers.ts
  const disposeMoonLines = useCallback(() => {
    moonLinesRef.current = disposeMoonLinesFromSystem(moonLinesRef.current, focusedSystemRef.current)
  }, [])

  const disposeSigmaBands = useCallback(() => {
    sigmaBandsRef.current = disposeSigmaBandsFromSystem(sigmaBandsRef.current, focusedSystemRef.current)
  }, [])

  const disposeViolationSparks = useCallback(() => {
    violationSparksRef.current = disposeViolationSparksFromSystem(violationSparksRef.current, focusedSystemRef.current)
  }, [])

  const updateLODForZoomLevel = useCallback(
    (level: ZoomLevel, charId: number | null, constellationId: number | null) => {
      const posMap = positionsRef.current
      if (!posMap) return
      const disposals = updateLODHelper(level, charId, constellationId, {
        systems: systemsRef.current,
        posMap,
        galaxyCards: galaxyInfoCardsRef.current,
        constellationCards: constellationCardsRef.current,
        chars: characteristicsRef.current,
        pathMap: hierarchyPathMapRef.current,
        moonLines: moonLinesRef.current,
        focusedSystem: focusedSystemRef.current,
        sigmaBands: sigmaBandsRef.current,
        violationSparks: violationSparksRef.current,
      })
      moonLinesRef.current = disposals.moonLines
      sigmaBandsRef.current = disposals.sigmaBands
      violationSparksRef.current = disposals.violationSparks
    },
    [],
  )

  // Raycasting helpers — delegate to scene-helpers with current refs
  const findClickTarget = useCallback(
    (event: PointerEvent) => {
      const renderer = rendererRef.current
      const camera = cameraRef.current
      const scene = sceneRef.current
      const posMap = positionsRef.current
      if (!renderer || !camera || !scene || !posMap) return null
      return findClickTargetHelper(
        event, renderer, camera, scene,
        pointerRef.current, raycasterRef.current,
        systemsRef.current, posMap,
      )
    },
    [],
  )

  const findMoonClickTarget = useCallback(
    (event: PointerEvent): number | null => {
      const renderer = rendererRef.current
      const camera = cameraRef.current
      const system = focusedSystemRef.current
      if (!renderer || !camera || !system) return null
      return findMoonClickTargetHelper(
        event, renderer, camera,
        pointerRef.current, raycasterRef.current, system,
      )
    },
    [],
  )
  // Dismiss any active CSS2D labels
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

  // Effect 1: Setup Three.js renderer, scene, camera, stars, animation loop.
  // Runs once on mount. Does NOT depend on data.
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

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(colors.navy.getHex(), 0.0003)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 2000)
    camera.position.set(0, 300, 500)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const controller = new CameraController(camera)
    controllerRef.current = controller

    const { mesh: starsMesh, geometry: starsGeo } = createStarField(3000, colors.muted.getHex())
    scene.add(starsMesh)
    starsRef.current = starsMesh

    const clock = new THREE.Clock()
    clockRef.current = clock
    let prevTime = 0

    function animate() {
      frameIdRef.current = requestAnimationFrame(animate)
      const time = clock.getElapsedTime()
      const deltaMs = (time - prevTime) * 1000
      prevTime = time

      const ctrl = controllerRef.current
      const labelEl = labelRendererRef.current?.domElement
      if (ctrl) {
        const cameraMoved = ctrl.update(deltaMs)

        // Check for zoom level / focused char changes and update LOD
        const level = ctrl.zoomLevel
        if (level !== prevZoomLevelRef.current || ctrl.focusedCharId !== focusedCharIdRef.current || ctrl.focusedConstellationId !== prevConstellationIdRef.current) {
          dismissLabels()
          updateLODForZoomLevel(level, ctrl.focusedCharId, ctrl.focusedConstellationId)

          const charId = ctrl.focusedCharId
          focusedCharIdRef.current = charId
          setSubscribedCharId(charId)
          focusedSystemRef.current = charId != null ? (systemsRef.current.get(charId) ?? null) : null

          onFocusChangeRef.current?.(charId, level, ctrl.focusedConstellationId)
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

    // Click handler — track drag distance to distinguish clicks from drags
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

    // Scroll handler — forward to camera controller
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

    // ESC handler — back out one level
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

    // Capture ref values for cleanup (refs may change by the time cleanup runs)
    const galaxyInfoCards = galaxyInfoCardsRef.current
    const constellationCards = constellationCardsRef.current

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
      disposeCardMap(galaxyInfoCards)
      disposeCardMap(constellationCards)
      moonLinesRef.current = disposeMoonLinesFromSystem(moonLinesRef.current, focusedSystemRef.current)
      sigmaBandsRef.current = disposeSigmaBandsFromSystem(sigmaBandsRef.current, focusedSystemRef.current)
      violationSparksRef.current = disposeViolationSparksFromSystem(violationSparksRef.current, focusedSystemRef.current)

      // Comprehensive GPU resource sweep
      disposeSceneGPUResources(scene)

      // Dispose CSS2DRenderer
      if (container.contains(labelRenderer.domElement)) {
        container.removeChild(labelRenderer.domElement)
      }
      labelRendererRef.current = null

      // Dispose renderer (AFTER traverse to ensure GPU resources freed first)
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

  // Effect 2: Populate scene with planet systems + constellation lines
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
      if (applyCharacteristicColor(system, char)) {
        violatingIds.add(char.id)
      }
    }

    systemsRef.current = systems
    violatingIdsRef.current = violatingIds

    // Create galaxy info cards (starts at galaxy zoom)
    disposeCardMap(galaxyInfoCardsRef.current)
    createGalaxyCardsHelper(characteristics, systems, galaxyInfoCardsRef.current)

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
  }, [positions, characteristics])

  // Effect 2b: Diff characteristic data to refresh dot colors without rebuild
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
      if (applyCharacteristicColor(system, char)) {
        violatingIds.add(char.id)
      }
    }
    violatingIdsRef.current = violatingIds
  }, [characteristics])

  // Effect 3: Sync chart data + capability to the focused planet
  useEffect(() => {
    const charId = focusedCharIdRef.current
    if (!charId) return
    const system = systemsRef.current.get(charId)
    if (!system) return

    if (chartData) {
      syncChartDataToSystem(chartData, system, charId, violatingIdsRef.current)
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
      if (char && (ctrl0?.zoomLevel === 'galaxy' || ctrl0?.zoomLevel === 'constellation')) {
        updateInfoCardForCapability(
          charId, char, capability, system, ctrl0.zoomLevel,
          galaxyInfoCardsRef.current, constellationCardsRef.current,
          hierarchyPathMapRef.current,
        )
      }
    }

    // At planet zoom, attach moon lines, sigma bands, and violation sparks
    const ctrl = controllerRef.current
    if (ctrl?.zoomLevel === 'planet' && chartData) {
      disposeMoonLines()
      disposeSigmaBands()
      disposeViolationSparks()

      const overlays = buildPlanetZoomOverlays(
        chartData, system, showTraceRef.current, showSpokesRef.current,
      )
      moonLinesRef.current = overlays.moonLines
      sigmaBandsRef.current = overlays.sigmaBands
      violationSparksRef.current = overlays.violationSparks
    }
  }, [chartData, capability, disposeMoonLines, disposeSigmaBands, disposeViolationSparks])

  // Effect 3b: Sync moon line visibility when props change
  useEffect(() => {
    if (moonLinesRef.current) {
      moonLinesRef.current.setSequentialVisible(showTrace)
      moonLinesRef.current.setRadialVisible(showSpokes)
    }
  }, [showTrace, showSpokes])

  // Effect 4: WebSocket subscription for live updates
  useEffect(() => {
    if (!subscribedCharId) return
    subscribe(subscribedCharId)
    return () => unsubscribe(subscribedCharId)
  }, [subscribedCharId, subscribe, unsubscribe])

  // Effect 5: Navigate to constellation
  useEffect(() => {
    if (
      navigateToConstellationId == null ||
      navigateToConstellationId === prevNavConstellationRef.current
    )
      return

    const controller = controllerRef.current
    const posMap = positionsRef.current
    if (!controller || !posMap || controller.isAnimating) return

    const target = computeConstellationCenter(navigateToConstellationId, posMap)
    if (!target) return

    prevNavConstellationRef.current = navigateToConstellationId
    controller.flyTo(target, 'constellation', {
      constellationId: navigateToConstellationId,
    })
  }, [navigateToConstellationId])

  // Effect 6: Navigate to planet
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

  // Effect 7: Navigate to galaxy
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
