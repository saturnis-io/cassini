import { cn } from '@/lib/utils'
import { usePlantHealth } from '@/api/hooks/report-analytics'
import { usePlantContext } from '@/providers/PlantProvider'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { CharacteristicHealth } from '@/api/types'

const STATUS_CONFIG = {
  good: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Capable' },
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', label: 'Marginal' },
  critical: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Not Capable' },
} as const

export function ReportCapabilityScorecard() {
  const { selectedPlant } = usePlantContext()
  const { data, isLoading, error } = usePlantHealth(selectedPlant?.id ?? 0)

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Capability Scorecard</h2>
        <p className="text-muted-foreground text-sm">Loading plant health data...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Capability Scorecard</h2>
        <p className="text-muted-foreground text-sm">Unable to load plant health data.</p>
      </div>
    )
  }

  const { summary, characteristics } = data

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Capability Scorecard</h2>

      {/* Summary tiles */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <SummaryTile status="good" count={summary.good_count} total={data.total_characteristics} />
        <SummaryTile status="warning" count={summary.warning_count} total={data.total_characteristics} />
        <SummaryTile status="critical" count={summary.critical_count} total={data.total_characteristics} />
      </div>

      {/* Avg Cpk + worst */}
      <div className="text-muted-foreground mb-4 flex gap-6 text-sm">
        <span>
          Avg Cpk: <strong className="text-foreground">{summary.avg_cpk?.toFixed(2) ?? '-'}</strong>
        </span>
        {summary.worst_characteristic && (
          <span>
            Worst: <strong className="text-destructive">{summary.worst_characteristic}</strong>
            {summary.worst_cpk != null && ` (Cpk = ${summary.worst_cpk.toFixed(2)})`}
          </span>
        )}
      </div>

      {/* Scorecard table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b text-left">
              <th className="text-muted-foreground pb-2 pr-4 font-medium">Characteristic</th>
              <th className="text-muted-foreground pb-2 pr-4 text-right font-medium">Cpk</th>
              <th className="text-muted-foreground pb-2 pr-4 text-right font-medium">Ppk</th>
              <th className="text-muted-foreground pb-2 pr-4 text-right font-medium">In Control</th>
              <th className="text-muted-foreground pb-2 pr-4 text-right font-medium">Samples</th>
              <th className="text-muted-foreground pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {characteristics.map((char) => (
              <ScorecardRow key={char.characteristic_id} char={char} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryTile({
  status,
  count,
  total,
}: {
  status: 'good' | 'warning' | 'critical'
  count: number
  total: number
}) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0'

  return (
    <div className={cn('rounded-lg p-3 text-center', config.bg)}>
      <Icon className={cn('mx-auto mb-1 h-5 w-5', config.color)} />
      <div className={cn('text-xl font-bold', config.color)}>{count}</div>
      <div className="text-muted-foreground text-xs">
        {config.label} ({pct}%)
      </div>
    </div>
  )
}

function ScorecardRow({ char }: { char: CharacteristicHealth }) {
  const config = STATUS_CONFIG[char.health_status]
  const Icon = config.icon

  return (
    <tr className="border-border border-b last:border-0">
      <td className="py-2 pr-4">
        <div className="font-medium">{char.name}</div>
        <div className="text-muted-foreground text-xs">{char.hierarchy_path}</div>
      </td>
      <td className={cn('py-2 pr-4 text-right tabular-nums', cpkColor(char.cpk))}>
        {char.cpk?.toFixed(2) ?? '-'}
      </td>
      <td className={cn('py-2 pr-4 text-right tabular-nums', cpkColor(char.ppk))}>
        {char.ppk?.toFixed(2) ?? '-'}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">
        {char.in_control_pct.toFixed(1)}%
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">{char.sample_count}</td>
      <td className="py-2">
        <span className={cn('inline-flex items-center gap-1 text-xs', config.color)}>
          <Icon className="h-3.5 w-3.5" />
          {config.label}
        </span>
      </td>
    </tr>
  )
}

function cpkColor(value: number | null): string {
  if (value == null) return 'text-muted-foreground'
  if (value >= 1.33) return 'text-success'
  if (value >= 1.0) return 'text-warning'
  return 'text-destructive'
}
