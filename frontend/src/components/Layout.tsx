import { Outlet, NavLink } from 'react-router-dom'
import { Activity, Settings, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useViolationStats } from '@/api/hooks'

export function Layout() {
  const wsConnected = useDashboardStore((state) => state.wsConnected)
  const { data: stats } = useViolationStats()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              OpenSPC
            </h1>
            <nav className="flex items-center gap-1">
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  cn(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )
                }
              >
                Dashboard
              </NavLink>
              <NavLink
                to="/configuration"
                className={({ isActive }) =>
                  cn(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )
                }
              >
                <Settings className="h-4 w-4 inline mr-1" />
                Configuration
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Plant: <span className="font-medium text-foreground">Demo Plant</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Footer / Status bar */}
      <footer className="border-t bg-card py-2">
        <div className="container mx-auto px-4 flex items-center justify-between text-sm">
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
            <span>
              Active Characteristics:{' '}
              <span className="font-medium text-foreground">-</span>
            </span>
            <span>
              Pending Alerts:{' '}
              <span
                className={cn(
                  'font-medium',
                  stats?.unacknowledged ? 'text-destructive' : 'text-foreground'
                )}
              >
                {stats?.unacknowledged ?? 0}
              </span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
