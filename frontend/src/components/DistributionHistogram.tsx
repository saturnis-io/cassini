import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { graphic } from '@/lib/echarts'
import type { RenderItemParams, RenderItemAPI } from '@/lib/echarts'
import { useECharts } from '@/hooks/useECharts'
import type { EChartsMouseEvent } from '@/hooks/useECharts'
import { Info, X } from 'lucide-react'
import { useChartData, useCapability } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { cn } from '@/lib/utils'
import { useChartColors } from '@/hooks/useChartColors'
import { useChartHoverSync } from '@/stores/chartHoverStore'
import { Explainable } from '@/components/Explainable'
import {
  calculateHistogramBins,
  calculateStatistics,
  addNormalCurve,
  type HistogramBin,
} from '@/lib/histogram-utils'

interface DistributionHistogramProps {
  characteristicId: number
  orientation?: 'horizontal' | 'vertical'
  label?: 'Primary' | 'Secondary'
  colorScheme?: 'primary' | 'secondary'
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
  yAxisDomain?: [number, number]
  highlightedValue?: number | null
  onHoverBin?: (range: [number, number] | null) => void
  /** Whether to show spec limit lines (LSL/USL). Default: true */
  showSpecLimits?: boolean
  /** Override the grid.bottom value in vertical mode (for alignment with adjacent charts) */
  gridBottom?: number
  /** Override the grid.top value in vertical mode (for alignment with adjacent charts) */
  gridTop?: number
}

interface DataPointWithId {
  value: number
  sample_id: number
}

