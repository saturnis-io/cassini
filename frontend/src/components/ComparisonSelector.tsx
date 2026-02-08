import { useState } from 'react'
import { ChevronRight, ChevronDown, Factory, Cog, Box, Cpu, Settings, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHierarchyTreeByPlant, useHierarchyCharacteristics } from '@/api/hooks'
import { usePlantContext } from '@/providers/PlantProvider'
import type { HierarchyNode } from '@/types'

interface ComparisonSelectorProps {
  excludeId?: number
  onSelect: (characteristicId: number) => void
  onCancel: () => void
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

/**
 * Hierarchy-based characteristic selector for comparison mode.
 * Displays as a modal overlay with the full hierarchy tree.
 */
export function ComparisonSelector({ excludeId, onSelect, onCancel }: ComparisonSelectorProps) {
  const { selectedPlant } = usePlantContext()
  const { data: hierarchy, isLoading } = useHierarchyTreeByPlant(selectedPlant?.id ?? 0)
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set())

  const toggleExpanded = (nodeId: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">Select Comparison Characteristic</h3>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Hierarchy Tree */}
        <div className="flex-1 overflow-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading hierarchy...</span>
            </div>
          ) : !hierarchy || hierarchy.length === 0 ? (
            <div className="text-muted-foreground p-8 text-center text-sm">
              No hierarchy configured.
            </div>
          ) : (
            hierarchy.map((node) => (
              <SelectorNode
                key={node.id}
                node={node}
                level={0}
                expandedNodes={expandedNodes}
                toggleExpanded={toggleExpanded}
                excludeId={excludeId}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

interface SelectorNodeProps {
  node: HierarchyNode
  level: number
  expandedNodes: Set<number>
  toggleExpanded: (nodeId: number) => void
  excludeId?: number
  onSelect: (characteristicId: number) => void
}

function SelectorNode({
  node,
  level,
  expandedNodes,
  toggleExpanded,
  excludeId,
  onSelect,
}: SelectorNodeProps) {
  const isExpanded = expandedNodes.has(node.id)
  const hasChildren = node.children && node.children.length > 0

  // Load characteristics when expanded
  const { data: characteristics, isLoading: isLoadingChars } = useHierarchyCharacteristics(
    isExpanded ? node.id : 0
  )

  const canExpand = hasChildren || (node.characteristic_count ?? 0) > 0

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 hover:bg-muted cursor-pointer rounded'
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
        <span className="flex-1 text-sm font-medium">{node.name}</span>
        {(node.characteristic_count ?? 0) > 0 && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {node.characteristic_count}
          </span>
        )}
      </div>

      {isExpanded && (
        <div>
          {/* Child nodes */}
          {node.children?.map((child) => (
            <SelectorNode
              key={child.id}
              node={child}
              level={level + 1}
              expandedNodes={expandedNodes}
              toggleExpanded={toggleExpanded}
              excludeId={excludeId}
              onSelect={onSelect}
            />
          ))}

          {/* Loading indicator */}
          {isLoadingChars && (
            <div
              className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground"
              style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </div>
          )}

          {/* Characteristics */}
          {!isLoadingChars && characteristics?.map((char) => {
            const isExcluded = char.id === excludeId
            return (
              <button
                key={char.id}
                disabled={isExcluded}
                onClick={() => !isExcluded && onSelect(char.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left rounded',
                  'transition-colors',
                  isExcluded
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-primary/10 hover:text-primary cursor-pointer'
                )}
                style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
              >
                <div
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    char.in_control !== false ? 'bg-green-500' : 'bg-destructive'
                  )}
                />
                <span className="flex-1 truncate">{char.name}</span>
                {isExcluded && (
                  <span className="text-xs text-muted-foreground">(primary)</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ComparisonSelector
