import { cn } from '@/lib/utils'
import { usePlantHealth } from '@/api/hooks/report-analytics'
import { usePlantContext } from '@/providers/PlantProvider'
import { AlertTriangle, TrendingDown, Clock } from 'lucide-react'
import { useDateFormat } from '@/hooks/useDateFormat'
import type { CharacteristicHealth } from '@/api/types'

export function ReportRiskRanking() {
  const { selectedPlant } = usePlantContext()
  const { data, isLoading, error } = usePlantHealth(selectedPlant?.id ?? 0)
  const { formatDateTime } = useDateFormat()

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Risk Ranking</h2>
        <p className="text-muted-foreground text-sm">Loading risk data...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Risk Ranking</h2>
        <p className="text-muted-foreground text-sm">Unable to load risk data.</p>
      </div>
    )
  }

  // Already sorted by risk_score desc from the backend
  const topRisks = data.characteristics.filter((c) => c.risk_score > 0).slice(0, 10)

  if (topRisks.length === 0) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Risk Ranking</h2>
        <p className="text-muted-foreground text-sm">
          All characteristics are within acceptable risk levels.
        </p>
      </div>
    )
  }

  const maxRisk = Math.max(...topRisks.map((c) => c.risk_score))

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-1 text-lg font-semibold">Risk Ranking</h2>
      <p className="text-muted-foreground mb-4 text-xs">
        Top {topRisks.length} characteristics by composite risk score (capability 40%, stability 30%, violations 20%, unacknowledged 10%)
      </p>

      <div className="space-y-2">
        {topRisks.map((char, i) => (
          <RiskRow
            key={char.characteristic_id}
            rank={i + 1}
            char={char}
            maxRisk={maxRisk}
            formatDateTime={formatDateTime}
          />
        ))}
      </div>
    </div>
  )
}

function RiskRow({
  rank,
  char,
  maxRisk,
  formatDateTime,
}: {
  rank: number
  char: CharacteristicHealth
  maxRisk: number
  formatDateTime: (date: Date | string) => string
}) {
  const barWidth = maxRisk > 0 ? (char.risk_score / maxRisk) * 100 : 0
  const barColor =
    char.health_status === 'critical'
      ? 'bg-destructive/70'
      : char.health_status === 'warning'
        ? 'bg-warning/70'
        : 'bg-success/70'

  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-6 text-right text-xs font-bold">
            #{rank}
          </span>
          <span className="text-sm font-medium">{char.name}</span>
          <span className="text-muted-foreground text-xs">{char.hierarchy_path}</span>
        </div>
        <span
          className={cn(
            'text-sm font-bold tabular-nums',
            char.health_status === 'critical'
              ? 'text-destructive'
              : char.health_status === 'warning'
                ? 'text-warning'
                : 'text-success',
          )}
        >
          {char.risk_score.toFixed(1)}
        </span>
      </div>

      {/* Risk bar */}
      <div className="bg-muted mb-2 h-2 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Contributing factors */}
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {char.cpk != null && (
          <span className="flex items-center gap-1">
            <TrendingDown className="h-3 w-3" />
            Cpk: {char.cpk.toFixed(2)}
          </span>
        )}
        <span>In control: {char.in_control_pct.toFixed(1)}%</span>
        {char.violation_count > 0 && (
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {char.violation_count} violations
            {char.unacknowledged_count > 0 && (
              <span className="text-warning">({char.unacknowledged_count} unack)</span>
            )}
          </span>
        )}
        {char.last_sample_at && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last: {formatDateTime(char.last_sample_at)}
          </span>
        )}
      </div>
    </div>
  )
}
