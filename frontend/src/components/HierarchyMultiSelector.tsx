import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Factory,
  Cog,
  Box,
  Cpu,
  Settings,
  Check,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useHierarchyTree,
  useHierarchyTreeByPlant,
  useHierarchyCharacteristics,
  useCharacteristics,
} from '@/api/hooks'
import type { HierarchyNode, Characteristic } from '@/types'

interface HierarchyMultiSelectorProps {
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  /** When provided, scopes the hierarchy tree to this plant */
  plantId?: number
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
      className="border-border h-4 w-4 cursor-pointer rounded"
    />
  )
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

/**
 * Given a hierarchy tree and a set of matching node IDs,
 * returns the set of all ancestor node IDs that should be visible.
 */
function collectAncestorIds(
  nodes: HierarchyNode[],
  matchingNodeIds: Set<number>,
): Set<number> {
  const ancestors = new Set<number>()

  function walk(node: HierarchyNode): boolean {
    let hasMatchingDescendant = matchingNodeIds.has(node.id)

    if (node.children) {
      for (const child of node.children) {
        if (walk(child)) {
          hasMatchingDescendant = true
        }
      }
    }

    if (hasMatchingDescendant) {
      ancestors.add(node.id)
    }

    return hasMatchingDescendant
  }

  for (const node of nodes) {
    walk(node)
  }

  return ancestors
}

