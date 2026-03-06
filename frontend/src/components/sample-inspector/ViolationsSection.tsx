import { ShieldAlert, CheckCircle, User, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { NELSON_RULES, NELSON_RULE_DETAILS } from '@/lib/nelson-rules'
import { NELSON_SPARKLINES } from '@/components/characteristic-config/NelsonSparklines'
import { SeverityBadge } from './shared'
import type { Violation } from '@/types'

export interface ViolationsSectionProps {
  violations: Violation[]
  canAcknowledge: boolean
  ackViolationId: number | null
  ackReason: string
  isAcknowledging: boolean
  setAckViolationId: (id: number | null) => void
  setAckReason: (reason: string) => void
  onAcknowledge: () => void
}

export function ViolationsSection({
  violations,
  canAcknowledge,
  ackViolationId,
  ackReason,
  isAcknowledging,
  setAckViolationId,
  setAckReason,
  onAcknowledge,
}: ViolationsSectionProps) {
  const { formatDateTime } = useDateFormat()
  if (violations.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        No violations for this sample.
      </div>
    )
  }

  return (
    <div data-ui="sample-violations" className="space-y-3">
      {violations.map((v) => {
        const ruleMeta = NELSON_RULES.find((r) => r.id === v.rule_id)
        const ruleDetail = NELSON_RULE_DETAILS[v.rule_id]
        const Sparkline = NELSON_SPARKLINES[v.rule_id]

        return (
          <div key={v.id} className="border-border overflow-hidden rounded-lg border">
            {/* Violation header */}
            <div className="bg-muted/30 flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <ShieldAlert
                  className={cn(
                    'h-4 w-4',
                    v.severity === 'CRITICAL'
                      ? 'text-destructive'
                      : v.severity === 'WARNING'
                        ? 'text-warning'
                        : 'text-primary',
                  )}
                />
                <span className="text-sm font-medium">
                  Rule {v.rule_id}: {ruleMeta?.name ?? v.rule_name}
                </span>
                {Sparkline && (
                  <div className="bg-background/50 border-border/50 flex h-6 w-16 flex-shrink-0 items-center justify-center rounded border">
                    <Sparkline className="text-foreground/80" />
                  </div>
                )}
                <SeverityBadge severity={v.severity} />
              </div>
              {v.acknowledged && (
                <span className="text-success inline-flex items-center gap-1 text-xs">
                  <CheckCircle className="h-3 w-3" /> Acknowledged
                </span>
              )}
            </div>

            {/* Rule details */}
            <div className="space-y-2 px-4 py-3 text-sm">
              {ruleDetail && (
                <>
                  <p className="text-foreground">{ruleDetail.description}</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-muted-foreground mb-0.5 text-[10px] tracking-wider uppercase">
                        Common Causes
                      </div>
                      <p className="text-foreground/80 text-xs">{ruleDetail.cause}</p>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-0.5 text-[10px] tracking-wider uppercase">
                        Recommended Action
                      </div>
                      <p className="text-foreground/80 text-xs">{ruleDetail.action}</p>
                    </div>
                  </div>
                </>
              )}

              {v.message && <p className="text-muted-foreground text-xs italic">{v.message}</p>}

              {/* Acknowledgment info or action */}
              {v.acknowledged ? (
                <div className="border-success/20 bg-success/5 mt-2 rounded-md border px-3 py-2">
                  <div className="flex items-center gap-4 text-xs">
                    {v.ack_user && (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> {v.ack_user}
                      </span>
                    )}
                    {v.ack_timestamp && (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatDateTime(v.ack_timestamp)}
                      </span>
                    )}
                  </div>
                  {v.ack_reason && (
                    <p className="text-muted-foreground mt-1 text-xs italic">{v.ack_reason}</p>
                  )}
                </div>
              ) : (
                canAcknowledge &&
                v.requires_acknowledgement && (
                  <div className="mt-2">
                    {ackViolationId === v.id ? (
                      <div className="space-y-2">
                        <textarea
                          placeholder="Reason for acknowledgment (required)..."
                          value={ackReason}
                          onChange={(e) => setAckReason(e.target.value)}
                          className="bg-background border-border focus:ring-primary w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={onAcknowledge}
                            disabled={!ackReason.trim() || isAcknowledging}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            <CheckCircle className="h-3 w-3" />
                            {isAcknowledging ? 'Acknowledging...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => {
                              setAckViolationId(null)
                              setAckReason('')
                            }}
                            className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAckViolationId(v.id)}
                        className="border-warning/30 text-warning hover:bg-warning/10 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        <CheckCircle className="h-3 w-3" />
                        Acknowledge
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
