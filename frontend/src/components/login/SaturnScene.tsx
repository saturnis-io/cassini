import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { ringVertexShader, ringFragmentShader } from '@/components/login/saturn-shaders'

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

const RING_PARTICLE_COUNT = 180000
const PLANET_PARTICLE_COUNT = 6000
const STAR_COUNT = 1000
const PLANET_RADIUS = 10.5
const NUM_MOONS = 12

interface MoonState {
  mesh: THREE.Mesh
  angle: number
  speed: number
  gap: { in: number; out: number; center: number }
  currentRadius: number
  targetRadius: number
  anomalyState: number
  anomalyTarget: number
  noiseOffset: number
  noiseFreq: number
  currentRotation: number
  anomaliesThisRotation: number
  rotationsSinceLastAnomaly: number
  anomalyTimeout: ReturnType<typeof setTimeout> | null
}

const gaps = [
  { in: 14.5, out: 16.5, center: 15.5 },
  { in: 20.0, out: 23.5, center: 21.75 },
  { in: 27.0, out: 28.5, center: 27.75 },
]

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

    const saturnSystem = new THREE.Group()
    saturnSystem.position.set(10, -5, -15)
    scene.add(saturnSystem)

    // --- 1. DOT-MATRIX PLANET (Fibonacci sphere) ---
    const pPositions = new Float32Array(PLANET_PARTICLE_COUNT * 3)
    const pColors = new Float32Array(PLANET_PARTICLE_COUNT * 3)
    const phi = Math.PI * (3 - Math.sqrt(5))

    for (let i = 0; i < PLANET_PARTICLE_COUNT; i++) {
      const y = 1 - (i / (PLANET_PARTICLE_COUNT - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const theta = phi * i

      pPositions[i * 3] = Math.cos(theta) * r * PLANET_RADIUS
      pPositions[i * 3 + 1] = y * PLANET_RADIUS
      pPositions[i * 3 + 2] = Math.sin(theta) * r * PLANET_RADIUS

      const mixedColor = cream.clone().lerp(
        gold,
        (y + 1) / 2 + (Math.random() * 0.2 - 0.1),
      )
      pColors[i * 3] = mixedColor.r
      pColors[i * 3 + 1] = mixedColor.g
      pColors[i * 3 + 2] = mixedColor.b
    }

    const planetGeo = new THREE.BufferGeometry()
    planetGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3))
    planetGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3))

    const planetMat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    })
    const planet = new THREE.Points(planetGeo, planetMat)
    saturnSystem.add(planet)

    // Solid core to occlude ring particles behind planet
    const coreGeo = new THREE.SphereGeometry(10.2, 32, 32)
    const coreMat = new THREE.MeshBasicMaterial({ color: navy })
    const core = new THREE.Mesh(coreGeo, coreMat)
    saturnSystem.add(core)

    // --- 2. MULTI-GAP RING PARTICLES ---
    const rPositions = new Float32Array(RING_PARTICLE_COUNT * 3)
    const rColors = new Float32Array(RING_PARTICLE_COUNT * 3)

    let ringIdx = 0
    while (ringIdx < RING_PARTICLE_COUNT) {
      const theta = Math.random() * Math.PI * 2
      const radius = 12.0 + Math.pow(Math.random(), 1.2) * 20.0

      let inGap = false
      for (const g of gaps) {
        if (radius > g.in && radius < g.out) {
          if (Math.random() > 0.015) inGap = true
        }
      }
      if (inGap) continue

      rPositions[ringIdx * 3] = Math.cos(theta) * radius
      rPositions[ringIdx * 3 + 1] = (Math.random() - 0.5) * 0.04
      rPositions[ringIdx * 3 + 2] = Math.sin(theta) * radius

      const ringCol = cream.clone().lerp(muted, (radius - 12.0) / 20.0)
      rColors[ringIdx * 3] = ringCol.r
      rColors[ringIdx * 3 + 1] = ringCol.g
      rColors[ringIdx * 3 + 2] = ringCol.b

      ringIdx++
    }

    const ringGeo = new THREE.BufferGeometry()
    ringGeo.setAttribute('position', new THREE.BufferAttribute(rPositions, 3))
    ringGeo.setAttribute('color', new THREE.BufferAttribute(rColors, 3))

    const uMoonsArray: THREE.Vector3[] = []
    const uMoonStatusArray: number[] = []
    for (let i = 0; i < NUM_MOONS; i++) {
      uMoonsArray.push(new THREE.Vector3())
      uMoonStatusArray.push(0)
    }

    const ringShaderMat = new THREE.ShaderMaterial({
      vertexShader: ringVertexShader,
      fragmentShader: ringFragmentShader,
      uniforms: {
        uMoons: { value: uMoonsArray },
        uMoonStatus: { value: uMoonStatusArray },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uAlertColor: { value: orange },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    const rings = new THREE.Points(ringGeo, ringShaderMat)
    saturnSystem.add(rings)

    // --- 3. MOON DATA SAMPLES ---
    const moonGeo = new THREE.SphereGeometry(0.12, 16, 16)
    const moons: MoonState[] = []

    for (let i = 0; i < NUM_MOONS; i++) {
      const gap = gaps[i % gaps.length]
      const mat = new THREE.MeshBasicMaterial({ color: cream.clone() })
      const mesh = new THREE.Mesh(moonGeo, mat)
      saturnSystem.add(mesh)

      const initialAngle = ((Math.PI * 2) / NUM_MOONS) * i + Math.random()
      moons.push({
        mesh,
        angle: initialAngle,
        speed: 0.0015 + Math.random() * 0.001,
        gap,
        currentRadius: gap.center,
        targetRadius: gap.center,
        anomalyState: 0,
        anomalyTarget: gap.center,
        noiseOffset: Math.random() * 100,
        noiseFreq: 0.3 + Math.random() * 0.3,
        currentRotation: Math.floor(initialAngle / (Math.PI * 2)),
        anomaliesThisRotation: 0,
        rotationsSinceLastAnomaly: 0,
        anomalyTimeout: null,
      })
    }

    // Tilt the Saturn system
    saturnSystem.rotation.z = -20 * (Math.PI / 180)
    saturnSystem.rotation.x = 12 * (Math.PI / 180)

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

      // Pass time to the shader for active ripple undulation
      ringShaderMat.uniforms.uTime.value = time

      // Parallax camera
      const targetX = mouseX * 0.5
      const targetY = mouseY * 0.5
      camera.position.x += (targetX - camera.position.x) * 0.02
      camera.position.y += (-targetY + 18 - camera.position.y) * 0.02
      camera.lookAt(0, 0, 0)

      planet.rotation.y += 0.001
      starsMesh.rotation.y += 0.0001

      // Moon state machine
      moons.forEach((moon, i) => {
        moon.angle += moon.speed

        const currentRot = Math.floor(moon.angle / (Math.PI * 2))
        if (currentRot > moon.currentRotation) {
          if (moon.anomaliesThisRotation === 0) moon.rotationsSinceLastAnomaly++
          else moon.rotationsSinceLastAnomaly = 0
          moon.anomaliesThisRotation = 0
          moon.currentRotation = currentRot
        }

        // 3-State Machine: 0 = Normal, 1 = Anomaly Spike, 2 = Recovering
        if (moon.anomalyState === 0) {
          // Normal variance within the gap
          moon.targetRadius =
            moon.gap.center +
            Math.sin(time * moon.noiseFreq + moon.noiseOffset) *
              ((moon.gap.out - moon.gap.in) * 0.25)

          let triggerProbability = 0
          if (moon.anomaliesThisRotation < 2) {
            if (moon.rotationsSinceLastAnomaly >= 2) {
              const fraction = (moon.angle / (Math.PI * 2)) % 1
              triggerProbability = 0.002 + fraction * 0.05
            } else {
              triggerProbability = 0.0004
            }
          }

          if (Math.random() < triggerProbability) {
            moon.anomalyState = 1
            moon.anomaliesThisRotation++
            const dir = Math.random() > 0.5 ? 1 : -1
            moon.anomalyTarget =
              moon.gap.center + dir * ((moon.gap.out - moon.gap.in) * 0.5 + 1.2)

            // Transition to Recovery State (2) after holding the anomaly
            moon.anomalyTimeout = setTimeout(
              () => {
                if (moon.anomalyState === 1) moon.anomalyState = 2
              },
              4000 + Math.random() * 3000,
            )
          }
        } else if (moon.anomalyState === 1) {
          // Hold the anomaly position
          moon.targetRadius = moon.anomalyTarget
        } else if (moon.anomalyState === 2) {
          // Recovering: slowly return to baseline variance
          moon.targetRadius =
            moon.gap.center +
            Math.sin(time * moon.noiseFreq + moon.noiseOffset) *
              ((moon.gap.out - moon.gap.in) * 0.25)

          // Once safely back near the center, reset to Normal (0)
          if (Math.abs(moon.currentRadius - moon.targetRadius) < 0.3) {
            moon.anomalyState = 0
          }
        }

        // Fast outward spike, very slow lazy drift back
        const transitionSpeed = moon.anomalyState === 1 ? 0.015 : 0.003
        moon.currentRadius += (moon.targetRadius - moon.currentRadius) * transitionSpeed

        let status = 0
        const buffer = 0.8
        if (moon.currentRadius < moon.gap.in + buffer)
          status = (moon.gap.in + buffer - moon.currentRadius) / buffer
        if (moon.currentRadius > moon.gap.out - buffer)
          status = (moon.currentRadius - (moon.gap.out - buffer)) / buffer
        status = Math.max(0, Math.min(1, status))

        moon.mesh.position.set(
          Math.cos(moon.angle) * moon.currentRadius,
          0,
          Math.sin(moon.angle) * moon.currentRadius,
        )

        ;(moon.mesh.material as THREE.MeshBasicMaterial).color.lerpColors(
          cream,
          orange,
          status,
        )
        moon.mesh.scale.setScalar(1.0 + status * 0.6)

        ringShaderMat.uniforms.uMoons.value[i].set(moon.currentRadius, moon.angle, moon.gap.center)
        ringShaderMat.uniforms.uMoonStatus.value[i] = status
      })

      renderer.render(scene, camera)
    }

    animate()

    // --- Resize ---
    function handleResize() {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
      ringShaderMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2)
    }

    window.addEventListener('resize', handleResize)

    // --- Cleanup ---
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(frameId)

      moons.forEach((m) => {
        if (m.anomalyTimeout) clearTimeout(m.anomalyTimeout)
        ;(m.mesh.material as THREE.Material).dispose()
      })

      planetGeo.dispose()
      planetMat.dispose()
      coreGeo.dispose()
      coreMat.dispose()
      ringGeo.dispose()
      ringShaderMat.dispose()
      moonGeo.dispose()
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
