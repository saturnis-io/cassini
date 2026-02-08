import { useCallback, useEffect, useRef, useState } from 'react'
import { Sun, Moon, Monitor, User, LogOut, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/providers/ThemeProvider'
import { useAuth } from '@/providers/AuthProvider'
import { ROLE_LABELS } from '@/lib/roles'

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
 * - User menu with logout
 */
export function Header({
  className,
  plantSelector,
}: HeaderProps) {
  const { theme, setTheme, resolvedTheme, brandConfig } = useTheme()
  const { user, role, logout } = useAuth()
  const { appName, logoUrl } = brandConfig
  const defaultLogo = resolvedTheme === 'dark' ? '/openspc-isometric-dark.png' : '/openspc-isometric-light.png'
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

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

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!userMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen])

  const handleLogout = useCallback(() => {
    setUserMenuOpen(false)
    logout()
  }, [logout])

  return (
    <header
      className={cn(
        'h-14 border-b bg-card flex items-center justify-between px-4',
        className
      )}
    >
      {/* Left: Logo and app name */}
      <div className="flex items-center gap-2.5">
        <img
          src={logoUrl || defaultLogo}
          alt={`${appName} logo`}
          className="h-9 w-9 object-contain"
        />
        <span className="text-xl font-bold" style={{ fontFamily: "'Sansation', sans-serif" }}>{appName}</span>
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

        {/* User menu */}
        {user && (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="User menu"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">{user.username}</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', userMenuOpen && 'rotate-180')} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-md border bg-popover shadow-md z-50">
                <div className="px-3 py-2 border-b">
                  <p className="text-sm font-medium text-foreground">{user.username}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
                </div>
                <div className="p-1">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-sm text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
