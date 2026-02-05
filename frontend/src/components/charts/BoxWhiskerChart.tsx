/**
 * BoxWhiskerChart - Box and whisker plot for distribution visualization.
 * Shows median, quartiles (Q1, Q3), whiskers (min/max within 1.5*IQR), and outliers.
 *
 * Uses custom SVG rendering since Recharts doesn't natively support box plots.
 */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useChartData } from '@/api/hooks'
import { getStoredChartColors, type ChartColors } from '@/lib/theme-presets'

interface BoxWhiskerChartProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
  /** Group data by time period */
  groupBy?: 'all' | 'daily' | 'weekly'
  colorScheme?: 'primary' | 'secondary'
  showSpecLimits?: boolean
}

interface BoxPlotData {
  name: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  whiskerLow: number
  whiskerHigh: number
  outliers: number[]
  count: number
}

// Hook to subscribe to chart color changes
function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(getStoredChartColors)

  const updateColors = useCallback(() => {
    setColors(getStoredChartColors())
  }, [])

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'openspc-chart-colors' || e.key === 'openspc-chart-preset') {
        updateColors()
      }
    }
    const handleColorChange = () => updateColors()

    window.addEventListener('storage', handleStorage)
    window.addEventListener('chart-colors-changed', handleColorChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('chart-colors-changed', handleColorChange)
    }
  }, [updateColors])

  return colors
}

/**
 * Calculate quartiles using linear interpolation.
 */
function calculateQuartiles(sortedValues: number[]): { q1: number; median: number; q3: number } {
  const n = sortedValues.length

  if (n === 0) return { q1: 0, median: 0, q3: 0 }
  if (n === 1) return { q1: sortedValues[0], median: sortedValues[0], q3: sortedValues[0] }

  const getPercentile = (p: number): number => {
    const index = (n - 1) * p
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    const weight = index - lower

    if (upper >= n) return sortedValues[n - 1]
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
  }

  return {
    q1: getPercentile(0.25),
    median: getPercentile(0.5),
    q3: getPercentile(0.75),
  }
}

/**
 * Calculate box plot statistics from an array of values.
 */
