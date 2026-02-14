import type { AnomalyEvent } from '@/types/anomaly'

const SEVERITY_COLORS: Record<string, string> = {
  INFO: '#3b82f6',
  WARNING: '#f59e0b',
  CRITICAL: '#ef4444',
}

function severityColor(severity: string): string {
  return SEVERITY_COLORS[severity.toUpperCase()] ?? '#6b7280'
}

const DETECTOR_LABELS: Record<string, string> = {
  pelt: 'PELT Changepoint',
  ks_test: 'Kolmogorov-Smirnov',
  isolation_forest: 'Isolation Forest',
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  changepoint: 'Changepoint',
  distribution_shift: 'Distribution Shift',
  outlier: 'Outlier',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

export interface AnomalyMarks {
  markPoints: AnyRecord[]
  markAreas: [AnyRecord, AnyRecord][]
  markLines: AnyRecord[]
}

function buildTooltipHtml(event: AnomalyEvent): string {
  const color = severityColor(event.severity)
  const typeLabel = EVENT_TYPE_LABELS[event.event_type] ?? event.event_type
  const detectorLabel = DETECTOR_LABELS[event.detector_type] ?? event.detector_type

  let html = `<div style="max-width:320px;font-size:12px">`
  html += `<div style="font-weight:600;color:${color};margin-bottom:4px">${typeLabel}</div>`
  html += `<div style="opacity:0.7;margin-bottom:6px">Detector: ${detectorLabel} &middot; Severity: ${event.severity}</div>`

  if (event.summary) {
    html += `<div style="line-height:1.4">${event.summary}</div>`
  }

  if (event.is_acknowledged && event.acknowledged_by) {
    html += `<div style="opacity:0.6;margin-top:4px;font-style:italic">Acknowledged by ${event.acknowledged_by}</div>`
  }

  html += `</div>`
  return html
}

/**
 * Converts anomaly events to ECharts markPoint, markArea, and markLine data
 * for overlaying on existing control charts. Each mark carries tooltip metadata.
 *
 * @param events Anomaly events from the API
 * @param dataPoints Chart data points with sample_id, mean, and xValue
 *   (xValue should be the category index for index mode or timestampMs for timestamp mode)
 */
export function buildAnomalyMarks(
  events: AnomalyEvent[],
  dataPoints: { sample_id: number; mean?: number; plotted_value?: number; xValue: number }[],
): AnomalyMarks {
  const markPoints: AnyRecord[] = []
  const markAreas: [AnyRecord, AnyRecord][] = []
  const markLines: AnyRecord[] = []

  for (const event of events) {
    if (event.is_dismissed) continue

    const color = severityColor(event.severity)
    const tooltipHtml = buildTooltipHtml(event)

    if (event.event_type === 'changepoint') {
      const sampleIndex = dataPoints.findIndex((p) => p.sample_id === event.sample_id)
      if (sampleIndex >= 0) {
        const pt = dataPoints[sampleIndex]
        const yVal = pt.mean ?? pt.plotted_value ?? 0

        markPoints.push({
          coord: [pt.xValue, yVal],
          symbol: 'diamond',
          symbolSize: 14,
          itemStyle: { color, borderColor: '#fff', borderWidth: 1 },
          label: {
            show: true,
            formatter: 'CP',
            position: 'top',
            fontSize: 9,
            color,
          },
          _tooltipHtml: tooltipHtml,
        })

        markLines.push({
          xAxis: pt.xValue,
          lineStyle: { color, type: 'dashed', width: 1 },
          label: { show: false },
          _tooltipHtml: tooltipHtml,
        })
      }
    }

    if (event.event_type === 'outlier') {
      const sampleIndex = dataPoints.findIndex((p) => p.sample_id === event.sample_id)
      if (sampleIndex >= 0) {
        const pt = dataPoints[sampleIndex]
        const yVal = pt.mean ?? pt.plotted_value ?? 0

        markPoints.push({
          coord: [pt.xValue, yVal],
          symbol: 'triangle',
          symbolSize: 12,
          symbolRotate: 180,
          itemStyle: { color, borderColor: '#fff', borderWidth: 1 },
          label: {
            show: true,
            formatter: 'AI',
            position: 'bottom',
            fontSize: 8,
            color,
          },
          _tooltipHtml: tooltipHtml,
        })
      }
    }

    if (event.event_type === 'distribution_shift') {
      const startIndex = event.window_start_id
        ? dataPoints.findIndex((p) => p.sample_id === event.window_start_id)
        : -1
      const endIndex = event.window_end_id
        ? dataPoints.findIndex((p) => p.sample_id === event.window_end_id)
        : -1

      if (startIndex >= 0 && endIndex >= 0) {
        markAreas.push([
          {
            xAxis: dataPoints[startIndex].xValue,
            itemStyle: { color: `${color}40` },
            label: {
              show: true,
              formatter: 'Distribution Shift',
              position: 'insideTop',
              fontSize: 9,
              color,
            },
            _tooltipHtml: tooltipHtml,
          },
          {
            xAxis: dataPoints[endIndex].xValue,
            itemStyle: { color: `${color}40` },
          },
        ])
      }
    }
  }

  return { markPoints, markAreas, markLines }
}
