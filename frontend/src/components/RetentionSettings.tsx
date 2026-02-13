import { useState, useCallback } from 'react'
import {
  Archive,
  Infinity,
  Hash,
  Calendar,
  Info,
  Clock,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlant } from '@/providers/PlantProvider'
import { useAuth } from '@/providers/AuthProvider'
import {
  useRetentionDefault,
  useRetentionOverrides,
  useRetentionActivity,
  useNextPurge,
  useTriggerPurge,
  useSetRetentionDefault,
  useSetHierarchyRetention,
  useDeleteHierarchyRetention,
  useSetCharacteristicRetention,
  useDeleteCharacteristicRetention,
} from '@/api/hooks'
import { RetentionPolicyForm } from './retention/RetentionPolicyForm'
import { RetentionTreeBrowser, type SelectedNode } from './retention/RetentionTreeBrowser'
import { RetentionOverridePanel } from './retention/RetentionOverridePanel'
import { formatRetentionPolicy, formatRetentionDescription } from './retention/utils'
import type { PurgeHistory, RetentionPolicySet } from '@/types'

type SubTab = 'policy' | 'overrides' | 'activity'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'policy', label: 'Policy' },
  { id: 'overrides', label: 'Overrides' },
  { id: 'activity', label: 'Activity' },
]

function getPolicyIcon(retentionType: string | undefined) {
  switch (retentionType) {
    case 'sample_count':
      return Hash
    case 'time_delta':
      return Calendar
    default:
      return Infinity
  }
}

