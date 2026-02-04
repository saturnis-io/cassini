import { Outlet, NavLink, Link } from 'react-router-dom'
import { Activity, Settings, Wifi, WifiOff, Sun, Moon, Monitor, Sliders, ClipboardList, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useViolationStats } from '@/api/hooks'
import { useTheme } from '@/providers/ThemeProvider'

export function Layout() {
  const wsConnected = useDashboardStore((state) => state.wsConnected)
  const { data: stats } = useViolationStats()
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  const getThemeIcon = () => {
    if (theme === 'system') return <Monitor className="h-4 w-4" />
    if (theme === 'dark') return <Moon className="h-4 w-4" />
    return <Sun className="h-4 w-4" />
  }

  const getThemeLabel = () => {
    if (theme === 'system') return 'System'
    if (theme === 'dark') return 'Dark'
    return 'Light'
  }

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
              <NavLink
                to="/data-entry"
                className={({ isActive }) =>
                  cn(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )
                }
              >
                <ClipboardList className="h-4 w-4 inline mr-1" />
                Data Entry
              </NavLink>
              <NavLink
                to="/violations"
                className={({ isActive }) =>
                  cn(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )
                }
              >
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Violations
                {stats?.unacknowledged ? (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-destructive text-destructive-foreground">
                    {stats.unacknowledged}
                  </span>
                ) : null}
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  cn(
                    'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )
                }
              >
                <Sliders className="h-4 w-4 inline mr-1" />
                Settings
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={cycleTheme}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={`Theme: ${getThemeLabel()}`}
            >
              {getThemeIcon()}
              <span className="hidden sm:inline">{getThemeLabel()}</span>
            </button>
            <span className="text-sm text-muted-foreground">
              Plant: <span className="font-medium text-foreground">Demo Plant</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main content - full width for dashboard charts */}
      <main className="flex-1 px-4 py-6">
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
            <Link
              to="/violations"
              className={cn(
                'flex items-center gap-1 hover:underline transition-colors',
                stats?.unacknowledged ? 'text-destructive hover:text-destructive/80' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Pending Alerts:{' '}
              <span className="font-medium">
                {stats?.unacknowledged ?? 0}
              </span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
