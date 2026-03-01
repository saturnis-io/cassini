import { useState } from 'react'
import { History } from 'lucide-react'
import { useSampleEditHistory } from '@/api/hooks'
import { useDateFormat } from '@/hooks/useDateFormat'
import { cn } from '@/lib/utils'

interface EditHistoryTooltipProps {
  sampleId: number
  editCount: number
}

export function EditHistoryTooltip({ sampleId, editCount }: EditHistoryTooltipProps) {
  const { formatDateTime } = useDateFormat()
  const [isOpen, setIsOpen] = useState(false)
  const { data: history, isLoading } = useSampleEditHistory(isOpen ? sampleId : null)

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen(!isOpen)}
        className="text-warning hover:text-warning/80 transition-colors"
        title={`Modified ${editCount} time(s)`}
      >
        <History className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full left-0 z-50 mt-1',
            'bg-popover border-border rounded-lg border shadow-lg',
            'max-w-[360px] min-w-[280px]',
            'animate-in fade-in-0 zoom-in-95 duration-100',
          )}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="border-border bg-muted/50 rounded-t-lg border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <History className="text-warning h-4 w-4" />
              <span className="text-sm font-medium">Edit History</span>
              <span className="text-muted-foreground text-xs">
                ({editCount} edit{editCount !== 1 ? 's' : ''})
              </span>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            {isLoading ? (
              <div className="text-muted-foreground px-3 py-4 text-center text-sm">
                Loading history...
              </div>
            ) : !history || history.length === 0 ? (
              <div className="text-muted-foreground px-3 py-4 text-center text-sm">
                No edit history found
              </div>
            ) : (
              <div className="divide-border divide-y">
                {history.map((entry, idx) => (
                  <div key={entry.id} className="px-3 py-2.5 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(entry.edited_at)}
                      </span>
                      {idx === 0 && (
                        <span className="bg-warning/10 text-warning rounded px-1.5 py-0.5 text-xs">
                          Latest
                        </span>
                      )}
                    </div>
                    {entry.edited_by && (
                      <div className="text-muted-foreground mb-1 text-xs">by {entry.edited_by}</div>
                    )}
                    <div className="mb-1.5 text-xs">
                      <span className="text-muted-foreground">Reason: </span>
                      <span className="italic">{entry.reason}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="text-destructive/70 line-through">
                        {entry.previous_mean.toFixed(4)}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-success">{entry.new_mean.toFixed(4)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
