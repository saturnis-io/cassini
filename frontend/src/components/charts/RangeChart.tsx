/**
 * RangeChart - Secondary chart showing Range values for X-bar R charts.
 * Designed to be displayed below an X-bar chart in DualChartPanel.
 */

import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Brush,
} from 'recharts'
import { useChartData } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { getStoredChartColors, type ChartColors } from '@/lib/theme-presets'
import { SPC_CONSTANTS, getSPCConstant } from '@/types/charts'
import { useChartHoverSync } from '@/contexts/ChartHoverContext'

interface RangeChartProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
  /** Chart type: 'range' for R chart, 'stddev' for S chart, 'mr' for Moving Range */
  chartType?: 'range' | 'stddev' | 'mr'
  colorScheme?: 'primary' | 'secondary'
  /** Callback when hovering over a data point */
  onHoverIndex?: (index: number | null) => void
  /** Index being hovered in the primary chart */
  highlightedIndex?: number | null
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

export function RangeChart({
  characteristicId,
  chartOptions,
  chartType = 'range',
  colorScheme = 'primary',
  onHoverIndex,
  highlightedIndex,
}: RangeChartProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, chartOptions ?? { limit: 50 })
  const chartColors = useChartColors()
  const xAxisMode = useDashboardStore((state) => state.xAxisMode)
  const showBrush = useDashboardStore((state) => state.showBrush)

  // Cross-chart hover sync using sample IDs
  const { hoveredSampleIds, onHoverSample, onLeaveSample } = useChartHoverSync(characteristicId)

  // Calculate range/stddev values and control limits
  const { data, controlLimits, chartLabel, yAxisLabel } = useMemo(() => {
    if (!chartData?.data_points?.length) {
      return { data: [], controlLimits: { ucl: null, lcl: null, cl: null }, chartLabel: '', yAxisLabel: '' }
    }

    const points = chartData.data_points
    const n = chartData.nominal_subgroup_size

    // Get values based on chart type
    let values: number[] = []
    let label = ''
    let yLabel = ''

    if (chartType === 'range') {
      // Range values from samples
      values = points.map((p) => p.range ?? 0)
      label = 'Range Chart'
      yLabel = 'Range'
    } else if (chartType === 'stddev') {
      // Standard deviation - would need backend support
      // For now, estimate from range using d2
      const d2 = getSPCConstant(SPC_CONSTANTS.d2, n) ?? 2.326
      values = points.map((p) => (p.range ?? 0) / d2)
      label = 'S Chart (Std Dev)'
      yLabel = 'Std Dev'
    } else if (chartType === 'mr') {
      // Moving Range - difference between consecutive points
      values = []
      for (let i = 1; i < points.length; i++) {
        const mr = Math.abs(points[i].mean - points[i - 1].mean)
        values.push(mr)
      }
      label = 'Moving Range Chart'
      yLabel = 'MR'
    }

    // Calculate control limits based on chart type
    let ucl: number | null = null
    let lcl: number | null = null
    let cl: number | null = null

    if (chartType === 'range' && values.length > 0) {
      // R-bar (average range)
      const rBar = values.reduce((sum, v) => sum + v, 0) / values.length
      cl = rBar

      // D3 and D4 constants for control limits
      const D3 = getSPCConstant(SPC_CONSTANTS.D3, n) ?? 0
      const D4 = getSPCConstant(SPC_CONSTANTS.D4, n) ?? 3.267

      ucl = D4 * rBar
      lcl = D3 * rBar
    } else if (chartType === 'stddev' && values.length > 0) {
      // S-bar (average std dev)
      const sBar = values.reduce((sum, v) => sum + v, 0) / values.length
      cl = sBar

      // B3 and B4 constants
      const B3 = getSPCConstant(SPC_CONSTANTS.B3, n) ?? 0
      const B4 = getSPCConstant(SPC_CONSTANTS.B4, n) ?? 3.267

      ucl = B4 * sBar
      lcl = B3 * sBar
    } else if (chartType === 'mr' && values.length > 0) {
      // MR-bar (average moving range)
      const mrBar = values.reduce((sum, v) => sum + v, 0) / values.length
      cl = mrBar

      // For MR chart with span of 2
      ucl = 3.267 * mrBar // D4 for n=2
      lcl = 0 // D3 for n=2 is 0
    }

    // Build chart data with sample IDs for cross-chart sync
    // For MR chart, each point represents the change between two consecutive samples
    // We store both sample_ids so we can highlight when either is hovered
    const chartPoints = (chartType === 'mr' ? points.slice(1) : points).map((point, index) => {
      if (chartType === 'mr') {
        // MR chart: point at index represents the range from points[index] to points[index+1]
        // Since we sliced from index 1, the "from" sample is at points[index]
        const fromPoint = points[index]
        return {
          index: index + 2, // Display as sample #2, #3, etc. (MR starts at sample 2)
          value: values[index] ?? 0,
          timestamp: new Date(point.timestamp).toLocaleTimeString(),
          timestampMs: new Date(point.timestamp).getTime(),
          hasViolation: false,
          sample_id: point.sample_id, // The "to" sample ID
          sample_id_from: fromPoint.sample_id, // The "from" sample ID
        }
      } else {
        // R/S charts: one-to-one mapping with X-bar chart
        return {
          index: index + 1,
          value: values[index] ?? 0,
          timestamp: new Date(point.timestamp).toLocaleTimeString(),
          timestampMs: new Date(point.timestamp).getTime(),
          hasViolation: false,
          sample_id: point.sample_id,
          sample_id_from: null as number | null,
        }
      }
    })

    return {
      data: chartPoints,
      controlLimits: { ucl, lcl, cl },
      chartLabel: label,
      yAxisLabel: yLabel,
    }
  }, [chartData, chartType])

  const lineGradientId = `rangeChartGradient-${characteristicId}-${chartType}`
  const lineColors = colorScheme === 'secondary'
    ? { start: chartColors.secondaryLineGradientStart, end: chartColors.secondaryLineGradientEnd }
    : { start: chartColors.lineGradientStart, end: chartColors.lineGradientEnd }

  if (isLoading) {
    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center">
        <div className="text-muted-foreground text-sm">No data available</div>
      </div>
    )
  }

  // Timestamp tick formatter - adaptive based on data range
  const formatTimeTick = useCallback((value: number) => {
    const date = new Date(value)
    const rangeMs = data.length > 1
      ? data[data.length - 1].timestampMs - data[0].timestampMs
      : 0
    if (rangeMs > 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }, [data])

  // Adjust chart bottom margin when Brush is visible
  const rangeBottomMargin = showBrush && data.length > 10 ? 60 : (xAxisMode === 'timestamp' ? 40 : 20)

  // Calculate Y-axis domain
  const values = data.map((d) => d.value)
  const minVal = Math.min(...values, controlLimits.lcl ?? 0)
  const maxVal = Math.max(...values, controlLimits.ucl ?? 0)
  const padding = (maxVal - minVal) * 0.2 || 1
  const yMin = Math.max(0, minVal - padding) // Range can't be negative
  const yMax = maxVal + padding

  const decimalPrecision = chartData?.decimal_precision ?? 3
  const formatValue = (value: number) => value.toFixed(decimalPrecision)

  return (
    <div className="h-full bg-card border border-border rounded-2xl p-5 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 h-5 flex-shrink-0">
        <h3 className="font-semibold text-sm leading-5">{chartLabel}</h3>
        <div className="flex gap-4 text-sm text-muted-foreground leading-5">
          {controlLimits.ucl != null && <span>UCL: {formatValue(controlLimits.ucl)}</span>}
          {controlLimits.cl != null && <span>CL: {formatValue(controlLimits.cl)}</span>}
          {controlLimits.lcl != null && controlLimits.lcl > 0 && (
            <span>LCL: {formatValue(controlLimits.lcl)}</span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 60, left: 20, bottom: rangeBottomMargin }}
            onMouseMove={(state) => {
              if (state?.activeTooltipIndex != null) {
                const arrayIndex = Number(state.activeTooltipIndex)
                const point = data[arrayIndex]
                if (point) {
                  // Broadcast only the primary sample_id for cross-chart sync
                  // For MR chart, use only the "to" sample to avoid highlighting two points
                  onHoverSample(point.sample_id)
                  // Also call local callback if provided
                  onHoverIndex?.(arrayIndex)
                }
              }
            }}
            onMouseLeave={() => {
              onLeaveSample()
              onHoverIndex?.(null)
            }}
          >
            <defs>
              <linearGradient id={lineGradientId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={lineColors.start} />
                <stop offset="100%" stopColor={lineColors.end} />
              </linearGradient>
              <pattern id={`rangeOocPattern-${characteristicId}`} patternUnits="userSpaceOnUse" width="8" height="8">
                <rect width="8" height="8" fill={chartColors.outOfControl} fillOpacity="0.15" />
                <line x1="0" y1="8" x2="8" y2="0" stroke={chartColors.outOfControl} strokeWidth="0.5" strokeOpacity="0.3" />
              </pattern>
            </defs>

            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />

            {/* Out-of-control zone above UCL */}
            {controlLimits.ucl != null && (
              <ReferenceArea
                y1={controlLimits.ucl}
                y2={yMax}
                fill={`url(#rangeOocPattern-${characteristicId})`}
              />
            )}

            <XAxis
              dataKey={xAxisMode === 'timestamp' ? 'timestampMs' : 'index'}
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              tickFormatter={xAxisMode === 'timestamp' ? formatTimeTick : undefined}
              type={xAxisMode === 'timestamp' ? 'number' : 'category'}
              domain={xAxisMode === 'timestamp' ? ['dataMin', 'dataMax'] : undefined}
              angle={xAxisMode === 'timestamp' ? -30 : 0}
              textAnchor={xAxisMode === 'timestamp' ? 'end' : 'middle'}
              height={xAxisMode === 'timestamp' ? 50 : 30}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              tickFormatter={(value) => value.toFixed(decimalPrecision)}
              label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload
                return (
                  <div className="bg-popover border border-border rounded-xl p-3 text-sm shadow-xl">
                    <div className="font-medium">Sample #{point.index}</div>
                    <div>{yAxisLabel}: {formatValue(point.value)}</div>
                    <div className="text-muted-foreground">{point.timestamp}</div>
                  </div>
                )
              }}
            />

            {/* UCL */}
            {controlLimits.ucl != null && (
              <ReferenceLine
                y={controlLimits.ucl}
                stroke={chartColors.uclLine}
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: 'UCL',
                  position: 'right',
                  fill: chartColors.uclLine,
                  fontSize: 11,
                  fontWeight: 500,
                }}
              />
            )}

            {/* Center Line */}
            {controlLimits.cl != null && (
              <ReferenceLine
                y={controlLimits.cl}
                stroke={chartColors.centerLine}
                strokeWidth={2}
                label={{
                  value: 'CL',
                  position: 'right',
                  fill: chartColors.centerLine,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
            )}

            {/* LCL (only if > 0) */}
            {controlLimits.lcl != null && controlLimits.lcl > 0 && (
              <ReferenceLine
                y={controlLimits.lcl}
                stroke={chartColors.lclLine}
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: 'LCL',
                  position: 'right',
                  fill: chartColors.lclLine,
                  fontSize: 11,
                  fontWeight: 500,
                }}
              />
            )}

            {/* Data line */}
            <Line
              type="linear"
              dataKey="value"
              stroke={`url(#${lineGradientId})`}
              strokeWidth={2}
              dot={({ cx, cy, payload }) => {
                if (cx === undefined || cy === undefined) return null

                // Check both local and global highlight state using sample_id
                const arrayIndex = payload.index - (chartType === 'mr' ? 2 : 1) // Convert display index to array index
                // Local highlighting uses array index (from DualChartPanel local state)
                const isHighlightedLocal = highlightedIndex != null && arrayIndex === highlightedIndex
                // Global cross-chart highlighting using sample_id
                // For MR chart, only highlight if the "to" sample matches (not both from and to)
                // This ensures a single MR point is highlighted when hovering on X-bar
                const isHighlightedGlobal = hoveredSampleIds != null && hoveredSampleIds.has(payload.sample_id)
                const isHighlighted = isHighlightedLocal || isHighlightedGlobal
                const baseRadius = isHighlighted ? 6 : 4
                const fillColor = isHighlighted ? 'hsl(45, 100%, 50%)' : chartColors.normalPoint

                return (
                  <g key={payload.index}>
                    {isHighlighted && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={baseRadius + 3}
                        fill="none"
                        stroke="hsl(45, 100%, 50%)"
                        strokeWidth={2}
                        opacity={0.5}
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={baseRadius}
                      fill={fillColor}
                      stroke={isHighlighted ? 'hsl(35, 100%, 45%)' : undefined}
                      strokeWidth={isHighlighted ? 1.5 : 0}
                    />
                  </g>
                )
              }}
              activeDot={{ r: 5 }}
            />

            {/* Range slider (Brush) for viewport zoom */}
            {showBrush && data.length > 10 && (
              <Brush
                dataKey={xAxisMode === 'timestamp' ? 'timestampMs' : 'index'}
                height={30}
                stroke="hsl(var(--primary))"
                fill="hsl(var(--muted))"
                tickFormatter={xAxisMode === 'timestamp' ? formatTimeTick : (v: string | number) => `#${v}`}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default RangeChart
