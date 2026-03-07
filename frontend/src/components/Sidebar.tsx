import { useEffect, useCallback, useState, useRef } from 'react'
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
import { usePlant } from '@/providers/PlantProvider'
import { canAccessView, type Role } from '@/lib/roles'
import { useLicense } from '@/hooks/useLicense'
import { getRegistry } from '@/lib/extensionRegistry'
import { HierarchyTodoList } from './HierarchyTodoList'

interface NavItem {
  path: string
  labelKey: string
  icon: React.ReactNode
  badge?: number
  requiredRole?: Role
  commercial?: boolean
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
    navSectionCollapsed,
    setNavSectionCollapsed,
    sidebarWidth,
    setSidebarWidth,
  } = useUIStore()
  const wsConnected = useDashboardStore((state) => state.wsConnected)
  const { selectedPlant } = usePlant()
  const { data: stats } = useViolationStats({
    refetchInterval: wsConnected ? false : undefined,
    plant_id: selectedPlant?.id,
  })
  const { data: devToolsStatus } = useDevToolsStatus()
  const { role } = useAuth()
  const { isCommercial } = useLicense()
  const location = useLocation()

  const isCollapsed = sidebarState === 'collapsed'
  const isHidden = sidebarState === 'hidden'

  // Drag-to-resize sidebar width
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef({ x: 0, width: 0 })

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizeStartRef.current = { x: e.clientX, width: sidebarWidth }
      setIsResizing(true)
    },
    [sidebarWidth],
  )

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartRef.current.x
      setSidebarWidth(resizeStartRef.current.width + delta)
    }

    const handleMouseUp = () => setIsResizing(false)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isResizing, setSidebarWidth])

  // Only show the Characteristics tree on pages that use it
  const characteristicPages = ['/', '/dashboard', '/data-entry', '/reports']
  const showCharacteristics = characteristicPages.some(
    (path) => location.pathname === path || location.pathname.startsWith(path + '/'),
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

  const studyNavItems: NavItem[] = [
    {
      path: '/msa',
      labelKey: 'msa',
      icon: <Microscope className="h-5 w-5" />,
      requiredRole: 'engineer',
      commercial: true,
    },
    {
      path: '/fai',
      labelKey: 'fai',
      icon: <ClipboardCheck className="h-5 w-5" />,
      requiredRole: 'engineer',
      commercial: true,
    },
    {
      path: '/doe',
      labelKey: 'doe',
      icon: <FlaskConical className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
  ]

  const systemNavItems: NavItem[] = [
    {
      path: '/analytics',
      labelKey: 'analytics',
      icon: <TrendingUp className="h-5 w-5" />,
      requiredRole: 'engineer',
      commercial: true,
    },
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
      path: '/settings',
      labelKey: 'settings',
      icon: <Settings className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
  ]

  const adminNavItems: NavItem[] = [
    {
      path: '/admin/users',
      labelKey: 'users',
      icon: <Users className="h-5 w-5" />,
      requiredRole: 'admin',
    },
  ]

  // Extension sidebar items — registered by commercial package
  const extensionStudyItems = getRegistry()
    .sidebarItems.filter((item) => item.section === 'studies')
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  const extensionSystemItems = getRegistry()
    .sidebarItems.filter((item) => item.section === 'system')
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))

  // Dev tools nav item — only when sandbox mode is active and user is admin
  const showDevTools = devToolsStatus?.sandbox && canAccessView(role, '/dev-tools')

  // Filter navigation items based on current role and license
  const visibleMainItems = mainNavItems.filter(
    (item) =>
      (!item.requiredRole || canAccessView(role, item.path)) &&
      (!item.commercial || isCommercial),
  )
  const visibleStudyItems = studyNavItems.filter(
    (item) =>
      (!item.requiredRole || canAccessView(role, item.path)) &&
      (!item.commercial || isCommercial),
  )
  const visibleSystemItems = systemNavItems.filter(
    (item) =>
      (!item.requiredRole || canAccessView(role, item.path)) &&
      (!item.commercial || isCommercial),
  )
  const visibleExtStudyItems = extensionStudyItems.filter(
    (item) =>
      (!item.requiredRole || canAccessView(role, item.path)) &&
      isCommercial,
  )
  const visibleExtSystemItems = extensionSystemItems.filter(
    (item) =>
      (!item.requiredRole || canAccessView(role, item.path)) &&
      isCommercial,
  )
  const visibleAdminItems = adminNavItems.filter(
    (item) =>
      (!item.requiredRole || canAccessView(role, item.path)) &&
      (!item.commercial || isCommercial),
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

  const sectionLabel = (text: string, forMobile: boolean) =>
    (!forMobile && isCollapsed) ? null : (
      <div className="text-muted-foreground px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider">
        {text}
      </div>
    )

  const navContent = (forMobile = false) => (
    <>
      {visibleMainItems.map((item) => renderNavItem(item, forMobile))}

      {/* Studies section */}
      {(visibleStudyItems.length > 0 || visibleExtStudyItems.length > 0) && (
        <>
          <div className="my-2 border-t" />
          {sectionLabel('Studies', forMobile)}
          {visibleStudyItems.map((item) => renderNavItem(item, forMobile))}
          {visibleExtStudyItems.map((item) => renderNavItem(item, forMobile))}
        </>
      )}

      {/* System section */}
      {(visibleSystemItems.length > 0 || visibleExtSystemItems.length > 0) && (
        <>
          <div className="my-2 border-t" />
          {visibleSystemItems.map((item) => renderNavItem(item, forMobile))}
          {visibleExtSystemItems.map((item) => renderNavItem(item, forMobile))}
        </>
      )}

      {/* Admin section */}
      {visibleAdminItems.length > 0 && (
        <>
          <div className="my-2 border-t" />
          {visibleAdminItems.map((item) => renderNavItem(item, forMobile))}
        </>
      )}

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
          <aside data-ui="mobile-sidebar" className="bg-card absolute inset-y-0 left-0 flex w-[280px] flex-col shadow-lg">
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
            <nav data-ui="mobile-sidebar-nav" className="space-y-1 overflow-y-auto border-b p-2">{navContent(true)}</nav>

            {/* Characteristics tree — only on dashboard/data-entry/reports */}
            {showCharacteristics && (
              <div data-ui="mobile-sidebar-characteristics" className="flex min-h-0 flex-1 flex-col">
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
          data-ui="sidebar"
          className={cn(
            'bg-card relative hidden h-full flex-col border-r transition-[width] duration-200 ease-in-out md:flex',
            className,
          )}
          style={{ width: isCollapsed ? 56 : sidebarWidth }}
        >
          {/* ── Collapse/expand toggle — top of sidebar ── */}
          <div data-ui="sidebar-toggle" className="border-border flex h-10 shrink-0 items-center border-b px-2">
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

          {/* ── Sidebar content: two layouts based on page type ── */}
          {!isCollapsed && showCharacteristics ? (
            /* Characteristic pages (expanded): collapsible nav + flex-1 characteristics */
            <>
              {/* Collapsible navigation */}
              <div data-ui="sidebar-nav" className="shrink-0">
                <button
                  onClick={() => setNavSectionCollapsed(!navSectionCollapsed)}
                  className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
                >
                  <span>Navigation</span>
                  {navSectionCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
                {!navSectionCollapsed && (
                  <nav className="space-y-0.5 px-2 pb-2">
                    {navContent(false)}
                  </nav>
                )}
              </div>

              <div className="border-border mx-2 border-t" />

              {/* Characteristics — takes all remaining space */}
              <div data-ui="sidebar-characteristics" className="flex min-h-0 flex-1 flex-col">
                <button
                  onClick={() => setCharacteristicsPanelOpen(!characteristicsPanelOpen)}
                  className="text-muted-foreground hover:text-foreground flex w-full shrink-0 items-center justify-between px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider"
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
            </>
          ) : (
            /* Non-characteristic pages or collapsed sidebar: normal layout */
            <>
              <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
                {navContent(false)}
              </nav>
              {showCharacteristics && isCollapsed && (
                <>
                  <div className="border-border mx-2 border-t" />
                  <div className="flex flex-col items-center py-2">
                    <button
                      onClick={toggleSidebar}
                      className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-10 w-10 items-center justify-center rounded-lg transition-colors"
                      title="Show characteristics"
                    >
                      <ListTree className="h-5 w-5" />
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Resize handle — right edge */}
          {!isCollapsed && (
            <div
              className="group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
              onMouseDown={handleResizeStart}
            >
              <div className="bg-primary/0 group-hover:bg-primary/30 absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors" />
            </div>
          )}
        </aside>
      )}
    </>
  )
}
