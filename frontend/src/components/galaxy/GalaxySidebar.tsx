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
import { useHierarchyTree, useHierarchyCharacteristics, useCharacteristics } from '@/api/hooks'
import type { HierarchyNode, Characteristic } from '@/types'
import type { ZoomLevel } from '@/lib/galaxy/CameraController'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GalaxySidebarProps {
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
  Folder: <Box className="h-3.5 w-3.5" />,
  Enterprise: <Factory className="h-3.5 w-3.5" />,
  Site: <Factory className="h-3.5 w-3.5" />,
  Area: <Box className="h-3.5 w-3.5" />,
  Line: <Cog className="h-3.5 w-3.5" />,
  Cell: <Cpu className="h-3.5 w-3.5" />,
  Equipment: <Settings className="h-3.5 w-3.5" />,
  Tag: <Settings className="h-3.5 w-3.5" />,
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
function buildBreadcrumb(
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

  const { data: hierarchyTree } = useHierarchyTree()
  const { data: charsData } = useCharacteristics({ per_page: 5000 })

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
        'pointer-events-auto absolute top-0 left-0 z-10 flex h-full transition-all duration-300',
        collapsed ? 'w-10' : 'w-72',
      )}
    >
      {/* Collapsed toggle button */}
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-br-lg bg-black/60 text-gray-400 backdrop-blur-md hover:text-white"
          title="Show sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : (
        <div className="flex h-full w-72 flex-col border-r border-white/10 bg-black/70 backdrop-blur-md">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <Orbit className="h-4 w-4 text-amber-400" />
              <span className="font-mono text-xs font-semibold tracking-wider text-gray-200 uppercase">
                Navigator
              </span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="cursor-pointer rounded p-1 text-gray-500 hover:bg-white/10 hover:text-gray-300"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* Breadcrumb */}
          {zoomLevel !== 'galaxy' && breadcrumb.length > 0 && (
            <div className="border-b border-white/10 px-3 py-1.5">
              <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] text-gray-500">
                <span className="text-amber-400/70">Galaxy</span>
                {breadcrumb.map((crumb) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    <span className="text-gray-600">&rsaquo;</span>
                    <span
                      className={cn(
                        crumb.id === activeConstellationId
                          ? 'text-amber-300'
                          : 'text-gray-400',
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
          <div className="border-b border-white/10 px-3 py-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search..."
                className="w-full rounded border border-white/10 bg-white/5 py-1 pr-7 pl-7 font-mono text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-amber-400/40"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-gray-500 hover:text-gray-300"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto py-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {filteredNodes.length === 0 ? (
              <div className="px-3 py-4 text-center font-mono text-xs text-gray-600">
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
          'group flex cursor-pointer items-center gap-1.5 px-2 py-1',
          'transition-colors hover:bg-white/5',
          isActiveConstellation && level === 0 && 'bg-amber-400/10',
          nameMatches && 'bg-amber-400/5',
        )}
        style={{ paddingLeft: `${level * 14 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="cursor-pointer rounded p-0.5 text-gray-500 hover:bg-white/10 hover:text-gray-300"
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
        <span className={cn('text-gray-500', isActiveConstellation && 'text-amber-400/70')}>
          {nodeTypeIcons[node.type] || <Box className="h-3.5 w-3.5" />}
        </span>

        {/* Name */}
        <span
          className={cn(
            'flex-1 truncate font-mono text-xs',
            isActiveConstellation ? 'text-amber-200' : 'text-gray-400',
            nameMatches && 'text-white',
          )}
        >
          {node.name}
        </span>

        {/* Characteristic count badge */}
        {(node.characteristic_count ?? 0) > 0 && (
          <span className="rounded bg-white/5 px-1 font-mono text-[10px] text-gray-600">
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
                  'group flex cursor-pointer items-center gap-2 px-2 py-1',
                  'transition-colors hover:bg-white/5',
                  isActive && 'bg-amber-400/15',
                  charMatches && !isActive && 'bg-amber-400/5',
                )}
                style={{ paddingLeft: `${(level + 1) * 14 + 8}px` }}
                onClick={() => onCharacteristicClick(char.id)}
              >
                <span className="w-4" />
                {/* In-control status dot */}
                <div
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    char.in_control === false
                      ? 'bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.6)]'
                      : 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.4)]',
                  )}
                />
                {/* Name */}
                <span
                  className={cn(
                    'flex-1 truncate font-mono text-xs',
                    isActive ? 'text-amber-100' : 'text-gray-500',
                    charMatches && !isActive && 'text-gray-300',
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
