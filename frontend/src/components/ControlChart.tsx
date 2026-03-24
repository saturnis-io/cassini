import { useState, useEffect, useMemo, useRef } from 'react'
import { graphic } from '@/lib/echarts'
// ECharts tree-shaken imports are registered in @/lib/echarts
import { useECharts } from '@/hooks/useECharts'
import { useChartDragSelect } from '@/hooks/useChartDragSelect'
import type { RegionSelection } from '@/components/RegionActionModal'
import { formatDisplayKey } from '@/lib/display-key'
import { useLicense } from '@/hooks/useLicense'
import { useAnnotations, useAnomalyEvents, useChartData, useForecast, useHierarchyPath } from '@/api/hooks'
import type { ChartData } from '@/types'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useChartColors } from '@/hooks/useChartColors'
import { useTheme } from '@/providers/ThemeProvider'
import { useDateFormat } from '@/hooks/useDateFormat'
import { applyFormat } from '@/lib/date-format'
import { ViolationLegend } from './ViolationLegend'
import { useChartHoverSync } from '@/stores/chartHoverStore'
import { AnnotationDetailPopover } from './AnnotationDetailPopover'
import { PinnedChartTooltip, type ChartPoint } from '@/components/PinnedChartTooltip'
import type { Annotation } from '@/types'
import { buildAnomalyMarks } from '@/components/anomaly/AnomalyOverlay'
import { buildForecastSeries } from '@/components/charts/buildForecastSeries'
import {
  buildZoneMarkAreas,
  buildAnnotationDecorations,
  computeYDomain,
  buildAnnotationMarkerRenderer,
  buildXAxisConfig,
  buildMarkLines,
} from '@/components/charts/buildChartDecorations'
import { buildDataPointRenderer } from '@/components/charts/buildDataPointRenderer'
import { buildControlLimitSeries } from '@/components/charts/buildControlLimitSeries'
import { buildTooltipFormatter } from '@/components/charts/buildChartTooltipFormatter'
import { buildChartEventHandlers, buildDragSelectHandler } from '@/components/charts/controlChartHandlers'
import { StatNote } from './StatNote'

interface ControlChartProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
    materialId?: number
  }
  label?: string
  showSpecLimits?: boolean
  colorScheme?: 'primary' | 'secondary'
  /** Shared Y-axis domain for alignment with other charts */
  yAxisDomain?: [number, number]
  /** Callback when hovering over a data point - passes the mean value or null on leave */
  onHoverValue?: (value: number | null) => void
  /** Range [min, max] from histogram bar hover to highlight corresponding points */
  highlightedRange?: [number, number] | null
  /** Callback when a data point is clicked for point annotation creation */
  onPointAnnotation?: (sampleId: number) => void
  /** Callback when a region is drag-selected on the chart */
  onRegionSelect?: (info: RegionSelection) => void
  /** Highlight a specific sample on the chart (e.g. the inspected violation) */
  highlightSampleId?: number
  /** When true, fetch and overlay forecast predictions */
  showPredictions?: boolean
  /** Callback reporting the chart's grid.bottom value (px) for alignment with adjacent charts */
  onGridBottom?: (px: number) => void
  /** Callback reporting the chart's grid.top value (px) for alignment with adjacent charts */
  onGridTop?: (px: number) => void
  /** Pre-fetched chart data — when provided, skips internal useChartData fetch */
  chartData?: ChartData
}

/** Renders the drag-selection rectangle as an absolute overlay within the chart wrapper. */
function DragOverlay({ dragRect }: { dragRect: { left: number; width: number } }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[100]">
      <div
        className="bg-primary/20 border-primary absolute top-0 bottom-0 border-x-2"
        style={{ left: dragRect.left, width: dragRect.width }}
      >
        <div className="bg-primary/10 absolute inset-0 animate-pulse" />
      </div>
    </div>
  )
}

