import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LicenseStatus } from '@/api/license.api'

interface IncomingLicense {
  tier: string
  max_plants: number
  expires_at: string | null
  license_name: string | null
}

interface LicenseComparisonDialogProps {
  isOpen: boolean
  current: LicenseStatus
  incoming: IncomingLicense
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function LicenseComparisonDialog({
  isOpen,
  current,
  incoming,
  onConfirm,
  onCancel,
  isPending,
}: LicenseComparisonDialogProps) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const downgrade = incoming.max_plants < current.max_plants

  return (
    <div
      data-ui="license-comparison-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-card border-border mx-4 w-full max-w-md rounded-2xl border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold">Replace License?</h3>

        <p className="text-muted-foreground mb-4 text-sm">
          You already have an active license. Uploading this key will replace it.
        </p>

        {/* Comparison table */}
        <div className="border-border mb-4 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="px-3 py-2 text-left font-medium" />
                <th className="px-3 py-2 text-left font-medium">Current</th>
                <th className="px-3 py-2 text-left font-medium">New</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <tr>
                <td className="text-muted-foreground px-3 py-2">Tier</td>
                <td className="px-3 py-2">{current.tier}</td>
                <td className="px-3 py-2">{incoming.tier}</td>
              </tr>
              <tr>
                <td className="text-muted-foreground px-3 py-2">Sites</td>
                <td className="px-3 py-2">{current.max_plants}</td>
                <td
                  className={cn(
                    'px-3 py-2',
                    downgrade && 'text-destructive font-medium',
                  )}
                >
                  {incoming.max_plants}
                </td>
              </tr>
              <tr>
                <td className="text-muted-foreground px-3 py-2">Expires</td>
                <td className="px-3 py-2">{formatDate(current.expires_at)}</td>
                <td className="px-3 py-2">{formatDate(incoming.expires_at)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {downgrade && (
          <div className="bg-warning/10 border-warning/20 text-warning mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              The new license allows fewer sites ({incoming.max_plants} vs{' '}
              {current.max_plants}). You may need to deactivate sites after replacing.
            </span>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-5 py-2.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className={cn(
              'rounded-xl px-5 py-2.5 text-sm font-medium',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-50',
            )}
          >
            {isPending ? 'Replacing...' : 'Replace License'}
          </button>
        </div>
      </div>
    </div>
  )
}
