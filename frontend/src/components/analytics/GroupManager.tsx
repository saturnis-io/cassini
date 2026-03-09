import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  Loader2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { characteristicApi } from '@/api/client'
import { HierarchyMultiSelector } from '@/components/HierarchyMultiSelector'
import { HelpTooltip } from '@/components/HelpTooltip'
import {
  useMultivariateGroups,
  useCreateMultivariateGroup,
  useDeleteMultivariateGroup,
} from '@/api/hooks'

interface GroupManagerProps {
  plantId: number
  selectedGroupId: number | null
  onSelectGroup: (id: number | null) => void
}

/**
 * GroupManager — CRUD for multivariate groups.
 *
 * Shows a list of existing groups as cards, a "Create Group" dialog,
 * and delete with confirmation.
 */
export function GroupManager({ plantId, selectedGroupId, onSelectGroup }: GroupManagerProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const { data: groups, isLoading } = useMultivariateGroups(plantId)
  const deleteMutation = useDeleteMultivariateGroup()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupList = (groups as any[]) ?? []

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setDeleteConfirmId(null)
        if (selectedGroupId === id) onSelectGroup(null)
      },
    })
  }

  return (
    <div className="bg-card border-border rounded-lg border p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Multivariate Groups
            <HelpTooltip helpKey="multivariate-groups" />
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Define groups of correlated characteristics for T{'\u00B2'} monitoring
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Group
        </button>
      </div>

      {/* Group cards */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading groups...
        </div>
      ) : groupList.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No multivariate groups yet. Create one to get started.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {groupList.map((group) => {
            const members = group.members ?? []
            const memberInfo = members
              .map((m: { characteristic_name?: string; hierarchy_path?: string }) => ({
                name: m.characteristic_name ?? '',
                path: m.hierarchy_path ?? '',
              }))
              .filter((m: { name: string; path: string }) => m.name)

            return (
              <div
                key={group.id}
                onClick={() => onSelectGroup(group.id)}
                className={cn(
                  'cursor-pointer rounded-lg border px-3 py-2.5 transition-colors',
                  selectedGroupId === group.id
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/50 hover:bg-muted/30',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-foreground truncate text-sm font-medium">{group.name}</h4>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
                      {group.chart_type === 'mewma' ? 'MEWMA' : 'T\u00B2'}
                    </span>
                    {group.phase && (
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-medium',
                          group.phase === 'phase_ii'
                            ? 'bg-success/10 text-success'
                            : 'bg-primary/10 text-primary',
                        )}
                      >
                        {group.phase === 'phase_i' ? 'Phase I' : 'Phase II'}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteConfirmId(group.id)
                      }}
                      className="text-muted-foreground hover:text-destructive rounded p-0.5 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Inline params + member count */}
                <div className="text-muted-foreground mt-1 flex items-center gap-3 text-[11px]">
                  <span>
                    {group.chart_type === 'mewma' ? '\u03BB' : '\u03B1'}{' '}
                    <span className="text-foreground font-medium">
                      {group.chart_type === 'mewma' ? group.lambda_param : group.alpha}
                    </span>
                  </span>
                  <span>
                    Min{' '}
                    <span className="text-foreground font-medium">{group.min_samples ?? 100}</span>
                  </span>
                  {memberInfo.length > 0 && (
                    <span className="text-muted-foreground/70">
                      {memberInfo.length} char{memberInfo.length !== 1 && 's'}
                    </span>
                  )}
                </div>

                {/* Member names — compact inline list */}
                {memberInfo.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {memberInfo.map((m: { name: string; path: string }, i: number) => (
                      <span
                        key={i}
                        title={m.path || m.name}
                        className="bg-muted text-muted-foreground cursor-default rounded px-1.5 py-0.5 text-[10px]"
                      >
                        {m.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmId != null && (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-card border-border w-full max-w-sm rounded-lg border p-6 shadow-lg">
            <h3 className="text-foreground text-base font-semibold">Delete Group</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              Are you sure you want to delete this multivariate group? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="border-border text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                {deleteMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <CreateGroupDialog
          plantId={plantId}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// Create Group Dialog
// -----------------------------------------------------------------------

function CreateGroupDialog({
  plantId,
  onClose,
}: {
  plantId: number
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [chartType, setChartType] = useState('t_squared')
  const [selectedCharIds, setSelectedCharIds] = useState<number[]>([])

  const createMutation = useCreateMultivariateGroup()

  // Fetch characteristics
  const { data: charData } = useQuery({
    queryKey: ['characteristics-for-mv-group', plantId],
    queryFn: () => characteristicApi.list({ per_page: 500, plant_id: plantId }),
    enabled: plantId > 0,
  })
  const characteristics = charData?.items ?? []

  const charNameMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of characteristics) map.set(c.id, c.name)
    return map
  }, [characteristics])

  const handleCreate = () => {
    if (!name.trim() || selectedCharIds.length < 2) return
    createMutation.mutate(
      {
        name: name.trim(),
        plant_id: plantId,
        characteristic_ids: selectedCharIds,
        chart_type: chartType,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => onClose(),
      },
    )
  }

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-card border-border w-full max-w-lg rounded-lg border p-6 shadow-lg">
        <h3 className="text-foreground text-base font-semibold">Create Multivariate Group</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Group correlated characteristics for T{'\u00B2'} monitoring
        </p>

        <div className="mt-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Bearing Assembly Dimensions"
              className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this group"
              className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Chart type */}
          <div>
            <label className="text-foreground mb-1.5 flex items-center gap-2 text-sm font-medium">
              Chart Type
              <HelpTooltip helpKey={chartType === 'mewma' ? 'chart-type-mewma' : 'hotelling-t2'} />
            </label>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
              className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="t_squared">Hotelling T{'\u00B2'}</option>
              <option value="mewma">MEWMA</option>
            </select>
          </div>

          {/* Characteristics multi-select */}
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">
              Characteristics
              {selectedCharIds.length > 0 && (
                <span className="text-muted-foreground ml-2 font-normal">
                  ({selectedCharIds.length} selected)
                </span>
              )}
            </label>

            <HierarchyMultiSelector
              selectedIds={selectedCharIds}
              onSelectionChange={setSelectedCharIds}
              plantId={plantId}
              className="border-border max-h-48 rounded-lg border"
            />

            {/* Selection tags */}
            {selectedCharIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedCharIds.map((id) => (
                  <span
                    key={id}
                    className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  >
                    {charNameMap.get(id)}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedCharIds((prev) => prev.filter((x) => x !== id))
                      }
                      className="hover:text-primary/70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="border-border text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || selectedCharIds.length < 2 || createMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
          >
            {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create Group
          </button>
        </div>
      </div>
    </div>
  )
}
