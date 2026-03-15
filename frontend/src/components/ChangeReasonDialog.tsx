import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChangeReasonDialogProps {
  open: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
  title?: string
  description?: string
  reasonRequired?: boolean
  isLoading?: boolean
}

export function ChangeReasonDialog({
  open,
  onConfirm,
  onCancel,
  title = 'Change Reason',
  description,
  reasonRequired = true,
  isLoading = false,
}: ChangeReasonDialogProps) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) {
      setReason('')
    }
  }, [open])

  const canSubmit = (!reasonRequired || reason.trim().length > 0) && !isLoading

  const handleSubmit = () => {
    if (!canSubmit) return
    onConfirm(reason.trim())
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      <div className="bg-card border-border relative z-10 w-full max-w-md rounded-2xl border p-6 shadow-xl">
        <h2 className="text-foreground mb-1 text-lg font-semibold">{title}</h2>

        {description && (
          <p className="text-muted-foreground mb-4 text-sm">{description}</p>
        )}

        <div className="mb-4">
          <label className="text-foreground mb-1 block text-sm font-medium">
            Reason{reasonRequired ? ' (required)' : ''}
          </label>
          <textarea
            value={reason}
            onChange={(e) => {
              if (e.target.value.length <= 500) {
                setReason(e.target.value)
              }
            }}
            rows={3}
            placeholder="Describe the reason for this change..."
            className="bg-input border-border focus:ring-ring w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
          <div className="text-muted-foreground mt-1 text-right text-xs">
            {reason.length}/500
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
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
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