export function HierarchyMultiSelector({
  selectedIds,
  onSelectionChange,
  plantId,
  className,
}: HierarchyMultiSelectorProps) {
  const { data: globalHierarchy, isLoading: isLoadingGlobal } = useHierarchyTree()
  const { data: plantHierarchy, isLoading: isLoadingPlant } = useHierarchyTreeByPlant(plantId ?? 0)
  const hierarchy = plantId ? plantHierarchy : globalHierarchy
  const isLoading = plantId ? isLoadingPlant : isLoadingGlobal
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set())
  const [searchInput, setSearchInput] = useState('')
  const debouncedQuery = useDebounce(searchInput, 300)
  const searchActive = debouncedQuery.length > 1

  // Fetch all characteristics when search is active
  const { data: allCharsResponse, isLoading: isLoadingAllChars } = useCharacteristics(
    searchActive ? { per_page: 5000 } : undefined,
  )

  // Build search results: matching char IDs and the hierarchy node IDs to show
  const searchResults = useMemo(() => {
    if (!searchActive || !hierarchy) {
      return null
    }

    const query = debouncedQuery.toLowerCase()
    const allChars = allCharsResponse?.items ?? []

    // Find characteristics matching the query
    const matchingChars = allChars.filter((c) =>
      c.name.toLowerCase().includes(query),
    )
    const matchingCharIds = new Set(matchingChars.map((c) => c.id))

    // Group matching characteristics by hierarchy node
    const charsByNode = new Map<number, Characteristic[]>()
    for (const char of matchingChars) {
      const existing = charsByNode.get(char.hierarchy_id) ?? []
      existing.push(char)
      charsByNode.set(char.hierarchy_id, existing)
    }

    // Also match hierarchy node names
    const matchingNodeIds = new Set<number>()
    function walkNodes(nodes: HierarchyNode[]) {
      for (const node of nodes) {
        if (node.name.toLowerCase().includes(query)) {
          matchingNodeIds.add(node.id)
        }
        if (node.children) {
          walkNodes(node.children)
        }
      }
    }
    walkNodes(hierarchy)

    // Combine: nodes that match by name OR have matching characteristics
    const nodesWithMatches = new Set([...matchingNodeIds, ...charsByNode.keys()])

    // Find all ancestors that should be visible
    const visibleNodeIds = collectAncestorIds(hierarchy, nodesWithMatches)

    // All visible nodes should be auto-expanded
    const autoExpandedIds = new Set(visibleNodeIds)

    const totalMatches = matchingChars.length + matchingNodeIds.size

    return {
      matchingCharIds,
      charsByNode,
      matchingNodeIds,
      visibleNodeIds,
      autoExpandedIds,
      totalMatches,
    }
  }, [searchActive, debouncedQuery, hierarchy, allCharsResponse])

  // Effective expanded nodes: manual or auto-expanded during search
  const effectiveExpanded = searchActive && searchResults
    ? searchResults.autoExpandedIds
    : expandedNodes

  const toggleExpanded = (nodeId: number) => {
    if (searchActive) return // Don't toggle during search
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

  const toggleSelection = useCallback(
    (charId: number) => {
      if (selectedIds.includes(charId)) {
        onSelectionChange(selectedIds.filter((id) => id !== charId))
      } else {
        onSelectionChange([...selectedIds, charId])
      }
    },
    [selectedIds, onSelectionChange],
  )

  const selectAll = useCallback(
    (charIds: number[]) => {
      const newIds = new Set([...selectedIds, ...charIds])
      onSelectionChange(Array.from(newIds))
    },
    [selectedIds, onSelectionChange],
  )

  const deselectAll = useCallback(
    (charIds: number[]) => {
      onSelectionChange(selectedIds.filter((id) => !charIds.includes(id)))
    },
    [selectedIds, onSelectionChange],
  )

  const clearSearch = () => {
    setSearchInput('')
  }

  if (isLoading) {
    return (
      <div
        className={cn(
          'text-muted-foreground flex items-center justify-center gap-2 p-4',
          className,
        )}
      >
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
    <div className={cn('flex flex-col overflow-hidden', className)}>
      {/* Search input */}
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        <Search className="text-muted-foreground h-4 w-4 flex-shrink-0" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search characteristics..."
          className="placeholder:text-muted-foreground bg-transparent text-sm outline-none flex-1 min-w-0"
        />
        {searchInput && (
          <button
            onClick={clearSearch}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search status */}
      {searchActive && (
        <div className="text-muted-foreground border-border border-b px-3 py-1.5 text-xs">
          {isLoadingAllChars ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching...
            </span>
          ) : searchResults ? (
            <span>
              {searchResults.totalMatches} result{searchResults.totalMatches !== 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-auto">
        {searchActive && searchResults && searchResults.totalMatches === 0 ? (
          <div className="text-muted-foreground p-4 text-center text-sm">
            No results found.
          </div>
        ) : (
          hierarchy.map((node) => (
            <SelectorNode
              key={node.id}
              node={node}
              level={0}
              expandedNodes={effectiveExpanded}
              toggleExpanded={toggleExpanded}
              selectedIds={selectedIds}
              toggleSelection={toggleSelection}
              selectAll={selectAll}
              deselectAll={deselectAll}
              searchResults={searchResults}
              searchQuery={searchActive ? debouncedQuery : ''}
            />
          ))
        )}
      </div>
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
  searchResults: {
    matchingCharIds: Set<number>
    charsByNode: Map<number, Characteristic[]>
    matchingNodeIds: Set<number>
    visibleNodeIds: Set<number>
    autoExpandedIds: Set<number>
    totalMatches: number
  } | null
  searchQuery: string
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
  searchResults,
  searchQuery,
}: SelectorNodeProps) {
  const isSearching = searchResults !== null
  const isExpanded = expandedNodes.has(node.id)
  const hasChildren = node.children && node.children.length > 0

  // Load characteristics when expanded (only in non-search mode)
  const shouldLoadChars = !isSearching && isExpanded
  const { data: characteristics, isLoading: isLoadingChars } = useHierarchyCharacteristics(
    shouldLoadChars ? node.id : 0,
  )

  // In search mode, use pre-filtered characteristics from search results
  const displayChars = useMemo(
    () => isSearching ? searchResults?.charsByNode.get(node.id) ?? [] : characteristics ?? [],
    [isSearching, searchResults?.charsByNode, node.id, characteristics],
  )

  const canExpand = hasChildren || (node.characteristic_count ?? 0) > 0

  // Calculate folder selection state
  const folderSelectionState = useMemo(() => {
    if (!displayChars || displayChars.length === 0) {
      return { allSelected: false, someSelected: false, charIds: [] as number[] }
    }
    const charIds = displayChars.map((c) => c.id)
    const selectedCount = charIds.filter((id) => selectedIds.includes(id)).length
    return {
      allSelected: selectedCount === charIds.length,
      someSelected: selectedCount > 0 && selectedCount < charIds.length,
      charIds,
    }
  }, [displayChars, selectedIds])

  const handleFolderCheckboxChange = (checked: boolean) => {
    if (checked) {
      selectAll(folderSelectionState.charIds)
    } else {
      deselectAll(folderSelectionState.charIds)
    }
  }

  const nodeNameMatches = isSearching && searchResults?.matchingNodeIds.has(node.id)

  // During search, hide nodes that aren't in the visible set
  if (isSearching && !searchResults?.visibleNodeIds.has(node.id)) {
    return null
  }

  return (
    <div>
      <div
        className={cn('hover:bg-muted flex cursor-pointer items-center gap-1 px-2 py-1.5')}
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
        <span className="flex-1 text-sm font-medium">
          {searchQuery && nodeNameMatches ? (
            <HighlightMatch text={node.name} query={searchQuery} />
          ) : (
            node.name
          )}
        </span>
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
              selectedIds={selectedIds}
              toggleSelection={toggleSelection}
              selectAll={selectAll}
              deselectAll={deselectAll}
              searchResults={searchResults}
              searchQuery={searchQuery}
            />
          ))}

          {/* Loading indicator (non-search mode only) */}
          {!isSearching && isLoadingChars && (
            <div
              className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-sm"
              style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </div>
          )}

          {/* Characteristics */}
          {(!isSearching ? !isLoadingChars : true) &&
            displayChars.map((char) => {
              const isSelected = selectedIds.includes(char.id)
              return (
                <div
                  key={char.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm',
                    'hover:bg-muted transition-colors',
                    isSelected && 'bg-primary/10',
                  )}
                  style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                  onClick={() => toggleSelection(char.id)}
                >
                  <div
                    className={cn(
                      'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                      isSelected ? 'bg-primary border-primary' : 'border-border',
                    )}
                  >
                    {isSelected && <Check className="text-primary-foreground h-3 w-3" />}
                  </div>
                  <div
                    className={cn(
                      'h-2 w-2 flex-shrink-0 rounded-full',
                      char.in_control !== false ? 'bg-success' : 'bg-destructive',
                    )}
                  />
                  <span className="flex-1 truncate">
                    {searchQuery ? (
                      <HighlightMatch text={char.name} query={searchQuery} />
                    ) : (
                      char.name
                    )}
                  </span>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

/**
 * Highlights matching portions of text with a background color.
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)

  if (index === -1) return <>{text}</>

  const before = text.slice(0, index)
  const match = text.slice(index, index + query.length)
  const after = text.slice(index + query.length)

  return (
    <>
      {before}
      <mark className="bg-yellow-300/40 rounded-sm">{match}</mark>
      {after}
    </>
  )
}

export default HierarchyMultiSelector
