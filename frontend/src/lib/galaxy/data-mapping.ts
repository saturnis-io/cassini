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
  const defaultGap: GapConfig = { in: 14.5, out: 16.5, center: 15.5 }
  if (ucl == null || lcl == null || centerLine == null) return defaultGap

  // Map the control range to ring radii
  // Gap center at radius 15.5 (matching login page middle gap)
  const range = ucl - lcl
  if (range <= 0) return defaultGap

  // Gap half-width: 2.0 ring units gives nice visual proportions
  const halfWidth = 2.0

  return {
    in: 15.5 - halfWidth,
    out: 15.5 + halfWidth,
    center: 15.5,
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
 * Determine planet color hex from Cpk value.
 */
export function cpkToColorHex(
  cpk: number | null,
  greenThreshold = 1.67,
  yellowThreshold = 1.33,
): string {
  if (cpk == null) return '#4B5563' // muted gray for unknown
  if (cpk >= greenThreshold) return '#D4AF37' // gold — excellent
  if (cpk >= yellowThreshold) return '#F4F1DE' // cream — good
  if (cpk >= 1.0) return '#F59E0B' // amber — marginal
  return '#E05A3D' // orange-red — poor
}
