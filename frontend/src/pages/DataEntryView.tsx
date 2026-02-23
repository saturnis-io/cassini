import { useState } from 'react'
import { PenTool, History, Clock, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ManualEntryPanel } from '@/components/ManualEntryPanel'
import { SampleHistoryPanel } from '@/components/SampleHistoryPanel'
import { ImportWizard } from '@/components/ImportWizard'
import type { LucideIcon } from 'lucide-react'

type DataEntryTab = 'manual-entry' | 'sample-history' | 'scheduling'

interface TabDef {
  id: DataEntryTab
  label: string
  icon: LucideIcon
  disabled?: boolean
}

const tabs: TabDef[] = [
  { id: 'manual-entry', label: 'Manual Entry', icon: PenTool },
  { id: 'scheduling', label: 'Scheduling', icon: Clock, disabled: true },
  { id: 'sample-history', label: 'Sample History', icon: History },
]

export function DataEntryView() {
  const [activeTab, setActiveTab] = useState<DataEntryTab>('manual-entry')
  const [showImport, setShowImport] = useState(false)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border bg-background/80 flex shrink-0 items-start justify-between border-b px-6 pt-5 pb-5 backdrop-blur-sm">
        <div>
          <h1 className="text-foreground text-xl font-bold tracking-tight">Data Entry</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Submit samples and manage measurement history
          </p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Import CSV/Excel
        </button>
      </div>

      {/* Tab bar */}
      <div role="tablist" aria-label="Data entry sections" className="border-border flex flex-shrink-0 gap-1 border-b px-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              tab.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.disabled && (
              <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">Soon</span>
            )}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="flex-1 overflow-y-auto p-6">
        {activeTab === 'manual-entry' && <ManualEntryPanel />}
        {activeTab === 'sample-history' && <SampleHistoryPanel />}
        {activeTab === 'scheduling' && (
          <div className="bg-muted text-muted-foreground rounded-xl p-8 text-center">
            <Clock className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <h3 className="text-foreground mb-2 font-semibold">Scheduling Coming Soon</h3>
            <p>Configure scheduled data collection reminders and automated sampling workflows.</p>
          </div>
        )}
      </div>

      {/* Import Wizard Modal */}
      {showImport && <ImportWizard onClose={() => setShowImport(false)} />}
    </div>
  )
}
