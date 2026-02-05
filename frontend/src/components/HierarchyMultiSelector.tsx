import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, Factory, Cog, Box, Cpu, Settings, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHierarchyTree, useHierarchyCharacteristics } from '@/api/hooks'
import type { HierarchyNode } from '@/types'

interface HierarchyMultiSelectorProps {
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  className?: string
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
 * Checkbox with indeterminate state support
 */
function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: (checked: boolean) => void
}) {
  const checkboxRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate
    }
  }, [indeterminate])

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 rounded border-border cursor-pointer"
    />
  )
}

export function HierarchyMultiSelector({
  selectedIds,
  onSelectionChange,
  className,
}: HierarchyMultiSelectorProps) {
  const { data: hierarchy, isLoading } = useHierarchyTree()
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

  const toggleSelection = (charId: number) => {
    if (selectedIds.includes(charId)) {
      onSelectionChange(selectedIds.filter((id) => id !== charId))
    } else {
      onSelectionChange([...selectedIds, charId])
    }
  }

  const selectAll = (charIds: number[]) => {
    const newIds = new Set([...selectedIds, ...charIds])
    onSelectionChange(Array.from(newIds))
  }

  const deselectAll = (charIds: number[]) => {
    onSelectionChange(selectedIds.filter((id) => !charIds.includes(id)))
  }

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center gap-2 p-4 text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading hierarchy...</span>
      </div>
    )
  }

  if (!hierarchy || hierarchy.length === 0) {
    return (
      <div className={cn('text-muted-foreground p-4 text-center text-sm', className)}>
        No hierarchy configured.
      </div>
    )
  }

  return (
    <div className={cn('overflow-auto', className)}>
      {hierarchy.map((node) => (
        <SelectorNode
          key={node.id}
          node={node}
          level={0}
          expandedNodes={expandedNodes}
          toggleExpanded={toggleExpanded}
          selectedIds={selectedIds}
          toggleSelection={toggleSelection}
          selectAll={selectAll}
          deselectAll={deselectAll}
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
  selectedIds: number[]
  toggleSelection: (charId: number) => void
  selectAll: (charIds: number[]) => void
  deselectAll: (charIds: number[]) => void
}

function SelectorNode({
  node,
  level,
  expandedNodes,
  toggleExpanded,
  selectedIds,
  toggleSelection,
  selectAll,
  deselectAll,
}: SelectorNodeProps) {
  const isExpanded = expandedNodes.has(node.id)
  const hasChildren = node.children && node.children.length > 0

  // Load characteristics when expanded
  const { data: characteristics, isLoading: isLoadingChars } = useHierarchyCharacteristics(
    isExpanded ? node.id : 0
  )

  const canExpand = hasChildren || (node.characteristic_count ?? 0) > 0

  // Calculate folder selection state
  const folderSelectionState = useMemo(() => {
    if (!characteristics || characteristics.length === 0) {
      return { allSelected: false, someSelected: false, charIds: [] as number[] }
    }
    const charIds = characteristics.map((c) => c.id)
    const selectedCount = charIds.filter((id) => selectedIds.includes(id)).length
    return {
      allSelected: selectedCount === charIds.length,
      someSelected: selectedCount > 0 && selectedCount < charIds.length,
      charIds,
    }
  }, [characteristics, selectedIds])

  const handleFolderCheckboxChange = (checked: boolean) => {
    if (checked) {
      selectAll(folderSelectionState.charIds)
    } else {
      deselectAll(folderSelectionState.charIds)
    }
  }

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 hover:bg-muted cursor-pointer'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => canExpand && toggleExpanded(node.id)}
      >
        {/* Folder checkbox (only when expanded and has characteristics) */}
        {isExpanded && folderSelectionState.charIds.length > 0 ? (
          <IndeterminateCheckbox
            checked={folderSelectionState.allSelected}
            indeterminate={folderSelectionState.someSelected}
            onChange={handleFolderCheckboxChange}
          />
        ) : (
          <span className="w-4" />
        )}

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
              selectedIds={selectedIds}
              toggleSelection={toggleSelection}
              selectAll={selectAll}
              deselectAll={deselectAll}
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
            const isSelected = selectedIds.includes(char.id)
            return (
              <div
                key={char.id}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 cursor-pointer text-sm',
                  'hover:bg-muted transition-colors',
                  isSelected && 'bg-primary/10'
                )}
                style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                onClick={() => toggleSelection(char.id)}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                    isSelected ? 'bg-primary border-primary' : 'border-border'
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <div
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    char.in_control !== false ? 'bg-green-500' : 'bg-destructive'
                  )}
                />
                <span className="flex-1 truncate">{char.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default HierarchyMultiSelector
