import { useEffect, useState } from 'react'
import {
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { useViolations, useAcknowledgeViolation } from '@/api/hooks'
import { NELSON_RULES } from '@/components/ViolationLegend'
import type { ChartDataPoint } from '@/types'

interface SampleDetailPanelProps {
  /** The chart data point to display */
  sampleData: ChartDataPoint
  /** The characteristic id this sample belongs to */
  charId: number
  /** Callback to close the panel */
  onClose: () => void
}

export function SampleDetailPanel({
  sampleData,
  charId,
  onClose,
}: SampleDetailPanelProps) {
  const { user } = useAuth()
  const [ackReason, setAckReason] = useState('')
  const [ackingId, setAckingId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)

  const acknowledgeMutation = useAcknowledgeViolation()

  // Fetch violations for this sample if there are any
  const hasViolations = sampleData.violation_ids.length > 0
  const hasUnacked = sampleData.unacknowledged_violation_ids.length > 0
  const { data: violationsData } = useViolations(
    hasViolations
      ? {
          characteristic_id: charId,
          sample_id: sampleData.sample_id,
          per_page: 50,
        }
      : undefined,
  )

  const violations = violationsData?.items ?? []

  // ESC to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleAcknowledge = (violationId: number) => {
    if (!ackReason.trim() || !user) return
    setAckingId(violationId)
    acknowledgeMutation.mutate(
      { id: violationId, reason: ackReason.trim(), user: user.username },
      {
        onSettled: () => {
          setAckingId(null)
          setAckReason('')
        },
      },
    )
  }

  const formattedTime = new Date(sampleData.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div
      className={cn(
        'fixed top-0 right-0 left-0 z-[60]',
        'border-b border-white/10 bg-black/80 shadow-2xl backdrop-blur-md',
        'animate-in slide-in-from-top duration-200',
      )}
    >
      {/* Main bar — single row of inline chips */}
      <div className="flex items-center gap-3 px-4 py-2.5 font-mono">
        {/* Timestamp chip */}
        <div className="flex shrink-0 items-center gap-1.5 text-sm text-gray-400">
          <Clock className="h-3.5 w-3.5" />
          <span className="tabular-nums">{formattedTime}</span>
        </div>

        <Separator />

        {/* Mean */}
        <Chip label="Mean" value={sampleData.mean.toFixed(4)} />

        {/* Range */}
        {sampleData.range != null && (
          <>
            <Separator />
            <Chip label="Range" value={sampleData.range.toFixed(4)} />
          </>
        )}

        {/* Std Dev */}
        {sampleData.std_dev != null && (
          <>
            <Separator />
            <Chip label="StdDev" value={sampleData.std_dev.toFixed(4)} />
          </>
        )}

        {/* Zone */}
        <Separator />
        <Chip label="Zone" value={sampleData.zone} />

        {/* Excluded badge */}
        {sampleData.excluded && (
          <>
            <Separator />
            <span className="rounded bg-yellow-900/30 px-1.5 py-0.5 text-xs text-yellow-400">
              Excluded
            </span>
          </>
        )}

        {/* Violation badges — compact inline */}
        {hasViolations && (
          <>
            <Separator />
            <div className="flex items-center gap-1.5">
              {sampleData.violation_rules.slice(0, 3).map((ruleId) => {
                const rule = NELSON_RULES[ruleId]
                return (
                  <span
                    key={ruleId}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs font-medium',
                      hasUnacked
                        ? 'bg-red-900/50 text-red-400'
                        : 'bg-amber-900/30 text-amber-500',
                    )}
                  >
                    Rule {ruleId}{rule?.name ? `: ${rule.name}` : ''}
                  </span>
                )
              })}
              {sampleData.violation_rules.length > 3 && (
                <span className="text-xs text-gray-500">
                  +{sampleData.violation_rules.length - 3}
                </span>
              )}
            </div>
          </>
        )}

        {/* Expand toggle (if violations present) + Close button — pushed right */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {hasViolations && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
            >
              <span>{expanded ? 'Less' : 'Details'}</span>
              <ChevronDown
                className={cn(
                  'h-3 w-3 transition-transform',
                  expanded && 'rotate-180',
                )}
              />
            </button>
          )}
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
            aria-label="Close sample detail panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expandable detail row — violation details + acknowledge */}
      {expanded && hasViolations && (
        <div className="border-t border-white/5 px-4 py-3">
          <div className="flex flex-wrap gap-3">
            {/* Show rule summaries while API loads */}
            {sampleData.violation_rules.length > 0 &&
              violations.length === 0 &&
              sampleData.violation_rules.map((ruleId) => {
                const rule = NELSON_RULES[ruleId]
                return (
                  <div
                    key={ruleId}
                    className="rounded border border-red-500/20 bg-red-950/20 px-3 py-2"
                  >
                    <div className="font-mono text-xs font-medium text-red-400">
                      Rule {ruleId}: {rule?.name ?? 'Unknown'}
                    </div>
                    {rule?.description && (
                      <div className="mt-0.5 text-[11px] text-gray-500">
                        {rule.description}
                      </div>
                    )}
                  </div>
                )
              })}

            {/* Full violation details from API */}
            {violations.map((violation) => {
              const rule = NELSON_RULES[violation.rule_id]
              const isUnacked =
                !violation.acknowledged && violation.requires_acknowledgement
              return (
                <div
                  key={violation.id}
                  className={cn(
                    'min-w-[240px] max-w-[360px] rounded border px-3 py-2',
                    isUnacked
                      ? 'border-red-500/30 bg-red-950/20'
                      : 'border-white/10 bg-white/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs font-medium text-red-400">
                        Rule {violation.rule_id}:{' '}
                        {rule?.name ?? violation.rule_name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500">
                        {rule?.description ?? violation.message}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                        violation.severity === 'CRITICAL' &&
                          'bg-red-900/50 text-red-400',
                        violation.severity === 'WARNING' &&
                          'bg-yellow-900/50 text-yellow-400',
                        violation.severity === 'INFO' &&
                          'bg-blue-900/50 text-blue-400',
                      )}
                    >
                      {violation.severity}
                    </span>
                  </div>

                  {/* Acknowledged state */}
                  {violation.acknowledged && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-green-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Acknowledged by {violation.ack_user}
                      {violation.ack_reason && (
                        <span className="text-gray-500">
                          {' '}
                          &mdash; {violation.ack_reason}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Acknowledge form for unacked violations */}
                  {isUnacked && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Reason..."
                        value={ackingId === violation.id ? ackReason : ''}
                        onFocus={() => setAckingId(violation.id)}
                        onChange={(e) => {
                          setAckingId(violation.id)
                          setAckReason(e.target.value)
                        }}
                        className="min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-amber-500/50"
                      />
                      <button
                        onClick={() => handleAcknowledge(violation.id)}
                        disabled={
                          acknowledgeMutation.isPending ||
                          (ackingId === violation.id && !ackReason.trim())
                        }
                        className={cn(
                          'flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-1',
                          'font-mono text-xs font-medium transition-colors',
                          'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                        )}
                      >
                        {acknowledgeMutation.isPending &&
                        ackingId === violation.id ? (
                          <span>...</span>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            Ack
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Unacknowledged count summary */}
          {hasUnacked && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {sampleData.unacknowledged_violation_ids.length} unacknowledged
              </span>
            </div>
          )}

          {/* No violations (shouldn't reach here, but safe) */}
          {!hasViolations && (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>No violations</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex shrink-0 items-baseline gap-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-gray-200">
        {value}
      </span>
    </div>
  )
}

function Separator() {
  return <div className="h-4 w-px shrink-0 bg-white/10" />
}
