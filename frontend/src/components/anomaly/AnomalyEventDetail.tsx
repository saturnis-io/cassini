import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { AnomalyEvent } from '@/types/anomaly'
import { CheckCircle2, XCircle, Clock, User } from 'lucide-react'

interface AnomalyEventDetailProps {
  event: AnomalyEvent
  onAcknowledge: () => void
  onDismiss: (reason: string) => void
  className?: string
}

export function AnomalyEventDetail({
  event,
  onAcknowledge,
  onDismiss,
  className,
}: AnomalyEventDetailProps) {
  const [dismissReason, setDismissReason] = useState('')
  const [showDismissInput, setShowDismissInput] = useState(false)

  const handleDismiss = () => {
    if (dismissReason.trim()) {
      onDismiss(dismissReason.trim())
      setDismissReason('')
      setShowDismissInput(false)
    }
  }

  // Format details as key-value pairs
  const detailEntries = Object.entries(event.details).filter(
    ([, v]) => v !== null && v !== undefined,
  )

  return (
    <div className={cn('space-y-3 border-t border-border/30 bg-muted/10 px-4 py-3', className)}>
      {/* Summary */}
      {event.summary && (
        <div className="rounded bg-muted/30 px-3 py-2">
          <p className="text-xs leading-relaxed text-foreground">{event.summary}</p>
        </div>
      )}

      {/* Detail key-value pairs */}
      {detailEntries.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Detection Details {/* TODO: i18n */}
          </h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            {detailEntries.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-1.5">
                <dt className="text-[10px] text-muted-foreground">
                  {key.replace(/_/g, ' ')}:
                </dt>
                <dd className="text-xs tabular-nums text-foreground">
                  {typeof value === 'number'
                    ? value.toFixed(4)
                    : typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Linked sample info */}
      {event.sample_id && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Sample ID: {event.sample_id}
          <span className="mx-1">|</span>
          Detected: {new Date(event.detected_at).toLocaleString()}
        </div>
      )}

      {/* Acknowledgment info */}
      {event.is_acknowledged && (
        <div className="flex items-center gap-1.5 text-[10px] text-green-600">
          <User className="h-3 w-3" />
          Acknowledged by {event.acknowledged_by}
          {event.acknowledged_at && (
            <span>at {new Date(event.acknowledged_at).toLocaleString()}</span>
          )}
        </div>
      )}

      {/* Dismissal info */}
      {event.is_dismissed && (
        <div className="text-[10px] text-muted-foreground">
          <span className="font-medium">Dismissed</span> by {event.dismissed_by}
          {event.dismissed_reason && <span>: {event.dismissed_reason}</span>}
        </div>
      )}

      {/* Action buttons */}
      {!event.is_acknowledged && !event.is_dismissed && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onAcknowledge}
            className="flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700"
          >
            <CheckCircle2 className="h-3 w-3" />
            Acknowledge {/* TODO: i18n */}
          </button>

          {!showDismissInput ? (
            <button
              onClick={() => setShowDismissInput(true)}
              className="flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <XCircle className="h-3 w-3" />
              Dismiss {/* TODO: i18n */}
            </button>
          ) : (
            <div className="flex flex-1 items-center gap-1.5">
              <input
                type="text"
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDismiss()}
                placeholder="Reason for dismissal..."
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                autoFocus
              />
              <button
                onClick={handleDismiss}
                disabled={!dismissReason.trim()}
                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setShowDismissInput(false)
                  setDismissReason('')
                }}
                className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
