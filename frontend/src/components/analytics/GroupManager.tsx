import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  Loader2,
  Users,
  Check,
  ChevronDown,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { characteristicApi } from '@/api/client'
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
          <h3 className="text-foreground text-sm font-semibold">Multivariate Groups</h3>
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
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groupList.map((group) => (
            <div
              key={group.id}
              onClick={() => onSelectGroup(group.id)}
              className={cn(
                'cursor-pointer rounded-lg border p-4 transition-colors',
                selectedGroupId === group.id
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30',
              )}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h4 className="text-foreground truncate text-sm font-medium">{group.name}</h4>
                  {group.description && (
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {group.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteConfirmId(group.id)
                  }}
                  className="text-muted-foreground hover:text-destructive ml-2 shrink-0 rounded p-1 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {group.characteristic_ids?.length ?? 0} chars
                </span>
                <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
                  {group.chart_type ?? 't2'}
                </span>
                {group.phase && (
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-medium',
                      group.phase === 'phase_ii'
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-blue-500/10 text-blue-600',
                    )}
                  >
                    {group.phase === 'phase_i' ? 'Phase I' : 'Phase II'}
                  </span>
                )}
              </div>
            </div>
          ))}
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
  const [chartType, setChartType] = useState('t2')
  const [selectedCharIds, setSelectedCharIds] = useState<number[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

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

  const toggleChar = (id: number) => {
    setSelectedCharIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

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
            <label className="text-foreground mb-1.5 block text-sm font-medium">Chart Type</label>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
              className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="t2">Hotelling T{'\u00B2'}</option>
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

            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen(!pickerOpen)}
                className={cn(
                  'bg-background border-border flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm',
                  selectedCharIds.length === 0 && 'text-muted-foreground',
                )}
              >
                <span className="truncate">
                  {selectedCharIds.length === 0
                    ? 'Select at least 2 characteristics...'
                    : selectedCharIds.map((id) => charNameMap.get(id)).filter(Boolean).join(', ')}
                </span>
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 transition-transform', pickerOpen && 'rotate-180')}
                />
              </button>

              {pickerOpen && (
                <div className="bg-popover border-border absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border shadow-lg">
                  {characteristics.length === 0 ? (
                    <p className="text-muted-foreground px-3 py-4 text-center text-sm">
                      No characteristics found
                    </p>
                  ) : (
                    <div className="p-1">
                      {characteristics.map((c) => {
                        const isSelected = selectedCharIds.includes(c.id)
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleChar(c.id)}
                            className={cn(
                              'flex w-full items-center gap-2.5 rounded px-3 py-1.5 text-left text-sm',
                              isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                            )}
                          >
                            <div
                              className={cn(
                                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                isSelected
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-border',
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3" />}
                            </div>
                            <span className="truncate">{c.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selection tags */}
            {selectedCharIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedCharIds.map((id) => (
                  <span
                    key={id}
                    className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  >
                    {charNameMap.get(id)}
                    <button type="button" onClick={() => toggleChar(id)} className="hover:text-primary/70">
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
