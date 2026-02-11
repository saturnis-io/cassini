import { useState } from 'react'
import { PenTool, History, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ManualEntryPanel } from '@/components/ManualEntryPanel'
import { SampleHistoryPanel } from '@/components/SampleHistoryPanel'
import type { LucideIcon } from 'lucide-react'

type DataEntryTab = 'manual-entry' | 'sample-history' | 'scheduling'

interface TabDef {
  id: DataEntryTab
  label: string
  icon: LucideIcon
  disabled?: boolean
}

const SIDEBAR_GROUPS: { label: string; tabs: TabDef[] }[] = [
  {
    label: 'Collection',
    tabs: [
      { id: 'manual-entry', label: 'Manual Entry', icon: PenTool },
      { id: 'scheduling', label: 'Scheduling', icon: Clock, disabled: true },
    ],
  },
  {
    label: 'Review',
    tabs: [
      { id: 'sample-history', label: 'Sample History', icon: History },
    ],
  },
]

export function DataEntryView() {
  const [activeTab, setActiveTab] = useState<DataEntryTab>('manual-entry')

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background/80 backdrop-blur-sm px-6 pt-5 pb-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Data Entry</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Submit samples and manage measurement history
        </p>
      </div>

      {/* Sidebar + Content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar Navigation */}
        <nav
          className="w-52 shrink-0 border-r border-border bg-card/50 overflow-y-auto py-4 px-3"
          aria-label="Data entry navigation"
        >
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => !tab.disabled && setActiveTab(tab.id)}
                    disabled={tab.disabled}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                      activeTab === tab.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                      tab.disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground'
                    )}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                    {tab.disabled && (
                      <span className="ml-auto text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        Soon
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'manual-entry' && <ManualEntryPanel />}
          {activeTab === 'sample-history' && <SampleHistoryPanel />}
          {activeTab === 'scheduling' && (
            <div className="bg-muted rounded-xl p-8 text-center text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="font-semibold text-foreground mb-2">Scheduling Coming Soon</h3>
              <p>
                Configure scheduled data collection reminders and automated
                sampling workflows.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