const colorSchemes = {
  primary: {
    barColor: 'hsl(212, 100%, 30%)',
    barHighlight: 'hsl(45, 100%, 50%)',
    barStroke: 'hsl(212, 100%, 28%)',
    normalStroke: 'hsl(179, 50%, 55%)',
    normalFill: 'hsl(179, 50%, 59%)',
    meanColor: 'hsl(212, 100%, 30%)',
    meanTextColor: 'hsl(212, 100%, 28%)',
  },
  secondary: {
    barColor: 'hsl(241, 33%, 60%)',
    barHighlight: 'hsl(45, 100%, 50%)',
    barStroke: 'hsl(241, 33%, 50%)',
    normalStroke: 'hsl(179, 50%, 59%)',
    normalFill: 'hsl(179, 50%, 55%)',
    meanColor: 'hsl(241, 33%, 60%)',
    meanTextColor: 'hsl(241, 33%, 50%)',
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
  showSpecLimits = true,
  gridBottom,
  gridTop,
}: DistributionHistogramProps) {
  const { data: chartData, isLoading } = useChartData(
    characteristicId,
    chartOptions ?? { limit: 100 },
  )
  const chartColors = useChartColors()
  const colors = colorSchemes[colorScheme]
  const isVertical = orientation === 'vertical'
  const rangeWindow = useDashboardStore((state) => state.rangeWindow)
  const showBrush = useDashboardStore((state) => state.showBrush)

  // Cross-chart hover sync using sample IDs
  const { hoveredSampleIds, onHoverSample, onLeaveSample } = useChartHoverSync(characteristicId)

  const isModeA = chartData?.subgroup_mode === 'STANDARDIZED'
  const shortRunMode = chartData?.short_run_mode ?? null
  const isZScale = isModeA || shortRunMode === 'standardized'

  // Memoize all heavy histogram calculations, applying rangeWindow to slice data
  const { values, stats, bins } = useMemo(() => {
    if (!chartData?.data_points?.length) {
      return {
        values: [] as number[],
        stats: { mean: 0, stdDev: 0, n: 0 },
        bins: [] as HistogramBin[],
      }
    }

    // Apply range window to slice data points before computing histogram
    let dataPoints = chartData.data_points
    if (showBrush && rangeWindow) {
      const [start, end] = rangeWindow
      dataPoints = dataPoints.slice(start, end + 1)
    }

    const dp: DataPointWithId[] = dataPoints
      .filter((p) => !p.excluded)
      .filter((p) => !isModeA || p.z_score != null)
      .flatMap((p) => {
        if (isZScale) {
          // Mode A / short-run standardized: z-scores are per-subgroup, use as-is
          return [{ value: p.display_value ?? p.z_score!, sample_id: p.sample_id }]
        }
        // Normal mode: flatten individual measurements for true process distribution
        if (p.measurements && p.measurements.length > 0) {
          return p.measurements.map((m) => ({ value: m, sample_id: p.sample_id }))
        }
        // Fallback for data without measurements field
        return [{ value: p.mean, sample_id: p.sample_id }]
      })

    const vals = dp.map((p) => p.value)
    const s = calculateStatistics(vals)

    let b = calculateHistogramBins(dp)
    const bw = b.length > 1 ? b[1].binCenter - b[0].binCenter : 1
    b = addNormalCurve(b, s.mean, s.stdDev, vals.length, bw)

    return { values: vals, stats: s, bins: b }
  }, [chartData, isModeA, isZScale, rangeWindow, showBrush])

  // Memoize highlighted bin index
  const highlightedBinIndex = useMemo(() => {
    if (hoveredSampleIds && hoveredSampleIds.size > 0) {
      const index = bins.findIndex((bin) => bin.sampleIds.some((id) => hoveredSampleIds.has(id)))
      if (index !== -1) return index
    }
    if (highlightedValue != null) {
      return bins.findIndex(
        (bin) => highlightedValue >= bin.binStart && highlightedValue < bin.binEnd,
      )
    }
    return -1
  }, [bins, hoveredSampleIds, highlightedValue])

  // Store bins in ref for event handlers
  const binsRef = useRef(bins)
  useEffect(() => {
    binsRef.current = bins
  }, [bins])

  const hasData = !!chartData && chartData.data_points.length > 0

  // Click-toggle for the stats popover (replaces hover-only behavior)
  const [statsOpen, setStatsOpen] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!statsOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (statsRef.current && !statsRef.current.contains(e.target as Node)) {
        setStatsOpen(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setStatsOpen(false)
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [statsOpen])

  // Capability indices — fetched from capability endpoint (Mode 2) to match SYW explain API
  const { data: capability } = useCapability(characteristicId)
  const storedSigma = (hasData && chartData?.stored_sigma) ? chartData.stored_sigma : null
  const cp = (!isZScale && capability?.cp) ? capability.cp : 0
  const cpk = (!isZScale && capability?.cpk) ? capability.cpk : 0
  const ppk = (!isZScale && capability?.ppk) ? capability.ppk : 0

  // --- ECharts option builder ---
  const echartsOption = useMemo(() => {
    if (!chartData || chartData.data_points.length === 0 || bins.length === 0) return null

    const { spec_limits, control_limits, decimal_precision: dp = 3 } = chartData

    const usl = isZScale ? null : spec_limits.usl
    const lsl = isZScale ? null : spec_limits.lsl
    const ucl = isModeA ? 3 : control_limits.ucl
    const lcl = isModeA ? -3 : control_limits.lcl
    const centerLine = isModeA ? 0 : control_limits.center_line

    // Domain
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

    const maxCount = Math.max(...bins.map((b) => b.count), ...bins.map((b) => b.normalY))

    // Build bar data with per-item colors for highlighting
    const barData = bins.map((bin, i) => ({
      value: isVertical ? [bin.count, bin.binCenter] : [bin.binCenter, bin.count],
      itemStyle: {
        color:
          i === highlightedBinIndex
            ? new graphic.LinearGradient(0, 0, isVertical ? 1 : 0, isVertical ? 0 : 1, [
                { offset: 0, color: 'hsl(45, 100%, 55%)' },
                { offset: 1, color: 'hsl(35, 100%, 50%)' },
              ])
            : new graphic.LinearGradient(0, 0, isVertical ? 1 : 0, isVertical ? 0 : 1, [
                { offset: 0, color: colors.barColor },
                { offset: 1, color: colors.barColor },
              ]),
        opacity: i === highlightedBinIndex ? 1 : 0.7,
        borderColor: i === highlightedBinIndex ? 'hsl(35, 100%, 45%)' : colors.barStroke,
        borderWidth: i === highlightedBinIndex ? 2 : 0.5,
      },
    }))

    // Normal curve data
    const normalData = bins.map((bin) =>
      isVertical ? [bin.normalY, bin.binCenter] : [bin.binCenter, bin.normalY],
    )

    // Build markLine for reference lines
    const markLineData: Record<string, unknown>[] = []

    // Mean line
    if (isVertical) {
      markLineData.push({
        yAxis: stats.mean,
        lineStyle: { color: colors.meanColor, type: 'dashed', width: 1.5 },
        label: { show: false },
      })
    } else {
      markLineData.push({
        xAxis: stats.mean,
        lineStyle: { color: colors.meanColor, type: 'dashed', width: 2 },
        label: {
          formatter: `x\u0304 = ${stats.mean.toFixed(3)}`,
          position: 'start',
          color: colors.meanTextColor,
          fontSize: 11,
          fontWeight: 600,
        },
      })
    }

    // Spec limits (respect showSpecLimits toggle)
    if (showSpecLimits && lsl !== null) {
      if (isVertical) {
        markLineData.push({
          yAxis: lsl,
          lineStyle: { color: 'hsl(357, 80%, 52%)', width: 1.5 },
          label: { formatter: `LSL\n${lsl.toFixed(dp)}`, position: 'end', fontSize: 8, color: 'hsl(357, 80%, 45%)' },
        })
      } else {
        markLineData.push({
          xAxis: lsl,
          lineStyle: { color: 'hsl(357, 80%, 52%)', width: 2 },
          label: {
            formatter: 'LSL',
            position: 'insideStartTop',
            fontSize: 10,
            fontWeight: 600,
            color: 'hsl(357, 80%, 45%)',
          },
        })
      }
    }
    if (showSpecLimits && usl !== null) {
      if (isVertical) {
        markLineData.push({
          yAxis: usl,
          lineStyle: { color: 'hsl(357, 80%, 52%)', width: 1.5 },
          label: { formatter: `USL\n${usl.toFixed(dp)}`, position: 'end', fontSize: 8, color: 'hsl(357, 80%, 45%)' },
        })
      } else {
        markLineData.push({
          xAxis: usl,
          lineStyle: { color: 'hsl(357, 80%, 52%)', width: 2 },
          label: {
            formatter: 'USL',
            position: 'insideEndTop',
            fontSize: 10,
            fontWeight: 600,
            color: 'hsl(357, 80%, 45%)',
          },
        })
      }
    }

    // Control limits
    if (lcl !== null) {
      if (isVertical) {
        markLineData.push({
          yAxis: lcl,
          lineStyle: { color: chartColors.lclLine, type: 'dashed', width: 1 },
          label: { formatter: `LCL\n${lcl.toFixed(dp)}`, position: 'end', fontSize: 8, color: chartColors.lclLine },
        })
      } else {
        markLineData.push({
          xAxis: lcl,
          lineStyle: { color: chartColors.lclLine, type: [6, 3] as unknown as string, width: 1.5 },
          label: {
            formatter: 'LCL',
            position: 'insideStartBottom',
            fontSize: 9,
            color: chartColors.lclLine,
          },
        })
      }
    }
    if (ucl !== null) {
      if (isVertical) {
        markLineData.push({
          yAxis: ucl,
          lineStyle: { color: chartColors.uclLine, type: 'dashed', width: 1 },
          label: { formatter: `UCL\n${ucl.toFixed(dp)}`, position: 'end', fontSize: 8, color: chartColors.uclLine },
        })
      } else {
        markLineData.push({
          xAxis: ucl,
          lineStyle: { color: chartColors.uclLine, type: [6, 3] as unknown as string, width: 1.5 },
          label: {
            formatter: 'UCL',
            position: 'insideEndBottom',
            fontSize: 9,
            color: chartColors.uclLine,
          },
        })
      }
    }
    if (centerLine !== null) {
      if (isVertical) {
        markLineData.push({
          yAxis: centerLine,
          lineStyle: { color: 'hsl(104, 55%, 40%)', type: 'dashed', width: 1 },
          label: { formatter: `CL\n${centerLine.toFixed(dp)}`, position: 'end', fontSize: 8, color: 'hsl(104, 55%, 35%)' },
        })
      } else {
        markLineData.push({
          xAxis: centerLine,
          lineStyle: { color: 'hsl(104, 55%, 40%)', type: 'dashed', width: 1.5 },
          label: {
            formatter: 'CL',
            position: 'insideBottom',
            fontSize: 9,
            color: 'hsl(104, 55%, 35%)',
          },
        })
      }
    }

    // Capability zone bands (only in vertical mode with spec limits)
    const markAreaData: Array<[Record<string, unknown>, Record<string, unknown>]> = []
    if (isVertical && showSpecLimits && lsl !== null && usl !== null) {
      // Green zone: between spec limits (capable region)
      markAreaData.push([
        { yAxis: lsl, itemStyle: { color: 'rgba(34, 197, 94, 0.08)' } },
        { yAxis: usl },
      ])
      // Red zone below LSL
      markAreaData.push([
        { yAxis: yAxisDomain ? yAxisDomain[0] : xMin, itemStyle: { color: 'rgba(239, 68, 68, 0.06)' } },
        { yAxis: lsl },
      ])
      // Red zone above USL
      markAreaData.push([
        { yAxis: usl, itemStyle: { color: 'rgba(239, 68, 68, 0.06)' } },
        { yAxis: yAxisDomain ? yAxisDomain[1] : xMax },
      ])
    }

    if (isVertical) {
      // Vertical layout: xAxis is count (horizontal), yAxis is value (vertical, aligned with X-bar chart)
      // Use custom series for horizontal bars since ECharts bar series defaults to vertical with two value axes
      const localBins = bins
      const localHighlight = highlightedBinIndex
      const localColors = colors

      // Match ControlChart grid margins for pixel-perfect Y-axis alignment
      const matchedGridTop = gridTop ?? 20

       
      const histogramRenderItem = (_params: RenderItemParams, api: RenderItemAPI) => {
        const binIndex = api.value(3) as number
        const count = api.value(0) as number
        const binStart = api.value(1) as number
        const binEnd = api.value(2) as number
        if (count === 0) return { type: 'group', children: [] } as unknown

        const topLeft = api.coord([0, binEnd])
        const bottomRight = api.coord([count, binStart])

        const isHighlight = binIndex === localHighlight
        const fillColor = isHighlight ? 'hsl(45, 100%, 55%)' : localColors.barColor
        const strokeColor = isHighlight ? 'hsl(35, 100%, 45%)' : localColors.barStroke

        const gap = 1
        return {
          type: 'rect',
          shape: {
            x: topLeft[0],
            y: topLeft[1] + gap,
            width: Math.max(0, bottomRight[0] - topLeft[0]),
            height: Math.max(0, bottomRight[1] - topLeft[1] - gap * 2),
          },
          style: {
            fill: fillColor,
            stroke: strokeColor,
            lineWidth: isHighlight ? 2 : 1,
            opacity: isHighlight ? 1 : 0.75,
          },
        } as unknown
      }

      return {
        animation: false,
        grid: {
          top: matchedGridTop,
          right: 30,
          left: 40,
          bottom: gridBottom ?? 60,
          containLabel: false,
        },
        xAxis: {
          type: 'value' as const,
          max: maxCount * 1.1,
          axisLabel: { fontSize: 10, formatter: (v: number) => Math.round(v).toString() },
        },
        yAxis: {
          type: 'value' as const,
          // Use function form to prevent ECharts nice-rounding of axis range
          min: () => yAxisDomain ? yAxisDomain[0] : xMin,
          max: () => yAxisDomain ? yAxisDomain[1] : xMax,
          axisLabel: { fontSize: 10, formatter: (v: number) => v.toFixed(dp) },
          splitLine: { show: false },
        },
        tooltip: {
          trigger: 'item' as const,
          transitionDuration: 0,
          extraCssText: 'transition: none !important;',
          position: (pt: number[]) => [pt[0] + 10, pt[1] - 10],
          formatter: (params: unknown) => {
            const p = params as { dataIndex: number; seriesType: string }
            if (p.seriesType !== 'custom') return ''
            const bin = localBins[p.dataIndex]
            if (!bin) return ''
            return (
              `<div style="font-weight:500">Range</div>` +
              `<div style="opacity:0.7">${bin.binStart.toFixed(dp)} - ${bin.binEnd.toFixed(dp)}</div>` +
              `<div style="margin-top:4px"><b>Count:</b> ${bin.count}</div>`
            )
          },
        },
        series: [
          // Normal curve as line (data is [normalY, binCenter])
          {
            type: 'line',
            data: normalData,
            lineStyle: { color: colors.normalStroke, width: 2 },
            symbol: 'none',
            showSymbol: false,
            silent: true,
            z: 3,
          },
          // Histogram bars via custom renderItem for horizontal rectangles
          {
            type: 'custom',
            data: localBins.map((bin, i) => [bin.count, bin.binStart, bin.binEnd, i]),
            renderItem: histogramRenderItem,
            encode: { x: 0, y: [1, 2] },
            z: 5,
          },
          // Invisible line series to carry markLine reference lines and markArea zone bands
          {
            type: 'line',
            data: [],
            markLine: { symbol: 'none', silent: true, precision: 10, data: markLineData as never[] },
            markArea: markAreaData.length > 0 ? { silent: true, data: markAreaData as never[] } : undefined,
            silent: true,
          },
        ],
      }
    }

    // Horizontal layout
    return {
      animation: false,
      grid: { top: 25, right: 45, left: 50, bottom: 30, containLabel: false },
      xAxis: {
        type: 'value' as const,
        min: xMin,
        max: xMax,
        axisLabel: { fontSize: 10, formatter: (v: number) => v.toFixed(dp) },
        splitLine: { lineStyle: { type: 'dashed' as const, opacity: 0.2 } },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 10 },
        splitLine: { show: false },
      },
      tooltip: {
        trigger: 'item' as const,
        transitionDuration: 0,
        extraCssText: 'transition: none !important;',
        position: (pt: number[]) => [pt[0] + 10, pt[1] - 10],
        formatter: (params: unknown) => {
          const p = params as { dataIndex: number; seriesType: string }
          if (p.seriesType !== 'bar') return ''
          const bin = bins[p.dataIndex]
          if (!bin) return ''
          return (
            `<div style="font-weight:500">Value Range</div>` +
            `<div style="opacity:0.7">${bin.binStart.toFixed(dp)} - ${bin.binEnd.toFixed(dp)}</div>` +
            `<div style="margin-top:6px"><b>Count:</b> ${bin.count}</div>`
          )
        },
      },
      series: [
        // Normal curve
        {
          type: 'line',
          data: normalData,
          lineStyle: { color: colors.normalStroke, width: 2.5 },
          symbol: 'none',
          showSymbol: false,
          silent: true,
          z: 3,
        },
        // Histogram bars
        {
          type: 'bar',
          data: barData,
          barWidth: '85%',
          markLine: { symbol: 'none', silent: true, precision: 10, data: markLineData as never[] },
          z: 5,
        },
      ],
    }
  }, [
    chartData,
    bins,
    values,
    stats,
    isModeA,
    isZScale,
    yAxisDomain,
    isVertical,
    colors,
    chartColors,
    highlightedBinIndex,
    showSpecLimits,
    gridBottom,
    gridTop,
  ])

  // Mouse event handlers
  const handleMouseMove = useCallback(
    (params: EChartsMouseEvent) => {
      const binIndex = params.dataIndex
      const bin = binsRef.current[binIndex]
      if (bin && bin.sampleIds.length > 0) {
        onHoverSample(bin.sampleIds)
        onHoverBin?.([bin.binStart, bin.binEnd])
      }
    },
    [onHoverSample, onHoverBin],
  )

  const handleMouseOut = useCallback(() => {
    onLeaveSample()
    onHoverBin?.(null)
  }, [onLeaveSample, onHoverBin])

  const { containerRef, refresh } = useECharts({
    option: echartsOption,
    notMerge: true,
    onMouseMove: handleMouseMove,
    onMouseOut: handleMouseOut,
  })

  // Refresh on theme color changes
  useEffect(() => {
    refresh()
  }, [chartColors, refresh])

  const getCapabilityStyle = (value: number) => {
    if (value >= 1.33) return 'stat-badge stat-badge-success'
    if (value >= 1.0) return 'stat-badge stat-badge-warning'
    return 'stat-badge stat-badge-danger'
  }

  if (isVertical) {
    return (
      <div data-ui="histogram-panel" className="bg-card border-border flex h-full flex-col rounded-2xl border p-5">
        {hasData && (
          <div data-ui="histogram-header" className="mb-4 flex h-5 flex-shrink-0 items-center justify-between">
            <h3 className="truncate text-sm leading-5 font-semibold">
              {label && <span className="text-muted-foreground mr-1">{label}:</span>}
              Capability
            </h3>
            <div className="flex items-center gap-2 text-sm leading-5">
              {cpk > 0 && (
                <Explainable metric="cpk" resourceId={characteristicId}>
                  <span
                    className={cn(
                      'font-medium',
                      cpk >= 1.33 ? 'text-success' : cpk >= 1.0 ? 'text-warning' : 'text-destructive',
                    )}
                  >
                    Cpk: {cpk.toFixed(2)}
                  </span>
                </Explainable>
              )}
              <span className="text-muted-foreground">n={stats.n}</span>
              <div ref={statsRef} className="relative">
                <button
                  onClick={() => setStatsOpen((v) => !v)}
                  className={cn(
                    'hover:bg-muted text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors',
                    statsOpen && 'bg-muted text-foreground',
                  )}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                {statsOpen && (
                  <div className="absolute top-full right-0 z-50 mt-1">
                    <div className="bg-popover border-border min-w-[160px] rounded-lg border p-3 text-xs shadow-lg">
                      <div className="text-foreground mb-2 flex items-center justify-between font-medium">
                        Process Statistics
                        <button
                          onClick={() => setStatsOpen(false)}
                          className="text-muted-foreground hover:text-foreground -mr-1 rounded p-0.5 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="text-muted-foreground space-y-1">
                        {cp > 0 && (
                          <div className="flex justify-between gap-3">
                            <span>Cp:</span>
                            <Explainable metric="cp" resourceId={characteristicId}>
                              <span
                                className={cn(
                                  'font-medium',
                                  cp >= 1.33
                                    ? 'text-success'
                                    : cp >= 1.0
                                      ? 'text-warning'
                                      : 'text-destructive',
                                )}
                              >
                                {cp.toFixed(3)}
                              </span>
                            </Explainable>
                          </div>
                        )}
                        {cpk > 0 && (
                          <div className="flex justify-between gap-3">
                            <span>Cpk:</span>
                            <Explainable metric="cpk" resourceId={characteristicId}>
                              <span
                                className={cn(
                                  'font-medium',
                                  cpk >= 1.33
                                    ? 'text-success'
                                    : cpk >= 1.0
                                      ? 'text-warning'
                                      : 'text-destructive',
                                )}
                              >
                                {cpk.toFixed(3)}
                              </span>
                            </Explainable>
                          </div>
                        )}
                        {ppk > 0 && (
                          <div className="flex justify-between gap-3">
                            <span>Ppk:</span>
                            <Explainable metric="ppk" resourceId={characteristicId}>
                              <span className="text-foreground font-medium">{ppk.toFixed(3)}</span>
                            </Explainable>
                          </div>
                        )}
                        <div className="border-border mt-1 flex justify-between gap-3 border-t pt-1">
                          <span>σ (process):</span>
                          {storedSigma != null ? (
                            <Explainable metric="sigma" resourceId={characteristicId} resourceType="control-limits">
                              <span className="text-foreground font-medium">
                                {storedSigma.toFixed(4)}
                              </span>
                            </Explainable>
                          ) : (
                            <span className="text-foreground font-medium">
                              {stats.stdDev.toFixed(4)}
                            </span>
                          )}
                        </div>
                        {storedSigma != null && Math.abs(storedSigma - stats.stdDev) > 0.0001 && (
                          <div className="flex justify-between gap-3">
                            <span>σ (overall):</span>
                            <span className="text-foreground font-medium">
                              {stats.stdDev.toFixed(4)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between gap-3">
                          <span>Mean:</span>
                          <span className="text-foreground font-medium">{stats.mean.toFixed(4)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Chart container — ALWAYS rendered so useECharts can init */}
        <div className="relative min-h-0 flex-1">
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
              <div className="text-muted-foreground text-sm">No data for capability analysis</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Horizontal orientation
  return (
    <div data-ui="histogram-panel" className="bg-card border-border h-full rounded-2xl border p-5">
      {hasData && (
        <div data-ui="histogram-header" className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight">
            {label && <span className="text-muted-foreground mr-1">{label}:</span>}
            Process Capability
          </h3>
          <div className="flex items-center gap-2">
            {cp > 0 && (
              <Explainable metric="cp" resourceId={characteristicId}>
                <span className={getCapabilityStyle(cp)}>Cp {cp.toFixed(2)}</span>
              </Explainable>
            )}
            {cpk > 0 && (
              <Explainable metric="cpk" resourceId={characteristicId}>
                <span className={getCapabilityStyle(cpk)}>Cpk {cpk.toFixed(2)}</span>
              </Explainable>
            )}
            {ppk > 0 && (
              <Explainable metric="ppk" resourceId={characteristicId}>
                <span className="stat-badge bg-muted text-muted-foreground">
                  Ppk {ppk.toFixed(2)}
                </span>
              </Explainable>
            )}
            <span className="text-muted-foreground ml-2 text-xs">n={stats.n}</span>
          </div>
        </div>
      )}

      {/* Chart container — ALWAYS rendered so useECharts can init */}
      <div className={cn(hasData ? 'h-[85%]' : 'h-full', 'relative')}>
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
            <div className="text-muted-foreground text-sm">No data for capability analysis</div>
          </div>
        )}
      </div>
    </div>
  )
}
