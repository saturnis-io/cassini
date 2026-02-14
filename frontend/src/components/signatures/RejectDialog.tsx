import { useState, useEffect } from 'react'
import { XCircle, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRejectWorkflow } from '@/api/hooks'

interface RejectDialogProps {
  open: boolean
  onClose: () => void
  onRejected: () => void
  workflowInstanceId: number
  resourceSummary: string
}

export function RejectDialog({
  open,
  onClose,
  onRejected,
  workflowInstanceId,
  resourceSummary,
}: RejectDialogProps) {
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const rejectMutation = useRejectWorkflow()

  useEffect(() => {
    if (open) {
      setPassword('')
      setReason('')
      rejectMutation.reset()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit =
    password.length > 0 && reason.trim().length > 0 && !rejectMutation.isPending

  const handleSubmit = () => {
    if (!canSubmit) return
    rejectMutation.mutate(
      {
        workflow_instance_id: workflowInstanceId,
        password,
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          onRejected()
          onClose()
        },
      },
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="bg-card border-border relative z-10 w-full max-w-md rounded-2xl border p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-destructive/10 rounded-lg p-2">
            <XCircle className="text-destructive h-5 w-5" />
          </div>
          <h2 className="text-foreground text-lg font-semibold">Reject Workflow</h2>
        </div>

        <div className="bg-muted mb-4 rounded-lg p-3">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            You are rejecting
          </p>
          <p className="text-foreground mt-1 text-sm">{resourceSummary}</p>
        </div>

        {rejectMutation.isError && (
          <div className="bg-destructive/10 text-destructive mb-4 flex items-start gap-2 rounded-lg p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{rejectMutation.error.message}</span>
          </div>
        )}

        <div className="mb-4">
          <label className="text-foreground mb-1 block text-sm font-medium">
            Reason for Rejection (required)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Explain why this is being rejected..."
            className="bg-background border-input focus:ring-ring w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>

        <div className="mb-6">
          <label className="text-foreground mb-1 block text-sm font-medium">
            Password (re-authentication)
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your current password"
            autoComplete="current-password"
            className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) handleSubmit()
            }}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={rejectMutation.isPending}
            className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-5 py-2.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium',
              canSubmit
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            {rejectMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Rejecting...
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                Confirm Rejection
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
