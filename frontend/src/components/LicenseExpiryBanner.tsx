import { AlertTriangle } from 'lucide-react'
import { useLicense } from '@/hooks/useLicense'

export function LicenseExpiryBanner() {
  const { isCommercial, daysUntilExpiry, isExpired } = useLicense()

  if (!isCommercial) return null
  if (!isExpired && (daysUntilExpiry === null || daysUntilExpiry > 30)) return null

  const message = isExpired
    ? 'Your license has expired. Enterprise features are read-only.'
    : `Your license expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}.`

  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
      <a
        href="https://saturnis.io/cassini/pricing"
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto text-amber-700 underline hover:text-amber-900 dark:text-amber-300"
      >
        Renew
      </a>
    </div>
  )
}
