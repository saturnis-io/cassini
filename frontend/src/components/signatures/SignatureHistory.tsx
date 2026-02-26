import { ShieldCheck, ShieldX, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSignatures } from '@/api/hooks'
import { useDateFormat } from '@/hooks/useDateFormat'
import { SignatureVerifyBadge } from './SignatureVerifyBadge'
import type { ElectronicSignature } from '@/types/signature'

interface SignatureHistoryProps {
  resourceType: string
  resourceId: number
}

export function SignatureHistory({ resourceType, resourceId }: SignatureHistoryProps) {
  const { data: signatures, isLoading } = useSignatures(resourceType, resourceId)
  const { formatDateTime } = useDateFormat()

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-4 text-center text-sm">
        Loading signatures...
      </div>
    )
  }

  if (!signatures || signatures.length === 0) {
    return (
      <div className="text-muted-foreground py-4 text-center text-sm">
        No signatures recorded for this resource.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="text-foreground text-sm font-semibold">
        Signature History ({signatures.length})
      </h3>
      <div className="space-y-2">
        {signatures.map((sig: ElectronicSignature) => (
          <div
            key={sig.id}
            className={cn(
              'border-border rounded-lg border p-3',
              sig.is_valid ? 'bg-card' : 'bg-destructive/5',
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {sig.is_valid ? (
                  <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <ShieldX className="text-destructive h-4 w-4" />
                )}
                <div>
                  <span className="text-foreground text-sm font-medium">
                    {sig.full_name || sig.username}
                  </span>
                  <span className="text-muted-foreground mx-1.5 text-xs">-</span>
                  <span className="text-sm">{sig.meaning_display}</span>
                </div>
              </div>
              <span className="text-muted-foreground text-xs">{formatDateTime(sig.timestamp)}</span>
            </div>

            {sig.comment && (
              <div className="mt-2 flex items-start gap-1.5 pl-6">
                <MessageSquare className="text-muted-foreground mt-0.5 h-3 w-3 flex-shrink-0" />
                <p className="text-muted-foreground text-xs">{sig.comment}</p>
              </div>
            )}

            {!sig.is_valid && sig.invalidated_reason && (
              <p className="text-destructive mt-2 pl-6 text-xs">
                Invalidated: {sig.invalidated_reason}
                {sig.invalidated_at && ` (${formatDateTime(sig.invalidated_at)})`}
              </p>
            )}

            <div className="mt-2 pl-6">
              <SignatureVerifyBadge signature={sig} compact />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
