import { Wifi, WifiOff, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useTheme } from '@/providers/ThemeProvider'

interface KioskLayoutProps {
  children: React.ReactNode
  /** Show status bar at bottom (default: true) */
  showStatusBar?: boolean
}

/**
 * Minimal chrome-free layout for display modes (kiosk, wall dashboard)
 *
 * Features:
 * - Full viewport dimensions
 * - No sidebar or header
 * - Forces dark mode for better contrast
 * - Larger base font size for distance viewing
 * - Optional minimal status bar with connection indicator
 *
 * @example
 * <KioskLayout>
 *   <KioskView />
 * </KioskLayout>
 */
export function KioskLayout({ children, showStatusBar = true }: KioskLayoutProps) {
  const wsConnected = useDashboardStore((state) => state.wsConnected)
  const { brandConfig } = useTheme()

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col overflow-hidden">
      {/* Force dark mode styles */}
      <style>{`
        .kiosk-content {
          --background: 0 0% 4%;
          --foreground: 0 0% 98%;
          --card: 0 0% 7%;
          --card-foreground: 0 0% 98%;
          --primary: 217.2 91.2% 59.8%;
          --primary-foreground: 0 0% 98%;
          --muted: 0 0% 15%;
          --muted-foreground: 0 0% 65%;
        }
      `}</style>

      {/* Main content area */}
      <main
        className={cn(
          'flex-1 overflow-hidden text-lg kiosk-content',
          showStatusBar ? '' : 'h-screen'
        )}
      >
        {children}
      </main>

      {/* Status bar */}
      {showStatusBar && (
        <footer className="h-10 border-t border-zinc-800 bg-zinc-900 px-4 flex items-center justify-between text-sm">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            {wsConnected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-zinc-400">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-500" />
                <span className="text-red-400">Disconnected</span>
              </>
            )}
          </div>

          {/* Branding */}
          <div className="flex items-center gap-2">
            {brandConfig.logoUrl ? (
              <img
                src={brandConfig.logoUrl}
                alt={`${brandConfig.appName} logo`}
                className="h-5 w-5 object-contain"
              />
            ) : (
              <Activity className="h-4 w-4 text-zinc-400" />
            )}
            <span className="text-zinc-500 font-medium">{brandConfig.appName} Kiosk</span>
          </div>
        </footer>
      )}
    </div>
  )
}
