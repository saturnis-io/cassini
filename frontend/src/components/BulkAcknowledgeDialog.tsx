import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useBatchAcknowledgeViolation, useReasonCodes } from '@/api/hooks'

interface BulkAcknowledgeDialogProps {
  violationIds: number[]
  onClose: () => void
  contextLabel?: string
}

export function BulkAcknowledgeDialog({
  violationIds,
  onClose,
  contextLabel,
}: BulkAcknowledgeDialogProps) {
  const [selectedReason, setSelectedReason] = useState('')
  const [notes, setNotes] = useState('')
  const [excludeSample, setExcludeSample] = useState(false)

  const { data: reasonCodes, isLoading: loadingCodes } = useReasonCodes()
  const batchMutation = useBatchAcknowledgeViolation()

  const isOther = selectedReason === 'Other'
  const canSubmit =
    selectedReason && (!isOther || notes.trim().length > 0) && !batchMutation.isPending

  const handleSubmit = () => {
    const reason = notes.trim() ? `${selectedReason}: ${notes.trim()}` : selectedReason

    // Server derives the acknowledging user from the authenticated principal
    // (21 CFR Part 11 §11.50). Do NOT pass a `user` field here.
    batchMutation.mutate(
      {
        violation_ids: violationIds,
        reason,
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
      <div className="bg-card border-border relative mx-4 w-full max-w-md rounded-2xl border shadow-xl">
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-destructive h-5 w-5" />
            <h2 className="text-lg font-semibold">Bulk Acknowledge Violations</h2>
          </div>
          <button onClick={onClose} className="hover:bg-muted rounded p-1 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          <p className="text-muted-foreground text-sm">
            Acknowledging{' '}
            <span className="text-foreground font-semibold">{violationIds.length}</span> violation
            {violationIds.length !== 1 ? 's' : ''}
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
              className="border-border bg-background focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Select a reason...</option>
              {reasonCodes?.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
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
              className="border-border bg-background focus:ring-primary/50 w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <div className="text-muted-foreground text-right text-xs">{notes.length}/500</div>
          </div>

          {/* Exclude Sample */}
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={excludeSample}
              onChange={(e) => setExcludeSample(e.target.checked)}
              className="border-border mt-0.5 rounded"
            />
            <span className="text-muted-foreground text-sm">
              Exclude affected samples from control limit calculations
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="border-border flex items-center justify-end gap-3 border-t px-5 py-4">
          <button
            onClick={onClose}
            className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {batchMutation.isPending ? 'Acknowledging...' : `Acknowledge ${violationIds.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}
