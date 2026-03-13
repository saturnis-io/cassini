import { getChartMeasurements } from '@/lib/report-utils'
import type { ChartData } from '@/types'

interface ReportInterpretationSectionProps {
  chartData: ChartData
}

/**
 * Interpretation section for reports
 */
export function ReportInterpretationSection({ chartData }: ReportInterpretationSectionProps) {
  const values = getChartMeasurements(chartData)
  if (values.length < 2) return null

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1)
  const stdDev = Math.sqrt(variance)

  const { spec_limits } = chartData
  let oocCount = 0
  if (chartData.chart_type === 'cusum' && chartData.cusum_data_points?.length) {
    oocCount = chartData.cusum_data_points.filter((dp) => dp.violation_rules?.length > 0).length
  } else if (chartData.chart_type === 'ewma' && chartData.ewma_data_points?.length) {
    oocCount = chartData.ewma_data_points.filter((dp) => dp.violation_rules?.length > 0).length
  } else {
    oocCount = chartData.data_points.filter((dp) => dp.violation_rules?.length > 0).length
  }
  const inControlPct = ((values.length - oocCount) / values.length) * 100

  const interpretations: string[] = []

  // Process stability
  if (inControlPct >= 95) {
    interpretations.push(
      '✓ Process is stable with ' + inControlPct.toFixed(1) + '% of points in control.',
    )
  } else if (inControlPct >= 80) {
    interpretations.push(
      '⚠ Process shows some instability with ' +
        (100 - inControlPct).toFixed(1) +
        '% out-of-control points.',
    )
  } else {
    interpretations.push(
      '✗ Process is unstable with ' +
        (100 - inControlPct).toFixed(1) +
        '% out-of-control points. Investigation recommended.',
    )
  }

  // Centering
  if (spec_limits.target) {
    const offset = Math.abs(mean - spec_limits.target)
    const tolerance =
      spec_limits.usl && spec_limits.lsl ? (spec_limits.usl - spec_limits.lsl) / 2 : null
    if (tolerance && offset < tolerance * 0.1) {
      interpretations.push('✓ Process is well-centered on target.')
    } else if (tolerance && offset < tolerance * 0.25) {
      interpretations.push('⚠ Process is slightly off-center from target.')
    } else {
      interpretations.push('✗ Process is significantly off-center. Adjustment recommended.')
    }
  }

  // Variation
  if (spec_limits.usl && spec_limits.lsl) {
    const tolerance = spec_limits.usl - spec_limits.lsl
    const processSpread = 6 * stdDev
    if (processSpread < tolerance * 0.5) {
      interpretations.push('✓ Process variation is well within specification limits.')
    } else if (processSpread < tolerance * 0.8) {
      interpretations.push('⚠ Process variation is acceptable but should be monitored.')
    } else {
      interpretations.push('✗ Process variation is too high relative to specifications.')
    }
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Interpretation</h2>
      <ul className="space-y-2 text-sm">
        {interpretations.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
    </div>
  )
}
