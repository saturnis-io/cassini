import { useEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { PlanetSystem } from '@/lib/galaxy/PlanetSystem'
import { ConstellationLines } from '@/lib/galaxy/ConstellationLines'
import { DEFAULT_LOGIN_CONFIG } from '@/lib/galaxy/types'
import { computeConstellationLayout } from '@/lib/galaxy/constellation-layout'
import { useChartData } from '@/api/hooks/characteristics'
import { useCharacteristics, useHierarchyTree, useCapability } from '@/api/hooks'
import { useWebSocketContext } from '@/providers/WebSocketProvider'
import {
  controlLimitsToGap,
  valueToRadius,
  timestampToAngle,
  cpkToColorHex,
} from '@/lib/galaxy/data-mapping'

interface GalaxySceneProps {
  className?: string
  focusedCharId?: number
}

/** Shared color palette for all planet systems */
const colors = {
  navy: new THREE.Color('#080C16'),
  gold: new THREE.Color('#D4AF37'),
  cream: new THREE.Color('#F4F1DE'),
  orange: new THREE.Color('#E05A3D'),
  muted: new THREE.Color('#4B5563'),
}

export function GalaxyScene({ className, focusedCharId }: GalaxySceneProps) {
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

  const { subscribe, unsubscribe, isConnected } = useWebSocketContext()

  // Fetch hierarchy tree and all characteristics for the plant
  const { data: hierarchyTree } = useHierarchyTree()
  const { data: charsData } = useCharacteristics({ per_page: 5000 })
  const characteristics = useMemo(() => charsData?.items ?? [], [charsData])

  // Compute layout positions from hierarchy + characteristics
  const positions = useMemo(() => {
    if (!hierarchyTree || characteristics.length === 0) return null
    return computeConstellationLayout(hierarchyTree, characteristics)
  }, [hierarchyTree, characteristics])

  // Fetch chart data and capability for the focused characteristic
  const { data: chartData } = useChartData(
    focusedCharId ?? 0,
    { limit: 25 },
    { refetchInterval: isConnected ? false : 5000 },
  )
  const { data: capability } = useCapability(focusedCharId ?? 0)

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
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
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

    function animate() {
      frameIdRef.current = requestAnimationFrame(animate)
      const time = clock.getElapsedTime()

      // Update all planet systems
      for (const system of systemsRef.current.values()) {
        system.update(time)
      }

      // Update constellation lines
      if (linesRef.current) {
        linesRef.current.update(time, violatingIdsRef.current)
      }

      starsMesh.rotation.y += 0.0001
      renderer.render(scene, camera)
    }
    animate()

    // Resize handler
    function handleResize() {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
      const pr = Math.min(window.devicePixelRatio, 2)
      for (const system of systemsRef.current.values()) {
        system.setPixelRatio(pr)
      }
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
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
      focusedSystemRef.current = null
    }
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

    // If there's already a focused char, upgrade it to full LOD
    if (focusedCharId) {
      const focused = systems.get(focusedCharId)
      if (focused) {
        focused.setLOD('full')
        focusedSystemRef.current = focused
      }
    }
  }, [positions, characteristics, focusedCharId])

  // -------------------------------------------------------------------------
  // Effect 3: Manage focused planet LOD transitions
  // When focusedCharId changes, downgrade the old and upgrade the new.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const systems = systemsRef.current
    if (systems.size === 0) return

    // Downgrade the previously focused system
    if (focusedSystemRef.current) {
      focusedSystemRef.current.setLOD('dot')
    }

    if (!focusedCharId) {
      focusedSystemRef.current = null
      return
    }

    const system = systems.get(focusedCharId)
    if (system) {
      system.setLOD('full')
      focusedSystemRef.current = system
    } else {
      focusedSystemRef.current = null
    }
  }, [focusedCharId])

  // -------------------------------------------------------------------------
  // Effect 4: Sync chart data + capability to the focused planet
  // -------------------------------------------------------------------------
  useEffect(() => {
    const system = focusedSystemRef.current
    if (!system || !focusedCharId) return

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
        violatingIdsRef.current.add(focusedCharId)
      } else {
        violatingIdsRef.current.delete(focusedCharId)
      }
    }

    // Apply Cpk coloring to planet
    if (capability) {
      const hex = cpkToColorHex(capability.cpk)
      system.setPlanetColor(new THREE.Color(hex))
    }
  }, [chartData, capability, focusedCharId])

  // -------------------------------------------------------------------------
  // Effect 5: WebSocket subscription for live updates on focused characteristic
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!focusedCharId) return
    subscribe(focusedCharId)
    return () => unsubscribe(focusedCharId)
  }, [focusedCharId, subscribe, unsubscribe])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ background: '#080C16', width: '100%', height: '100%' }}
    />
  )
}
