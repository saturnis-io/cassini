/**
 * Nelson Rule Sparklines
 *
 * Minimal SVG visualizations showing the characteristic pattern
 * that triggers each Nelson rule violation. These help visual
 * learners quickly understand what each rule detects.
 *
 * All sparklines use a fixed scale where:
 * - Y = 0 is LCL (lower control limit)
 * - Y = 50 is the center line (mean)
 * - Y = 100 is UCL (upper control limit)
 * - Zone A: 67-100 (above) and 0-33 (below) - beyond 2σ
 * - Zone B: 33-67 and 67-83 / 17-33 - between 1σ and 2σ
 * - Zone C: 33-67 - within 1σ of center
 */

interface SparklineProps {
  className?: string
}

const WIDTH = 64
const HEIGHT = 24
const PADDING = 2

// Fixed scale: 0 = LCL, 50 = center, 100 = UCL
const SCALE_MIN = 0
const SCALE_MAX = 100

// Convert a value (0-100 scale) to Y coordinate
function valueToY(value: number): number {
  const normalized = (value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)
  // Invert because SVG Y increases downward
  return PADDING + (1 - normalized) * (HEIGHT - PADDING * 2)
}

// Generate SVG path from points (using fixed 0-100 scale)
function pointsToPath(points: number[]): string {
  const xStep = (WIDTH - PADDING * 2) / (points.length - 1)

  return points
    .map((y, i) => {
      const x = PADDING + i * xStep
      const yCoord = valueToY(y)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yCoord.toFixed(1)}`
    })
    .join(' ')
}

// Control limit lines (dashed) and center line
function ControlLines({ showCenter = true }: { showCenter?: boolean }) {
  const uclY = valueToY(100) // UCL at top
  const lclY = valueToY(0)   // LCL at bottom
  const centerY = valueToY(50)

  return (
    <>
      {/* UCL */}
      <line
        x1={PADDING}
        y1={uclY}
        x2={WIDTH - PADDING}
        y2={uclY}
        stroke="currentColor"
        strokeWidth="0.5"
        strokeDasharray="2,2"
        className="text-red-400"
      />
      {/* LCL */}
      <line
        x1={PADDING}
        y1={lclY}
        x2={WIDTH - PADDING}
        y2={lclY}
        stroke="currentColor"
        strokeWidth="0.5"
        strokeDasharray="2,2"
        className="text-red-400"
      />
      {/* Center */}
      {showCenter && (
        <line
          x1={PADDING}
          y1={centerY}
          x2={WIDTH - PADDING}
          y2={centerY}
          stroke="currentColor"
          strokeWidth="0.5"
          strokeDasharray="1,2"
          className="text-muted-foreground/50"
        />
      )}
    </>
  )
}

/**
 * Rule 1: Beyond 3 Sigma (Outlier)
 * Single point outside control limits
 */
export function Rule1Sparkline({ className }: SparklineProps) {
  // Normal points around center (50) with one outlier above UCL (>100)
  const points = [50, 52, 48, 51, 49, 110, 50, 48]

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 1: Point beyond 3 sigma"
    >
      <ControlLines />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
      {/* Highlight the outlier point */}
      <circle cx={PADDING + 5 * ((WIDTH - PADDING * 2) / 7)} cy={valueToY(110)} r="2" className="fill-red-500" />
    </svg>
  )
}

/**
 * Rule 2: Zone Bias (9 same side)
 * 9 consecutive points on same side of center line
 */
export function Rule2Sparkline({ className }: SparklineProps) {
  // 9 points ALL above center (50), varying between 55-75 (in zones B and C, upper half)
  const points = [55, 62, 58, 65, 60, 68, 57, 63, 59]

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 2: 9 points on same side"
    >
      <ControlLines />
      {/* Shade the upper half to show "same side" */}
      <rect
        x={PADDING}
        y={valueToY(100)}
        width={WIDTH - PADDING * 2}
        height={valueToY(50) - valueToY(100)}
        className="fill-amber-200/20"
      />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500" />
    </svg>
  )
}

/**
 * Rule 3: Trend (6 trending)
 * 6 consecutive points continuously increasing or decreasing
 */
export function Rule3Sparkline({ className }: SparklineProps) {
  // Clear upward trend: 6+ points each higher than the last
  const points = [30, 38, 46, 54, 62, 70, 78, 82]

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 3: 6 points trending"
    >
      <ControlLines />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500" />
    </svg>
  )
}

/**
 * Rule 4: Oscillation (14 alternating)
 * 14 consecutive points alternating up and down
 */
export function Rule4Sparkline({ className }: SparklineProps) {
  // Alternating pattern around the center
  const points = [40, 60, 40, 60, 40, 60, 40, 60]

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 4: 14 points alternating"
    >
      <ControlLines />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500" />
    </svg>
  )
}

/**
 * Rule 5: Zone A Pattern (2 of 3 in A)
 * 2 out of 3 consecutive points in Zone A (beyond 2σ, values 83-100 or 0-17)
 */
export function Rule5Sparkline({ className }: SparklineProps) {
  // Two points in Zone A (>83), with one normal point between
  const points = [50, 52, 88, 55, 90, 52, 50, 51]

  // Zone A boundaries
  const zoneATop = valueToY(100)
  const zoneAUpperBound = valueToY(83)
  const zoneALowerBound = valueToY(17)
  const zoneABottom = valueToY(0)

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 5: 2 of 3 in Zone A"
    >
      <ControlLines />
      {/* Zone A shading (upper) */}
      <rect
        x={PADDING}
        y={zoneATop}
        width={WIDTH - PADDING * 2}
        height={zoneAUpperBound - zoneATop}
        className="fill-amber-200/30"
      />
      {/* Zone A shading (lower) */}
      <rect
        x={PADDING}
        y={zoneALowerBound}
        width={WIDTH - PADDING * 2}
        height={zoneABottom - zoneALowerBound}
        className="fill-amber-200/30"
      />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500" />
    </svg>
  )
}

/**
 * Rule 6: Zone B Pattern (4 of 5 in B)
 * 4 out of 5 consecutive points in Zone B or beyond (beyond 1σ, values 67-100 or 0-33)
 */
export function Rule6Sparkline({ className }: SparklineProps) {
  // 4 of 5 points in Zone B (67-83 range, upper)
  const points = [50, 72, 75, 52, 70, 74, 50, 51]

  // Zone B boundaries (between 1σ and 2σ)
  const zoneBUpperTop = valueToY(83)
  const zoneBUpperBottom = valueToY(67)
  const zoneBLowerTop = valueToY(33)
  const zoneBLowerBottom = valueToY(17)

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 6: 4 of 5 in Zone B"
    >
      <ControlLines />
      {/* Zone B shading (upper) */}
      <rect
        x={PADDING}
        y={zoneBUpperTop}
        width={WIDTH - PADDING * 2}
        height={zoneBUpperBottom - zoneBUpperTop}
        className="fill-blue-200/30"
      />
      {/* Zone B shading (lower) */}
      <rect
        x={PADDING}
        y={zoneBLowerTop}
        width={WIDTH - PADDING * 2}
        height={zoneBLowerBottom - zoneBLowerTop}
        className="fill-blue-200/30"
      />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500" />
    </svg>
  )
}

/**
 * Rule 7: Zone C Stability (15 in C)
 * 15 consecutive points in Zone C (within 1σ of center, values 33-67)
 * This indicates stratification or reduced variation - data is "too good"
 */
export function Rule7Sparkline({ className }: SparklineProps) {
  // All points tightly clustered around center, staying within Zone C (33-67)
  const points = [48, 52, 47, 53, 49, 51, 48, 52]

  // Zone C boundaries (within 1σ)
  const zoneCTop = valueToY(67)
  const zoneCBottom = valueToY(33)

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 7: 15 points hugging center"
    >
      <ControlLines />
      {/* Zone C highlight (center band) */}
      <rect
        x={PADDING}
        y={zoneCTop}
        width={WIDTH - PADDING * 2}
        height={zoneCBottom - zoneCTop}
        className="fill-blue-200/30"
      />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500" />
    </svg>
  )
}

/**
 * Rule 8: Mixed Zones (8 outside C)
 * 8 consecutive points with none in Zone C (all beyond 1σ)
 * Points alternate between upper and lower zones
 */
export function Rule8Sparkline({ className }: SparklineProps) {
  // All points outside Zone C (either >67 or <33), alternating sides
  const points = [25, 78, 22, 75, 28, 80, 24, 76]

  // Zone C boundaries
  const zoneCTop = valueToY(67)
  const zoneCBottom = valueToY(33)

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 8: 8 points outside Zone C"
    >
      <ControlLines />
      {/* Zone C (empty - no points here) */}
      <rect
        x={PADDING}
        y={zoneCTop}
        width={WIDTH - PADDING * 2}
        height={zoneCBottom - zoneCTop}
        className="fill-muted/20"
      />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500" />
    </svg>
  )
}

// Map of rule ID to sparkline component
export const NELSON_SPARKLINES: Record<number, React.FC<SparklineProps>> = {
  1: Rule1Sparkline,
  2: Rule2Sparkline,
  3: Rule3Sparkline,
  4: Rule4Sparkline,
  5: Rule5Sparkline,
  6: Rule6Sparkline,
  7: Rule7Sparkline,
  8: Rule8Sparkline,
}
