import { Wifi, WifiOff } from 'lucide-react'
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
    <div data-ui="kiosk-layout" className="bg-background text-foreground flex min-h-screen flex-col overflow-hidden">
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
        data-ui="kiosk-content"
        className={cn(
          'kiosk-content flex-1 overflow-hidden text-lg',
          showStatusBar ? '' : 'h-screen',
        )}
      >
        {children}
      </main>

      {/* Status bar */}
      {showStatusBar && (
        <footer data-ui="kiosk-statusbar" className="border-border bg-card flex h-10 items-center justify-between border-t px-4 text-sm">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            {wsConnected ? (
              <>
                <Wifi className="text-success h-4 w-4" />
                <span className="text-muted-foreground">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="text-destructive h-4 w-4" />
                <span className="text-destructive">Disconnected</span>
              </>
            )}
          </div>

          {/* Branding */}
          <div className="flex items-center gap-2">
            <img
              src={brandConfig.logoUrl || '/header-logo.svg'}
              alt={`${brandConfig.appName} logo`}
              className="h-5 w-5 object-contain"
            />
            <span className="text-muted-foreground font-medium">{brandConfig.appName} Kiosk</span>
          </div>
        </footer>
      )}
    </div>
  )
}
