import { useState } from 'react'
import { History } from 'lucide-react'
import { useSampleEditHistory } from '@/api/hooks'
import { cn } from '@/lib/utils'

interface EditHistoryTooltipProps {
  sampleId: number
  editCount: number
}

export function EditHistoryTooltip({ sampleId, editCount }: EditHistoryTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { data: history, isLoading } = useSampleEditHistory(isOpen ? sampleId : null)

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen(!isOpen)}
        className="text-amber-500 hover:text-amber-400 transition-colors"
        title={`Modified ${editCount} time(s)`}
      >
        <History className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 left-0 top-full mt-1',
            'bg-popover border border-border rounded-lg shadow-lg',
            'min-w-[280px] max-w-[360px]',
            'animate-in fade-in-0 zoom-in-95 duration-100'
          )}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="px-3 py-2 border-b border-border bg-muted/50 rounded-t-lg">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">Edit History</span>
              <span className="text-xs text-muted-foreground">({editCount} edit{editCount !== 1 ? 's' : ''})</span>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                Loading history...
              </div>
            ) : !history || history.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No edit history found
              </div>
            ) : (
              <div className="divide-y divide-border">
                {history.map((entry, idx) => (
                  <div key={entry.id} className="px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.edited_at).toLocaleString()}
                      </span>
                      {idx === 0 && (
                        <span className="text-xs bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded">
                          Latest
                        </span>
                      )}
                    </div>
                    {entry.edited_by && (
                      <div className="text-xs text-muted-foreground mb-1">
                        by {entry.edited_by}
                      </div>
                    )}
                    <div className="text-xs mb-1.5">
                      <span className="text-muted-foreground">Reason: </span>
                      <span className="italic">{entry.reason}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-red-500/70 line-through">
                        {entry.previous_mean.toFixed(4)}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-green-600">
                        {entry.new_mean.toFixed(4)}
                      </span>
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
