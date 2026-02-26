import { ShieldCheck, ShieldX, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSignatures } from '@/api/hooks'
import { useDateFormat } from '@/hooks/useDateFormat'
import type { ElectronicSignature } from '@/types/signature'

interface SignatureManifestProps {
  resourceType: string
  resourceId: number
  className?: string
}

export function SignatureManifest({
  resourceType,
  resourceId,
  className,
}: SignatureManifestProps) {
  const { data: signatures, isLoading } = useSignatures(resourceType, resourceId)
  const { formatDateTime } = useDateFormat()

  if (isLoading) {
    return null
  }

  if (!signatures || signatures.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <PenLine className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          Electronic Signatures
        </span>
      </div>
      {signatures.map((sig: ElectronicSignature) => (
        <div
          key={sig.id}
          className={cn(
            'flex items-center gap-2 text-xs',
            sig.is_valid ? 'text-foreground' : 'text-destructive line-through',
          )}
        >
          {sig.is_valid ? (
            <ShieldCheck className="h-3 w-3 flex-shrink-0 text-green-600 dark:text-green-400" />
          ) : (
            <ShieldX className="text-destructive h-3 w-3 flex-shrink-0" />
          )}
          <span className="font-medium">{sig.full_name || sig.username}</span>
          <span className="text-muted-foreground">-</span>
          <span>{sig.meaning_display}</span>
          <span className="text-muted-foreground">-</span>
          <span className="text-muted-foreground">{formatDateTime(sig.timestamp)}</span>
        </div>
      ))}
    </div>
  )
}
