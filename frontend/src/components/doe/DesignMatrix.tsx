import { cn } from '@/lib/utils'

interface DesignMatrixRun {
  run_order: number
  standard_order: number
  factor_values: Record<string, number>
  factor_actuals: Record<string, number>
  is_center_point: boolean
}

interface DesignMatrixProps {
  runs: DesignMatrixRun[]
  factorNames: string[]
}

function formatCodedValue(coded: number, actual: number, unit?: string): string {
  const sign = coded > 0 ? '+' : coded < 0 ? '' : ''
  const codedStr = coded === 0 ? '0' : `${sign}${coded}`
  const actualStr = actual % 1 === 0 ? String(actual) : actual.toFixed(2)
  const unitSuffix = unit ? ` ${unit}` : ''
  return `${codedStr} (${actualStr}${unitSuffix})`
}

export function DesignMatrix({ runs, factorNames }: DesignMatrixProps) {
  if (runs.length === 0) {
    return (
      <div className="border-border flex h-32 items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground text-sm">
          No runs generated yet. Click "Generate Design" to create the design matrix.
        </p>
      </div>
    )
  }

  const sorted = [...runs].sort((a, b) => a.run_order - b.run_order)

  return (
    <div className="border-border overflow-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-muted-foreground px-4 py-3 text-center font-medium">Run #</th>
            <th className="text-muted-foreground px-4 py-3 text-center font-medium">Std Order</th>
            {factorNames.map((name) => (
              <th key={name} className="text-muted-foreground px-4 py-3 text-center font-medium">
                {name}
              </th>
            ))}
            <th className="text-muted-foreground px-4 py-3 text-center font-medium">
              Center Point
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((run, index) => {
            const isEven = index % 2 === 0
            return (
              <tr
                key={run.run_order}
                className={cn(
                  'border-border/50 border-t transition-colors',
                  run.is_center_point
                    ? 'bg-purple-50 dark:bg-purple-950/20'
                    : isEven
                      ? 'bg-card'
                      : 'bg-muted/20',
                )}
              >
                <td className="px-4 py-2.5 text-center font-medium">{run.run_order}</td>
                <td className="text-muted-foreground px-4 py-2.5 text-center">
                  {run.standard_order}
                </td>
                {factorNames.map((name) => {
                  const coded = run.factor_values[name] ?? 0
                  const actual = run.factor_actuals[name] ?? 0
                  return (
                    <td key={name} className="px-4 py-2.5 text-center">
                      <span
                        className={cn(
                          'inline-block rounded px-1.5 py-0.5 text-xs font-mono',
                          coded > 0
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                            : coded < 0
                              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
                        )}
                      >
                        {formatCodedValue(coded, actual)}
                      </span>
                    </td>
                  )
                })}
                <td className="px-4 py-2.5 text-center">
                  {run.is_center_point ? (
                    <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                      Yes
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">--</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="text-muted-foreground border-border border-t px-4 py-2 text-xs">
        {runs.length} runs total
        {runs.some((r) => r.is_center_point) && (
          <span>
            {' '}
            ({runs.filter((r) => r.is_center_point).length} center points)
          </span>
        )}
      </div>
    </div>
  )
}
