import * as THREE from 'three'

export type LODLevel = 'dot' | 'halo' | 'full'

export interface GapConfig {
  in: number
  out: number
  center: number
}

export interface PlanetColors {
  navy: THREE.Color
  gold: THREE.Color
  cream: THREE.Color
  orange: THREE.Color
  muted: THREE.Color
}

export interface MoonState {
  mesh: THREE.Mesh
  /** Invisible larger sphere for easier click targeting */
  hitMesh: THREE.Mesh
  angle: number
  speed: number
  gap: GapConfig
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

export interface PlanetSystemConfig {
  planetParticleCount: number
  ringParticleCount: number
  planetRadius: number
  gaps: GapConfig[]
  moonCount: number
  colors: PlanetColors
}

export const DEFAULT_LOGIN_CONFIG: Omit<PlanetSystemConfig, 'colors'> = {
  planetParticleCount: 6000,
  ringParticleCount: 180000,
  planetRadius: 10.5,
  gaps: [
    { in: 14.5, out: 16.5, center: 15.5 },
    { in: 20.0, out: 23.5, center: 21.75 },
    { in: 27.0, out: 28.5, center: 27.75 },
  ],
  moonCount: 12,
}

export const DEFAULT_GALAXY_CONFIG: Omit<PlanetSystemConfig, 'colors'> = {
  ...DEFAULT_LOGIN_CONFIG,
  planetRadius: 6.0,
  gaps: [
    { in: 10.0, out: 13.0, center: 11.5 },
    { in: 15.0, out: 17.0, center: 16.0 },
    { in: 19.0, out: 20.5, center: 19.75 },
  ],
  moonCount: 100,
}
