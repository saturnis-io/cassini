import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { graphic } from '@/lib/echarts'
import { useECharts } from '@/hooks/useECharts'
import type { EChartsMouseEvent } from '@/hooks/useECharts'
import { Info } from 'lucide-react'
import { useChartData } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { cn } from '@/lib/utils'
import { getStoredChartColors, type ChartColors } from '@/lib/theme-presets'
import { useChartHoverSync } from '@/contexts/ChartHoverContext'

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
  sampleIds: number[]
}

function calculateHistogramBins(dataPoints: DataPointWithId[], binCount: number = 20): HistogramBin[] {
  if (dataPoints.length === 0) return []

  const values = dataPoints.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  let range = max - min

  if (range === 0) {
    range = Math.abs(min) * 0.01 || 1
  }

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

function normalPDF(x: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0
  const coefficient = 1 / (stdDev * Math.sqrt(2 * Math.PI))
  const exponent = -0.5 * Math.pow((x - mean) / stdDev, 2)
  return coefficient * Math.exp(exponent)
}

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

// Hook to subscribe to chart color changes (for theme refresh)
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
}: DistributionHistogramProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, chartOptions ?? { limit: 100 })
  const chartColors = useChartColors()
  const colors = colorSchemes[colorScheme]
  const isVertical = orientation === 'vertical'
  const rangeWindow = useDashboardStore((state) => state.rangeWindow)
  const showBrush = useDashboardStore((state) => state.showBrush)
  const xAxisMode = useDashboardStore((state) => state.xAxisMode)

  // Cross-chart hover sync using sample IDs
  const { hoveredSampleIds, onHoverSample, onLeaveSample } = useChartHoverSync(characteristicId)

  const isModeA = chartData?.subgroup_mode === 'STANDARDIZED'

  // Memoize all heavy histogram calculations, applying rangeWindow to slice data
  const { values, stats, bins } = useMemo(() => {
    if (!chartData?.data_points?.length) {
      return { values: [] as number[], stats: { mean: 0, stdDev: 0, n: 0 }, bins: [] as HistogramBin[] }
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
      .map((p) => ({
        value: isModeA ? p.z_score! : p.mean,
        sample_id: p.sample_id,
      }))

    const vals = dp.map(p => p.value)
    const s = calculateStatistics(vals)

    let b = calculateHistogramBins(dp)
    const bw = b.length > 1 ? b[1].binCenter - b[0].binCenter : 1
    b = addNormalCurve(b, s.mean, s.stdDev, vals.length, bw)

    return { values: vals, stats: s, bins: b }
  }, [chartData, isModeA, rangeWindow, showBrush])

  // Memoize highlighted bin index
  const highlightedBinIndex = useMemo(() => {
    if (hoveredSampleIds && hoveredSampleIds.size > 0) {
      const index = bins.findIndex(bin =>
        bin.sampleIds.some(id => hoveredSampleIds.has(id))
      )
      if (index !== -1) return index
    }
    if (highlightedValue != null) {
      return bins.findIndex(bin =>
        highlightedValue >= bin.binStart && highlightedValue < bin.binEnd
      )
    }
    return -1
  }, [bins, hoveredSampleIds, highlightedValue])

  // Store bins in ref for event handlers
  const binsRef = useRef(bins)
  useEffect(() => {
    binsRef.current = bins
  }, [bins])

  // --- ECharts option builder ---
  const echartsOption = useMemo(() => {
    if (!chartData || chartData.data_points.length === 0 || bins.length === 0) return null

    const { spec_limits, control_limits, decimal_precision: dp = 3 } = chartData

    const usl = isModeA ? null : spec_limits.usl
    const lsl = isModeA ? null : spec_limits.lsl
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
        color: i === highlightedBinIndex
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
      isVertical ? [bin.normalY, bin.binCenter] : [bin.binCenter, bin.normalY]
    )

    // Build markLine for reference lines
    const markLineData: Record<string, unknown>[] = []

    // Mean line
    if (isVertical) {
      markLineData.push({ yAxis: stats.mean, lineStyle: { color: colors.meanColor, type: 'dashed', width: 1.5 }, label: { show: false } })
    } else {
      markLineData.push({ xAxis: stats.mean, lineStyle: { color: colors.meanColor, type: 'dashed', width: 2 }, label: { formatter: `x\u0304 = ${stats.mean.toFixed(3)}`, position: 'start', color: colors.meanTextColor, fontSize: 11, fontWeight: 600 } })
    }

    // Spec limits (respect showSpecLimits toggle)
    if (showSpecLimits && lsl !== null) {
      if (isVertical) {
        markLineData.push({ yAxis: lsl, lineStyle: { color: 'hsl(357, 80%, 52%)', width: 1.5 }, label: { formatter: 'LSL', position: 'end', fontSize: 8, color: 'hsl(357, 80%, 45%)' } })
      } else {
        markLineData.push({ xAxis: lsl, lineStyle: { color: 'hsl(357, 80%, 52%)', width: 2 }, label: { formatter: 'LSL', position: 'insideStartTop', fontSize: 10, fontWeight: 600, color: 'hsl(357, 80%, 45%)' } })
      }
    }
    if (showSpecLimits && usl !== null) {
      if (isVertical) {
        markLineData.push({ yAxis: usl, lineStyle: { color: 'hsl(357, 80%, 52%)', width: 1.5 }, label: { formatter: 'USL', position: 'end', fontSize: 8, color: 'hsl(357, 80%, 45%)' } })
      } else {
        markLineData.push({ xAxis: usl, lineStyle: { color: 'hsl(357, 80%, 52%)', width: 2 }, label: { formatter: 'USL', position: 'insideEndTop', fontSize: 10, fontWeight: 600, color: 'hsl(357, 80%, 45%)' } })
      }
    }

    // Control limits
    if (lcl !== null) {
      if (isVertical) {
        markLineData.push({ yAxis: lcl, lineStyle: { color: 'hsl(179, 50%, 59%)', type: 'dashed', width: 1 }, label: { formatter: 'LCL', position: 'end', fontSize: 8, color: 'hsl(179, 50%, 50%)' } })
      } else {
        markLineData.push({ xAxis: lcl, lineStyle: { color: 'hsl(179, 50%, 59%)', type: [6, 3] as unknown as string, width: 1.5 }, label: { formatter: 'LCL', position: 'insideStartBottom', fontSize: 9, color: 'hsl(179, 50%, 50%)' } })
      }
    }
    if (ucl !== null) {
      if (isVertical) {
        markLineData.push({ yAxis: ucl, lineStyle: { color: 'hsl(179, 50%, 59%)', type: 'dashed', width: 1 }, label: { formatter: 'UCL', position: 'end', fontSize: 8, color: 'hsl(179, 50%, 50%)' } })
      } else {
        markLineData.push({ xAxis: ucl, lineStyle: { color: 'hsl(179, 50%, 59%)', type: [6, 3] as unknown as string, width: 1.5 }, label: { formatter: 'UCL', position: 'insideEndBottom', fontSize: 9, color: 'hsl(179, 50%, 50%)' } })
      }
    }
    if (centerLine !== null) {
      if (isVertical) {
        markLineData.push({ yAxis: centerLine, lineStyle: { color: 'hsl(104, 55%, 40%)', type: 'dashed', width: 1 }, label: { formatter: 'CL', position: 'end', fontSize: 8, color: 'hsl(104, 55%, 35%)' } })
      } else {
        markLineData.push({ xAxis: centerLine, lineStyle: { color: 'hsl(104, 55%, 40%)', type: 'dashed', width: 1.5 }, label: { formatter: 'CL', position: 'insideBottom', fontSize: 9, color: 'hsl(104, 55%, 35%)' } })
      }
    }

    if (isVertical) {
      // Vertical layout: xAxis is count (horizontal), yAxis is value (vertical, aligned with X-bar chart)
      // Use custom series for horizontal bars since ECharts bar series defaults to vertical with two value axes
      const binWidth = bins.length > 1 ? bins[1].binCenter - bins[0].binCenter : 1
      const localBins = bins
      const localHighlight = highlightedBinIndex
      const localColors = colors

      // Match ControlChart grid margins for pixel-perfect Y-axis alignment
      // ControlChart uses: top = hasAnnotationMarkers ? 32 : 20, bottom = isTimestamp ? 60 : 30
      const isTimestamp = xAxisMode === 'timestamp'
      const matchedGridTop = 20
      const matchedGridBottom = isTimestamp ? 60 : 30

      console.debug('[DistributionHistogram] vertical grid alignment:', {
        top: matchedGridTop, bottom: matchedGridBottom, xAxisMode,
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const histogramRenderItem = (_params: any, api: any) => {
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
        grid: { top: matchedGridTop, right: 30, left: 40, bottom: matchedGridBottom, containLabel: false },
        xAxis: {
          type: 'value' as const,
          max: maxCount * 1.1,
          axisLabel: { fontSize: 10, formatter: (v: number) => Math.round(v).toString() },
        },
        yAxis: {
          type: 'value' as const,
          min: yAxisDomain ? yAxisDomain[0] : xMin,
          max: yAxisDomain ? yAxisDomain[1] : xMax,
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
            return `<div style="font-weight:500">Range</div>` +
              `<div style="opacity:0.7">${bin.binStart.toFixed(dp)} - ${bin.binEnd.toFixed(dp)}</div>` +
              `<div style="margin-top:4px"><b>Count:</b> ${bin.count}</div>`
          },
        },
        series: [
          // Normal curve as line (data is [normalY, binCenter])
          {
            type: 'line',
            data: normalData,
            lineStyle: { color: colors.normalStroke, width: 2 },
            areaStyle: {
              color: new graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: colors.normalFill },
                { offset: 1, color: colors.normalFill },
              ]),
              opacity: 0.15,
            },
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
          // Invisible line series to carry markLine reference lines
          {
            type: 'line',
            data: [],
            markLine: { symbol: 'none', silent: true, data: markLineData as never[] },
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
          return `<div style="font-weight:500">Value Range</div>` +
            `<div style="opacity:0.7">${bin.binStart.toFixed(dp)} - ${bin.binEnd.toFixed(dp)}</div>` +
            `<div style="margin-top:6px"><b>Count:</b> ${bin.count}</div>`
        },
      },
      series: [
        // Normal curve
        {
          type: 'line',
          data: normalData,
          lineStyle: { color: colors.normalStroke, width: 2.5 },
          areaStyle: {
            color: new graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: colors.normalFill },
              { offset: 1, color: colors.normalFill },
            ]),
            opacity: 0.15,
          },
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
          markLine: { symbol: 'none', silent: true, data: markLineData as never[] },
          z: 5,
        },
      ],
    }
  }, [chartData, bins, values, stats, isModeA, yAxisDomain, isVertical, colors, highlightedBinIndex, showSpecLimits, xAxisMode])

  // Mouse event handlers
  const handleMouseMove = useCallback((params: EChartsMouseEvent) => {
    const binIndex = params.dataIndex
    const bin = binsRef.current[binIndex]
    if (bin && bin.sampleIds.length > 0) {
      onHoverSample(bin.sampleIds)
      onHoverBin?.([bin.binStart, bin.binEnd])
    }
  }, [onHoverSample, onHoverBin])

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

  const hasData = !!chartData && chartData.data_points.length > 0

  const { spec_limits } = chartData ?? { spec_limits: { usl: null, lsl: null } }
  const usl = isModeA ? null : spec_limits.usl
  const lsl = isModeA ? null : spec_limits.lsl

  // Calculate Cp and Cpk
  let cp = 0
  let cpk = 0
  let ppk = 0

  if (hasData && !isModeA && usl !== null && lsl !== null && stats.stdDev > 0) {
    const processSigma = chartData!.stored_sigma ?? stats.stdDev
    cp = (usl - lsl) / (6 * processSigma)
    const cpu = (usl - stats.mean) / (3 * processSigma)
    const cpl = (stats.mean - lsl) / (3 * processSigma)
    cpk = Math.min(cpu, cpl)

    const ppu = (usl - stats.mean) / (3 * stats.stdDev)
    const ppl = (stats.mean - lsl) / (3 * stats.stdDev)
    ppk = Math.min(ppu, ppl)
  }

  const getCapabilityStyle = (value: number) => {
    if (value >= 1.33) return 'stat-badge stat-badge-success'
    if (value >= 1.0) return 'stat-badge stat-badge-warning'
    return 'stat-badge stat-badge-danger'
  }

  if (isVertical) {
    return (
      <div className="h-full bg-card border border-border rounded-2xl p-5 flex flex-col">
        {hasData && (
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
                        <span>sigma:</span>
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
        )}
        {/* Chart container — ALWAYS rendered so useECharts can init */}
        <div className="flex-1 min-h-0 relative">
          <div ref={containerRef} className="absolute inset-0" style={{ visibility: hasData ? 'visible' : 'hidden' }} />
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
    <div className="h-full bg-card border border-border rounded-2xl p-5">
      {hasData && (
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
      )}

      {/* Chart container — ALWAYS rendered so useECharts can init */}
      <div className={cn(hasData ? 'h-[85%]' : 'h-full', 'relative')}>
        <div ref={containerRef} className="absolute inset-0" style={{ visibility: hasData ? 'visible' : 'hidden' }} />
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
