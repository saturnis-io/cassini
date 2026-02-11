import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useBatchAcknowledgeViolation, useReasonCodes } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'

interface BulkAcknowledgeDialogProps {
  violationIds: number[]
  onClose: () => void
  contextLabel?: string
}

export function BulkAcknowledgeDialog({ violationIds, onClose, contextLabel }: BulkAcknowledgeDialogProps) {
  const [selectedReason, setSelectedReason] = useState('')
  const [notes, setNotes] = useState('')
  const [excludeSample, setExcludeSample] = useState(false)

  const { user } = useAuth()
  const { data: reasonCodes, isLoading: loadingCodes } = useReasonCodes()
  const batchMutation = useBatchAcknowledgeViolation()

  const isOther = selectedReason === 'Other'
  const canSubmit = selectedReason && (!isOther || notes.trim().length > 0) && !batchMutation.isPending

  const handleSubmit = () => {
    const reason = notes.trim()
      ? `${selectedReason}: ${notes.trim()}`
      : selectedReason

    batchMutation.mutate(
      {
        violation_ids: violationIds,
        reason,
        user: user?.username ?? 'Unknown',
        exclude_sample: excludeSample,
      },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold">Bulk Acknowledge Violations</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Acknowledging <span className="font-semibold text-foreground">{violationIds.length}</span> violation{violationIds.length !== 1 ? 's' : ''}
            {contextLabel && <span> {contextLabel}</span>}
          </p>

          {/* Reason Code */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Reason <span className="text-destructive">*</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              disabled={loadingCodes}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select a reason...</option>
              {reasonCodes?.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Additional Notes{isOther && <span className="text-destructive"> *</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              placeholder={isOther ? 'Please describe the reason...' : 'Optional notes...'}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <div className="text-xs text-muted-foreground text-right">{notes.length}/500</div>
          </div>

          {/* Exclude Sample */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeSample}
              onChange={(e) => setExcludeSample(e.target.checked)}
              className="mt-0.5 rounded border-border"
            />
            <span className="text-sm text-muted-foreground">
              Exclude affected samples from control limit calculations
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {batchMutation.isPending ? 'Acknowledging...' : `Acknowledge ${violationIds.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}
