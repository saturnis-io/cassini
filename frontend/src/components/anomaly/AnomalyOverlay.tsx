import type { AnomalyEvent } from '@/types/anomaly'

const SEVERITY_COLORS: Record<string, string> = {
  INFO: '#3b82f6',
  WARNING: '#f59e0b',
  CRITICAL: '#ef4444',
}

function severityColor(severity: string): string {
  return SEVERITY_COLORS[severity] ?? '#6b7280'
}

interface MarkPointItem {
  coord: [number, number]
  symbol: string
  symbolSize: number
  symbolRotate?: number
  itemStyle: { color: string; borderColor?: string; borderWidth?: number }
  label?: {
    show: boolean
    formatter: string
    position: string
    fontSize?: number
    color?: string
  }
}

interface MarkAreaItem {
  itemStyle: { color: string }
  label?: { show: boolean; formatter: string; position: string; fontSize?: number }
}

interface MarkLineItem {
  xAxis: number
  lineStyle: { color: string; type: string; width: number }
  label?: { show: boolean; formatter: string; position: string; fontSize?: number; color?: string }
}

export interface AnomalyMarks {
  markPoints: MarkPointItem[]
  markAreas: [MarkAreaItem, MarkAreaItem][]
  markLines: MarkLineItem[]
}

/**
 * Converts anomaly events to ECharts markPoint, markArea, and markLine data
 * for overlaying on existing control charts.
 */
export function buildAnomalyMarks(
  events: AnomalyEvent[],
  dataPoints: { sample_id: number; mean?: number; plotted_value?: number }[],
): AnomalyMarks {
  const markPoints: MarkPointItem[] = []
  const markAreas: [MarkAreaItem, MarkAreaItem][] = []
  const markLines: MarkLineItem[] = []

  for (const event of events) {
    if (event.is_dismissed) continue

    const color = severityColor(event.severity)

    if (event.event_type === 'changepoint') {
      const sampleIndex = dataPoints.findIndex((p) => p.sample_id === event.sample_id)
      if (sampleIndex >= 0) {
        const yVal =
          dataPoints[sampleIndex].mean ?? dataPoints[sampleIndex].plotted_value ?? 0

        // Diamond marker at the changepoint
        markPoints.push({
          coord: [sampleIndex, yVal],
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
        })

        // Vertical dashed line at the changepoint
        markLines.push({
          xAxis: sampleIndex,
          lineStyle: { color, type: 'dashed', width: 1 },
          label: {
            show: false,
            formatter: '',
            position: 'end',
          },
        })
      }
    }

    if (event.event_type === 'outlier') {
      const sampleIndex = dataPoints.findIndex((p) => p.sample_id === event.sample_id)
      if (sampleIndex >= 0) {
        const yVal =
          dataPoints[sampleIndex].mean ?? dataPoints[sampleIndex].plotted_value ?? 0

        // Inverted triangle marker
        markPoints.push({
          coord: [sampleIndex, yVal],
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
        })
      }
    }

    if (event.event_type === 'distribution_shift') {
      // Shaded region across the shifted window
      const startIndex = event.window_start_id
        ? dataPoints.findIndex((p) => p.sample_id === event.window_start_id)
        : -1
      const endIndex = event.window_end_id
        ? dataPoints.findIndex((p) => p.sample_id === event.window_end_id)
        : -1

      if (startIndex >= 0 && endIndex >= 0) {
        markAreas.push([
          {
            itemStyle: { color: `${color}15` },
            label: {
              show: true,
              formatter: 'Dist. Shift',
              position: 'insideTop',
              fontSize: 9,
            },
          },
          {
            itemStyle: { color: `${color}15` },
          },
        ])
      }
    }
  }

  return { markPoints, markAreas, markLines }
}

/**
 * Generates tooltip content for an anomaly event.
 */
export function getAnomalyTooltip(event: AnomalyEvent): string {
  const parts = [
    `<strong>${event.event_type.replace('_', ' ').toUpperCase()}</strong>`,
    `Detector: ${event.detector_type.replace('_', ' ')}`,
    `Severity: ${event.severity}`,
  ]

  if (event.summary) {
    parts.push(`<br/>${event.summary}`)
  }

  if (event.is_acknowledged) {
    parts.push(`<br/><em>Acknowledged by ${event.acknowledged_by}</em>`)
  }

  return parts.join('<br/>')
}
