import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Radio,
  List,
  GitBranch,
  Radar,
  Square,
  Loader2,
} from 'lucide-react'
import { brokerApi } from '@/api/client'
import type { DiscoveredTopic, TopicTreeNode, SparkplugMetricInfo } from '@/types'

interface TopicTreeBrowserProps {
  brokerId: number | null
  onSelectTopic?: (topic: string | null, metrics?: SparkplugMetricInfo[]) => void
}

/**
 * Browseable topic tree / flat list for discovered MQTT topics.
 *
 * Features:
 * - Tree view with expand/collapse
 * - Flat list with sorting
 * - Search/filter with debounce
 * - SparkplugB topic badges
 * - SparkplugB metric name/type display
 * - Message count and last-seen display
 */
export function TopicTreeBrowser({ brokerId, onSelectTopic }: TopicTreeBrowserProps) {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'tree' | 'search'>('tree')
  const [discoveryActive, setDiscoveryActive] = useState(false)

  // Debounce search input
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    const timer = setTimeout(() => setDebouncedSearch(value), 300)
    return () => clearTimeout(timer)
  }, [])

  // Discovery mutations
  const startDiscovery = useMutation({
    mutationFn: () => brokerApi.startDiscovery(brokerId!),
    onSuccess: () => {
      setDiscoveryActive(true)
      queryClient.invalidateQueries({ queryKey: ['broker-topics', brokerId] })
    },
  })

  const stopDiscovery = useMutation({
    mutationFn: () => brokerApi.stopDiscovery(brokerId!),
    onSuccess: () => {
      setDiscoveryActive(false)
    },
  })

  // Fetch topics in appropriate format (API uses 'flat'/'tree', UI uses 'search'/'tree')
  const apiFormat = viewMode === 'search' ? 'flat' : 'tree'
  const { data: topicsData, isLoading } = useQuery({
    queryKey: ['broker-topics', brokerId, viewMode, debouncedSearch],
    queryFn: () => {
      if (!brokerId) return null
      return brokerApi.getTopics(brokerId, apiFormat, debouncedSearch || undefined)
    },
    enabled: brokerId !== null && discoveryActive,
    refetchInterval: discoveryActive ? 5000 : false,
  })

  const handleSelect = (topic: string, metrics?: SparkplugMetricInfo[]) => {
    const newValue = selectedTopic === topic ? null : topic
    setSelectedTopic(newValue)
    onSelectTopic?.(newValue, newValue ? metrics : undefined)
  }

  const toggleExpand = (path: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // No broker selected
  if (brokerId === null) {
    return (
      <div className="bg-card border-border text-muted-foreground rounded-xl border p-6 text-center">
        <Radio className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>Select a broker to browse topics</p>
      </div>
    )
  }

  // Show discovery prompt if not active
  if (!discoveryActive) {
    return (
      <div className="bg-card border-border rounded-xl border p-6 text-center">
        <Radar className="text-muted-foreground/50 mx-auto mb-3 h-8 w-8" />
        <h4 className="mb-1 text-sm font-medium">Topic Discovery</h4>
        <p className="text-muted-foreground mx-auto mb-4 max-w-xs text-xs">
          Start discovery to scan for MQTT topics published on this broker. The broker subscribes to
          wildcard topics and builds a topic tree.
        </p>
        <button
          onClick={() => startDiscovery.mutate()}
          disabled={startDiscovery.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {startDiscovery.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Radar className="h-4 w-4" />
          )}
          Start Discovery
        </button>
        {startDiscovery.isError && (
          <p className="text-destructive mt-2 text-xs">
            {startDiscovery.error instanceof Error
              ? startDiscovery.error.message
              : 'Failed to start discovery'}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      {/* Toolbar */}
      <div className="border-border flex items-center gap-2 border-b p-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search topics..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="bg-background border-border focus:ring-primary w-full rounded-md border py-1.5 pr-8 pl-8 text-sm focus:ring-1 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('')
                setDebouncedSearch('')
              }}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* View mode toggle */}
        <div className="border-border flex rounded-md border">
          <button
            onClick={() => setViewMode('tree')}
            className={`p-1.5 ${viewMode === 'tree' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} rounded-l-md transition-colors`}
            title="Tree view"
          >
            <GitBranch className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('search')}
            className={`p-1.5 ${viewMode === 'search' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} rounded-r-md transition-colors`}
            title="Search view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* Stop discovery */}
        <button
          onClick={() => stopDiscovery.mutate()}
          disabled={stopDiscovery.isPending}
          className="border-border text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
          title="Stop discovering topics"
        >
          {stopDiscovery.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Square className="h-3 w-3" />
          )}
          Stop
        </button>
      </div>

      {/* Scanning indicator */}
      <div className="bg-primary/5 border-border text-primary flex items-center gap-2 border-b px-3 py-1.5 text-xs">
        <span className="bg-primary h-1.5 w-1.5 animate-pulse rounded-full" />
        Scanning for topics...
      </div>

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto p-2">
        {isLoading ? (
          <div className="text-muted-foreground py-8 text-center text-sm">Loading topics...</div>
        ) : viewMode === 'tree' ? (
          <TreeView
            data={topicsData as TopicTreeNode | null}
            expandedNodes={expandedNodes}
            selectedTopic={selectedTopic}
            onToggle={toggleExpand}
            onSelect={handleSelect}
          />
        ) : (
          <SearchView
            data={topicsData as DiscoveredTopic[] | null}
            selectedTopic={selectedTopic}
            onSelect={handleSelect}
          />
        )}
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Metric Pills
 * ----------------------------------------------------------------------- */

