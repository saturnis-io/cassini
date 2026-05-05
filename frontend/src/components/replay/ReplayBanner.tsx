import { History, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'

interface ReplayBannerProps {
  /** ISO timestamp of the active replay snapshot. */
  timestamp: string
  /** Number of audit events that fed the reconstruction (for trust signaling). */
  auditEventCount?: number
  /** Called when the user exits replay mode. */
  onExit: () => void
  className?: string
}

/**
 * Persistent banner shown across the chart detail page while a replay
 * snapshot is active. Communicates that the chart is rendering historical
 * state so operators don't act on stale numbers.
 *
 * Tier-gated upstream — this component renders unconditionally when given
 * a timestamp; the embedding page is responsible for gating via
 * `useLicense().isProOrAbove`.
 */
export function ReplayBanner({
  timestamp,
  auditEventCount,
  onExit,
  className,
}: ReplayBannerProps) {
  const { formatDateTime } = useDateFormat()

  return (
    <div
      data-ui="replay-banner"
      role="status"
      aria-live="polite"
      className={cn(
        'border-warning/40 bg-warning/10 text-warning flex items-center gap-3 rounded-md border px-3 py-2 text-sm',
        className,
      )}
    >
      <History className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold uppercase tracking-wide">Replay:</span>{' '}
        <span data-ui="replay-banner-timestamp" className="font-mono">
          {formatDateTime(timestamp)}
        </span>
        {typeof auditEventCount === 'number' && (
          <span className="text-muted-foreground ml-2 text-xs">
            ({auditEventCount} audit event{auditEventCount === 1 ? '' : 's'} replayed)
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onExit}
        data-ui="replay-banner-exit"
        className="border-warning/40 text-warning hover:bg-warning/20 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs"
        aria-label="Exit replay mode"
      >
        <X className="h-3 w-3" />
        Exit
      </button>
    </div>
  )
}
