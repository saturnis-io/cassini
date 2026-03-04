import type { GapConfig } from './types'

/**
 * Map control limits to a ring gap configuration.
 * The gap represents the in-control zone (LCL to UCL).
 * Ring particles exist OUTSIDE the gap (danger zones).
 */
export function controlLimitsToGap(
  ucl: number | null,
  lcl: number | null,
  centerLine: number | null,
): GapConfig {
  const defaultGap: GapConfig = { in: 10.0, out: 13.0, center: 11.5 }
  if (ucl == null || lcl == null || centerLine == null) return defaultGap

  // Map the control range to ring radii
  // Gap center at radius 11.5 (matching tighter planet layout)
  const range = ucl - lcl
  if (range <= 0) return defaultGap

  // Gap half-width: 1.5 ring units for tighter proportions
  const halfWidth = 1.5

  return {
    in: 11.5 - halfWidth,
    out: 11.5 + halfWidth,
    center: 11.5,
  }
}

/**
 * Map a measurement value to a radial position within/outside the gap.
 * Values within UCL/LCL map within the gap.
 * Values beyond limits map outside the gap (triggering flame effect).
 */
export function valueToRadius(
  value: number,
  ucl: number,
  lcl: number,
  gap: GapConfig,
): number {
  const range = ucl - lcl
  if (range <= 0) return gap.center

  const centerLine = (ucl + lcl) / 2
  const normalized = (value - centerLine) / (range / 2) // -1 to +1 for in-control

  const halfWidth = (gap.out - gap.in) / 2
  return gap.center + normalized * halfWidth
}

/**
 * Map a sample's timestamp to an angular position on the ring.
 * Newest sample at 12 o'clock (PI/2), flowing clockwise.
 */
export function timestampToAngle(index: number, total: number): number {
  if (total <= 1) return Math.PI / 2

  const fraction = index / (total - 1) // 0 = oldest, 1 = newest

  // Clockwise from 12 o'clock: newest at top (PI/2)
  // Sweep clockwise (decreasing angle) through ~324 degrees
  const arcSpan = Math.PI * 1.8
  const startAngle = Math.PI / 2
  return startAngle - fraction * arcSpan
}

/**
 * Spiral layout constants.
 * Inner radius starts just outside planet core (10.5).
 * Outer radius extends to the ring particle outer edge.
 */
const SPIRAL_INNER_RADIUS = 9.0
const SPIRAL_OUTER_RADIUS = 22.0
const SPIRAL_POINTS_PER_TURN = 25

/**
 * Compute position on an Archimedean spiral for a data point.
 * Index 0 = oldest (near planet center), index total-1 = newest (outer edge).
 *
 * Returns the baseline radius (on the spiral arm) and the angle.
 * The caller applies radial displacement from valueToRadius() on top.
 */
export function spiralPosition(
  index: number,
  total: number,
): { baseRadius: number; angle: number; armSpacing: number } {
  const totalTurns = Math.max(1, Math.ceil(total / SPIRAL_POINTS_PER_TURN))
  const armSpacing = (SPIRAL_OUTER_RADIUS - SPIRAL_INNER_RADIUS) / totalTurns

  if (total <= 1) return { baseRadius: SPIRAL_OUTER_RADIUS, angle: Math.PI / 2, armSpacing }

  const fraction = index / (total - 1) // 0 = oldest, 1 = newest
  const baseRadius =
    SPIRAL_INNER_RADIUS + fraction * (SPIRAL_OUTER_RADIUS - SPIRAL_INNER_RADIUS)

  // Counterclockwise from 12 o'clock, total angular sweep
  const totalAngle = totalTurns * Math.PI * 2
  const startAngle = Math.PI / 2
  const angle = startAngle + fraction * totalAngle

  return { baseRadius, angle, armSpacing }
}

/**
 * Determine planet color hex from Cpk value.
 */
export function cpkToColorHex(
  cpk: number | null,
  greenThreshold = 1.67,
  yellowThreshold = 1.33,
): string {
  if (cpk == null) return '#6B7280' // gray-500 for unknown
  if (cpk >= greenThreshold) return '#22C55E' // bright green — excellent
  if (cpk >= yellowThreshold) return '#FACC15' // yellow — good
  if (cpk >= 1.0) return '#F59E0B' // amber — marginal
  return '#EF4444' // bright red — poor
}
