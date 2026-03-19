import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { graphic } from '@/lib/echarts'
import type { RenderItemParams, RenderItemAPI } from '@/lib/echarts'
// ECharts tree-shaken imports are registered in @/lib/echarts
import { useECharts } from '@/hooks/useECharts'
import type { EChartsMouseEvent, EChartsDataZoomEvent } from '@/hooks/useECharts'
import { useChartDragSelect, type DragSelection } from '@/hooks/useChartDragSelect'
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
import { ViolationLegend, NELSON_RULES } from './ViolationLegend'
import { useChartHoverSync } from '@/stores/chartHoverStore'
import { AnnotationDetailPopover } from './AnnotationDetailPopover'
import { PinnedChartTooltip, type ChartPoint } from '@/components/PinnedChartTooltip'
import type { Annotation } from '@/types'
import { buildAnomalyMarks } from '@/components/anomaly/AnomalyOverlay'
import { buildForecastSeries } from '@/components/charts/buildForecastSeries'
import { buildZoneMarkAreas, buildAnnotationDecorations } from '@/components/charts/buildChartDecorations'
import { buildDataPointRenderer } from '@/components/charts/buildDataPointRenderer'
import {
  EVENT_TYPE_LABELS as ANOMALY_TYPE_LABELS,
  SEVERITY_COLORS,
  escapeHtml,
} from '@/lib/anomaly-labels'
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
    const isZScaleDomain = isModeA || shortRunMode === 'standardized'
    let yMin: number, yMax: number

    if (isZScaleDomain && externalDomain) {
      yMin = externalDomain[0]
      yMax = externalDomain[1]
    } else if (isZScaleDomain) {
      const zValues = data.map((p) => p.mean)
      const allZLimits = [...zValues, 3, -3]
      if (showSpecLimits) {
        if (spec_limits.usl != null) allZLimits.push(spec_limits.usl)
        if (spec_limits.lsl != null) allZLimits.push(spec_limits.lsl)
      }
      const zMinVal = Math.min(...allZLimits)
      const zMaxVal = Math.max(...allZLimits)
      const zPadding = (zMaxVal - zMinVal) * 0.1
      yMin = zMinVal - zPadding
      yMax = zMaxVal + zPadding
    } else if (externalDomain) {
      yMin = externalDomain[0]
      yMax = externalDomain[1]
    } else {
      const values = data.map((p) => p.mean)
      const minVal = Math.min(...values)
      const maxVal = Math.max(...values)
      const ucl = control_limits.ucl ?? maxVal
      const lcl = control_limits.lcl ?? minVal
      let domainMax = Math.max(maxVal, ucl)
      let domainMin = Math.min(minVal, lcl)
      if (showSpecLimits) {
        if (spec_limits.usl != null) domainMax = Math.max(domainMax, spec_limits.usl)
        if (spec_limits.lsl != null) domainMin = Math.min(domainMin, spec_limits.lsl)
      }
      const padding = (domainMax - domainMin) * 0.2
      yMin = domainMin - padding
      yMax = domainMax + padding
    }

    // Expand domain to include forecast confidence bounds
    if (forecastOverlay) {
      for (const p of forecastOverlay.points) {
        if (p.upper_95 != null && p.upper_95 > yMax) yMax = p.upper_95
        if (p.lower_95 != null && p.lower_95 < yMin) yMin = p.lower_95
        if (p.predicted_value > yMax) yMax = p.predicted_value
        if (p.predicted_value < yMin) yMin = p.predicted_value
      }
      // Add uniform padding after full expansion
      const forecastPad = (yMax - yMin) * 0.05
      yMax += forecastPad
      yMin -= forecastPad
    }

    // X-axis data
    const isTimestamp = xAxisMode === 'timestamp'

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
    // Store annotation IDs for click handler lookup (ref mutation is safe here — side-effect of render)
    annotationMarkerIdsRef.current = annotationMarkerData.map((entry) => entry[1])

    // --- Build markLine for control limits and zone boundaries ---
    const markLineData: Record<string, unknown>[] = []

    if (isModeA) {
      markLineData.push(
        {
          yAxis: 3,
          lineStyle: { color: chartColors.uclLine, type: 'dashed', width: 1.5 },
          label: {
            formatter: 'UCL: +3.0',
            position: 'end',
            color: chartColors.uclLine,
            fontSize: 11,
            fontWeight: 500,
          },
        },
        {
          yAxis: 0,
          lineStyle: { color: chartColors.centerLine, type: 'solid', width: 2.5 },
          label: {
            formatter: 'CL: 0.0',
            position: 'end',
            color: chartColors.centerLine,
            fontSize: 11,
            fontWeight: 600,
          },
        },
        {
          yAxis: -3,
          lineStyle: { color: chartColors.lclLine, type: 'dashed', width: 1.5 },
          label: {
            formatter: 'LCL: -3.0',
            position: 'end',
            color: chartColors.lclLine,
            fontSize: 11,
            fontWeight: 500,
          },
        },
      )
    } else {
      // Control limit lines rendered as separate series (see controlLimitSeries)
      // to bypass ECharts markLine yAxis rendering bug
    }

    if (showSpecLimits && spec_limits.usl != null) {
      markLineData.push({
        yAxis: spec_limits.usl,
        lineStyle: { color: 'hsl(357, 80%, 52%)', type: [8, 4] as unknown as string, width: 2 },
        label: {
          formatter: `USL: ${formatVal(spec_limits.usl)}`,
          position: 'end',
          color: 'hsl(357, 80%, 45%)',
          fontSize: 10,
          fontWeight: 500,
        },
      })
    }
    if (showSpecLimits && spec_limits.lsl != null) {
      markLineData.push({
        yAxis: spec_limits.lsl,
        lineStyle: { color: 'hsl(357, 80%, 52%)', type: [8, 4] as unknown as string, width: 2 },
        label: {
          formatter: `LSL: ${formatVal(spec_limits.lsl)}`,
          position: 'end',
          color: 'hsl(357, 80%, 45%)',
          fontSize: 10,
          fontWeight: 500,
        },
      })
    }

    markLineData.push(...annotationMarkLines)

    // Vertical indicator line for the inspected/highlighted sample
    if (highlightSampleId != null) {
      const highlightIdx = data.findIndex((p) => p.sample_id === highlightSampleId)
      if (highlightIdx >= 0) {
        const xVal = useTimeCoords ? data[highlightIdx].timestampMs : highlightIdx
        markLineData.push({
          xAxis: xVal,
          lineStyle: { color: 'hsl(180, 100%, 50%)', type: 'solid', width: 2, opacity: 0.6 },
          label: {
            formatter: 'Violation',
            position: 'insideEndTop',
            color: 'hsl(180, 100%, 50%)',
            fontSize: 10,
            fontWeight: 600,
            backgroundColor: isDark ? 'hsl(220, 25%, 13%)' : 'hsl(0, 0%, 100%)',
            padding: [2, 6],
            borderRadius: 3,
          },
        })
      }
    }

    const allMarkAreas = [...markAreaData, ...annotationMarkAreas]

    // --- Build constant-value line series for control limits ---
    // ECharts markLine has a rendering bug where yAxis values snap to the series
    // mean instead of the specified coordinate. Using actual line series instead.
    const controlLimitSeries: Record<string, unknown>[] = []

    if (!isModeA) {
      const isTrial = control_limits.source === 'trial'
      const trialSuffix = isTrial ? ' (trial)' : ''
      const limitDash = isTrial ? [4, 4] : [6, 3]
      const limitWidth = isTrial ? 1 : 1.5
      const centerDash = isTrial ? [4, 4] : undefined
      const centerWidth = isTrial ? 1.5 : 2.5

      if (control_limits.ucl != null) {
        const uclData = useTimeCoords
          ? data.map((p) => [p.timestampMs, control_limits.ucl])
          : data.map(() => control_limits.ucl)
        controlLimitSeries.push({
          type: 'line',
          data: uclData,
          lineStyle: { color: chartColors.uclLine, type: limitDash, width: limitWidth },
          symbol: 'none',
          showSymbol: false,
          silent: true,
          z: 4,
          endLabel: {
            show: true,
            formatter: `UCL: ${formatVal(control_limits.ucl)}${trialSuffix}`,
            color: chartColors.uclLine,
            fontSize: 11,
            fontWeight: 500,
          },
        })
      }
      if (control_limits.center_line != null) {
        const clData = useTimeCoords
          ? data.map((p) => [p.timestampMs, control_limits.center_line])
          : data.map(() => control_limits.center_line)
        controlLimitSeries.push({
          type: 'line',
          data: clData,
          lineStyle: { color: chartColors.centerLine, type: centerDash, width: centerWidth },
          symbol: 'none',
          showSymbol: false,
          silent: true,
          z: 4,
          endLabel: {
            show: true,
            formatter: `CL: ${formatVal(control_limits.center_line)}${trialSuffix}`,
            color: chartColors.centerLine,
            fontSize: 11,
            fontWeight: 600,
          },
        })
      }
      if (control_limits.lcl != null) {
        const lclData = useTimeCoords
          ? data.map((p) => [p.timestampMs, control_limits.lcl])
          : data.map(() => control_limits.lcl)
        controlLimitSeries.push({
          type: 'line',
          data: lclData,
          lineStyle: { color: chartColors.lclLine, type: limitDash, width: limitWidth },
          symbol: 'none',
          showSymbol: false,
          silent: true,
          z: 4,
          endLabel: {
            show: true,
            formatter: `LCL: ${formatVal(control_limits.lcl)}${trialSuffix}`,
            color: chartColors.lclLine,
            fontSize: 11,
            fontWeight: 500,
          },
        })
      }
    }

    // Series index map — indices depend on how many control limit lines are present
    // 0 = main line, 1..N = control limits, N+1 = data points, N+2 = annotation markers
    const dataPointSeriesIndex = 1 + controlLimitSeries.length
    const annotationSeriesIndex = 1 + controlLimitSeries.length + 1
    dataPointSeriesIndexRef.current = dataPointSeriesIndex
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
    // Use 'time' axis for proper time-series rendering (auto-ticks, date formatting).
    // Falls back to category when timestamps are too close together (< 1s spread).
    // Theme-aware axis colors — in dark mode, use brighter text/lines for readability
    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const axisLineColor = isDark ? 'hsl(220, 10%, 30%)' : 'hsl(210, 15%, 80%)'
    const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 90%)'
    const axisNameColor = isDark ? 'hsl(220, 5%, 65%)' : 'hsl(220, 15%, 40%)'

    const xAxisConfig = useTimeCoords
      ? {
          type: 'time' as const,
          axisLabel: {
            fontSize: 11,
            rotate: 30,
            color: axisLabelColor,
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
          axisLine: { lineStyle: { color: axisLineColor } },
          splitLine: { show: false },
        }
      : {
          type: 'category' as const,
          boundaryGap: false,
          data: isTimestamp ? xTimestampLabels : xCategoryData,
          axisLabel: { fontSize: 11, rotate: 30, color: axisLabelColor },
          axisLine: { lineStyle: { color: axisLineColor } },
          splitLine: { show: false },
        }

    const hasAnomalyLabels = (anomalyOverlay?.markLines?.length ?? 0) > 0
    const gridTop = hasAnomalyLabels ? 48 : hasAnnotationMarkers ? 32 : 20
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
    yMinRef.current = yMin
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
        formatter: (params: unknown) => {
          const p = params as { dataIndex: number; seriesType: string; seriesIndex: number }
          // Only show tooltip for custom series (data points), not the line
          if (p.seriesType === 'line') return ''
          // Annotation marker series — show brief tooltip
          if (p.seriesIndex === annotationSeriesIndex && annotations) {
            const markerEntry = annotationMarkerData[p.dataIndex]
            if (!markerEntry) return ''
            const annId = markerEntry[1]
            const ann = (annotations as Annotation[]).find((a) => a.id === annId)
            if (!ann) return ''
            const annText = ann.text.length > 120 ? ann.text.slice(0, 117) + '...' : ann.text
            return `<div style="font-size:12px;max-width:350px;overflow-wrap:break-word;word-wrap:break-word;white-space:pre-wrap"><div style="font-weight:600;color:${localChartColors.annotationColor};margin-bottom:4px">Annotation</div><div>${escapeHtml(annText)}</div><div style="opacity:0.6;margin-top:4px;font-size:11px">Click to view details</div></div>`
          }
          // Only show data-point tooltip for the data-point custom series
          if (p.seriesIndex !== dataPointSeriesIndex) return ''
          const point = localData[p.dataIndex]
          if (!point) return ''

          let html = `<div style="max-width:280px;overflow-wrap:break-word;word-wrap:break-word">`
          html += `<div style="font-size:13px;font-weight:500">Sample ${formatDisplayKey(point.displayKey)}</div>`
          html += `<div>n = ${point.actual_n}</div>`

          if (isModeA) {
            html += `<div>Z-Score: ${formatVal(point.z_score ?? point.mean)}</div>`
          } else if (shortRunMode === 'deviation') {
            html += `<div>Deviation: ${formatVal(point.mean)}</div>`
          } else if (shortRunMode === 'standardized') {
            html += `<div>Z-Value: ${formatVal(point.mean)}</div>`
          } else if (localIsModeB && point.effective_ucl) {
            html += `<div>Value: ${formatVal(point.displayValue ?? point.mean)}</div>`
            html += `<div style="opacity:0.7">UCL: ${formatVal(point.effective_ucl)}</div>`
            html += `<div style="opacity:0.7">LCL: ${formatVal(point.effective_lcl)}</div>`
          } else {
            html += `<div>Value: ${formatVal(point.mean)}</div>`
          }

          html += `<div style="opacity:0.7">${point.timestamp}</div>`
          if (point.is_undersized)
            html += `<div style="color:hsl(32,63%,51%);font-weight:500">Undersized sample</div>`

          if (point.hasViolation && point.violationRules.length > 0) {
            html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(128,128,128,0.3)">`
            const vColor = point.allAcknowledged ? 'hsl(357,25%,55%)' : 'hsl(357,80%,52%)'
            const vLabel = point.allAcknowledged ? 'Violations (acknowledged):' : 'Violations:'
            html += `<div style="color:${vColor};font-weight:500;margin-bottom:4px">${vLabel}</div>`
            for (const ruleId of point.violationRules) {
              html += `<div style="font-size:11px;opacity:0.8">${ruleId}: ${NELSON_RULES[ruleId]?.name || `Rule ${ruleId}`}</div>`
            }
            html += `</div>`
          }

          // AI insight section (like violations, but for anomaly detection events)
          const anomalyEvents = localSampleAnomalyMap.get(point.sample_id)
          if (anomalyEvents?.length) {
            html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(128,128,128,0.3)">`
            html += `<div style="color:hsl(260,60%,65%);font-weight:500;margin-bottom:4px">AI Insights:</div>`
            for (const ae of anomalyEvents) {
              const typeLabel = escapeHtml(ANOMALY_TYPE_LABELS[ae.event_type] ?? ae.event_type)
              const sevColor = SEVERITY_COLORS[ae.severity] ?? '#6b7280'
              html += `<div style="font-size:11px;opacity:0.9"><span style="color:${sevColor};font-weight:500">${escapeHtml(ae.severity)}</span> ${typeLabel}</div>`
              if (ae.summary) {
                const raw = ae.summary.length > 80 ? ae.summary.slice(0, 77) + '...' : ae.summary
                html += `<div style="font-size:10px;opacity:0.7;margin-left:4px">${escapeHtml(raw)}</div>`
              }
            }
            html += `</div>`
          }
          html += `</div>`
          return html
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                renderItem: (_params: RenderItemParams, api: RenderItemAPI) => {
                  const annColor = localChartColors.annotationColor
                  const x1Coord = api.coord([api.value(0), api.value(1)])
                  const x1Px = x1Coord[0]
                  const cy = gridTop - 2
                  const x2Raw = api.value(3) as number
                  const isPeriod = x2Raw != null && !isNaN(x2Raw)

                  if (isPeriod) {
                    // Period annotation: horizontal bracket spanning x1 → x2
                    // Bracket hangs down from a top bar, ticks reach toward the chart area
                    const x2Coord = api.coord([x2Raw, api.value(1)])
                    const x2Px = x2Coord[0]
                    const bracketBottom = cy // ticks reach down to near the chart grid edge
                    const bracketH = 8
                    const bracketTop = cy - bracketH // horizontal bar sits above
                    const midX = (x1Px + x2Px) / 2
                    return {
                      type: 'group',
                      children: [
                        // Left tick
                        {
                          type: 'line',
                          shape: { x1: x1Px, y1: bracketBottom, x2: x1Px, y2: bracketTop },
                          style: { stroke: annColor, lineWidth: 2 },
                        },
                        // Horizontal bar
                        {
                          type: 'line',
                          shape: { x1: x1Px, y1: bracketTop, x2: x2Px, y2: bracketTop },
                          style: { stroke: annColor, lineWidth: 2 },
                        },
                        // Right tick
                        {
                          type: 'line',
                          shape: { x1: x2Px, y1: bracketBottom, x2: x2Px, y2: bracketTop },
                          style: { stroke: annColor, lineWidth: 2 },
                        },
                        // Center dot for click target
                        {
                          type: 'circle',
                          shape: { cx: midX, cy: bracketTop, r: 4 },
                          style: { fill: annColor },
                        },
                      ],
                    } as unknown
                  }

                  // Point annotation: * marker
                  return {
                    type: 'text',
                    style: {
                      x: x1Px,
                      y: cy,
                      text: '*',
                      fill: annColor,
                      fontSize: 22,
                      fontWeight: 900,
                      textAlign: 'center',
                      textVerticalAlign: 'bottom',
                    },
                    emphasis: {
                      style: {
                        fill: annColor,
                        fontSize: 24,
                      },
                    },
                  } as unknown
                },
                coordinateSystem: 'cartesian2d',
                encode: { x: 0, y: 1 },
                clip: false,
                z: 15,
                silent: false,
              },
            ]
          : []),
        // Anomaly overlay series — interactive marks with tooltips
        ...(anomalyOverlay
          ? [
              {
                type: 'line' as const,
                // Invisible line on the same axis so marks position correctly
                data: useTimeCoords
                  ? data.map((p) => [p.timestampMs, p.mean])
                  : data.map((p) => p.mean),
                lineStyle: { width: 0, opacity: 0 },
                symbol: 'none',
                showSymbol: false,
                silent: true,
                tooltip: { show: false },
                markPoint:
                  anomalyOverlay.markPoints.length > 0
                    ? {
                        silent: false,
                        animation: false,
                        data: anomalyOverlay.markPoints as never[],
                        tooltip: {
                          show: true,
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter: (params: Record<string, any>) =>
                            params.data?._tooltipHtml ?? '',
                        },
                      }
                    : undefined,
                markArea:
                  anomalyOverlay.markAreas.length > 0
                    ? {
                        silent: false,
                        data: anomalyOverlay.markAreas as never[],
                        tooltip: {
                          show: true,
                          formatter: (params: Record<string, unknown>) => {
                            // markArea formatter receives {data} which is the pair array
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const item = params.data as any
                            return (
                              item?.[0]?._tooltipHtml ??
                              item?._tooltipHtml ??
                              ''
                            )
                          },
                        },
                      }
                    : undefined,
                markLine:
                  anomalyOverlay.markLines.length > 0
                    ? {
                        symbol: 'none',
                        silent: false,
                        precision: 10,
                        data: anomalyOverlay.markLines as never[],
                        tooltip: {
                          show: true,
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter: (params: Record<string, any>) =>
                            params.data?._tooltipHtml ?? '',
                        },
                      }
                    : undefined,
                z: 7,
              },
            ]
          : []),
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
  ])

  // Mouse event handlers bridging ECharts -> ChartHoverContext
  const handleMouseMove = useCallback(
    (params: EChartsMouseEvent) => {
      // Only trigger hover for data point series — ignore line, limit, and annotation series
      if (params.seriesIndex != null && params.seriesIndex !== dataPointSeriesIndexRef.current) return
      const idx = params.dataIndex
      const point = dataRef.current[idx]
      if (point) {
        onHoverSample(point.sample_id)
        onHoverValue?.(point.displayValue ?? point.mean)
      }
    },
    [onHoverSample, onHoverValue],
  )

  const handleMouseOut = useCallback(() => {
    onLeaveSample()
    onHoverValue?.(null)
  }, [onLeaveSample, onHoverValue])

  const handleClick = useCallback(
    (params: EChartsMouseEvent) => {
      // Annotation marker click
      if (params.seriesIndex === annotationSeriesIndexRef.current && annotationsRef.current) {
        const annId = annotationMarkerIdsRef.current[params.dataIndex]
        if (annId != null) {
          const ann = (annotationsRef.current as Annotation[]).find((a) => a.id === annId)
          if (ann && chartWrapperRef.current) {
            const rect = chartWrapperRef.current.getBoundingClientRect()
            setAnnotationPopoverPos({
              x: rect.left + (params.event?.offsetX ?? 0),
              y: rect.top + (params.event?.offsetY ?? 0),
            })
            setActiveAnnotation(ann)
            return
          }
        }
      }
      // Data point click — show pinned tooltip with Explainable values
      const pointData = params.data as unknown as number[]
      const dataIndex = pointData?.[2]
      const chartPoint = dataRef.current[dataIndex]
      if (chartPoint && chartWrapperRef.current) {
        const rect = chartWrapperRef.current.getBoundingClientRect()
        setPinnedPoint({
          point: chartPoint,
          screenX: rect.left + (params.event?.offsetX ?? 0),
          screenY: rect.top + (params.event?.offsetY ?? 0),
        })
        // Hide native ECharts tooltip when pinned tooltip opens
        chartRef.current?.dispatchAction({ type: 'hideTip' })
      }
    },
    [],
  )

  // DataZoom handler: maps zoom percentages back to rangeWindow indices
  const handleDataZoom = useCallback(
    (params: EChartsDataZoomEvent) => {
      const totalPoints = dataRef.current.length
      if (totalPoints <= 1) return

      const newStart = Math.round((params.start / 100) * (totalPoints - 1))
      const newEnd = Math.round((params.end / 100) * (totalPoints - 1))

      // Zoomed all the way out → clear range
      if (newStart <= 0 && newEnd >= totalPoints - 1) {
        setRangeWindow(null)
        return
      }

      // Auto-enable showBrush + set range atomically
      const store = useDashboardStore.getState()
      if (!store.showBrush) {
        useDashboardStore.setState({ showBrush: true, rangeWindow: [newStart, newEnd] })
      } else {
        setRangeWindow([newStart, newEnd])
      }
    },
    [setRangeWindow],
  )

  const { containerRef, chartRef, refresh } = useECharts({
    option: echartsOption,
    replaceMerge: ['series'],
    onMouseMove: handleMouseMove,
    onMouseOut: handleMouseOut,
    onClick: handleClick,
    onDataZoom: handleDataZoom,
  })

  // Report actual rendered grid positions to parent for histogram alignment.
  // Uses convertToPixel to get the ACTUAL pixel coordinates ECharts rendered,
  // which may differ from the configured grid values due to internal adjustments.
  useEffect(() => {
    if (!onGridTop && !onGridBottom) return
    const chart = chartRef.current
    const wrapper = chartWrapperRef.current
    if (!chart || !wrapper || !echartsOption) return
    // convertToPixel is only valid after setOption; schedule after current frame
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

  // Dismiss stale tooltip when underlying data changes — prevents the tooltip
  // from showing one sample while a click would resolve to a different one
  // (happens when new samples arrive and old ones drop off due to the limit)
  useEffect(() => {
    chartRef.current?.dispatchAction({ type: 'hideTip' })
    setPinnedPoint(null)
  }, [data, chartRef])

  // Drag-to-select region overlay — callback is called directly by the hook (no intermediate state)
  const handleDragSelect = useCallback(
    (sel: DragSelection) => {
      if (!onRegionSelect || !data.length) return
      const slice = data.slice(sel.startIndex, sel.endIndex + 1)
      if (!slice.length) return

      onRegionSelect({
        startTime: new Date(slice[0].timestampMs).toISOString(),
        endTime: new Date(slice[slice.length - 1].timestampMs).toISOString(),
        startDisplayKey: slice[0].displayKey,
        endDisplayKey: slice[slice.length - 1].displayKey,
        sampleCount: slice.length,
        violationIds: slice.flatMap((p) => p.unacknowledgedViolationIds),
      })
    },
    [onRegionSelect, data],
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
