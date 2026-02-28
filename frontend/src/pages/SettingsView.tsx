import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  FileText,
  PenLine,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess, type Role } from '@/lib/roles'
import { useLicense } from '@/hooks/useLicense'
import type { LucideIcon } from 'lucide-react'

interface TabDef {
  to: string
  labelKey: string
  icon: LucideIcon
  minRole?: Role
  commercial?: boolean
}

interface SidebarGroupDef {
  labelKey: string
  tabs: TabDef[]
}

const SIDEBAR_GROUPS: SidebarGroupDef[] = [
  {
    labelKey: 'groups.personal',
    tabs: [
      { to: 'appearance', labelKey: 'tabs.appearance', icon: Palette },
      { to: 'notifications', labelKey: 'tabs.notifications', icon: Bell, commercial: true },
    ],
  },
  {
    labelKey: 'groups.administration',
    tabs: [
      { to: 'branding', labelKey: 'tabs.branding', icon: Building2, minRole: 'admin' },
      { to: 'sites', labelKey: 'tabs.sites', icon: Factory, minRole: 'admin' },
      { to: 'api-keys', labelKey: 'tabs.apiKeys', icon: Key, minRole: 'engineer', commercial: true },
      { to: 'retention', labelKey: 'tabs.retention', icon: Archive, minRole: 'engineer', commercial: true },
      { to: 'reports', labelKey: 'tabs.reports', icon: FileText, minRole: 'engineer', commercial: true },
      { to: 'sso', labelKey: 'tabs.sso', icon: Fingerprint, minRole: 'admin', commercial: true },
      { to: 'signatures', labelKey: 'tabs.signatures', icon: PenLine, minRole: 'engineer', commercial: true },
      { to: 'audit-log', labelKey: 'tabs.auditLog', icon: Shield, minRole: 'admin', commercial: true },
      { to: 'database', labelKey: 'tabs.database', icon: Database, minRole: 'engineer', commercial: true },
    ],
  },
]

/**
 * Settings page — layout shell with sidebar navigation.
 * Each tab renders via nested <Route> and <Outlet>.
 */
export function SettingsPage() {
  const { t } = useTranslation('settings')
  const { role } = useAuth()
  const { isCommercial } = useLicense()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="border-border bg-background/80 shrink-0 border-b px-6 pt-5 pb-5 backdrop-blur-sm">
        <h1 className="text-foreground text-xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {t('subtitle')}
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
              (tab) =>
                (!tab.minRole || hasAccess(role, tab.minRole)) &&
                (tab.commercial !== true || isCommercial),
            )
            if (visibleTabs.length === 0) return null

            return (
              <div key={group.labelKey} className="mb-5">
                <div className="text-muted-foreground mb-1.5 px-3 text-[10px] font-semibold tracking-wider uppercase">
                  {t(group.labelKey)}
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
                      {t(tab.labelKey)}
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
