import { Activity, Sun, Moon, Monitor, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/providers/ThemeProvider'

interface HeaderProps {
  className?: string
  /** Slot for PlantSelector component */
  plantSelector?: React.ReactNode
}

/**
 * Minimal header component for use with sidebar layout
 *
 * Features:
 * - Logo and app name on the left (from brand config)
 * - Plant selector slot in the middle-right
 * - Theme toggle
 * - User menu placeholder
 */
export function Header({
  className,
  plantSelector,
}: HeaderProps) {
  const { theme, setTheme, brandConfig } = useTheme()
  const { appName, logoUrl } = brandConfig

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
    <header
      className={cn(
        'h-14 border-b bg-card flex items-center justify-between px-4',
        className
      )}
    >
      {/* Left: Logo and app name */}
      <div className="flex items-center gap-2">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${appName} logo`}
            className="h-6 w-6 object-contain"
          />
        ) : (
          <Activity className="h-5 w-5 text-primary" />
        )}
        <span className="text-lg font-semibold">{appName}</span>
      </div>

      {/* Right: Plant selector, theme toggle, user menu */}
      <div className="flex items-center gap-3">
        {/* Plant selector slot */}
        {plantSelector}

        {/* Divider */}
        <div className="h-6 w-px bg-border" />

        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={`Theme: ${getThemeLabel()}`}
        >
          {getThemeIcon()}
          <span className="hidden sm:inline">{getThemeLabel()}</span>
        </button>

        {/* User menu placeholder */}
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="User menu"
        >
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">Dev User</span>
        </button>
      </div>
    </header>
  )
}
