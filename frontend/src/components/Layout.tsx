import { useEffect } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Wifi, WifiOff, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useViolationStats } from '@/api/hooks'
import { useUIStore } from '@/stores/uiStore'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { PlantSelector } from '@/components/PlantSelector'
import { MobileNav } from '@/components/MobileNav'
import { LicenseExpiryBanner } from '@/components/LicenseExpiryBanner'

/**
 * Main application layout with sidebar navigation
 *
 * Structure:
 * ┌─────────────────────────────────────────────┐
 * │ Header (full width)                         │
 * ├──────────┬──────────────────────────────────┤
 * │          │                                  │
 * │ Sidebar  │  Main Content (Outlet)           │
 * │          │                                  │
 * │          ├──────────────────────────────────┤
 * │          │  Footer/Status Bar               │
 * └──────────┴──────────────────────────────────┘
 *
 * Mobile: Sidebar becomes an overlay (hamburger menu).
 */
export function Layout() {
  const { t } = useTranslation('common')
  const { t: tNav } = useTranslation('navigation')
  const wsConnected = useDashboardStore((state) => state.wsConnected)
  const { data: stats } = useViolationStats({
    refetchInterval: wsConnected ? false : undefined,
  })
  const { isOffline, setIsOffline, offlineQueueCount, setOfflineQueueCount } = useUIStore()

  // Set up offline queue auto-flush
  useEffect(() => {
    let cleanup: (() => void) | undefined
    import('@/lib/offline-queue').then(({ setupAutoFlush }) => {
      cleanup = setupAutoFlush(setOfflineQueueCount)
    })
    return () => cleanup?.()
  }, [setOfflineQueueCount])

  // Listen for online/offline events
  useEffect(() => {
    const goOnline = () => setIsOffline(false)
    const goOffline = () => setIsOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [setIsOffline])

  return (
    <div className="bg-background flex h-screen flex-col">
      {/* Offline banner */}
      {isOffline && (
        <div className="bg-warning text-warning-foreground flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium">
          <WifiOff className="h-4 w-4" />
          {t('offlineBanner')}
        </div>
      )}

      {/* Header - full width */}
      <Header plantSelector={<PlantSelector />} />

      {/* Main area with sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Content area */}
        <main className="flex flex-1 flex-col overflow-auto">
          <LicenseExpiryBanner />
          <div className="flex min-h-0 flex-1 flex-col px-2 py-2 pb-16 md:px-4 md:py-3 md:pb-3">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Footer / Status bar - full width */}
      <footer className="bg-card shrink-0 border-t px-2 py-1.5 md:px-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {wsConnected ? (
              <>
                <Wifi className="text-success h-4 w-4" />
                <span className="text-muted-foreground hidden sm:inline">{tNav('connected')}</span>
              </>
            ) : (
              <>
                <WifiOff className="text-destructive h-4 w-4" />
                <span className="text-destructive hidden sm:inline">{tNav('disconnected')}</span>
              </>
            )}
            {offlineQueueCount > 0 && (
              <span className="text-warning text-xs font-medium">({offlineQueueCount} pending)</span>
            )}
          </div>
          <div className="text-muted-foreground flex items-center gap-3 md:gap-6">
            <Link
              to="/violations?status=required"
              className={cn(
                'flex items-center gap-1 transition-colors hover:underline',
                stats?.unacknowledged
                  ? 'text-destructive hover:text-destructive/80'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">{tNav('pending')}</span>{' '}
              <span className="font-medium">{stats?.unacknowledged ?? 0}</span>
            </Link>
            {(stats?.informational ?? 0) > 0 && (
              <Link
                to="/violations?status=informational"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors hover:underline"
              >
                <Info className="h-4 w-4" />
                <span className="hidden sm:inline">{tNav('info')}</span>{' '}
                <span className="font-medium">{stats?.informational ?? 0}</span>
              </Link>
            )}
          </div>
        </div>
      </footer>

      {/* Mobile bottom navigation */}
      <MobileNav />
    </div>
  )
}
