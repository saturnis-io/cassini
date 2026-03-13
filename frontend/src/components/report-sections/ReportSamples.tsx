import { useDateFormat } from '@/hooks/useDateFormat'
import { hasChartPoints } from '@/lib/report-utils'
import type { ChartData } from '@/types'

interface ReportSamplesProps {
  chartData?: ChartData
}

export function ReportSamples({ chartData }: ReportSamplesProps) {
  const { formatDateTime } = useDateFormat()

  if (!chartData || !hasChartPoints(chartData)) return null

  // Build a uniform array of {sample_id, timestamp, value, violation_rules} from any chart type
  const sampleRows = (() => {
    if (chartData.chart_type === 'cusum' && chartData.cusum_data_points?.length) {
      return chartData.cusum_data_points.slice(-10).reverse().map((dp) => ({
        sample_id: dp.sample_id,
        timestamp: dp.timestamp,
        value: dp.measurement,
        extra: `C+: ${dp.cusum_high.toFixed(2)} C-: ${dp.cusum_low.toFixed(2)}`,
        violation_rules: dp.violation_rules,
      }))
    }
    if (chartData.chart_type === 'ewma' && chartData.ewma_data_points?.length) {
      return chartData.ewma_data_points.slice(-10).reverse().map((dp) => ({
        sample_id: dp.sample_id,
        timestamp: dp.timestamp,
        value: dp.measurement,
        extra: `EWMA: ${dp.ewma_value.toFixed(4)}`,
        violation_rules: dp.violation_rules,
      }))
    }
    return chartData.data_points.slice(-10).reverse().map((dp) => ({
      sample_id: dp.sample_id,
      timestamp: dp.timestamp,
      value: dp.mean,
      extra: dp.zone?.replace('_', ' ') ?? '',
      violation_rules: dp.violation_rules,
    }))
  })()
  const extraHeader = chartData.chart_type === 'cusum'
    ? 'CUSUM'
    : chartData.chart_type === 'ewma'
      ? 'EWMA'
      : 'Zone'

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Recent Samples</h2>
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr>
            <th className="py-2 text-left">Timestamp</th>
            <th className="py-2 text-right">Value</th>
            <th className="py-2 text-right">{extraHeader}</th>
            <th className="py-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {sampleRows.map((dp) => (
            <tr key={dp.sample_id} className="border-border/50 border-b">
              <td className="py-2">{formatDateTime(dp.timestamp)}</td>
              <td className="py-2 text-right font-mono">{dp.value.toFixed(4)}</td>
              <td className="py-2 text-right">{dp.extra}</td>
              <td className="py-2 text-center">
                {dp.violation_rules?.length > 0 ? (
                  <span className="text-destructive">OOC</span>
                ) : (
                  <span className="text-success">OK</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
