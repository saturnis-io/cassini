import { useState } from 'react'
import { MQTTConfigPanel } from '@/components/MQTTConfigPanel'
import { AppearanceSettings } from '@/components/AppearanceSettings'
import { ApiKeysSettings } from '@/components/ApiKeysSettings'
import { NotificationsSettings } from '@/components/NotificationsSettings'
import { DatabaseSettings } from '@/components/DatabaseSettings'
import { cn } from '@/lib/utils'
import { Wifi, Key, Bell, Database, Palette } from 'lucide-react'

type SettingsTab = 'appearance' | 'mqtt' | 'api-keys' | 'notifications' | 'database'

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')

  const tabs = [
    { id: 'appearance' as const, label: 'Appearance', icon: Palette },
    { id: 'mqtt' as const, label: 'Data Collection', icon: Wifi },
    { id: 'api-keys' as const, label: 'API Keys', icon: Key },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'database' as const, label: 'Database', icon: Database },
  ]

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

        {activeTab === 'mqtt' && <MQTTConfigPanel />}

        {activeTab === 'api-keys' && <ApiKeysSettings />}

        {activeTab === 'notifications' && <NotificationsSettings />}

        {activeTab === 'database' && <DatabaseSettings />}
      </div>
    </div>
  )
}
