import { cn } from '@/lib/utils'
import { calculateStatistics, hasChartPoints } from '@/lib/report-utils'
import type { ChartData } from '@/types'

interface ReportStatisticsProps {
  chartData?: ChartData
}

export function ReportStatistics({ chartData }: ReportStatisticsProps) {
  if (!chartData || !hasChartPoints(chartData)) return null

  const stats = calculateStatistics(chartData)
  const sampleCount =
    chartData.chart_type === 'cusum'
      ? (chartData.cusum_data_points?.length ?? 0)
      : chartData.chart_type === 'ewma'
        ? (chartData.ewma_data_points?.length ?? 0)
        : chartData.data_points.length

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Statistics</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Mean" value={stats.mean?.toFixed(4) || '-'} />
        <StatCard label="Std Dev" value={stats.stdDev?.toFixed(4) || '-'} />
        <StatCard label="UCL" value={chartData.control_limits.ucl?.toFixed(4) || '-'} />
        <StatCard label="LCL" value={chartData.control_limits.lcl?.toFixed(4) || '-'} />
        <StatCard label="Samples" value={String(sampleCount)} />
        <StatCard label="In Control" value={`${stats.inControlPct.toFixed(1)}%`} />
        <StatCard label="OOC Points" value={String(stats.oocCount)} />
        <StatCard label="Range" value={stats.range?.toFixed(4) || '-'} />
      </div>
    </div>
  )
}

export function StatCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: 'destructive' | 'warning'
}) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className={cn(
          'mt-1 text-lg font-semibold',
          highlight === 'destructive' && 'text-destructive',
          highlight === 'warning' && 'text-warning',
        )}
      >
        {value}
      </div>
    </div>
  )
}