export function ControlChart({
  characteristicId,
  chartOptions,
  label,
  showSpecLimits = true,
  colorScheme = 'primary',
  yAxisDomain: externalDomain,
  onHoverValue,
  highlightedRange,
  onPointAnnotation,
  onRegionSelect,
  highlightSampleId,
  showPredictions,
  onGridBottom,
  onGridTop,
  chartData: externalChartData,
}: ControlChartProps) {
  const { data: fetchedChartData, isLoading: fetchLoading } = useChartData(
    characteristicId,
    chartOptions ?? { limit: 50 },
    { enabled: !externalChartData },
  )
  const chartData = externalChartData ?? fetchedChartData
  const isLoading = externalChartData ? false : fetchLoading
  const chartColors = useChartColors()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const { datetimeFormat, axisFormats } = useDateFormat()
  const hierarchyPath = useHierarchyPath(characteristicId)
  const xAxisMode = useDashboardStore((state) => state.xAxisMode)
  const rangeWindow = useDashboardStore((state) => state.rangeWindow)
  const showBrush = useDashboardStore((state) => state.showBrush)
  const showAnomalies = useDashboardStore((state) => state.showAnomalies)
  const { isEnterprise } = useLicense()
  const { data: annotations } = useAnnotations(characteristicId)
  // Gate anomaly API calls to commercial edition only (hook has enabled: charId > 0)
  const { data: anomalyData } = useAnomalyEvents(
    isEnterprise ? characteristicId : 0,
    { limit: 100 },
  )
  // Fetch forecast data when predictions toggle is on
  const { data: forecastData } = useForecast(showPredictions ? characteristicId : 0)

  // Annotation detail popover state
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null)
  const [annotationPopoverPos, setAnnotationPopoverPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })
  // Pinned tooltip state — shown on data point click with Explainable values
  const [pinnedPoint, setPinnedPoint] = useState<{
    point: ChartPoint
    screenX: number
    screenY: number
  } | null>(null)
  const chartWrapperRef = useRef<HTMLDivElement>(null)

  // Store annotations in a ref for ECharts event handlers
  const annotationsRef = useRef(annotations)
  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  // Grid alignment: configured values (used as fallback) + refs for actual Y domain
  const bottomMarginValue = 60
  const gridTopRef = useRef(20)
  const yMinRef = useRef(0)
  const yMaxRef = useRef(0)

  // Maps annotation marker series dataIndex → annotation ID (set inside useMemo, read in click handler)
  const annotationMarkerIdsRef = useRef<number[]>([])
  // Dynamic series indices (set inside useMemo, read in event handlers)
  const dataPointSeriesIndexRef = useRef(1)
  const annotationSeriesIndexRef = useRef(2)

  // Cross-chart hover sync using sample IDs
  const { hoveredSampleIds, onHoverSample, onLeaveSample } = useChartHoverSync(characteristicId)

  // Collect all violated rules across all data points for legend
  const dataPoints = chartData?.data_points
  const allViolatedRules = useMemo(() => {
    if (!dataPoints) return []
    const rules = new Set<number>()
    dataPoints.forEach((point) => {
      point.violation_rules?.forEach((rule) => rules.add(rule))
    })
    return Array.from(rules).sort((a, b) => a - b)
  }, [dataPoints])

  // Color scheme overrides
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

  // ALL hooks must be called before early returns (Rules of Hooks)
  const isModeA = chartData?.subgroup_mode === 'STANDARDIZED'
  const nominalN = chartData?.nominal_subgroup_size ?? 5
  const shortRunMode = chartData?.short_run_mode ?? null

  // Memoize chart data transformation
  const data: ChartPoint[] = useMemo(() => {
    if (!chartData?.data_points?.length) return []
    const pts = chartData.data_points
    const validPoints = isModeA ? pts.filter((p) => p.z_score != null) : pts

    return validPoints.map((point, index) => ({
      index: index + 1,
      sample_id: point.sample_id,
      mean: point.display_value ?? (isModeA ? point.z_score! : point.mean),
      displayValue: point.display_value ?? point.mean,
      displayKey: point.display_key || `#${index + 1}`,
      hasViolation: point.violation_ids.length > 0,
      allAcknowledged:
        point.violation_ids.length > 0 && (point.unacknowledged_violation_ids ?? []).length === 0,
      violationRules: point.violation_rules ?? [],
      unacknowledgedViolationIds: point.unacknowledged_violation_ids ?? [],
      excluded: point.excluded,
      timestamp: new Date(point.timestamp).toLocaleTimeString(),
      timestampMs: new Date(point.timestamp).getTime(),
      timestampLabel: applyFormat(new Date(point.timestamp), datetimeFormat),
      actual_n: point.actual_n ?? nominalN,
      is_undersized: point.is_undersized ?? false,
      effective_ucl: point.effective_ucl,
      effective_lcl: point.effective_lcl,
      z_score: point.z_score,
      metadata: point.metadata,
    }))
  }, [chartData?.data_points, isModeA, nominalN, datetimeFormat])

  // Build sample_id → anomaly events map for tooltip rendering
  const sampleAnomalyMap = useMemo(() => {
    const map = new Map<number, import('@/types/anomaly').AnomalyEvent[]>()
    if (!isEnterprise || !showAnomalies || !anomalyData?.events) return map
    for (const event of anomalyData.events) {
      if (event.is_dismissed || event.sample_id == null) continue
      const existing = map.get(event.sample_id)
      if (existing) existing.push(event)
      else map.set(event.sample_id, [event])
    }
    return map
  }, [isEnterprise, showAnomalies, anomalyData])

  // Store data in ref for event handlers (datazoom, click, hover)
  const setRangeWindow = useDashboardStore((state) => state.setRangeWindow)
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // Detect whether the time axis is usable: if all timestamps collapse into < 1s,
  // fall back to evenly-spaced category mode with timestamp labels.
  const dataTimeRangeMs =
    data.length > 1 ? data[data.length - 1].timestampMs - data[0].timestampMs : 0
  const useTimeCoords = xAxisMode === 'timestamp' && dataTimeRangeMs >= 1000

  // --- Anomaly overlay marks (extracted so both the ECharts option and the JSX can reference it) ---
  // Only match events against the visible data range so the summary bar
  // hides when the shaded region is scrolled out of view.
  const anomalyOverlay = useMemo(() => {
    if (!isEnterprise || !showAnomalies || !anomalyData?.events?.length || data.length === 0)
      return null
    const visibleData = showBrush && rangeWindow
      ? data.slice(rangeWindow[0], rangeWindow[1] + 1)
      : data
    const startIdx = showBrush && rangeWindow ? rangeWindow[0] : 0
    const anomalyPoints = visibleData.map((p, i) => ({
      sample_id: p.sample_id,
      mean: p.mean,
      xValue: useTimeCoords ? p.timestampMs : (startIdx + i),
    }))
    const marks = buildAnomalyMarks(anomalyData.events, anomalyPoints)
    if (marks.markPoints.length || marks.markAreas.length || marks.markLines.length) {
      return marks
    }
    return null
  }, [isEnterprise, showAnomalies, anomalyData, data, useTimeCoords, showBrush, rangeWindow])

  // --- Forecast overlay data (synthesize coordinates for future steps) ---
  const forecastOverlay = useMemo(() => {
    if (!showPredictions || !forecastData?.points?.length || data.length === 0) return null
    const lastPoint = data[data.length - 1]
    const fPoints = forecastData.points

    let coords: { x: number; label: string }[]

    if (useTimeCoords) {
      // Time axis: extrapolate from average interval of last N data points
      const recentCount = Math.min(10, data.length)
      const recentData = data.slice(-recentCount)
      const avgInterval =
        recentData.length > 1
          ? (recentData[recentData.length - 1].timestampMs - recentData[0].timestampMs) /
            (recentData.length - 1)
          : 60000
      coords = fPoints.map((p) => ({
        x: lastPoint.timestampMs + p.step * avgInterval,
        label: `F+${p.step}`,
      }))
    } else {
      // Category axis: forecast indices extend beyond existing data
      coords = fPoints.map((p) => ({
        x: data.length - 1 + p.step,
        label: `F+${p.step}`,
      }))
    }

    return { points: fPoints, coords, lastPoint }
  }, [showPredictions, forecastData, data, useTimeCoords])

  // --- ECharts option builder ---
  const echartsOption = useMemo(() => {
    if (!chartData || !chartData.data_points || chartData.data_points.length === 0) return null
    if (data.length === 0) return null

    // Compute dataZoom range from rangeWindow (for scroll-to-zoom on chart).
    // Only include start/end when a range is actively set (e.g. from the
    // ChartRangeSlider).  When omitted, ECharts preserves its internal zoom
    // state so mouse-wheel zoom in/out works without being reset by re-renders.
    const hasActiveRange = showBrush && rangeWindow !== null
    const dataZoomStartEnd = hasActiveRange
      ? {
          start: (rangeWindow[0] / Math.max(data.length - 1, 1)) * 100,
          end: (rangeWindow[1] / Math.max(data.length - 1, 1)) * 100,
        }
      : {}

    const {
      control_limits,
      spec_limits,
      zone_boundaries,
      subgroup_mode,
      decimal_precision = 3,
    } = chartData

    const localIsModeB = subgroup_mode === 'VARIABLE_LIMITS'

    const formatVal = (value: number | null | undefined) => {
      if (value == null) return 'N/A'
      return value.toFixed(decimal_precision)
    }

    // Calculate Y-axis domain
    const { yMin, yMax } = computeYDomain({
      data,
      isModeA,
      shortRunMode,
      externalDomain,
      showSpecLimits,
      control_limits,
      spec_limits,
      forecastPoints: forecastOverlay?.points ?? null,
    })

    // --- Build markArea for zone shading ---
    const markAreaData = buildZoneMarkAreas({
      isModeA,
      zone_boundaries,
      control_limits,
      chartColors,
      yMin,
      yMax,
    })

    // --- Annotations ---
    const {
      markLines: annotationMarkLines,
      markAreas: annotationMarkAreas,
      markerData: annotationMarkerData,
    } = buildAnnotationDecorations({
      annotations: (annotations ?? []) as Annotation[],
      data,
      useTimeCoords,
      annotationColor: chartColors.annotationColor,
    })

    const hasAnnotationMarkers = annotationMarkerData.length > 0
    // eslint-disable-next-line react-hooks/refs -- intentional ref mutation: passes data from useMemo to event handlers
    annotationMarkerIdsRef.current = annotationMarkerData.map((entry) => entry[1])

    // --- Build markLine for control limits, spec limits, and highlight indicator ---
    const markLineData = buildMarkLines({
      isModeA,
      showSpecLimits,
      spec_limits,
      formatVal,
      chartColors,
      annotationMarkLines,
      highlightSampleId,
      data,
      useTimeCoords,
      isDark,
    })

    const allMarkAreas = [...markAreaData, ...annotationMarkAreas]

    // --- Build constant-value line series for control limits ---
    // ECharts markLine has a rendering bug where yAxis values snap to the series
    // mean instead of the specified coordinate. Using actual line series instead.
    const controlLimitSeries = buildControlLimitSeries({
      isModeA,
      control_limits,
      data,
      useTimeCoords,
      chartColors,
      formatVal,
    })

    // Series index map — indices depend on how many control limit lines are present
    // 0 = main line, 1..N = control limits, N+1 = data points, N+2 = annotation markers
    const dataPointSeriesIndex = 1 + controlLimitSeries.length
    const annotationSeriesIndex = 1 + controlLimitSeries.length + 1
    // eslint-disable-next-line react-hooks/refs -- intentional ref mutation: passes computed series indices to event handlers
    dataPointSeriesIndexRef.current = dataPointSeriesIndex
    // eslint-disable-next-line react-hooks/refs -- intentional ref mutation: passes computed series indices to event handlers
    annotationSeriesIndexRef.current = annotationSeriesIndex

    // --- Custom series renderItem for data point symbols ---
    const customRenderItem = buildDataPointRenderer({
      data,
      chartColors,
      highlightedRange,
      hoveredSampleIds,
      highlightSampleId,
      sampleAnomalyMap,
    })

    const bottomMargin = bottomMarginValue
    const xCategoryData: string[] = data.map((p) => formatDisplayKey(p.displayKey))
    const xTimestampLabels: string[] = data.map((p) => p.timestampLabel)

    // Extend categories with forecast labels for category axis modes
    if (forecastOverlay && !useTimeCoords) {
      const forecastLabels = forecastOverlay.coords.map((c) => c.label)
      xCategoryData.push(...forecastLabels)
      xTimestampLabels.push(...forecastLabels)
    }

    // Build xAxis config based on mode
    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const axisLineColor = isDark ? 'hsl(220, 10%, 30%)' : 'hsl(210, 15%, 80%)'
    const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 90%)'
    const axisNameColor = isDark ? 'hsl(220, 5%, 65%)' : 'hsl(220, 15%, 40%)'

    const xAxisConfig = buildXAxisConfig({
      useTimeCoords,
      isDark,
      xAxisMode,
      xCategoryData,
      xTimestampLabels,
      dataTimeRangeMs,
      axisFormats,
    })

    const hasAnomalyLabels = (anomalyOverlay?.markLines?.length ?? 0) > 0
    const gridTop = hasAnomalyLabels ? 48 : hasAnnotationMarkers ? 32 : 20
    // eslint-disable-next-line react-hooks/refs -- intentional ref mutation: caches gridTop for convertToPixel fallback
    gridTopRef.current = gridTop

    // --- Forecast overlay series ---
    const forecastSeries: Record<string, unknown>[] = forecastOverlay
      ? buildForecastSeries({
          forecastOverlay,
          dataLength: data.length,
          useTimeCoords,
          isDark,
          isModeA,
          controlLimits: control_limits,
          chartColors,
        })
      : []

    // Store for convertToPixel grid alignment
    // eslint-disable-next-line react-hooks/refs -- intentional ref mutation: caches Y domain for convertToPixel in effect
    yMinRef.current = yMin
    // eslint-disable-next-line react-hooks/refs -- intentional ref mutation: caches Y domain for convertToPixel in effect
    yMaxRef.current = yMax

    const option = {
      animation: false,
      grid: { top: gridTop, right: 120, left: 60, bottom: bottomMargin, containLabel: false },
      xAxis: xAxisConfig,
      yAxis: {
        type: 'value',
        // Use function form to prevent ECharts nice-rounding of axis range
        min: () => yMin,
        max: () => yMax,
        axisLabel: {
          fontSize: 12,
          color: axisLabelColor,
          width: 50,
          align: 'right' as const,
          overflow: 'truncate' as const,
          formatter: (value: number) => value.toFixed(decimal_precision),
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        name: isModeA ? 'Z-Score' : shortRunMode === 'deviation' ? 'Deviation from Target' : shortRunMode === 'standardized' ? 'Standardized Value (Z)' : 'Value',
        nameLocation: 'middle',
        nameGap: 45,
        nameTextStyle: { fontSize: 12, color: axisNameColor },
        splitLine: { lineStyle: { type: 'dashed', color: splitLineColor, opacity: isDark ? 0.5 : 0.3 } },
      },
      tooltip: {
        trigger: 'item',
        appendTo: () => document.body,
        transitionDuration: 0,
        extraCssText: 'transition: none !important;',
        position: (point: number[]) => [point[0] + 10, point[1] - 10],
        formatter: buildTooltipFormatter({
          data,
          isModeA,
          localIsModeB,
          shortRunMode,
          formatVal,
          annotations: annotations as Annotation[] | undefined,
          annotationMarkerData,
          annotationSeriesIndex,
          dataPointSeriesIndex,
          chartColors,
          sampleAnomalyMap,
        }),
      },
      dataZoom: [
        {
          type: 'inside' as const,
          ...dataZoomStartEnd,
          minSpan: Math.max((2 / data.length) * 100, 0.5),
          zoomOnMouseWheel: true,
          moveOnMouseWheel: 'shift' as const,
          moveOnMouseMove: false,
          preventDefaultMouseMove: false,
        },
      ],
      series: [
        // Line series for the data path + markArea decorations
        {
          type: 'line',
          data: useTimeCoords ? data.map((p) => [p.timestampMs, p.mean]) : data.map((p) => p.mean),
          lineStyle: {
            width: 2.5,
            color: new graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: lineColors.start },
              { offset: 1, color: lineColors.end },
            ]),
          },
          symbol: 'none',
          showSymbol: false,
          silent: true,
          markLine: { symbol: 'none', silent: true, precision: 10, data: markLineData as never[] },
          markArea: { silent: true, data: allMarkAreas as never[] },
          z: 5,
        },
        // Constant-value line series for control limits (bypasses markLine rendering issues)
        ...controlLimitSeries,
        // Custom series for data point symbols (shapes, violation badges, etc.)
        {
          type: 'custom',
          data: data.map((p, i) => {
            const xVal = useTimeCoords ? p.timestampMs : i
            return [xVal, p.mean, i, p.sample_id]
          }),
          renderItem: customRenderItem,
          coordinateSystem: 'cartesian2d',
          encode: { x: 0, y: 1 },
          z: 10,
          silent: false,
        },
        // Annotation marker series — * for points, horizontal brackets for periods
        ...(hasAnnotationMarkers
          ? [
              {
                type: 'custom' as const,
                // data: [x1, yMax, annIdx, x2OrNaN]
                data: annotationMarkerData.map((entry) => [entry[0], yMax, entry[2], entry[3]]),
                renderItem: buildAnnotationMarkerRenderer({
                  annotationColor: chartColors.annotationColor,
                  gridTop,
                }),
                coordinateSystem: 'cartesian2d',
                encode: { x: 0, y: 1 },
                clip: false,
                z: 15,
                silent: false,
              },
            ]
          : []),
        // Anomaly overlay series — invisible line carrier for interactive marks
        ...(anomalyOverlay ? [{
          type: 'line' as const,
          data: useTimeCoords ? data.map((p) => [p.timestampMs, p.mean]) : data.map((p) => p.mean),
          lineStyle: { width: 0, opacity: 0 }, symbol: 'none', showSymbol: false, silent: true,
          tooltip: { show: false },
           
          markPoint: anomalyOverlay.markPoints.length > 0 ? {
            silent: false, animation: false, data: anomalyOverlay.markPoints as never[],
            tooltip: { show: true, formatter: (p: Record<string, unknown>) => ((p.data as Record<string, unknown> | undefined)?._tooltipHtml as string) ?? '' },
          } : undefined,

          markArea: anomalyOverlay.markAreas.length > 0 ? {
            silent: false, data: anomalyOverlay.markAreas as never[],
            tooltip: { show: true, formatter: (p: Record<string, unknown>) => { const d = p.data as Record<string, unknown> | undefined; const arr = d as unknown as Record<string, unknown>[] | undefined; return (arr?.[0]?._tooltipHtml as string) ?? (d?._tooltipHtml as string) ?? '' } },
          } : undefined,

          markLine: anomalyOverlay.markLines.length > 0 ? {
            symbol: 'none', silent: false, precision: 10, data: anomalyOverlay.markLines as never[],
            tooltip: { show: true, formatter: (p: Record<string, unknown>) => ((p.data as Record<string, unknown> | undefined)?._tooltipHtml as string) ?? '' },
          } : undefined,
          z: 7,
        }] : []),
        // Forecast overlay series — appended AFTER all existing series
        ...forecastSeries,
      ],
    }

    return option
  }, [
    chartData,
    data,
    xAxisMode,
    useTimeCoords,
    chartColors,
    lineColors,
    isModeA,
    externalDomain,
    showSpecLimits,
    annotations,
    highlightedRange,
    hoveredSampleIds,
    highlightSampleId,
    rangeWindow,
    showBrush,
    shortRunMode,
    anomalyOverlay,
    forecastOverlay,
    isDark,
    axisFormats,
    sampleAnomalyMap,
    dataTimeRangeMs,
  ])

  // Stable ref for the ECharts instance — assigned after useECharts, read at event-time
  const echartsInstanceRef = useRef<import('echarts/core').EChartsType | null>(null)

  // Mouse + zoom event handlers (extracted to controlChartHandlers.ts)
  const { handleMouseMove, handleMouseOut, handleClick, handleDataZoom } = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- refs are passed as objects for deferred access in event handlers, not read during render
      buildChartEventHandlers({
        dataRef,
        dataPointSeriesIndexRef,
        annotationSeriesIndexRef,
        annotationMarkerIdsRef,
        annotationsRef,
        chartWrapperRef,
        chartRef: echartsInstanceRef,
        onHoverSample,
        onLeaveSample,
        onHoverValue,
        setActiveAnnotation,
        setAnnotationPopoverPos,
        setPinnedPoint,
        setRangeWindow,
      }),
    [onHoverSample, onLeaveSample, onHoverValue, setRangeWindow],
  )

  const { containerRef, chartRef, refresh } = useECharts({
    option: echartsOption,
    replaceMerge: ['series'],
    onMouseMove: handleMouseMove,
    onMouseOut: handleMouseOut,
    onClick: handleClick,
    onDataZoom: handleDataZoom,
  })

  // Sync the stable ref so extracted event handlers can dispatch ECharts actions
  useEffect(() => {
    echartsInstanceRef.current = chartRef.current
  })

  // Report actual rendered grid positions to parent for histogram alignment.
  useEffect(() => {
    if (!onGridTop && !onGridBottom) return
    const chart = chartRef.current
    const wrapper = chartWrapperRef.current
    if (!chart || !wrapper || !echartsOption) return
    const raf = requestAnimationFrame(() => {
      try {
        const topPx = chart.convertToPixel({ yAxisIndex: 0 }, yMaxRef.current)
        const bottomPx = chart.convertToPixel({ yAxisIndex: 0 }, yMinRef.current)
        const h = wrapper.getBoundingClientRect().height
        if (Number.isFinite(topPx) && Number.isFinite(bottomPx) && h > 0) {
          onGridTop?.(Math.round(topPx))
          onGridBottom?.(Math.round(h - bottomPx))
          return
        }
      } catch { /* fallback below */ }
      onGridTop?.(gridTopRef.current)
      onGridBottom?.(bottomMarginValue)
    })
    return () => cancelAnimationFrame(raf)
  }, [echartsOption, onGridTop, onGridBottom, chartRef])

  // Dismiss stale tooltip when underlying data changes
  useEffect(() => {
    chartRef.current?.dispatchAction({ type: 'hideTip' })
    setPinnedPoint(null)
  }, [data, chartRef])

  // Drag-to-select region overlay (handler extracted to controlChartHandlers.ts)
  const handleDragSelect = useMemo(
    () => buildDragSelectHandler({ data, onRegionSelect }),
    [data, onRegionSelect],
  )

  const { dragRect } = useChartDragSelect(
    chartRef,
    chartWrapperRef,
    data,
    useTimeCoords,
    handleDragSelect,
  )

  // Refresh on theme color changes
  useEffect(() => {
    refresh()
  }, [chartColors, refresh])

  // Derive header values (safe even when chartData is null)
  const hasData = !!chartData && !!chartData.data_points && chartData.data_points.length > 0

  const isModeB = chartData?.subgroup_mode === 'VARIABLE_LIMITS'
  const baseChartLabel = isModeA
    ? 'Z-Score Chart'
    : isModeB
      ? 'Variable Limits Chart'
      : nominalN === 1
        ? 'Individuals Chart'
        : 'X-Bar Chart'
  const chartTypeLabel = shortRunMode === 'deviation'
    ? `${baseChartLabel} (Short-Run Deviation)`
    : shortRunMode === 'standardized'
      ? `${baseChartLabel} (Short-Run Z)`
      : baseChartLabel

  const hierarchyNames = hierarchyPath.map((h) => h.name)
  const breadcrumb =
    hierarchyNames.length > 0
      ? [...hierarchyNames, chartData?.characteristic_name].filter(Boolean).join(' / ')
      : (chartData?.characteristic_name ?? '')

  return (
    <div data-ui="control-chart" className="bg-card border-border flex h-full flex-col rounded-2xl border p-5">
      {/* Header */}
      {hasData && (
        <div data-ui="control-chart-header" className="mb-4 flex h-5 flex-shrink-0 items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {label && (
                <span className="bg-primary/10 text-primary flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium">
                  {label}
                </span>
              )}
              <h3
                className="text-foreground truncate text-sm leading-5 font-semibold"
                title={breadcrumb}
              >
                <span className="text-muted-foreground">
                  {hierarchyNames.join(' / ')}
                  {hierarchyNames.length > 0 && ' / '}
                </span>
                <span>{chartData?.characteristic_name}</span>
                <span className="text-muted-foreground font-normal"> - {chartTypeLabel}</span>
              </h3>
            </div>
            {allViolatedRules.length > 0 && (
              <ViolationLegend violatedRules={allViolatedRules} compact className="ml-2" />
            )}
            {chartData?.active_material_name && (
              <span className="bg-accent/10 text-accent-foreground flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium">
                Limits: {chartData.active_material_name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Statistical notes for short-run modes */}
      {hasData && shortRunMode === 'standardized' && (
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            Standardized (Z-score) mode
            <StatNote>
              Values converted to Z-scores: Z = (X&#772; &minus; target) /
              (&sigma;/&radic;n). Allows multiple part numbers on one chart.
            </StatNote>
          </span>
        </div>
      )}

      {/* Chart container — ALWAYS rendered so useECharts can init */}
      <div ref={chartWrapperRef} className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ visibility: hasData ? 'visible' : 'hidden', cursor: 'crosshair' }}
        />

        {/* AI Insights moved to ChartToolbar — no longer rendered in chart overlay */}

        {/* Drag-to-select region overlay — absolute within wrapper, z-[100]
             to paint above the ECharts canvas. pointer-events-none so
             mouse events still reach the window listeners in useChartDragSelect. */}
        {dragRect && <DragOverlay dragRect={dragRect} />}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground text-sm">Loading chart data...</div>
          </div>
        )}
        {!isLoading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground text-sm">No data available</div>
          </div>
        )}

        {/* Annotation detail popover */}
        {activeAnnotation && (
          <AnnotationDetailPopover
            annotation={activeAnnotation}
            characteristicId={characteristicId}
            anchorPosition={annotationPopoverPos}
            onClose={() => setActiveAnnotation(null)}
          />
        )}
      </div>

      {/* Pinned tooltip with Explainable metric values */}
      {pinnedPoint && chartData && (
        <PinnedChartTooltip
          point={pinnedPoint.point}
          screenX={pinnedPoint.screenX}
          screenY={pinnedPoint.screenY}
          characteristicId={characteristicId}
          controlLimits={chartData.control_limits}
          shortRunMode={shortRunMode}
          isModeA={isModeA}
          isModeB={chartData.subgroup_mode === 'VARIABLE_LIMITS'}
          decimalPrecision={chartData.decimal_precision ?? 3}
          onViewSample={onPointAnnotation ? (sampleId) => {
            setPinnedPoint(null)
            onPointAnnotation(sampleId)
          } : undefined}
          onClose={() => setPinnedPoint(null)}
        />
      )}
    </div>
  )
}
