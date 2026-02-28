import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { PlanetSystem } from '@/lib/galaxy/PlanetSystem'
import { DEFAULT_LOGIN_CONFIG } from '@/lib/galaxy/types'
import { useChartData } from '@/api/hooks/characteristics'
import { useCapability } from '@/api/hooks/quality'
import {
  controlLimitsToGap,
  valueToRadius,
  timestampToAngle,
  cpkToColorHex,
} from '@/lib/galaxy/data-mapping'

interface GalaxySceneProps {
  className?: string
  characteristicId?: number
}

export function GalaxyScene({ className, characteristicId }: GalaxySceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const systemRef = useRef<PlanetSystem | null>(null)

  // Fetch chart data and capability for the focused characteristic
  const { data: chartData } = useChartData(characteristicId ?? 0, { limit: 25 })
  const { data: capability } = useCapability(characteristicId ?? 0)

  // Setup Three.js scene (runs once)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Same color palette as login page
    const colors = {
      navy: new THREE.Color('#080C16'),
      gold: new THREE.Color('#D4AF37'),
      cream: new THREE.Color('#F4F1DE'),
      orange: new THREE.Color('#E05A3D'),
      muted: new THREE.Color('#4B5563'),
    }

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // Scene + fog
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(colors.navy.getHex(), 0.003)

    // Camera — positioned slightly differently than login for a more "overview" feel
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    )
    camera.position.set(0, 30, 60)
    camera.lookAt(0, 0, 0)

    // Background stars (same as login page)
    const starsGeo = new THREE.BufferGeometry()
    const starPositions = new Float32Array(1000 * 3)
    for (let i = 0; i < 1000 * 3; i += 3) {
      const r = 100 + Math.random() * 200
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

    // Single planet system (proof of concept — uses random login animation)
    const system = new PlanetSystem({ ...DEFAULT_LOGIN_CONFIG, colors })
    system.group.rotation.z = -20 * (Math.PI / 180)
    system.group.rotation.x = 12 * (Math.PI / 180)
    scene.add(system.group)

    // Store system in ref for data sync effect
    systemRef.current = system

    // Animation loop
    const clock = new THREE.Clock()
    let frameId: number

    function animate() {
      frameId = requestAnimationFrame(animate)
      const time = clock.getElapsedTime()
      system.update(time)
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
      system.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      systemRef.current = null
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(frameId)
      system.dispose()
      starsGeo.dispose()
      ;(starsMesh.material as THREE.Material).dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  // Sync data to the PlanetSystem when chart data changes
  useEffect(() => {
    const system = systemRef.current
    if (!system || !characteristicId) return

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
    }

    // Apply Cpk coloring to planet
    if (capability) {
      const hex = cpkToColorHex(capability.cpk)
      system.setPlanetColor(new THREE.Color(hex))
    }
  }, [chartData, capability, characteristicId])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ background: '#080C16', width: '100%', height: '100%' }}
    />
  )
}
