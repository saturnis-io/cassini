import { useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, Factory, Box, Cog, Cpu, Settings, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHierarchyTreeByPlant, useHierarchyCharacteristics } from '@/api/hooks'
import type { HierarchyNode, RetentionOverride } from '@/types'

// UNS-compatible hierarchy type icons (same as HierarchyTodoList)
const nodeTypeIcons: Record<string, React.ReactNode> = {
  Folder: <Box className="h-3.5 w-3.5" />,
  Enterprise: <Factory className="h-3.5 w-3.5" />,
  Site: <Factory className="h-3.5 w-3.5" />,
  Area: <Box className="h-3.5 w-3.5" />,
  Line: <Cog className="h-3.5 w-3.5" />,
  Cell: <Cpu className="h-3.5 w-3.5" />,
  Equipment: <Settings className="h-3.5 w-3.5" />,
  Tag: <Settings className="h-3.5 w-3.5" />,
}

export interface SelectedNode {
  type: 'hierarchy' | 'characteristic'
  id: number
  name: string
  hierarchyId: number // for characteristics, the parent hierarchy node
}

interface RetentionTreeBrowserProps {
  plantId: number
  overrides: RetentionOverride[]
  selectedNode: SelectedNode | null
  onSelectNode: (node: SelectedNode | null) => void
}

export function RetentionTreeBrowser({
  plantId,
  overrides,
  selectedNode,
  onSelectNode,
}: RetentionTreeBrowserProps) {
  const { data: nodes, isLoading } = useHierarchyTreeByPlant(plantId)
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<number>>(new Set())

  const overrideHierarchyIds = new Set(
    overrides.filter((o) => o.hierarchy_id != null).map((o) => o.hierarchy_id!)
  )
  const overrideCharIds = new Set(
    overrides.filter((o) => o.characteristic_id != null).map((o) => o.characteristic_id!)
  )

  const toggleExpanded = useCallback((id: number) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading hierarchy...
      </div>
    )
  }

  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
        No hierarchy nodes found.
      </div>
    )
  }

  return (
    <div className="p-2 space-y-0.5">
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          level={0}
          expandedNodeIds={expandedNodeIds}
          toggleExpanded={toggleExpanded}
          overrideHierarchyIds={overrideHierarchyIds}
          overrideCharIds={overrideCharIds}
          selectedNode={selectedNode}
          onSelectNode={onSelectNode}
        />
      ))}
    </div>
  )
}

interface TreeNodeProps {
  node: HierarchyNode
  level: number
  expandedNodeIds: Set<number>
  toggleExpanded: (id: number) => void
  overrideHierarchyIds: Set<number>
  overrideCharIds: Set<number>
  selectedNode: SelectedNode | null
  onSelectNode: (node: SelectedNode) => void
}

function TreeNode({
  node,
  level,
  expandedNodeIds,
  toggleExpanded,
  overrideHierarchyIds,
  overrideCharIds,
  selectedNode,
  onSelectNode,
}: TreeNodeProps) {
  const isExpanded = expandedNodeIds.has(node.id)
  const hasChildren = (node.children && node.children.length > 0) || (node.characteristic_count && node.characteristic_count > 0)
  const hasOverride = overrideHierarchyIds.has(node.id)
  const isSelected = selectedNode?.type === 'hierarchy' && selectedNode.id === node.id

  const handleClick = () => {
    onSelectNode({ type: 'hierarchy', id: node.id, name: node.name, hierarchyId: node.id })
    if (hasChildren && !isExpanded) {
      toggleExpanded(node.id)
    }
  }

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-xs',
          'hover:bg-muted transition-colors',
          isSelected && 'bg-primary/10 ring-1 ring-primary/30'
        )}
        style={{ paddingLeft: `${level * 14 + 6}px` }}
        onClick={handleClick}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) toggleExpanded(node.id)
          }}
          className="p-0.5 hover:bg-muted-foreground/20 rounded"
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <span className="w-3.5" />
          )}
        </button>
        {nodeTypeIcons[node.type] || <Box className="h-3.5 w-3.5" />}
        <span className={cn('flex-1 font-medium', !hasOverride && 'text-muted-foreground')}>
          {node.name}
        </span>
        {hasOverride && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
      </div>

      {isExpanded && (
        <div>
          {node.children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              expandedNodeIds={expandedNodeIds}
              toggleExpanded={toggleExpanded}
              overrideHierarchyIds={overrideHierarchyIds}
              overrideCharIds={overrideCharIds}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
            />
          ))}

          <CharacteristicsLeaves
            hierarchyId={node.id}
            level={level + 1}
            overrideCharIds={overrideCharIds}
            selectedNode={selectedNode}
            onSelectNode={onSelectNode}
          />
        </div>
      )}
    </div>
  )
}

interface CharacteristicsLeavesProps {
  hierarchyId: number
  level: number
  overrideCharIds: Set<number>
  selectedNode: SelectedNode | null
  onSelectNode: (node: SelectedNode) => void
}

function CharacteristicsLeaves({
  hierarchyId,
  level,
  overrideCharIds,
  selectedNode,
  onSelectNode,
}: CharacteristicsLeavesProps) {
  const { data: chars, isLoading } = useHierarchyCharacteristics(hierarchyId)

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
        style={{ paddingLeft: `${level * 14 + 6}px` }}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading...
      </div>
    )
  }

  if (!chars || chars.length === 0) return null

  return (
    <>
      {chars.map((char) => {
        const hasOverride = overrideCharIds.has(char.id)
        const isSelected = selectedNode?.type === 'characteristic' && selectedNode.id === char.id

        return (
          <div
            key={char.id}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs',
              'hover:bg-muted transition-colors',
              isSelected && 'bg-primary/10 ring-1 ring-primary/30'
            )}
            style={{ paddingLeft: `${level * 14 + 6}px` }}
            onClick={() => onSelectNode({
              type: 'characteristic',
              id: char.id,
              name: char.name,
              hierarchyId,
            })}
          >
            <span className="w-3.5" />
            <span className="w-3.5" />
            <span className={cn('flex-1 font-medium', !hasOverride && 'text-muted-foreground')}>
              {char.name}
            </span>
            {hasOverride && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
          </div>
        )
      })}
    </>
  )
}
