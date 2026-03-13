import { ControlChart } from '@/components/ControlChart'
import { CUSUMChart } from '@/components/CUSUMChart'
import { EWMAChart } from '@/components/EWMAChart'
import type { ChartData } from '@/types'

interface ReportControlChartProps {
  chartData?: ChartData
  characteristicIds: number[]
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
}

export function ReportControlChart({
  chartData,
  characteristicIds,
  chartOptions,
}: ReportControlChartProps) {
  if (!chartData || characteristicIds.length === 0) return null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">
        {chartData.chart_type === 'cusum'
          ? 'CUSUM Chart'
          : chartData.chart_type === 'ewma'
            ? 'EWMA Chart'
            : 'Control Chart'}
      </h2>
      <div className="h-96">
        {chartData.chart_type === 'cusum' ? (
          <CUSUMChart characteristicId={characteristicIds[0]} chartOptions={chartOptions} />
        ) : chartData.chart_type === 'ewma' ? (
          <EWMAChart characteristicId={characteristicIds[0]} chartOptions={chartOptions} />
        ) : (
          <ControlChart characteristicId={characteristicIds[0]} chartOptions={chartOptions} />
        )}
      </div>
    </div>
  )
}
