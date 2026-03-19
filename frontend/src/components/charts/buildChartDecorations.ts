import type { RenderItemParams, RenderItemAPI } from '@/lib/echarts'
import type { ChartPoint } from '@/components/PinnedChartTooltip'
import type { Annotation } from '@/types'
import { applyFormat } from '@/lib/date-format'

/** Parse a timestamp string as UTC even when the backend omits the Z suffix. */
export function parseUtc(ts: string): number {
  if (ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(ts)) return new Date(ts).getTime()
  return new Date(ts + 'Z').getTime()
}

// ---------------------------------------------------------------------------
// Zone shading mark areas
// ---------------------------------------------------------------------------

type MarkAreaPair = [Record<string, unknown>, Record<string, unknown>]

interface ZoneMarkAreaParams {
  isModeA: boolean | undefined
  zone_boundaries: {
    minus_1_sigma: number | null
    plus_1_sigma: number | null
    minus_2_sigma: number | null
    plus_2_sigma: number | null
  }
  control_limits: {
    ucl: number | null
    lcl: number | null
  }
  chartColors: {
    zoneA: string
    zoneB: string
    zoneC: string
    outOfControl: string
  }
  yMin: number
  yMax: number
}

/**
 * Build markArea data pairs for zone shading (C / B / A / out-of-control).
 * Mode A (standardized) uses fixed Z-score boundaries; Mode B+ uses the
 * zone_boundaries and control_limits from the server.
 */
export function buildZoneMarkAreas(params: ZoneMarkAreaParams): MarkAreaPair[] {
  const { isModeA, zone_boundaries, control_limits, chartColors, yMin, yMax } = params
  const markAreaData: MarkAreaPair[] = []

  if (isModeA) {
    markAreaData.push(
      [{ yAxis: -1, itemStyle: { color: chartColors.zoneC, opacity: 0.08 } }, { yAxis: 1 }],
      [{ yAxis: 1, itemStyle: { color: chartColors.zoneB, opacity: 0.1 } }, { yAxis: 2 }],
      [{ yAxis: -2, itemStyle: { color: chartColors.zoneB, opacity: 0.1 } }, { yAxis: -1 }],
      [{ yAxis: 2, itemStyle: { color: chartColors.zoneA, opacity: 0.12 } }, { yAxis: 3 }],
      [{ yAxis: -3, itemStyle: { color: chartColors.zoneA, opacity: 0.12 } }, { yAxis: -2 }],
      [
        { yAxis: 3, itemStyle: { color: chartColors.outOfControl, opacity: 0.15 } },
        { yAxis: yMax },
      ],
      [
        { yAxis: yMin, itemStyle: { color: chartColors.outOfControl, opacity: 0.15 } },
        { yAxis: -3 },
      ],
    )
  } else {
    if (zone_boundaries.minus_1_sigma != null && zone_boundaries.plus_1_sigma != null) {
      markAreaData.push([
        {
          yAxis: zone_boundaries.minus_1_sigma,
          itemStyle: { color: chartColors.zoneC, opacity: 0.08 },
        },
        { yAxis: zone_boundaries.plus_1_sigma },
      ])
    }
    if (zone_boundaries.plus_1_sigma != null && zone_boundaries.plus_2_sigma != null) {
      markAreaData.push([
        {
          yAxis: zone_boundaries.plus_1_sigma,
          itemStyle: { color: chartColors.zoneB, opacity: 0.1 },
        },
        { yAxis: zone_boundaries.plus_2_sigma },
      ])
    }
    if (zone_boundaries.minus_2_sigma != null && zone_boundaries.minus_1_sigma != null) {
      markAreaData.push([
        {
          yAxis: zone_boundaries.minus_2_sigma,
          itemStyle: { color: chartColors.zoneB, opacity: 0.1 },
        },
        { yAxis: zone_boundaries.minus_1_sigma },
      ])
    }
    if (zone_boundaries.plus_2_sigma != null && control_limits.ucl != null) {
      markAreaData.push([
        {
          yAxis: zone_boundaries.plus_2_sigma,
          itemStyle: { color: chartColors.zoneA, opacity: 0.12 },
        },
        { yAxis: control_limits.ucl },
      ])
    }
    if (control_limits.lcl != null && zone_boundaries.minus_2_sigma != null) {
      markAreaData.push([
        { yAxis: control_limits.lcl, itemStyle: { color: chartColors.zoneA, opacity: 0.12 } },
        { yAxis: zone_boundaries.minus_2_sigma },
      ])
    }
    if (control_limits.ucl != null) {
      markAreaData.push([
        {
          yAxis: control_limits.ucl,
          itemStyle: { color: chartColors.outOfControl, opacity: 0.15 },
        },
        { yAxis: yMax },
      ])
    }
    if (control_limits.lcl != null) {
      markAreaData.push([
        { yAxis: yMin, itemStyle: { color: chartColors.outOfControl, opacity: 0.15 } },
        { yAxis: control_limits.lcl },
      ])
    }
  }

  return markAreaData
}

