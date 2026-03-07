import { useState, useMemo, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  Package,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useMaterialClasses,
  useMaterials,
  useCreateMaterialClass,
  useUpdateMaterialClass,
  useDeleteMaterialClass,
  useCreateMaterial,
  useUpdateMaterial,
  useDeleteMaterial,
} from '@/api/hooks/materials'
import type { MaterialClass, Material } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────

interface TreeNode {
  type: 'class'
  data: MaterialClass
  children: TreeNode[]
  materials: Material[]
}

type Selection =
  | { kind: 'class'; item: MaterialClass }
  | { kind: 'material'; item: Material }
  | null

type FormMode = 'view' | 'add-class' | 'add-material'

// ─── Tree builder ────────────────────────────────────────────────────

function buildTree(classes: MaterialClass[], materials: Material[]): TreeNode[] {
  const nodeMap = new Map<number, TreeNode>()
  for (const cls of classes) {
    nodeMap.set(cls.id, { type: 'class', data: cls, children: [], materials: [] })
  }

  const roots: TreeNode[] = []
  for (const cls of classes) {
    const node = nodeMap.get(cls.id)!
    if (cls.parent_id && nodeMap.has(cls.parent_id)) {
      nodeMap.get(cls.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  for (const mat of materials) {
    if (mat.class_id && nodeMap.has(mat.class_id)) {
      nodeMap.get(mat.class_id)!.materials.push(mat)
    }
  }

  return roots
}

function countMaterials(node: TreeNode): number {
  let count = node.materials.length
  for (const child of node.children) {
    count += countMaterials(child)
  }
  return count
}

function treeMatches(node: TreeNode, query: string): boolean {
  const q = query.toLowerCase()
  if (node.data.name.toLowerCase().includes(q) || node.data.code.toLowerCase().includes(q)) {
    return true
  }
  if (node.materials.some((m) => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q))) {
    return true
  }
  return node.children.some((c) => treeMatches(c, q))
}

// ─── Component ───────────────────────────────────────────────────────

export function MaterialTreeManager({ plantId }: { plantId: number }) {
  const { data: classes = [], isLoading: classesLoading } = useMaterialClasses(plantId)
  const { data: materials = [], isLoading: materialsLoading } = useMaterials(plantId)

  const [selection, setSelection] = useState<Selection>(null)
  const [formMode, setFormMode] = useState<FormMode>('view')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())

  const tree = useMemo(() => buildTree(classes, materials), [classes, materials])
  const unclassified = useMemo(
    () => materials.filter((m) => !m.class_id),
    [materials],
  )

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelect = useCallback(
    (sel: Selection) => {
      setSelection(sel)
      setFormMode('view')
    },
    [],
  )

  const isLoading = classesLoading || materialsLoading

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading materials...</p>
      </div>
    )
  }

  return (
    <div data-ui="material-tree-manager" className="flex h-full flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search materials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-muted text-foreground placeholder:text-muted-foreground border-border w-full rounded-md border py-1.5 pr-3 pl-9 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>
        <button
          onClick={() => {
            setFormMode('add-class')
            setSelection(null)
          }}
          className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Class
        </button>
        <button
          onClick={() => {
            setFormMode('add-material')
            setSelection(null)
          }}
          className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Material
        </button>
      </div>

      {/* Main split */}
      <div className="border-border flex min-h-0 flex-1 overflow-hidden rounded-lg border">
        {/* Left: Tree */}
        <div className="border-border w-64 shrink-0 overflow-y-auto border-r p-2">
          {tree.map((node) => (
            <ClassTreeNode
              key={node.data.id}
              node={node}
              depth={0}
              search={search}
              expanded={expanded}
              selection={selection}
              onToggle={toggleExpand}
              onSelect={handleSelect}
            />
          ))}

          {/* Unclassified */}
          {unclassified.length > 0 && (
            <div className="mt-3 border-t border-border pt-2">
              <div className="text-muted-foreground mb-1 px-2 text-xs font-semibold uppercase tracking-wider">
                Unclassified
              </div>
              {unclassified
                .filter(
                  (m) =>
                    !search ||
                    m.name.toLowerCase().includes(search.toLowerCase()) ||
                    m.code.toLowerCase().includes(search.toLowerCase()),
                )
                .map((mat) => (
                  <MaterialNode
                    key={mat.id}
                    material={mat}
                    depth={0}
                    selected={selection?.kind === 'material' && selection.item.id === mat.id}
                    onSelect={handleSelect}
                  />
                ))}
            </div>
          )}

          {tree.length === 0 && unclassified.length === 0 && (
            <p className="text-muted-foreground p-4 text-center text-sm">
              No materials or classes yet.
            </p>
          )}
        </div>

        {/* Right: Detail form */}
        <div className="flex-1 overflow-y-auto p-4">
          {formMode === 'add-class' && (
            <AddClassForm
              plantId={plantId}
              classes={classes}
              onDone={() => setFormMode('view')}
            />
          )}
          {formMode === 'add-material' && (
            <AddMaterialForm
              plantId={plantId}
              classes={classes}
              onDone={() => setFormMode('view')}
            />
          )}
          {formMode === 'view' && selection?.kind === 'class' && (
            <ClassDetailForm
              plantId={plantId}
              item={selection.item}
              classes={classes}
              onDeleted={() => setSelection(null)}
            />
          )}
          {formMode === 'view' && selection?.kind === 'material' && (
            <MaterialDetailForm
              plantId={plantId}
              item={selection.item}
              classes={classes}
              onDeleted={() => setSelection(null)}
            />
          )}
          {formMode === 'view' && !selection && (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground text-sm">
                Select a material or class to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tree nodes ──────────────────────────────────────────────────────

function ClassTreeNode({
  node,
  depth,
  search,
  expanded,
  selection,
  onToggle,
  onSelect,
}: {
  node: TreeNode
  depth: number
  search: string
  expanded: Set<number>
  selection: Selection
  onToggle: (id: number) => void
  onSelect: (sel: Selection) => void
}) {
  if (search && !treeMatches(node, search)) return null

  const isOpen = expanded.has(node.data.id)
  const isSelected = selection?.kind === 'class' && selection.item.id === node.data.id
  const matCount = countMaterials(node)
  const hasChildren = node.children.length > 0 || node.materials.length > 0

  return (
    <div>
      <button
        onClick={() => onSelect({ kind: 'class', item: node.data })}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors',
          isSelected
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-foreground hover:bg-muted',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span
          className="shrink-0 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            onToggle(node.data.id)
          }}
        >
          {hasChildren ? (
            isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : (
            <span className="inline-block w-3.5" />
          )}
        </span>
        {isOpen ? (
          <FolderOpen className="text-primary h-4 w-4 shrink-0" />
        ) : (
          <Folder className="text-primary h-4 w-4 shrink-0" />
        )}
        <span className="truncate">{node.data.name}</span>
        <span className="bg-muted text-muted-foreground ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
          {matCount}
        </span>
      </button>

      {isOpen && (
        <>
          {node.children.map((child) => (
            <ClassTreeNode
              key={child.data.id}
              node={child}
              depth={depth + 1}
              search={search}
              expanded={expanded}
              selection={selection}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
          {node.materials
            .filter(
              (m) =>
                !search ||
                m.name.toLowerCase().includes(search.toLowerCase()) ||
                m.code.toLowerCase().includes(search.toLowerCase()),
            )
            .map((mat) => (
              <MaterialNode
                key={mat.id}
                material={mat}
                depth={depth + 1}
                selected={selection?.kind === 'material' && selection.item.id === mat.id}
                onSelect={onSelect}
              />
            ))}
        </>
      )}
    </div>
  )
}

function MaterialNode({
  material,
  depth,
  selected,
  onSelect,
}: {
  material: Material
  depth: number
  selected: boolean
  onSelect: (sel: Selection) => void
}) {
  return (
    <button
      onClick={() => onSelect({ kind: 'material', item: material })}
      className={cn(
        'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors',
        selected
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-foreground hover:bg-muted',
      )}
      style={{ paddingLeft: `${depth * 16 + 24}px` }}
    >
      <Package className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{material.name}</span>
      <span className="text-muted-foreground ml-1 text-xs">{material.code}</span>
    </button>
  )
}

// ─── Forms ───────────────────────────────────────────────────────────

function fieldClasses() {
  return 'bg-muted text-foreground border-border w-full rounded-md border px-3 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none'
}

function labelClasses() {
  return 'text-foreground text-sm font-medium'
}

// ── Add Class ────────────────────────────────────────────────────────

function AddClassForm({
  plantId,
  classes,
  onDone,
}: {
  plantId: number
  classes: MaterialClass[]
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [parentId, setParentId] = useState<number | null>(null)
  const [description, setDescription] = useState('')

  const createMutation = useCreateMaterialClass(plantId)

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
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4">
      <h3 className="text-foreground text-lg font-semibold">New Material Class</h3>

      <div className="space-y-1.5">
        <label className={labelClasses()}>Name</label>
        <input
          className={fieldClasses()}
          value={name}
          onChange={(e) => setName(e.target.value)}
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
        <label className={labelClasses()}>Parent Class</label>
        <select
          className={fieldClasses()}
          value={parentId ?? ''}
          onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">None (top-level)</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.path}
            </option>
          ))}
        </select>
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

// ── Add Material ─────────────────────────────────────────────────────

function AddMaterialForm({
  plantId,
  classes,
  onDone,
}: {
  plantId: number
  classes: MaterialClass[]
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [classId, setClassId] = useState<number | null>(null)
  const [description, setDescription] = useState('')

  const createMutation = useCreateMaterial(plantId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !code.trim()) return
    createMutation.mutate(
      {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        class_id: classId,
        description: description.trim() || null,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4">
      <h3 className="text-foreground text-lg font-semibold">New Material</h3>

      <div className="space-y-1.5">
        <label className={labelClasses()}>Name</label>
        <input
          className={fieldClasses()}
          value={name}
          onChange={(e) => setName(e.target.value)}
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
        <label className={labelClasses()}>Class</label>
        <select
          className={fieldClasses()}
          value={classId ?? ''}
          onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Unclassified</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.path}
            </option>
          ))}
        </select>
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

// ── Class Detail ─────────────────────────────────────────────────────

function ClassDetailForm({
  plantId,
  item,
  classes,
  onDeleted,
}: {
  plantId: number
  item: MaterialClass
  classes: MaterialClass[]
  onDeleted: () => void
}) {
  const [name, setName] = useState(item.name)
  const [code, setCode] = useState(item.code)
  const [parentId, setParentId] = useState<number | null>(item.parent_id)
  const [description, setDescription] = useState(item.description ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateMutation = useUpdateMaterialClass(plantId)
  const deleteMutation = useDeleteMaterialClass(plantId)

  // Reset form when selection changes
  const [prevId, setPrevId] = useState(item.id)
  if (item.id !== prevId) {
    setPrevId(item.id)
    setName(item.name)
    setCode(item.code)
    setParentId(item.parent_id)
    setDescription(item.description ?? '')
    setConfirmDelete(false)
  }

  // Exclude self and descendants from parent dropdown
  const validParents = classes.filter((c) => {
    if (c.id === item.id) return false
    if (c.path.startsWith(item.path + '/')) return false
    return true
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      classId: item.id,
      data: {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        parent_id: parentId,
        description: description.trim() || null,
      },
    })
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteMutation.mutate(item.id, { onSuccess: onDeleted })
  }

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-md space-y-4">
      <h3 className="text-foreground text-lg font-semibold">Edit Class</h3>

      <div className="space-y-1.5">
        <label className={labelClasses()}>Name</label>
        <input
          className={fieldClasses()}
          value={name}
          onChange={(e) => setName(e.target.value)}
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
        <label className={labelClasses()}>Parent Class</label>
        <select
          className={fieldClasses()}
          value={parentId ?? ''}
          onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">None (top-level)</option>
          {validParents.map((c) => (
            <option key={c.id} value={c.id}>
              {c.path}
            </option>
          ))}
        </select>
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

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium',
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
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-muted-foreground text-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

// ── Material Detail ──────────────────────────────────────────────────

function MaterialDetailForm({
  plantId,
  item,
  classes,
  onDeleted,
}: {
  plantId: number
  item: Material
  classes: MaterialClass[]
  onDeleted: () => void
}) {
  const [name, setName] = useState(item.name)
  const [code, setCode] = useState(item.code)
  const [classId, setClassId] = useState<number | null>(item.class_id)
  const [description, setDescription] = useState(item.description ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateMutation = useUpdateMaterial(plantId)
  const deleteMutation = useDeleteMaterial(plantId)

  // Reset form when selection changes
  const [prevId, setPrevId] = useState(item.id)
  if (item.id !== prevId) {
    setPrevId(item.id)
    setName(item.name)
    setCode(item.code)
    setClassId(item.class_id)
    setDescription(item.description ?? '')
    setConfirmDelete(false)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      materialId: item.id,
      data: {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        class_id: classId,
        description: description.trim() || null,
      },
    })
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteMutation.mutate(item.id, { onSuccess: onDeleted })
  }

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-md space-y-4">
      <h3 className="text-foreground text-lg font-semibold">Edit Material</h3>

      <div className="space-y-1.5">
        <label className={labelClasses()}>Name</label>
        <input
          className={fieldClasses()}
          value={name}
          onChange={(e) => setName(e.target.value)}
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
        <label className={labelClasses()}>Class</label>
        <select
          className={fieldClasses()}
          value={classId ?? ''}
          onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Unclassified</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.path}
            </option>
          ))}
        </select>
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

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium',
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
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-muted-foreground text-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
