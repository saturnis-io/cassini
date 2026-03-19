import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConfirmationAnalysis } from '@/api/doe.api'

export function ConfirmationResultsPanel({ result }: { result: ConfirmationAnalysis }) {
  const verdictColor = result.verdict.startsWith('Confirmed')
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400'
  const verdictBg = result.verdict.startsWith('Confirmed')
    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
    : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
  const VerdictIcon = result.verdict.startsWith('Confirmed') ? CheckCircle2 : XCircle

  return (
    <div className="space-y-6">
      {/* Verdict banner */}
      <div className={cn('flex items-center gap-3 rounded-lg border px-4 py-3', verdictBg)}>
        <VerdictIcon className={cn('h-5 w-5', verdictColor)} />
        <div>
          <div className={cn('text-sm font-bold', verdictColor)}>{result.verdict}</div>
          <div className="text-muted-foreground text-xs">
            Montgomery, "Design and Analysis of Experiments" -- confirmation run methodology
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">Predicted</div>
          <div className="mt-1 font-mono text-sm font-semibold">
            {result.predicted_value.toFixed(4)}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">Mean Actual</div>
          <div className="mt-1 font-mono text-sm font-semibold">{result.mean_actual.toFixed(4)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">MSE</div>
          <div className="mt-1 font-mono text-sm font-semibold">{result.mse.toFixed(4)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">df (residual)</div>
          <div className="mt-1 font-mono text-sm font-semibold">{result.df_residual}</div>
        </div>
      </div>

      {/* Intervals */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border-border rounded-xl border">
          <div className="bg-muted/50 border-border border-b px-4 py-3">
            <h3 className="text-sm font-medium">Prediction Interval (individual runs)</h3>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Lower</span>
              <span className="font-mono text-sm font-semibold">
                {result.prediction_interval.lower.toFixed(4)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Upper</span>
              <span className="font-mono text-sm font-semibold">
                {result.prediction_interval.upper.toFixed(4)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {result.all_within_pi ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
              <span className="text-xs">
                {result.all_within_pi ? 'All runs within PI' : 'Some runs outside PI'}
              </span>
            </div>
          </div>
        </div>

        <div className="border-border rounded-xl border">
          <div className="bg-muted/50 border-border border-b px-4 py-3">
            <h3 className="text-sm font-medium">Confidence Interval (mean response)</h3>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Lower</span>
              <span className="font-mono text-sm font-semibold">
                {result.confidence_interval.lower.toFixed(4)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Upper</span>
              <span className="font-mono text-sm font-semibold">
                {result.confidence_interval.upper.toFixed(4)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {result.mean_within_ci ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-xs">
                {result.mean_within_ci ? 'Mean within CI' : 'Mean outside CI'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Per-run results table */}
      <div className="border-border rounded-xl border">
        <div className="bg-muted/50 border-border border-b px-4 py-3">
          <h3 className="text-sm font-medium">Confirmation Runs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-muted-foreground px-4 py-2 text-left font-medium">Run</th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                  Actual Value
                </th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                  Predicted
                </th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                  Deviation
                </th>
                <th className="text-muted-foreground px-4 py-2 text-center font-medium">
                  Within PI
                </th>
              </tr>
            </thead>
            <tbody>
              {result.runs.map((run) => (
                <tr key={run.run_order} className="border-border/50 border-t">
                  <td className="px-4 py-2 font-mono text-xs">#{run.run_order}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs font-semibold">
                    {run.actual_value.toFixed(4)}
                  </td>
                  <td className="text-muted-foreground px-4 py-2 text-right font-mono text-xs">
                    {result.predicted_value.toFixed(4)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {(run.actual_value - result.predicted_value).toFixed(4)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {run.within_pi ? (
                      <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="mx-auto h-4 w-4 text-red-500" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-2">
          {result.warnings.map((warning, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span className="text-muted-foreground">{warning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
