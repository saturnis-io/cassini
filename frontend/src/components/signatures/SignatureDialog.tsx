import { useState, useEffect } from 'react'
import { PenLine, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMeanings, useSign } from '@/api/hooks'
import type { SignatureMeaning } from '@/types/signature'

interface SignatureDialogProps {
  open: boolean
  onClose: () => void
  onSigned: (result: { signature_id: number; signer_name: string }) => void
  resourceType: string
  resourceId: number
  resourceSummary: string
  workflowInstanceId?: number
  allowedMeanings?: string[]
  requireComment?: boolean
}

export function SignatureDialog({
  open,
  onClose,
  onSigned,
  resourceType,
  resourceId,
  resourceSummary,
  workflowInstanceId,
  allowedMeanings,
  requireComment,
}: SignatureDialogProps) {
  const [password, setPassword] = useState('')
  const [meaningCode, setMeaningCode] = useState('')
  const [comment, setComment] = useState('')

  const { data: meanings } = useMeanings()
  const signMutation = useSign()

  const activeMeanings = (meanings ?? []).filter((m: SignatureMeaning) => {
    if (!m.is_active) return false
    if (allowedMeanings && allowedMeanings.length > 0) {
      return allowedMeanings.includes(m.code)
    }
    return true
  })

  const selectedMeaning = activeMeanings.find((m: SignatureMeaning) => m.code === meaningCode)
  const commentRequired = requireComment || selectedMeaning?.requires_comment

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setPassword('')
      setMeaningCode(activeMeanings.length === 1 ? activeMeanings[0].code : '')
      setComment('')
      signMutation.reset()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit =
    password.length > 0 &&
    meaningCode.length > 0 &&
    (!commentRequired || comment.trim().length > 0) &&
    !signMutation.isPending

  const handleSubmit = () => {
    if (!canSubmit) return
    signMutation.mutate(
      {
        resource_type: resourceType,
        resource_id: resourceId,
        password,
        meaning_code: meaningCode,
        comment: comment.trim() || null,
        workflow_instance_id: workflowInstanceId ?? null,
      },
      {
        onSuccess: (result) => {
          onSigned({ signature_id: result.signature_id, signer_name: result.signer_name })
          onClose()
        },
      },
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="bg-card border-border relative z-10 w-full max-w-md rounded-2xl border p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-primary/10 rounded-lg p-2">
            <PenLine className="text-primary h-5 w-5" />
          </div>
          <h2 className="text-foreground text-lg font-semibold">Electronic Signature</h2>
        </div>

        {/* Resource summary */}
        <div className="bg-muted mb-4 rounded-lg p-3">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            You are signing
          </p>
          <p className="text-foreground mt-1 text-sm">{resourceSummary}</p>
        </div>

        {/* Error display */}
        {signMutation.isError && (
          <div className="bg-destructive/10 text-destructive mb-4 flex items-start gap-2 rounded-lg p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{signMutation.error.message}</span>
          </div>
        )}

        {/* Meaning selector */}
        <div className="mb-4">
          <label className="text-foreground mb-1 block text-sm font-medium">
            Signature Meaning
          </label>
          <select
            value={meaningCode}
            onChange={(e) => setMeaningCode(e.target.value)}
            className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="">Select meaning...</option>
            {activeMeanings.map((m: SignatureMeaning) => (
              <option key={m.code} value={m.code}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>

        {/* Password input */}
        <div className="mb-4">
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
          <p className="text-muted-foreground mt-1 text-xs">
            Per 21 CFR Part 11, password re-entry is required for each signature.
          </p>
        </div>

        {/* Comment textarea */}
        <div className="mb-6">
          <label className="text-foreground mb-1 block text-sm font-medium">
            Comment{commentRequired ? ' (required)' : ' (optional)'}
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={commentRequired ? 'A comment is required for this meaning' : 'Optional comment'}
            className="bg-background border-input focus:ring-ring w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={signMutation.isPending}
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
            {signMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing...
              </>
            ) : (
              <>
                <PenLine className="h-4 w-4" />
                Confirm Signature
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
