import { useState } from 'react'
import { Pencil, Trash2, Package, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import {
  useUpdateMaterialClass,
  useDeleteMaterialClass,
  useCreateMaterial,
  useMaterialClassUsage,
} from '@/api/hooks/materials'
import type { MaterialClass, Material } from '@/types'

// ─── Shared style helpers ────────────────────────────────────────────

function fieldClasses() {
  return 'bg-muted text-foreground border-border w-full rounded-md border px-3 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none'
}

function labelClasses() {
  return 'text-muted-foreground text-xs font-medium uppercase tracking-wider'
}

// ─── Props ───────────────────────────────────────────────────────────

interface MaterialClassDetailProps {
  plantId: number
  classItem: MaterialClass
  classes: MaterialClass[]
  materials: Material[]
}

// ─── Component ───────────────────────────────────────────────────────

export function MaterialClassDetail({
  plantId,
  classItem,
  classes,
  materials,
}: MaterialClassDetailProps) {
  const setSelectedMaterialId = useConfigStore((s) => s.setSelectedMaterialId)
  const setSelectedMaterialClassId = useConfigStore((s) => s.setSelectedMaterialClassId)
  const setConfigView = useConfigStore((s) => s.setConfigView)
  const setEditingCharacteristicId = useConfigStore((s) => s.setEditingCharacteristicId)

  // Edit mode
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(classItem.name)
  const [code, setCode] = useState(classItem.code)
  const [description, setDescription] = useState(classItem.description ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Quick-add material
  const [quickName, setQuickName] = useState('')
  const [quickCode, setQuickCode] = useState('')

  const updateMutation = useUpdateMaterialClass(plantId)
  const deleteMutation = useDeleteMaterialClass(plantId)
  const createMaterialMutation = useCreateMaterial(plantId)
  const { data: usage = [] } = useMaterialClassUsage(plantId, classItem.id)

  // Reset form when class changes
  const [prevId, setPrevId] = useState(classItem.id)
  if (classItem.id !== prevId) {
    setPrevId(classItem.id)
    setIsEditing(false)
    setName(classItem.name)
    setCode(classItem.code)
    setDescription(classItem.description ?? '')
    setConfirmDelete(false)
    setQuickName('')
    setQuickCode('')
  }

  // Materials in this class
  const classMaterials = materials.filter((m) => m.class_id === classItem.id)

  // Parent path breadcrumb
  const parentPath = buildClassPath(classItem, classes)

  const handleStartEdit = () => {
    setIsEditing(true)
    setName(classItem.name)
    setCode(classItem.code)
    setDescription(classItem.description ?? '')
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setName(classItem.name)
    setCode(classItem.code)
    setDescription(classItem.description ?? '')
  }

  const handleSave = () => {
    updateMutation.mutate(
      {
        classId: classItem.id,
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
    deleteMutation.mutate(classItem.id, {
      onSuccess: () => setSelectedMaterialClassId(null),
    })
  }

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickName.trim() || !quickCode.trim()) return
    createMaterialMutation.mutate(
      {
        name: quickName.trim(),
        code: quickCode.trim().toUpperCase(),
        class_id: classItem.id,
      },
      {
        onSuccess: () => {
          setQuickName('')
          setQuickCode('')
        },
      },
    )
  }

  const handleUsageClick = (charId: number) => {
    setConfigView('characteristics')
    setEditingCharacteristicId(charId)
  }

  return (
    <div className="space-y-6 p-6">
      {/* ── Section 1: Details ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {isEditing ? 'Edit Class' : classItem.name}
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

        {/* Parent path */}
        {parentPath && (
          <div className="text-muted-foreground mb-4 flex items-center gap-1 text-xs">
            {parentPath.map((segment, i) => (
              <span key={segment.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <span>{segment.name}</span>
              </span>
            ))}
          </div>
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
              <p className="text-sm">{classItem.code}</p>
            </div>
            {classItem.description && (
              <div>
                <span className={labelClasses()}>Description</span>
                <p className="text-sm">{classItem.description}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Section 2: Materials ── */}
      <section className="border-border border-t pt-4">
        <div className="mb-3 flex items-center gap-2">
          <h4 className="text-sm font-semibold">Materials</h4>
          <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium">
            {classMaterials.length}
          </span>
        </div>

        {classMaterials.length > 0 && (
          <div className="mb-3 space-y-1">
            {classMaterials.map((mat) => (
              <button
                key={mat.id}
                onClick={() => setSelectedMaterialId(mat.id)}
                className="hover:bg-muted flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition-colors"
              >
                <Package className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{mat.name}</span>
                <span className="text-muted-foreground text-xs">{mat.code}</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick-add row */}
        <form onSubmit={handleQuickAdd} className="flex items-center gap-2">
          <input
            className={cn(fieldClasses(), 'flex-1')}
            placeholder="Material name"
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
          />
          <input
            className={cn(fieldClasses(), 'w-24')}
            placeholder="Code"
            value={quickCode}
            onChange={(e) => setQuickCode(e.target.value)}
            onBlur={() => setQuickCode((c) => c.toUpperCase())}
          />
          <button
            type="submit"
            disabled={createMaterialMutation.isPending || !quickName.trim() || !quickCode.trim()}
            className="bg-primary text-primary-foreground shrink-0 rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {createMaterialMutation.isPending ? '...' : 'Add'}
          </button>
        </form>
      </section>

      {/* ── Section 3: Used By ── */}
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
            No characteristics reference this class
          </p>
        )}
      </section>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function buildClassPath(
  classItem: MaterialClass,
  classes: MaterialClass[],
): { id: number; name: string }[] | null {
  if (!classItem.parent_id) return null

  const classMap = new Map(classes.map((c) => [c.id, c]))
  const path: { id: number; name: string }[] = []
  let current = classMap.get(classItem.parent_id)
  while (current) {
    path.unshift({ id: current.id, name: current.name })
    current = current.parent_id ? classMap.get(current.parent_id) : undefined
  }
  return path.length > 0 ? path : null
}
