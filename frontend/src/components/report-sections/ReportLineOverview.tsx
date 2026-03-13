import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { usePlantHealth } from '@/api/hooks/report-analytics'
import { usePlantContext } from '@/providers/PlantProvider'
import { Activity, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

interface ReportLineOverviewProps {
  linePath?: string
}

export function ReportLineOverview({ linePath }: ReportLineOverviewProps) {
  const { selectedPlant } = usePlantContext()
  const { data, isLoading, error } = usePlantHealth(selectedPlant?.id ?? 0)

  const stats = useMemo(() => {
    if (!data) return null

    const filtered = linePath
      ? data.characteristics.filter((c) =>
          c.hierarchy_path.startsWith(linePath),
        )
      : data.characteristics

    const total = filtered.length
    const healthy = filtered.filter((c) => c.health_status === 'good').length
    const warning = filtered.filter((c) => c.health_status === 'warning').length
    const critical = filtered.filter(
      (c) => c.health_status === 'critical',
    ).length

    const withCpk = filtered.filter((c) => c.cpk != null)
    const avgCpk =
      withCpk.length > 0
        ? withCpk.reduce((sum, c) => sum + c.cpk!, 0) / withCpk.length
        : null

    const worst =
      withCpk.length > 0
        ? withCpk.reduce((w, c) => (c.cpk! < w.cpk! ? c : w))
        : null

    return { total, healthy, warning, critical, avgCpk, worst }
  }, [data, linePath])

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Activity className="h-5 w-5" />
          Line Overview
        </h2>
        <p className="text-muted-foreground text-sm">Loading line data...</p>
      </div>
    )
  }

  if (error || !data || !stats) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Activity className="h-5 w-5" />
          Line Overview
        </h2>
        <p className="text-muted-foreground text-sm">
          Unable to load line data.
        </p>
      </div>
    )
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Activity className="h-5 w-5" />
        Line Overview
        {linePath && (
          <span className="text-muted-foreground text-sm font-normal">
            — {linePath}
          </span>
        )}
      </h2>

      {/* Summary tiles */}
      <div className="mb-4 grid grid-cols-5 gap-3">
        <div className="bg-muted/30 rounded-lg p-3 text-center">
          <div className="text-foreground text-xl font-bold">{stats.total}</div>
          <div className="text-muted-foreground text-xs">Total</div>
        </div>
        <div className="bg-success/10 rounded-lg p-3 text-center">
          <CheckCircle2 className="text-success mx-auto mb-1 h-5 w-5" />
          <div className="text-success text-xl font-bold">{stats.healthy}</div>
          <div className="text-muted-foreground text-xs">Healthy</div>
        </div>
        <div className="bg-warning/10 rounded-lg p-3 text-center">
          <AlertTriangle className="text-warning mx-auto mb-1 h-5 w-5" />
          <div className="text-warning text-xl font-bold">{stats.warning}</div>
          <div className="text-muted-foreground text-xs">Warning</div>
        </div>
        <div className="bg-destructive/10 rounded-lg p-3 text-center">
          <XCircle className="text-destructive mx-auto mb-1 h-5 w-5" />
          <div className="text-destructive text-xl font-bold">
            {stats.critical}
          </div>
          <div className="text-muted-foreground text-xs">Critical</div>
        </div>
        <div className="bg-muted/30 rounded-lg p-3 text-center">
          <div
            className={cn(
              'text-xl font-bold',
              stats.avgCpk == null
                ? 'text-muted-foreground'
                : stats.avgCpk >= 1.33
                  ? 'text-success'
                  : stats.avgCpk >= 1.0
                    ? 'text-warning'
                    : 'text-destructive',
            )}
          >
            {stats.avgCpk?.toFixed(2) ?? '-'}
          </div>
          <div className="text-muted-foreground text-xs">Avg Cpk</div>
        </div>
      </div>

      {/* Worst performer */}
      {stats.worst && (
        <p className="text-muted-foreground text-sm">
          Worst performer:{' '}
          <strong className="text-destructive">{stats.worst.name}</strong>
          {stats.worst.cpk != null &&
            ` (Cpk = ${stats.worst.cpk.toFixed(2)})`}
          <span className="text-muted-foreground ml-1 text-xs">
            — {stats.worst.hierarchy_path}
          </span>
        </p>
      )}
    </div>
  )
}
