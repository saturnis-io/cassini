import { useState } from 'react'
import { ChevronRight, ChevronDown, Factory, Cog, Box, Cpu, Settings, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import { useHierarchyCharacteristics, useDeleteHierarchyNode, useDeleteCharacteristic } from '@/api/hooks'
import type { HierarchyNode } from '@/types'

interface HierarchyTreeProps {
  nodes: HierarchyNode[]
}

// UNS-compatible hierarchy type icons
const nodeTypeIcons: Record<string, React.ReactNode> = {
  Folder: <Box className="h-4 w-4" />,
  Enterprise: <Factory className="h-4 w-4" />,
  Site: <Factory className="h-4 w-4" />,
  Area: <Box className="h-4 w-4" />,
  Line: <Cog className="h-4 w-4" />,
  Cell: <Cpu className="h-4 w-4" />,
  Equipment: <Settings className="h-4 w-4" />,
  Tag: <Settings className="h-4 w-4" />,
}

export function HierarchyTree({ nodes }: HierarchyTreeProps) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} level={0} />
      ))}
    </div>
  )
}

interface TreeNodeProps {
  node: HierarchyNode
  level: number
}

function TreeNode({ node, level }: TreeNodeProps) {
  const selectedNodeId = useConfigStore((state) => state.selectedNodeId)
  const expandedNodeIds = useConfigStore((state) => state.expandedNodeIds)
  const setSelectedNodeId = useConfigStore((state) => state.setSelectedNodeId)
  const toggleNodeExpanded = useConfigStore((state) => state.toggleNodeExpanded)
  const editingCharacteristicId = useConfigStore((state) => state.editingCharacteristicId)
  const setEditingCharacteristicId = useConfigStore((state) => state.setEditingCharacteristicId)

  const deleteNode = useDeleteHierarchyNode()
  const deleteCharacteristic = useDeleteCharacteristic()

  const [showDeleteNodeDialog, setShowDeleteNodeDialog] = useState(false)
  const [charToDelete, setCharToDelete] = useState<{ id: number; name: string } | null>(null)

  const isExpanded = expandedNodeIds.has(node.id)
  const isSelected = selectedNodeId === node.id
  const hasChildren = node.children && node.children.length > 0

  // Load characteristics for this node
  const { data: characteristics } = useHierarchyCharacteristics(
    isExpanded ? node.id : 0
  )

  const handleToggle = () => {
    if (hasChildren || node.characteristic_count) {
      toggleNodeExpanded(node.id)
    }
  }

  const handleSelect = () => {
    setSelectedNodeId(node.id)
  }

  const handleDeleteNode = async () => {
    try {
      await deleteNode.mutateAsync(node.id)
      if (selectedNodeId === node.id) {
        setSelectedNodeId(null)
      }
    } catch {
      // Error toast is handled by the hook
    }
    setShowDeleteNodeDialog(false)
  }

  const handleDeleteCharacteristic = async () => {
    if (!charToDelete) return
    try {
      await deleteCharacteristic.mutateAsync(charToDelete.id)
      if (editingCharacteristicId === charToDelete.id) {
        setEditingCharacteristicId(null)
      }
    } catch {
      // Error toast is handled by the hook
    }
    setCharToDelete(null)
  }

  const canDeleteNode = !hasChildren && !node.characteristic_count

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer',
          'hover:bg-muted',
          isSelected && 'bg-primary/10 text-primary'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleSelect}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleToggle()
          }}
          className="p-0.5 hover:bg-muted-foreground/20 rounded cursor-pointer"
        >
          {(hasChildren || node.characteristic_count) ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <span className="w-4" />
          )}
        </button>
        {nodeTypeIcons[node.type] || <Box className="h-4 w-4" />}
        <span className="flex-1 text-sm">{node.name}</span>
        {node.characteristic_count !== undefined && node.characteristic_count > 0 && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {node.characteristic_count}
          </span>
        )}
        {canDeleteNode && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowDeleteNodeDialog(true)
            }}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity cursor-pointer"
            title="Delete node"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isExpanded && (
        <div>
          {/* Child nodes */}
          {node.children?.map((child) => (
            <TreeNode key={child.id} node={child} level={level + 1} />
          ))}

          {/* Characteristics under this node */}
          {characteristics?.map((char) => {
            const isCharSelected = editingCharacteristicId === char.id
            return (
              <div
                key={char.id}
                className={cn(
                  'group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer',
                  'hover:bg-muted text-sm',
                  isCharSelected && 'bg-primary/10 text-primary ring-1 ring-primary/20'
                )}
                style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                onClick={() => {
                  setSelectedNodeId(null) // Clear hierarchy selection when selecting characteristic
                  setEditingCharacteristicId(char.id)
                }}
              >
                <span className="w-4" />
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    char.in_control ? 'bg-green-500' : 'bg-destructive'
                  )}
                />
                <span className="flex-1">{char.name}</span>
                <span className="text-xs text-muted-foreground">
                  {char.data_source ? char.data_source.type.toUpperCase() : 'MANUAL'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setCharToDelete({ id: char.id, name: char.name })
                  }}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity cursor-pointer"
                  title="Delete characteristic"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete Node Confirmation Dialog */}
      {showDeleteNodeDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDeleteNodeDialog(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Delete Node?</h3>
            <p className="text-muted-foreground mb-4">
              Are you sure you want to delete <strong>{node.name}</strong>?
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteNodeDialog(false)}
                disabled={deleteNode.isPending}
                className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl bg-secondary hover:bg-secondary/80 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteNode}
                disabled={deleteNode.isPending}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium rounded-xl',
                  'bg-destructive text-destructive-foreground',
                  'disabled:opacity-50'
                )}
              >
                {deleteNode.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Characteristic Confirmation Dialog */}
      {charToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setCharToDelete(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Delete Characteristic?</h3>
            <p className="text-muted-foreground mb-4">
              Are you sure you want to delete <strong>{charToDelete.name}</strong>?
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCharToDelete(null)}
                disabled={deleteCharacteristic.isPending}
                className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl bg-secondary hover:bg-secondary/80 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCharacteristic}
                disabled={deleteCharacteristic.isPending}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium rounded-xl',
                  'bg-destructive text-destructive-foreground',
                  'disabled:opacity-50'
                )}
              >
                {deleteCharacteristic.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
