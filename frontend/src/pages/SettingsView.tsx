import { NavLink, Outlet } from 'react-router-dom'
import {
  Key,
  Bell,
  Database,
  Palette,
  Building2,
  Factory,
  Archive,
  Shield,
  Fingerprint,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess, type Role } from '@/lib/roles'
import type { LucideIcon } from 'lucide-react'

interface TabDef {
  to: string
  label: string
  icon: LucideIcon
  minRole?: Role
}

const SIDEBAR_GROUPS: { label: string; tabs: TabDef[] }[] = [
  {
    label: 'Personal',
    tabs: [
      { to: 'appearance', label: 'Appearance', icon: Palette },
      { to: 'notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Administration',
    tabs: [
      { to: 'branding', label: 'Branding', icon: Building2, minRole: 'admin' },
      { to: 'sites', label: 'Sites', icon: Factory, minRole: 'admin' },
      { to: 'api-keys', label: 'API Keys', icon: Key, minRole: 'engineer' },
      { to: 'retention', label: 'Retention', icon: Archive, minRole: 'engineer' },
      { to: 'sso', label: 'SSO', icon: Fingerprint, minRole: 'admin' },
      { to: 'audit-log', label: 'Audit Log', icon: Shield, minRole: 'admin' },
      { to: 'database', label: 'Database', icon: Database, minRole: 'engineer' },
    ],
  },
]

/**
 * Settings page — layout shell with sidebar navigation.
 * Each tab renders via nested <Route> and <Outlet>.
 */
export function SettingsPage() {
  const { role } = useAuth()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border bg-background/80 shrink-0 border-b px-6 pt-5 pb-5 backdrop-blur-sm">
        <h1 className="text-foreground text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Configure system settings and integrations
        </p>
      </div>

      {/* Sidebar + Content */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar Navigation */}
        <nav
          className="border-border bg-card/50 w-52 shrink-0 overflow-y-auto border-r px-3 py-4"
          aria-label="Settings navigation"
        >
          {SIDEBAR_GROUPS.map((group) => {
            const visibleTabs = group.tabs.filter(
              (tab) => !tab.minRole || hasAccess(role, tab.minRole),
            )
            if (visibleTabs.length === 0) return null

            return (
              <div key={group.label} className="mb-5">
                <div className="text-muted-foreground mb-1.5 px-3 text-[10px] font-semibold tracking-wider uppercase">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {visibleTabs.map((tab) => (
                    <NavLink
                      key={tab.to}
                      to={tab.to}
                      end={tab.to === 'appearance'}
                      className={({ isActive }) =>
                        cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                        )
                      }
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
