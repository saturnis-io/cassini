import { useState } from 'react'
import { Shield, ShieldCheck, ShieldX, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVerifySignature } from '@/api/hooks'
import type { ElectronicSignature } from '@/types/signature'
import type { VerifyResponse } from '@/types/signature'

interface SignatureVerifyBadgeProps {
  signature: ElectronicSignature
  compact?: boolean
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SignatureVerifyBadge({ signature, compact = false }: SignatureVerifyBadgeProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null)
  const verifyMutation = useVerifySignature()

  const isValid = signature.is_valid
  const displayName = signature.full_name || signature.username

  const handleVerify = () => {
    verifyMutation.mutate(signature.id, {
      onSuccess: (result) => setVerifyResult(result),
    })
  }

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
          isValid
            ? 'bg-green-500/10 text-green-700 dark:text-green-400'
            : 'bg-destructive/10 text-destructive',
        )}
      >
        {isValid ? <ShieldCheck className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />}
        {displayName}
      </span>
    )
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setPopoverOpen(!popoverOpen)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
          isValid
            ? 'border-green-500/30 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400'
            : 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
        )}
      >
        {isValid ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}
        <span>{displayName}</span>
        <span className="text-muted-foreground">-</span>
        <span>{signature.meaning_display}</span>
        <span className="text-muted-foreground">-</span>
        <span>{formatDate(signature.timestamp)}</span>
      </button>

      {/* Popover */}
      {popoverOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)} />
          <div className="bg-card border-border absolute top-full left-0 z-50 mt-2 w-80 rounded-xl border p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-foreground text-sm font-semibold">Signature Details</h4>
              <button
                type="button"
                onClick={() => setPopoverOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Signer</span>
                <span className="text-foreground font-medium">{displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Username</span>
                <span className="text-foreground">{signature.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Meaning</span>
                <span className="text-foreground">{signature.meaning_display}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date/Time</span>
                <span className="text-foreground">{formatDate(signature.timestamp)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span
                  className={cn(
                    'font-medium',
                    isValid ? 'text-green-600 dark:text-green-400' : 'text-destructive',
                  )}
                >
                  {isValid ? 'Valid' : 'Invalidated'}
                </span>
              </div>
              {signature.comment && (
                <div>
                  <span className="text-muted-foreground">Comment</span>
                  <p className="text-foreground mt-0.5">{signature.comment}</p>
                </div>
              )}
              {!isValid && signature.invalidated_reason && (
                <div>
                  <span className="text-muted-foreground">Invalidation Reason</span>
                  <p className="text-destructive mt-0.5">{signature.invalidated_reason}</p>
                </div>
              )}
            </div>

            {/* Verify button */}
            <div className="border-border mt-3 border-t pt-3">
              {verifyResult ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    {verifyResult.hash_match ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <ShieldX className="text-destructive h-3.5 w-3.5" />
                    )}
                    <span>
                      Record hash: {verifyResult.hash_match ? 'matches' : 'MISMATCH'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {verifyResult.signature_chain_valid ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <ShieldX className="text-destructive h-3.5 w-3.5" />
                    )}
                    <span>
                      Signature chain:{' '}
                      {verifyResult.signature_chain_valid ? 'valid' : 'INVALID'}
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifyMutation.isPending}
                  className="text-primary hover:text-primary/80 flex items-center gap-1.5 text-xs font-medium"
                >
                  {verifyMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Shield className="h-3.5 w-3.5" />
                  )}
                  Verify Integrity
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
