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
  Cell,
} from 'recharts'
import { Info } from 'lucide-react'
import { useChartData } from '@/api/hooks'
import { cn } from '@/lib/utils'
import { useChartHoverSync } from '@/contexts/ChartHoverContext'

interface DistributionHistogramProps {
  characteristicId: number
  orientation?: 'horizontal' | 'vertical'
  label?: 'Primary' | 'Secondary'
  colorScheme?: 'primary' | 'secondary'
  /** Chart options (limit, startDate, endDate) to match the control chart */
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
  /** For vertical orientation: pass the Y-axis domain from the control chart to align limits */
  yAxisDomain?: [number, number]
  /** Value from X-bar chart hover to highlight corresponding bucket */
  highlightedValue?: number | null
  /** Callback when hovering over a histogram bar - passes the bin range [min, max] or null on leave */
  onHoverBin?: (range: [number, number] | null) => void
}

interface DataPointWithId {
  value: number
  sample_id: number
}

interface HistogramBin {
  binStart: number
  binEnd: number
  binCenter: number
  count: number
  normalY: number
  sampleIds: number[] // Track which samples are in this bin
}

function calculateHistogramBins(dataPoints: DataPointWithId[], binCount: number = 20): HistogramBin[] {
  if (dataPoints.length === 0) return []

  const values = dataPoints.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  // Extend range slightly for better visualization
  const extendedMin = min - range * 0.1
  const extendedMax = max + range * 0.1
  const extendedBinWidth = (extendedMax - extendedMin) / binCount

  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    binStart: extendedMin + i * extendedBinWidth,
    binEnd: extendedMin + (i + 1) * extendedBinWidth,
    binCenter: extendedMin + (i + 0.5) * extendedBinWidth,
    count: 0,
    normalY: 0,
    sampleIds: [],
  }))

  dataPoints.forEach((point) => {
    const binIndex = Math.min(
      Math.max(0, Math.floor((point.value - extendedMin) / extendedBinWidth)),
      binCount - 1
    )
    bins[binIndex].count++
    bins[binIndex].sampleIds.push(point.sample_id)
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
  bins: HistogramBin[],
  mean: number,
  stdDev: number,
  totalCount: number,
  binWidth: number
): HistogramBin[] {
  if (stdDev === 0 || bins.length === 0) return bins

  const scaleFactor = totalCount * binWidth

  return bins.map((bin) => ({
    ...bin,
    normalY: normalPDF(bin.binCenter, mean, stdDev) * scaleFactor,
  }))
}

/**
 * Color schemes for comparison mode - using Sepasoft brand colors
 * Primary: Sepasoft Blue #004A98 → hsl(212, 100%, 30%)
 * Secondary: Sepasoft Purple #7473C0 → hsl(241, 33%, 60%)
 */
const colorSchemes = {
  primary: {
    barGradientStart: 'hsl(212 100% 30%)',   // Sepasoft Blue
    barGradientEnd: 'hsl(212 100% 30%)',
    barStroke: 'hsl(212 100% 28%)',
    normalStroke: 'hsl(179 50% 55%)',        // Sepasoft Teal
    normalFill: 'hsl(179 50% 59%)',
    meanColor: 'hsl(212 100% 30%)',
    meanTextColor: 'hsl(212 100% 28%)',
  },
  secondary: {
    barGradientStart: 'hsl(241 33% 60%)',    // Sepasoft Purple #7473C0
    barGradientEnd: 'hsl(241 33% 60%)',
    barStroke: 'hsl(241 33% 50%)',
    normalStroke: 'hsl(179 50% 59%)',        // Sepasoft Teal #62CBC9
    normalFill: 'hsl(179 50% 55%)',
    meanColor: 'hsl(241 33% 60%)',
    meanTextColor: 'hsl(241 33% 50%)',
  },
}

export function DistributionHistogram({
  characteristicId,
  orientation = 'horizontal',
  label,
  colorScheme = 'primary',
  chartOptions,
  yAxisDomain,
  highlightedValue,
  onHoverBin,
}: DistributionHistogramProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, chartOptions ?? { limit: 100 })
  const colors = colorSchemes[colorScheme]
  const isVertical = orientation === 'vertical'

  // Cross-chart hover sync using sample IDs
  const { hoveredSampleIds, onHoverSample, onLeaveSample } = useChartHoverSync(characteristicId)

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

  // Detect Z-score mode - use z_score values instead of raw means
  const isModeA = chartData.subgroup_mode === 'STANDARDIZED'

  // Build data points with sample_ids for bin tracking
  // In STANDARDIZED mode, use z_score (not raw mean) so the histogram
  // aligns with the control chart's Z-score axis
  const dataPoints: DataPointWithId[] = chartData.data_points
    .filter((p) => !p.excluded)
    .filter((p) => !isModeA || p.z_score != null)
    .map((p) => ({
      value: isModeA ? p.z_score! : p.mean,
      sample_id: p.sample_id,
    }))

  const values = dataPoints.map(p => p.value)
  const stats = calculateStatistics(values)

  // Calculate histogram bins with sample_id tracking
  let bins = calculateHistogramBins(dataPoints)
  const binWidth = bins.length > 1 ? bins[1].binCenter - bins[0].binCenter : 1

  // Add normal distribution curve to bins
  bins = addNormalCurve(bins, stats.mean, stats.stdDev, values.length, binWidth)

  const { spec_limits, control_limits } = chartData

  // In Z-score mode, use fixed control limits and no spec limits
  const usl = isModeA ? null : spec_limits.usl
  const lsl = isModeA ? null : spec_limits.lsl
  const ucl = isModeA ? 3 : control_limits.ucl
  const lcl = isModeA ? -3 : control_limits.lcl
  const centerLine = isModeA ? 0 : control_limits.center_line

  // Calculate Cp and Cpk if we have spec limits (not applicable in Z-score mode)
  let cp = 0
  let cpk = 0
  let ppk = 0

  if (!isModeA && usl !== null && lsl !== null && stats.stdDev > 0) {
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

  // Use shared domain from parent to match the control chart's axis exactly.
  // Falls back to local calculation only if no shared domain is provided.
  let xMin: number, xMax: number
  if (yAxisDomain) {
    xMin = yAxisDomain[0]
    xMax = yAxisDomain[1]
  } else {
    const allValues = [
      ...values,
      ...(usl !== null ? [usl] : []),
      ...(lsl !== null ? [lsl] : []),
      ...(ucl !== null ? [ucl] : []),
      ...(lcl !== null ? [lcl] : []),
    ]
    xMin = Math.min(...allValues) - stats.stdDev * 0.5
    xMax = Math.max(...allValues) + stats.stdDev * 0.5
  }

  // Helper function for capability badge styling
  const getCapabilityStyle = (value: number) => {
    if (value >= 1.33) return 'stat-badge stat-badge-success'
    if (value >= 1.0) return 'stat-badge stat-badge-warning'
    return 'stat-badge stat-badge-danger'
  }

  // Generate unique gradient IDs for this instance
  const gradientId = `barGradient-${characteristicId}-${colorScheme}`
  const normalGradientId = `normalGradient-${characteristicId}-${colorScheme}`
  const highlightGradientId = `barGradientHighlight-${characteristicId}-${colorScheme}`

  // Find which bin(s) contain any hovered sample_ids
  // Also support legacy highlightedValue prop
  const getHighlightedBinIndex = (): number => {
    // First check for cross-chart hover via sample_ids
    if (hoveredSampleIds && hoveredSampleIds.size > 0) {
      const index = bins.findIndex(bin =>
        bin.sampleIds.some(id => hoveredSampleIds.has(id))
      )
      if (index !== -1) return index
    }
    // Fall back to legacy value-based highlighting
    if (highlightedValue != null) {
      return bins.findIndex(bin =>
        highlightedValue >= bin.binStart && highlightedValue < bin.binEnd
      )
    }
    return -1
  }
  const highlightedBinIndex = getHighlightedBinIndex()

  // For vertical orientation, we render aligned with the control chart
  // Using same padding (p-5), header height (mb-4), and chart height (90%)
  if (isVertical) {
    // Use the passed yAxisDomain if available for alignment, otherwise use calculated domain
    const verticalDomain = yAxisDomain || [xMin, xMax]

    // For vertical layout, normalY needs to be plotted on the X axis (horizontal)
    // Calculate max count for X-axis domain
    const maxCount = Math.max(...bins.map((b) => b.count), ...bins.map((b) => b.normalY))

    return (
      <div className="h-full bg-card border border-border rounded-2xl p-5 flex flex-col">
        {/* Header - fixed height to match ControlChart header exactly */}
        <div className="flex justify-between items-center mb-4 h-5 flex-shrink-0">
          <h3 className="font-semibold text-sm truncate leading-5">
            {label && <span className="text-muted-foreground mr-1">{label}:</span>}
            Capability
          </h3>
          <div className="flex items-center gap-2 text-sm leading-5">
            {cpk > 0 && (
              <span className={cn(
                'font-medium',
                cpk >= 1.33 ? 'text-green-600' : cpk >= 1.0 ? 'text-yellow-600' : 'text-destructive'
              )}>
                Cpk: {cpk.toFixed(2)}
              </span>
            )}
            <span className="text-muted-foreground">n={stats.n}</span>
            {/* Info tooltip with detailed stats */}
            <div className="relative group">
              <button className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors">
                <Info className="h-3.5 w-3.5" />
              </button>
              <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block">
                <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs min-w-[140px]">
                  <div className="font-medium text-foreground mb-2">Process Statistics</div>
                  <div className="space-y-1 text-muted-foreground">
                    {cp > 0 && (
                      <div className="flex justify-between">
                        <span>Cp:</span>
                        <span className={cn('font-medium', cp >= 1.33 ? 'text-green-600' : cp >= 1.0 ? 'text-yellow-600' : 'text-destructive')}>
                          {cp.toFixed(3)}
                        </span>
                      </div>
                    )}
                    {cpk > 0 && (
                      <div className="flex justify-between">
                        <span>Cpk:</span>
                        <span className={cn('font-medium', cpk >= 1.33 ? 'text-green-600' : cpk >= 1.0 ? 'text-yellow-600' : 'text-destructive')}>
                          {cpk.toFixed(3)}
                        </span>
                      </div>
                    )}
                    {ppk > 0 && (
                      <div className="flex justify-between">
                        <span>Ppk:</span>
                        <span className="font-medium text-foreground">{ppk.toFixed(3)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-border pt-1 mt-1">
                      <span>σ (sigma):</span>
                      <span className="font-medium text-foreground">{stats.stdDev.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mean:</span>
                      <span className="font-medium text-foreground">{stats.mean.toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Chart area - flex-1 to fill remaining space, NO extra stats row */}
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              layout="vertical"
              data={bins}
              margin={{ top: 20, right: 30, left: 5, bottom: 20 }}
              onMouseMove={(state) => {
                if (state?.activeTooltipIndex != null) {
                  const binIndex = Number(state.activeTooltipIndex)
                  const bin = bins[binIndex]
                  if (bin && bin.sampleIds.length > 0) {
                    // Broadcast all sample_ids in this bin for cross-chart highlighting
                    onHoverSample(bin.sampleIds)
                    // Also call legacy callback if provided
                    onHoverBin?.([bin.binStart, bin.binEnd])
                  }
                }
              }}
              onMouseLeave={() => {
                onLeaveSample()
                onHoverBin?.(null)
              }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={colors.barGradientStart} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={colors.barGradientEnd} stopOpacity={0.8} />
                </linearGradient>
                {/* Highlighted bar gradient - brighter/more saturated */}
                <linearGradient id={highlightGradientId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(45, 100%, 50%)" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="hsl(35, 100%, 55%)" stopOpacity={1} />
                </linearGradient>
                {/* Normal curve gradient for vertical */}
                <linearGradient id={normalGradientId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="5%" stopColor={colors.normalFill} stopOpacity={0.02} />
                  <stop offset="95%" stopColor={colors.normalFill} stopOpacity={0.25} />
                </linearGradient>
              </defs>
              {/* XAxis (horizontal in vertical layout) - show count values as integers */}
              <XAxis
                type="number"
                domain={[0, maxCount * 1.1]}
                tick={{ fontSize: 10, fill: 'hsl(240 4% 46%)' }}
                tickFormatter={(value) => Math.round(value).toString()}
                allowDecimals={false}
                axisLine={{ stroke: '#666' }}
                tickLine={{ stroke: '#666' }}
              />
              {/* YAxis (vertical values) - matches ControlChart YAxis config */}
              <YAxis
                type="number"
                dataKey="binCenter"
                domain={verticalDomain}
                reversed={true}
                tick={{ fontSize: 10, fill: 'hsl(240 4% 46%)' }}
                tickFormatter={(value) => value.toFixed(1)}
                width={40}
                axisLine={{ stroke: '#666' }}
                tickLine={{ stroke: '#666' }}
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
              {/* Mean line */}
              <ReferenceLine
                y={stats.mean}
                stroke={colors.meanColor}
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const bin = payload[0].payload
                  return (
                    <div className="bg-popover border border-border rounded-lg p-2 text-xs shadow-lg">
                      <div className="font-medium text-foreground mb-1">Range</div>
                      <div className="text-muted-foreground">
                        {bin.binStart.toFixed(2)} – {bin.binEnd.toFixed(2)}
                      </div>
                      <div className="mt-1.5 pt-1.5 border-t border-border">
                        <span className="font-medium text-foreground">Count:</span>
                        <span className="ml-1 text-primary font-semibold">{bin.count}</span>
                      </div>
                    </div>
                  )
                }}
              />
              {/* Normal distribution curve - rendered as Area in vertical layout */}
              <Area
                type="monotone"
                dataKey="normalY"
                stroke={colors.normalStroke}
                strokeWidth={2}
                fill={`url(#${normalGradientId})`}
                dot={false}
                activeDot={false}
              />
              <Bar dataKey="count" stroke={colors.barStroke} strokeWidth={0.5}>
                {bins.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === highlightedBinIndex ? `url(#${highlightGradientId})` : `url(#${gradientId})`}
                    stroke={index === highlightedBinIndex ? 'hsl(35, 100%, 45%)' : colors.barStroke}
                    strokeWidth={index === highlightedBinIndex ? 2 : 0.5}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
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
        <ComposedChart
          data={bins}
          margin={{ top: 25, right: 45, left: 10, bottom: 10 }}
          onMouseMove={(state) => {
            if (state?.activeTooltipIndex != null) {
              const binIndex = Number(state.activeTooltipIndex)
              const bin = bins[binIndex]
              if (bin && bin.sampleIds.length > 0) {
                // Broadcast all sample_ids in this bin for cross-chart highlighting
                onHoverSample(bin.sampleIds)
                // Also call legacy callback if provided
                onHoverBin?.([bin.binStart, bin.binEnd])
              }
            }
          }}
          onMouseLeave={() => {
            onLeaveSample()
            onHoverBin?.(null)
          }}
        >
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
            {/* Highlighted bar gradient */}
            <linearGradient id={highlightGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(45, 100%, 55%)" stopOpacity={1} />
              <stop offset="100%" stopColor="hsl(35, 100%, 50%)" stopOpacity={0.8} />
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
            stroke={colors.barStroke}
            strokeWidth={1}
            radius={[3, 3, 0, 0]}
          >
            {bins.map((_, index) => (
              <Cell
                key={`cell-h-${index}`}
                fill={index === highlightedBinIndex ? `url(#${highlightGradientId})` : `url(#${gradientId})`}
                stroke={index === highlightedBinIndex ? 'hsl(35, 100%, 45%)' : colors.barStroke}
                strokeWidth={index === highlightedBinIndex ? 2 : 1}
              />
            ))}
          </Bar>

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
