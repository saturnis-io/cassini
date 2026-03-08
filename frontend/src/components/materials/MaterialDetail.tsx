import { useState } from 'react'
import { Pencil, Trash2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import {
  useUpdateMaterial,
  useDeleteMaterial,
  useMaterialUsage,
} from '@/api/hooks/materials'
import type { Material } from '@/types'

// ─── Shared style helpers ────────────────────────────────────────────

function fieldClasses() {
  return 'bg-muted text-foreground border-border w-full rounded-md border px-3 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none'
}

function labelClasses() {
  return 'text-muted-foreground text-xs font-medium uppercase tracking-wider'
}

// ─── Props ───────────────────────────────────────────────────────────

interface MaterialDetailProps {
  plantId: number
  material: Material
}

// ─── Component ───────────────────────────────────────────────────────

export function MaterialDetail({ plantId, material }: MaterialDetailProps) {
  const setSelectedMaterialId = useConfigStore((s) => s.setSelectedMaterialId)
  const setSelectedMaterialClassId = useConfigStore((s) => s.setSelectedMaterialClassId)
  const setConfigView = useConfigStore((s) => s.setConfigView)
  const setEditingCharacteristicId = useConfigStore((s) => s.setEditingCharacteristicId)

  // Edit mode
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(material.name)
  const [code, setCode] = useState(material.code)
  const [description, setDescription] = useState(material.description ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateMutation = useUpdateMaterial(plantId)
  const deleteMutation = useDeleteMaterial(plantId)
  const { data: usage = [] } = useMaterialUsage(plantId, material.id)

  // Reset form when material changes
  const [prevId, setPrevId] = useState(material.id)
  if (material.id !== prevId) {
    setPrevId(material.id)
    setIsEditing(false)
    setName(material.name)
    setCode(material.code)
    setDescription(material.description ?? '')
    setConfirmDelete(false)
  }

  const handleStartEdit = () => {
    setIsEditing(true)
    setName(material.name)
    setCode(material.code)
    setDescription(material.description ?? '')
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setName(material.name)
    setCode(material.code)
    setDescription(material.description ?? '')
  }

  const handleSave = () => {
    updateMutation.mutate(
      {
        materialId: material.id,
        data: {
          name: name.trim(),
          code: code.trim().toUpperCase(),
          description: description.trim() || null,
        },
      },
      { onSuccess: () => setIsEditing(false) },
    )
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteMutation.mutate(material.id, {
      onSuccess: () => setSelectedMaterialId(null),
    })
  }

  const handleClassClick = () => {
    if (material.class_id) {
      setSelectedMaterialClassId(material.class_id)
    }
  }

  const handleUsageClick = (charId: number) => {
    setConfigView('characteristics')
    setEditingCharacteristicId(charId)
  }

  // Parse properties for display
  const properties = material.properties
    ? Object.entries(material.properties)
    : []

  return (
    <div className="space-y-6 p-6">
      {/* ── Details ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {isEditing ? 'Edit Material' : material.name}
          </h3>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                onClick={handleStartEdit}
                className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
            {!isEditing && (
              <>
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                    confirmDelete
                      ? 'bg-destructive text-destructive-foreground'
                      : 'text-destructive hover:bg-destructive/10',
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {confirmDelete ? 'Confirm Delete' : 'Delete'}
                </button>
                {confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-muted-foreground text-sm hover:underline"
                  >
                    Cancel
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Class breadcrumb */}
        {material.class_path && (
          <button
            onClick={handleClassClick}
            className="text-muted-foreground hover:text-primary mb-4 flex items-center gap-1 text-xs transition-colors"
          >
            {material.class_path.split('/').map((segment, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <span>{segment}</span>
              </span>
            ))}
          </button>
        )}

        {isEditing ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className={labelClasses()}>Name</label>
              <input
                className={fieldClasses()}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClasses()}>Code</label>
              <input
                className={fieldClasses()}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onBlur={() => setCode((c) => c.toUpperCase())}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClasses()}>Description</label>
              <textarea
                className={fieldClasses()}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancelEdit}
                className="text-muted-foreground hover:text-foreground rounded-md px-4 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <span className={labelClasses()}>Code</span>
              <p className="text-sm">{material.code}</p>
            </div>
            {material.class_name && (
              <div>
                <span className={labelClasses()}>Class</span>
                <p className="text-sm">{material.class_name}</p>
              </div>
            )}
            {material.description && (
              <div>
                <span className={labelClasses()}>Description</span>
                <p className="text-sm">{material.description}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Properties ── */}
      {properties.length > 0 && (
        <section className="border-border border-t pt-4">
          <h4 className="mb-3 text-sm font-semibold">Properties</h4>
          <div className="space-y-1">
            {properties.map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded px-3 py-1.5"
              >
                <span className="text-muted-foreground text-sm">{key}</span>
                <span className="text-sm">{String(value)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Used By ── */}
      <section className="border-border border-t pt-4">
        <div className="mb-3 flex items-center gap-2">
          <h4 className="text-sm font-semibold">Used By</h4>
          <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium">
            {usage.length}
          </span>
        </div>

        {usage.length > 0 ? (
          <div className="space-y-1">
            {usage.map((item) => (
              <button
                key={item.characteristic_id}
                onClick={() => handleUsageClick(item.characteristic_id)}
                className="hover:bg-muted flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition-colors"
              >
                <span className="text-muted-foreground truncate text-xs">
                  {item.hierarchy_path ?? item.name}
                </span>
                {item.hierarchy_path && (
                  <span className="text-foreground shrink-0 text-sm">{item.name}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No characteristics reference this material
          </p>
        )}

        {usage.length > 0 && confirmDelete && (
          <p className="text-warning mt-2 text-xs font-medium">
            Warning: This material is referenced by {usage.length} characteristic
            {usage.length !== 1 ? 's' : ''}. Deleting it may affect overrides.
          </p>
        )}
      </section>
    </div>
  )
}
