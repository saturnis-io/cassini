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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore, type SidebarState } from '@/stores/uiStore'
import { useViolationStats } from '@/api/hooks'

interface NavItem {
  path: string
  label: string
  icon: React.ReactNode
  badge?: number
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
 */
export function Sidebar({ className }: SidebarProps) {
  const { sidebarState, toggleSidebar } = useUIStore()
  const { data: stats } = useViolationStats()

  const isCollapsed = sidebarState === 'collapsed'
  const isHidden = sidebarState === 'hidden'

  // Don't render if hidden (used for mobile overlay mode)
  if (isHidden) return null

  // Navigation items - will be filtered by role in Plan 4
  const mainNavItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
    { path: '/data-entry', label: 'Data Entry', icon: <ClipboardList className="h-5 w-5" /> },
    {
      path: '/violations',
      label: 'Violations',
      icon: <AlertTriangle className="h-5 w-5" />,
      badge: stats?.unacknowledged,
    },
    { path: '/reports', label: 'Reports', icon: <FileText className="h-5 w-5" /> },
  ]

  const secondaryNavItems: NavItem[] = [
    { path: '/configuration', label: 'Configuration', icon: <Settings className="h-5 w-5" /> },
    { path: '/settings', label: 'Settings', icon: <Sliders className="h-5 w-5" /> },
  ]

  const renderNavItem = (item: NavItem) => (
    <NavLink
      key={item.path}
      to={item.path}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
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
        'flex flex-col h-full bg-card border-r transition-all duration-150 ease-in-out',
        isCollapsed ? 'w-[60px]' : 'w-[240px]',
        className
      )}
    >
      {/* Logo/Brand */}
      <div
        className={cn(
          'flex items-center h-14 border-b px-4',
          isCollapsed && 'justify-center px-2'
        )}
      >
        <Activity className="h-6 w-6 text-primary flex-shrink-0" />
        {!isCollapsed && (
          <span className="ml-2 text-lg font-semibold">OpenSPC</span>
        )}
      </div>

      {/* Main navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {mainNavItems.map(renderNavItem)}

        {/* Divider */}
        <div className="my-2 border-t" />

        {secondaryNavItems.map(renderNavItem)}
      </nav>

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