function calculateBoxPlotStats(values: number[], name: string): BoxPlotData {
  if (values.length === 0) {
    return {
      name,
      min: 0,
      q1: 0,
      median: 0,
      q3: 0,
      max: 0,
      whiskerLow: 0,
      whiskerHigh: 0,
      outliers: [],
      count: 0,
    }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const { q1, median, q3 } = calculateQuartiles(sorted)
  const iqr = q3 - q1

  // Whiskers extend to min/max within 1.5 * IQR
  const whiskerLowBound = q1 - 1.5 * iqr
  const whiskerHighBound = q3 + 1.5 * iqr

  const whiskerLow = sorted.find((v) => v >= whiskerLowBound) ?? sorted[0]
  const whiskerHigh = [...sorted].reverse().find((v) => v <= whiskerHighBound) ?? sorted[sorted.length - 1]

  // Outliers are values outside whisker bounds
  const outliers = sorted.filter((v) => v < whiskerLowBound || v > whiskerHighBound)

  return {
    name,
    min: sorted[0],
    q1,
    median,
    q3,
    max: sorted[sorted.length - 1],
    whiskerLow,
    whiskerHigh,
    outliers,
    count: values.length,
  }
}

export function BoxWhiskerChart({
  characteristicId,
  chartOptions,
  groupBy = 'all',
  colorScheme = 'primary',
  showSpecLimits = true,
}: BoxWhiskerChartProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, chartOptions ?? { limit: 100 })
  const chartColors = useChartColors()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [hoveredBox, setHoveredBox] = useState<number | null>(null)
  const [tooltipData, setTooltipData] = useState<{ box: BoxPlotData; x: number; y: number } | null>(null)

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Calculate box plot data
  const boxPlotData = useMemo((): BoxPlotData[] => {
    if (!chartData?.data_points?.length) return []

    const points = chartData.data_points

    if (groupBy === 'all') {
      // Single box for all data
      const values = points.map((p) => p.mean)
      return [calculateBoxPlotStats(values, 'All Data')]
    }

    // Group by time period
    const groups = new Map<string, number[]>()

    points.forEach((point) => {
      const date = new Date(point.timestamp)
      let key: string

      if (groupBy === 'daily') {
        key = date.toLocaleDateString()
      } else if (groupBy === 'weekly') {
        const startOfYear = new Date(date.getFullYear(), 0, 1)
        const weekNum = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)
        key = `Week ${weekNum}`
      } else {
        key = 'All Data'
      }

      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(point.mean)
    })

    return Array.from(groups.entries()).map(([name, values]) =>
      calculateBoxPlotStats(values, name)
    )
  }, [chartData, groupBy])

  // Calculate Y-axis domain
  const yDomain = useMemo((): [number, number] => {
    if (boxPlotData.length === 0) return [0, 100]

    const allValues = boxPlotData.flatMap((box) => [
      box.whiskerLow,
      box.whiskerHigh,
      ...box.outliers,
    ])

    // Include spec limits if showing
    if (showSpecLimits && chartData) {
      if (chartData.spec_limits.usl != null) allValues.push(chartData.spec_limits.usl)
      if (chartData.spec_limits.lsl != null) allValues.push(chartData.spec_limits.lsl)
    }

    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    const padding = (max - min) * 0.1 || 1

    return [min - padding, max + padding]
  }, [boxPlotData, chartData, showSpecLimits])

  // Get colors based on scheme
  const boxColor = colorScheme === 'secondary'
    ? chartColors.secondaryLineGradientStart
    : chartColors.lineGradientStart

  const decimalPrecision = chartData?.decimal_precision ?? 3
  const formatValue = (value: number) => value.toFixed(decimalPrecision)

  // Chart margins
  const margin = { top: 20, right: 40, bottom: 40, left: 60 }
  const chartWidth = Math.max(0, dimensions.width - margin.left - margin.right)
  const chartHeight = Math.max(0, dimensions.height - margin.top - margin.bottom)

  // Scale functions
  const yScale = (value: number): number => {
    const [yMin, yMax] = yDomain
    return chartHeight - ((value - yMin) / (yMax - yMin)) * chartHeight
  }

  const xScale = (index: number): number => {
    const boxCount = boxPlotData.length
    const boxWidth = chartWidth / boxCount
    return boxWidth * index + boxWidth / 2
  }

  // Generate Y-axis ticks
  const yTicks = useMemo(() => {
    const [yMin, yMax] = yDomain
    const tickCount = 6
    const step = (yMax - yMin) / (tickCount - 1)
    return Array.from({ length: tickCount }, (_, i) => yMin + step * i)
  }, [yDomain])

  if (isLoading) {
    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading chart data...</div>
      </div>
    )
  }

  if (!chartData || boxPlotData.length === 0) {
    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center">
        <div className="text-muted-foreground text-sm">No data available for box plot</div>
      </div>
    )
  }

  const boxWidth = Math.min(60, chartWidth / boxPlotData.length * 0.6)
  const whiskerWidth = boxWidth * 0.5

  return (
    <div className="h-full bg-card border border-border rounded-2xl p-5 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 h-5 flex-shrink-0">
        <h3 className="font-semibold text-sm leading-5">
          {chartData.characteristic_name} - Box & Whisker Plot
        </h3>
        <div className="flex gap-4 text-sm text-muted-foreground leading-5">
          <span>n={boxPlotData.reduce((sum, b) => sum + b.count, 0)}</span>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {dimensions.width > 0 && dimensions.height > 0 && (
          <svg width={dimensions.width} height={dimensions.height}>
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              {/* Grid lines */}
              {yTicks.map((tick) => (
                <line
                  key={tick}
                  x1={0}
                  x2={chartWidth}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                  stroke="hsl(var(--muted))"
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                />
              ))}

              {/* Spec limits */}
              {showSpecLimits && chartData.spec_limits.usl != null && (
                <g>
                  <line
                    x1={0}
                    x2={chartWidth}
                    y1={yScale(chartData.spec_limits.usl)}
                    y2={yScale(chartData.spec_limits.usl)}
                    stroke="hsl(357 80% 52%)"
                    strokeWidth={1.5}
                    strokeDasharray="8 4"
                  />
                  <text
                    x={chartWidth + 5}
                    y={yScale(chartData.spec_limits.usl)}
                    fill="hsl(357 80% 45%)"
                    fontSize={10}
                    dominantBaseline="middle"
                  >
                    USL
                  </text>
                </g>
              )}
              {showSpecLimits && chartData.spec_limits.lsl != null && (
                <g>
                  <line
                    x1={0}
                    x2={chartWidth}
                    y1={yScale(chartData.spec_limits.lsl)}
                    y2={yScale(chartData.spec_limits.lsl)}
                    stroke="hsl(357 80% 52%)"
                    strokeWidth={1.5}
                    strokeDasharray="8 4"
                  />
                  <text
                    x={chartWidth + 5}
                    y={yScale(chartData.spec_limits.lsl)}
                    fill="hsl(357 80% 45%)"
                    fontSize={10}
                    dominantBaseline="middle"
                  >
                    LSL
                  </text>
                </g>
              )}

              {/* Box plots */}
              {boxPlotData.map((box, index) => {
                const x = xScale(index)
                const isHovered = hoveredBox === index

                return (
                  <g
                    key={box.name}
                    onMouseEnter={(e) => {
                      setHoveredBox(index)
                      setTooltipData({ box, x: e.clientX, y: e.clientY })
                    }}
                    onMouseLeave={() => {
                      setHoveredBox(null)
                      setTooltipData(null)
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Whisker line (vertical) */}
                    <line
                      x1={x}
                      x2={x}
                      y1={yScale(box.whiskerHigh)}
                      y2={yScale(box.whiskerLow)}
                      stroke={boxColor}
                      strokeWidth={isHovered ? 2 : 1}
                    />

                    {/* Top whisker cap */}
                    <line
                      x1={x - whiskerWidth / 2}
                      x2={x + whiskerWidth / 2}
                      y1={yScale(box.whiskerHigh)}
                      y2={yScale(box.whiskerHigh)}
                      stroke={boxColor}
                      strokeWidth={isHovered ? 2 : 1}
                    />

                    {/* Bottom whisker cap */}
                    <line
                      x1={x - whiskerWidth / 2}
                      x2={x + whiskerWidth / 2}
                      y1={yScale(box.whiskerLow)}
                      y2={yScale(box.whiskerLow)}
                      stroke={boxColor}
                      strokeWidth={isHovered ? 2 : 1}
                    />

                    {/* Box (Q1 to Q3) */}
                    <rect
                      x={x - boxWidth / 2}
                      y={yScale(box.q3)}
                      width={boxWidth}
                      height={Math.abs(yScale(box.q1) - yScale(box.q3))}
                      fill={boxColor}
                      fillOpacity={isHovered ? 0.4 : 0.2}
                      stroke={boxColor}
                      strokeWidth={isHovered ? 2 : 1}
                      rx={4}
                    />

                    {/* Median line */}
                    <line
                      x1={x - boxWidth / 2}
                      x2={x + boxWidth / 2}
                      y1={yScale(box.median)}
                      y2={yScale(box.median)}
                      stroke={boxColor}
                      strokeWidth={2}
                    />

                    {/* Outliers */}
                    {box.outliers.map((outlier, oi) => (
                      <circle
                        key={oi}
                        cx={x}
                        cy={yScale(outlier)}
                        r={4}
                        fill={chartColors.violationPoint}
                        stroke="white"
                        strokeWidth={1}
                      />
                    ))}
                  </g>
                )
              })}

              {/* Y-axis */}
              <line
                x1={0}
                x2={0}
                y1={0}
                y2={chartHeight}
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.5}
              />
              {yTicks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={-5}
                    x2={0}
                    y1={yScale(tick)}
                    y2={yScale(tick)}
                    stroke="hsl(var(--muted-foreground))"
                    strokeOpacity={0.5}
                  />
                  <text
                    x={-10}
                    y={yScale(tick)}
                    fill="hsl(var(--muted-foreground))"
                    fontSize={11}
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {formatValue(tick)}
                  </text>
                </g>
              ))}

              {/* X-axis labels */}
              {boxPlotData.map((box, index) => (
                <text
                  key={box.name}
                  x={xScale(index)}
                  y={chartHeight + 20}
                  fill="hsl(var(--muted-foreground))"
                  fontSize={11}
                  textAnchor="middle"
                >
                  {box.name}
                </text>
              ))}
            </g>
          </svg>
        )}

        {/* Tooltip */}
        {tooltipData && (
          <div
            className="fixed z-50 bg-popover border border-border rounded-xl p-3 text-sm shadow-xl pointer-events-none"
            style={{
              left: tooltipData.x + 10,
              top: tooltipData.y - 10,
              transform: 'translateY(-50%)',
            }}
          >
            <div className="font-medium mb-2">{tooltipData.box.name}</div>
            <div className="space-y-1 text-muted-foreground">
              <div>Max: {formatValue(tooltipData.box.max)}</div>
              <div>Q3 (75%): {formatValue(tooltipData.box.q3)}</div>
              <div className="font-medium text-foreground">Median: {formatValue(tooltipData.box.median)}</div>
              <div>Q1 (25%): {formatValue(tooltipData.box.q1)}</div>
              <div>Min: {formatValue(tooltipData.box.min)}</div>
              <div className="pt-1 border-t border-border mt-1">
                IQR: {formatValue(tooltipData.box.q3 - tooltipData.box.q1)}
              </div>
              <div>Count: {tooltipData.box.count}</div>
              {tooltipData.box.outliers.length > 0 && (
                <div className="text-orange-500">Outliers: {tooltipData.box.outliers.length}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-8 h-4 rounded border-2" style={{ borderColor: boxColor, backgroundColor: `${boxColor}33` }} />
          <span>IQR (Q1-Q3)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5" style={{ backgroundColor: boxColor }} />
          <span>Whiskers (1.5×IQR)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: chartColors.violationPoint }} />
          <span>Outliers</span>
        </div>
      </div>
    </div>
  )
}

export default BoxWhiskerChart
