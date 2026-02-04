import { useState, useMemo, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, Factory, Cog, Box, Cpu, Settings, AlertCircle, Clock, CheckCircle, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useHierarchyTree, useHierarchyCharacteristics } from '@/api/hooks'
import type { HierarchyNode, Characteristic } from '@/types'
import { SelectionToolbar } from './SelectionToolbar'

export type StatusFilter = 'ALL' | 'OOC' | 'DUE' | 'OK'

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

type CharacteristicStatus = 'OOC' | 'DUE' | 'OK'

function getCharacteristicStatus(char: Characteristic): CharacteristicStatus {
  // Check for violations
  if (char.unacknowledged_violations && char.unacknowledged_violations > 0) {
    return 'OOC'
  }
  if (char.in_control === false) {
    return 'OOC'
  }
  // Default to DUE (needs attention)
  return 'DUE'
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

/**
 * Status badge component for characteristic nodes
 */
function StatusBadge({ status }: { status: CharacteristicStatus }) {
  const styles = {
    OOC: 'bg-destructive text-destructive-foreground',
    DUE: 'bg-yellow-500 text-white',
    OK: 'bg-green-500 text-white',
  }
  return (
    <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded-full', styles[status])}>
      {status}
    </span>
  )
}

/**
 * Status filter tabs component
 */
function StatusFilterTabs({
  value,
  onChange,
  counts
}: {
  value: StatusFilter
  onChange: (v: StatusFilter) => void
  counts: { OOC: number; DUE: number; OK: number; ALL: number }
}) {
  const tabs: { status: StatusFilter; label: string; color: string }[] = [
    { status: 'ALL', label: 'All', color: '' },
    { status: 'OOC', label: 'OOC', color: 'text-destructive' },
    { status: 'DUE', label: 'Due', color: 'text-yellow-600 dark:text-yellow-400' },
    { status: 'OK', label: 'OK', color: 'text-green-600 dark:text-green-400' },
  ]

  return (
    <div className="flex border border-border rounded-lg overflow-hidden">
      {tabs.map((tab) => (
        <button
          key={tab.status}
          onClick={() => onChange(tab.status)}
          className={cn(
            'px-3 py-1.5 text-sm transition-colors flex items-center gap-1',
            value === tab.status
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted',
            value !== tab.status && tab.color
          )}
        >
          {tab.label}
          <span className="text-xs opacity-60">({counts[tab.status]})</span>
        </button>
      ))}
    </div>
  )
}

/**
 * Roll-up status summary for folder nodes
 */
function FolderStatusSummary({ oocCount, dueCount }: { oocCount: number; dueCount: number }) {
  if (oocCount === 0 && dueCount === 0) return null

  return (
    <span className="flex items-center gap-1 text-xs">
      {oocCount > 0 && (
        <span className="px-1 rounded bg-destructive/20 text-destructive">{oocCount}</span>
      )}
      {dueCount > 0 && (
        <span className="px-1 rounded bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">{dueCount}</span>
      )}
    </span>
  )
}

interface HierarchyTodoListProps {
  className?: string
}

export function HierarchyTodoList({ className }: HierarchyTodoListProps) {
  const { data: nodes, isLoading } = useHierarchyTree()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<number>>(new Set())
  const isMultiSelectMode = useDashboardStore((state) => state.isMultiSelectMode)
  const setMultiSelectMode = useDashboardStore((state) => state.setMultiSelectMode)

  const toggleNodeExpanded = (id: number) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className={cn('border rounded-lg bg-card h-full flex flex-col', className)}>
        <div className="p-4 border-b">
          <h2 className="font-semibold">Characteristics</h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Loading...
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={cn('border rounded-lg bg-card h-full flex flex-col', className)}>
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Characteristics</h2>
            <button
              onClick={() => setMultiSelectMode(!isMultiSelectMode)}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg transition-colors',
                isMultiSelectMode
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground'
              )}
              title={isMultiSelectMode ? 'Exit multi-select' : 'Select for reporting'}
            >
              <ListChecks className="h-3.5 w-3.5" />
              {isMultiSelectMode ? 'Done' : 'Select'}
            </button>
          </div>
          <StatusFilterTabs
            value={statusFilter}
            onChange={setStatusFilter}
            counts={{ OOC: 0, DUE: 0, OK: 0, ALL: 0 }} // TODO: Calculate from data
          />
        </div>
        <div className="flex-1 overflow-auto p-2">
          <div className="space-y-1">
            {nodes?.map((node) => (
              <TodoTreeNode
                key={node.id}
                node={node}
                level={0}
                statusFilter={statusFilter}
                expandedNodeIds={expandedNodeIds}
                toggleNodeExpanded={toggleNodeExpanded}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Selection toolbar */}
      {isMultiSelectMode && <SelectionToolbar />}
    </>
  )
}

interface TodoTreeNodeProps {
  node: HierarchyNode
  level: number
  statusFilter: StatusFilter
  expandedNodeIds: Set<number>
  toggleNodeExpanded: (id: number) => void
}

