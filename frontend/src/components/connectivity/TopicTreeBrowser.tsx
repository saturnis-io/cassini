import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Radio,
  List,
  GitBranch,
} from 'lucide-react'
import { brokerApi } from '@/api/client'
import type { DiscoveredTopic, TopicTreeNode } from '@/types'

interface TopicTreeBrowserProps {
  brokerId: number | null
  onSelectTopic?: (topic: string | null) => void
}

/**
 * Browseable topic tree / flat list for discovered MQTT topics.
 *
 * Features:
 * - Tree view with expand/collapse
 * - Flat list with sorting
 * - Search/filter with debounce
 * - SparkplugB topic badges
 * - Message count and last-seen display
 */
export function TopicTreeBrowser({ brokerId, onSelectTopic }: TopicTreeBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree')

  // Debounce search input
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value)
      const timer = setTimeout(() => setDebouncedSearch(value), 300)
      return () => clearTimeout(timer)
    },
    []
  )

  // Fetch topics in appropriate format
  const { data: topicsData, isLoading } = useQuery({
    queryKey: ['broker-topics', brokerId, viewMode, debouncedSearch],
    queryFn: () => {
      if (!brokerId) return null
      return brokerApi.getTopics(
        brokerId,
        viewMode,
        debouncedSearch || undefined
      )
    },
    enabled: brokerId !== null,
    refetchInterval: 10000,
  })

  const handleSelect = (topic: string) => {
    const newValue = selectedTopic === topic ? null : topic
    setSelectedTopic(newValue)
    onSelectTopic?.(newValue)
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
      <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground">
        <Radio className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Select a broker to browse topics</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search topics..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('')
                setDebouncedSearch('')
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex border border-border rounded-md">
          <button
            onClick={() => setViewMode('tree')}
            className={`p-1.5 ${viewMode === 'tree' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} rounded-l-md transition-colors`}
            title="Tree view"
          >
            <GitBranch className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('flat')}
            className={`p-1.5 ${viewMode === 'flat' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'} rounded-r-md transition-colors`}
            title="Flat view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto p-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading topics...
          </div>
        ) : viewMode === 'tree' ? (
          <TreeView
            data={topicsData as TopicTreeNode | null}
            expandedNodes={expandedNodes}
            selectedTopic={selectedTopic}
            onToggle={toggleExpand}
            onSelect={handleSelect}
          />
        ) : (
          <FlatView
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
  onSelect: (topic: string) => void
}) {
  if (!data || !data.children || Object.keys(data.children).length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No topics discovered yet. Start discovery on a broker.
      </div>
    )
  }

  // data.children is an array from the API (TopicTreeNodeResponse)
  const children = Array.isArray(data.children)
    ? data.children
    : Object.values(data.children)

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
  onSelect: (topic: string) => void
}) {
  const hasChildren =
    node.children &&
    (Array.isArray(node.children) ? node.children.length > 0 : Object.keys(node.children).length > 0)
  const isExpanded = expandedNodes.has(path)
  const isLeaf = node.full_topic !== null
  const isSelected = isLeaf && selectedTopic === node.full_topic

  const children = Array.isArray(node.children)
    ? node.children
    : Object.values(node.children || {})

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-sm cursor-pointer transition-colors ${
          isSelected
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-accent'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) onToggle(path)
          if (isLeaf && node.full_topic) onSelect(node.full_topic)
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
          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shrink-0">
            SpB
          </span>
        )}

        {/* Message count for leaves */}
        {isLeaf && node.message_count > 0 && (
          <span className="ml-auto text-xs text-muted-foreground shrink-0">
            {node.message_count} msgs
          </span>
        )}
      </div>

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
 * Flat View
 * ----------------------------------------------------------------------- */

function FlatView({
  data,
  selectedTopic,
  onSelect,
}: {
  data: DiscoveredTopic[] | null
  selectedTopic: string | null
  onSelect: (topic: string) => void
}) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        {data === null
          ? 'No topics discovered yet. Start discovery on a broker.'
          : 'No topics match your search.'}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {data.map((topic) => {
        const isSelected = selectedTopic === topic.topic
        return (
          <div
            key={topic.topic}
            onClick={() => onSelect(topic.topic)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            <span className="truncate flex-1 font-mono text-xs">
              {topic.topic}
            </span>

            {topic.is_sparkplug && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shrink-0">
                SpB
              </span>
            )}

            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {topic.message_count} msgs
            </span>

            <span className="text-xs text-muted-foreground shrink-0">
              {formatRelativeTime(topic.last_seen)}
            </span>
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
