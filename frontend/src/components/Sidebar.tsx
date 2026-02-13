import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  FileText,
  Settings,
  ListTree,
  Network,
  Users,
  Wrench,
  ChevronsLeft,
  ChevronsRight,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useViolationStats, useDevToolsStatus } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'
import { canAccessView, type Role } from '@/lib/roles'

interface NavItem {
  path: string
  label: string
  icon: React.ReactNode
  badge?: number
  requiredRole?: Role
}

interface SidebarProps {
  className?: string
}

/**
 * Collapsible vertical sidebar navigation
 *
 * Features:
 * - Expanded mode: Full width (240px) with labels
 * - Collapsed mode: Icons only (60px)
 * - Smooth transition animations
 * - Violation badge count
 * - Active route highlighting
 * - Role-based navigation item filtering
 */
export function Sidebar({ className }: SidebarProps) {
  const { sidebarState, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } = useUIStore()
  const { data: stats } = useViolationStats()
  const { data: devToolsStatus } = useDevToolsStatus()
  const { role } = useAuth()
  const location = useLocation()

  const isCollapsed = sidebarState === 'collapsed'
  const isHidden = sidebarState === 'hidden'

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [location.pathname, setMobileSidebarOpen])

  // Navigation items with role requirements
  const mainNavItems: NavItem[] = [
    {
      path: '/dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="h-5 w-5" />,
      requiredRole: 'operator',
    },
    {
      path: '/data-entry',
      label: 'Data Entry',
      icon: <ClipboardList className="h-5 w-5" />,
      requiredRole: 'operator',
    },
    {
      path: '/violations',
      label: 'Violations',
      icon: <AlertTriangle className="h-5 w-5" />,
      badge: stats?.unacknowledged,
      requiredRole: 'operator',
    },
    {
      path: '/reports',
      label: 'Reports',
      icon: <FileText className="h-5 w-5" />,
      requiredRole: 'supervisor',
    },
  ]

  const secondaryNavItems: NavItem[] = [
    {
      path: '/connectivity',
      label: 'Connectivity',
      icon: <Network className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
    {
      path: '/configuration',
      label: 'Configuration',
      icon: <ListTree className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
    {
      path: '/settings',
      label: 'Settings',
      icon: <Settings className="h-5 w-5" />,
      requiredRole: 'engineer',
    },
    {
      path: '/admin/users',
      label: 'Users',
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

  const renderNavItem = (item: NavItem, forMobile = false) => (
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
      title={!forMobile && isCollapsed ? item.label : undefined}
    >
      {item.icon}
      {(forMobile || !isCollapsed) && (
        <>
          <span className="flex-1">{item.label}</span>
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
              label: 'Dev Tools',
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
              <span className="text-sm font-semibold">Navigation</span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 overflow-y-auto p-2">{navContent(true)}</nav>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      {!isHidden && (
        <aside
          className={cn(
            'bg-card relative hidden h-full flex-col border-r transition-all duration-150 ease-in-out md:flex',
            isCollapsed ? 'w-[60px]' : 'w-[240px]',
            className,
          )}
        >
          {/* Main navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-2">{navContent(false)}</nav>

          {/* Collapse toggle - chevron button at sidebar edge */}
          <button
            onClick={toggleSidebar}
            className={cn(
              'absolute top-20 right-0 z-10 translate-x-full',
              'flex h-12 w-6 items-center justify-center rounded-r-md',
              'bg-card border-border border border-l-0 shadow-sm',
              'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            )}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
        </aside>
      )}
    </>
  )
}
