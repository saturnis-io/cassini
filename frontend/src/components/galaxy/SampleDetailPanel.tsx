import { useEffect, useState } from 'react'
import {
  X,
  Clock,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
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

  const acknowledgeMutation = useAcknowledgeViolation()

  // Fetch violations for this sample if there are any
  const hasViolations = sampleData.violation_ids.length > 0
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

  const formattedTimestamp = new Date(sampleData.timestamp).toLocaleString()

  return (
    <div
      className={cn(
        'fixed top-0 right-0 bottom-0 z-[60] w-96 border-l border-white/10 bg-[#0D1117] shadow-2xl',
        'explanation-panel-slide-in',
        'flex flex-col overflow-hidden',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-amber-400" />
          <span className="font-mono text-sm font-semibold text-gray-200">
            Sample Detail
          </span>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-md p-1 text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
          aria-label="Close sample detail panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Timestamp */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono">{formattedTimestamp}</span>
        </div>

        {/* Sample values */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Sample Values
          </h4>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Mean</span>
              <span className="font-mono font-medium tabular-nums text-gray-200">
                {sampleData.mean.toFixed(4)}
              </span>
            </div>
            {sampleData.range != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Range</span>
                <span className="font-mono font-medium tabular-nums text-gray-200">
                  {sampleData.range.toFixed(4)}
                </span>
              </div>
            )}
            {sampleData.std_dev != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Std Dev</span>
                <span className="font-mono font-medium tabular-nums text-gray-200">
                  {sampleData.std_dev.toFixed(4)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Zone</span>
              <span className="font-mono text-xs text-gray-300">
                {sampleData.zone}
              </span>
            </div>
            {sampleData.excluded && (
              <div className="mt-1 rounded bg-yellow-900/30 px-2 py-1 text-[11px] text-yellow-400">
                Sample excluded from calculations
              </div>
            )}
          </div>
        </div>

        {/* Violation details */}
        {hasViolations && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <h4 className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Violations ({sampleData.violation_ids.length})
              </h4>
            </div>

            {/* Show rule summaries from chart data point */}
            {sampleData.violation_rules.length > 0 &&
              violations.length === 0 && (
                <div className="space-y-2">
                  {sampleData.violation_rules.map((ruleId) => {
                    const rule = NELSON_RULES[ruleId]
                    return (
                      <div
                        key={ruleId}
                        className="rounded-lg border border-red-500/20 bg-red-950/20 p-3"
                      >
                        <div className="font-mono text-xs font-medium text-red-400">
                          Rule {ruleId}: {rule?.name ?? 'Unknown'}
                        </div>
                        {rule?.description && (
                          <div className="mt-1 text-[11px] text-gray-500">
                            {rule.description}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

            {/* Full violation details from API */}
            {violations.map((violation) => {
              const rule = NELSON_RULES[violation.rule_id]
              const isUnacked =
                !violation.acknowledged && violation.requires_acknowledgement
              return (
                <div
                  key={violation.id}
                  className={cn(
                    'rounded-lg border p-3',
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
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Acknowledged by {violation.ack_user}
                      {violation.ack_reason && (
                        <span className="text-gray-500">
                          {' '}
                          — {violation.ack_reason}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Acknowledge button for unacked violations */}
                  {isUnacked && (
                    <div className="mt-2 space-y-2">
                      <input
                        type="text"
                        placeholder="Reason for acknowledgement..."
                        value={ackingId === violation.id ? ackReason : ''}
                        onFocus={() => setAckingId(violation.id)}
                        onChange={(e) => {
                          setAckingId(violation.id)
                          setAckReason(e.target.value)
                        }}
                        className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-amber-500/50"
                      />
                      <button
                        onClick={() => handleAcknowledge(violation.id)}
                        disabled={
                          acknowledgeMutation.isPending ||
                          (ackingId === violation.id && !ackReason.trim())
                        }
                        className={cn(
                          'flex w-full cursor-pointer items-center justify-center gap-1.5 rounded px-2 py-1.5',
                          'font-mono text-xs font-medium transition-colors',
                          'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                        )}
                      >
                        {acknowledgeMutation.isPending &&
                        ackingId === violation.id ? (
                          <span>Acknowledging...</span>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            Acknowledge
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* No violations */}
        {!hasViolations && (
          <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-950/10 p-3 text-xs text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>No violations on this sample</span>
          </div>
        )}

        {/* Unacknowledged violation count */}
        {sampleData.unacknowledged_violation_ids.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 text-xs text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {sampleData.unacknowledged_violation_ids.length} unacknowledged
              violation
              {sampleData.unacknowledged_violation_ids.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
