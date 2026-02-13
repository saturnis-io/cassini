import { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Factory,
  Cog,
  Box,
  Cpu,
  Settings,
  Loader2,
  X,
} from 'lucide-react'
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
    <div className="bg-background/80 absolute inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-card border-border flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border shadow-xl">
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">Select Comparison Characteristic</h3>
          <button
            onClick={onCancel}
            className="hover:bg-muted text-muted-foreground hover:text-foreground rounded p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Hierarchy Tree */}
        <div className="flex-1 overflow-auto p-2">
          {isLoading ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 p-8">
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
    isExpanded ? node.id : 0,
  )

  const canExpand = hasChildren || (node.characteristic_count ?? 0) > 0

  return (
    <div>
      <div
        className={cn('hover:bg-muted flex cursor-pointer items-center gap-1 rounded px-2 py-1.5')}
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
          <span className="bg-muted rounded px-1.5 py-0.5 text-xs">
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
              className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-sm"
              style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </div>
          )}

          {/* Characteristics */}
          {!isLoadingChars &&
            characteristics?.map((char) => {
              const isExcluded = char.id === excludeId
              return (
                <button
                  key={char.id}
                  disabled={isExcluded}
                  onClick={() => !isExcluded && onSelect(char.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                    'transition-colors',
                    isExcluded
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-primary/10 hover:text-primary cursor-pointer',
                  )}
                  style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                >
                  <div
                    className={cn(
                      'h-2 w-2 flex-shrink-0 rounded-full',
                      char.in_control !== false ? 'bg-success' : 'bg-destructive',
                    )}
                  />
                  <span className="flex-1 truncate">{char.name}</span>
                  {isExcluded && <span className="text-muted-foreground text-xs">(primary)</span>}
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}

export default ComparisonSelector
