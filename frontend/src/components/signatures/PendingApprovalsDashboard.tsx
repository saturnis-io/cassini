import { useState } from 'react'
import { Clock, PenLine, XCircle, ChevronRight, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePendingApprovals } from '@/api/hooks'
import { SignatureDialog } from './SignatureDialog'
import { RejectDialog } from './RejectDialog'
import type { PendingApproval } from '@/types/signature'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const RESOURCE_LABELS: Record<string, string> = {
  sample_approval: 'Sample Approval',
  limit_change: 'Control Limit Change',
  config_change: 'Configuration Change',
  report_release: 'Report Release',
  violation_disposition: 'Violation Disposition',
  user_management: 'User Management',
}

export function PendingApprovalsDashboard({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = usePendingApprovals()
  const [signTarget, setSignTarget] = useState<PendingApproval | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PendingApproval | null>(null)

  const items = data?.items ?? []

  // In compact mode, hide entirely when there are no pending approvals
  if (compact && !isLoading && items.length === 0) return null

  return (
    <div className="bg-card border-border rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="text-primary h-5 w-5" />
          <h3 className="text-foreground text-sm font-semibold">
            Pending Approvals{items.length > 0 && ` (${items.length})`}
          </h3>
        </div>
      </div>

      {isLoading && (
        <div className="text-muted-foreground py-6 text-center text-sm">Loading...</div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="py-6 text-center">
          <Inbox className="text-muted-foreground/50 mx-auto mb-2 h-8 w-8" />
          <p className="text-muted-foreground text-sm">No pending approvals</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item: PendingApproval) => (
          <div
            key={item.workflow_instance_id}
            className="bg-background border-border rounded-lg border p-3"
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <ChevronRight className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
                  <span className="text-foreground truncate text-sm font-medium">
                    {item.resource_summary}
                  </span>
                </div>
                <div className="text-muted-foreground mt-1 flex items-center gap-2 pl-5 text-xs">
                  <span className="bg-muted rounded px-1.5 py-0.5">
                    {RESOURCE_LABELS[item.resource_type] || item.resource_type}
                  </span>
                  <span>
                    Step {item.step_number} of {item.total_steps}: {item.current_step}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 pl-5 text-xs">
                  Initiated {relativeTime(item.initiated_at)} by {item.initiated_by}
                </p>

                {/* Progress dots */}
                <div className="mt-2 flex items-center gap-1 pl-5">
                  {Array.from({ length: item.total_steps }, (_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-1.5 w-6 rounded-full',
                        i < item.step_number - 1
                          ? 'bg-green-500'
                          : i === item.step_number - 1
                            ? 'bg-primary'
                            : 'bg-muted',
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 pl-5">
              <button
                type="button"
                onClick={() => setSignTarget(item)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
              >
                <PenLine className="h-3 w-3" />
                Sign
              </button>
              <button
                type="button"
                onClick={() => setRejectTarget(item)}
                className="border-border hover:bg-destructive/10 text-destructive flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
              >
                <XCircle className="h-3 w-3" />
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Sign dialog */}
      {signTarget && (
        <SignatureDialog
          open={!!signTarget}
          onClose={() => setSignTarget(null)}
          onSigned={() => setSignTarget(null)}
          resourceType={signTarget.resource_type}
          resourceId={signTarget.resource_id}
          resourceSummary={signTarget.resource_summary}
          workflowInstanceId={signTarget.workflow_instance_id}
        />
      )}

      {/* Reject dialog */}
      {rejectTarget && (
        <RejectDialog
          open={!!rejectTarget}
          onClose={() => setRejectTarget(null)}
          onRejected={() => setRejectTarget(null)}
          workflowInstanceId={rejectTarget.workflow_instance_id}
          resourceSummary={rejectTarget.resource_summary}
        />
      )}
    </div>
  )
}
