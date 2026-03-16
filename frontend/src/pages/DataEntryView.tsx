import { useState, useEffect } from 'react'
import { PenTool, History, Clock, FileSpreadsheet, ClipboardList, Play, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ManualEntryPanel } from '@/components/ManualEntryPanel'
import { SampleHistoryPanel } from '@/components/SampleHistoryPanel'
import { ImportWizard } from '@/components/ImportWizard'
import { CollectionPlanExecutor } from '@/components/CollectionPlanExecutor'
import { collectionPlanApi } from '@/api/collection-plans.api'
import type { CollectionPlan } from '@/api/collection-plans.api'
import { useCollectionPlanStore } from '@/stores/collectionPlanStore'
import { usePlantContext } from '@/providers/PlantProvider'
import type { LucideIcon } from 'lucide-react'

type DataEntryTab = 'manual-entry' | 'collection-plans' | 'sample-history' | 'scheduling'

interface TabDef {
  id: DataEntryTab
  label: string
  icon: LucideIcon
  disabled?: boolean
}

const tabs: TabDef[] = [
  { id: 'manual-entry', label: 'Manual Entry', icon: PenTool },
  { id: 'collection-plans', label: 'Collection Plans', icon: ClipboardList },
  { id: 'scheduling', label: 'Scheduling', icon: Clock, disabled: true },
  { id: 'sample-history', label: 'Sample History', icon: History },
]

function CollectionPlansTab() {
  const [plans, setPlans] = useState<CollectionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [startingId, setStartingId] = useState<number | null>(null)
  const startExecution = useCollectionPlanStore((s) => s.startExecution)
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? null

  useEffect(() => {
    if (!plantId) return
    setLoading(true)
    collectionPlanApi
      .list(plantId, true)
      .then(setPlans)
      .catch(() => toast.error('Failed to load collection plans'))
      .finally(() => setLoading(false))
  }, [plantId])

  async function handleStart(plan: CollectionPlan) {
    setStartingId(plan.id)
    try {
      const result = await collectionPlanApi.startExecution(plan.id)
      startExecution(plan.id, plan.name, result.execution_id, result.items)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'detail' in err
          ? typeof (err as Record<string, unknown>).detail === 'string'
            ? (err as Record<string, string>).detail
            : 'Some characteristics are no longer available'
          : 'Failed to start execution'
      toast.error(msg)
    } finally {
      setStartingId(null)
    }
  }

  if (!plantId) {
    return (
      <div className="text-muted-foreground py-12 text-center">
        Select a plant to view collection plans.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center gap-2 py-12">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading collection plans...
      </div>
    )
  }

  if (plans.length === 0) {
    return (
      <div className="bg-muted text-muted-foreground rounded-xl p-8 text-center">
        <ClipboardList className="mx-auto mb-4 h-12 w-12 opacity-50" />
        <h3 className="text-foreground mb-2 font-semibold">No Collection Plans</h3>
        <p>No active collection plans for this plant. Engineers can create plans in the admin area.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className="border-border bg-card flex items-center justify-between rounded-lg border p-4"
        >
          <div>
            <h3 className="text-foreground font-medium">{plan.name}</h3>
            {plan.description && (
              <p className="text-muted-foreground mt-0.5 text-sm">{plan.description}</p>
            )}
            <p className="text-muted-foreground mt-1 text-xs">
              {plan.item_count} measurement{plan.item_count !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => handleStart(plan)}
            disabled={startingId === plan.id}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {startingId === plan.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Start
          </button>
        </div>
      ))}
    </div>
  )
}

export function DataEntryView() {
  const [activeTab, setActiveTab] = useState<DataEntryTab>('manual-entry')
  const [showImport, setShowImport] = useState(false)

  return (
    <div data-ui="data-entry-page" className="flex h-full flex-col">
      {/* Header */}
      <div data-ui="data-entry-header" className="border-border bg-card mb-4 flex shrink-0 items-start justify-between border-b px-6 pt-5 pb-5">
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
      <div data-ui="data-entry-tabs" role="tablist" aria-label="Data entry sections" className="border-border flex flex-shrink-0 gap-1 border-b px-6">
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
      <div data-ui="data-entry-content" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="flex-1 overflow-y-auto p-6">
        {activeTab === 'manual-entry' && <ManualEntryPanel />}
        {activeTab === 'collection-plans' && <CollectionPlansTab />}
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

      {/* Collection Plan Executor (full-screen overlay when active) */}
      <CollectionPlanExecutor />
    </div>
  )
}
