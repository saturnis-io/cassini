import { NavLink, Outlet } from 'react-router-dom'
import { Activity, Server, Search, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { to: 'monitor', label: 'Monitor', icon: Activity },
  { to: 'servers', label: 'Servers', icon: Server },
  { to: 'browse', label: 'Browse', icon: Search },
  { to: 'mapping', label: 'Mapping', icon: Link2 },
] as const

/**
 * Connectivity Hub — layout shell with route-based tab navigation.
 * Each tab renders via nested <Route> and <Outlet>.
 */
export function ConnectivityPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Header + Tab Bar */}
      <div className="shrink-0 border-b border-[#1e293b] bg-[#0a0f1a]/80 backdrop-blur-sm px-6 pt-5 pb-0">
        <div className="max-w-7xl">
          <h1 className="text-xl font-bold tracking-tight text-[#e2e8f0]">
            Connectivity Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 mb-4">
            Manage industrial data sources, browse endpoints, and configure data mappings
          </p>

          {/* Tab Navigation */}
          <nav className="flex gap-1" aria-label="Connectivity tabs">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === 'monitor'}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-150',
                    isActive
                      ? 'text-[#e2e8f0] bg-[#111827]'
                      : 'text-muted-foreground hover:text-[#e2e8f0] hover:bg-[#111827]/50'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <tab.icon className={cn(
                      'h-4 w-4 transition-colors',
                      isActive ? 'text-[#6366f1]' : 'text-muted-foreground group-hover:text-[#6366f1]/70'
                    )} />
                    <span>{tab.label}</span>
                    {/* Active indicator line */}
                    {isActive && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#6366f1] rounded-t-full" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