function TodoTreeNode({
  node,
  level,
  statusFilter,
  expandedNodeIds,
  toggleNodeExpanded
}: TodoTreeNodeProps) {
  const selectedId = useDashboardStore((state) => state.selectedCharacteristicId)
  const setSelectedId = useDashboardStore((state) => state.setSelectedCharacteristicId)
  const openInputModal = useDashboardStore((state) => state.openInputModal)
  const isMultiSelectMode = useDashboardStore((state) => state.isMultiSelectMode)
  const selectedCharacteristicIds = useDashboardStore((state) => state.selectedCharacteristicIds)
  const toggleCharacteristicSelection = useDashboardStore((state) => state.toggleCharacteristicSelection)
  const selectAllCharacteristics = useDashboardStore((state) => state.selectAllCharacteristics)
  const deselectAllCharacteristics = useDashboardStore((state) => state.deselectAllCharacteristics)

  const isExpanded = expandedNodeIds.has(node.id)
  const hasChildren = node.children && node.children.length > 0

  // Load characteristics for this node when expanded
  const { data: characteristics } = useHierarchyCharacteristics(
    isExpanded ? node.id : 0
  )

  // Calculate status counts for this folder
  const statusCounts = useMemo(() => {
    const counts = { OOC: 0, DUE: 0, OK: 0 }
    characteristics?.forEach((char) => {
      const status = getCharacteristicStatus(char)
      counts[status]++
    })
    return counts
  }, [characteristics])

  // Filter characteristics based on status filter
  const filteredCharacteristics = useMemo(() => {
    if (statusFilter === 'ALL') return characteristics
    return characteristics?.filter((char) => getCharacteristicStatus(char) === statusFilter)
  }, [characteristics, statusFilter])

  // Calculate folder selection state for multi-select
  const folderSelectionState = useMemo(() => {
    if (!filteredCharacteristics || filteredCharacteristics.length === 0) {
      return { allSelected: false, someSelected: false, charIds: [] as number[] }
    }
    const charIds = filteredCharacteristics.map((c) => c.id)
    const selectedCount = charIds.filter((id) => selectedCharacteristicIds.has(id)).length
    return {
      allSelected: selectedCount === charIds.length,
      someSelected: selectedCount > 0 && selectedCount < charIds.length,
      charIds,
    }
  }, [filteredCharacteristics, selectedCharacteristicIds])

  const handleFolderCheckboxChange = (checked: boolean) => {
    if (checked) {
      selectAllCharacteristics(folderSelectionState.charIds)
    } else {
      deselectAllCharacteristics(folderSelectionState.charIds)
    }
  }

  // Check if this node should be visible based on filter
  const hasMatchingCharacteristics = filteredCharacteristics && filteredCharacteristics.length > 0

  // For status filter, auto-expand nodes with matching children
  const shouldShow = statusFilter === 'ALL' || hasMatchingCharacteristics || hasChildren

  if (!shouldShow && !hasChildren) return null

  const handleToggle = () => {
    if (hasChildren || node.characteristic_count) {
      toggleNodeExpanded(node.id)
    }
  }

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer',
          'hover:bg-muted'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleToggle}
      >
        {isMultiSelectMode && isExpanded && folderSelectionState.charIds.length > 0 && (
          <IndeterminateCheckbox
            checked={folderSelectionState.allSelected}
            indeterminate={folderSelectionState.someSelected}
            onChange={handleFolderCheckboxChange}
          />
        )}
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
        <span className="flex-1 text-sm font-medium">{node.name}</span>
        {isExpanded && (
          <FolderStatusSummary oocCount={statusCounts.OOC} dueCount={statusCounts.DUE} />
        )}
        {!isExpanded && node.characteristic_count !== undefined && node.characteristic_count > 0 && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {node.characteristic_count}
          </span>
        )}
      </div>

      {isExpanded && (
        <div>
          {/* Child nodes */}
          {node.children?.map((child) => (
            <TodoTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              statusFilter={statusFilter}
              expandedNodeIds={expandedNodeIds}
              toggleNodeExpanded={toggleNodeExpanded}
            />
          ))}

          {/* Characteristics under this node */}
          {filteredCharacteristics?.map((char) => {
            const status = getCharacteristicStatus(char)
            const isSelected = selectedId === char.id
            const isChecked = selectedCharacteristicIds.has(char.id)

            return (
              <div
                key={char.id}
                className={cn(
                  'group flex items-center gap-2 px-2 py-2 rounded cursor-pointer',
                  'hover:bg-muted text-sm transition-colors',
                  isSelected && !isMultiSelectMode && 'bg-primary/10 ring-1 ring-primary/30',
                  isChecked && isMultiSelectMode && 'bg-primary/10',
                  status === 'OOC' && !isChecked && 'bg-destructive/5',
                  status === 'DUE' && !isChecked && 'bg-yellow-500/5'
                )}
                style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                onClick={() => {
                  if (isMultiSelectMode) {
                    toggleCharacteristicSelection(char.id)
                  } else {
                    setSelectedId(char.id)
                  }
                }}
              >
                {isMultiSelectMode ? (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCharacteristicSelection(char.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-border cursor-pointer"
                  />
                ) : (
                  <span className="w-4" />
                )}
                {status === 'OOC' && <AlertCircle className="h-4 w-4 text-destructive" />}
                {status === 'DUE' && <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />}
                {status === 'OK' && <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />}
                <span className="flex-1 font-medium">{char.name}</span>
                <StatusBadge status={status} />
                {!isMultiSelectMode && char.provider_type === 'MANUAL' && (
                  <button
                    className="text-xs text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      openInputModal(char.id)
                    }}
                  >
                    Enter
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default HierarchyTodoList
