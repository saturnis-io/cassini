import { useState } from 'react'
import { MQTTConfigPanel } from '@/components/MQTTConfigPanel'
import { AppearanceSettings } from '@/components/AppearanceSettings'
import { ApiKeysSettings } from '@/components/ApiKeysSettings'
import { NotificationsSettings } from '@/components/NotificationsSettings'
import { DatabaseSettings } from '@/components/DatabaseSettings'
import { ThemeCustomizer } from '@/components/ThemeCustomizer'
import { PlantSettings } from '@/components/PlantSettings'
import { cn } from '@/lib/utils'
import { Wifi, Key, Bell, Database, Palette, Building2, Factory } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess } from '@/lib/roles'

type SettingsTab = 'appearance' | 'branding' | 'plants' | 'mqtt' | 'api-keys' | 'notifications' | 'database'

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const { role } = useAuth()

  // Check role-based access for tabs
  const isAdmin = hasAccess(role, 'admin')
  const isEngineer = hasAccess(role, 'engineer')

  const tabs = [
    { id: 'appearance' as const, label: 'Appearance', icon: Palette, visible: true },
    { id: 'branding' as const, label: 'Branding', icon: Building2, visible: isAdmin },
    { id: 'plants' as const, label: 'Plants', icon: Factory, visible: isAdmin },
    { id: 'mqtt' as const, label: 'Data Collection', icon: Wifi, visible: isEngineer },
    { id: 'api-keys' as const, label: 'API Keys', icon: Key, visible: isEngineer },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell, visible: true },
    { id: 'database' as const, label: 'Database', icon: Database, visible: isEngineer },
  ].filter((tab) => tab.visible)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure system settings and integrations</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'appearance' && <AppearanceSettings />}

        {activeTab === 'branding' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Brand Customization</h2>
              <p className="text-sm text-muted-foreground">
                Customize the application appearance with your brand colors and logo.
              </p>
            </div>
            <ThemeCustomizer />
          </div>
        )}

        {activeTab === 'plants' && <PlantSettings />}

        {activeTab === 'mqtt' && <MQTTConfigPanel />}

        {activeTab === 'api-keys' && <ApiKeysSettings />}

        {activeTab === 'notifications' && <NotificationsSettings />}

        {activeTab === 'database' && <DatabaseSettings />}
      </div>
    </div>
  )
}
