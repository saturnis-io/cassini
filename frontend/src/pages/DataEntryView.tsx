import { useState } from 'react'
import { PenTool, History, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ManualEntryPanel } from '@/components/ManualEntryPanel'
import { SampleHistoryPanel } from '@/components/SampleHistoryPanel'

type DataEntryTab = 'manual-entry' | 'sample-history' | 'scheduling'

export function DataEntryView() {
  const [activeTab, setActiveTab] = useState<DataEntryTab>('manual-entry')

  const tabs = [
    { id: 'manual-entry' as const, label: 'Manual Entry', icon: PenTool },
    { id: 'sample-history' as const, label: 'Sample History', icon: History },
    { id: 'scheduling' as const, label: 'Scheduling', icon: Clock, disabled: true },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data Entry</h1>
        <p className="text-muted-foreground">Submit samples and manage measurement history</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                tab.disabled && 'opacity-50 cursor-not-allowed hover:text-muted-foreground'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.disabled && (
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Soon</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'manual-entry' && <ManualEntryPanel />}
        {activeTab === 'sample-history' && <SampleHistoryPanel />}
        {activeTab === 'scheduling' && (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="font-semibold text-foreground mb-2">Scheduling Coming Soon</h3>
            <p>
              Configure scheduled data collection reminders and automated
              sampling workflows.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
