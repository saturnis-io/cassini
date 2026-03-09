import type { AnomalyEvent } from '@/types/anomaly'
import {
  severityColor,
  DETECTOR_LABELS,
  DETECTOR_TECHNICAL,
  EVENT_TYPE_LABELS,
  escapeHtml,
} from '@/lib/anomaly-labels'

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
  const detectorFriendly = DETECTOR_LABELS[event.detector_type] ?? event.detector_type
  const detectorTech = DETECTOR_TECHNICAL[event.detector_type] ?? event.detector_type

  let html = `<div style="max-width:320px;font-size:12px;overflow-wrap:break-word;word-wrap:break-word">`
  html += `<div style="font-weight:600;color:${color};margin-bottom:4px">${typeLabel}</div>`
  html += `<div style="opacity:0.7;margin-bottom:6px">${detectorFriendly} &middot; ${event.severity}`
  html += `<span style="opacity:0.5;margin-left:6px">(${escapeHtml(detectorTech)})</span></div>`

  if (event.summary) {
    html += `<div style="line-height:1.4">${escapeHtml(event.summary)}</div>`
  }

  if (event.is_acknowledged && event.acknowledged_by) {
    html += `<div style="opacity:0.6;margin-top:4px;font-style:italic">Acknowledged by ${escapeHtml(event.acknowledged_by)}</div>`
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
  if (dataPoints.length === 0) return { markPoints: [], markAreas: [], markLines: [] }

  const markPoints: AnyRecord[] = []
  const markAreas: [AnyRecord, AnyRecord][] = []
  const markLines: AnyRecord[] = []

  // Collect changepoint positions first so we can shade between them
  const changepointEntries: {
    event: AnomalyEvent
    sampleIndex: number
    pt: (typeof dataPoints)[0]
    color: string
    tooltipHtml: string
  }[] = []

  for (const event of events) {
    if (event.is_dismissed) continue
    if (event.event_type === 'changepoint') {
      const sampleIndex = dataPoints.findIndex((p) => p.sample_id === event.sample_id)
      if (sampleIndex >= 0) {
        changepointEntries.push({
          event,
          sampleIndex,
          pt: dataPoints[sampleIndex],
          color: severityColor(event.severity),
          tooltipHtml: buildTooltipHtml(event),
        })
      }
    }
  }
  // Sort by position in the data so shading spans are sequential
  changepointEntries.sort((a, b) => a.sampleIndex - b.sampleIndex)

  // Build changepoint marks: diamond, vertical line, and shaded region to next changepoint
  for (let ci = 0; ci < changepointEntries.length; ci++) {
    const { event, pt, color, tooltipHtml } = changepointEntries[ci]
    const yVal = pt.mean ?? pt.plotted_value ?? 0
    const detectorTag = DETECTOR_LABELS[event.detector_type] ?? event.detector_type

    // Diamond marker on the data point
    markPoints.push({
      coord: [pt.xValue, yVal],
      symbol: 'diamond',
      symbolSize: 16,
      itemStyle: { color, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      _tooltipHtml: tooltipHtml,
    })

    // Build a rich label for the top of the chart
    const summarySnippet = event.summary
      ? event.summary.length > 60
        ? event.summary.slice(0, 57) + '...'
        : event.summary
      : ''
    const topLabel = summarySnippet
      ? `{badge|${detectorTag} · ${event.severity}}\n{summary|${summarySnippet}}`
      : `{badge|${detectorTag} · ${event.severity}}`

    // Vertical dashed line with detector + context label pinned above chart
    markLines.push({
      xAxis: pt.xValue,
      symbol: ['none', 'none'],
      lineStyle: { color, type: 'dashed', width: 1.5 },
      label: {
        show: true,
        formatter: topLabel,
        position: 'end',
        fontSize: 10,
        rich: {
          badge: {
            fontSize: 10,
            fontWeight: 'bold',
            color: '#fff',
            backgroundColor: color,
            borderRadius: 3,
            padding: [3, 8],
            align: 'center',
          },
          summary: {
            fontSize: 9,
            color,
            padding: [4, 0, 0, 0],
            align: 'center',
            lineHeight: 14,
          },
        },
      },
      _tooltipHtml: tooltipHtml,
    })

    // Shaded region from this changepoint to the next (or end of visible data)
    const endXValue =
      ci + 1 < changepointEntries.length
        ? changepointEntries[ci + 1].pt.xValue
        : dataPoints[dataPoints.length - 1].xValue
    if (endXValue !== pt.xValue) {
      markAreas.push([
        {
          xAxis: pt.xValue,
          itemStyle: { color: `${color}18` },
          label: { show: false },
          _tooltipHtml: tooltipHtml,
        },
        {
          xAxis: endXValue,
          itemStyle: { color: `${color}18` },
        },
      ])
    }
  }

  for (const event of events) {
    if (event.is_dismissed) continue
    // Changepoints already handled above
    if (event.event_type === 'changepoint') continue

    const color = severityColor(event.severity)
    const tooltipHtml = buildTooltipHtml(event)

    if (event.event_type === 'outlier' || (event.event_type as string) === 'anomaly_score') {
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
              formatter: EVENT_TYPE_LABELS['distribution_shift'] ?? 'Distribution Drift',
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
