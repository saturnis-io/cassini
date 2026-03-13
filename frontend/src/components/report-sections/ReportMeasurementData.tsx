import { Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChartData } from '@/api/hooks'
import { useDateFormat } from '@/hooks/useDateFormat'

interface ReportMeasurementDataProps {
  characteristicId?: number
  chartOptions?: { limit?: number; startDate?: string; endDate?: string }
}

const MAX_ROWS = 500

export function ReportMeasurementData({
  characteristicId,
  chartOptions,
}: ReportMeasurementDataProps) {
  const { formatDateTime } = useDateFormat()
  const { data: chartData, isLoading } = useChartData(characteristicId ?? 0, chartOptions)

  if (!characteristicId) return null

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Database className="h-5 w-5" />
          Measurement Data
        </h2>
        <p className="text-muted-foreground text-sm">Loading measurement data...</p>
      </div>
    )
  }

  if (!chartData || chartData.data_points.length === 0) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Database className="h-5 w-5" />
          Measurement Data
        </h2>
        <p className="text-muted-foreground text-sm">No measurement data available.</p>
      </div>
    )
  }

  const precision = chartData.decimal_precision ?? 4
  const allPoints = chartData.data_points
  const truncated = allPoints.length > MAX_ROWS
  const points = truncated ? allPoints.slice(0, MAX_ROWS) : allPoints

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Database className="h-5 w-5" />
        Measurement Data
        <span className="text-muted-foreground text-sm font-normal">
          ({allPoints.length} point{allPoints.length !== 1 ? 's' : ''})
        </span>
      </h2>
      {truncated && (
        <p className="text-warning mb-2 text-xs">
          Showing first {MAX_ROWS} of {allPoints.length} rows. Export full dataset for
          complete records.
        </p>
      )}
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="py-2 pl-2 text-left">#</th>
              <th className="py-2 text-left">Timestamp</th>
              <th className="py-2 text-right">Value</th>
              <th className="py-2 text-center">Zone</th>
              <th className="py-2 pr-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {points.map((dp, idx) => {
              const status = dp.excluded
                ? 'Excluded'
                : dp.violation_rules?.length > 0
                  ? 'OOC'
                  : 'IC'

              return (
                <tr key={dp.sample_id} className="border-border/50 border-b">
                  <td className="text-muted-foreground py-1.5 pl-2">{idx + 1}</td>
                  <td className="py-1.5">{formatDateTime(dp.timestamp)}</td>
                  <td className="py-1.5 text-right font-mono">{dp.mean.toFixed(precision)}</td>
                  <td className="text-muted-foreground py-1.5 text-center text-xs">
                    {dp.zone?.replace('_', ' ') ?? '-'}
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    <span
                      className={cn(
                        'text-xs font-medium',
                        status === 'Excluded' && 'text-muted-foreground',
                        status === 'OOC' && 'text-destructive',
                        status === 'IC' && 'text-success',
                      )}
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
