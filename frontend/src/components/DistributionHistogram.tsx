import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Area,
} from 'recharts'
import { useChartData } from '@/api/hooks'

interface DistributionHistogramProps {
  characteristicId: number
  orientation?: 'horizontal' | 'vertical'
  label?: 'Primary' | 'Secondary'
  colorScheme?: 'primary' | 'secondary'
  /** For vertical orientation: pass the Y-axis domain from the control chart to align limits */
  yAxisDomain?: [number, number]
}

function calculateHistogramBins(values: number[], binCount: number = 20) {
  if (values.length === 0) return []

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  // Extend range slightly for better visualization
  const extendedMin = min - range * 0.1
  const extendedMax = max + range * 0.1
  const extendedBinWidth = (extendedMax - extendedMin) / binCount

  const bins = Array.from({ length: binCount }, (_, i) => ({
    binStart: extendedMin + i * extendedBinWidth,
    binEnd: extendedMin + (i + 1) * extendedBinWidth,
    binCenter: extendedMin + (i + 0.5) * extendedBinWidth,
    count: 0,
    normalY: 0,
  }))

  values.forEach((value) => {
    const binIndex = Math.min(
      Math.max(0, Math.floor((value - extendedMin) / extendedBinWidth)),
      binCount - 1
    )
    bins[binIndex].count++
  })

  return bins
}

function calculateStatistics(values: number[]) {
  if (values.length === 0) return { mean: 0, stdDev: 0, n: 0 }

  const n = values.length
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1)
  const stdDev = Math.sqrt(variance)

  return { mean, stdDev, n }
}

// Normal distribution probability density function
function normalPDF(x: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0
  const coefficient = 1 / (stdDev * Math.sqrt(2 * Math.PI))
  const exponent = -0.5 * Math.pow((x - mean) / stdDev, 2)
  return coefficient * Math.exp(exponent)
}

// Add normal curve values to histogram bins
function addNormalCurve(
  bins: ReturnType<typeof calculateHistogramBins>,
  mean: number,
  stdDev: number,
  totalCount: number,
  binWidth: number
) {
  if (stdDev === 0 || bins.length === 0) return bins

  const scaleFactor = totalCount * binWidth

  return bins.map((bin) => ({
    ...bin,
    normalY: normalPDF(bin.binCenter, mean, stdDev) * scaleFactor,
  }))
}

// Color schemes for comparison mode
const colorSchemes = {
  primary: {
    barGradientStart: 'hsl(212 100% 30%)',
    barGradientEnd: 'hsl(212 100% 30%)',
    barStroke: 'hsl(212 100% 28%)',
    normalStroke: 'hsl(248 33% 55%)',
    normalFill: 'hsl(248 33% 59%)',
    meanColor: 'hsl(212 100% 30%)',
    meanTextColor: 'hsl(212 100% 28%)',
  },
  secondary: {
    barGradientStart: 'hsl(280 87% 55%)',
    barGradientEnd: 'hsl(280 87% 55%)',
    barStroke: 'hsl(280 87% 45%)',
    normalStroke: 'hsl(320 70% 55%)',
    normalFill: 'hsl(320 70% 59%)',
    meanColor: 'hsl(280 87% 55%)',
    meanTextColor: 'hsl(280 87% 45%)',
  },
}

