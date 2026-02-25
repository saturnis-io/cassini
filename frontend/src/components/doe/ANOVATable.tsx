import { cn } from '@/lib/utils'

interface ANOVARow {
  source: string
  sum_of_squares: number
  df: number
  mean_square: number
  f_value: number | null
  p_value: number | null
}

interface ANOVATableProps {
  anova: ANOVARow[]
  r_squared: number
  adj_r_squared: number
}

function formatNumber(value: number, decimals = 4): string {
  if (Math.abs(value) < 0.0001 && value !== 0) {
    return value.toExponential(2)
  }
  return value.toFixed(decimals)
}

function formatPValue(p: number | null): string {
  if (p === null) return '--'
  if (p < 0.0001) return '< 0.0001'
  return p.toFixed(4)
}

function pValueClass(p: number | null): string {
  if (p === null) return ''
  if (p < 0.01) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
  if (p < 0.05) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
  return ''
}

function rSquaredColor(r2: number): string {
  if (r2 >= 0.9) return 'text-green-600 dark:text-green-400'
  if (r2 >= 0.7) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export function ANOVATable({ anova, r_squared, adj_r_squared }: ANOVATableProps) {
  return (
    <div className="space-y-4">
      <div className="border-border overflow-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-muted-foreground px-4 py-3 text-left font-medium">Source</th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">SS</th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">df</th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">MS</th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">F</th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">p-value</th>
            </tr>
          </thead>
          <tbody>
            {anova.map((row, index) => {
              const isTotal = row.source.toLowerCase() === 'total'
              const isError = row.source.toLowerCase() === 'error' || row.source.toLowerCase() === 'residual'

              return (
                <tr
                  key={index}
                  className={cn(
                    'border-border/50 border-t',
                    isTotal && 'bg-muted/30 font-semibold',
                  )}
                >
                  <td className="px-4 py-2.5 font-medium">
                    {row.source}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {formatNumber(row.sum_of_squares)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {row.df}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {formatNumber(row.mean_square)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {row.f_value != null ? formatNumber(row.f_value, 2) : '--'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!isTotal && !isError && row.p_value != null ? (
                      <span
                        className={cn(
                          'inline-block rounded px-1.5 py-0.5 font-mono text-xs',
                          pValueClass(row.p_value),
                        )}
                      >
                        {formatPValue(row.p_value)}
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
      </div>

      {/* R-squared summary */}
      <div className="bg-muted/30 flex items-center gap-6 rounded-lg px-4 py-3">
        <div>
          <span className="text-muted-foreground text-xs font-medium">R-squared</span>
          <div className={cn('text-lg font-bold', rSquaredColor(r_squared))}>
            {(r_squared * 100).toFixed(1)}%
          </div>
        </div>
        <div>
          <span className="text-muted-foreground text-xs font-medium">Adj. R-squared</span>
          <div className={cn('text-lg font-bold', rSquaredColor(adj_r_squared))}>
            {(adj_r_squared * 100).toFixed(1)}%
          </div>
        </div>
        <div className="text-muted-foreground text-xs">
          {r_squared >= 0.9
            ? 'Excellent model fit'
            : r_squared >= 0.7
              ? 'Acceptable model fit'
              : 'Poor model fit -- consider additional factors or higher-order terms'}
        </div>
      </div>
    </div>
  )
}
