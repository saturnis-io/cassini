import { useState } from 'react'
import { Tag, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMeanings, useCreateMeaning, useUpdateMeaning, useDeleteMeaning } from '@/api/hooks'
import type { SignatureMeaning } from '@/types/signature'

interface MeaningFormData {
  code: string
  display_name: string
  description: string | null
  requires_comment: boolean
  is_active: boolean
  sort_order: number
}

function MeaningForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: SignatureMeaning
  onSubmit: (data: MeaningFormData) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [requiresComment, setRequiresComment] = useState(initial?.requires_comment ?? false)
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0)

  const canSubmit = code.trim().length > 0 && displayName.trim().length > 0 && !isPending

  return (
    <div className="bg-muted/50 space-y-3 rounded-lg p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">
            Code (unique identifier)
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            placeholder="e.g., approved"
            disabled={!!initial}
            className={cn(
              'bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none',
              initial && 'cursor-not-allowed opacity-60',
            )}
          />
        </div>
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">Display Name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., Approved for Production"
            className="bg-background border-input focus:ring-ring w-full rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="text-foreground mb-1 block text-xs font-medium">
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What does this meaning represent?"
          className="bg-background border-input focus:ring-ring w-full resize-none rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">Sort Order</label>
          <input
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="bg-background border-input focus:ring-ring w-24 rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={requiresComment}
              onChange={(e) => setRequiresComment(e.target.checked)}
              className="accent-primary h-3.5 w-3.5 rounded"
            />
            Require comment when used
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-primary h-3.5 w-3.5 rounded"
            />
            Active
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="border-border bg-secondary hover:bg-secondary/80 rounded-lg border px-3 py-1.5 text-xs font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              code: code.trim(),
              display_name: displayName.trim(),
              description: description.trim() || null,
              requires_comment: requiresComment,
              is_active: isActive,
              sort_order: sortOrder,
            })
          }
          disabled={!canSubmit}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium',
            canSubmit
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {isPending ? 'Saving...' : initial ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  )
}

export function MeaningManager() {
  const { data: meanings, isLoading } = useMeanings()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const createMutation = useCreateMeaning()
  const updateMutation = useUpdateMeaning()
  const deleteMutation = useDeleteMeaning()

  const sortedMeanings = [...(meanings ?? [])].sort(
    (a: SignatureMeaning, b: SignatureMeaning) => a.sort_order - b.sort_order,
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="text-primary h-5 w-5" />
          <h3 className="text-foreground text-base font-semibold">Signature Meanings</h3>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          New Meaning
        </button>
      </div>

      <p className="text-muted-foreground text-xs">
        Signature meanings define the purpose of each electronic signature per 21 CFR Part 11
        Section 11.50. Each signature must convey its meaning (e.g., approved, reviewed, rejected).
      </p>

      {showCreate && (
        <MeaningForm
          onSubmit={(data) => {
            createMutation.mutate(data, { onSuccess: () => setShowCreate(false) })
          }}
          onCancel={() => setShowCreate(false)}
          isPending={createMutation.isPending}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      )}

      {!isLoading && sortedMeanings.length === 0 && !showCreate && (
        <div className="text-muted-foreground py-8 text-center text-sm">
          No meanings configured. Default meanings are seeded when a plant is created.
        </div>
      )}

      <div className="space-y-2">
        {sortedMeanings.map((m: SignatureMeaning) => (
          <div key={m.id}>
            {editingId === m.id ? (
              <MeaningForm
                initial={m}
                onSubmit={(data) => {
                  updateMutation.mutate(
                    { id: m.id, data },
                    { onSuccess: () => setEditingId(null) },
                  )
                }}
                onCancel={() => setEditingId(null)}
                isPending={updateMutation.isPending}
              />
            ) : (
              <div className="border-border flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="bg-muted rounded px-1.5 py-0.5 text-xs font-mono">
                      {m.code}
                    </code>
                    <span className="text-foreground text-sm font-medium">{m.display_name}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        m.is_active
                          ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {m.requires_comment && (
                      <span className="bg-blue-500/10 rounded-full px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
                        Comment required
                      </span>
                    )}
                  </div>
                  {m.description && (
                    <p className="text-muted-foreground mt-0.5 text-xs">{m.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(m.id)}
                    className="text-muted-foreground hover:text-foreground rounded-lg p-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (m.is_active) {
                        // Soft delete: set inactive
                        updateMutation.mutate({ id: m.id, data: { is_active: false } })
                      } else {
                        // Already inactive, hard delete
                        if (confirm('Permanently delete this meaning?')) {
                          deleteMutation.mutate(m.id)
                        }
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="text-muted-foreground hover:text-destructive rounded-lg p-1.5"
                    title={m.is_active ? 'Deactivate' : 'Delete permanently'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
