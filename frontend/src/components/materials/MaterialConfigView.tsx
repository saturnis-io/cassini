import { useState, useMemo } from 'react'
import { Plus, Search, Package, FolderOpen } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import {
  useMaterialClasses,
  useMaterials,
  useCreateMaterialClass,
  useCreateMaterial,
} from '@/api/hooks/materials'
import { MaterialTree } from '@/components/materials/MaterialTree'
import { MaterialClassDetail } from '@/components/materials/MaterialClassDetail'
import { MaterialDetail } from '@/components/materials/MaterialDetail'
import type { MaterialClass } from '@/types'

// ─── Shared style helpers ────────────────────────────────────────────

function fieldClasses() {
  return 'bg-muted text-foreground border-border w-full rounded-md border px-3 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none'
}

function labelClasses() {
  return 'text-muted-foreground text-xs font-medium uppercase tracking-wider'
}

// ─── Props ───────────────────────────────────────────────────────────

interface MaterialConfigViewProps {
  plantId: number
}

// ─── Component ───────────────────────────────────────────────────────

export function MaterialConfigView({ plantId }: MaterialConfigViewProps) {
  const [search, setSearch] = useState('')

  const selectedClassId = useConfigStore((s) => s.selectedMaterialClassId)
  const selectedMaterialId = useConfigStore((s) => s.selectedMaterialId)
  const materialFormMode = useConfigStore((s) => s.materialFormMode)
  const materialFormParentId = useConfigStore((s) => s.materialFormParentId)
  const setMaterialFormMode = useConfigStore((s) => s.setMaterialFormMode)

  const { data: classes = [] } = useMaterialClasses(plantId)
  const { data: materials = [] } = useMaterials(plantId)

  // Resolve selected items from data
  const selectedClass = useMemo(
    () => (selectedClassId ? classes.find((c) => c.id === selectedClassId) : undefined),
    [classes, selectedClassId],
  )

  const selectedMaterial = useMemo(
    () =>
      selectedMaterialId
        ? materials.find((m) => m.id === selectedMaterialId)
        : undefined,
    [materials, selectedMaterialId],
  )

  return (
    <div data-ui="material-config-view" className="flex min-h-0 flex-1 gap-6">
      {/* ── Left panel: Tree ── */}
      <div className="bg-card w-80 flex-shrink-0 overflow-auto rounded-lg border">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">Materials</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMaterialFormMode('add-class', null)}
              className="hover:bg-muted rounded-lg p-1.5 transition-colors"
              title="Add root class"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
            <button
              onClick={() => setMaterialFormMode('add-material', null)}
              className="hover:bg-muted rounded-lg p-1.5 transition-colors"
              title="Add unclassified material"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="border-b p-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search materials..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-muted text-foreground placeholder:text-muted-foreground border-border w-full rounded-md border py-1.5 pr-3 pl-9 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Tree */}
        <div className="p-2">
          <MaterialTree plantId={plantId} search={search} />
        </div>
      </div>

      {/* ── Right panel: Detail ── */}
      <div className="bg-card flex-1 overflow-auto rounded-lg border">
        {materialFormMode === 'add-class' ? (
          <AddClassForm
            plantId={plantId}
            classes={classes}
            parentId={materialFormParentId}
            onDone={() => setMaterialFormMode('view')}
          />
        ) : materialFormMode === 'add-material' ? (
          <AddMaterialForm
            plantId={plantId}
            classes={classes}
            parentClassId={materialFormParentId}
            onDone={() => setMaterialFormMode('view')}
          />
        ) : selectedClass ? (
          <MaterialClassDetail
            key={selectedClass.id}
            plantId={plantId}
            classItem={selectedClass}
            classes={classes}
            materials={materials}
          />
        ) : selectedMaterial ? (
          <MaterialDetail key={selectedMaterial.id} plantId={plantId} material={selectedMaterial} />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
            <Package className="h-8 w-8 opacity-50" />
            <p className="text-sm">Select a material or class to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Add Class Form ──────────────────────────────────────────────────

function buildClassBreadcrumb(
  classes: MaterialClass[],
  classId: number | null,
): string | null {
  if (!classId) return null
  const parts: string[] = []
  let current = classes.find((c) => c.id === classId)
  while (current) {
    parts.unshift(current.name)
    current = current.parent_id
      ? classes.find((c) => c.id === current!.parent_id)
      : undefined
  }
  return parts.join(' > ')
}

function AddClassForm({
  plantId,
  classes,
  parentId,
  onDone,
}: {
  plantId: number
  classes: MaterialClass[]
  parentId: number | null
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')

  const createMutation = useCreateMaterialClass(plantId)
  const parentBreadcrumb = buildClassBreadcrumb(classes, parentId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !code.trim()) return
    createMutation.mutate(
      {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        parent_id: parentId,
        description: description.trim() || null,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4 p-6">
      <h3 className="text-lg font-semibold">New Material Class</h3>

      {parentBreadcrumb ? (
        <div className="text-muted-foreground text-sm">
          Creating under: <span className="text-foreground font-medium">{parentBreadcrumb}</span>
        </div>
      ) : (
        <div className="text-muted-foreground text-sm">Creating at root level</div>
      )}

      <div className="space-y-1.5">
        <label className={labelClasses()}>Name</label>
        <input
          className={fieldClasses()}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className={labelClasses()}>Code</label>
        <input
          className={fieldClasses()}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onBlur={() => setCode((c) => c.toUpperCase())}
          required
        />
      </div>

      <div className="space-y-1.5">
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
          type="submit"
          disabled={createMutation.isPending}
          className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating...' : 'Create Class'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-muted-foreground hover:text-foreground rounded-md px-4 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Add Material Form ───────────────────────────────────────────────

function AddMaterialForm({
  plantId,
  classes,
  parentClassId,
  onDone,
}: {
  plantId: number
  classes: MaterialClass[]
  parentClassId: number | null
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')

  const createMutation = useCreateMaterial(plantId)
  const classBreadcrumb = buildClassBreadcrumb(classes, parentClassId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !code.trim()) return
    createMutation.mutate(
      {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        class_id: parentClassId,
        description: description.trim() || null,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4 p-6">
      <h3 className="text-lg font-semibold">New Material</h3>

      {classBreadcrumb ? (
        <div className="text-muted-foreground text-sm">
          Class: <span className="text-foreground font-medium">{classBreadcrumb}</span>
        </div>
      ) : (
        <div className="text-muted-foreground text-sm">Unclassified material</div>
      )}

      <div className="space-y-1.5">
        <label className={labelClasses()}>Name</label>
        <input
          className={fieldClasses()}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className={labelClasses()}>Code</label>
        <input
          className={fieldClasses()}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onBlur={() => setCode((c) => c.toUpperCase())}
          required
        />
      </div>

      <div className="space-y-1.5">
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
          type="submit"
          disabled={createMutation.isPending}
          className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating...' : 'Create Material'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-muted-foreground hover:text-foreground rounded-md px-4 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
