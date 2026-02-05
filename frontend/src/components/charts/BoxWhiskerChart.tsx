/**
 * BoxWhiskerChart - Box and whisker plot for distribution visualization.
 * Shows one box plot per sample, with each box representing the distribution
 * of measurements within that sample/subgroup.
 *
 * Uses custom SVG rendering since Recharts doesn't natively support box plots.
 */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useSamples, useCharacteristic } from '@/api/hooks'
import { getStoredChartColors, type ChartColors } from '@/lib/theme-presets'
import type { Sample } from '@/types'

interface BoxWhiskerChartProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
  colorScheme?: 'primary' | 'secondary'
  showSpecLimits?: boolean
}

interface BoxPlotData {
  sampleId: number
  index: number
  timestamp: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  whiskerLow: number
  whiskerHigh: number
  outliers: number[]
  count: number
  mean: number
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
 * Calculate box plot statistics from a sample's measurements.
 */
function calculateBoxPlotFromSample(sample: Sample, index: number): BoxPlotData | null {
  const values = sample.measurements?.map((m) => m.value) ?? []

  if (values.length === 0) return null

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
    sampleId: sample.id,
    index,
    timestamp: sample.timestamp,
    min: sorted[0],
    q1,
    median,
    q3,
    max: sorted[sorted.length - 1],
    whiskerLow,
    whiskerHigh,
    outliers,
    count: values.length,
    mean: sample.mean,
  }
}

