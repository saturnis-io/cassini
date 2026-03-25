import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { useSampleLabel } from '@/hooks/useSampleLabel'
import type { AnomalyEvent } from '@/types/anomaly'
import { CheckCircle2, XCircle, Clock, User } from 'lucide-react'

/** Human-friendly labels for raw detail keys from the anomaly detector. */
const DETAIL_LABELS: Record<string, string> = {
  p_value: 'Confidence',
  shift_sigma: 'Shift size',
  shift_magnitude: 'Shift magnitude',
  segment_before_mean: 'Mean before shift',
  segment_after_mean: 'Mean after shift',
  reference_mean: 'Expected mean',
  test_mean: 'Observed mean',
  reference_std: 'Expected std dev',
  test_std: 'Observed std dev',
  contamination: 'Expected anomaly rate',
  alpha: 'Significance level',
  reference_window: 'Reference window',
  test_window: 'Test window',
}

/** Keys to hide entirely — raw internals that add no user value. */
const HIDDEN_KEYS = new Set([
  'anomaly_score',
  'ks_statistic',
  'n_trees',
  'features',
  'contributing_features',
  'changepoint_index',
  'threshold',
  'window_start_id',
  'window_end_id',
])

/** Format a detail value based on its key for human readability. */
function formatDetailValue(key: string, value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  if (key === 'p_value') {
    const clamped = Math.max(0, Math.min(1, value))
    const confidence = Math.min((1 - clamped) * 100, 99.9).toFixed(1)
    return `${confidence}%`
  }
  if (key === 'shift_sigma') {
    return `${Math.abs(value).toFixed(2)}\u03C3`
  }
  if (key === 'contamination') {
    return `${(value * 100).toFixed(1)}%`
  }
  return value.toFixed(4)
}

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
  const { t } = useTranslation('anomaly')
  const { formatDateTime } = useDateFormat()
  const getSampleLabel = useSampleLabel(event.char_id)
  const [dismissReason, setDismissReason] = useState('')
  const [showDismissInput, setShowDismissInput] = useState(false)

  const handleDismiss = () => {
    if (dismissReason.trim()) {
      onDismiss(dismissReason.trim())
      setDismissReason('')
      setShowDismissInput(false)
    }
  }

  // Format details as key-value pairs, hiding raw internals
  const detailEntries = Object.entries(event.details).filter(
    ([k, v]) => v !== null && v !== undefined && !HIDDEN_KEYS.has(k),
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
            {t('detail.detectionDetails')}
          </h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            {detailEntries.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-1.5">
                <dt className="text-[10px] text-muted-foreground" title={key}>
                  {DETAIL_LABELS[key] ?? key.replace(/_/g, ' ')}:
                </dt>
                <dd className="text-xs tabular-nums text-foreground">
                  {formatDetailValue(key, value)}
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
          {getSampleLabel(event.sample_id) ?? `#${event.sample_id}`}
          <span className="mx-1">|</span>
          {t('detail.detected')}: {formatDateTime(event.detected_at)}
        </div>
      )}

      {/* Acknowledgment info */}
      {event.is_acknowledged && (
        <div className="flex items-center gap-1.5 text-[10px] text-green-600">
          <User className="h-3 w-3" />
          {event.acknowledged_at
            ? t('detail.acknowledgedByAt', { user: event.acknowledged_by, time: formatDateTime(event.acknowledged_at) })
            : t('detail.acknowledgedBy', { user: event.acknowledged_by })}
        </div>
      )}

      {/* Dismissal info */}
      {event.is_dismissed && (
        <div className="text-[10px] text-muted-foreground">
          <span className="font-medium">{t('detail.dismissedBy', { user: event.dismissed_by })}</span>
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
            {t('detail.acknowledge')}
          </button>

          {!showDismissInput ? (
            <button
              onClick={() => setShowDismissInput(true)}
              className="flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <XCircle className="h-3 w-3" />
              {t('detail.dismiss')}
            </button>
          ) : (
            <div className="flex flex-1 items-center gap-1.5">
              <input
                type="text"
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDismiss()}
                placeholder={t('detail.dismissReasonPlaceholder')}
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                autoFocus
              />
              <button
                onClick={handleDismiss}
                disabled={!dismissReason.trim()}
                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {t('detail.dismiss')}
              </button>
              <button
                onClick={() => {
                  setShowDismissInput(false)
                  setDismissReason('')
                }}
                className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {t('buttons.cancel', { ns: 'common' })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
