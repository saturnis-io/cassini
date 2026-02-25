import { useEffect, useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  FileText,
  Settings,
  ListTree,
  Network,
  Microscope,
  ClipboardCheck,
  TrendingUp,
  FlaskConical,
  Users,
  Wrench,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useViolationStats, useDevToolsStatus } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useAuth } from '@/providers/AuthProvider'
import { canAccessView, type Role } from '@/lib/roles'
import { HierarchyTodoList } from './HierarchyTodoList'

interface NavItem {
  path: string
  labelKey: string
  icon: React.ReactNode
  badge?: number
  requiredRole?: Role
}

interface SidebarProps {
  className?: string
}

/**
 * Collapsible vertical sidebar navigation with embedded characteristics tree
 *
 * Two states:
 * - Expanded: Fixed 260px width with labels + optional characteristics panel
 * - Collapsed: 56px icons only
 *
 * The characteristics panel appears on pages that use it (dashboard, data-entry,
 * reports) and can be collapsed independently. The navigation section is always
 * visible — never collapses — to prevent layout bounce between pages.
 */
export function Sidebar({ className }: SidebarProps) {
  const { t } = useTranslation('navigation')
  const {
    sidebarState,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    characteristicsPanelOpen,
    setCharacteristicsPanelOpen,
  } = useUIStore()
  const wsConnected = useDashboardStore((state) => state.wsConnected)
  const { data: stats } = useViolationStats({
    refetchInterval: wsConnected ? false : undefined,
  })
  const { data: devToolsStatus } = useDevToolsStatus()
  const { role } = useAuth()
  const location = useLocation()

  const isCollapsed = sidebarState === 'collapsed'
  const isHidden = sidebarState === 'hidden'

  // Only show the Characteristics tree on pages that use it
  const showCharacteristics = ['/', '/dashboard', '/data-entry', '/reports'].includes(
    location.pathname,
  )

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [location.pathname, setMobileSidebarOpen])

  // Navigation items with role requirements
  const mainNavItems: NavItem[] = [
    {
      path: '/dashboard',
      labelKey: 'dashboard',
      icon: <LayoutDashboard className="h-5 w-5" />,
      requiredRole: 'operator',
    },
    {
      path: '/data-entry',
      labelKey: 'dataEntry',
      icon: <ClipboardList className="h-5 w-5" />,
      requiredRole: 'operator',
    },
    {
      path: '/violations',
      labelKey: 'violations',
      icon: <AlertTriangle className="h-5 w-5" />,
      badge: stats?.unacknowledged,
      requiredRole: 'operator',
    },
    {
      path: '/reports',
      labelKey: 'reports',
      icon: <FileText className="h-5 w-5" />,
      requiredRole: 'supervisor',
    },
  ]

  const secondaryNavItems: NavItem[] = [
    {
      path: '/connectivity',
      labelKey: 'connectivity',
      icon: <Network className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
    {
      path: '/configuration',
      labelKey: 'configuration',
      icon: <ListTree className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
    {
      path: '/msa',
      labelKey: 'msa',
      icon: <Microscope className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
    {
      path: '/fai',
      labelKey: 'fai',
      icon: <ClipboardCheck className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
    {
      path: '/analytics',
      labelKey: 'analytics',
      icon: <TrendingUp className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
    {
      path: '/doe',
      labelKey: 'doe',
      icon: <FlaskConical className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
    {
      path: '/settings',
      labelKey: 'settings',
      icon: <Settings className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
    {
      path: '/admin/users',
      labelKey: 'users',
      icon: <Users className="h-5 w-5" />,
      requiredRole: 'admin',
    },
  ]

  // Dev tools nav item — only when sandbox mode is active and user is admin
  const showDevTools = devToolsStatus?.sandbox && canAccessView(role, '/dev-tools')

  // Filter navigation items based on current role
  const visibleMainItems = mainNavItems.filter(
    (item) => !item.requiredRole || canAccessView(role, item.path),
  )
  const visibleSecondaryItems = secondaryNavItems.filter(
    (item) => !item.requiredRole || canAccessView(role, item.path),
  )

  const renderNavItem = (item: NavItem, forMobile = false) => {
    const label = t(item.labelKey)
    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={forMobile ? () => setMobileSidebarOpen(false) : undefined}
        className={({ isActive }) =>
          cn(
            'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
            'hover:transition-colors hover:duration-150',
            isActive
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            !forMobile && isCollapsed && 'justify-center px-2',
            forMobile && 'min-h-[44px]',
          )
        }
        title={!forMobile && isCollapsed ? label : undefined}
      >
        {item.icon}
        {(forMobile || !isCollapsed) && (
          <>
            <span className="flex-1">{label}</span>
            {item.badge ? (
              <span className="bg-destructive text-destructive-foreground min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-xs">
                {item.badge}
              </span>
            ) : null}
          </>
        )}
        {!forMobile && isCollapsed && item.badge ? (
          <span className="bg-destructive absolute -top-1 -right-1 h-2 w-2 rounded-full" />
        ) : null}
      </NavLink>
    )
  }

  const navContent = (forMobile = false) => (
    <>
      {visibleMainItems.map((item) => renderNavItem(item, forMobile))}

      {/* Divider - only show if there are secondary items */}
      {visibleSecondaryItems.length > 0 && <div className="my-2 border-t" />}

      {visibleSecondaryItems.map((item) => renderNavItem(item, forMobile))}

      {/* Dev Tools — sandbox mode only */}
      {showDevTools && (
        <>
          <div className="border-warning/30 my-2 border-t" />
          {renderNavItem(
            {
              path: '/dev-tools',
              labelKey: 'devTools',
              icon: <Wrench className="text-warning h-5 w-5" />,
            },
            forMobile,
          )}
        </>
      )}
    </>
  )

  return (
    <>
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="bg-foreground/20 absolute inset-0 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />

          {/* Sidebar panel */}
          <aside className="bg-card absolute inset-y-0 left-0 flex w-[280px] flex-col shadow-lg">
            {/* Close button header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">{t('navigation')}</span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                aria-label={t('closeNavigation')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation links */}
            <nav className="space-y-1 overflow-y-auto border-b p-2">{navContent(true)}</nav>

            {/* Characteristics tree — only on dashboard/data-entry/reports */}
            {showCharacteristics && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="text-muted-foreground px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider">
                  Characteristics
                </div>
                <HierarchyTodoList embedded className="min-h-0 flex-1" />
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      {!isHidden && (
        <aside
          className={cn(
            'bg-card relative hidden h-full flex-col border-r transition-[width] duration-200 ease-in-out md:flex',
            className,
          )}
          style={{ width: isCollapsed ? 56 : 260 }}
        >
          {/* ── Collapse/expand toggle — top of sidebar ── */}
          <div className="border-border flex h-10 shrink-0 items-center border-b px-2">
            <button
              onClick={toggleSidebar}
              className={cn(
                'text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                isCollapsed && 'mx-auto',
              )}
              title={isCollapsed ? t('expandSidebar') : t('collapseSidebar')}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <>
                  <PanelLeftClose className="h-4 w-4" />
                  <span>{t('collapseSidebar')}</span>
                </>
              )}
            </button>
          </div>

          {/* ── Navigation items — always visible, never collapses ── */}
          <nav className="space-y-0.5 overflow-y-auto px-2 py-2">{navContent(false)}</nav>

          {/* ── Characteristics section — only on dashboard/data-entry/reports ── */}
          {showCharacteristics && (
            <>
              <div className="border-border mx-2 border-t" />

              {isCollapsed ? (
                /* Collapsed: tree icon that expands sidebar */
                <div className="flex flex-col items-center py-2">
                  <button
                    onClick={toggleSidebar}
                    className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-10 w-10 items-center justify-center rounded-lg transition-colors"
                    title="Show characteristics"
                  >
                    <ListTree className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                /* Expanded: collapsible characteristics panel */
                <div className="flex min-h-0 flex-1 flex-col">
                  <button
                    onClick={() => setCharacteristicsPanelOpen(!characteristicsPanelOpen)}
                    className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                  >
                    <span>Characteristics</span>
                    {characteristicsPanelOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>

                  {characteristicsPanelOpen && (
                    <div className="min-h-0 flex-1">
                      <HierarchyTodoList embedded className="h-full" />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      )}
    </>
  )
}
