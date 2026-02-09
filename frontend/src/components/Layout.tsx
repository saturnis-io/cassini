import { Outlet, Link } from 'react-router-dom'
import { Wifi, WifiOff, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useViolationStats } from '@/api/hooks'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { PlantSelector } from '@/components/PlantSelector'

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
 */
export function Layout() {
  const wsConnected = useDashboardStore((state) => state.wsConnected)
  const { data: stats } = useViolationStats()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header - full width */}
      <Header plantSelector={<PlantSelector />} />

      {/* Main area with sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Content area */}
        <main className="flex-1 overflow-auto px-4 py-3">
          <Outlet />
        </main>
      </div>

      {/* Footer / Status bar - full width */}
      <footer className="border-t bg-card py-1.5 px-4 shrink-0">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {wsConnected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-destructive" />
                <span className="text-destructive">Disconnected</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-6 text-muted-foreground">
            <Link
              to="/violations?status=required"
              className={cn(
                'flex items-center gap-1 hover:underline transition-colors',
                stats?.unacknowledged
                  ? 'text-destructive hover:text-destructive/80'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <AlertTriangle className="h-4 w-4" />
              Pending:{' '}
              <span className="font-medium">{stats?.unacknowledged ?? 0}</span>
            </Link>
            {(stats?.informational ?? 0) > 0 && (
              <Link
                to="/violations?status=informational"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                <Info className="h-4 w-4" />
                Info:{' '}
                <span className="font-medium">{stats?.informational ?? 0}</span>
              </Link>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
