import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Search,
  Factory,
  Cog,
  Box,
  Cpu,
  Settings,
  Orbit,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHierarchyTreeByPlant, useHierarchyCharacteristics, useCharacteristics } from '@/api/hooks'
import type { HierarchyNode, Characteristic } from '@/types'
import type { ZoomLevel } from '@/lib/galaxy/CameraController'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GalaxySidebarProps {
  plantId: number
  activeConstellationId: number | null
  activeCharacteristicId: number | null
  zoomLevel: ZoomLevel
  /** Called when the user clicks a hierarchy node (flies to its constellation) */
  onNodeClick: (constellationId: number) => void
  /** Called when the user clicks a characteristic (flies to that planet) */
  onCharacteristicClick: (charId: number) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UNS-compatible hierarchy type icons (same set as HierarchyTree) */
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
 * Walk the hierarchy tree to find the top-level ancestor id for a given node.
 * Top-level means a direct child of the root (parent_id === null).
 */
function findTopLevelAncestorId(
  nodeId: number,
  tree: HierarchyNode[],
): number | null {
  // Build a flat parent map
  const parentMap = new Map<number, number | null>()
  function walk(nodes: HierarchyNode[]) {
    for (const n of nodes) {
      parentMap.set(n.id, n.parent_id)
      if (n.children) walk(n.children)
    }
  }
  walk(tree)

  if (!parentMap.has(nodeId)) return null

  let current = nodeId
  let parent = parentMap.get(current)
  while (parent !== null && parent !== undefined) {
    const grandparent = parentMap.get(parent)
    if (grandparent === null || grandparent === undefined) {
      return parent
    }
    current = parent
    parent = grandparent
  }
  return current
}

/**
 * Build the breadcrumb path from root to a given node id.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function buildBreadcrumb(
  nodeId: number,
  tree: HierarchyNode[],
): { id: number; name: string }[] {
  function find(
    nodes: HierarchyNode[],
    target: number,
    path: { id: number; name: string }[],
  ): { id: number; name: string }[] | null {
    for (const node of nodes) {
      const entry = { id: node.id, name: node.name }
      if (node.id === target) return [...path, entry]
      if (node.children && node.children.length > 0) {
        const found = find(node.children, target, [...path, entry])
        if (found) return found
      }
    }
    return null
  }
  return find(tree, nodeId, []) ?? []
}

/**
 * Check if a node or any of its descendants match the search query.
 */
function nodeMatchesSearch(
  node: HierarchyNode,
  query: string,
): boolean {
  if (node.name.toLowerCase().includes(query)) return true
  if (node.children) {
    return node.children.some((child) => nodeMatchesSearch(child, query))
  }
  return false
}

/**
 * Find all ancestor node ids from the root to a given node (for auto-expanding the path).
 */
function findAncestorIds(
  targetId: number,
  tree: HierarchyNode[],
): number[] {
  function find(
    nodes: HierarchyNode[],
    target: number,
    path: number[],
  ): number[] | null {
    for (const node of nodes) {
      if (node.id === target) return path
      if (node.children && node.children.length > 0) {
        const found = find(node.children, target, [...path, node.id])
        if (found) return found
      }
    }
    return null
  }
  return find(tree, targetId, []) ?? []
}

/**
 * Find all node ids that are ancestors of a matching node (for auto-expanding).
 */
function findAncestorsOfMatches(
  nodes: HierarchyNode[],
  query: string,
): Set<number> {
  const ancestors = new Set<number>()

  function walk(node: HierarchyNode, path: number[]): boolean {
    const selfMatch = node.name.toLowerCase().includes(query)
    let childMatch = false
    if (node.children) {
      for (const child of node.children) {
        if (walk(child, [...path, node.id])) {
          childMatch = true
        }
      }
    }
    if (selfMatch || childMatch) {
      for (const id of path) ancestors.add(id)
      if (childMatch) ancestors.add(node.id)
      return true
    }
    return false
  }

  for (const node of nodes) walk(node, [])
  return ancestors
}

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------

export function GalaxySidebar({
  plantId,
  activeConstellationId,
  activeCharacteristicId,
  zoomLevel,
  onNodeClick,
  onCharacteristicClick,
}: GalaxySidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<number>>(new Set())
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: hierarchyTree } = useHierarchyTreeByPlant(plantId)
  const { data: charsData } = useCharacteristics({ plant_id: plantId, per_page: 5000 })

  // Build a charId -> hierarchy_id lookup (shared query with GalaxyScene, no extra fetch)
  const charHierarchyMap = useMemo(() => {
    const map = new Map<number, number>()
    if (charsData?.items) {
      for (const c of charsData.items) {
        map.set(c.id, c.hierarchy_id)
      }
    }
    return map
  }, [charsData])

  // Pre-compute nodeId -> constellationId map once (avoids per-node tree walks)
  const constellationMap = useMemo(() => {
    const map = new Map<number, number>()
    if (!hierarchyTree) return map
    function walk(nodes: HierarchyNode[]) {
      for (const n of nodes) {
        const topId = findTopLevelAncestorId(n.id, hierarchyTree!)
        if (topId != null) map.set(n.id, topId)
        if (n.children) walk(n.children)
      }
    }
    walk(hierarchyTree)
    return map
  }, [hierarchyTree])

  // Debounce search input (300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchText.trim().toLowerCase())
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchText])

  // Auto-expand ancestors of search matches
  useEffect(() => {
    if (!debouncedSearch || !hierarchyTree) return
    const ancestors = findAncestorsOfMatches(hierarchyTree, debouncedSearch)
    setExpandedNodeIds((prev) => {
      const next = new Set(prev)
      for (const id of ancestors) next.add(id)
      return next
    })
  }, [debouncedSearch, hierarchyTree])

  // When activeConstellationId changes externally (camera navigation),
  // auto-expand the active constellation node so the user can see it
  useEffect(() => {
    if (activeConstellationId == null || !hierarchyTree) return
    setExpandedNodeIds((prev) => {
      if (prev.has(activeConstellationId)) return prev
      const next = new Set(prev)
      next.add(activeConstellationId)
      return next
    })
  }, [activeConstellationId, hierarchyTree])

  // When activeCharacteristicId changes externally, expand the full path to its node
  useEffect(() => {
    if (activeCharacteristicId == null || !hierarchyTree) return
    const hierarchyId = charHierarchyMap.get(activeCharacteristicId)
    if (hierarchyId == null) return
    // Expand every ancestor from root down to the characteristic's parent node
    const ancestors = findAncestorIds(hierarchyId, hierarchyTree)
    ancestors.push(hierarchyId) // also expand the node itself to reveal its chars
    setExpandedNodeIds((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const id of ancestors) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [activeCharacteristicId, hierarchyTree, charHierarchyMap])

  const toggleExpanded = useCallback((nodeId: number) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  // Build breadcrumb based on current focus
  const breadcrumb = useMemo(() => {
    if (!hierarchyTree) return []
    if (activeConstellationId != null) {
      return buildBreadcrumb(activeConstellationId, hierarchyTree)
    }
    return []
  }, [hierarchyTree, activeConstellationId])

  // Filter top-level nodes by search
  const filteredNodes = useMemo(() => {
    if (!hierarchyTree) return []
    if (!debouncedSearch) return hierarchyTree
    return hierarchyTree.filter((node) => nodeMatchesSearch(node, debouncedSearch))
  }, [hierarchyTree, debouncedSearch])

  return (
    <div
      className={cn(
        'pointer-events-auto z-10 flex h-full flex-none transition-all duration-300',
        collapsed ? 'w-10' : 'w-72',
      )}
    >
      {/* Collapsed toggle button */}
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-br-lg bg-card/90 text-muted-foreground backdrop-blur-md hover:text-foreground"
          title="Show sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : (
        <div className="flex h-full w-72 flex-col border-r border-border bg-card/90 backdrop-blur-md">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <Orbit className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Navigator
              </span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* Breadcrumb */}
          {zoomLevel !== 'galaxy' && breadcrumb.length > 0 && (
            <div className="border-b border-border px-3 py-1.5">
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <span className="text-primary/70">Galaxy</span>
                {breadcrumb.map((crumb) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    <span className="text-border">&rsaquo;</span>
                    <span
                      className={cn(
                        crumb.id === activeConstellationId
                          ? 'text-primary'
                          : 'text-muted-foreground',
                      )}
                    >
                      {crumb.name}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="border-b border-border px-3 py-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-[0.625rem] border border-border bg-input py-1.5 pr-7 pl-7 text-sm text-foreground placeholder:text-muted-foreground shadow-[inset_0_1px_2px_hsl(240_10%_80%/0.15)] outline-none focus:border-primary/50 focus:ring-1 focus:ring-ring"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto py-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border">
            {filteredNodes.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {debouncedSearch ? 'No matches' : 'No hierarchy data'}
              </div>
            ) : (
              filteredNodes.map((node) => (
                <SidebarTreeNode
                  key={node.id}
                  node={node}
                  level={0}
                  expandedNodeIds={expandedNodeIds}
                  toggleExpanded={toggleExpanded}
                  activeConstellationId={activeConstellationId}
                  activeCharacteristicId={activeCharacteristicId}
                  onNodeClick={onNodeClick}
                  onCharacteristicClick={onCharacteristicClick}
                  searchQuery={debouncedSearch}
                  constellationMap={constellationMap}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tree node component
// ---------------------------------------------------------------------------

interface SidebarTreeNodeProps {
  node: HierarchyNode
  level: number
  expandedNodeIds: Set<number>
  toggleExpanded: (id: number) => void
  activeConstellationId: number | null
  activeCharacteristicId: number | null
  onNodeClick: (constellationId: number) => void
  onCharacteristicClick: (charId: number) => void
  searchQuery: string
  constellationMap: Map<number, number>
}

function SidebarTreeNode({
  node,
  level,
  expandedNodeIds,
  toggleExpanded,
  activeConstellationId,
  activeCharacteristicId,
  onNodeClick,
  onCharacteristicClick,
  searchQuery,
  constellationMap,
}: SidebarTreeNodeProps) {
  const isExpanded = expandedNodeIds.has(node.id)
  const hasChildren = (node.children && node.children.length > 0) || (node.characteristic_count ?? 0) > 0

  // Load characteristics when this node is expanded
  const { data: characteristics } = useHierarchyCharacteristics(isExpanded ? node.id : 0)

  // Look up pre-computed constellation id
  const constellationId = constellationMap.get(node.id) ?? node.id

  // Is this node (or its constellation) the active one?
  const isActiveConstellation = constellationId === activeConstellationId

  // Check if this node's name matches the search
  const nameMatches =
    searchQuery && node.name.toLowerCase().includes(searchQuery)

  const handleClick = () => {
    onNodeClick(constellationId)
    if (hasChildren && !isExpanded) {
      toggleExpanded(node.id)
    }
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleExpanded(node.id)
  }

  // Filter children by search if active
  const visibleChildren = useMemo(() => {
    if (!node.children) return []
    if (!searchQuery) return node.children
    return node.children.filter((child) => nodeMatchesSearch(child, searchQuery))
  }, [node.children, searchQuery])

  // Filter characteristics by search
  const visibleCharacteristics = useMemo(() => {
    if (!characteristics) return []
    if (!searchQuery) return characteristics
    return characteristics.filter((c: Characteristic) =>
      c.name.toLowerCase().includes(searchQuery),
    )
  }, [characteristics, searchQuery])

  return (
    <div>
      {/* Node row */}
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5',
          'transition-colors hover:bg-accent',
          isActiveConstellation && level === 0 && 'bg-primary/10',
          nameMatches && 'bg-primary/5',
        )}
        style={{ paddingLeft: `${level * 14 + 12}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Type icon */}
        <span className={cn('text-muted-foreground', isActiveConstellation && 'text-primary/70')}>
          {nodeTypeIcons[node.type] || <Box className="h-4 w-4" />}
        </span>

        {/* Name */}
        <span
          className={cn(
            'flex-1 truncate text-sm font-medium',
            isActiveConstellation ? 'text-primary' : 'text-muted-foreground',
            nameMatches && 'text-foreground',
          )}
        >
          {node.name}
        </span>

        {/* Characteristic count badge */}
        {(node.characteristic_count ?? 0) > 0 && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {node.characteristic_count}
          </span>
        )}
      </div>

      {/* Expanded children and characteristics */}
      {isExpanded && (
        <div>
          {visibleChildren.map((child) => (
            <SidebarTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              expandedNodeIds={expandedNodeIds}
              toggleExpanded={toggleExpanded}
              activeConstellationId={activeConstellationId}
              activeCharacteristicId={activeCharacteristicId}
              onNodeClick={onNodeClick}
              onCharacteristicClick={onCharacteristicClick}
              searchQuery={searchQuery}
              constellationMap={constellationMap}
            />
          ))}

          {/* Characteristics (planets) */}
          {visibleCharacteristics.map((char: Characteristic) => {
            const isActive = activeCharacteristicId === char.id
            const charMatches =
              searchQuery && char.name.toLowerCase().includes(searchQuery)

            return (
              <div
                key={char.id}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5',
                  'transition-colors hover:bg-accent',
                  isActive && 'bg-primary/15',
                  charMatches && !isActive && 'bg-primary/5',
                )}
                style={{ paddingLeft: `${(level + 1) * 14 + 12}px` }}
                onClick={() => onCharacteristicClick(char.id)}
              >
                <span className="w-4" />
                {/* In-control status dot */}
                <div
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    char.in_control === false
                      ? 'bg-destructive shadow-[0_0_4px_color-mix(in_srgb,var(--color-destructive)_60%,transparent)]'
                      : 'bg-success shadow-[0_0_4px_color-mix(in_srgb,var(--color-success)_40%,transparent)]',
                  )}
                />
                {/* Name */}
                <span
                  className={cn(
                    'flex-1 truncate text-sm font-medium',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                    charMatches && !isActive && 'text-foreground',
                  )}
                >
                  {char.name}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
