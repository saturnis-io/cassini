import { useState, useMemo, useEffect } from 'react'
import {
  Sparkles,
  Loader2,
  MessageSquare,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  Box,
  Factory,
  Cog,
  Cpu,
  Settings,
  FolderTree,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { usePlantContext } from '@/providers/PlantProvider'
import { characteristicApi } from '@/api/client'
import { GuidedEmptyState } from '@/components/GuidedEmptyState'
import { emptyStates } from '@/lib/guidance'
import {
  useAnalyzeChart,
  useLatestInsight,
  useHierarchyTreeByPlant,
  useHierarchyCharacteristics,
} from '@/api/hooks'
import { AIInsightPanel } from './AIInsightPanel'
import type { HierarchyNode, Characteristic } from '@/types'

const PAGE_SIZE = 50

const nodeIcons: Record<string, React.ReactNode> = {
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
 * AIInsightsTab — hierarchy-aware AI insight browser.
 *
 * Three-panel layout:
 *   Left:   Hierarchy tree for navigation (handles thousands of characteristics)
 *   Center: Characteristic cards for the selected node, or global search results
 *   Right:  AI insight detail panel for the selected characteristic
 */
export function AIInsightsTab() {
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  // Navigation
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set())

  // Search
  const [search, setSearch] = useState('')

  // Detail
  const [selectedCharId, setSelectedCharId] = useState<number | null>(null)

  // Pagination (search results only)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // ── Data ──

  const { data: tree, isLoading: treeLoading } = useHierarchyTreeByPlant(plantId)

  const { data: nodeChars, isLoading: nodeCharsLoading } = useHierarchyCharacteristics(
    selectedNodeId ?? 0,
  )

  // All characteristics for search (cached by TanStack Query)
  const { data: allCharData } = useQuery({
    queryKey: ['characteristics-for-ai', plantId],
    queryFn: () => characteristicApi.list({ per_page: 5000, plant_id: plantId }),
    enabled: plantId > 0,
  })
  const allChars = allCharData?.items ?? []

  // ── Derived ──

  const isSearchMode = search.trim().length > 0

  // Hierarchy path map for search result disambiguation
  const charPathMap = useMemo(() => {
    const map = new Map<number, string>()
    if (!tree) return map
    function walk(nodes: HierarchyNode[], path: string[]) {
      for (const node of nodes) {
        const currentPath = [...path, node.name]
        for (const c of allChars) {
          if (c.hierarchy_id === node.id) {
            map.set(c.id, currentPath.join(' \u203A '))
          }
        }
        if (node.children) walk(node.children, currentPath)
      }
    }
    walk(tree, [])
    return map
  }, [tree, allChars])

  // Search: filter by name or hierarchy path
  const searchResults = useMemo(() => {
    if (!isSearchMode) return []
    const q = search.toLowerCase().trim()
    return allChars.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (charPathMap.get(c.id) ?? '').toLowerCase().includes(q),
    )
  }, [isSearchMode, search, allChars, charPathMap])

  // Breadcrumb trail for selected node
  const nodePath = useMemo(() => {
    if (!tree || !selectedNodeId) return []
    const path: { id: number; name: string }[] = []
    function find(nodes: HierarchyNode[]): boolean {
      for (const node of nodes) {
        path.push({ id: node.id, name: node.name })
        if (node.id === selectedNodeId) return true
        if (node.children && find(node.children)) return true
        path.pop()
      }
      return false
    }
    find(tree)
    return path
  }, [tree, selectedNodeId])

  const hasMore = isSearchMode && visibleCount < searchResults.length

  // Reset pagination when search changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search])

  // ── Handlers ──

  const toggleNode = (id: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectNode = (id: number) => {
    setSelectedNodeId(id)
    setSearch('')
    if (!expandedNodes.has(id)) {
      setExpandedNodes((prev) => new Set([...prev, id]))
    }
  }

  // ── Early returns ──

  if (!selectedPlant) {
    return (
      <EmptyState
        icon={<Sparkles className="h-12 w-12" />}
        title="Select a Plant"
        description="Choose a plant to explore AI insights for its characteristics."
        className="py-20"
      />
    )
  }

  return (
    <div className="border-border flex h-[calc(100vh-14rem)] overflow-hidden rounded-lg border">
      {/* ── Tree Sidebar ── */}
      <div className="bg-muted/30 border-border flex w-60 shrink-0 flex-col border-r">
        <div className="border-border flex items-center gap-2 border-b px-3 py-2.5">
          <FolderTree className="text-muted-foreground h-3.5 w-3.5" />
          <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
            Hierarchy
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-1">
          {treeLoading ? (
            <LoadingIndicator text="Loading..." className="py-8" />
          ) : !tree || tree.length === 0 ? (
            <p className="text-muted-foreground px-3 py-8 text-center text-xs">
              No hierarchy configured
            </p>
          ) : (
            tree.map((node) => (
              <NavTreeNode
                key={node.id}
                node={node}
                level={0}
                selectedNodeId={selectedNodeId}
                expandedNodes={expandedNodes}
                onToggle={toggleNode}
                onSelect={selectNode}
              />
            ))
          )}
        </div>

        <div className="border-border border-t px-3 py-2">
          <span className="text-muted-foreground text-[10px] font-medium tabular-nums">
            {allChars.length.toLocaleString()} total characteristics
          </span>
        </div>
      </div>

      {/* ── Main Panel ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Search */}
        <div className="border-border border-b px-4 py-2.5">
          <div className="flex items-center gap-2 px-0 py-0.5">
            <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or hierarchy path..."
              className="w-full border-0 bg-transparent text-sm shadow-none outline-none placeholder:text-muted-foreground focus:ring-0 focus:outline-none"
              style={{ boxShadow: 'none' }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Context bar */}
        <div className="border-border bg-muted/20 flex items-center justify-between border-b px-4 py-1.5">
          {isSearchMode ? (
            <span className="text-muted-foreground text-xs">
              <span className="text-foreground font-medium">
                {searchResults.length.toLocaleString()}
              </span>{' '}
              result{searchResults.length !== 1 && 's'} for{' '}
              <span className="text-foreground font-medium">&ldquo;{search}&rdquo;</span>
            </span>
          ) : nodePath.length > 0 ? (
            <nav className="flex items-center gap-0.5 text-xs">
              {nodePath.map((seg, i) => (
                <span key={seg.id} className="flex items-center gap-0.5">
                  {i > 0 && <ChevronRight className="text-muted-foreground/50 h-3 w-3" />}
                  <button
                    onClick={() => selectNode(seg.id)}
                    className={cn(
                      'hover:bg-muted rounded px-1 py-0.5 transition-colors',
                      i === nodePath.length - 1
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground',
                    )}
                  >
                    {seg.name}
                  </button>
                </span>
              ))}
            </nav>
          ) : (
            <span className="text-muted-foreground text-xs">
              Select a node or search to view characteristics
            </span>
          )}
          {!isSearchMode && nodeChars && nodeChars.length > 0 && (
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {nodeChars.length} characteristic{nodeChars.length !== 1 && 's'}
            </span>
          )}
        </div>

        {/* Characteristic list */}
        <div className="flex-1 overflow-y-auto">
          {isSearchMode ? (
            searchResults.length === 0 ? (
              <EmptyState
                icon={<Search className="h-10 w-10" />}
                title="No matches"
                description={`Nothing matched \u201C${search}\u201D. Try a different term.`}
                className="py-16"
              />
            ) : (
              <div className="divide-border/50 divide-y">
                {searchResults.slice(0, visibleCount).map((char) => (
                  <InsightRow
                    key={char.id}
                    charId={char.id}
                    charName={char.name}
                    inControl={char.in_control}
                    hierarchyPath={charPathMap.get(char.id)}
                    isSelected={selectedCharId === char.id}
                    onSelect={() => setSelectedCharId(char.id)}
                  />
                ))}
                {hasMore && (
                  <div className="px-4 py-3 text-center">
                    <button
                      onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                      className="border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-md border px-4 py-1.5 text-xs font-medium transition-colors"
                    >
                      Show more ({(searchResults.length - visibleCount).toLocaleString()} remaining)
                    </button>
                  </div>
                )}
              </div>
            )
          ) : !selectedNodeId ? (
            <GuidedEmptyState content={emptyStates['ai-insights']} className="py-16" />
          ) : nodeCharsLoading ? (
            <LoadingIndicator text="Loading characteristics..." className="py-16" />
          ) : !nodeChars || nodeChars.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-10 w-10" />}
              title="No Characteristics Here"
              description="This node has no direct characteristics. Expand it in the tree to navigate deeper."
              className="py-16"
            />
          ) : (
            <div className="divide-border/50 divide-y">
              {(nodeChars as Characteristic[]).map((char) => (
                <InsightRow
                  key={char.id}
                  charId={char.id}
                  charName={char.name}
                  inControl={char.in_control}
                  isSelected={selectedCharId === char.id}
                  onSelect={() => setSelectedCharId(char.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail Panel ── */}
      {selectedCharId && (
        <div className="border-border w-[380px] shrink-0 border-l">
          <AIInsightPanel charId={selectedCharId} onClose={() => setSelectedCharId(null)} />
        </div>
      )}
    </div>
  )
}

// ── Subcomponents ──

function EmptyState({
  icon,
  title,
  description,
  className,
}: {
  icon: React.ReactNode
  title: string
  description: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', className)}>
      <div className="text-muted-foreground/30">{icon}</div>
      <h3 className="text-foreground mt-3 text-sm font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-xs text-xs">{description}</p>
    </div>
  )
}

function LoadingIndicator({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        'text-muted-foreground flex items-center justify-center gap-2 text-sm',
        className,
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{text}</span>
    </div>
  )
}

// ── Tree Node ──

function NavTreeNode({
  node,
  level,
  selectedNodeId,
  expandedNodes,
  onToggle,
  onSelect,
}: {
  node: HierarchyNode
  level: number
  selectedNodeId: number | null
  expandedNodes: Set<number>
  onToggle: (id: number) => void
  onSelect: (id: number) => void
}) {
  const isExpanded = expandedNodes.has(node.id)
  const isSelected = selectedNodeId === node.id
  const hasChildren = node.children && node.children.length > 0
  const charCount = node.characteristic_count ?? 0
  const canExpand = hasChildren || charCount > 0

  return (
    <div>
      <div
        className={cn(
          'flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors',
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted',
        )}
        style={{ paddingLeft: `${level * 12 + 6}px` }}
        onClick={() => {
          onSelect(node.id)
          if (canExpand && !isExpanded) onToggle(node.id)
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (canExpand) onToggle(node.id)
          }}
          className="shrink-0 p-0.5"
        >
          {canExpand ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : (
            <span className="w-3" />
          )}
        </button>
        <span className="text-muted-foreground shrink-0">
          {nodeIcons[node.type] || <Box className="h-3.5 w-3.5" />}
        </span>
        <span className="truncate">{node.name}</span>
        {charCount > 0 && (
          <span className="bg-muted text-muted-foreground ml-auto shrink-0 rounded px-1 py-0.5 text-[9px] tabular-nums">
            {charCount}
          </span>
        )}
      </div>

      {isExpanded &&
        node.children?.map((child) => (
          <NavTreeNode
            key={child.id}
            node={child}
            level={level + 1}
            selectedNodeId={selectedNodeId}
            expandedNodes={expandedNodes}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </div>
  )
}

// ── Insight Row ──

function InsightRow({
  charId,
  charName,
  inControl,
  hierarchyPath,
  isSelected,
  onSelect,
}: {
  charId: number
  charName: string
  inControl?: boolean
  hierarchyPath?: string
  isSelected: boolean
  onSelect: () => void
}) {
  const { data: insight } = useLatestInsight(charId)
  const analyzeMutation = useAnalyzeChart()

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors',
        isSelected ? 'bg-primary/5 ring-primary/20 ring-1 ring-inset' : 'hover:bg-muted/50',
      )}
    >
      <div
        className={cn(
          'mt-0.5 h-2 w-2 shrink-0 rounded-full',
          inControl !== false ? 'bg-green-500' : 'bg-red-500',
        )}
      />

      <div className="min-w-0 flex-1">
        <h4 className="text-foreground truncate text-sm font-medium">{charName}</h4>
        {hierarchyPath && (
          <p className="text-muted-foreground truncate text-[10px]">{hierarchyPath}</p>
        )}
        {insight?.summary ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">{insight.summary}</p>
        ) : (
          <p className="text-muted-foreground/60 mt-0.5 text-xs italic">No insight yet</p>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          analyzeMutation.mutate(charId)
        }}
        disabled={analyzeMutation.isPending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed"
      >
        {analyzeMutation.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        Analyze
      </button>
    </div>
  )
}
