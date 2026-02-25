import { History, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SampleEditHistory } from '@/types'

export interface EditHistorySectionProps {
  history: SampleEditHistory[]
  precision: number
}

export function EditHistorySection({ history, precision }: EditHistorySectionProps) {
  if (history.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        No edit history for this sample.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {history.map((entry, idx) => (
        <div key={entry.id} className="border-border overflow-hidden rounded-lg border">
          <div className="bg-muted/30 border-border flex items-center justify-between border-b px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <History className="text-warning h-3.5 w-3.5" />
              <span className="text-muted-foreground">
                {new Date(entry.edited_at).toLocaleString()}
              </span>
              {idx === 0 && (
                <span className="bg-warning/10 text-warning rounded px-1.5 py-0.5 text-[10px] font-medium">
                  Latest
                </span>
              )}
            </div>
            {entry.edited_by && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <User className="h-3 w-3" /> {entry.edited_by}
              </span>
            )}
          </div>

          <div className="space-y-2 px-4 py-3 text-sm">
            {/* Reason */}
            <div>
              <span className="text-muted-foreground text-xs">Reason: </span>
              <span className="text-xs italic">{entry.reason}</span>
            </div>

            {/* Mean diff */}
            <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
              <span className="text-destructive/70 line-through">
                {entry.previous_mean.toFixed(precision)}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="text-success">{entry.new_mean.toFixed(precision)}</span>
            </div>

            {/* Value-by-value diff */}
            {entry.previous_values.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {entry.previous_values.map((prev, i) => {
                  const next = entry.new_values[i]
                  const changed = prev !== next
                  return (
                    <div
                      key={i}
                      className={cn(
                        'rounded border px-2 py-1 font-mono text-xs',
                        changed ? 'border-warning/30 bg-warning/5' : 'border-border bg-muted/20',
                      )}
                    >
                      <span className="text-muted-foreground mr-0.5">M{i + 1}:</span>
                      {changed ? (
                        <>
                          <span className="text-destructive/70 line-through">
                            {prev.toFixed(precision)}
                          </span>
                          <span className="text-muted-foreground mx-0.5">→</span>
                          <span className="text-success">{next.toFixed(precision)}</span>
                        </>
                      ) : (
                        <span>{prev.toFixed(precision)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
