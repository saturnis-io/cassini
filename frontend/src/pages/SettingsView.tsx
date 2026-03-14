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
  Globe,
  Brain,
  CircleUser,
  Mail,
  ScrollText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess, type Role } from '@/lib/roles'
import { useLicense } from '@/hooks/useLicense'
import { getRegistry } from '@/lib/extensionRegistry'
import type { LicenseTier } from '@/api/license.api'
import type { LucideIcon } from 'lucide-react'

interface TabDef {
  to: string
  labelKey: string
  icon: LucideIcon
  minRole?: Role
  minTier?: LicenseTier
}

interface SidebarGroupDef {
  labelKey: string
  tabs: TabDef[]
}

const SIDEBAR_GROUPS: SidebarGroupDef[] = [
  {
    labelKey: 'groups.personal',
    tabs: [
      { to: 'account', labelKey: 'tabs.account', icon: CircleUser },
      { to: 'appearance', labelKey: 'tabs.appearance', icon: Palette },
      { to: 'notifications', labelKey: 'tabs.notifications', icon: Bell, minTier: 'pro' },
    ],
  },
  {
    labelKey: 'groups.organization',
    tabs: [
      { to: 'license', labelKey: 'tabs.license', icon: ScrollText, minRole: 'admin' },
      { to: 'sites', labelKey: 'tabs.sites', icon: Factory, minRole: 'admin' },
      { to: 'branding', labelKey: 'tabs.branding', icon: Building2, minRole: 'admin' },
      { to: 'localization', labelKey: 'tabs.localization', icon: Globe, minRole: 'admin' },
      { to: 'email-webhooks', labelKey: 'tabs.emailWebhooks', icon: Mail, minRole: 'admin' },
    ],
  },
  {
    labelKey: 'groups.security',
    tabs: [
      { to: 'sso', labelKey: 'tabs.sso', icon: Fingerprint, minRole: 'admin', minTier: 'enterprise' },
      { to: 'signatures', labelKey: 'tabs.signatures', icon: PenLine, minRole: 'engineer', minTier: 'enterprise' },
      { to: 'api-keys', labelKey: 'tabs.apiKeys', icon: Key, minRole: 'engineer', minTier: 'pro' },
      { to: 'audit-log', labelKey: 'tabs.auditLog', icon: Shield, minRole: 'admin', minTier: 'pro' },
    ],
  },
  {
    labelKey: 'groups.data',
    tabs: [
      { to: 'database', labelKey: 'tabs.database', icon: Database, minRole: 'engineer', minTier: 'pro' },
      { to: 'retention', labelKey: 'tabs.retention', icon: Archive, minRole: 'engineer', minTier: 'enterprise' },
      { to: 'reports', labelKey: 'tabs.reports', icon: FileText, minRole: 'engineer', minTier: 'pro' },
    ],
  },
  {
    labelKey: 'groups.integrations',
    tabs: [
      { to: 'ai', labelKey: 'tabs.ai', icon: Brain, minRole: 'admin', minTier: 'enterprise' },
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
  const { isProOrAbove, isEnterprise } = useLicense()

  const meetsMinTier = (minTier?: LicenseTier) => {
    if (!minTier || minTier === 'community') return true
    if (minTier === 'pro') return isProOrAbove
    if (minTier === 'enterprise') return isEnterprise
    return false
  }

  return (
    <div data-ui="settings-page" className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div data-ui="settings-header" className="border-border bg-card mb-4 shrink-0 border-b px-6 pt-5 pb-5">
        <h1 className="text-foreground text-xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {t('subtitle')}
        </p>
      </div>

      {/* Sidebar + Content */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar Navigation */}
        <nav
          data-ui="settings-sidebar"
          className="border-border bg-card w-52 shrink-0 overflow-y-auto border-r px-3 py-4"
          aria-label="Settings navigation"
        >
          {SIDEBAR_GROUPS.map((group) => {
            const visibleTabs = group.tabs.filter(
              (tab) =>
                (!tab.minRole || hasAccess(role, tab.minRole)) &&
                meetsMinTier(tab.minTier),
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
                      end={tab.to === 'account'}
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
          {/* Extension settings tabs — registered by commercial package */}
          {(() => {
            const extTabs = getRegistry().settingsTabs.filter(
              (tab) =>
                (!tab.minRole || hasAccess(role, tab.minRole)) &&
                isProOrAbove,
            )
            if (extTabs.length === 0) return null
            const groups = new Map<string, typeof extTabs>()
            for (const tab of extTabs) {
              const arr = groups.get(tab.group) ?? []
              arr.push(tab)
              groups.set(tab.group, arr)
            }
            return Array.from(groups.entries()).map(([groupName, tabs]) => (
              <div key={groupName} className="mb-5">
                <div className="text-muted-foreground mb-1.5 px-3 text-[10px] font-semibold tracking-wider uppercase">
                  {t(groupName)}
                </div>
                <div className="space-y-0.5">
                  {tabs.map((tab) => (
                    <NavLink
                      key={tab.to}
                      to={tab.to}
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
            ))
          })()}
        </nav>

        {/* Content Area */}
        <main data-ui="settings-content" className="min-h-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
