import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { usePlantHealth } from '@/api/hooks/report-analytics'
import { usePlantContext } from '@/providers/PlantProvider'
import { AlertTriangle } from 'lucide-react'

interface ReportViolationPatternsProps {
  linePath?: string
}

export function ReportViolationPatterns({
  linePath,
}: ReportViolationPatternsProps) {
  const { selectedPlant } = usePlantContext()
  const { data, isLoading, error } = usePlantHealth(selectedPlant?.id ?? 0)

  const { rows, totalViolations, totalUnacknowledged } = useMemo(() => {
    if (!data) return { rows: [], totalViolations: 0, totalUnacknowledged: 0 }

    const filtered = linePath
      ? data.characteristics.filter((c) => c.hierarchy_path.startsWith(linePath))
      : data.characteristics

    const withViolations = filtered
      .filter((c) => c.violation_count > 0)
      .sort((a, b) => b.violation_count - a.violation_count)

    const total = withViolations.reduce((s, c) => s + c.violation_count, 0)
    const unack = withViolations.reduce((s, c) => s + c.unacknowledged_count, 0)

    return {
      rows: withViolations,
      totalViolations: total,
      totalUnacknowledged: unack,
    }
  }, [data, linePath])

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="h-5 w-5" />
          Violation Patterns
        </h2>
        <p className="text-muted-foreground text-sm">Loading violation data...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="h-5 w-5" />
          Violation Patterns
        </h2>
        <p className="text-muted-foreground text-sm">
          Unable to load violation data.
        </p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="h-5 w-5" />
          Violation Patterns
        </h2>
        <p className="text-muted-foreground text-sm">
          No violations detected in this time window.
        </p>
      </div>
    )
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <AlertTriangle className="h-5 w-5" />
        Violation Patterns
      </h2>

      {/* Summary line */}
      <p className="text-muted-foreground mb-4 text-xs">
        {totalViolations} total violation{totalViolations !== 1 ? 's' : ''}
        {totalUnacknowledged > 0 && (
          <span className="text-warning">
            {' '}
            ({totalUnacknowledged} unacknowledged)
          </span>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b text-left">
              <th className="text-muted-foreground pb-2 pr-4 font-medium">
                Characteristic
              </th>
              <th className="text-muted-foreground pb-2 pr-4 text-right font-medium">
                Count
              </th>
              <th className="text-muted-foreground pb-2 pr-4 text-right font-medium">
                Unacknowledged
              </th>
              <th className="text-muted-foreground pb-2 text-right font-medium">
                % of Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((char) => (
              <tr
                key={char.characteristic_id}
                className="border-border border-b last:border-0"
              >
                <td className="py-2 pr-4">
                  <div className="font-medium">{char.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {char.hierarchy_path}
                  </div>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums font-medium">
                  {char.violation_count}
                </td>
                <td
                  className={cn(
                    'py-2 pr-4 text-right tabular-nums',
                    char.unacknowledged_count > 0
                      ? 'text-warning font-medium'
                      : 'text-muted-foreground',
                  )}
                >
                  {char.unacknowledged_count}
                </td>
                <td className="text-muted-foreground py-2 text-right tabular-nums">
                  {totalViolations > 0
                    ? (
                        (char.violation_count / totalViolations) *
                        100
                      ).toFixed(1)
                    : '0.0'}
                  %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
