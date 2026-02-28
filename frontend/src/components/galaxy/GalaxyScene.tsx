import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import * as THREE from 'three'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { PlanetSystem } from '@/lib/galaxy/PlanetSystem'
import { ConstellationLines } from '@/lib/galaxy/ConstellationLines'
import { DEFAULT_LOGIN_CONFIG } from '@/lib/galaxy/types'
import { computeConstellationLayout } from '@/lib/galaxy/constellation-layout'
import type { ConstellationPosition } from '@/lib/galaxy/constellation-layout'
import { CameraController } from '@/lib/galaxy/CameraController'
import type { ZoomLevel } from '@/lib/galaxy/CameraController'
import { useChartData } from '@/api/hooks/characteristics'
import { useCharacteristics, useHierarchyTreeByPlant, useCapability } from '@/api/hooks'
import { useWebSocketContext } from '@/providers/WebSocketProvider'
import {
  controlLimitsToGap,
  valueToRadius,
  timestampToAngle,
  cpkToColorHex,
} from '@/lib/galaxy/data-mapping'
import {
  createPlanetLabel,
  createControlLimitLabels,
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
}

/** Shared color palette for all planet systems */
const colors = {
  navy: new THREE.Color('#080C16'),
  gold: new THREE.Color('#D4AF37'),
  cream: new THREE.Color('#F4F1DE'),
  orange: new THREE.Color('#E05A3D'),
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

  // Layout positions ref (accessible from event handlers and animation loop)
  const positionsRef = useRef<Map<number, ConstellationPosition> | null>(null)

  // CSS2DRenderer for labels
  const labelRendererRef = useRef<CSS2DRenderer | null>(null)
  const activeLabelRef = useRef<CSS2DObject | null>(null)
  const activeControlLabelsRef = useRef<CSS2DObject[]>([])

  // Raycaster for click detection
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())
  const pointerRef = useRef<THREE.Vector2>(new THREE.Vector2())

  // Kiosk mode ref (accessible from animation loop)
  const kioskModeRef = useRef(kioskMode)
  kioskModeRef.current = kioskMode

  // Moon click callback ref
  const onMoonClickRef = useRef(onMoonClick)
  onMoonClickRef.current = onMoonClick

  // Callback ref for focus changes
  const onFocusChangeRef = useRef(onFocusChange)
  onFocusChangeRef.current = onFocusChange

  // Initial focus ref (consumed once on first population)
  const initialFocusRef = useRef(initialFocusCharId)
  const initialFocusConsumedRef = useRef(false)

  const { subscribe, unsubscribe, isConnected } = useWebSocketContext()

  // Fetch hierarchy tree and all characteristics for the selected plant
  const { data: hierarchyTree } = useHierarchyTreeByPlant(plantId)
  const { data: charsData } = useCharacteristics({ plant_id: plantId, per_page: 5000 })
  const characteristics = useMemo(() => charsData?.items ?? [], [charsData])

  // Compute layout positions from hierarchy + characteristics
  const positions = useMemo(() => {
    if (!hierarchyTree || characteristics.length === 0) return null
    return computeConstellationLayout(hierarchyTree, characteristics)
  }, [hierarchyTree, characteristics])

  // Keep positions ref in sync
  useEffect(() => {
    positionsRef.current = positions ?? null
  }, [positions])

  // Fetch chart data and capability for the focused characteristic
  const { data: chartData } = useChartData(
    focusedCharIdRef.current ?? 0,
    { limit: 25 },
    { refetchInterval: isConnected ? false : 5000 },
  )
  const { data: capability } = useCapability(focusedCharIdRef.current ?? 0)

  // Data refs (accessible from Effect 1 event handlers which close over mount scope)
  const characteristicsRef = useRef(characteristics)
  characteristicsRef.current = characteristics
  const capabilityRef = useRef(capability)
  capabilityRef.current = capability

  // -------------------------------------------------------------------------
  // LOD management callback — called when zoom level changes
  // -------------------------------------------------------------------------
  const updateLODForZoomLevel = useCallback(
    (
      level: ZoomLevel,
      charId: number | null,
      constellationId: number | null,
    ) => {
      const systems = systemsRef.current
      const posMap = positionsRef.current
      if (systems.size === 0 || !posMap) return

      if (level === 'galaxy') {
        // Downgrade everything to dot
        for (const system of systems.values()) {
          if (system.lod !== 'dot') system.setLOD('dot')
        }
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
    [],
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

// -------------------------------------------------------------------------  // Find which moon mesh was clicked (planet zoom only)  // -------------------------------------------------------------------------  const findMoonClickTarget = useCallback(    (event: PointerEvent): number | null => {      const renderer = rendererRef.current      const camera = cameraRef.current      if (!renderer || !camera) return null      const system = focusedSystemRef.current      if (!system || system.lod !== 'full') return null      const moonMeshes = system.getMoonMeshes()      if (moonMeshes.length === 0) return null      const rect = renderer.domElement.getBoundingClientRect()      pointerRef.current.x =        ((event.clientX - rect.left) / rect.width) * 2 - 1      pointerRef.current.y =        -((event.clientY - rect.top) / rect.height) * 2 + 1      camera.updateMatrixWorld()      raycasterRef.current.setFromCamera(pointerRef.current, camera)      const intersects = raycasterRef.current.intersectObjects(moonMeshes, false)      if (intersects.length === 0) return null      const hitMesh = intersects[0].object      const moonIndex = moonMeshes.indexOf(hitMesh as THREE.Mesh)      return moonIndex >= 0 ? moonIndex : null    },    [],  )
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
    scene.fog = new THREE.FogExp2(colors.navy.getHex(), 0.0005)
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
        size: 0.2,
        transparent: true,
        opacity: 0.4,
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
      if (ctrl) {
        ctrl.update(deltaMs)

        // Check for zoom level changes and update LOD
        const level = ctrl.zoomLevel
        if (level !== prevZoomLevelRef.current) {
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

          prevZoomLevelRef.current = level
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

      // Update constellation lines
      if (linesRef.current) {
        linesRef.current.update(time, violatingIdsRef.current)
      }

      if (starsRef.current) {
        starsRef.current.rotation.y += 0.0001
      }
      renderer.render(scene, camera)
      labelRenderer.render(scene, camera)
    }
    animate()

    // -----------------------------------------------------------------------
    // Click handler — raycast to detect planet/constellation clicks
    // -----------------------------------------------------------------------
    function handlePointerDown(event: PointerEvent) {
      const ctrl = controllerRef.current
      if (!ctrl || ctrl.isAnimating) return

      // At planet zoom, check for moon clicks first
      if (ctrl.zoomLevel === 'planet') {
        const moonIdx = findMoonClickTarget(event)
        if (moonIdx != null) {
          onMoonClickRef.current?.(moonIdx)
          return
        }
      }

      const hit = findClickTarget(event)

      if (!hit) {
        // Click on empty space — dismiss any active label
        dismissLabels()
        return
      }

      const currentZoom = ctrl.zoomLevel

      if (currentZoom === 'galaxy') {
        // At galaxy level, click flies to the clicked constellation
        dismissLabels()
        ctrl.flyTo(hit.position, 'constellation', {
          constellationId: hit.constellationId,
        })
      } else if (currentZoom === 'constellation') {
        // At constellation level, show a label on the clicked planet
        dismissLabels()

        // Find the characteristic data for this planet
        const chars = characteristicsRef.current
        const charData = chars.find((c) => c.id === hit.charId)
        if (charData) {
          const system = systemsRef.current.get(hit.charId)
          if (system) {
            const label = createPlanetLabel(charData, capabilityRef.current)
            system.group.add(label)
            activeLabelRef.current = label
          }
        }

        // Also fly to the planet
        ctrl.flyTo(hit.position, 'planet', {
          charId: hit.charId,
          constellationId: hit.constellationId,
        })
      } else if (currentZoom === 'planet') {
        // At planet level, check if a moon (data point) was clicked
        const focusedId = ctrl.focusedCharId
        if (focusedId != null) {
          const system = systemsRef.current.get(focusedId)
          if (system) {
            const moonMeshes = system.getMoonMeshes()
            if (moonMeshes.length > 0) {
              const moonHits = raycasterRef.current.intersectObjects(moonMeshes)
              if (moonHits.length > 0) {
                const moonIndex = moonMeshes.indexOf(moonHits[0].object as THREE.Mesh)
                if (moonIndex >= 0) {
                  onMoonClickRef.current?.(moonIndex)
                  return
                }
              }
            }
          }
        }

        // No moon hit — show a label on the clicked planet
        dismissLabels()

        const chars = characteristicsRef.current
        const charData = chars.find((c) => c.id === hit.charId)
        if (charData) {
          const system = systemsRef.current.get(hit.charId)
          if (system) {
            const label = createPlanetLabel(charData, capabilityRef.current)
            system.group.add(label)
            activeLabelRef.current = label
          }
        }
      }
    }
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)

    // -----------------------------------------------------------------------
    // Scroll handler — forward to camera controller
    // -----------------------------------------------------------------------
    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      const ctrl = controllerRef.current
      if (!ctrl || ctrl.isAnimating) return

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

    // Resize handler
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

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', handleKeyDown)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
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

      // Dispose active labels
      dismissLabels()

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

      const system = new PlanetSystem({ ...DEFAULT_LOGIN_CONFIG, colors }, 'dot')
      system.group.position.set(pos.x, 0, pos.z)
      scene.add(system.group)
      systems.set(char.id, system)

      // Set initial color based on in_control status
      if (char.in_control === false) {
        system.setDotColor(new THREE.Color('#E05A3D'))
        violatingIds.add(char.id)
      }
    }

    systemsRef.current = systems
    violatingIdsRef.current = violatingIds

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

      // Use attribute data points for attribute charts, otherwise variable data points
      const isAttribute =
        chartData.data_type === 'attribute' && chartData.attribute_data_points?.length
      const moonData = isAttribute
        ? chartData.attribute_data_points!.map((pt, i, arr) => ({
            angle: timestampToAngle(i, arr.length),
            radius: valueToRadius(pt.plotted_value, ucl ?? 0, lcl ?? 0, gap),
            hasViolation: pt.violation_ids.length > 0,
          }))
        : chartData.data_points.map((pt, i, arr) => ({
            angle: timestampToAngle(i, arr.length),
            radius: valueToRadius(pt.mean, ucl ?? 0, lcl ?? 0, gap),
            hasViolation: pt.violation_ids.length > 0,
          }))

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

    // At planet zoom, attach UCL/CL/LCL control limit labels to the focused system
    const ctrl = controllerRef.current
    if (ctrl?.zoomLevel === 'planet' && chartData) {
      // Remove old control limit labels first
      for (const cl of activeControlLabelsRef.current) {
        disposeLabel(cl)
      }
      activeControlLabelsRef.current = []

      const clLabels = createControlLimitLabels(chartData)
      for (const cl of clLabels) {
        system.group.add(cl)
      }
      activeControlLabelsRef.current = clLabels
    }
  }, [chartData, capability])

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
  const prevNavConstellationRef = useRef<number | null | undefined>(undefined)
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
  const prevNavCharRef = useRef<number | null | undefined>(undefined)
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

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ background: '#080C16', width: '100%', height: '100%', position: 'relative' }}
    />
  )
}
