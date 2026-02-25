import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface DecompositionEntry {
  variable: string
  contribution: number
  pct_of_total: number
  unconditional_t2?: number
}

interface DecompositionTableProps {
  decomposition: DecompositionEntry[]
}

/**
 * Table showing variable contributions for a selected OOC point.
 *
 * Sorted by contribution descending.
 * Highest contributor highlighted with a colored background.
 */
export function DecompositionTable({ decomposition }: DecompositionTableProps) {
  const sorted = useMemo(() => {
    if (!decomposition || decomposition.length === 0) return []
    return [...decomposition].sort((a, b) => b.contribution - a.contribution)
  }, [decomposition])

  if (sorted.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        No decomposition data available
      </p>
    )
  }

  const maxContribution = sorted[0]?.contribution ?? 0

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-border border-b">
            <th className="text-muted-foreground px-3 py-2 text-xs font-medium">Variable</th>
            <th className="text-muted-foreground px-3 py-2 text-right text-xs font-medium">
              T{'\u00B2'} Contribution
            </th>
            <th className="text-muted-foreground px-3 py-2 text-right text-xs font-medium">
              % of Total
            </th>
            <th className="text-muted-foreground px-3 py-2 text-right text-xs font-medium">
              Unconditional T{'\u00B2'}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, idx) => {
            const isHighest = idx === 0 && maxContribution > 0
            return (
              <tr
                key={entry.variable}
                className={cn(
                  'border-border border-b last:border-b-0 transition-colors',
                  isHighest
                    ? 'bg-destructive/10 font-medium'
                    : 'hover:bg-muted/50',
                )}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {isHighest && (
                      <span className="bg-destructive h-2 w-2 shrink-0 rounded-full" />
                    )}
                    <span className={cn(isHighest && 'text-destructive')}>
                      {entry.variable}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {entry.contribution.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {entry.pct_of_total.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {entry.unconditional_t2 != null ? entry.unconditional_t2.toFixed(3) : '--'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
