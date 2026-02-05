import { useState } from 'react'
import { ChevronRight, ChevronDown, Factory, Cog, Box, Cpu, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHierarchyTree, useHierarchyCharacteristics } from '@/api/hooks'
import type { HierarchyNode, Characteristic } from '@/types'

interface HierarchyCharacteristicSelectorProps {
  selectedCharId: number | null
  onSelect: (char: Characteristic) => void
  filterProvider?: 'MANUAL' | 'TAG'
}

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

export function HierarchyCharacteristicSelector({
  selectedCharId,
  onSelect,
  filterProvider,
}: HierarchyCharacteristicSelectorProps) {
  const { data: hierarchy, isLoading } = useHierarchyTree()
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set())

  const toggleExpanded = (nodeId: number) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  if (isLoading) {
    return <div className="text-muted-foreground p-4">Loading hierarchy...</div>
  }

  if (!hierarchy || hierarchy.length === 0) {
    return (
      <div className="text-muted-foreground p-4 text-center">
        No hierarchy configured. Create hierarchy nodes in the Configuration page.
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg max-h-64 overflow-auto">
      {hierarchy.map(node => (
        <SelectorNode
          key={node.id}
          node={node}
          level={0}
          expandedNodes={expandedNodes}
          toggleExpanded={toggleExpanded}
          selectedCharId={selectedCharId}
          onSelect={onSelect}
          filterProvider={filterProvider}
        />
      ))}
    </div>
  )
}

interface SelectorNodeProps {
  node: HierarchyNode
  level: number
  expandedNodes: Set<number>
  toggleExpanded: (nodeId: number) => void
  selectedCharId: number | null
  onSelect: (char: Characteristic) => void
  filterProvider?: 'MANUAL' | 'TAG'
}

function SelectorNode({
  node,
  level,
  expandedNodes,
  toggleExpanded,
  selectedCharId,
  onSelect,
  filterProvider,
}: SelectorNodeProps) {
  const isExpanded = expandedNodes.has(node.id)
  const hasChildren = node.children && node.children.length > 0

  // Load characteristics when expanded
  const { data: characteristics } = useHierarchyCharacteristics(
    isExpanded ? node.id : 0
  )

  // Filter characteristics by provider type if specified (only for display)
  const filteredChars = filterProvider
    ? characteristics?.filter(c => c.provider_type === filterProvider)
    : characteristics

  // Always use node.characteristic_count for expansion logic
  // (we can't know filtered count until we've fetched)
  const canExpand = hasChildren || (node.characteristic_count ?? 0) > 0

  // Show filtered count when expanded, otherwise show total
  const displayCount = isExpanded && filterProvider
    ? filteredChars?.length ?? 0
    : node.characteristic_count ?? 0

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 hover:bg-muted cursor-pointer',
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => canExpand && toggleExpanded(node.id)}
      >
        <span className="p-0.5">
          {canExpand ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <span className="w-4" />
          )}
        </span>
        {nodeTypeIcons[node.type] || <Box className="h-4 w-4" />}
        <span className="flex-1 text-sm">{node.name}</span>
        {displayCount > 0 && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {displayCount}
          </span>
        )}
      </div>

      {isExpanded && (
        <div>
          {/* Child nodes */}
          {node.children?.map(child => (
            <SelectorNode
              key={child.id}
              node={child}
              level={level + 1}
              expandedNodes={expandedNodes}
              toggleExpanded={toggleExpanded}
              selectedCharId={selectedCharId}
              onSelect={onSelect}
              filterProvider={filterProvider}
            />
          ))}

          {/* Characteristics */}
          {filteredChars?.map(char => (
            <div
              key={char.id}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 cursor-pointer text-sm',
                'hover:bg-muted',
                selectedCharId === char.id && 'bg-primary/10 text-primary'
              )}
              style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
              onClick={() => onSelect(char)}
            >
              <span className="w-4" />
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  char.in_control !== false ? 'bg-green-500' : 'bg-destructive'
                )}
              />
              <span className="flex-1">{char.name}</span>
              <span className="text-xs text-muted-foreground">n={char.subgroup_size}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
