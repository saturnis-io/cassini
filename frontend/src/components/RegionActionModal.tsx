import { X, CalendarRange, AlertTriangle } from 'lucide-react'
import { formatDisplayKey } from '@/lib/display-key'

export interface RegionSelection {
  startTime: string // ISO timestamp
  endTime: string // ISO timestamp
  startDisplayKey: string // e.g. "260211-001"
  endDisplayKey: string // e.g. "260211-012"
  sampleCount: number
  violationIds: number[] // unacknowledged only
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
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  )
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
      <div className="bg-card border-border relative mx-4 w-full max-w-sm rounded-2xl border shadow-xl">
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarRange className="text-primary h-5 w-5" />
            <h2 className="text-lg font-semibold">Region Selected</h2>
          </div>
          <button onClick={onClose} className="hover:bg-muted rounded p-1 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Selection info */}
          <div className="space-y-1">
            <div className="text-sm font-medium">
              {selection.sampleCount} sample{selection.sampleCount !== 1 ? 's' : ''}{' '}
              <span className="text-muted-foreground font-normal">
                ({formatDisplayKey(selection.startDisplayKey)} —{' '}
                {formatDisplayKey(selection.endDisplayKey)})
              </span>
            </div>
            <div className="text-muted-foreground text-xs">
              {formatDate(selection.startTime)} — {formatDate(selection.endTime)}
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2">
            <button
              onClick={onAnnotate}
              className="border-border hover:bg-muted/50 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors"
            >
              <CalendarRange className="text-warning h-5 w-5 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium">Annotate Region</div>
                <div className="text-muted-foreground text-xs">
                  Add a note covering this time range
                </div>
              </div>
            </button>

            {canAcknowledge && selection.violationIds.length > 0 && (
              <button
                onClick={onAcknowledge}
                className="border-destructive/30 hover:bg-destructive/5 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors"
              >
                <AlertTriangle className="text-destructive h-5 w-5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium">
                    Acknowledge {selection.violationIds.length} Violation
                    {selection.violationIds.length !== 1 ? 's' : ''}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Bulk acknowledge violations in this range
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-border flex items-center justify-end border-t px-5 py-3">
          <button
            onClick={onClose}
            className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
