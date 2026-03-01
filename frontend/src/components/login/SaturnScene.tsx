import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { PlanetSystem } from '@/lib/galaxy/PlanetSystem'
import { DEFAULT_LOGIN_CONFIG } from '@/lib/galaxy/types'

/**
 * Three.js WebGL Saturn particle system with Daphnis-style moon warp effects.
 * Default export for React.lazy loading.
 *
 * Features:
 * - Dot-matrix planet (Fibonacci sphere, 6000 points)
 * - 180K ring particles with 3 visible gaps (Cassini Division style)
 * - 12 moons orbiting in gaps with anomaly state machine
 * - GPU-computed wake distortion via custom GLSL shaders
 * - Parallax mouse tracking
 * - Stars with exponential fog
 */

const STAR_COUNT = 1000

interface SaturnSceneProps {
  brandColors?: {
    navy?: string
    gold?: string
    cream?: string
    orange?: string
    muted?: string
  }
}

function SaturnScene({ brandColors }: SaturnSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Resolve colors from brand props with hardcoded defaults
    const navy = new THREE.Color(brandColors?.navy ?? '#080C16')
    const gold = new THREE.Color(brandColors?.gold ?? '#D4AF37')
    const cream = new THREE.Color(brandColors?.cream ?? '#F4F1DE')
    const orange = new THREE.Color(brandColors?.orange ?? '#E05A3D')
    const muted = new THREE.Color(brandColors?.muted ?? '#4B5563')

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // --- Scene & Camera ---
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(navy.getHex(), 0.003)

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    )
    camera.position.set(0, 18, 50)

    // --- Planet System ---
    const system = new PlanetSystem({
      ...DEFAULT_LOGIN_CONFIG,
      colors: { navy, gold, cream, orange, muted },
    })
    system.group.position.set(10, -5, -15)
    system.group.rotation.z = -20 * (Math.PI / 180)
    system.group.rotation.x = 12 * (Math.PI / 180)
    scene.add(system.group)

    // --- BACKGROUND STARS ---
    const starsGeo = new THREE.BufferGeometry()
    const posArray = new Float32Array(STAR_COUNT * 3)
    for (let i = 0; i < STAR_COUNT * 3; i += 3) {
      const r = 100 + Math.random() * 200
      const theta = Math.random() * Math.PI * 2
      const p = Math.acos(Math.random() * 2 - 1)
      posArray[i] = r * Math.sin(p) * Math.cos(theta)
      posArray[i + 1] = r * Math.sin(p) * Math.sin(theta)
      posArray[i + 2] = r * Math.cos(p)
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3))
    const starsMat = new THREE.PointsMaterial({
      color: muted.getHex(),
      size: 0.2,
      transparent: true,
      opacity: 0.4,
    })
    const starsMesh = new THREE.Points(starsGeo, starsMat)
    scene.add(starsMesh)

    // --- MOUSE PARALLAX ---
    let mouseX = 0
    let mouseY = 0

    function handleMouseMove(event: MouseEvent) {
      mouseX = (event.clientX - window.innerWidth / 2) * 0.05
      mouseY = (event.clientY - window.innerHeight / 2) * 0.05
    }

    document.addEventListener('mousemove', handleMouseMove)

    // --- ANIMATION ---
    const clock = new THREE.Clock()
    let frameId: number

    function animate() {
      frameId = requestAnimationFrame(animate)
      const time = clock.getElapsedTime()

      // Parallax camera
      const targetX = mouseX * 0.5
      const targetY = mouseY * 0.5
      camera.position.x += (targetX - camera.position.x) * 0.02
      camera.position.y += (-targetY + 18 - camera.position.y) * 0.02
      camera.lookAt(0, 0, 0)

      starsMesh.rotation.y += 0.0001

      system.update(time)

      renderer.render(scene, camera)
    }

    animate()

    // --- Resize ---
    function handleResize() {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
      system.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }

    window.addEventListener('resize', handleResize)

    // --- Cleanup ---
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(frameId)

      system.dispose()
      starsGeo.dispose()
      starsMat.dispose()
      renderer.dispose()

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [brandColors])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0"
      style={{ background: brandColors?.navy ?? '#080C16', pointerEvents: 'none' }}
      aria-hidden="true"
    />
  )
}

export default SaturnScene