// ---------------------------------------------------------------------------
// Annotation decorations (mark lines, mark areas, marker data)
// ---------------------------------------------------------------------------

type AnnotationMarkArea = [Record<string, unknown>, Record<string, unknown>]

interface AnnotationDecorationsParams {
  annotations: Annotation[]
  data: ChartPoint[]
  useTimeCoords: boolean
  annotationColor: string
}

export interface AnnotationDecorations {
  markLines: Record<string, unknown>[]
  markAreas: AnnotationMarkArea[]
  /** Each entry: [xVal, annotationId, annotationIndex, x2OrNaN] */
  markerData: [number, number, number, number][]
}

/**
 * Process annotation records into ECharts mark lines (point annotations),
 * mark areas (period annotations), and marker data for the custom star/bracket
 * series.
 */
export function buildAnnotationDecorations(
  params: AnnotationDecorationsParams,
): AnnotationDecorations {
  const { annotations, data, useTimeCoords, annotationColor } = params

  const markLines: Record<string, unknown>[] = []
  const markAreas: AnnotationMarkArea[] = []
  const markerData: [number, number, number, number][] = []

  if (!annotations || annotations.length === 0) {
    return { markLines, markAreas, markerData }
  }

  // Map sample_id -> { catIndex (0-based position in data), timestampMs }
  const sampleMap = new Map<number, { catIndex: number; timestampMs: number }>()
  for (let vi = 0; vi < data.length; vi++) {
    const point = data[vi]
    sampleMap.set(point.sample_id, { catIndex: vi, timestampMs: point.timestampMs })
  }

  let annIdx = 0
  for (const ann of annotations) {
    const color = ann.color || annotationColor

    if (ann.annotation_type === 'point' && ann.sample_id != null) {
      const pt = sampleMap.get(ann.sample_id)
      if (!pt) { annIdx++; continue }
      const xVal = useTimeCoords ? pt.timestampMs : pt.catIndex
      markLines.push({
        xAxis: xVal,
        lineStyle: { color, type: 'dashed' as const, width: 1.5, opacity: 0.7 },
        label: { show: false },
      })
      markerData.push([xVal, ann.id, annIdx, NaN])
    } else if (ann.annotation_type === 'period') {
      let x1: number | null = null
      let x2: number | null = null

      if (ann.start_time && ann.end_time) {
        const startMs = parseUtc(ann.start_time)
        const endMs = parseUtc(ann.end_time)
        if (useTimeCoords) {
          x1 = startMs
          x2 = endMs
        } else {
          // Index mode: find nearest data points by timestamp
          let bestStartIdx = 0
          let bestEndIdx = data.length - 1
          for (let i = 0; i < data.length; i++) {
            if (data[i].timestampMs >= startMs) {
              bestStartIdx = i
              break
            }
          }
          for (let i = data.length - 1; i >= 0; i--) {
            if (data[i].timestampMs <= endMs) {
              bestEndIdx = i
              break
            }
          }
          if (bestStartIdx <= bestEndIdx) {
            x1 = bestStartIdx
            x2 = bestEndIdx
          }
        }
      } else if (ann.start_sample_id != null && ann.end_sample_id != null) {
        // Legacy sample-based period annotation
        const startPt = sampleMap.get(ann.start_sample_id)
        const endPt = sampleMap.get(ann.end_sample_id)
        if (startPt && endPt) {
          x1 = useTimeCoords ? startPt.timestampMs : startPt.catIndex
          x2 = useTimeCoords ? endPt.timestampMs : endPt.catIndex
        }
      }

      if (x1 != null && x2 != null) {
        markAreas.push([
          {
            xAxis: x1,
            itemStyle: {
              color,
              opacity: 0.18,
              borderColor: color,
              borderWidth: 1,
              borderType: 'dashed' as const,
            },
            label: { show: false },
          },
          { xAxis: x2 },
        ])
        markerData.push([x1, ann.id, annIdx, x2])
      }
    }
    annIdx++
  }

  return { markLines, markAreas, markerData }
}

