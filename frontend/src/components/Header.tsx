import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sun, Moon, Monitor, User, LogOut, ChevronDown, Menu, Sigma, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/providers/ThemeProvider'
import { useAuth } from '@/providers/AuthProvider'
import { ROLE_LABELS } from '@/lib/roles'
import { useUIStore } from '@/stores/uiStore'
import { useShowYourWorkStore } from '@/stores/showYourWorkStore'
import { usePendingApprovals } from '@/api/hooks'
import { usePlant } from '@/providers/PlantProvider'
import { PendingApprovalsDashboard } from '@/components/signatures/PendingApprovalsDashboard'
import { CassiniLogo } from '@/components/login/CassiniLogo'
import { deriveLogoColors } from '@/lib/brand-engine'
import { usePendingApprovals } from '@/api/hooks'
import { usePlant } from '@/providers/PlantProvider'
import { PendingApprovalsDashboard } from '@/components/signatures/PendingApprovalsDashboard'

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
  const { t } = useTranslation('auth')
  const { t: tNav } = useTranslation('navigation')
  const { theme, setTheme, brandConfig, fullBrandConfig } = useTheme()
  const { user, role, logout } = useAuth()
  const { appName, logoUrl } = brandConfig

  const derivedLogoColors = useMemo(() => deriveLogoColors(fullBrandConfig), [fullBrandConfig])
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [pendingMenuOpen, setPendingMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const pendingMenuRef = useRef<HTMLDivElement>(null)
  const toggleMobileSidebar = useUIStore((s) => s.toggleMobileSidebar)
  const showYourWorkEnabled = useShowYourWorkStore((s) => s.enabled)
  const toggleShowYourWork = useShowYourWorkStore((s) => s.toggle)
  const { selectedPlant } = usePlant()
  const { data: pendingData } = usePendingApprovals(selectedPlant?.id)
  const pendingCount = pendingData?.items?.length ?? 0

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
    if (theme === 'system') return t('theme.system')
    if (theme === 'dark') return t('theme.dark')
    return t('theme.light')
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!userMenuOpen && !pendingMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (
        userMenuOpen &&
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false)
      }
      if (
        pendingMenuOpen &&
        pendingMenuRef.current &&
        !pendingMenuRef.current.contains(e.target as Node)
      ) {
        setPendingMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen, pendingMenuOpen])

  const handleLogout = useCallback(() => {
    setUserMenuOpen(false)
    logout()
  }, [logout])

  return (
    <header
      className={cn('bg-card relative z-10 flex h-12 items-center justify-between border-b px-4', className)}
    >
      {/* Left: Hamburger (mobile) + Logo and app name */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={toggleMobileSidebar}
          className="text-muted-foreground hover:text-foreground hover:bg-accent mr-1 flex h-9 w-9 items-center justify-center rounded-md transition-colors md:hidden"
          aria-label={tNav('toggleNavigationMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${appName} logo`}
            className="h-9 w-9 object-contain"
          />
        ) : (
          <CassiniLogo variant="icon" size={36} brandColors={derivedLogoColors} />
        )}
        <span
          className="hidden text-lg font-bold sm:inline"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {appName}
        </span>
        <span className="text-muted-foreground hidden text-xs font-normal tracking-wide lg:inline">
          Enterprise Statistical Process Control
        </span>
      </div>

      {/* Right: Plant selector, theme toggle, user menu */}
      <div className="flex items-center gap-3">
        {/* Plant selector slot */}
        {plantSelector}

        {/* Divider */}
        <div className="bg-border h-6 w-px" />

        {/* Pending approvals bell */}
        {user && (
          <div className="relative" ref={pendingMenuRef}>
            <button
              onClick={() => setPendingMenuOpen((o) => !o)}
              className="text-muted-foreground hover:text-foreground hover:bg-accent relative flex items-center justify-center rounded-md p-1.5 transition-colors"
              title={
                pendingCount > 0
                  ? `${pendingCount} pending approval${pendingCount !== 1 ? 's' : ''}`
                  : 'No pending approvals'
              }
            >
              <Bell className="h-4 w-4" />
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </button>

            {pendingMenuOpen && (
              <div className="bg-popover absolute top-full right-0 z-50 mt-1 w-96 overflow-hidden rounded-md border shadow-md">
                <div className="max-h-[28rem] overflow-y-auto p-2">
                  <PendingApprovalsDashboard compact />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          className="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors"
          title={t('theme.label', { theme: getThemeLabel() })}
        >
          {getThemeIcon()}
          <span className="hidden sm:inline">{getThemeLabel()}</span>
        </button>

        {/* Show Your Work toggle */}
        <button
          onClick={toggleShowYourWork}
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
            showYourWorkEnabled
              ? 'bg-primary/10 text-primary border-primary/30 border'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
          title={showYourWorkEnabled ? 'Show Your Work: ON' : 'Show Your Work: OFF'}
        >
          <Sigma className="h-4 w-4" />
          <span className="hidden sm:inline">
            {showYourWorkEnabled ? 'Showing Work' : 'Show Work'}
          </span>
        </button>

        {/* User menu */}
        {user && (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((o) => !o)}
              className="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors"
              title={t('userMenu')}
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
                    <span>{t('signOut')}</span>
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
