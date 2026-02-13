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
export function Header({ className, plantSelector }: HeaderProps) {
  const { theme, setTheme, brandConfig } = useTheme()
  const { user, role, logout } = useAuth()
  const { appName, logoUrl } = brandConfig
  const defaultLogo = '/header-logo.svg'
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
      className={cn('bg-card flex h-12 items-center justify-between border-b px-4', className)}
    >
      {/* Left: Logo and app name */}
      <div className="flex items-center gap-2.5">
        <img
          src={logoUrl || defaultLogo}
          alt={`${appName} logo`}
          className="h-9 w-9 object-contain"
        />
        <span className="text-lg font-bold" style={{ fontFamily: "'Sansation', sans-serif" }}>
          {appName}
        </span>
      </div>

      {/* Right: Plant selector, theme toggle, user menu */}
      <div className="flex items-center gap-3">
        {/* Plant selector slot */}
        {plantSelector}

        {/* Divider */}
        <div className="bg-border h-6 w-px" />

        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          className="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors"
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
              className="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors"
              title="User menu"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">{user.username}</span>
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', userMenuOpen && 'rotate-180')}
              />
            </button>

            {userMenuOpen && (
              <div className="bg-popover absolute top-full right-0 z-50 mt-1 w-52 rounded-md border shadow-md">
                <div className="border-b px-3 py-2">
                  <p className="text-foreground text-sm font-medium">{user.username}</p>
                  <p className="text-muted-foreground text-xs">{ROLE_LABELS[role]}</p>
                </div>
                <div className="p-1">
                  <button
                    onClick={handleLogout}
                    className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors"
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
