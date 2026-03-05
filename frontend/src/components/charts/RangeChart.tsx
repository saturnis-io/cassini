/**
 * RangeChart - Secondary chart showing Range values for X-bar R charts.
 * Designed to be displayed below an X-bar chart in DualChartPanel.
 */

import { useMemo, useEffect, useCallback, useRef } from 'react'
import { graphic } from '@/lib/echarts'
import type { RenderItemParams, RenderItemAPI } from '@/lib/echarts'
import { useECharts } from '@/hooks/useECharts'
import type { EChartsMouseEvent, EChartsDataZoomEvent } from '@/hooks/useECharts'
import { useChartData } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useChartColors } from '@/hooks/useChartColors'
import { SPC_CONSTANTS, getSPCConstant } from '@/types/charts'
import { useChartHoverSync } from '@/contexts/ChartHoverContext'
import { formatDisplayKey } from '@/lib/display-key'
import { useDateFormat } from '@/hooks/useDateFormat'
import { applyFormat } from '@/lib/date-format'

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

interface RangeDataPoint {
  index: number
  value: number
  displayKey: string
  timestamp: string
  timestampMs: number
  hasViolation: boolean
  sample_id: number
  sample_id_from: number | null
  // Enriched fields for informative tooltips
  mean: number
  previousMean: number | null
  actual_n: number
}

