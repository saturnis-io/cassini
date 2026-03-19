import { useState, useMemo, useEffect, useRef } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  Package,
  Plus,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import { useMaterialClasses, useMaterials, useDeleteMaterialClass, useDeleteMaterial } from '@/api/hooks/materials'
import type { MaterialClass, Material } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────

interface TreeNode {
  type: 'class'
  data: MaterialClass
  children: TreeNode[]
  materials: Material[]
}

interface MaterialTreeProps {
  plantId: number
  search: string
}

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
  if (
    node.materials.some(
      (m) => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q),
    )
  ) {
    return true
  }
  return node.children.some((c) => treeMatches(c, q))
}

function materialMatches(mat: Material, query: string): boolean {
  const q = query.toLowerCase()
  return mat.name.toLowerCase().includes(q) || mat.code.toLowerCase().includes(q)
}

// ─── Component ───────────────────────────────────────────────────────

export function MaterialTree({ plantId, search }: MaterialTreeProps) {
  const { data: classes = [], isLoading: classesLoading } = useMaterialClasses(plantId)
  const { data: materials = [], isLoading: materialsLoading } = useMaterials(plantId)

  const tree = useMemo(() => buildTree(classes, materials), [classes, materials])
  const unclassified = useMemo(() => materials.filter((m) => !m.class_id), [materials])

  const filteredUnclassified = useMemo(
    () =>
      search
        ? unclassified.filter((m) => materialMatches(m, search))
        : unclassified,
    [unclassified, search],
  )

  const isLoading = classesLoading || materialsLoading

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    )
  }

  if (tree.length === 0 && unclassified.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-center text-sm">
        No materials or classes yet.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {tree.map((node) => (
        <ClassNode
          key={node.data.id}
          node={node}
          depth={0}
          search={search}
          plantId={plantId}
        />
      ))}

      {filteredUnclassified.length > 0 && (
        <div className="border-border mt-3 border-t pt-2">
          <div className="text-muted-foreground mb-1 px-2 text-xs font-semibold uppercase tracking-wider">
            Unclassified
          </div>
          {filteredUnclassified.map((mat) => (
            <MaterialLeafNode
              key={mat.id}
              material={mat}
              depth={0}
              plantId={plantId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Class Node ──────────────────────────────────────────────────────

function ClassNode({
  node,
  depth,
  search,
  plantId,
}: {
  node: TreeNode
  depth: number
  search: string
  plantId: number
}) {
  const selectedClassId = useConfigStore((s) => s.selectedMaterialClassId)
  const expandedClassIds = useConfigStore((s) => s.expandedClassIds)
  const setSelectedClassId = useConfigStore((s) => s.setSelectedMaterialClassId)
  const toggleClassExpanded = useConfigStore((s) => s.toggleClassExpanded)
  const setMaterialFormMode = useConfigStore((s) => s.setMaterialFormMode)

  const deleteMutation = useDeleteMaterialClass(plantId)

  const [showMenu, setShowMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Close menu when clicking outside (must be before early return — Rules of Hooks)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  // Filter: hide if search is active and no match
  if (search && !treeMatches(node, search)) return null

  const isExpanded = expandedClassIds.has(node.data.id)
  const isSelected = selectedClassId === node.data.id
  const matCount = countMaterials(node)
  const hasChildren = node.children.length > 0 || node.materials.length > 0

  const handleSelect = () => {
    setSelectedClassId(node.data.id)
    if (hasChildren && !isExpanded) {
      toggleClassExpanded(node.data.id)
    }
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleClassExpanded(node.data.id)
  }

  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu((prev) => !prev)
  }

  const handleAddSubclass = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMaterialFormMode('add-class', node.data.id)
    setShowMenu(false)
  }

  const handleAddMaterial = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMaterialFormMode('add-material', node.data.id)
    setShowMenu(false)
  }

  const handleTrashClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteMutation.mutate(node.data.id, {
      onSuccess: () => {
        setConfirmDelete(false)
        if (selectedClassId === node.data.id) {
          setSelectedClassId(null)
        }
      },
    })
  }

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDelete(false)
  }

  return (
    <div>
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-1 rounded px-2 py-1.5',
          'hover:bg-muted',
          isSelected && 'bg-primary/10 text-primary',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleSelect}
      >
        {/* Expand/collapse chevron */}
        <button
          onClick={handleToggle}
          className="hover:bg-muted-foreground/20 cursor-pointer rounded p-0.5"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : (
            <span className="inline-block w-3.5" />
          )}
        </button>

        {/* Folder icon */}
        {isExpanded ? (
          <FolderOpen className="text-primary h-4 w-4 shrink-0" />
        ) : (
          <Folder className="text-primary h-4 w-4 shrink-0" />
        )}

        {/* Name */}
        <span className="flex-1 truncate text-sm">{node.data.name}</span>

        {/* Material count badge */}
        <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
          {matCount}
        </span>

        {/* Add button (hover reveal) */}
        <div className="relative">
          <button
            onClick={handlePlusClick}
            className="hover:bg-primary/10 hover:text-primary cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
            title="Add subclass or material"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          {/* Inline menu */}
          {showMenu && (
            <div
              ref={menuRef}
              className="bg-card border-border absolute top-full right-0 z-50 mt-1 w-40 rounded-md border shadow-lg"
            >
              <button
                onClick={handleAddSubclass}
                className="hover:bg-muted w-full px-3 py-1.5 text-left text-sm"
              >
                Add Subclass
              </button>
              <button
                onClick={handleAddMaterial}
                className="hover:bg-muted w-full px-3 py-1.5 text-left text-sm"
              >
                Add Material
              </button>
            </div>
          )}
        </div>

        {/* Delete button (hover reveal) */}
        {confirmDelete ? (
          <span className="flex items-center gap-1">
            <button
              onClick={handleTrashClick}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground cursor-pointer rounded px-2 py-0.5 text-xs font-medium"
            >
              {deleteMutation.isPending ? '...' : 'Confirm'}
            </button>
            <button
              onClick={handleCancelDelete}
              className="text-muted-foreground cursor-pointer text-xs hover:underline"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={handleTrashClick}
            className="hover:bg-destructive/10 hover:text-destructive cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
            title="Delete class"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Children */}
      {isExpanded && (
        <>
          {node.children.map((child) => (
            <ClassNode
              key={child.data.id}
              node={child}
              depth={depth + 1}
              search={search}
              plantId={plantId}
            />
          ))}
          {node.materials
            .filter((m) => !search || materialMatches(m, search))
            .map((mat) => (
              <MaterialLeafNode
                key={mat.id}
                material={mat}
                depth={depth + 1}
                plantId={plantId}
              />
            ))}
        </>
      )}
    </div>
  )
}

// ─── Material Leaf Node ──────────────────────────────────────────────

function MaterialLeafNode({
  material,
  depth,
  plantId,
}: {
  material: Material
  depth: number
  plantId: number
}) {
  const selectedMaterialId = useConfigStore((s) => s.selectedMaterialId)
  const setSelectedMaterialId = useConfigStore((s) => s.setSelectedMaterialId)

  const deleteMutation = useDeleteMaterial(plantId)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isSelected = selectedMaterialId === material.id

  const handleSelect = () => {
    setSelectedMaterialId(material.id)
  }

  const handleTrashClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteMutation.mutate(material.id, {
      onSuccess: () => {
        setConfirmDelete(false)
        if (selectedMaterialId === material.id) {
          setSelectedMaterialId(null)
        }
      },
    })
  }

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDelete(false)
  }

  return (
    <div
      className={cn(
        'group flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5',
        'hover:bg-muted text-sm',
        isSelected && 'bg-primary/10 text-primary',
      )}
      style={{ paddingLeft: `${depth * 16 + 24}px` }}
      onClick={handleSelect}
    >
      <Package className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{material.name}</span>
      <span className="text-muted-foreground text-xs">{material.code}</span>

      {confirmDelete ? (
        <span className="flex items-center gap-1">
          <button
            onClick={handleTrashClick}
            disabled={deleteMutation.isPending}
            className="bg-destructive text-destructive-foreground cursor-pointer rounded px-2 py-0.5 text-xs font-medium"
          >
            {deleteMutation.isPending ? '...' : 'Confirm'}
          </button>
          <button
            onClick={handleCancelDelete}
            className="text-muted-foreground cursor-pointer text-xs hover:underline"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          onClick={handleTrashClick}
          className="hover:bg-destructive/10 hover:text-destructive cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
          title="Delete material"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