export function RetentionSettings() {
  const { selectedPlant } = usePlant()
  const plantId = selectedPlant?.id ?? 0

  const { data: globalDefault, isLoading: defaultLoading } = useRetentionDefault(plantId)
  const { data: overrides = [], isLoading: overridesLoading } = useRetentionOverrides(plantId)

  const setDefaultMutation = useSetRetentionDefault()
  const setHierarchyMutation = useSetHierarchyRetention()
  const deleteHierarchyMutation = useDeleteHierarchyRetention()
  const setCharacteristicMutation = useSetCharacteristicRetention()
  const deleteCharacteristicMutation = useDeleteCharacteristicRetention()

  const [subTab, setSubTab] = useState<SubTab>('policy')
  const [isEditingDefault, setIsEditingDefault] = useState(false)
  const [showDefaultConfirm, setShowDefaultConfirm] = useState<RetentionPolicySet | null>(null)
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)

  // Effective global policy (fallback to 'forever' if none set)
  const effectiveType = globalDefault?.retention_type ?? 'forever'
  const effectiveValue = globalDefault?.retention_value ?? null
  const effectiveUnit = globalDefault?.retention_unit ?? null
  const PolicyIcon = getPolicyIcon(effectiveType)

  // Override summary
  const hierarchyOverrides = overrides.filter((o) => o.scope === 'hierarchy')
  const charOverrides = overrides.filter((o) => o.scope === 'characteristic')

  const handleSaveDefault = useCallback((policy: RetentionPolicySet) => {
    setShowDefaultConfirm(policy)
  }, [])

  const confirmSaveDefault = useCallback(() => {
    if (!showDefaultConfirm) return
    setDefaultMutation.mutate(
      { plantId, policy: showDefaultConfirm },
      {
        onSuccess: () => {
          setIsEditingDefault(false)
          setShowDefaultConfirm(null)
        },
        onError: () => {
          setShowDefaultConfirm(null)
        },
      },
    )
  }, [showDefaultConfirm, plantId, setDefaultMutation])

  const handleSetOverride = useCallback(
    (node: SelectedNode, policy: RetentionPolicySet) => {
      if (node.type === 'hierarchy') {
        setHierarchyMutation.mutate({ hierarchyId: node.id, policy })
      } else {
        setCharacteristicMutation.mutate({ charId: node.id, policy })
      }
    },
    [setHierarchyMutation, setCharacteristicMutation],
  )

  const handleClearOverride = useCallback(
    (node: SelectedNode) => {
      if (node.type === 'hierarchy') {
        deleteHierarchyMutation.mutate(node.id)
      } else {
        deleteCharacteristicMutation.mutate(node.id)
      }
    },
    [deleteHierarchyMutation, deleteCharacteristicMutation],
  )

  const isSavingOverride =
    setHierarchyMutation.isPending ||
    deleteHierarchyMutation.isPending ||
    setCharacteristicMutation.isPending ||
    deleteCharacteristicMutation.isPending

  if (!selectedPlant) {
    return (
      <div className="text-muted-foreground flex h-64 items-center justify-center text-sm">
        Select a site to manage retention policies.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Pill Sub-Navigation */}
      <div className="flex gap-1.5">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              subTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Policy Sub-Tab */}
      {subTab === 'policy' && (
        <>
          {/* Global Default Card */}
          <div className="bg-muted rounded-xl p-6">
            <div className="mb-4 flex items-center gap-2">
              <Archive className="text-muted-foreground h-5 w-5" />
              <h3 className="font-semibold">Plant-Wide Default Policy</h3>
            </div>

            {!isEditingDefault ? (
              <>
                {defaultLoading ? (
                  <div className="text-muted-foreground text-sm">Loading...</div>
                ) : (
                  <>
                    <p className="text-muted-foreground mb-3 text-sm">Current policy:</p>
                    <div className="bg-card border-border mb-4 rounded-lg border p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <PolicyIcon className="text-muted-foreground h-4 w-4" />
                        <span className="text-sm font-medium">
                          {formatRetentionPolicy(effectiveType, effectiveValue, effectiveUnit)}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {formatRetentionDescription(effectiveType, effectiveValue, effectiveUnit)}
                      </p>
                    </div>
                    <button
                      onClick={() => setIsEditingDefault(true)}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-4 py-2 text-sm font-medium"
                    >
                      Edit Default Policy
                    </button>
                  </>
                )}
              </>
            ) : (
              <RetentionPolicyForm
                initialPolicy={
                  globalDefault
                    ? {
                        retention_type: globalDefault.retention_type,
                        retention_value: globalDefault.retention_value,
                        retention_unit: globalDefault.retention_unit,
                      }
                    : undefined
                }
                onSubmit={handleSaveDefault}
                onCancel={() => setIsEditingDefault(false)}
                submitLabel="Save Default Policy"
                isSubmitting={setDefaultMutation.isPending}
              />
            )}
          </div>

          {/* Explainer Card */}
          <div className="bg-muted rounded-xl p-6">
            <div className="mb-3 flex items-center gap-2">
              <Info className="text-muted-foreground h-5 w-5" />
              <h3 className="font-semibold">How Retention Works</h3>
            </div>
            <div className="text-muted-foreground space-y-2 text-sm">
              <p>
                Retention policies control when old samples and violations are permanently deleted.
                Policies follow an inheritance model:
              </p>
              <ol className="list-inside list-decimal space-y-1">
                <li>Each characteristic checks for its own override</li>
                <li>If none, it walks up the hierarchy tree</li>
                <li>If no override found, the plant-wide default applies</li>
              </ol>
              <p>
                Purging runs automatically on a schedule. Purged data cannot be recovered -- ensure
                backups are configured first.
              </p>
            </div>
          </div>
        </>
      )}

      {/* Overrides Sub-Tab */}
      {subTab === 'overrides' && (
        <>
          {/* Override Summary Bar */}
          <div className="bg-muted rounded-xl px-5 py-3">
            {overridesLoading ? (
              <span className="text-muted-foreground text-sm">Loading overrides...</span>
            ) : overrides.length === 0 ? (
              <span className="text-muted-foreground text-sm">
                No active overrides. All data is retained
                {effectiveType === 'forever'
                  ? ' indefinitely'
                  : ` per the plant default (${formatRetentionPolicy(effectiveType, effectiveValue, effectiveUnit)})`}
                .
              </span>
            ) : (
              <span className="text-muted-foreground text-sm">
                <strong className="text-foreground">{overrides.length}</strong> active override
                {overrides.length !== 1 ? 's' : ''}
                {hierarchyOverrides.length > 0 && (
                  <>
                    {' '}
                    across <strong className="text-foreground">
                      {hierarchyOverrides.length}
                    </strong>{' '}
                    hierarchy level{hierarchyOverrides.length !== 1 ? 's' : ''}
                  </>
                )}
                {charOverrides.length > 0 && (
                  <>
                    {' '}
                    and <strong className="text-foreground">{charOverrides.length}</strong>{' '}
                    characteristic{charOverrides.length !== 1 ? 's' : ''}
                  </>
                )}
              </span>
            )}
          </div>

          {/* Split Layout: Tree + Detail Panel */}
          <div className="flex min-h-[500px] gap-4">
            {/* Tree Panel */}
            <div className="border-border bg-card w-64 shrink-0 overflow-y-auto rounded-xl border">
              <RetentionTreeBrowser
                plantId={plantId}
                overrides={overrides}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
              />
            </div>

            {/* Detail Panel */}
            <div className="border-border bg-card flex-1 overflow-y-auto rounded-xl border">
              <RetentionOverridePanel
                selectedNode={selectedNode}
                overrides={overrides}
                globalDefault={globalDefault ?? null}
                onSetOverride={handleSetOverride}
                onClearOverride={handleClearOverride}
                isSaving={isSavingOverride}
              />
            </div>
          </div>
        </>
      )}

      {/* Activity Sub-Tab */}
      {subTab === 'activity' && <PurgeActivityPanel plantId={plantId} />}

      {/* Default Policy Confirmation Dialog — shared across tabs */}
      {showDefaultConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowDefaultConfirm(null)}
        >
          <div
            className="bg-card border-border mx-4 w-full max-w-md rounded-2xl border p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold">Change Default Policy</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              Change the plant-wide default retention policy to{' '}
              <strong>
                {formatRetentionPolicy(
                  showDefaultConfirm.retention_type,
                  showDefaultConfirm.retention_value ?? null,
                  showDefaultConfirm.retention_unit ?? null,
                )}
              </strong>
              ? This affects all characteristics that don't have a specific override.
              {showDefaultConfirm.retention_type !== 'forever' && (
                <> Records exceeding the new policy will be purged on the next scheduled run.</>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDefaultConfirm(null)}
                className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-5 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveDefault}
                disabled={setDefaultMutation.isPending}
                className={cn(
                  'rounded-xl px-5 py-2.5 text-sm font-medium',
                  setDefaultMutation.isPending
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                {setDefaultMutation.isPending ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Purge Activity Panel
// ------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHrs = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHrs < 24) return `${diffHrs}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function formatCountdown(dateStr: string): string {
  const target = new Date(dateStr)
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()

  if (diffMs <= 0) return 'overdue'
  const diffHrs = Math.floor(diffMs / 3_600_000)
  const diffMin = Math.floor((diffMs % 3_600_000) / 60_000)

  if (diffHrs > 0) return `${diffHrs}h ${diffMin}m`
  return `${diffMin}m`
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="text-success h-4 w-4" />
    case 'failed':
      return <XCircle className="text-destructive h-4 w-4" />
    case 'running':
      return <Loader2 className="text-primary h-4 w-4 animate-spin" />
    default:
      return <Clock className="text-muted-foreground h-4 w-4" />
  }
}

function PurgeActivityPanel({ plantId }: { plantId: number }) {
  const { user } = useAuth()
  const { data: activity = [], isLoading: activityLoading } = useRetentionActivity(plantId)
  const { data: nextPurge, isLoading: nextLoading } = useNextPurge(plantId)
  const triggerMutation = useTriggerPurge()
  const [showConfirm, setShowConfirm] = useState(false)

  const isAdmin = user?.plant_roles?.some((pr) => pr.plant_id === plantId && pr.role === 'admin')

  const handleTrigger = useCallback(() => {
    triggerMutation.mutate(plantId, {
      onSuccess: () => setShowConfirm(false),
      onError: () => setShowConfirm(false),
    })
  }, [plantId, triggerMutation])

  return (
    <div className="space-y-5">
      {/* Next Scheduled Purge Card */}
      <div className="bg-muted rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="text-muted-foreground h-5 w-5" />
            <h3 className="font-semibold">Next Scheduled Purge</h3>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={triggerMutation.isPending}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium',
                triggerMutation.isPending
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {triggerMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {triggerMutation.isPending ? 'Running...' : 'Run Now'}
            </button>
          )}
        </div>

        {nextLoading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : nextPurge ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border-border rounded-lg border p-3">
              <p className="text-muted-foreground mb-1 text-xs">Next run</p>
              <p className="text-sm font-medium">
                {nextPurge.next_run_at ? formatCountdown(nextPurge.next_run_at) : 'No runs yet'}
              </p>
            </div>
            <div className="bg-card border-border rounded-lg border p-3">
              <p className="text-muted-foreground mb-1 text-xs">Interval</p>
              <p className="text-sm font-medium">{nextPurge.interval_hours}h</p>
            </div>
            <div className="bg-card border-border rounded-lg border p-3">
              <p className="text-muted-foreground mb-1 text-xs">Last run</p>
              <p className="text-sm font-medium">
                {nextPurge.last_run ? formatRelativeTime(nextPurge.last_run.started_at) : 'Never'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No purge schedule information available.</p>
        )}
      </div>

      {/* Purge History Table */}
      <div className="bg-muted rounded-xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="text-muted-foreground h-5 w-5" />
          <h3 className="font-semibold">Purge History</h3>
        </div>

        {activityLoading ? (
          <div className="text-muted-foreground text-sm">Loading history...</div>
        ) : activity.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No purge runs yet. The engine runs automatically every {nextPurge?.interval_hours ?? 24}{' '}
            hours, or you can trigger one manually.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b text-left">
                  <th className="text-muted-foreground pb-2 font-medium">Status</th>
                  <th className="text-muted-foreground pb-2 font-medium">Started</th>
                  <th className="text-muted-foreground pb-2 text-right font-medium">Samples</th>
                  <th className="text-muted-foreground pb-2 text-right font-medium">Violations</th>
                  <th className="text-muted-foreground pb-2 text-right font-medium">Chars</th>
                  <th className="text-muted-foreground pb-2 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((run: PurgeHistory) => (
                  <PurgeHistoryRow key={run.id} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Purge Confirmation Dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-card border-border mx-4 w-full max-w-md rounded-2xl border p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold">Run Purge Now</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              This will immediately evaluate all retention policies and permanently delete expired
              samples for this plant. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-5 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleTrigger}
                disabled={triggerMutation.isPending}
                className={cn(
                  'rounded-xl px-5 py-2.5 text-sm font-medium',
                  triggerMutation.isPending
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                )}
              >
                {triggerMutation.isPending ? 'Running...' : 'Confirm Purge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PurgeHistoryRow({ run }: { run: PurgeHistory }) {
  const duration = run.completed_at
    ? `${Math.max(1, Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000))}s`
    : run.status === 'running'
      ? '...'
      : '-'

  return (
    <tr className="border-border/50 border-b last:border-0">
      <td className="py-2">
        <div className="flex items-center gap-1.5">
          <StatusIcon status={run.status} />
          <span
            className={cn(
              'text-xs font-medium capitalize',
              run.status === 'completed' && 'text-success',
              run.status === 'failed' && 'text-destructive',
              run.status === 'running' && 'text-primary',
            )}
          >
            {run.status}
          </span>
        </div>
        {run.error_message && (
          <p
            className="text-destructive mt-0.5 max-w-[200px] truncate text-xs"
            title={run.error_message}
          >
            {run.error_message}
          </p>
        )}
      </td>
      <td className="text-muted-foreground py-2">{formatRelativeTime(run.started_at)}</td>
      <td className="py-2 text-right font-mono">{run.samples_deleted.toLocaleString()}</td>
      <td className="py-2 text-right font-mono">{run.violations_deleted.toLocaleString()}</td>
      <td className="py-2 text-right font-mono">
        {run.characteristics_processed.toLocaleString()}
      </td>
      <td className="text-muted-foreground py-2">{duration}</td>
    </tr>
  )
}
