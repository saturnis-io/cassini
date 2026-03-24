/**
 * Builds the ECharts tooltip formatter function for control chart data points.
 *
 * Handles annotation marker tooltips, data point value display (with mode-
 * specific formatting), violation badges, and AI anomaly insight sections.
 */

import type { ChartPoint } from '@/components/PinnedChartTooltip'
import { formatDisplayKey } from '@/lib/display-key'
import type { AnomalyEvent } from '@/types/anomaly'
import type { Annotation } from '@/types'
import {
  EVENT_TYPE_LABELS as ANOMALY_TYPE_LABELS,
  SEVERITY_COLORS,
  escapeHtml,
} from '@/lib/anomaly-labels'
import { NELSON_RULES } from '@/components/ViolationLegend'

interface BuildTooltipFormatterParams {
  data: ChartPoint[]
  isModeA: boolean | undefined
  localIsModeB: boolean
  shortRunMode: string | null
  formatVal: (value: number | null | undefined) => string
  annotations: Annotation[] | undefined
  annotationMarkerData: [number, number, number, number][]
  annotationSeriesIndex: number
  dataPointSeriesIndex: number
  chartColors: { annotationColor: string }
  sampleAnomalyMap: Map<number, AnomalyEvent[]>
}

/**
 * Returns an ECharts-compatible tooltip formatter function that renders
 * HTML strings for data point tooltips, annotation markers, and AI insights.
 */
export function buildTooltipFormatter({
  data,
  isModeA,
  localIsModeB,
  shortRunMode,
  formatVal,
  annotations,
  annotationMarkerData,
  annotationSeriesIndex,
  dataPointSeriesIndex,
  chartColors,
  sampleAnomalyMap,
}: BuildTooltipFormatterParams): (params: unknown) => string {
  return (params: unknown) => {
    const p = params as { dataIndex: number; seriesType: string; seriesIndex: number }
    // Only show tooltip for custom series (data points), not the line
    if (p.seriesType === 'line') return ''
    // Annotation marker series — show brief tooltip
    if (p.seriesIndex === annotationSeriesIndex && annotations) {
      const markerEntry = annotationMarkerData[p.dataIndex]
      if (!markerEntry) return ''
      const annId = markerEntry[1]
      const ann = annotations.find((a) => a.id === annId)
      if (!ann) return ''
      const annText = ann.text.length > 120 ? ann.text.slice(0, 117) + '...' : ann.text
      return `<div style="font-size:12px;max-width:350px;overflow-wrap:break-word;word-wrap:break-word;white-space:pre-wrap"><div style="font-weight:600;color:${chartColors.annotationColor};margin-bottom:4px">Annotation</div><div>${escapeHtml(annText)}</div><div style="opacity:0.6;margin-top:4px;font-size:11px">Click to view details</div></div>`
    }
    // Only show data-point tooltip for the data-point custom series
    if (p.seriesIndex !== dataPointSeriesIndex) return ''
    const point = data[p.dataIndex]
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
    if (point.metadata && typeof point.metadata === 'object') {
      for (const [key, val] of Object.entries(point.metadata)) {
        if (val != null) {
          html += `<div style="opacity:0.7">${escapeHtml(key)}: ${escapeHtml(String(val))}</div>`
        }
      }
    }
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
    const anomalyEvents = sampleAnomalyMap.get(point.sample_id)
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
  }
}
