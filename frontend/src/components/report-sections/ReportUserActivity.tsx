import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { useECharts } from '@/hooks/useECharts'
import { useUserActivitySummary } from '@/api/hooks/admin'
import type { ECOption } from '@/lib/echarts'

interface ReportUserActivityProps {
  chartOptions?: { startDate?: string; endDate?: string }
}

export function ReportUserActivity({ chartOptions }: ReportUserActivityProps) {
  const { data, isLoading } = useUserActivitySummary({
    start_date: chartOptions?.startDate,
    end_date: chartOptions?.endDate,
  })

  const barOption = useMemo<ECOption>(() => {
    if (!data?.users.length) {
      return { series: [] }
    }

    // Top 15 users by total action count
    const sorted = [...data.users]
      .sort((a, b) => {
        const totalA = Object.values(a.actions_by_type).reduce((s, v) => s + v, 0)
        const totalB = Object.values(b.actions_by_type).reduce((s, v) => s + v, 0)
        return totalB - totalA
      })
      .slice(0, 15)

    const usernames = sorted.map((u) => u.username)
    const totals = sorted.map((u) => Object.values(u.actions_by_type).reduce((s, v) => s + v, 0))

    return {
      tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
      grid: { left: 120, right: 20, top: 10, bottom: 30 },
      xAxis: { type: 'value' as const },
      yAxis: {
        type: 'category' as const,
        data: usernames.reverse(),
        axisLabel: { width: 100, overflow: 'truncate' as const },
      },
      series: [
        {
          type: 'bar' as const,
          data: totals.reverse().map((v) => ({
            value: v,
            itemStyle: { color: '#6366f1' },
          })),
        },
      ],
    }
  }, [data])

  const { containerRef } = useECharts({ option: barOption, notMerge: true })

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5" />
          User Activity
        </h2>
        <p className="text-muted-foreground text-sm">Loading user activity...</p>
      </div>
    )
  }

  const users = data?.users ?? []

  if (users.length === 0) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5" />
          User Activity
        </h2>
        <p className="text-muted-foreground text-sm">No user activity found for this period.</p>
      </div>
    )
  }

  const periodLabel =
    chartOptions?.startDate && chartOptions?.endDate
      ? `${chartOptions.startDate} — ${chartOptions.endDate}`
      : chartOptions?.startDate
        ? `From ${chartOptions.startDate}`
        : chartOptions?.endDate
          ? `Until ${chartOptions.endDate}`
          : 'All time'

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Users className="h-5 w-5" />
        User Activity
      </h2>
      <p className="text-muted-foreground mb-3 text-xs">
        Period: {periodLabel} · Total actions: {data?.total_actions?.toLocaleString() ?? 0}
      </p>

      {/* Bar chart */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: Math.max(200, Math.min(users.length, 15) * 28), visibility: 'visible' }}
      />

      {/* User activity table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b">
              <th className="text-muted-foreground py-2 text-left text-xs font-semibold">User</th>
              <th className="text-muted-foreground py-2 text-right text-xs font-semibold">
                Logins
              </th>
              <th className="text-muted-foreground py-2 text-right text-xs font-semibold">
                Total Actions
              </th>
              <th className="text-muted-foreground py-2 text-right text-xs font-semibold">
                Violations Ack.
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const totalActions = Object.values(u.actions_by_type).reduce((s, v) => s + v, 0)
              return (
                <tr key={u.username} className="border-border border-b last:border-0">
                  <td className="text-foreground py-2 font-medium">{u.username}</td>
                  <td className="text-muted-foreground py-2 text-right">{u.login_count}</td>
                  <td className="text-muted-foreground py-2 text-right">{totalActions}</td>
                  <td className="text-muted-foreground py-2 text-right">
                    {u.violations_acknowledged}
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