export function BoxWhiskerChart({
  characteristicId,
  chartOptions,
  colorScheme = 'primary',
  showSpecLimits = true,
}: BoxWhiskerChartProps) {
  // Fetch samples with measurements
  const { data: samplesData, isLoading: samplesLoading } = useSamples({
    characteristic_id: characteristicId,
    per_page: chartOptions?.limit ?? 50,
    start_date: chartOptions?.startDate,
    end_date: chartOptions?.endDate,
  })

  // Fetch characteristic for spec limits and decimal precision
  const { data: characteristic } = useCharacteristic(characteristicId)

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

  // Calculate box plot data for each sample
  const boxPlotData = useMemo((): BoxPlotData[] => {
    if (!samplesData?.items?.length) return []

    // Sort samples by timestamp and calculate box plots
    const sortedSamples = [...samplesData.items].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    return sortedSamples
      .map((sample, index) => calculateBoxPlotFromSample(sample, index + 1))
      .filter((box): box is BoxPlotData => box !== null)
  }, [samplesData])

  // Calculate Y-axis domain
  const yDomain = useMemo((): [number, number] => {
    if (boxPlotData.length === 0) return [0, 100]

    const allValues = boxPlotData.flatMap((box) => [
      box.whiskerLow,
      box.whiskerHigh,
      ...box.outliers,
    ])

    // Include spec limits if showing
    if (showSpecLimits && characteristic) {
      if (characteristic.usl != null) allValues.push(characteristic.usl)
      if (characteristic.lsl != null) allValues.push(characteristic.lsl)
    }

    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    const padding = (max - min) * 0.1 || 1

    return [min - padding, max + padding]
  }, [boxPlotData, characteristic, showSpecLimits])

  // Get colors based on scheme
  const boxColor = colorScheme === 'secondary'
    ? chartColors.secondaryLineGradientStart
    : chartColors.lineGradientStart

  const decimalPrecision = characteristic?.decimal_precision ?? 3
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
    if (boxCount === 0) return 0
    const boxSpacing = chartWidth / boxCount
    return boxSpacing * (index - 1) + boxSpacing / 2
  }

  // Generate Y-axis ticks
  const yTicks = useMemo(() => {
    const [yMin, yMax] = yDomain
    const tickCount = 6
    const step = (yMax - yMin) / (tickCount - 1)
    return Array.from({ length: tickCount }, (_, i) => yMin + step * i)
  }, [yDomain])

  // Calculate dynamic box width based on number of samples
  const boxWidth = useMemo(() => {
    if (boxPlotData.length === 0) return 20
    const maxWidth = 40
    const minWidth = 8
    const spacing = chartWidth / boxPlotData.length
    return Math.max(minWidth, Math.min(maxWidth, spacing * 0.7))
  }, [boxPlotData.length, chartWidth])

  const whiskerWidth = boxWidth * 0.5

  if (samplesLoading) {
    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading samples...</div>
      </div>
    )
  }

  if (boxPlotData.length === 0) {
    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center">
        <div className="text-muted-foreground text-sm">
          No sample data available. Box plots require samples with multiple measurements.
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-card border border-border rounded-2xl p-5 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 h-5 flex-shrink-0">
        <h3 className="font-semibold text-sm leading-5">
          {characteristic?.name ?? 'Characteristic'} - Box & Whisker Plot
        </h3>
        <div className="flex gap-4 text-sm text-muted-foreground leading-5">
          <span>{boxPlotData.length} samples</span>
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
              {showSpecLimits && characteristic?.usl != null && (
                <g>
                  <line
                    x1={0}
                    x2={chartWidth}
                    y1={yScale(characteristic.usl)}
                    y2={yScale(characteristic.usl)}
                    stroke="hsl(357 80% 52%)"
                    strokeWidth={1.5}
                    strokeDasharray="8 4"
                  />
                  <text
                    x={chartWidth + 5}
                    y={yScale(characteristic.usl)}
                    fill="hsl(357 80% 45%)"
                    fontSize={10}
                    dominantBaseline="middle"
                  >
                    USL
                  </text>
                </g>
              )}
              {showSpecLimits && characteristic?.lsl != null && (
                <g>
                  <line
                    x1={0}
                    x2={chartWidth}
                    y1={yScale(characteristic.lsl)}
                    y2={yScale(characteristic.lsl)}
                    stroke="hsl(357 80% 52%)"
                    strokeWidth={1.5}
                    strokeDasharray="8 4"
                  />
                  <text
                    x={chartWidth + 5}
                    y={yScale(characteristic.lsl)}
                    fill="hsl(357 80% 45%)"
                    fontSize={10}
                    dominantBaseline="middle"
                  >
                    LSL
                  </text>
                </g>
              )}

              {/* Control limits if available */}
              {characteristic?.ucl != null && (
                <g>
                  <line
                    x1={0}
                    x2={chartWidth}
                    y1={yScale(characteristic.ucl)}
                    y2={yScale(characteristic.ucl)}
                    stroke={chartColors.uclLine}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                  />
                  <text
                    x={chartWidth + 5}
                    y={yScale(characteristic.ucl)}
                    fill={chartColors.uclLine}
                    fontSize={10}
                    dominantBaseline="middle"
                  >
                    UCL
                  </text>
                </g>
              )}
              {characteristic?.lcl != null && (
                <g>
                  <line
                    x1={0}
                    x2={chartWidth}
                    y1={yScale(characteristic.lcl)}
                    y2={yScale(characteristic.lcl)}
                    stroke={chartColors.lclLine}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                  />
                  <text
                    x={chartWidth + 5}
                    y={yScale(characteristic.lcl)}
                    fill={chartColors.lclLine}
                    fontSize={10}
                    dominantBaseline="middle"
                  >
                    LCL
                  </text>
                </g>
              )}

              {/* Box plots - one per sample */}
              {boxPlotData.map((box) => {
                const x = xScale(box.index)
                const isHovered = hoveredBox === box.sampleId

                return (
                  <g
                    key={box.sampleId}
                    onMouseEnter={(e) => {
                      setHoveredBox(box.sampleId)
                      setTooltipData({ box, x: e.clientX, y: e.clientY })
                    }}
                    onMouseMove={(e) => {
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
                      height={Math.max(1, Math.abs(yScale(box.q1) - yScale(box.q3)))}
                      fill={boxColor}
                      fillOpacity={isHovered ? 0.4 : 0.2}
                      stroke={boxColor}
                      strokeWidth={isHovered ? 2 : 1}
                      rx={2}
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

                    {/* Mean marker (small diamond) */}
                    <path
                      d={`M ${x} ${yScale(box.mean) - 3} L ${x + 3} ${yScale(box.mean)} L ${x} ${yScale(box.mean) + 3} L ${x - 3} ${yScale(box.mean)} Z`}
                      fill={chartColors.centerLine}
                      stroke="white"
                      strokeWidth={0.5}
                    />

                    {/* Outliers */}
                    {box.outliers.map((outlier, oi) => (
                      <circle
                        key={oi}
                        cx={x}
                        cy={yScale(outlier)}
                        r={3}
                        fill={chartColors.violationPoint}
                        stroke="white"
                        strokeWidth={0.5}
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

              {/* X-axis */}
              <line
                x1={0}
                x2={chartWidth}
                y1={chartHeight}
                y2={chartHeight}
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.5}
              />
              <text
                x={chartWidth / 2}
                y={chartHeight + 30}
                fill="hsl(var(--muted-foreground))"
                fontSize={11}
                textAnchor="middle"
              >
                Sample #
              </text>
            </g>
          </svg>
        )}

        {/* Tooltip */}
        {tooltipData && (
          <div
            className="fixed z-50 bg-popover border border-border rounded-xl p-3 text-sm shadow-xl pointer-events-none"
            style={{
              left: Math.min(tooltipData.x + 10, window.innerWidth - 220),
              top: tooltipData.y - 10,
              transform: 'translateY(-50%)',
            }}
          >
            <div className="font-medium mb-2">Sample #{tooltipData.box.index}</div>
            <div className="text-xs text-muted-foreground mb-2">
              {new Date(tooltipData.box.timestamp).toLocaleString()}
            </div>
            <div className="space-y-1 text-muted-foreground">
              <div>Max: {formatValue(tooltipData.box.max)}</div>
              <div>Q3 (75%): {formatValue(tooltipData.box.q3)}</div>
              <div className="font-medium text-foreground">Median: {formatValue(tooltipData.box.median)}</div>
              <div className="text-primary">Mean: {formatValue(tooltipData.box.mean)}</div>
              <div>Q1 (25%): {formatValue(tooltipData.box.q1)}</div>
              <div>Min: {formatValue(tooltipData.box.min)}</div>
              <div className="pt-1 border-t border-border mt-1">
                IQR: {formatValue(tooltipData.box.q3 - tooltipData.box.q1)}
              </div>
              <div>n={tooltipData.box.count}</div>
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
          <div className="w-6 h-4 rounded border-2" style={{ borderColor: boxColor, backgroundColor: `${boxColor}33` }} />
          <span>IQR (Q1-Q3)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5" style={{ backgroundColor: boxColor }} />
          <span>Median</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rotate-45" style={{ backgroundColor: chartColors.centerLine }} />
          <span>Mean</span>
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
