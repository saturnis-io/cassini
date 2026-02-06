import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  FileText,
  Settings,
  Sliders,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useViolationStats } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'
import { canAccessView, ROLE_LABELS, type Role } from '@/lib/roles'

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
 * - Current user info and logout
 */
export function Sidebar({ className }: SidebarProps) {
  const { sidebarState, toggleSidebar } = useUIStore()
  const { data: stats } = useViolationStats()
  const { role, user, logout } = useAuth()

  const isCollapsed = sidebarState === 'collapsed'
  const isHidden = sidebarState === 'hidden'

  // Don't render if hidden (used for mobile overlay mode)
  if (isHidden) return null

  // Navigation items with role requirements
  const mainNavItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, requiredRole: 'operator' },
    { path: '/data-entry', label: 'Data Entry', icon: <ClipboardList className="h-5 w-5" />, requiredRole: 'operator' },
    {
      path: '/violations',
      label: 'Violations',
      icon: <AlertTriangle className="h-5 w-5" />,
      badge: stats?.unacknowledged,
      requiredRole: 'operator',
    },
    { path: '/reports', label: 'Reports', icon: <FileText className="h-5 w-5" />, requiredRole: 'supervisor' },
  ]

  const secondaryNavItems: NavItem[] = [
    { path: '/configuration', label: 'Configuration', icon: <Settings className="h-5 w-5" />, requiredRole: 'engineer' },
    { path: '/settings', label: 'Settings', icon: <Sliders className="h-5 w-5" />, requiredRole: 'admin' },
  ]

  // Filter navigation items based on current role
  const visibleMainItems = mainNavItems.filter(
    (item) => !item.requiredRole || canAccessView(role, item.path)
  )
  const visibleSecondaryItems = secondaryNavItems.filter(
    (item) => !item.requiredRole || canAccessView(role, item.path)
  )

  const renderNavItem = (item: NavItem) => (
    <NavLink
      key={item.path}
      to={item.path}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
          'hover:bg-accent hover:text-accent-foreground',
          isActive
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground',
          isCollapsed && 'justify-center px-2'
        )
      }
      title={isCollapsed ? item.label : undefined}
    >
      {item.icon}
      {!isCollapsed && (
        <>
          <span className="flex-1">{item.label}</span>
          {item.badge ? (
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-destructive text-destructive-foreground min-w-[1.25rem] text-center">
              {item.badge}
            </span>
          ) : null}
        </>
      )}
      {isCollapsed && item.badge ? (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-destructive" />
      ) : null}
    </NavLink>
  )

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full bg-card border-r transition-all duration-150 ease-in-out',
        isCollapsed ? 'w-[60px]' : 'w-[240px]',
        className
      )}
    >

      {/* Main navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {visibleMainItems.map(renderNavItem)}

        {/* Divider - only show if there are secondary items */}
        {visibleSecondaryItems.length > 0 && <div className="my-2 border-t" />}

        {visibleSecondaryItems.map(renderNavItem)}
      </nav>

      {/* User info and logout */}
      {user && (
        <div className="border-t p-2">
          {!isCollapsed && (
            <div className="px-3 py-1.5 mb-1">
              <p className="text-sm font-medium text-foreground truncate">{user.username}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
            </div>
          )}
          <button
            onClick={() => logout()}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              isCollapsed && 'justify-center px-2'
            )}
            title={isCollapsed ? 'Sign Out' : undefined}
          >
            <LogOut className="h-5 w-5" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      )}

      {/* Collapse toggle - chevron button at sidebar edge */}
      <button
        onClick={toggleSidebar}
        className={cn(
          'absolute top-20 right-0 translate-x-full z-10',
          'flex items-center justify-center w-6 h-12 rounded-r-md',
          'bg-card border border-l-0 border-border shadow-sm',
          'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors'
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
  )
}
