import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { usePlantHealth } from '@/api/hooks/report-analytics'
import { usePlantContext } from '@/providers/PlantProvider'
import { Grid3X3 } from 'lucide-react'
import type { CharacteristicHealth } from '@/api/types'

interface ReportCapabilityMatrixProps {
  linePath?: string
}

function cpkColor(value: number | null): string {
  if (value == null) return 'text-muted-foreground'
  if (value >= 1.33) return 'text-success'
  if (value >= 1.0) return 'text-warning'
  return 'text-destructive'
}

function controlColor(pct: number): string {
  if (pct >= 95) return 'text-success'
  if (pct >= 85) return 'text-warning'
  return 'text-destructive'
}

function violationColor(count: number): string {
  if (count === 0) return 'text-success'
  if (count <= 3) return 'text-warning'
  return 'text-destructive'
}

function riskColor(score: number): string {
  if (score < 20) return 'text-success'
  if (score < 40) return 'text-warning'
  return 'text-destructive'
}

export function ReportCapabilityMatrix({
  linePath,
}: ReportCapabilityMatrixProps) {
  const { selectedPlant } = usePlantContext()
  const { data, isLoading, error } = usePlantHealth(selectedPlant?.id ?? 0)

  const sorted = useMemo(() => {
    if (!data) return []
    const filtered = linePath
      ? data.characteristics.filter((c) => c.hierarchy_path.startsWith(linePath))
      : data.characteristics
    return [...filtered].sort((a, b) => b.risk_score - a.risk_score)
  }, [data, linePath])

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Grid3X3 className="h-5 w-5" />
          Capability Matrix
        </h2>
        <p className="text-muted-foreground text-sm">Loading capability data...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Grid3X3 className="h-5 w-5" />
          Capability Matrix
        </h2>
        <p className="text-muted-foreground text-sm">
          Unable to load capability data.
        </p>
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Grid3X3 className="h-5 w-5" />
          Capability Matrix
        </h2>
        <p className="text-muted-foreground text-sm">
          No characteristics found for this line.
        </p>
      </div>
    )
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <Grid3X3 className="h-5 w-5" />
        Capability Matrix
      </h2>
      <p className="text-muted-foreground mb-4 text-xs">
        Sorted by risk score (highest first)
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b text-left">
              <th className="text-muted-foreground pb-2 pr-4 font-medium">
                Characteristic
              </th>
              <th className="text-muted-foreground pb-2 pr-4 text-right font-medium">
                Cpk
              </th>
              <th className="text-muted-foreground pb-2 pr-4 text-right font-medium">
                Ppk
              </th>
              <th className="text-muted-foreground pb-2 pr-4 text-right font-medium">
                In Control %
              </th>
              <th className="text-muted-foreground pb-2 pr-4 text-right font-medium">
                Violations
              </th>
              <th className="text-muted-foreground pb-2 text-right font-medium">
                Risk Score
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((char) => (
              <MatrixRow key={char.characteristic_id} char={char} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MatrixRow({ char }: { char: CharacteristicHealth }) {
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
      <td
        className={cn(
          'py-2 pr-4 text-right tabular-nums',
          controlColor(char.in_control_pct),
        )}
      >
        {char.in_control_pct.toFixed(1)}%
      </td>
      <td
        className={cn(
          'py-2 pr-4 text-right tabular-nums',
          violationColor(char.violation_count),
        )}
      >
        {char.violation_count}
      </td>
      <td
        className={cn(
          'py-2 text-right tabular-nums font-medium',
          riskColor(char.risk_score),
        )}
      >
        {char.risk_score.toFixed(1)}
      </td>
    </tr>
  )
}
