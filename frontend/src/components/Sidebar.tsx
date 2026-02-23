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
  Users,
  Wrench,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useViolationStats, useDevToolsStatus } from '@/api/hooks'
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

/** Drag-resize the sidebar width (200–450px range) */
function useSidebarResize(isCollapsed: boolean) {
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isCollapsed) return
      e.preventDefault()
      const startX = e.clientX
      const startWidth = sidebarWidth

      const onMouseMove = (ev: MouseEvent) => {
        setSidebarWidth(startWidth + ev.clientX - startX)
      }
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [isCollapsed, sidebarWidth, setSidebarWidth],
  )

  return { sidebarWidth, handleMouseDown }
}

/**
 * Collapsible vertical sidebar navigation with embedded characteristics tree
 *
 * Features:
 * - Expanded mode: Resizable width (default 260px) with labels
 * - Collapsed mode: Icons only (56px)
 * - Dual collapsible sections: Navigation and Characteristics
 * - Drag-resize handle on right edge
 * - Smooth transition animations
 * - Violation badge count
 * - Active route highlighting
 * - Role-based navigation item filtering
 */
export function Sidebar({ className }: SidebarProps) {
  const { t } = useTranslation('navigation')
  const {
    sidebarState,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    navSectionCollapsed,
    setNavSectionCollapsed,
    characteristicsPanelOpen,
    setCharacteristicsPanelOpen,
  } = useUIStore()
  const { data: stats } = useViolationStats()
  const { data: devToolsStatus } = useDevToolsStatus()
  const { role } = useAuth()
  const location = useLocation()

  const isCollapsed = sidebarState === 'collapsed'
  const isHidden = sidebarState === 'hidden'

  const { sidebarWidth, handleMouseDown: handleResizeMouseDown } = useSidebarResize(isCollapsed)

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
            'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
            'hover:bg-accent hover:text-accent-foreground',
            isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground',
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

            {/* Characteristics tree */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="text-muted-foreground px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider">
                Characteristics
              </div>
              <HierarchyTodoList embedded className="min-h-0 flex-1" />
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      {!isHidden && (
        <aside
          className={cn(
            'bg-card relative hidden h-full flex-col border-r transition-[width] duration-150 ease-in-out md:flex',
            className,
          )}
          style={{ width: isCollapsed ? 56 : sidebarWidth }}
        >
          {/* ── Navigation section header ── */}
          {!isCollapsed && (
            <button
              onClick={() => setNavSectionCollapsed(!navSectionCollapsed)}
              className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider"
            >
              <span>Navigation</span>
              {navSectionCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          )}

          {/* ── Navigation items ── */}
          {isCollapsed ? (
            <nav className="space-y-0.5 overflow-y-auto px-1 py-2">{navContent(false)}</nav>
          ) : !navSectionCollapsed ? (
            <nav className="space-y-0.5 overflow-y-auto px-2 pb-1">{navContent(false)}</nav>
          ) : null}

          {/* ── Divider ── */}
          <div className="border-border mx-2 my-1 border-t" />

          {/* ── Characteristics section ── */}
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
                className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider"
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

          {/* ── Collapse toggle tab (protruding from sidebar edge) ── */}
          <button
            onClick={toggleSidebar}
            className={cn(
              'absolute top-20 right-0 z-10 translate-x-full',
              'flex h-12 w-6 items-center justify-center rounded-r-md',
              'bg-card border-border border border-l-0 shadow-sm',
              'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            )}
            title={isCollapsed ? t('expandSidebar') : t('collapseSidebar')}
          >
            {isCollapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>

          {/* ── Resize handle (right edge drag strip) ── */}
          {!isCollapsed && (
            <div
              onMouseDown={handleResizeMouseDown}
              className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize transition-colors hover:bg-primary/20"
            />
          )}
        </aside>
      )}
    </>
  )
}
