import { useState } from 'react'
import { cn } from '@/lib/utils'
import { WorkflowConfig } from './WorkflowConfig'
import { MeaningManager } from './MeaningManager'
import { PasswordPolicySettings } from './PasswordPolicySettings'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess } from '@/lib/roles'

type Tab = 'workflows' | 'meanings' | 'password-policy'

const TABS: { id: Tab; label: string; minRole?: 'admin' | 'engineer' }[] = [
  { id: 'workflows', label: 'Workflows' },
  { id: 'meanings', label: 'Signature Meanings', minRole: 'admin' },
  { id: 'password-policy', label: 'Password Policy', minRole: 'admin' },
]

export function SignatureSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('workflows')
  const { role } = useAuth()

  const visibleTabs = TABS.filter((tab) => !tab.minRole || hasAccess(role, tab.minRole))

  return (
    <div className="space-y-6" data-ui="signature-settings">
      <div data-ui="signature-settings-header">
        <h2 className="text-foreground text-lg font-semibold">Electronic Signatures</h2>
        <p className="text-muted-foreground text-sm">
          Configure signature workflows, meanings, and password policies for 21 CFR Part 11
          compliance.
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-border flex gap-1 border-b" data-ui="signature-settings-tabs">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-primary text-foreground border-b-2'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'workflows' && <WorkflowConfig />}
      {activeTab === 'meanings' && <MeaningManager />}
      {activeTab === 'password-policy' && <PasswordPolicySettings />}
    </div>
  )
}
