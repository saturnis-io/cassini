import { AlertTriangle } from 'lucide-react'
import { useLicense } from '@/hooks/useLicense'

export function LicenseExpiryBanner() {
  const { isCommercial, isExpired, licensedTier, daysUntilExpiry } = useLicense()

  // Show expired banner when license was commercial but has expired
  if (isExpired && licensedTier) {
    return (
      <div
        data-ui="license-banner"
        className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 border-b px-4 py-2 text-sm"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Your {licensedTier} license has expired. Commercial features are read-only.
        </span>
        <a
          href="https://saturnis.io/cassini/pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="text-destructive hover:text-destructive/80 ml-auto underline"
        >
          Renew
        </a>
      </div>
    )
  }

  // Show expiring-soon banner for active commercial licenses
  if (!isCommercial || daysUntilExpiry === null || daysUntilExpiry > 30) return null

  return (
    <div
      data-ui="license-banner"
      className="border-warning/30 bg-warning/10 text-warning flex items-center gap-2 border-b px-4 py-2 text-sm"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        Your license expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? '' : 's'}.
      </span>
      <a
        href="https://saturnis.io/cassini/pricing"
        target="_blank"
        rel="noopener noreferrer"
        className="text-warning hover:text-warning/80 ml-auto underline"
      >
        Renew
      </a>
    </div>
  )
}
