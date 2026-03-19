import type { ChartPoint } from '@/components/PinnedChartTooltip'
import type { Annotation } from '@/types'

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
