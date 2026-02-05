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
  Activity,
  Bug,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useViolationStats } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'
import { canAccessView, ROLE_LABELS, type Role } from '@/lib/roles'
import { useState } from 'react'

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
 * - Dev tools for role switching (development only)
 */
export function Sidebar({ className }: SidebarProps) {
  const { sidebarState, toggleSidebar } = useUIStore()
  const { data: stats } = useViolationStats()
  const { role, setRole } = useAuth()
  const [devToolsOpen, setDevToolsOpen] = useState(false)

  const isCollapsed = sidebarState === 'collapsed'
  const isHidden = sidebarState === 'hidden'
  const isDev = import.meta.env.DEV

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

  const roles: Role[] = ['operator', 'supervisor', 'engineer', 'admin']

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-card border-r transition-all duration-150 ease-in-out',
        isCollapsed ? 'w-[60px]' : 'w-[240px]',
        className
      )}
    >
      {/* Logo/Brand - hidden since Header has it */}
      <div className="h-14 border-b" />

      {/* Main navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {visibleMainItems.map(renderNavItem)}

        {/* Divider - only show if there are secondary items */}
        {visibleSecondaryItems.length > 0 && <div className="my-2 border-t" />}

        {visibleSecondaryItems.map(renderNavItem)}
      </nav>

      {/* Dev tools - only in development */}
      {isDev && (
        <div className="border-t">
          <button
            onClick={() => setDevToolsOpen(!devToolsOpen)}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium transition-colors',
              'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              isCollapsed && 'justify-center px-2'
            )}
            title={isCollapsed ? 'Dev Tools' : undefined}
          >
            <Bug className="h-5 w-5 text-orange-500" />
            {!isCollapsed && (
              <>
                <span className="flex-1">Dev Tools</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-150',
                    devToolsOpen && 'rotate-180'
                  )}
                />
              </>
            )}
          </button>

          {devToolsOpen && !isCollapsed && (
            <div className="px-3 pb-3 space-y-2">
              <label className="block text-xs font-medium text-muted-foreground">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full px-2 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Current: {ROLE_LABELS[role]}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Collapse toggle */}
      <div className="p-2 border-t">
        <button
          onClick={toggleSidebar}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            isCollapsed && 'justify-center px-2'
          )}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronsRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronsLeft className="h-5 w-5" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
