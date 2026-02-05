/**
 * Nelson Rule Sparklines
 *
 * Minimal SVG visualizations showing the characteristic pattern
 * that triggers each Nelson rule violation. These help visual
 * learners quickly understand what each rule detects.
 */

interface SparklineProps {
  className?: string
}

const WIDTH = 64
const HEIGHT = 24
const PADDING = 2

// Helper to generate SVG path from points
function pointsToPath(points: number[]): string {
  const yMin = Math.min(...points)
  const yMax = Math.max(...points)
  const yRange = yMax - yMin || 1

  const xStep = (WIDTH - PADDING * 2) / (points.length - 1)

  return points
    .map((y, i) => {
      const x = PADDING + i * xStep
      const normalizedY = HEIGHT - PADDING - ((y - yMin) / yRange) * (HEIGHT - PADDING * 2)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${normalizedY.toFixed(1)}`
    })
    .join(' ')
}

// Control limit lines (dashed)
function ControlLines({ showCenter = true }: { showCenter?: boolean }) {
  return (
    <>
      {/* UCL */}
      <line
        x1={PADDING}
        y1={PADDING + 2}
        x2={WIDTH - PADDING}
        y2={PADDING + 2}
        stroke="currentColor"
        strokeWidth="0.5"
        strokeDasharray="2,2"
        className="text-red-400"
      />
      {/* LCL */}
      <line
        x1={PADDING}
        y1={HEIGHT - PADDING - 2}
        x2={WIDTH - PADDING}
        y2={HEIGHT - PADDING - 2}
        stroke="currentColor"
        strokeWidth="0.5"
        strokeDasharray="2,2"
        className="text-red-400"
      />
      {/* Center */}
      {showCenter && (
        <line
          x1={PADDING}
          y1={HEIGHT / 2}
          x2={WIDTH - PADDING}
          y2={HEIGHT / 2}
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
  // Normal points with one outlier
  const points = [50, 52, 48, 51, 49, 85, 50, 48]

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
      {/* Highlight the outlier */}
      <circle cx={PADDING + 5 * ((WIDTH - PADDING * 2) / 7)} cy={PADDING + 2} r="2" className="fill-red-500" />
    </svg>
  )
}

/**
 * Rule 2: Zone Bias (9 same side)
 * 9 consecutive points on same side of center
 */
export function Rule2Sparkline({ className }: SparklineProps) {
  // All points above center
  const points = [55, 58, 54, 57, 56, 59, 55, 58, 54]

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 2: 9 points on same side"
    >
      <ControlLines />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500" />
    </svg>
  )
}

/**
 * Rule 3: Trend (6 trending)
 * 6 consecutive points trending up or down
 */
export function Rule3Sparkline({ className }: SparklineProps) {
  // Clear upward trend
  const points = [40, 45, 50, 55, 60, 65, 70, 72]

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
  // Alternating pattern
  const points = [45, 55, 45, 55, 45, 55, 45, 55]

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
 * 2 out of 3 consecutive points in Zone A (beyond 2σ)
 */
export function Rule5Sparkline({ className }: SparklineProps) {
  // Two points near upper limit
  const points = [50, 52, 78, 51, 80, 49, 50, 52]

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 5: 2 of 3 in Zone A"
    >
      <ControlLines />
      {/* Zone A shading */}
      <rect x={PADDING} y={PADDING + 2} width={WIDTH - PADDING * 2} height={4} className="fill-amber-200/30" />
      <rect x={PADDING} y={HEIGHT - PADDING - 6} width={WIDTH - PADDING * 2} height={4} className="fill-amber-200/30" />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500" />
    </svg>
  )
}

/**
 * Rule 6: Zone B Pattern (4 of 5 in B)
 * 4 out of 5 consecutive points in Zone B or beyond (beyond 1σ)
 */
export function Rule6Sparkline({ className }: SparklineProps) {
  // Four points in upper Zone B
  const points = [50, 65, 68, 52, 66, 67, 50, 51]

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 6: 4 of 5 in Zone B"
    >
      <ControlLines />
      {/* Zone B shading */}
      <rect x={PADDING} y={PADDING + 6} width={WIDTH - PADDING * 2} height={5} className="fill-blue-200/30" />
      <rect x={PADDING} y={HEIGHT - PADDING - 11} width={WIDTH - PADDING * 2} height={5} className="fill-blue-200/30" />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500" />
    </svg>
  )
}

/**
 * Rule 7: Zone C Stability (15 in C)
 * 15 consecutive points in Zone C (within 1σ) - hugging center
 */
export function Rule7Sparkline({ className }: SparklineProps) {
  // All points hugging center line
  const points = [50, 51, 49, 50, 51, 50, 49, 50]

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 7: 15 points hugging center"
    >
      <ControlLines />
      {/* Zone C highlight */}
      <rect x={PADDING} y={HEIGHT / 2 - 4} width={WIDTH - PADDING * 2} height={8} className="fill-blue-200/30" />
      <path d={pointsToPath(points)} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500" />
    </svg>
  )
}

/**
 * Rule 8: Mixed Zones (8 outside C)
 * 8 consecutive points with none in Zone C
 */
export function Rule8Sparkline({ className }: SparklineProps) {
  // Points alternating between outer zones
  const points = [30, 70, 28, 72, 32, 68, 30, 70]

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      aria-label="Rule 8: 8 points outside Zone C"
    >
      <ControlLines />
      {/* Zone C (empty) */}
      <rect x={PADDING} y={HEIGHT / 2 - 3} width={WIDTH - PADDING * 2} height={6} className="fill-muted/30" />
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