function MetricsPills({ metrics }: { metrics: SparkplugMetricInfo[] }) {
  if (!metrics || metrics.length === 0) return null

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {metrics.map((m) => (
        <span
          key={m.name}
          className="bg-muted border-border inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]"
        >
          <span className="font-semibold">{m.name}</span>
          <span className="text-muted-foreground italic">({m.data_type})</span>
        </span>
      ))}
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Tree View
 * ----------------------------------------------------------------------- */

function TreeView({
  data,
  expandedNodes,
  selectedTopic,
  onToggle,
  onSelect,
}: {
  data: TopicTreeNode | null
  expandedNodes: Set<string>
  selectedTopic: string | null
  onToggle: (path: string) => void
  onSelect: (topic: string, metrics?: SparkplugMetricInfo[]) => void
}) {
  if (!data || !data.children || Object.keys(data.children).length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        No topics discovered yet. Waiting for messages...
      </div>
    )
  }

  // data.children is an array from the API (TopicTreeNodeResponse)
  const children = Array.isArray(data.children) ? data.children : Object.values(data.children)

  return (
    <div className="space-y-0.5">
      {children.map((child) => (
        <TreeNodeItem
          key={child.name}
          node={child}
          path={child.name}
          depth={0}
          expandedNodes={expandedNodes}
          selectedTopic={selectedTopic}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function TreeNodeItem({
  node,
  path,
  depth,
  expandedNodes,
  selectedTopic,
  onToggle,
  onSelect,
}: {
  node: TopicTreeNode
  path: string
  depth: number
  expandedNodes: Set<string>
  selectedTopic: string | null
  onToggle: (path: string) => void
  onSelect: (topic: string, metrics?: SparkplugMetricInfo[]) => void
}) {
  const hasChildren =
    node.children &&
    (Array.isArray(node.children)
      ? node.children.length > 0
      : Object.keys(node.children).length > 0)
  const isExpanded = expandedNodes.has(path)
  const isLeaf = node.full_topic !== null
  const isSelected = isLeaf && selectedTopic === node.full_topic
  const hasMetrics = node.sparkplug_metrics && node.sparkplug_metrics.length > 0

  const children = Array.isArray(node.children) ? node.children : Object.values(node.children || {})

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors ${
          isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) onToggle(path)
          if (isLeaf && node.full_topic) onSelect(node.full_topic, node.sparkplug_metrics)
        }}
      >
        {/* Expand/collapse icon */}
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {/* Name */}
        <span className="truncate">{node.name}</span>

        {/* SparkplugB badge */}
        {node.is_sparkplug && (
          <span className="bg-primary/10 text-primary ml-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
            SpB
          </span>
        )}

        {/* Metric count badge for leaves */}
        {isLeaf && hasMetrics && (
          <span className="bg-success/10 text-success ml-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
            {node.sparkplug_metrics.length} metrics
          </span>
        )}

        {/* Message count for leaves */}
        {isLeaf && node.message_count > 0 && (
          <span className="text-muted-foreground ml-auto shrink-0 text-xs">
            {node.message_count} msgs
          </span>
        )}
      </div>

      {/* Metrics for selected leaf */}
      {isLeaf && isSelected && hasMetrics && (
        <div style={{ paddingLeft: `${depth * 16 + 28}px` }} className="pb-1">
          <MetricsPills metrics={node.sparkplug_metrics} />
        </div>
      )}

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {children.map((child: TopicTreeNode) => (
            <TreeNodeItem
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              selectedTopic={selectedTopic}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Search View (flat list)
 * ----------------------------------------------------------------------- */

function SearchView({
  data,
  selectedTopic,
  onSelect,
}: {
  data: DiscoveredTopic[] | null
  selectedTopic: string | null
  onSelect: (topic: string, metrics?: SparkplugMetricInfo[]) => void
}) {
  if (!data || data.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        {data === null
          ? 'No topics discovered yet. Waiting for messages...'
          : 'No topics match your search.'}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {data.map((topic) => {
        const isSelected = selectedTopic === topic.topic
        const hasMetrics = topic.sparkplug_metrics && topic.sparkplug_metrics.length > 0
        return (
          <div key={topic.topic}>
            <div
              onClick={() => onSelect(topic.topic, topic.sparkplug_metrics)}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
            >
              <span className="flex-1 truncate font-mono text-xs">{topic.topic}</span>

              {topic.is_sparkplug && (
                <span className="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
                  SpB
                </span>
              )}

              {hasMetrics && (
                <span className="bg-success/10 text-success shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
                  {topic.sparkplug_metrics.length} metrics
                </span>
              )}

              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {topic.message_count} msgs
              </span>

              <span className="text-muted-foreground shrink-0 text-xs">
                {formatRelativeTime(topic.last_seen)}
              </span>
            </div>

            {/* Show metrics when selected */}
            {isSelected && hasMetrics && (
              <div className="px-3 pb-1">
                <MetricsPills metrics={topic.sparkplug_metrics} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
