/**
 * BoxWhiskerChart - Box and whisker plot for distribution visualization.
 * Shows one box plot per sample, with each box representing the distribution
 * of measurements within that sample/subgroup.
 *
 * Requires subgroup size >= 2 (no meaningful distribution for n=1).
 */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useSamples, useCharacteristic } from '@/api/hooks'
import { getStoredChartColors, type ChartColors } from '@/lib/theme-presets'
import { useChartHoverSync } from '@/contexts/ChartHoverContext'
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
 * Extract measurement values from a sample.
 * Handles both formats: array of numbers OR array of Measurement objects.
 */
function getMeasurementValues(sample: Sample): number[] {
  if (!sample.measurements || sample.measurements.length === 0) {
    return []
  }
  // Check if it's an array of numbers or Measurement objects
  const first = sample.measurements[0]
  if (typeof first === 'number') {
    // Backend returns plain numbers
    return (sample.measurements as unknown as number[]).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v)
    )
  }
  // It's Measurement objects with .value property
  return sample.measurements
    .map((m) => m.value)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
}

/**
 * Calculate box plot statistics from a sample's measurements.
 */
function calculateBoxPlotFromSample(sample: Sample, index: number): BoxPlotData | null {
  // Filter to only valid numeric values
  const values = getMeasurementValues(sample)

  // Need at least 2 measurements for a meaningful box plot
  if (values.length < 2) return null

  const sorted = [...values].sort((a, b) => a - b)
  const { q1, median, q3 } = calculateQuartiles(sorted)
  const iqr = q3 - q1

  // Whiskers extend to min/max within 1.5 * IQR
  // If IQR is 0, whiskers just go to min/max
  const whiskerLowBound = iqr > 0 ? q1 - 1.5 * iqr : sorted[0]
  const whiskerHighBound = iqr > 0 ? q3 + 1.5 * iqr : sorted[sorted.length - 1]

  const whiskerLow = sorted.find((v) => v >= whiskerLowBound) ?? sorted[0]
  const whiskerHigh = [...sorted].reverse().find((v) => v <= whiskerHighBound) ?? sorted[sorted.length - 1]

  // Outliers are values outside whisker bounds
  const outliers = iqr > 0 ? sorted.filter((v) => v < whiskerLowBound || v > whiskerHighBound) : []

  // Calculate mean from measurements if sample.mean is not available
  const calculatedMean = values.reduce((a, b) => a + b, 0) / values.length
  const mean = typeof sample.mean === 'number' && Number.isFinite(sample.mean)
    ? sample.mean
    : calculatedMean

  const result = {
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
    mean,
  }

  // Validate all numeric values are finite before returning
  const numericFields = [result.min, result.q1, result.median, result.q3, result.max, result.whiskerLow, result.whiskerHigh, result.mean]
  if (numericFields.some((v) => !Number.isFinite(v))) {
    return null
  }

  return result
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
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [hoveredBox, setHoveredBox] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const rafRef = useRef<number>(0)

  // Cross-chart hover sync using sample IDs
  const { hoveredSampleIds, onHoverSample, onLeaveSample } = useChartHoverSync(characteristicId)

  // Track container size via callback ref — fires when the div actually enters the DOM,
  // solving the race condition where useEffect([]) ran during the loading early-return
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }

    if (!node) {
  
      return
    }

    const updateDimensions = () => {
      const rect = node.getBoundingClientRect()

      setDimensions({ width: rect.width, height: rect.height })
    }


    rafRef.current = requestAnimationFrame(updateDimensions)

    observerRef.current = new ResizeObserver(updateDimensions)
    observerRef.current.observe(node)
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

  // Chart margins and dimensions
  const margin = { top: 20, right: 50, bottom: 50, left: 70 }
  const chartWidth = Math.max(100, dimensions.width - margin.left - margin.right)
  const chartHeight = Math.max(100, dimensions.height - margin.top - margin.bottom)

  // Calculate Y-axis domain
  const yDomain = useMemo((): [number, number] => {
    if (boxPlotData.length === 0) return [0, 100]

    const allValues = boxPlotData.flatMap((box) => [
      box.min,
      box.max,
      ...box.outliers,
    ])

    // Include spec limits if showing
    if (showSpecLimits && characteristic) {
      if (characteristic.usl != null) allValues.push(characteristic.usl)
      if (characteristic.lsl != null) allValues.push(characteristic.lsl)
    }
    // Include control limits
    if (characteristic?.ucl != null) allValues.push(characteristic.ucl)
    if (characteristic?.lcl != null) allValues.push(characteristic.lcl)

    if (allValues.length === 0) return [0, 100]

    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    const range = max - min
    const padding = range > 0 ? range * 0.1 : 1

    return [min - padding, max + padding]
  }, [boxPlotData, characteristic, showSpecLimits])

  // Get colors based on scheme
  const boxColor = colorScheme === 'secondary'
    ? chartColors.secondaryLineGradientStart
    : chartColors.lineGradientStart

  const decimalPrecision = characteristic?.decimal_precision ?? 3
  const formatValue = (value: number) => value.toFixed(decimalPrecision)

  // Scale functions - memoized
  const scales = useMemo(() => {
    const [yMin, yMax] = yDomain
    const yRange = yMax - yMin

    const yScale = (value: number): number => {
      // Guard against invalid input values
      if (!Number.isFinite(value)) return chartHeight / 2
      if (yRange === 0) return chartHeight / 2
      const result = chartHeight - ((value - yMin) / yRange) * chartHeight
      // Guard against NaN results
      return Number.isFinite(result) ? result : chartHeight / 2
    }

    const xScale = (index: number): number => {
      const boxCount = boxPlotData.length
      if (boxCount === 0) return chartWidth / 2
      const boxSpacing = chartWidth / boxCount
      const result = boxSpacing * (index - 0.5)
      return Number.isFinite(result) ? result : chartWidth / 2
    }

    return { yScale, xScale }
  }, [yDomain, chartHeight, chartWidth, boxPlotData.length])

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
    const maxWidth = 50
    const minWidth = 10
    const spacing = chartWidth / boxPlotData.length
    return Math.max(minWidth, Math.min(maxWidth, spacing * 0.6))
  }, [boxPlotData.length, chartWidth])

  const whiskerWidth = boxWidth * 0.6

  // Get hovered box data for tooltip
  const hoveredBoxData = hoveredBox != null
    ? boxPlotData.find((b) => b.sampleId === hoveredBox)
    : null

  if (samplesLoading) {

    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading samples...</div>
      </div>
    )
  }

  if (boxPlotData.length === 0) {

    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center p-4">
        <div className="text-muted-foreground text-sm text-center">
          <p className="font-medium mb-1">No box plot data available</p>
          <p className="text-xs">Box plots require samples with at least 2 measurements each.</p>
        </div>
      </div>
    )
  }


  const { yScale, xScale } = scales

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
          <svg
            width={dimensions.width}
            height={dimensions.height}
            style={{ display: 'block' }}
          >
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              {/* Grid lines */}
              {yTicks.map((tick, i) => (
                <line
                  key={i}
                  x1={0}
                  x2={chartWidth}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeDasharray="4 4"
                />
              ))}

              {/* Spec limits */}
              {showSpecLimits && characteristic?.usl != null && (
                <>
                  <line
                    x1={0}
                    x2={chartWidth}
                    y1={yScale(characteristic.usl)}
                    y2={yScale(characteristic.usl)}
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="8 4"
                  />
                  <text
                    x={chartWidth + 5}
                    y={yScale(characteristic.usl)}
                    fill="#dc2626"
                    fontSize={11}
                    dominantBaseline="middle"
                  >
                    USL
                  </text>
                </>
              )}
              {showSpecLimits && characteristic?.lsl != null && (
                <>
                  <line
                    x1={0}
                    x2={chartWidth}
                    y1={yScale(characteristic.lsl)}
                    y2={yScale(characteristic.lsl)}
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="8 4"
                  />
                  <text
                    x={chartWidth + 5}
                    y={yScale(characteristic.lsl)}
                    fill="#dc2626"
                    fontSize={11}
                    dominantBaseline="middle"
                  >
                    LSL
                  </text>
                </>
              )}

              {/* Control limits */}
              {characteristic?.ucl != null && (
                <>
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
                </>
              )}
              {characteristic?.lcl != null && (
                <>
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
                </>
              )}

              {/* Box plots - one per sample */}
              {boxPlotData.map((box) => {
                const x = xScale(box.index)
                const isHoveredLocal = hoveredBox === box.sampleId
                // Cross-chart highlighting using sample_id
                const isHoveredGlobal = hoveredSampleIds?.has(box.sampleId) ?? false
                const isHovered = isHoveredLocal || isHoveredGlobal

                const y_q1 = yScale(box.q1)
                const y_q3 = yScale(box.q3)
                const y_median = yScale(box.median)
                const y_whiskerLow = yScale(box.whiskerLow)
                const y_whiskerHigh = yScale(box.whiskerHigh)
                const y_mean = yScale(box.mean)

                // Box height (Q3 is higher value but lower y coordinate)
                const boxTop = Math.min(y_q1, y_q3)
                const boxBottom = Math.max(y_q1, y_q3)
                const boxHeight = Math.max(2, boxBottom - boxTop)

                return (
                  <g
                    key={box.sampleId}
                    onMouseEnter={(e) => {
                      setHoveredBox(box.sampleId)
                      setTooltipPos({ x: e.clientX, y: e.clientY })
                      // Broadcast sample_id to cross-chart hover context
                      onHoverSample(box.sampleId)
                    }}
                    onMouseMove={(e) => {
                      setTooltipPos({ x: e.clientX, y: e.clientY })
                    }}
                    onMouseLeave={() => {
                      setHoveredBox(null)
                      setTooltipPos(null)
                      onLeaveSample()
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Vertical whisker line */}
                    <line
                      x1={x}
                      x2={x}
                      y1={y_whiskerHigh}
                      y2={y_whiskerLow}
                      stroke={boxColor}
                      strokeWidth={isHovered ? 2 : 1.5}
                    />

                    {/* Top whisker cap */}
                    <line
                      x1={x - whiskerWidth / 2}
                      x2={x + whiskerWidth / 2}
                      y1={y_whiskerHigh}
                      y2={y_whiskerHigh}
                      stroke={boxColor}
                      strokeWidth={isHovered ? 2 : 1.5}
                    />

                    {/* Bottom whisker cap */}
                    <line
                      x1={x - whiskerWidth / 2}
                      x2={x + whiskerWidth / 2}
                      y1={y_whiskerLow}
                      y2={y_whiskerLow}
                      stroke={boxColor}
                      strokeWidth={isHovered ? 2 : 1.5}
                    />

                    {/* Box (Q1 to Q3) */}
                    <rect
                      x={x - boxWidth / 2}
                      y={boxTop}
                      width={boxWidth}
                      height={boxHeight}
                      fill={boxColor}
                      fillOpacity={isHovered ? 0.4 : 0.25}
                      stroke={boxColor}
                      strokeWidth={isHovered ? 2 : 1.5}
                      rx={3}
                    />

                    {/* Median line */}
                    <line
                      x1={x - boxWidth / 2}
                      x2={x + boxWidth / 2}
                      y1={y_median}
                      y2={y_median}
                      stroke={boxColor}
                      strokeWidth={2.5}
                    />

                    {/* Mean marker (diamond) */}
                    <path
                      d={`M ${x} ${y_mean - 4} L ${x + 4} ${y_mean} L ${x} ${y_mean + 4} L ${x - 4} ${y_mean} Z`}
                      fill={chartColors.centerLine}
                      stroke="white"
                      strokeWidth={1}
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
                stroke="currentColor"
                strokeOpacity={0.3}
              />
              {yTicks.map((tick, i) => (
                <g key={i}>
                  <line
                    x1={-6}
                    x2={0}
                    y1={yScale(tick)}
                    y2={yScale(tick)}
                    stroke="currentColor"
                    strokeOpacity={0.5}
                  />
                  <text
                    x={-10}
                    y={yScale(tick)}
                    fill="currentColor"
                    fillOpacity={0.7}
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
                stroke="currentColor"
                strokeOpacity={0.3}
              />
              {/* X-axis label */}
              <text
                x={chartWidth / 2}
                y={chartHeight + 35}
                fill="currentColor"
                fillOpacity={0.6}
                fontSize={11}
                textAnchor="middle"
              >
                Sample Number
              </text>
              {/* Sample number labels (show subset if too many) */}
              {boxPlotData.length <= 20 ? (
                boxPlotData.map((box) => (
                  <text
                    key={box.sampleId}
                    x={xScale(box.index)}
                    y={chartHeight + 15}
                    fill="currentColor"
                    fillOpacity={0.6}
                    fontSize={10}
                    textAnchor="middle"
                  >
                    {box.index}
                  </text>
                ))
              ) : (
                // Show every nth label
                boxPlotData.filter((_, i) => i % Math.ceil(boxPlotData.length / 10) === 0).map((box) => (
                  <text
                    key={box.sampleId}
                    x={xScale(box.index)}
                    y={chartHeight + 15}
                    fill="currentColor"
                    fillOpacity={0.6}
                    fontSize={10}
                    textAnchor="middle"
                  >
                    {box.index}
                  </text>
                ))
              )}
            </g>
          </svg>
        )}

        {/* Tooltip */}
        {hoveredBoxData && tooltipPos && (
          <div
            className="fixed z-50 bg-popover border border-border rounded-lg p-3 text-sm shadow-xl pointer-events-none"
            style={{
              left: Math.min(tooltipPos.x + 15, window.innerWidth - 200),
              top: Math.max(tooltipPos.y - 100, 10),
            }}
          >
            <div className="font-semibold mb-1">Sample #{hoveredBoxData.index}</div>
            <div className="text-xs text-muted-foreground mb-2">
              {new Date(hoveredBoxData.timestamp).toLocaleString()}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              <span className="text-muted-foreground">Max:</span>
              <span>{formatValue(hoveredBoxData.max)}</span>
              <span className="text-muted-foreground">Q3:</span>
              <span>{formatValue(hoveredBoxData.q3)}</span>
              <span className="text-muted-foreground">Median:</span>
              <span className="font-medium">{formatValue(hoveredBoxData.median)}</span>
              <span className="text-muted-foreground">Mean:</span>
              <span style={{ color: chartColors.centerLine }}>{formatValue(hoveredBoxData.mean)}</span>
              <span className="text-muted-foreground">Q1:</span>
              <span>{formatValue(hoveredBoxData.q1)}</span>
              <span className="text-muted-foreground">Min:</span>
              <span>{formatValue(hoveredBoxData.min)}</span>
              <span className="text-muted-foreground">IQR:</span>
              <span>{formatValue(hoveredBoxData.q3 - hoveredBoxData.q1)}</span>
              <span className="text-muted-foreground">n:</span>
              <span>{hoveredBoxData.count}</span>
              {hoveredBoxData.outliers.length > 0 && (
                <>
                  <span className="text-orange-500">Outliers:</span>
                  <span className="text-orange-500">{hoveredBoxData.outliers.length}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-3 rounded-sm border-2" style={{ borderColor: boxColor, backgroundColor: `${boxColor}40` }} />
          <span>IQR</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded" style={{ backgroundColor: boxColor }} />
          <span>Median</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rotate-45" style={{ backgroundColor: chartColors.centerLine }} />
          <span>Mean</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: chartColors.violationPoint }} />
          <span>Outlier</span>
        </div>
      </div>
    </div>
  )
}

export default BoxWhiskerChart