// ---------------------------------------------------------------------------
// Y-axis domain calculation
// ---------------------------------------------------------------------------

interface ForecastPointBounds {
  predicted_value: number
  upper_95?: number | null
  lower_95?: number | null
}

export interface ComputeYDomainParams {
  data: ChartPoint[]
  isModeA: boolean | undefined
  shortRunMode: string | null
  externalDomain?: [number, number]
  showSpecLimits: boolean
  control_limits: { ucl: number | null; lcl: number | null }
  spec_limits: { usl: number | null; lsl: number | null }
  forecastPoints?: ForecastPointBounds[] | null
}

/**
 * Compute the Y-axis domain (min/max) from data values, control limits,
 * spec limits, and optional forecast bounds. Handles Z-score (Mode A /
 * short-run standardized), external (shared) domains, and normal mode.
 */
export function computeYDomain(params: ComputeYDomainParams): { yMin: number; yMax: number } {
  const {
    data,
    isModeA,
    shortRunMode,
    externalDomain,
    showSpecLimits,
    control_limits,
    spec_limits,
    forecastPoints,
  } = params

  const isZScaleDomain = isModeA || shortRunMode === 'standardized'
  let yMin: number
  let yMax: number

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
  if (forecastPoints) {
    for (const p of forecastPoints) {
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

  return { yMin, yMax }
}

// ---------------------------------------------------------------------------
// Annotation marker renderItem factory
// ---------------------------------------------------------------------------

export interface AnnotationMarkerRendererParams {
  annotationColor: string
  gridTop: number
}

/**
 * Factory that returns a renderItem function for the annotation marker custom
 * series.  Draws `*` markers for point annotations and bracket shapes for
 * period annotations.
 */
export function buildAnnotationMarkerRenderer(
  params: AnnotationMarkerRendererParams,
): (_params: RenderItemParams, api: RenderItemAPI) => unknown {
  const { annotationColor, gridTop } = params

  return (_params: RenderItemParams, api: RenderItemAPI): unknown => {
    const annColor = annotationColor
    const x1Coord = api.coord([api.value(0), api.value(1)])
    const x1Px = x1Coord[0]
    const cy = gridTop - 2
    const x2Raw = api.value(3) as number
    const isPeriod = x2Raw != null && !isNaN(x2Raw)

    if (isPeriod) {
      // Period annotation: horizontal bracket spanning x1 -> x2
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
  }
}

// ---------------------------------------------------------------------------
// X-axis config builder
// ---------------------------------------------------------------------------

export interface BuildXAxisConfigParams {
  useTimeCoords: boolean
  isDark: boolean
  /** 'timestamp' or 'index' — the raw xAxisMode from the dashboard store */
  xAxisMode: string
  /** Pre-formatted category labels (display keys or timestamps) */
  xCategoryData: string[]
  xTimestampLabels: string[]
  /** Millisecond spread of the visible data range (for date format selection) */
  dataTimeRangeMs: number
  axisFormats: { short: string; medium: string; timeOnly: string }
}

/**
 * Build the xAxis configuration object based on whether the chart uses a
 * continuous time axis or an evenly-spaced category axis.
 */
export function buildXAxisConfig(params: BuildXAxisConfigParams): Record<string, unknown> {
  const {
    useTimeCoords,
    isDark,
    xAxisMode,
    xCategoryData,
    xTimestampLabels,
    dataTimeRangeMs,
    axisFormats,
  } = params

  const isTimestamp = xAxisMode === 'timestamp'
  const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
  const axisLineColor = isDark ? 'hsl(220, 10%, 30%)' : 'hsl(210, 15%, 80%)'

  if (useTimeCoords) {
    return {
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
  }

  return {
    type: 'category' as const,
    boundaryGap: false,
    data: isTimestamp ? xTimestampLabels : xCategoryData,
    axisLabel: { fontSize: 11, rotate: 30, color: axisLabelColor },
    axisLine: { lineStyle: { color: axisLineColor } },
    splitLine: { show: false },
  }
}
