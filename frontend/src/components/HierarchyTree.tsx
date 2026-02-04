import { ChevronRight, ChevronDown, Factory, Cog, Box, Cpu, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import { useHierarchyCharacteristics } from '@/api/hooks'
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
  const setEditingCharacteristicId = useConfigStore((state) => state.setEditingCharacteristicId)

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

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer',
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
          className="p-0.5 hover:bg-muted-foreground/20 rounded"
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
      </div>

      {isExpanded && (
        <div>
          {/* Child nodes */}
          {node.children?.map((child) => (
            <TreeNode key={child.id} node={child} level={level + 1} />
          ))}

          {/* Characteristics under this node */}
          {characteristics?.map((char) => (
            <div
              key={char.id}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer',
                'hover:bg-muted text-sm'
              )}
              style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
              onClick={() => setEditingCharacteristicId(char.id)}
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
                {char.provider_type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
