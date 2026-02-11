import { NavLink, Outlet } from 'react-router-dom'
import { Activity, Server, Search, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface TabDef {
  to: string
  label: string
  icon: LucideIcon
}

const SIDEBAR_GROUPS: { label: string; tabs: TabDef[] }[] = [
  {
    label: 'Operations',
    tabs: [
      { to: 'monitor', label: 'Monitor', icon: Activity },
      { to: 'servers', label: 'Servers', icon: Server },
    ],
  },
  {
    label: 'Configuration',
    tabs: [
      { to: 'browse', label: 'Browse', icon: Search },
      { to: 'mapping', label: 'Mapping', icon: Link2 },
    ],
  },
]

/**
 * Connectivity Hub — layout shell with sidebar navigation.
 * Each tab renders via nested <Route> and <Outlet>.
 */
export function ConnectivityPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background/80 backdrop-blur-sm px-6 pt-5 pb-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Connectivity Hub
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage industrial data sources, browse endpoints, and configure data mappings
        </p>
      </div>

      {/* Sidebar + Content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar Navigation */}
        <nav
          className="w-52 shrink-0 border-r border-border bg-card/50 overflow-y-auto py-4 px-3"
          aria-label="Connectivity navigation"
        >
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.tabs.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    end={tab.to === 'monitor'}
                    className={({ isActive }) =>
                      cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )
                    }
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
