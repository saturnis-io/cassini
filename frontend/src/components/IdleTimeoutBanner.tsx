import { Clock } from 'lucide-react'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'

/**
 * Banner shown when the user's session is about to expire due to inactivity.
 * Enforces 21 CFR Part 11 session timeout requirements.
 *
 * Rendered inside AuthenticatedProviders so it covers all authenticated
 * views (main layout, kiosk, wall dashboard).
 */
export function IdleTimeoutBanner() {
  const { showWarning, remainingSeconds } = useIdleTimeout()

  if (!showWarning) return null

  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const display =
    minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`

  return (
    <div
      data-ui="idle-timeout-banner"
      role="alert"
      className="bg-warning text-warning-foreground fixed top-0 right-0 left-0 z-[70] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium shadow-md"
    >
      <Clock className="h-4 w-4 shrink-0" />
      <span>
        Your session will expire in <strong>{display}</strong> due to inactivity. Move your
        mouse or press a key to stay signed in.
      </span>
    </div>
  )
}