export function RangeChart({
  characteristicId,
  chartOptions,
  chartType = 'range',
  colorScheme = 'primary',
  onHoverIndex,
  highlightedIndex,
}: RangeChartProps) {
  const { data: chartData, isLoading } = useChartData(
    characteristicId,
    chartOptions ?? { limit: 50 },
  )
  const chartColors = useChartColors()
  const { axisFormats } = useDateFormat()
  const xAxisMode = useDashboardStore((state) => state.xAxisMode)
  const rangeWindow = useDashboardStore((state) => state.rangeWindow)
  const showBrush = useDashboardStore((state) => state.showBrush)

  // Cross-chart hover sync using sample IDs
  const { hoveredSampleIds, onHoverSample, onLeaveSample } = useChartHoverSync(characteristicId)

  // Calculate range/stddev values and control limits
  const { data, controlLimits, chartLabel, yAxisLabel } = useMemo(() => {
    if (!chartData?.data_points?.length) {
      return {
        data: [] as RangeDataPoint[],
        controlLimits: {
          ucl: null as number | null,
          lcl: null as number | null,
          cl: null as number | null,
        },
        chartLabel: '',
        yAxisLabel: '',
      }
    }

    const points = chartData.data_points
    const n = chartData.nominal_subgroup_size

    let values: number[] = []
    let label = ''
    let yLabel = ''

    if (chartType === 'range') {
      values = points.map((p) => p.range ?? 0)
      label = 'Range Chart'
      yLabel = 'Range'
    } else if (chartType === 'stddev') {
      values = points.map((p) => p.std_dev ?? 0)
      label = 'S Chart (Std Dev)'
      yLabel = 'Std Dev'
    } else if (chartType === 'mr') {
      values = []
      for (let i = 1; i < points.length; i++) {
        const mr = Math.abs(points[i].mean - points[i - 1].mean)
        values.push(mr)
      }
      label = 'Moving Range Chart'
      yLabel = 'MR'
    }

    let ucl: number | null = null
    let lcl: number | null = null
    let cl: number | null = null

    if (chartType === 'range' && values.length > 0) {
      const rBar = values.reduce((sum, v) => sum + v, 0) / values.length
      cl = rBar
      const D3 = getSPCConstant(SPC_CONSTANTS.D3, n) ?? 0
      const D4 = getSPCConstant(SPC_CONSTANTS.D4, n) ?? 3.267
      ucl = D4 * rBar
      lcl = D3 * rBar
    } else if (chartType === 'stddev' && values.length > 0) {
      const sBar = values.reduce((sum, v) => sum + v, 0) / values.length
      cl = sBar
      const B3 = getSPCConstant(SPC_CONSTANTS.B3, n) ?? 0
      const B4 = getSPCConstant(SPC_CONSTANTS.B4, n) ?? 3.267
      ucl = B4 * sBar
      lcl = B3 * sBar
    } else if (chartType === 'mr' && values.length > 0) {
      const mrBar = values.reduce((sum, v) => sum + v, 0) / values.length
      cl = mrBar
      ucl = 3.267 * mrBar
      lcl = 0
    }

    const chartPoints: RangeDataPoint[] = (chartType === 'mr' ? points.slice(1) : points).map(
      (point, index) => {
        if (chartType === 'mr') {
          const fromPoint = points[index]
          return {
            index: index + 2,
            value: values[index] ?? 0,
            displayKey: point.display_key || `#${index + 2}`,
            timestamp: new Date(point.timestamp).toLocaleTimeString(),
            timestampMs: new Date(point.timestamp).getTime(),
            hasViolation: false,
            sample_id: point.sample_id,
            sample_id_from: fromPoint.sample_id,
            mean: point.mean,
            previousMean: fromPoint.mean,
            actual_n: point.actual_n,
          }
        } else {
          return {
            index: index + 1,
            value: values[index] ?? 0,
            displayKey: point.display_key || `#${index + 1}`,
            timestamp: new Date(point.timestamp).toLocaleTimeString(),
            timestampMs: new Date(point.timestamp).getTime(),
            hasViolation: false,
            sample_id: point.sample_id,
            sample_id_from: null,
            mean: point.mean,
            previousMean: null,
            actual_n: point.actual_n,
          }
        }
      },
    )

    return {
      data: chartPoints,
      controlLimits: { ucl, lcl, cl },
      chartLabel: label,
      yAxisLabel: yLabel,
    }
  }, [chartData, chartType])

  // Store setter for dataZoom-driven range updates
  const setRangeWindow = useDashboardStore((state) => state.setRangeWindow)

  const lineColors = useMemo(
    () =>
      colorScheme === 'secondary'
        ? {
            start: chartColors.secondaryLineGradientStart,
            end: chartColors.secondaryLineGradientEnd,
          }
        : { start: chartColors.lineGradientStart, end: chartColors.lineGradientEnd },
    [colorScheme, chartColors],
  )

  // Store data in ref for event handlers
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // --- ECharts option builder ---
  const echartsOption = useMemo(() => {
    if (!data.length) return null

    const isTimestamp = xAxisMode === 'timestamp'

    // Time range for adaptive formatting
    const dataTimeRangeMs =
      data.length > 1 ? data[data.length - 1].timestampMs - data[0].timestampMs : 0

    // Detect whether the time axis is usable: if all timestamps collapse into < 1s,
    // fall back to evenly-spaced category mode with timestamp labels.
    const useTimeCoords = isTimestamp && dataTimeRangeMs >= 1000

    // Calculate Y-axis domain (use full data for stable domain during sliding)
    const allValues = data.map((d) => d.value)
    const minVal = Math.min(...allValues, controlLimits.lcl ?? 0)
    const maxVal = Math.max(...allValues, controlLimits.ucl ?? 0)
    const padding = (maxVal - minVal) * 0.2 || 1
    const yMin = Math.max(0, minVal - padding)
    const yMax = maxVal + padding

    const decimalPrecision = chartData?.decimal_precision ?? 3
    const formatVal = (value: number) => value.toFixed(decimalPrecision)

    // Control limit lines rendered as separate series to bypass ECharts
    // markLine yAxis rendering bug (lines snap to series mean).
    const controlLimitSeries: Record<string, unknown>[] = []

    if (controlLimits.ucl != null) {
      const uclData = useTimeCoords
        ? data.map((p) => [p.timestampMs, controlLimits.ucl])
        : data.map(() => controlLimits.ucl)
      controlLimitSeries.push({
        type: 'line',
        data: uclData,
        lineStyle: { color: chartColors.uclLine, type: [6, 3], width: 1.5 },
        symbol: 'none',
        showSymbol: false,
        silent: true,
        z: 4,
        endLabel: {
          show: true,
          formatter: `UCL: ${formatVal(controlLimits.ucl)}`,
          color: chartColors.uclLine,
          fontSize: 11,
          fontWeight: 500,
        },
      })
    }
    if (controlLimits.cl != null) {
      const clData = useTimeCoords
        ? data.map((p) => [p.timestampMs, controlLimits.cl])
        : data.map(() => controlLimits.cl)
      controlLimitSeries.push({
        type: 'line',
        data: clData,
        lineStyle: { color: chartColors.centerLine, width: 2 },
        symbol: 'none',
        showSymbol: false,
        silent: true,
        z: 4,
        endLabel: {
          show: true,
          formatter: `CL: ${formatVal(controlLimits.cl)}`,
          color: chartColors.centerLine,
          fontSize: 11,
          fontWeight: 600,
        },
      })
    }
    if (controlLimits.lcl != null && controlLimits.lcl > 0) {
      const lclData = useTimeCoords
        ? data.map((p) => [p.timestampMs, controlLimits.lcl])
        : data.map(() => controlLimits.lcl)
      controlLimitSeries.push({
        type: 'line',
        data: lclData,
        lineStyle: { color: chartColors.lclLine, type: [6, 3], width: 1.5 },
        symbol: 'none',
        showSymbol: false,
        silent: true,
        z: 4,
        endLabel: {
          show: true,
          formatter: `LCL: ${formatVal(controlLimits.lcl)}`,
          color: chartColors.lclLine,
          fontSize: 11,
          fontWeight: 500,
        },
      })
    }

    // Build markArea for out-of-control zone above UCL
    const markAreaData: [Record<string, unknown>, Record<string, unknown>][] = []
    if (controlLimits.ucl != null) {
      markAreaData.push([
        { yAxis: controlLimits.ucl, itemStyle: { color: chartColors.outOfControl, opacity: 0.15 } },
        { yAxis: yMax },
      ])
    }

    // Custom series renderItem for data point symbols with highlighting
    const localData = data
    const localChartColors = chartColors
    const localHoveredSampleIds = hoveredSampleIds
    const localHighlightedIndex = highlightedIndex

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customRenderItem = (_params: RenderItemParams, api: RenderItemAPI) => {
      const arrIndex = api.value(2) as number
      if (arrIndex < 0 || arrIndex >= localData.length) return { type: 'group', children: [] }
      const point = localData[arrIndex]

      // Use dimensions 0,1 (x,y) directly for pixel mapping — guarantees dots align with line
      const coord = api.coord([api.value(0), api.value(1)])
      const cx = coord[0]
      const cy = coord[1]

      const arrayIndex = point.index - (chartType === 'mr' ? 2 : 1)
      const isHighlightedLocal =
        localHighlightedIndex != null && arrayIndex === localHighlightedIndex
      const isHighlightedGlobal =
        localHoveredSampleIds != null && localHoveredSampleIds.has(point.sample_id)
      const isHighlighted = isHighlightedLocal || isHighlightedGlobal
      const baseRadius = isHighlighted ? 6 : 4
      const fillColor = isHighlighted ? 'hsl(45, 100%, 50%)' : localChartColors.normalPoint

      const children: Record<string, unknown>[] = []

      if (isHighlighted) {
        children.push({
          type: 'circle',
          shape: { cx, cy, r: baseRadius + 3 },
          style: { fill: 'none', stroke: 'hsl(45, 100%, 50%)', lineWidth: 2, opacity: 0.5 },
        })
      }

      children.push({
        type: 'circle',
        shape: { cx, cy, r: baseRadius },
        style: {
          fill: fillColor,
          stroke: isHighlighted ? 'hsl(35, 100%, 45%)' : undefined,
          lineWidth: isHighlighted ? 1.5 : 0,
        },
      })

      return { type: 'group', children }
    }

    // Compute dataZoom range from rangeWindow (accounting for MR offset).
    // Only include start/end when a range is actively set so ECharts
    // preserves its internal zoom state for mouse-wheel interactions.
    let dataZoomStartEnd: { start: number; end: number } | Record<string, never> = {}
    if (showBrush && rangeWindow) {
      let localStart: number
      let localEnd: number
      if (chartType === 'mr') {
        localStart = Math.max(0, rangeWindow[0] - 1)
        localEnd = Math.min(data.length - 1, rangeWindow[1] - 1)
      } else {
        localStart = rangeWindow[0]
        localEnd = rangeWindow[1]
      }
      dataZoomStartEnd = {
        start: (localStart / Math.max(data.length - 1, 1)) * 100,
        end: (localEnd / Math.max(data.length - 1, 1)) * 100,
      }
    }

    const bottomMargin = 60
    const xCategoryData = data.map((p) => formatDisplayKey(p.displayKey))

    // Build xAxis config based on mode
    // Use 'time' axis for proper time-series rendering (auto-ticks, date formatting).
    // Falls back to category when timestamps are too close together (< 1s spread).
    const xAxisConfig = useTimeCoords
      ? {
          type: 'time' as const,
          axisLabel: {
            fontSize: 11,
            rotate: 30,
            formatter: (value: number) => {
              const d = new Date(value)
              if (dataTimeRangeMs > 86400000 * 30) {
                return applyFormat(d, axisFormats.short)
              } else if (dataTimeRangeMs > 86400000) {
                return applyFormat(d, axisFormats.medium)
              }
              return applyFormat(d, axisFormats.timeOnly)
            },
          },
          splitLine: { show: false },
        }
      : {
          type: 'category' as const,
          boundaryGap: false,
          data: isTimestamp
            ? data.map((p) => p.timestamp)
            : xCategoryData,
          axisLabel: { fontSize: 11, rotate: 30 },
          splitLine: { show: false },
        }

    return {
      animation: false,
      grid: { top: 10, right: 120, left: 60, bottom: bottomMargin, containLabel: false },
      xAxis: xAxisConfig,
      yAxis: {
        type: 'value' as const,
        min: yMin,
        max: yMax,
        axisLabel: { fontSize: 12, width: 50, align: 'right' as const, formatter: (value: number) => value.toFixed(decimalPrecision) },
        name: yAxisLabel,
        nameLocation: 'middle' as const,
        nameGap: 45,
        nameTextStyle: { fontSize: 12 },
        splitLine: { lineStyle: { type: 'dashed' as const, opacity: 0.3 } },
      },
      tooltip: {
        trigger: 'item' as const,
        appendTo: () => document.body,
        transitionDuration: 0,
        extraCssText: 'transition: none !important;',
        formatter: (params: unknown) => {
          const p = params as { dataIndex: number; seriesType: string }
          if (p.seriesType === 'line') return ''
          const point = localData[p.dataIndex]
          if (!point) return ''

          const clVal = controlLimits.cl
          const dim = 'style="opacity:0.6;font-size:11px"'

          if (chartType === 'mr') {
            // Moving Range: show both individual values and their difference
            const prevLabel = point.previousMean != null ? formatVal(point.previousMean) : '—'
            return (
              `<div style="font-size:13px;font-weight:500">Sample ${formatDisplayKey(point.displayKey)}</div>` +
              `<div>Current X = ${formatVal(point.mean)}</div>` +
              `<div>Previous X = ${prevLabel}</div>` +
              `<div>MR = |Δ| = ${formatVal(point.value)}</div>` +
              (clVal != null ? `<div ${dim}>MR̄ = ${formatVal(clVal)}</div>` : '') +
              `<div ${dim}>${point.timestamp}</div>`
            )
          }

          if (chartType === 'stddev') {
            // S Chart: show subgroup size, X-bar, S, and S-bar
            return (
              `<div style="font-size:13px;font-weight:500">Sample ${formatDisplayKey(point.displayKey)}` +
              `<span ${dim}>&ensp;(n=${point.actual_n})</span></div>` +
              `<div>X̄ = ${formatVal(point.mean)}</div>` +
              `<div>S = ${formatVal(point.value)}</div>` +
              (clVal != null ? `<div ${dim}>S̄ = ${formatVal(clVal)}</div>` : '') +
              `<div ${dim}>${point.timestamp}</div>`
            )
          }

          // Range Chart: show subgroup size, X-bar, Range, and R-bar
          return (
            `<div style="font-size:13px;font-weight:500">Sample ${formatDisplayKey(point.displayKey)}` +
            `<span ${dim}>&ensp;(n=${point.actual_n})</span></div>` +
            `<div>X̄ = ${formatVal(point.mean)}</div>` +
            `<div>Range = ${formatVal(point.value)}</div>` +
            (clVal != null ? `<div ${dim}>R̄ = ${formatVal(clVal)}</div>` : '') +
            `<div ${dim}>${point.timestamp}</div>`
          )
        },
      },
      dataZoom: [
        {
          type: 'inside' as const,
          ...dataZoomStartEnd,
          minSpan: Math.max((2 / data.length) * 100, 0.5),
          zoomOnMouseWheel: true,
          moveOnMouseWheel: 'shift' as const,
          moveOnMouseMove: false,
          preventDefaultMouseMove: true,
        },
      ],
      series: [
        {
          type: 'line',
          data: useTimeCoords ? data.map((p) => [p.timestampMs, p.value]) : data.map((p) => p.value),
          lineStyle: {
            width: 2,
            color: new graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: lineColors.start },
              { offset: 1, color: lineColors.end },
            ]),
          },
          symbol: 'none',
          showSymbol: false,
          silent: true,
          markArea: { silent: true, data: markAreaData as never[] },
          z: 5,
        },
        ...controlLimitSeries,
        {
          type: 'custom',
          data: data.map((p, i) => {
            const xVal = useTimeCoords ? p.timestampMs : i
            return [xVal, p.value, i]
          }),
          renderItem: customRenderItem,
          coordinateSystem: 'cartesian2d',
          encode: { x: 0, y: 1 },
          z: 10,
          silent: false,
        },
      ],
    }
  }, [
    data,
    xAxisMode,
    chartColors,
    lineColors,
    controlLimits,
    chartData?.decimal_precision,
    yAxisLabel,
    chartType,
    hoveredSampleIds,
    highlightedIndex,
    rangeWindow,
    showBrush,
    axisFormats,
  ])

  // Mouse event handlers
  const handleMouseMove = useCallback(
    (params: EChartsMouseEvent) => {
      const idx = params.dataIndex
      const point = dataRef.current[idx]
      if (point) {
        onHoverSample(point.sample_id)
        onHoverIndex?.(idx)
      }
    },
    [onHoverSample, onHoverIndex],
  )

  const handleMouseOut = useCallback(() => {
    onLeaveSample()
    onHoverIndex?.(null)
  }, [onLeaveSample, onHoverIndex])

  // DataZoom handler: maps zoom percentages back to rangeWindow indices
  const handleDataZoom = useCallback(
    (params: EChartsDataZoomEvent) => {
      const totalPoints = dataRef.current.length
      if (totalPoints <= 1) return

      let newStart = Math.round((params.start / 100) * (totalPoints - 1))
      let newEnd = Math.round((params.end / 100) * (totalPoints - 1))

      // Convert MR indices back to main chart indices
      if (chartType === 'mr') {
        newStart = newStart + 1
        newEnd = newEnd + 1
      }

      // Zoomed all the way out → clear range
      if (newStart <= 0 && newEnd >= totalPoints - (chartType === 'mr' ? 0 : 1)) {
        setRangeWindow(null)
        return
      }

      const store = useDashboardStore.getState()
      if (!store.showBrush) {
        useDashboardStore.setState({ showBrush: true, rangeWindow: [newStart, newEnd] })
      } else {
        setRangeWindow([newStart, newEnd])
      }
    },
    [setRangeWindow, chartType],
  )

  const { containerRef, chartRef, refresh } = useECharts({
    option: echartsOption,
    replaceMerge: ['series'],
    onMouseMove: handleMouseMove,
    onMouseOut: handleMouseOut,
    onDataZoom: handleDataZoom,
  })

  const chartWrapperRef = useRef<HTMLDivElement>(null)

  // Refresh on theme color changes
  useEffect(() => {
    refresh()
  }, [chartColors, refresh])

  const hasData = data.length > 0

  return (
    <div className="bg-card border-border flex h-full flex-col rounded-2xl border p-5">
      {/* Header */}
      {hasData && (
        <div className="mb-4 flex h-5 flex-shrink-0 items-center justify-between">
          <h3 className="text-sm leading-5 font-semibold">{chartLabel}</h3>
        </div>
      )}

      {/* Chart container — ALWAYS rendered so useECharts can init */}
      <div ref={chartWrapperRef} className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ visibility: hasData ? 'visible' : 'hidden' }}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground text-sm">Loading...</div>
          </div>
        )}
        {!isLoading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground text-sm">No data available</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default RangeChart
