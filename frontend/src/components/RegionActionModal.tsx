import { X, CalendarRange, AlertTriangle } from 'lucide-react'
import { formatDisplayKey } from '@/lib/display-key'

export interface RegionSelection {
  startTime: string       // ISO timestamp
  endTime: string         // ISO timestamp
  startDisplayKey: string // e.g. "260211-001"
  endDisplayKey: string   // e.g. "260211-012"
  sampleCount: number
  violationIds: number[]  // unacknowledged only
}

interface RegionActionModalProps {
  selection: RegionSelection
  canAcknowledge: boolean
  onAnnotate: () => void
  onAcknowledge: () => void
  onClose: () => void
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function RegionActionModal({
  selection,
  canAcknowledge,
  onAnnotate,
  onAcknowledge,
  onClose,
}: RegionActionModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Region Selected</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Selection info */}
          <div className="space-y-1">
            <div className="text-sm font-medium">
              {selection.sampleCount} sample{selection.sampleCount !== 1 ? 's' : ''}{' '}
              <span className="text-muted-foreground font-normal">
                ({formatDisplayKey(selection.startDisplayKey)} — {formatDisplayKey(selection.endDisplayKey)})
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDate(selection.startTime)} — {formatDate(selection.endTime)}
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2">
            <button
              onClick={onAnnotate}
              className="w-full flex items-center gap-3 px-4 py-3 border border-border rounded-xl hover:bg-muted/50 transition-colors text-left"
            >
              <CalendarRange className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium">Annotate Region</div>
                <div className="text-xs text-muted-foreground">Add a note covering this time range</div>
              </div>
            </button>

            {canAcknowledge && selection.violationIds.length > 0 && (
              <button
                onClick={onAcknowledge}
                className="w-full flex items-center gap-3 px-4 py-3 border border-destructive/30 rounded-xl hover:bg-destructive/5 transition-colors text-left"
              >
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium">
                    Acknowledge {selection.violationIds.length} Violation{selection.violationIds.length !== 1 ? 's' : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">Bulk acknowledge violations in this range</div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
