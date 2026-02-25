import { NavLink, Outlet } from 'react-router-dom'
import { Activity, Server, Search, Link2, Usb, Building2 } from 'lucide-react'
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
  {
    label: 'Instruments',
    tabs: [
      { to: 'gages', label: 'Gages', icon: Usb },
    ],
  },
  {
    label: 'Integrations',
    tabs: [
      { to: 'integrations', label: 'ERP/LIMS', icon: Building2 },
    ],
  },
]

/**
 * Connectivity Hub — layout shell with sidebar navigation.
 * Each tab renders via nested <Route> and <Outlet>.
 */
export function ConnectivityPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border bg-background/80 shrink-0 border-b px-6 pt-5 pb-5 backdrop-blur-sm">
        <h1 className="text-foreground text-xl font-bold tracking-tight">Connectivity Hub</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Manage industrial data sources, browse endpoints, and configure data mappings
        </p>
      </div>

      {/* Sidebar + Content */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar Navigation */}
        <nav
          className="border-border bg-card/50 w-52 shrink-0 overflow-y-auto border-r px-3 py-4"
          aria-label="Connectivity navigation"
        >
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="text-muted-foreground mb-1.5 px-3 text-[10px] font-semibold tracking-wider uppercase">
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
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium',
                        'hover:transition-colors hover:duration-150',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