export function DistributionHistogram({
  characteristicId,
  orientation = 'horizontal',
  label,
  colorScheme = 'primary',
  yAxisDomain,
}: DistributionHistogramProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, { limit: 100 })
  const colors = colorSchemes[colorScheme]
  const isVertical = orientation === 'vertical'

  if (isLoading) {
    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  if (!chartData || chartData.data_points.length === 0) {
    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center">
        <div className="text-muted-foreground text-sm">No data for capability analysis</div>
      </div>
    )
  }

  const values = chartData.data_points.filter((p) => !p.excluded).map((p) => p.mean)
  const stats = calculateStatistics(values)

  // Calculate histogram bins
  let bins = calculateHistogramBins(values)
  const binWidth = bins.length > 1 ? bins[1].binCenter - bins[0].binCenter : 1

  // Add normal distribution curve to bins
  bins = addNormalCurve(bins, stats.mean, stats.stdDev, values.length, binWidth)

  const { spec_limits, control_limits } = chartData
  const usl = spec_limits.usl
  const lsl = spec_limits.lsl
  const ucl = control_limits.ucl
  const lcl = control_limits.lcl
  const centerLine = control_limits.center_line

  // Calculate Cp and Cpk if we have spec limits
  let cp = 0
  let cpk = 0
  let ppk = 0

  if (usl !== null && lsl !== null && stats.stdDev > 0) {
    const withinSigma = chartData.zone_boundaries.plus_1_sigma && centerLine
      ? chartData.zone_boundaries.plus_1_sigma - centerLine
      : stats.stdDev

    cp = (usl - lsl) / (6 * withinSigma)
    const cpu = (usl - stats.mean) / (3 * withinSigma)
    const cpl = (stats.mean - lsl) / (3 * withinSigma)
    cpk = Math.min(cpu, cpl)

    const ppu = (usl - stats.mean) / (3 * stats.stdDev)
    const ppl = (stats.mean - lsl) / (3 * stats.stdDev)
    ppk = Math.min(ppu, ppl)
  }

  // Calculate domain for X axis to include all limits
  const allValues = [
    ...values,
    ...(usl !== null ? [usl] : []),
    ...(lsl !== null ? [lsl] : []),
    ...(ucl !== null ? [ucl] : []),
    ...(lcl !== null ? [lcl] : []),
  ]
  const xMin = Math.min(...allValues) - stats.stdDev * 0.5
  const xMax = Math.max(...allValues) + stats.stdDev * 0.5

  // Helper function for capability badge styling
  const getCapabilityStyle = (value: number) => {
    if (value >= 1.33) return 'stat-badge stat-badge-success'
    if (value >= 1.0) return 'stat-badge stat-badge-warning'
    return 'stat-badge stat-badge-danger'
  }

  // Generate unique gradient IDs for this instance
  const gradientId = `barGradient-${characteristicId}-${colorScheme}`
  const normalGradientId = `normalGradient-${characteristicId}-${colorScheme}`

  // For vertical orientation, we render aligned with the control chart
  // Using same padding (p-5), header height (mb-4), and chart height (90%)
  if (isVertical) {
    // Use the passed yAxisDomain if available for alignment, otherwise use calculated domain
    const verticalDomain = yAxisDomain || [xMin, xMax]

    return (
      <div className="h-full bg-card border border-border rounded-2xl p-5">
        {/* Header - matches ControlChart header height with mb-4 */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-sm truncate">
            {label && <span className="text-muted-foreground mr-1">{label}:</span>}
            Capability
          </h3>
          <div className="flex gap-1 items-center text-xs">
            {cpk > 0 && (
              <span className={getCapabilityStyle(cpk)}>
                Cpk {cpk.toFixed(2)}
              </span>
            )}
            <span className="text-muted-foreground ml-1">n={stats.n}</span>
          </div>
        </div>
        {/* Chart area - matches ControlChart's 90% height and margins */}
        <ResponsiveContainer width="100%" height="90%">
          <ComposedChart
            layout="vertical"
            data={bins}
            margin={{ top: 20, right: 5, left: 5, bottom: 20 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={colors.barGradientStart} stopOpacity={0.4} />
                <stop offset="100%" stopColor={colors.barGradientEnd} stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <XAxis type="number" hide />
            <YAxis
              type="number"
              dataKey="binCenter"
              domain={verticalDomain}
              tick={{ fontSize: 8, fill: 'hsl(240 4% 46%)' }}
              tickFormatter={(value) => value.toFixed(1)}
              width={35}
              axisLine={false}
              tickLine={false}
              reversed={true}
            />
            {/* Spec and control limits as horizontal lines */}
            {lsl !== null && (
              <ReferenceLine y={lsl} stroke="hsl(357 80% 52%)" strokeWidth={1.5} label={{ value: 'LSL', position: 'right', fontSize: 8, fill: 'hsl(357 80% 45%)' }} />
            )}
            {usl !== null && (
              <ReferenceLine y={usl} stroke="hsl(357 80% 52%)" strokeWidth={1.5} label={{ value: 'USL', position: 'right', fontSize: 8, fill: 'hsl(357 80% 45%)' }} />
            )}
            {lcl !== null && (
              <ReferenceLine y={lcl} stroke="hsl(179 50% 59%)" strokeWidth={1} strokeDasharray="4 2" label={{ value: 'LCL', position: 'right', fontSize: 8, fill: 'hsl(179 50% 50%)' }} />
            )}
            {ucl !== null && (
              <ReferenceLine y={ucl} stroke="hsl(179 50% 59%)" strokeWidth={1} strokeDasharray="4 2" label={{ value: 'UCL', position: 'right', fontSize: 8, fill: 'hsl(179 50% 50%)' }} />
            )}
            {centerLine !== null && (
              <ReferenceLine y={centerLine} stroke="hsl(104 55% 40%)" strokeWidth={1} strokeDasharray="2 2" label={{ value: 'CL', position: 'right', fontSize: 8, fill: 'hsl(104 55% 35%)' }} />
            )}
            <Bar dataKey="count" fill={`url(#${gradientId})`} stroke={colors.barStroke} strokeWidth={0.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // Horizontal orientation (original layout)
  return (
    <div className="h-full bg-card border border-border rounded-2xl p-5">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-sm tracking-tight">
          {label && <span className="text-muted-foreground mr-1">{label}:</span>}
          Process Capability
        </h3>
        <div className="flex gap-2 items-center">
          {cp > 0 && (
            <span className={getCapabilityStyle(cp)}>
              Cp {cp.toFixed(2)}
            </span>
          )}
          {cpk > 0 && (
            <span className={getCapabilityStyle(cpk)}>
              Cpk {cpk.toFixed(2)}
            </span>
          )}
          {ppk > 0 && (
            <span className="stat-badge bg-muted text-muted-foreground">
              Ppk {ppk.toFixed(2)}
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-2">
            n={stats.n}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="85%">
        <ComposedChart data={bins} margin={{ top: 25, right: 45, left: 10, bottom: 10 }}>
          <defs>
            {/* Gradient for histogram bars */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.barGradientStart} stopOpacity={0.8} />
              <stop offset="100%" stopColor={colors.barGradientEnd} stopOpacity={0.4} />
            </linearGradient>
            {/* Gradient for normal curve area */}
            <linearGradient id={normalGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.normalFill} stopOpacity={0.25} />
              <stop offset="95%" stopColor={colors.normalFill} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 6% 92%)" vertical={false} />

          <XAxis
            dataKey="binCenter"
            type="number"
            domain={[xMin, xMax]}
            tick={{ fontSize: 10, fill: 'hsl(240 4% 46%)' }}
            tickFormatter={(value) => value.toFixed(2)}
            stroke="hsl(240 6% 88%)"
            axisLine={{ strokeWidth: 1 }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(240 4% 46%)' }}
            stroke="hsl(240 6% 88%)"
            axisLine={{ strokeWidth: 1 }}
            allowDecimals={false}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const bin = payload[0].payload
              return (
                <div className="bg-popover border border-border rounded-xl p-3 text-xs shadow-xl">
                  <div className="font-medium text-foreground mb-1">Value Range</div>
                  <div className="text-muted-foreground">
                    {bin.binStart.toFixed(4)} – {bin.binEnd.toFixed(4)}
                  </div>
                  <div className="mt-2 pt-2 border-t border-border">
                    <span className="font-medium text-foreground">Count:</span>
                    <span className="ml-1 text-primary font-semibold">{bin.count}</span>
                  </div>
                </div>
              )
            }}
          />

          {/* Sample Mean annotation */}
          <ReferenceLine
            x={stats.mean}
            stroke={colors.meanColor}
            strokeWidth={2}
            strokeDasharray="4 4"
            label={{
              value: `x̄ = ${stats.mean.toFixed(3)}`,
              position: 'top',
              fontSize: 11,
              fontWeight: 600,
              fill: colors.meanTextColor,
              offset: 8,
            }}
          />

          {/* Specification Limits - Sepasoft Red */}
          {lsl !== null && (
            <ReferenceLine
              x={lsl}
              stroke="hsl(357 80% 52%)"
              strokeWidth={2}
              label={{
                value: 'LSL',
                position: 'insideTopLeft',
                fontSize: 10,
                fontWeight: 600,
                fill: 'hsl(357 80% 45%)',
              }}
            />
          )}
          {usl !== null && (
            <ReferenceLine
              x={usl}
              stroke="hsl(357 80% 52%)"
              strokeWidth={2}
              label={{
                value: 'USL',
                position: 'insideTopRight',
                fontSize: 10,
                fontWeight: 600,
                fill: 'hsl(357 80% 45%)',
              }}
            />
          )}

          {/* Control Limits - Sepasoft Teal */}
          {lcl !== null && (
            <ReferenceLine
              x={lcl}
              stroke="hsl(179 50% 59%)"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              label={{
                value: 'LCL',
                position: 'insideBottomLeft',
                fontSize: 9,
                fill: 'hsl(179 50% 50%)',
              }}
            />
          )}
          {ucl !== null && (
            <ReferenceLine
              x={ucl}
              stroke="hsl(179 50% 59%)"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              label={{
                value: 'UCL',
                position: 'insideBottomRight',
                fontSize: 9,
                fill: 'hsl(179 50% 50%)',
              }}
            />
          )}

          {/* Center Line - Sepasoft Green dashed */}
          {centerLine !== null && (
            <ReferenceLine
              x={centerLine}
              stroke="hsl(104 55% 40%)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              label={{
                value: 'CL',
                position: 'insideBottom',
                fontSize: 9,
                fill: 'hsl(104 55% 35%)',
              }}
            />
          )}

          {/* Histogram bars */}
          <Bar
            dataKey="count"
            fill={`url(#${gradientId})`}
            stroke={colors.barStroke}
            strokeWidth={1}
            radius={[3, 3, 0, 0]}
          />

          {/* Normal distribution curve */}
          <Area
            type="monotone"
            dataKey="normalY"
            stroke={colors.normalStroke}
            strokeWidth={2.5}
            fill={`url(#${normalGradientId})`}
            dot={false}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
