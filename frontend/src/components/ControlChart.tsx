import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { graphic } from '@/lib/echarts'
// ECharts tree-shaken imports are registered in @/lib/echarts
import { useECharts } from '@/hooks/useECharts'
import type { EChartsMouseEvent } from '@/hooks/useECharts'
import { useAnnotations, useChartData, useHierarchyPath } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { getStoredChartColors, type ChartColors } from '@/lib/theme-presets'
import { ViolationLegend, NELSON_RULES, getPrimaryViolationRule } from './ViolationLegend'
import { useChartHoverSync } from '@/contexts/ChartHoverContext'
import { AnnotationDetailPopover } from './AnnotationDetailPopover'
import type { Annotation } from '@/types'

interface ControlChartProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
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

// --- Data point type for the chart ---
interface ChartPoint {
  index: number
  sample_id: number
  mean: number
  displayValue: number
  hasViolation: boolean
  violationRules: number[]
  excluded: boolean
  timestamp: string
  timestampMs: number
  timestampLabel: string
  actual_n: number
  is_undersized: boolean
  effective_ucl: number | null
  effective_lcl: number | null
  z_score: number | null
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
}: ControlChartProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, chartOptions ?? { limit: 50 })
  const chartColors = useChartColors()
  const hierarchyPath = useHierarchyPath(characteristicId)
  const xAxisMode = useDashboardStore((state) => state.xAxisMode)
  const showAnnotations = useDashboardStore((state) => state.showAnnotations)
  const rangeWindow = useDashboardStore((state) => state.rangeWindow)
  const showBrush = useDashboardStore((state) => state.showBrush)
  const { data: annotations } = useAnnotations(characteristicId, showAnnotations)

  // Annotation detail popover state
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null)
  const [annotationPopoverPos, setAnnotationPopoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const chartWrapperRef = useRef<HTMLDivElement>(null)

  // Store annotations in a ref for ECharts event handlers
  const annotationsRef = useRef(annotations)
  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  // Maps annotation marker series dataIndex → annotation ID (set inside useMemo, read in click handler)
  const annotationMarkerIdsRef = useRef<number[]>([])

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
  const lineColors = useMemo(() => colorScheme === 'secondary'
    ? { start: chartColors.secondaryLineGradientStart, end: chartColors.secondaryLineGradientEnd }
    : { start: chartColors.lineGradientStart, end: chartColors.lineGradientEnd },
  [colorScheme, chartColors])

  // ALL hooks must be called before early returns (Rules of Hooks)
  const isModeA = chartData?.subgroup_mode === 'STANDARDIZED'
  const nominalN = chartData?.nominal_subgroup_size ?? 5

  // Memoize chart data transformation
  const data: ChartPoint[] = useMemo(() => {
    if (!chartData?.data_points?.length) return []
    const pts = chartData.data_points
    const validPoints = isModeA ? pts.filter((p) => p.z_score != null) : pts

    return validPoints.map((point, index) => ({
      index: index + 1,
      sample_id: point.sample_id,
      mean: isModeA ? point.z_score! : point.mean,
      displayValue: point.display_value ?? point.mean,
      hasViolation: point.violation_ids.length > 0,
      violationRules: point.violation_rules ?? [],
      excluded: point.excluded,
      timestamp: new Date(point.timestamp).toLocaleTimeString(),
      timestampMs: new Date(point.timestamp).getTime(),
      timestampLabel: new Date(point.timestamp).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }),
      actual_n: point.actual_n ?? nominalN,
      is_undersized: point.is_undersized ?? false,
      effective_ucl: point.effective_ucl,
      effective_lcl: point.effective_lcl,
      z_score: point.z_score,
    }))
  }, [chartData?.data_points, isModeA, nominalN])

  // Apply range window to slice visible data
  const visibleData = useMemo(() => {
    if (!showBrush || !rangeWindow || data.length === 0) return data
    const [start, end] = rangeWindow
    return data.slice(start, end + 1).map((point, i) => ({
      ...point,
      index: start + i + 1,
    }))
  }, [data, rangeWindow, showBrush])

  // Store visibleData in ref for event handlers
  const dataRef = useRef(visibleData)
  useEffect(() => {
    dataRef.current = visibleData
  }, [visibleData])

  // --- ECharts option builder ---
  const echartsOption = useMemo(() => {
    if (!chartData || !chartData.data_points || chartData.data_points.length === 0) return null
    if (visibleData.length === 0) return null

    const { control_limits, spec_limits, zone_boundaries, subgroup_mode, decimal_precision = 3 } = chartData
    const localIsModeB = subgroup_mode === 'VARIABLE_LIMITS'

    const formatVal = (value: number | null | undefined) => {
      if (value == null) return 'N/A'
      return value.toFixed(decimal_precision)
    }

    // Calculate Y-axis domain
    let yMin: number, yMax: number

    if (isModeA && externalDomain) {
      yMin = externalDomain[0]
      yMax = externalDomain[1]
    } else if (isModeA) {
      const zValues = data.map((p) => p.mean)
      const allZLimits = [...zValues, 3, -3]
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
      const padding = (ucl - lcl) * 0.2
      yMin = Math.min(minVal, lcl) - padding
      yMax = Math.max(maxVal, ucl) + padding
    }

    // X-axis data
    const isTimestamp = xAxisMode === 'timestamp'

    // --- Build markArea for zone shading ---
    type MarkAreaPair = [Record<string, unknown>, Record<string, unknown>]
    const markAreaData: MarkAreaPair[] = []

    if (isModeA) {
      markAreaData.push(
        [{ yAxis: -1, itemStyle: { color: chartColors.zoneC, opacity: 0.08 } }, { yAxis: 1 }],
        [{ yAxis: 1, itemStyle: { color: chartColors.zoneB, opacity: 0.1 } }, { yAxis: 2 }],
        [{ yAxis: -2, itemStyle: { color: chartColors.zoneB, opacity: 0.1 } }, { yAxis: -1 }],
        [{ yAxis: 2, itemStyle: { color: chartColors.zoneA, opacity: 0.12 } }, { yAxis: 3 }],
        [{ yAxis: -3, itemStyle: { color: chartColors.zoneA, opacity: 0.12 } }, { yAxis: -2 }],
        [{ yAxis: 3, itemStyle: { color: chartColors.outOfControl, opacity: 0.15 } }, { yAxis: yMax }],
        [{ yAxis: yMin, itemStyle: { color: chartColors.outOfControl, opacity: 0.15 } }, { yAxis: -3 }],
      )
    } else {
      if (zone_boundaries.minus_1_sigma != null && zone_boundaries.plus_1_sigma != null) {
        markAreaData.push([{ yAxis: zone_boundaries.minus_1_sigma, itemStyle: { color: chartColors.zoneC, opacity: 0.08 } }, { yAxis: zone_boundaries.plus_1_sigma }])
      }
      if (zone_boundaries.plus_1_sigma != null && zone_boundaries.plus_2_sigma != null) {
        markAreaData.push([{ yAxis: zone_boundaries.plus_1_sigma, itemStyle: { color: chartColors.zoneB, opacity: 0.1 } }, { yAxis: zone_boundaries.plus_2_sigma }])
      }
      if (zone_boundaries.minus_2_sigma != null && zone_boundaries.minus_1_sigma != null) {
        markAreaData.push([{ yAxis: zone_boundaries.minus_2_sigma, itemStyle: { color: chartColors.zoneB, opacity: 0.1 } }, { yAxis: zone_boundaries.minus_1_sigma }])
      }
      if (zone_boundaries.plus_2_sigma != null && control_limits.ucl != null) {
        markAreaData.push([{ yAxis: zone_boundaries.plus_2_sigma, itemStyle: { color: chartColors.zoneA, opacity: 0.12 } }, { yAxis: control_limits.ucl }])
      }
      if (control_limits.lcl != null && zone_boundaries.minus_2_sigma != null) {
        markAreaData.push([{ yAxis: control_limits.lcl, itemStyle: { color: chartColors.zoneA, opacity: 0.12 } }, { yAxis: zone_boundaries.minus_2_sigma }])
      }
      if (control_limits.ucl != null) {
        markAreaData.push([{ yAxis: control_limits.ucl, itemStyle: { color: chartColors.outOfControl, opacity: 0.15 } }, { yAxis: yMax }])
      }
      if (control_limits.lcl != null) {
        markAreaData.push([{ yAxis: yMin, itemStyle: { color: chartColors.outOfControl, opacity: 0.15 } }, { yAxis: control_limits.lcl }])
      }
    }

    // --- Annotations ---
    // Annotation markers rendered as amber * at the top of the chart.
    // Point annotations keep the dashed vertical line; period annotations keep the shaded area.
    // Text labels are removed — users click the * to see annotation details.
    type AnnotationMarkArea = [Record<string, unknown>, Record<string, unknown>]
    const annotationMarkLines: Record<string, unknown>[] = []
    const annotationMarkAreas: AnnotationMarkArea[] = []
    // Each entry: [xVal, annotationId, annotationIndex] for the custom annotation marker series
    const annotationMarkerData: [number, number, number][] = []

    if (showAnnotations && annotations) {
      // Map sample_id → { catIndex (0-based position in visibleData), timestampMs }
      // For category axis, xAxis must be the 0-based index into the category array (NOT point.index)
      const sampleMap = new Map<number, { catIndex: number; timestampMs: number }>()
      for (let vi = 0; vi < visibleData.length; vi++) {
        const point = visibleData[vi]
        sampleMap.set(point.sample_id, { catIndex: vi, timestampMs: point.timestampMs })
      }

      let annIdx = 0
      for (const ann of annotations as Annotation[]) {
        const color = ann.color || 'hsl(45, 92%, 55%)'

        if (ann.annotation_type === 'point' && ann.sample_id != null) {
          const pt = sampleMap.get(ann.sample_id)
          if (!pt) continue
          const xVal = isTimestamp ? pt.timestampMs : pt.catIndex
          annotationMarkLines.push({
            xAxis: xVal,
            lineStyle: { color, type: 'dashed' as const, width: 1.5, opacity: 0.5 },
            label: { show: false },
          })
          annotationMarkerData.push([xVal, ann.id, annIdx])
        } else if (ann.annotation_type === 'period' && ann.start_sample_id != null && ann.end_sample_id != null) {
          const startPt = sampleMap.get(ann.start_sample_id)
          const endPt = sampleMap.get(ann.end_sample_id)
          if (!startPt || !endPt) continue
          const x1 = isTimestamp ? startPt.timestampMs : startPt.catIndex
          const x2 = isTimestamp ? endPt.timestampMs : endPt.catIndex
          annotationMarkAreas.push([
            { xAxis: x1, itemStyle: { color, opacity: 0.08, borderColor: color, borderWidth: 1, borderType: 'dashed' as const }, label: { show: false } },
            { xAxis: x2 },
          ])
          // Place * marker at midpoint of the period
          const midX = isTimestamp ? (x1 + x2) / 2 : (x1 + x2) / 2
          annotationMarkerData.push([midX, ann.id, annIdx])
        }
        annIdx++
      }
    }

    const hasAnnotationMarkers = annotationMarkerData.length > 0
    // Store annotation IDs for click handler lookup (ref mutation is safe here — side-effect of render)
    annotationMarkerIdsRef.current = annotationMarkerData.map((entry) => entry[1])

    // --- Build markLine for control limits and zone boundaries ---
    const markLineData: Record<string, unknown>[] = []

    if (isModeA) {
      markLineData.push(
        { yAxis: 3, lineStyle: { color: chartColors.uclLine, type: 'dashed', width: 1.5 }, label: { formatter: 'UCL: +3.0', position: 'end', color: chartColors.uclLine, fontSize: 11, fontWeight: 500 } },
        { yAxis: 0, lineStyle: { color: chartColors.centerLine, type: 'solid', width: 2.5 }, label: { formatter: 'CL: 0.0', position: 'end', color: chartColors.centerLine, fontSize: 11, fontWeight: 600 } },
        { yAxis: -3, lineStyle: { color: chartColors.lclLine, type: 'dashed', width: 1.5 }, label: { formatter: 'LCL: -3.0', position: 'end', color: chartColors.lclLine, fontSize: 11, fontWeight: 500 } },
      )
    } else {
      if (control_limits.ucl != null) markLineData.push({ yAxis: control_limits.ucl, lineStyle: { color: chartColors.uclLine, type: 'dashed', width: 1.5 }, label: { formatter: `UCL: ${formatVal(control_limits.ucl)}`, position: 'end', color: chartColors.uclLine, fontSize: 11, fontWeight: 500 } })
      if (control_limits.center_line != null) markLineData.push({ yAxis: control_limits.center_line, lineStyle: { color: chartColors.centerLine, type: 'solid', width: 2.5 }, label: { formatter: `CL: ${formatVal(control_limits.center_line)}`, position: 'end', color: chartColors.centerLine, fontSize: 11, fontWeight: 600 } })
      if (control_limits.lcl != null) markLineData.push({ yAxis: control_limits.lcl, lineStyle: { color: chartColors.lclLine, type: 'dashed', width: 1.5 }, label: { formatter: `LCL: ${formatVal(control_limits.lcl)}`, position: 'end', color: chartColors.lclLine, fontSize: 11, fontWeight: 500 } })
    }

    if (showSpecLimits && spec_limits.usl != null) {
      markLineData.push({ yAxis: spec_limits.usl, lineStyle: { color: 'hsl(357, 80%, 52%)', type: [8, 4] as unknown as string, width: 2 }, label: { formatter: `USL: ${formatVal(spec_limits.usl)}`, position: 'end', color: 'hsl(357, 80%, 45%)', fontSize: 10, fontWeight: 500 } })
    }
    if (showSpecLimits && spec_limits.lsl != null) {
      markLineData.push({ yAxis: spec_limits.lsl, lineStyle: { color: 'hsl(357, 80%, 52%)', type: [8, 4] as unknown as string, width: 2 }, label: { formatter: `LSL: ${formatVal(spec_limits.lsl)}`, position: 'end', color: 'hsl(357, 80%, 45%)', fontSize: 10, fontWeight: 500 } })
    }

    markLineData.push(...annotationMarkLines)
    const allMarkAreas = [...markAreaData, ...annotationMarkAreas]

    // --- Custom series renderItem for data point symbols ---
    // Captures visibleData, chartColors, highlightedRange, hoveredSampleIds from closure
    const localVisibleData = visibleData
    const localChartColors = chartColors
    const localHighlightedRange = highlightedRange
    const localHoveredSampleIds = hoveredSampleIds

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customRenderItem = (_params: any, api: any) => {
      const arrIndex = api.value(2) as number
      if (arrIndex < 0 || arrIndex >= localVisibleData.length) return { type: 'group', children: [] } as unknown
      const point = localVisibleData[arrIndex]

      // Use dimensions 0,1 (x,y) directly for pixel mapping — guarantees dots align with line
      const coord = api.coord([api.value(0), api.value(1)])
      const cx = coord[0]
      const cy = coord[1]

      const isViolation = point.hasViolation
      const isUndersized = point.is_undersized
      const isExcluded = point.excluded
      const violationRules = point.violationRules
      const primaryRule = getPrimaryViolationRule(violationRules)

      const pointValue = point.displayValue ?? point.mean
      const isHighlightedFromHistogram = localHighlightedRange != null &&
        pointValue >= localHighlightedRange[0] && pointValue < localHighlightedRange[1]
      const isHighlightedFromCrossChart = localHoveredSampleIds?.has(point.sample_id) ?? false
      const isHighlighted = isHighlightedFromHistogram || isHighlightedFromCrossChart

      const fillColor = isHighlighted
        ? 'hsl(45, 100%, 50%)'
        : isExcluded ? localChartColors.excludedPoint
        : isViolation ? localChartColors.violationPoint
        : isUndersized ? localChartColors.undersizedPoint
        : localChartColors.normalPoint

      const baseRadius = isHighlighted ? 7 : isViolation ? 6 : isUndersized ? 5 : 4
      const children: Record<string, unknown>[] = []

      // Highlight glow ring
      if (isHighlighted) {
        children.push({
          type: 'circle',
          shape: { cx, cy, r: baseRadius + 4 },
          style: { fill: 'none', stroke: 'hsl(45, 100%, 50%)', lineWidth: 2, opacity: 0.5 },
        })
      }

      if (isViolation) {
        children.push({
          type: 'polygon',
          shape: { points: [[cx, cy - baseRadius], [cx + baseRadius, cy], [cx, cy + baseRadius], [cx - baseRadius, cy]] },
          style: { fill: fillColor, shadowBlur: 4, shadowColor: fillColor },
        })
      } else if (isUndersized) {
        children.push({
          type: 'polygon',
          shape: { points: [[cx, cy - baseRadius], [cx + baseRadius, cy + baseRadius * 0.7], [cx - baseRadius, cy + baseRadius * 0.7]] },
          style: { fill: fillColor, stroke: isHighlighted ? 'hsl(35, 100%, 45%)' : localChartColors.undersizedPoint, lineWidth: 1.5 },
        })
      } else {
        children.push({
          type: 'circle',
          shape: { cx, cy, r: baseRadius },
          style: { fill: fillColor, stroke: isHighlighted ? 'hsl(35, 100%, 45%)' : undefined, lineWidth: isHighlighted ? 2 : 0 },
        })
      }

      // Violation badge
      if (isViolation && primaryRule) {
        children.push(
          { type: 'circle', shape: { cx, cy: cy - baseRadius - 8, r: 7 }, style: { fill: 'hsl(357, 80%, 52%)', stroke: '#fff', lineWidth: 1 } },
          { type: 'text', style: { x: cx, y: cy - baseRadius - 8, text: String(primaryRule), fill: '#fff', fontSize: 9, fontWeight: 700, textAlign: 'center', textVerticalAlign: 'middle' } },
        )
        if (violationRules.length > 1) {
          children.push({ type: 'text', style: { x: cx + 7, y: cy - baseRadius - 12, text: `+${violationRules.length - 1}`, fill: 'hsl(357, 80%, 45%)', fontSize: 8, fontWeight: 600 } })
        }
      }

      // Undersized ring
      if (isUndersized && !isViolation) {
        children.push({
          type: 'circle',
          shape: { cx, cy, r: baseRadius + 3 },
          style: { fill: 'none', stroke: localChartColors.undersizedPoint, lineWidth: 1.5, lineDash: [2, 2] },
        })
      }

      return { type: 'group', children } as unknown
    }

    // Time range for adaptive tick formatting
    const dataTimeRangeMs = visibleData.length > 1
      ? visibleData[visibleData.length - 1].timestampMs - visibleData[0].timestampMs
      : 0

    const bottomMargin = isTimestamp ? 60 : 30
    const xCategoryData = visibleData.map((p) => String(p.index))

    // Build xAxis config based on mode - using ECOption cast to avoid union narrowing issues
    const xAxisConfig = isTimestamp
      ? {
          type: 'value' as const,
          min: visibleData[0]?.timestampMs,
          max: visibleData[visibleData.length - 1]?.timestampMs,
          axisLabel: {
            fontSize: 12,
            rotate: 30,
            formatter: (value: number) => {
              const date = new Date(value)
              return dataTimeRangeMs > 86400000
                ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
            },
          },
          splitLine: { show: false },
          axisTick: { alignWithLabel: true },
        }
      : {
          type: 'category' as const,
          data: xCategoryData,
          axisLabel: { fontSize: 12 },
          splitLine: { show: false },
          axisTick: { alignWithLabel: true },
        }

    const gridTop = hasAnnotationMarkers ? 32 : 20

    const option = {
      animation: false,
      grid: { top: gridTop, right: 60, left: 60, bottom: bottomMargin, containLabel: false },
      xAxis: xAxisConfig,
      yAxis: {
        type: 'value',
        min: yMin,
        max: yMax,
        axisLabel: { fontSize: 12, formatter: (value: number) => value.toFixed(decimal_precision) },
        name: isModeA ? 'Z-Score' : 'Value',
        nameLocation: 'middle',
        nameGap: 45,
        nameTextStyle: { fontSize: 12 },
        splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } },
      },
      tooltip: {
        trigger: 'item',
        transitionDuration: 0,
        extraCssText: 'transition: none !important;',
        position: (point: number[]) => [point[0] + 10, point[1] - 10],
        formatter: (params: unknown) => {
          const p = params as { dataIndex: number; seriesType: string; seriesIndex: number }
          // Only show tooltip for custom series (data points), not the line
          if (p.seriesType === 'line') return ''
          // Annotation marker series (seriesIndex 2) — show brief tooltip
          if (p.seriesIndex === 2 && annotations) {
            const markerEntry = annotationMarkerData[p.dataIndex]
            if (!markerEntry) return ''
            const annId = markerEntry[1]
            const ann = (annotations as Annotation[]).find((a) => a.id === annId)
            if (!ann) return ''
            const preview = ann.text.length > 60 ? ann.text.substring(0, 60) + '...' : ann.text
            return `<div style="font-size:12px;max-width:250px"><div style="font-weight:600;color:hsl(45,92%,55%);margin-bottom:4px">Annotation</div><div>${preview}</div><div style="opacity:0.6;margin-top:4px;font-size:11px">Click to view details</div></div>`
          }
          const point = localVisibleData[p.dataIndex]
          if (!point) return ''

          let html = `<div style="font-size:13px;font-weight:500">Sample #${point.index}</div>`
          html += `<div>n = ${point.actual_n}</div>`

          if (isModeA) {
            html += `<div>Z-Score: ${formatVal(point.z_score ?? point.mean)}</div>`
          } else if (localIsModeB && point.effective_ucl) {
            html += `<div>Value: ${formatVal(point.displayValue ?? point.mean)}</div>`
            html += `<div style="opacity:0.7">UCL: ${formatVal(point.effective_ucl)}</div>`
            html += `<div style="opacity:0.7">LCL: ${formatVal(point.effective_lcl)}</div>`
          } else {
            html += `<div>Value: ${formatVal(point.mean)}</div>`
          }

          html += `<div style="opacity:0.7">${point.timestamp}</div>`
          if (point.is_undersized) html += `<div style="color:hsl(32,63%,51%);font-weight:500">Undersized sample</div>`

          if (point.hasViolation && point.violationRules.length > 0) {
            html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(128,128,128,0.3)">`
            html += `<div style="color:hsl(357,80%,52%);font-weight:500;margin-bottom:4px">Violations:</div>`
            for (const ruleId of point.violationRules) {
              html += `<div style="font-size:11px;opacity:0.8">${ruleId}: ${NELSON_RULES[ruleId]?.name || `Rule ${ruleId}`}</div>`
            }
            html += `</div>`
          }
          return html
        },
      },
      series: [
        // Line series for the data path + markLine/markArea decorations
        {
          type: 'line',
          data: isTimestamp ? visibleData.map((p) => [p.timestampMs, p.mean]) : visibleData.map((p) => p.mean),
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
          markLine: { symbol: 'none', silent: true, data: markLineData as never[] },
          markArea: { silent: true, data: allMarkAreas as never[] },
          z: 5,
        },
        // Custom series for data point symbols (shapes, violation badges, etc.)
        {
          type: 'custom',
          data: visibleData.map((p, i) => {
            const xVal = isTimestamp ? p.timestampMs : i
            return [xVal, p.mean, i]
          }),
          renderItem: customRenderItem,
          coordinateSystem: 'cartesian2d',
          encode: { x: 0, y: 1 },
          z: 10,
          silent: false,
        },
        // Annotation marker series — amber * at the top of the chart
        ...(hasAnnotationMarkers ? [{
          type: 'custom' as const,
          data: annotationMarkerData.map((entry) => [entry[0], yMax, entry[2]]),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          renderItem: (_params: any, api: any) => {
            const coord = api.coord([api.value(0), api.value(1)])
            const cx = coord[0]
            // Place the * near the top of the grid area
            const cy = gridTop - 2
            return {
              type: 'text',
              style: {
                x: cx,
                y: cy,
                text: '*',
                fill: 'hsl(45, 92%, 55%)',
                fontSize: 22,
                fontWeight: 900,
                textAlign: 'center',
                textVerticalAlign: 'bottom',
              },
              // Use textShadow for visibility against both light and dark backgrounds
              emphasis: {
                style: {
                  fill: 'hsl(45, 100%, 65%)',
                  fontSize: 24,
                },
              },
            } as unknown
          },
          coordinateSystem: 'cartesian2d',
          encode: { x: 0, y: 1 },
          z: 15,
          silent: false,
        }] : []),
      ],
    }

    return option
  }, [
    chartData, visibleData, data, xAxisMode, chartColors, lineColors, isModeA,
    externalDomain, showSpecLimits, showAnnotations, annotations,
    highlightedRange, hoveredSampleIds,
  ])

  // Mouse event handlers bridging ECharts -> ChartHoverContext
  const handleMouseMove = useCallback((params: EChartsMouseEvent) => {
    const idx = params.dataIndex
    const point = dataRef.current[idx]
    if (point) {
      onHoverSample(point.sample_id)
      onHoverValue?.(point.displayValue ?? point.mean)
    }
  }, [onHoverSample, onHoverValue])

  const handleMouseOut = useCallback(() => {
    onLeaveSample()
    onHoverValue?.(null)
  }, [onLeaveSample, onHoverValue])

  const handleClick = useCallback((params: EChartsMouseEvent) => {
    // Annotation marker click (seriesIndex 2 = annotation marker series)
    if (params.seriesIndex === 2 && annotationsRef.current) {
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
    // Data point click for creating point annotations
    const idx = params.dataIndex
    const point = dataRef.current[idx]
    if (point && onPointAnnotation) {
      onPointAnnotation(point.sample_id)
    }
  }, [onPointAnnotation])

  const { containerRef, refresh } = useECharts({
    option: echartsOption,
    notMerge: true,
    onMouseMove: handleMouseMove,
    onMouseOut: handleMouseOut,
    onClick: handleClick,
  })

  // Refresh on theme color changes
  useEffect(() => {
    refresh()
  }, [chartColors, refresh])

  // Derive header values (safe even when chartData is null)
  const hasData = !!chartData && !!chartData.data_points && chartData.data_points.length > 0

  const isModeB = chartData?.subgroup_mode === 'VARIABLE_LIMITS'
  const chartTypeLabel = isModeA ? 'Z-Score Chart' : isModeB ? 'Variable Limits Chart' : 'X-Bar Chart'

  const breadcrumb = hierarchyPath.length > 0
    ? [...hierarchyPath, chartData?.characteristic_name].filter(Boolean).join(' / ')
    : chartData?.characteristic_name ?? ''

  return (
    <div className="h-full bg-card border border-border rounded-2xl p-5 flex flex-col">
      {/* Header */}
      {hasData && (
        <div className="flex justify-between items-center mb-4 h-5 flex-shrink-0">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {label && (
                <span className="text-xs font-medium px-1.5 py-0.5 bg-primary/10 text-primary rounded flex-shrink-0">
                  {label}
                </span>
              )}
              <h3 className="font-semibold text-sm leading-5 truncate" title={breadcrumb}>
                <span className="text-muted-foreground">{hierarchyPath.join(' / ')}{hierarchyPath.length > 0 && ' / '}</span>
                <span>{chartData?.characteristic_name}</span>
                <span className="text-muted-foreground font-normal"> - {chartTypeLabel}</span>
              </h3>
            </div>
            {allViolatedRules.length > 0 && (
              <ViolationLegend violatedRules={allViolatedRules} compact className="ml-2" />
            )}
          </div>
        </div>
      )}

      {/* Chart container — ALWAYS rendered so useECharts can init */}
      <div ref={chartWrapperRef} className="flex-1 min-h-0 relative">
        <div ref={containerRef} className="absolute inset-0" style={{ visibility: hasData ? 'visible' : 'hidden' }} />
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
    </div>
  )
}
